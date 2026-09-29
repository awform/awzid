<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import {
    activeProfile,
    onQueue,
    pendingCount,
    setActiveProfile,
    startSync,
    type DevProfile,
  } from '$lib/attempts';
  import { t } from '$lib/i18n';
  import { getSettings, type Settings } from '$lib/offline';
  import { cachedMe, fetchMe, type Me } from '$lib/session';

  let { children } = $props();

  /** Navigation par MATIÈRE (demande du client, 28/09) : barre d'onglets sur tous les écrans élève. */
  const TABS = [
    { id: 'coran', href: '/coran', icon: 'M12 3c-4 3-7 5-7 9a7 7 0 0 0 14 0c0-4-3-6-7-9Zm0 4v10' },
    { id: 'arabe', href: '/', icon: 'M4 17c3 0 5-2 6-5 1 3 3 5 6 5M14 7h6M17 4v6' },
    { id: 'sciences', href: '/sciences', icon: 'M4 6h7v13H4zM13 6h7v13h-7zM11 8h2' },
    { id: 'ecriture', href: '/ecriture', icon: 'M5 19l3-1 10-10-2-2L6 16l-1 3ZM14 6l2 2' },
    {
      id: 'lectures',
      href: '/lectures',
      icon: 'M5 5h5a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H5zM19 5h-5a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h5z',
    },
    { id: 'suivi', href: '/suivi', icon: 'M5 19V11M10 19V7M15 19v-5M20 19V4' },
  ] as const;

  const current = $derived.by(() => {
    const p = page.url.pathname;
    if (/^\/(niveaux|lecons)\/r[ea]\d/.test(p)) return 'sciences';
    if (p === '/' || p.startsWith('/niveaux') || p.startsWith('/lecons')) return 'arabe';
    if (p.startsWith('/hifz') || p.startsWith('/coran')) return 'coran';
    const x = TABS.find((y) => y.href !== '/' && p.startsWith(y.href));
    return x?.id ?? '';
  });
  const NO_TABS = ['/ecole', '/connexion', '/inscription', '/profils'];
  const showTabs = $derived(!NO_TABS.some((p) => page.url.pathname.startsWith(p)));

  let online = $state(true);
  let pending = $state(0);
  let settings: Settings | null = $state(null);
  let profile: DevProfile | null = $state(null);
  let me: Me | null = $state(null);
  let lastActivity = Date.now();
  // thème par public (jetons : src/lib/theme/tokens.ts) : « enfants » pour un profil d'enfant actif
  $effect(() => {
    document.documentElement.dataset.theme = profile?.kind === 'enfant' ? 'enfants' : 'adultes';
  });

  onMount(() => {
    online = navigator.onLine;
    const on = () => (online = true);
    const off = () => (online = false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const stopQ = onQueue((n) => (pending = n));
    void pendingCount()
      .then((n) => (pending = n))
      .catch(() => {});
    startSync();
    // premier chargement : le compte vient du réseau (la copie locale peut être absente ou ancienne)
    void fetchMe().then((m) => (me = m));
    // mode école : retour à la grille des élèves après une période d'inactivité
    const touch = () => (lastActivity = Date.now());
    for (const ev of ['pointerdown', 'keydown', 'scroll'])
      window.addEventListener(ev, touch, { passive: true });
    const timer = setInterval(async () => {
      if (!settings?.ecole || !profile) return;
      if (Date.now() - lastActivity > settings.idleMinutes * 60_000) {
        await setActiveProfile(null);
        profile = null;
        await goto(resolve('/ecole'));
      }
    }, 1000);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      stopQ();
      clearInterval(timer);
    };
  });

  async function refresh() {
    settings = await getSettings().catch(() => null);
    profile = await activeProfile().catch(() => null);
    me = await cachedMe();
    lastActivity = Date.now();
  }
  // à chaque navigation : relire réglages, compte et profil (ils ont pu changer)
  $effect(() => {
    void page.url.pathname;
    void refresh();
  });

  async function changeStudent() {
    await setActiveProfile(null);
    profile = null;
    await goto(resolve(settings?.ecole ? '/ecole' : '/profils'));
  }
