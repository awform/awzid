<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import Brand from '$lib/ui/Brand.svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { setActiveProfile } from '$lib/attempts';
  import { t } from '$lib/i18n';
  import { call, fetchMe, type Me } from '$lib/session';

  let email = $state('');
  let password = $state('');
  let totp = $state('');
  let needTotp = $state(false);
  let error = $state('');
  let busy = $state(false);
  // démonstration (réseau local) : identifiants courts (« parent », « enfant »…) au lieu d'une adresse
  let demo = $state(false);
  onMount(async () => {
    const c = await call<{ demo?: boolean }>('GET', '/config');
    demo = !!(c.ok && c.data?.demo);
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    const r = await call<Me & { profilDemo?: string | null }>('POST', '/auth/login', {
      email,
      password,
      ...(needTotp ? { totp } : {}),
    });
    busy = false;
    if (!r.ok) {
      if (r.code === 'totp_requis') needTotp = true;
      error = t(`erreur.${r.code ?? 'reseau'}`);
      return;
    }
    const me = await fetchMe();
    if (me?.mfaRequired && !me.mfaVerified) return goto(resolve('/compte'));
    // démonstration : « enfant » et « ado » ouvrent directement leur profil (sans « Qui apprend ? »)
    const demoProfile = me?.profiles.find((p) => p.id === r.data?.profilDemo);
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
</script>

<svelte:head><title>{t('app.nom')} — {t('connexion.titre')}</title></svelte:head>

<div class="accueil-marque" data-testid="connexion-marque"><Brand slogan surPage size={56} /></div>
<h1>{t('connexion.titre')}</h1>
<form class="card form" onsubmit={submit}>
  <label for="email">{t('champ.email')}</label>
  <input
    id="email"
    type={demo ? 'text' : 'email'}
    autocomplete="username"
    autocapitalize="none"
    required
    bind:value={email}
  />
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
  {#if error}<p class="error" role="alert"><Bidi text={error} /></p>{/if}
  <button type="submit" class="primary go" disabled={busy}>{t('connexion.bouton')}</button>
</form>
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
  .error {
    color: var(--bad-ink);
    font-weight: 700;
  }
</style>
