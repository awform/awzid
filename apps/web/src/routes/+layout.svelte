<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import {
    activeProfile,
    onQueue,
    onStorageFull,
    pendingCount,
    setActiveProfile,
    startSync,
    type DevProfile,
  } from '$lib/attempts';
  import { t } from '$lib/i18n';
  import { getSettings, type Settings } from '$lib/offline';
  import { purgeOldRecordings } from '$lib/recordings';
  import { cachedMe, fetchMe, type Me } from '$lib/session';
  import { activeNav, audienceOf, navFor, themeOf } from '$lib/ui/audience';
  import Brand from '$lib/ui/Brand.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { applyMode, nextMode, readMode, writeMode, type Mode } from '$lib/ui/mode';

  let { children } = $props();

  let online = $state(true);
  let pending = $state(0);
  let storageFull = $state(false);
  let settings = $state<Settings | null>(null);
  let profile = $state<DevProfile | null>(null);
  let me = $state<Me | null>(null);
  let mode = $state<Mode>('auto');
  let lastActivity = Date.now();

  /**
   * Lot 26 — public de l'écran : thème (jardin, nuit, manuscrit, clair) et navigation de 3 à 5 entrées.
   * Le parent qui gère la famille, l'enseignant et l'administration ont le thème « clair et minimal ».
   */
  const audience = $derived(
    audienceOf({
      profileKind: profile?.kind ?? null,
      accountKind: me?.account.kind ?? null,
      profileKinds: (me?.profiles ?? []).map((p) => p.kind),
      path: page.url.pathname,
    }),
  );
  const nav = $derived(navFor(audience));
  const current = $derived(activeNav(nav, page.url.pathname));
  const NO_TABS = ['/ecole', '/connexion', '/inscription'];
  const showTabs = $derived(!NO_TABS.some((p) => page.url.pathname.startsWith(p)));

  $effect(() => {
    document.documentElement.dataset.theme = themeOf(audience);
    document.documentElement.dataset.public = audience;
  });

  function cycleMode() {
    mode = nextMode(mode);
    writeMode(mode);
    applyMode(mode);
  }

  onMount(() => {
    mode = readMode();
    applyMode(mode);
    online = navigator.onLine;
    const on = () => (online = true);
    const off = () => (online = false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const stopQ = onQueue((n) => (pending = n));
    const stopS = onStorageFull(() => (storageFull = true));
    void pendingCount()
      .then((n) => (pending = n))
      .catch(() => {});
    startSync();
    // enregistrements locaux de plus de 7 jours : effacés dès le démarrage (audit MIN-16)
    void purgeOldRecordings().catch(() => {});
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
      stopS();
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
  const modeIcon = $derived(mode === 'sombre' ? 'lune' : mode === 'clair' ? 'soleil' : 'auto');
</script>

<div
  class="app"
  class:with-tabs={showTabs}
  data-sveltekit-preload-data={settings?.econome ? 'off' : 'hover'}
>
  <a class="aller-contenu" href="#contenu" data-testid="aller-contenu">{t('app.aller_contenu')}</a>
  <header class="top">
    <a
      href={resolve(audience === 'visiteur' ? '/' : '/aujourdhui')}
      class="brand"
      data-testid="accueil"
      aria-label={t('app.nom')}><Brand /></a
    >
    {#if showTabs}
      <nav class="tabs" aria-label={t('onglets.aria')} data-public={audience}>
        {#each nav as x (x.id)}
          <a
            href={resolve(x.href as '/')}
            class:active={current === x.id}
            aria-current={current === x.id ? 'page' : undefined}
            data-tab={x.id}
          >
            <span class="ti"><Icon name={x.icon} size={audience === 'enfant' ? 28 : 24} /></span>
            <span class="tl">{t(`nav.${x.id}`)}</span>
          </a>
        {/each}
      </nav>
    {/if}
    <span class="spacer"></span>
    {#if pending > 0}<span class="chip" data-testid="en-attente" title={t('entete.attente_titre')}
        >{t('entete.attente', { n: pending })}</span
      >{/if}
    {#if profile}
      <span class="who" data-testid="eleve-actif">{profile.pseudonym}</span>
      {#if me?.profiles && me.profiles.length > 1}
        <button
          type="button"
          class="icon-btn"
          onclick={changeStudent}
          aria-label={t('entete.changer_eleve')}
          title={t('entete.changer_eleve')}
          data-testid="changer-eleve"><Icon name="famille" /></button
        >
      {/if}
    {/if}
    <button
      type="button"
      class="icon-btn"
      onclick={cycleMode}
      aria-label={t(`mode.${mode}`)}
      title={t(`mode.${mode}`)}
      data-testid="mode-affichage"
      data-mode={mode}><Icon name={modeIcon} /></button
    >
    <a
      class="icon-btn"
      href={resolve('/hors-ligne')}
      aria-label={t('entete.telechargements')}
      title={t('entete.telechargements')}><Icon name="telecharger" /></a
    >
    {#if me}
      <a
        class="icon-btn"
        href={resolve('/compte')}
        aria-label={t('entete.compte')}
        title={t('entete.compte')}
        data-testid="lien-compte"><Icon name="personne" /></a
      >
    {:else}
      <a class="login" href={resolve('/connexion')} data-testid="lien-connexion"
        >{t('entete.connexion')}</a
      >
    {/if}
  </header>
  {#if !online}
    <p class="offline-bar" role="status" data-testid="hors-ligne">
      <Icon name="horsligne" size={20} />
      <span><strong>{t('entete.hors_ligne')}</strong> — {t('etat.bandeau_hors_ligne')}</span>
    </p>
  {/if}
  {#if storageFull}<p class="card bad" role="alert" data-testid="stockage-plein">
      {t('entete.stockage_plein')}
    </p>{/if}

  <main id="contenu" tabindex="-1">
    {@render children()}
    <footer class="pied" data-testid="pied">
      <a href={resolve('/aide')}>{t('aide.titre')}</a>
      <a href={resolve('/garanties')}>{t('pied.garanties')}</a>
      <a href={resolve('/legal/[page]', { page: 'mentions' })}>{t('pied.mentions')}</a>
      <a href={resolve('/legal/[page]', { page: 'cgu' })}>{t('pied.cgu')}</a>
      <a href={resolve('/legal/[page]', { page: 'confidentialite' })}>{t('pied.confidentialite')}</a
      >
      <a href={resolve('/legal/[page]', { page: 'cookies' })}>{t('pied.cookies')}</a>
    </footer>
  </main>
</div>

<style>
  .top {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    padding: 6px max(12px, env(safe-area-inset-left));
    min-height: 60px;
    background: var(--header);
    color: var(--on-header);
    border-bottom: 1px solid var(--line);
    position: sticky;
    top: 0;
    z-index: 20;
  }
  .brand {
    color: inherit;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    min-height: 48px;
    padding-inline-end: 8px;
  }
  .spacer {
    flex: 1;
  }
  .chip {
    font-size: 0.8rem;
    border: 1px solid currentColor;
    border-radius: var(--radius-pill);
    padding: 2px 10px;
    white-space: nowrap;
  }
  .who {
    font-weight: 700;
    font-size: 0.95rem;
    max-width: 9em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .icon-btn {
    display: inline-grid;
    place-items: center;
    min-width: 48px;
    min-height: 48px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-pill);
    background: transparent;
    color: inherit;
  }
  .icon-btn:hover {
    background: color-mix(in srgb, currentColor 10%, transparent);
  }
  .login {
    color: inherit;
    font-weight: 700;
    font-size: 0.95rem;
    min-height: 48px;
    display: inline-flex;
    align-items: center;
  }
  .offline-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 0;
    padding: 8px 16px;
    background: var(--warn-bg);
    color: var(--warn-ink);
    font-size: 0.95rem;
    text-align: center;
  }

  /* navigation : dans l'en-tête sur grand écran, barre du bas sur téléphone et tablette */
  .tabs {
    display: flex;
    gap: 4px;
    margin-inline-start: var(--space-m);
  }
  .tabs a {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 48px;
    padding: 0 14px;
    border-radius: var(--radius-pill);
    color: inherit;
    text-decoration: none;
    font-weight: 600;
    transition: background var(--motion-fast) ease;
  }
  .tabs a:hover {
    background: color-mix(in srgb, currentColor 10%, transparent);
  }
  .tabs a.active {
    background: var(--primary-soft);
    color: var(--primary);
  }
  main {
    max-width: 960px;
    margin: 0 auto;
    padding: var(--space-m) var(--space-m) 48px;
  }

  .pied {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    margin: 40px 0 8px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
    font-size: 0.9rem;
  }
  @media print {
    .pied,
    .top,
    .tabs {
      display: none;
    }
  }

  @media (max-width: 899px) {
    .tabs {
      position: fixed;
      inset-inline: 0;
      bottom: 0;
      z-index: 20;
      margin: 0;
      gap: 0;
      padding: 6px 6px max(6px, env(safe-area-inset-bottom));
      background: var(--card);
      color: var(--ink2);
      border-top: 1px solid var(--line);
      box-shadow: 0 -6px 20px -14px rgba(0, 0, 0, 0.35);
    }
    .tabs a {
      flex: 1 1 0;
      min-width: 0;
      flex-direction: column;
      justify-content: center;
      gap: 2px;
      padding: 4px 2px;
      min-height: 56px;
      border-radius: var(--radius-md);
      font-size: 0.72rem;
      text-align: center;
    }
    .tabs a:hover {
      background: transparent;
    }
    .tabs a.active {
      background: transparent;
      color: var(--primary);
      font-weight: 800;
    }
    .tabs a.active .ti {
      background: var(--primary-soft);
    }
    .ti {
      display: grid;
      place-items: center;
      width: 52px;
      height: 30px;
      border-radius: var(--radius-pill);
      transition: background var(--motion-fast) ease;
    }
    .tl {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .with-tabs main {
      padding-bottom: 112px;
    }
    /* enfants : barre plus haute, icônes plus grandes */
    .tabs[data-public='enfant'] a {
      min-height: 64px;
    }
  }
  @media (max-width: 479px) {
    .who {
      display: none;
    }
  }
</style>