</script>

<div class="app" data-sveltekit-preload-data={settings?.econome ? 'off' : 'hover'}>
  <header class="top">
    <a href={resolve('/aujourdhui')} class="brand" data-testid="accueil">{t('app.nom')}</a>
    {#if !online}<span class="badge off" data-testid="hors-ligne">{t('entete.hors_ligne')}</span
      >{/if}
    {#if pending > 0}<span class="badge" data-testid="en-attente" title={t('entete.attente_titre')}
        >{t('entete.attente', { n: pending })}</span
      >{/if}
    <span class="spacer"></span>
    {#if profile}
      <span class="who" data-testid="eleve-actif">{profile.pseudonym}</span>
      {#if me?.profiles && me.profiles.length > 1}
        <button type="button" class="small" onclick={changeStudent}
          >{t('entete.changer_eleve')}</button
        >
      {/if}
    {/if}
    {#if me}
      <a
        class="dl"
        href={resolve('/compte')}
        aria-label={t('entete.compte')}
        data-testid="lien-compte"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"
          ><path d="M4 20c1-4 4-6 8-6s7 2 8 6M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8" /></svg
        >
      </a>
    {:else}
      <a class="login" href={resolve('/connexion')} data-testid="lien-connexion"
        >{t('entete.connexion')}</a
      >
    {/if}
    <a class="dl" href={resolve('/hors-ligne')} aria-label={t('entete.telechargements')}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14" /></svg>
    </a>
  </header>

  {#if showTabs}
    <nav class="tabs" aria-label={t('onglets.aria')}>
      {#each TABS as x (x.id)}
        <a
          href={resolve(x.href)}
          class:active={current === x.id}
          aria-current={current === x.id ? 'page' : undefined}
          data-tab={x.id}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={x.icon} /></svg>
          <span>{t(`onglets.${x.id}`)}</span>
        </a>
      {/each}
    </nav>
  {/if}

  <main>
    {@render children()}
  </main>
</div>

<style>
  .top {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    background: var(--navy);
    color: #fff;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .brand {
    color: #fff;
    font-weight: 700;
    text-decoration: none;
    letter-spacing: 0.08em;
  }
  .spacer {
    flex: 1;
  }
  .badge {
    font-size: 0.78rem;
    background: #ffffff22;
    border-radius: 99px;
    padding: 2px 10px;
  }
  .badge.off {
    background: var(--gold);
    color: #1b1b1b;
    font-weight: 700;
  }
  .who {
    font-weight: 700;
    font-size: 0.9rem;
  }
  .small {
    min-height: 36px;
    font-size: 0.85rem;
    padding: 2px 10px;
  }
  .dl svg {
    width: 26px;
    height: 26px;
    fill: none;
    stroke: #fff;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .login {
    color: #fff;
    font-weight: 700;
    font-size: 0.9rem;
  }
  .dl {
    min-width: 44px;
    min-height: 44px;
    display: grid;
    place-items: center;
  }
  .tabs {
    display: flex;
    background: #fff;
    border-bottom: 2px solid var(--line);
    overflow-x: auto;
  }
  .tabs a {
    flex: 1;
    min-width: 72px;
    min-height: 56px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 6px 4px;
    color: var(--ink2);
    text-decoration: none;
    font-size: 0.78rem;
    text-align: center;
    border-bottom: 3px solid transparent;
  }
  .tabs a.active {
    color: var(--navy);
    font-weight: 700;
    border-bottom-color: var(--teal);
  }
  .tabs svg {
    width: 24px;
    height: 24px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  main {
    max-width: 860px;
    margin: 0 auto;
    padding: 16px 16px 96px;
  }
  /* téléphone : barre d'onglets en bas de l'écran */
  @media (max-width: 700px) {
    .tabs {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 10;
      border-top: 2px solid var(--line);
      border-bottom: 0;
    }
    .tabs a {
      min-width: 0;
      padding: 6px 2px;
      border-bottom: 0;
      border-top: 3px solid transparent;
      font-size: 0.68rem;
    }
    .tabs a.active {
      border-top-color: var(--teal);
    }
  }
</style>
