<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { t } from '$lib/i18n';
  import { call, fetchMe, type Me } from '$lib/session';

  /**
   * Lot F3 — accès au compte, UNE seule page (poids ; jamais préchargée sur l'appareil d'un élève, elle n'a de
   * sens qu'en ligne) :
   *  - revue M7 : « mot de passe oublié » (demande du lien), nouveau mot de passe (#reinit=…), vérification de
   *    l'adresse (#verif=…) ou de la nouvelle adresse (#email=…). Le jeton est dans le FRAGMENT du lien (jamais
   *    envoyé au serveur web) ; il est retiré aussitôt de la barre d'adresse et transmis à l'API par POST ;
   *  - revue E10 (`/acces/accords`) : accord « article 9 » demandé au PREMIER USAGE (comptes d'avant F3) ou après un
   *    retrait, pour le titulaire et chaque profil d'enfant, mot de passe ressaisi (preuve jointe). Sans accord,
   *    le compte reste en pause (rien n'est effacé).
   */
  type Mode = 'oubli' | 'reinit' | 'verif' | 'email' | 'accords';
  let mode = $state<Mode>(page.params.mode === 'accords' ? 'accords' : 'oubli');
  let token = '';
  let email = $state('');
  let password = $state('');
  let done = $state(false);
  let msg = $state('');
  let bad = $state(false);
  let busy = $state(false);
  let mailOn = $state(true);
  let me = $state<Me | null>(null);
  const missing = $derived(me?.accordsManquants ?? []);
  const titre = $derived(
    t(
      mode === 'accords'
        ? 'accords.titre'
        : mode === 'reinit'
          ? 'acces.reinit_titre'
          : mode === 'oubli'
            ? 'acces.oubli_titre'
            : 'acces.verif_titre',
    ),
  );

  const champ = $derived(t(mode === 'accords' ? 'accords.mdp' : 'champ.mot_de_passe'));
  const bouton = $derived(
    t(
      mode === 'oubli'
        ? 'acces.oubli_bouton'
        : mode === 'reinit'
          ? 'acces.reinit_bouton'
          : 'accords.bouton',
    ),
  );
  const fail = (code: string | null) => {
    bad = true;
    msg = t(`erreur.${code ?? 'reseau'}`);
  };

  onMount(() => {
    void init();
    // lien collé dans le même onglet (seul le fragment change) : pris en compte aussi
    const onHash = () => void init();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  });

  async function init() {
    const m = /^#(reinit|verif|email)=([A-Za-z0-9_-]{20,100})$/.exec(location.hash);
    if (m) {
      mode = m[1] as Mode;
      token = m[2]!;
      done = bad = false;
      msg = '';
      // le jeton quitte la barre d'adresse (historique, capture d'écran) ; même page, même état du routeur
      history.replaceState(history.state, '', location.pathname);
    }
    if (mode === 'verif' || mode === 'email') {
      busy = true;
      msg = t('acces.verif_encours');
      const r = await call('POST', '/auth/email/verify', { token });
      busy = false;
      done = r.ok;
      if (r.ok) msg = t(mode === 'email' ? 'acces.email_ok' : 'acces.verif_ok');
      else fail(r.code);
    } else if (mode === 'oubli') {
      const c = await call<{ email?: boolean }>('GET', '/config');
      mailOn = !(c.ok && c.data?.email === false);
    } else if (mode === 'accords') {
      me = await fetchMe();
      if (!me) await goto(resolve('/connexion'));
      else if (!me.accordsManquants?.length) await goto(resolve('/'));
    }
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    bad = false;
    const r =
      mode === 'oubli'
        ? await call('POST', '/auth/password-reset', { email })
        : mode === 'reinit'
          ? await call('POST', '/auth/password-reset/confirm', { token, password })
          : await call('POST', '/account/accords', {
              password,
              accords: missing.map((a) => ({ type: a.type, profileId: a.profileId })),
            });
    busy = false;
    if (!r.ok) return fail(r.code);
    if (mode === 'accords') {
      me = await fetchMe();
      return goto(resolve(me && me.profiles.length > 1 ? '/profils' : '/'));
    }
    done = true;
    msg = t(mode === 'oubli' ? 'acces.oubli_envoye' : 'acces.reinit_ok');
  }
</script>

<svelte:head><title>{t('app.nom')} — {titre}</title></svelte:head>

<h1><Bidi text={titre} /></h1>
<section class="card" data-testid="acces" data-mode={mode}>
  {#if mode === 'accords'}
    <p><Bidi text={t('accords.intro')} /></p>
    <ul data-testid="accords-manquants">
      {#each missing as a (a.profileId ?? 'compte')}
        <li>
          <Bidi
            text={a.profileId
              ? t('accords.profil', { nom: a.pseudonym ?? '' })
              : t('accords.compte')}
          />
        </li>
      {/each}
    </ul>
    <p class="muted small"><Bidi text={t('consent.donnee_religieuse_art9')} /></p>
  {:else if mode === 'oubli' && !done}
    {#if !mailOn}<p class="warnbox" role="note">
        <Bidi text={t('acces.email_indisponible')} />
      </p>{/if}
    <p><Bidi text={t('acces.oubli_aide')} /></p>
  {/if}
  {#if (mode === 'oubli' || mode === 'reinit' || mode === 'accords') && !done}
    <form class="form" onsubmit={submit}>
      {#if mode === 'oubli'}
        <label for="email">{t('champ.email')}</label>
        <input
          id="email"
          type="email"
          autocomplete="email"
          autocapitalize="none"
          required
          bind:value={email}
        />
      {:else}
        <label for="password"><Bidi text={champ} /></label>
        <input
          id="password"
          type="password"
          autocomplete={mode === 'accords' ? 'current-password' : 'new-password'}
          minlength={mode === 'accords' ? undefined : 12}
          required
          bind:value={password}
        />
        {#if mode === 'reinit'}<p class="muted small">{t('inscription.mdp_aide')}</p>{/if}
      {/if}
      {#if bad}<p class="error" role="alert" data-testid="acces-erreur"><Bidi text={msg} /></p>{/if}
      <button type="submit" class="primary" disabled={busy} data-testid="acces-valider"
        ><Bidi text={bouton} /></button
      >
    </form>
  {:else if msg}
    <p class:error={bad} role={bad ? 'alert' : 'status'} data-testid="acces-message">
      <Bidi text={msg} />
    </p>
  {/if}
  {#if mode === 'accords'}
    <p class="muted small"><Bidi text={t('accords.pause')} /></p>
    <p>
      <a href={resolve('/legal/[page]', { page: 'confidentialite' })}>{t('accords.lire')}</a>
      · <a href={resolve('/compte')}>{t('accords.vers_compte')}</a>
    </p>
  {:else if bad && mode !== 'oubli'}
    <p>
      <a href={resolve('/acces/[[mode]]', {})} data-sveltekit-reload>{t('acces.redemander')}</a>
    </p>
  {/if}
  {#if done && mode !== 'oubli'}
    <p><a class="button primary" href={resolve('/connexion')}>{t('acces.vers_connexion')}</a></p>
  {/if}
</section>

<style>
  .form {
    display: grid;
    gap: 8px;
    max-width: 460px;
  }
  .small {
    font-size: 0.9rem;
  }
</style>
