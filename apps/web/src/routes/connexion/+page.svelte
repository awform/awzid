<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
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
  <button type="submit" class="primary" disabled={busy}>{t('connexion.bouton')}</button>
</form>
<p>{t('connexion.pas_de_compte')} <a href={resolve('/inscription')}>{t('inscription.titre')}</a></p>
<p><a href={resolve('/garanties')} data-testid="lien-garanties">{t('gar.titre')}</a></p>
<p class="muted small"><Bidi text={t('connexion.oubli')} /></p>

<style>
  .form {
    display: grid;
    gap: 8px;
    max-width: 460px;
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
  .small {
    font-size: 0.9rem;
  }
</style>
