<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import Brand from '$lib/ui/Brand.svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { setActiveProfile } from '$lib/attempts';
  import { chargerStatut, type AccesStatut } from '$lib/acces';
  import { locale, t } from '$lib/i18n';
  import { mesure } from '$lib/mesure';
  import { call, fetchMe, type Me } from '$lib/session';

  /*
   * 18/10/2026 : trois façons d'entrer, dans cet ordre (chacune derrière son interrupteur) — « Continuer avec
   * Google », « Avec mon numéro WhatsApp » (le même formulaire, champ « numéro » ; revérification du numéro après une
   * longue absence), « Avec mon adresse e-mail ». Le personnel (enseignant, administrateur) entre toujours par
   * e-mail + mot de passe + second facteur.
   */
  let email = $state('');
  let password = $state('');
  let totp = $state('');
  let needTotp = $state(false);
  let error = $state('');
  let busy = $state(false);
  // démonstration (réseau local) : identifiants courts (« parent », « enfant »…) au lieu d'une adresse
  let demo = $state(false);
  let acces = $state<AccesStatut | null>(null);
  let parTelephone = $state(false);
  /** revérification du numéro demandée par le serveur (longue absence) */
  let reverif = $state(false);
  let defi = $state<{ id: string; jeton: string } | null>(null);
  onMount(async () => {
    mesure('connexion_ouverte');
    const c = await call<{ demo?: boolean }>('GET', '/config');
    demo = !!(c.ok && c.data?.demo);
    acces = await chargerStatut();
    const g = new URLSearchParams(location.search).get('google');
    if (g) {
      history.replaceState(null, '', location.pathname);
      if (g === 'ok') await apres(null);
      else error = t(`id.google_${g}`);
    }
  });

  async function apres(profilDemo: string | null | undefined) {
    const me = await fetchMe();
    if (me?.mfaRequired && !me.mfaVerified) return goto(resolve('/compte'));
    // démonstration : « enfant » et « ado » ouvrent directement leur profil (sans « Qui apprend ? »)
    const demoProfile = me?.profiles.find((p) => p.id === profilDemo);
    if (demoProfile) {
      await setActiveProfile(demoProfile);
      return goto(resolve('/'));
    }
    if (me && me.profiles.length === 1) {
      await setActiveProfile(me.profiles[0] ?? null);
      return goto(resolve('/'));
    }
    return goto(resolve('/profils'));
  }

  async function submit(e?: SubmitEvent) {
    e?.preventDefault();
    busy = true;
    error = '';
    mesure('connexion_identifiants');
    const r = await call<Me & { profilDemo?: string | null }>('POST', '/auth/login', {
      email,
      password,
      ...(needTotp ? { totp } : {}),
      ...(defi ? { defi } : {}),
    });
    busy = false;
    if (r.ok) mesure('connexion_reussie');
    if (!r.ok) {
      if (r.code === 'identifiants_incorrects') mesure('connexion_echec_mdp');
      if (r.code === 'verrouille') mesure('connexion_blocage');
      if (r.code === 'totp_requis') needTotp = true;
      if (r.code === 'reverification_requise') {
        reverif = true;
        error = '';
        return;
      }
      defi = null;
      // V2-1 : essais restants (à partir du 3e échec) ; pause avec son heure de fin et ce qu'il faut faire
      const restants = r.error?.essais_restants;
      const jusqua = r.error?.jusqua;
      // les messages du serveur ne sont jamais cités littéralement (catalogue chargé à la réponse en erreur)
      const msg = (code: string, vals?: Record<string, unknown>) => t(`erreur.${code}`, vals);
      error =
        r.code === 'verification_invalide'
          ? t('id.erreur.verification_invalide')
          : r.code === 'verrouille' && typeof jusqua === 'string'
            ? msg('verrouille_heure', {
                heure: new Date(jusqua).toLocaleTimeString(locale(), {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })
            : msg(r.code ?? 'reseau') +
              (typeof restants === 'number' && restants < 6
                ? ' ' + msg('essais_restants', { n: restants })
                : '');
      return;
    }
    await apres(r.data?.profilDemo);
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('connexion.titre')}</title></svelte:head>

<div class="accueil-marque" data-testid="connexion-marque"><Brand slogan surPage size={56} /></div>
<h1>{t('connexion.titre')}</h1>
{#if reverif}
  <!-- longue absence : le numéro est revérifié (un numéro inutilisé peut avoir changé de main) -->
  <section class="card form" data-testid="reverification">
    <p><Bidi text={t('id.reverif_intro')} /></p>
    {#await import('$lib/identites/VerifTelephone.svelte') then { default: VerifTelephone }}
      <VerifTelephone
        objet="reverification"
        numeroInitial={email}
        envoi={acces?.telephoneEnvoi === true}
        onverifie={(v) => {
          defi = { id: v.id, jeton: v.jeton };
          reverif = false;
          void submit();
        }}
      />
    {/await}
  </section>
{:else}
  <div class="form entrees">
    {#if acces?.google || acces?.telephone}
      {#await import('$lib/identites/ChoixEntree.svelte') then { default: ChoixEntree }}
        <ChoixEntree
          google={acces?.google === true}
          telephone={acces?.telephone === true && !parTelephone}
          intent="connexion"
          onTelephone={() => {
            parTelephone = true;
            setTimeout(() => document.getElementById('email')?.focus(), 0);
          }}
          titreEmail={parTelephone ? t('id.numero_titre') : undefined}
        />
      {/await}
    {/if}
  </div>
  <form class="card form" onsubmit={submit}>
    <label for="email"
      ><Bidi
        text={parTelephone
          ? t('id.numero_wa')
          : acces?.telephone
            ? t('id.email_ou_numero')
            : t('champ.email')}
      /></label
    >
    <input
      id="email"
      type={demo || parTelephone || acces?.telephone ? 'text' : 'email'}
      inputmode={parTelephone ? 'tel' : undefined}
      autocomplete="username"
      autocapitalize="none"
      required
      bind:value={email}
      aria-describedby={parTelephone ? 'email-aide' : undefined}
    />
    {#if parTelephone}<p class="aide" id="email-aide"><Bidi text={t('id.numero_aide')} /></p>{/if}
    <label for="password">{t('champ.mot_de_passe')}</label>
    <input
      id="password"
      type="password"
      autocomplete="current-password"
      required
      bind:value={password}
    />
    {#if needTotp}
      <label for="totp">{t('champ.code_totp')}</label>
      <input
        id="totp"
        inputmode="numeric"
        autocomplete="one-time-code"
        pattern={'[0-9]{6}'}
        maxlength="6"
        bind:value={totp}
      />
    {/if}
    {#if error}<p class="error" role="alert" data-testid="connexion-erreur">
        <Bidi text={error} />
      </p>{/if}
    <button type="submit" class="primary go" disabled={busy}>{t('connexion.bouton')}</button>
  </form>
{/if}
<p class="oubli">
  <a href={resolve('/acces/[[mode]]', {})} data-testid="lien-oubli">{t('connexion.oubli')}</a>
</p>
<div class="autre">
  <p>{t('connexion.pas_de_compte')}</p>
  <a class="button" href={resolve('/inscription')}>{t('inscription.titre')}</a>
</div>
<p class="gar"><a href={resolve('/garanties')} data-testid="lien-garanties">{t('gar.titre')}</a></p>

<style>
  /* D2 : bloc marque sobre (symbole, nom, slogan), filet doré ; formulaire centré, une action principale */
  .accueil-marque {
    display: grid;
    justify-items: center;
    gap: 14px;
    margin: 16px 0 8px;
  }
  .accueil-marque::after {
    content: '';
    width: 72px;
    height: 2px;
    border-radius: 2px;
    background: var(--gold);
  }
  h1 {
    text-align: center;
    font-size: 1.4rem;
  }
  .form,
  .oubli,
  .autre,
  .gar {
    max-width: 460px;
    margin-inline: auto;
  }
  .form {
    display: grid;
    gap: 8px;
    border-radius: 16px;
  }
  .entrees {
    margin-bottom: 12px;
  }
  .go {
    min-height: 56px;
    margin-top: 8px;
    font-size: 1.05rem;
  }
  .oubli,
  .gar {
    text-align: center;
  }
  .autre {
    display: grid;
    gap: 6px;
    justify-items: center;
    padding: 16px 0;
    border-top: 1px solid var(--line);
  }
  .autre p {
    margin: 0;
    color: var(--ink2);
  }
  .form input {
    font: inherit;
    min-height: 48px;
    padding: 6px 10px;
    border: 2px solid var(--line);
    border-radius: 10px;
  }
  .aide {
    margin: 0;
    font-size: 0.9rem;
    color: var(--ink2);
  }
  .error {
    color: var(--bad-ink);
    font-weight: 700;
  }
</style>
