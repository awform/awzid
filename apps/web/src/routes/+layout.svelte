<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import '../app.css';
  import { onMount, type Component } from 'svelte';
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
  import { setTimeZone, t } from '$lib/i18n';
  import { getSettings, type Settings } from '$lib/offline';
  import { purgeOldRecordings } from '$lib/recordings';
  import { remindersOn } from '$lib/quotidien/reglages';
  import { cachedMe, fetchMe, type Me } from '$lib/session';
  import { chargerFonctions } from '$lib/fonctions.svelte';
  import { cleDeChemin, envoyer, noterUsage, usagePour } from '$lib/usage';
  import { appliquerFond, lireFond, stockageLocal } from '$lib/theme/fond';
  import { marquerAppareilNeuf, migrerThemesSupprimes } from '$lib/theme/migration';
  import { activeNav, ancienThemeDuPublic, audienceOf, navFor } from '$lib/ui/audience';
  import Brand from '$lib/ui/Brand.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { applyMode, nextMode, readMode, writeMode, type Mode } from '$lib/ui/mode';

  let { children } = $props();

  // appareil neuf : drapeau posé dès l'initialisation de la page, avant que le lecteur (enfant, initialisé après
  // ce script) écrive ses réglages ; sinon la migration prendrait l'appareil pour un ancien « manuscrit » (mode clair forcé)
  marquerAppareilNeuf(stockageLocal());

  let online = $state(true);
  let pending = $state(0);
  let storageFull = $state(false);
  let settings = $state<Settings | null>(null);
  let profile = $state<DevProfile | null>(null);
  let me = $state<Me | null>(null);
  let mode = $state<Mode>('auto');
  let lastActivity = Date.now();
  // bêta-support : bandeau « Mettre à jour », chargé après le démarrage (jamais dans le chargement initial)
  let Maj = $state<Component | null>(null);

  /**
   * Lot 26 — public de l'écran : navigation de 3 à 5 entrées et ergonomie (enfant : tailles plus grandes).
   * Depuis le 11/10/2026 il n'y a plus qu'une identité (la marque, clair et sombre) pour tous les publics.
   */
  const audience = $derived(
    audienceOf({
      profileKind: profile?.kind ?? null,
      // lot F2 : tablette de classe (compte de l'école) = appareil partagé, comme celui d'une famille
      accountKind: me?.account.kind === 'ecole' ? 'parent' : (me?.account.kind ?? null),
      profileKinds: (me?.profiles ?? []).map((p) => p.kind),
      path: page.url.pathname,
    }),
  );
  const nav = $derived(navFor(audience));
  const current = $derived(activeNav(nav, page.url.pathname));
  const NO_TABS = ['/ecole', '/connexion', '/inscription', '/acces'];
  /**
   * Lot F3 (revue E10) : un accord nécessaire manque (compte d'avant F3, ou accord retiré) → page « Accords »
   * (`/acces/accords`)
   * au premier usage ; seules les pages du compte, légales et d'aide restent ouvertes. Fuseau du compte (M8).
   */
  const GATE_FREE = /^\/(compte|legal|aide|connexion|inscription|acces|garanties)(\/|$)/;
  $effect(() => {
    setTimeZone(me?.account.tz);
    const path = page.url.pathname;
    if (me?.accordsManquants?.length && !GATE_FREE.test(path))
      void goto(resolve('/acces/[[mode]]', { mode: 'accords' }));
  });
  const showTabs = $derived(!NO_TABS.some((p) => page.url.pathname.startsWith(p)));

  $effect(() => {
    const root = document.documentElement;
    root.dataset.public = audience;
    // couleur de la barre du navigateur : celle de l'en-tête affiché
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta)
      meta.setAttribute(
        'content',
        getComputedStyle(root).getPropertyValue('--header').trim() || '#15324a',
      );
  });

  // 11/10/2026 : migration silencieuse des anciens thèmes (une seule fois, quand le public de l'écran est connu)
  let prete = $state(false);
  let migre = false;
  $effect(() => {
    // attendre le compte ou un profil actif : le public (donc l'ancien thème) en dépend (adulte autonome : pas de profil actif)
    if (!prete || migre || (!profile && !me)) return;
    migre = true;
    if (migrerThemesSupprimes(stockageLocal(), ancienThemeDuPublic(audience))) {
      mode = readMode();
      applyMode(mode);
      appliquerFond(lireFond());
    }
  });

  function cycleMode() {
    mode = nextMode(mode);
    writeMode(mode);
    applyMode(mode);
  }

  onMount(() => {
    if ('serviceWorker' in navigator)
      void import('$lib/MajBandeau.svelte').then((m) => (Maj = m.default)).catch(() => {});
    mode = readMode();
    applyMode(mode);
    appliquerFond(lireFond());
    online = navigator.onLine;
    const on = () => {
      online = true;
      void envoyer();
    };
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
    // A12 : rappels doux des prières (désactivés par défaut) ; le calcul n'est chargé que s'ils sont activés
    if (remindersOn())
      void import('$lib/quotidien/rappels').then((m) => m.startReminders()).catch(() => {});
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
    // F5 : interrupteurs de fonctions (copie courte, hors ligne : dernière connue) et usage sans traceur
    const qui = me ? (profile?.id ?? 'compte') : null;
    usagePour(qui);
    void chargerFonctions(me ? (profile?.id ?? null) : null);
    noterUsage(cleDeChemin(page.url.pathname), qui);
    prete = true;
  }
  // à chaque navigation : relire réglages, compte et profil (ils ont pu changer)
  $effect(() => {
    void page.url.pathname;
    void refresh();
  });

  const piedCache = $derived(
    // D2 : « Plus » range déjà ces liens dans la famille Aide (pas de doublon en bas de page)
    /^\/plus\/?$/.test(page.url.pathname) ||
      // lecteur du Coran (11/10/2026) : jamais de pied juridique sous la page du muṣḥaf, pour tous
      /^\/coran\/lecteur\/?$/.test(page.url.pathname) ||
      // hifẓ : écran enfant (règle enfant : aucun lien juridique visible), quel que soit le profil
      /^\/hifz\/enfant\/?$/.test(page.url.pathname) ||
      // élève (enfant, ado, adulte autonome : celui-ci n'a pas toujours de profil actif)
      (['enfant', 'ado', 'adulte'].includes(audience) &&
        (audience === 'enfant' || /^\/(aujourdhui|lecons\/[^/]+)?\/?$/.test(page.url.pathname))),
  );
  const modeIcon = $derived(mode === 'sombre' ? 'lune' : mode === 'clair' ? 'soleil' : 'auto');
</script>

<div
  class="app"
  class:with-tabs={showTabs}
  data-sveltekit-preload-data={settings?.econome ? 'off' : 'hover'}
>
  <a class="aller-contenu" href="#contenu" data-testid="aller-contenu">{t('app.aller_contenu')}</a>
  <header class="top" class:has-who={!!profile}>
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
            <span class="tl"><Bidi text={t(`nav.${x.id}`)} /></span>
          </a>
        {/each}
      </nav>
    {/if}
    <span class="spacer"></span>
    {#if pending > 0}<span class="chip" data-testid="en-attente" title={t('entete.attente_titre')}
        ><Icon name="rafraichir" size={16} /><span class="chip-n" aria-hidden="true"
          ><Bidi text={pending} /></span
        ><span class="chip-t"><Bidi text={t('entete.attente', { n: pending })} /></span></span
      >{/if}
    {#if profile}
      <span class="who" data-testid="eleve-actif" data-prive><Bidi text={profile.pseudonym} /></span
      >
      <!-- D1 : « Changer d'élève » est en tête de la page « Compte » (en-tête allégé, prénom jamais tronqué) -->
    {/if}
    <button
      type="button"
      class="icon-btn"
      onclick={cycleMode}
      aria-label={t(`mode.${mode}`)}
      title={t(`mode.${mode}`)}
      data-testid="mode-affichage"
      data-mode={mode}
      ><Icon name={modeIcon} /><span class="ic-nom">{t('entete.nom_mode')}</span></button
    >
    <a
      class="icon-btn"
      href={resolve('/hors-ligne')}
      aria-label={t('entete.telechargements')}
      title={t('entete.telechargements')}
      data-testid="lien-telecharger"
      ><Icon name="telecharger" /><span class="ic-nom">{t('entete.nom_telecharger')}</span></a
    >
    {#if me}
      <a
        class="icon-btn"
        href={resolve('/compte')}
        aria-label={t('entete.compte')}
        title={t('entete.compte')}
        data-testid="lien-compte"
        ><Icon name="personne" /><span class="ic-nom">{t('entete.nom_compte')}</span></a
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
  <!-- bêta-support : nouvelle version prête (jamais en pleine leçon ou écoute, ni hors ligne) -->
  {#if Maj}<Maj />{/if}

  <main id="contenu" tabindex="-1">
    {@render children()}
    <!-- D1 : pas de liens juridiques sur l'accueil, l'Arabe et les leçons de l'élève, ni nulle part pour un enfant
         (ils restent dans « Plus », « Aide » et « Compte ») -->
    {#if !piedCache}
      <footer class="pied" data-testid="pied">
        <a href={resolve('/aide')}>{t('aide.titre')}</a>
        <a href={resolve('/garanties')}>{t('pied.garanties')}</a>
        <a href={resolve('/legal/[page]', { page: 'mentions' })}>{t('pied.mentions')}</a>
        <a href={resolve('/legal/[page]', { page: 'cgu' })}>{t('pied.cgu')}</a>
        <a href={resolve('/legal/[page]', { page: 'confidentialite' })}
          >{t('pied.confidentialite')}</a
        >
        <a href={resolve('/legal/[page]', { page: 'cookies' })}>{t('pied.cookies')}</a>
      </footer>
    {/if}
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
  /* D1 : le prénom n'est jamais tronqué (au besoin sur deux lignes) */
  .who {
    font-weight: 700;
    font-size: 0.95rem;
    line-height: 1.15;
    flex-shrink: 0;
  }
  .icon-btn {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    min-width: 48px;
    min-height: 48px;
    padding: 2px 4px;
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: inherit;
    text-decoration: none;
  }
  /* règle du client : chaque action importante a son nom écrit, lisible à 375 px */
  .ic-nom {
    font-size: 0.72rem;
    font-weight: 600;
    line-height: 1.15;
    white-space: nowrap;
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
      max-width: 100vw;
      overflow: hidden;
      background: var(--card);
      color: var(--ink2);
      border-top: 1px solid var(--line);
      box-shadow: 0 -6px 20px -14px rgba(0, 0, 0, 0.35);
    }
    .tabs a {
      flex: 1 1 0;
      min-width: 0;
      flex-direction: column;
      /* A37 : icônes alignées en haut, même si un libellé passe sur deux lignes */
      justify-content: flex-start;
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
      width: min(52px, 100%);
      height: 30px;
      border-radius: var(--radius-pill);
      transition: background var(--motion-fast) ease;
    }
    /* A37 : un libellé long (« Vivre l'islam ») passe sur deux lignes au lieu d'être coupé */
    .tl {
      max-width: 100%;
      overflow: hidden;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      /* 1,25 : place des voyelles et signes de l'arabe au-dessus et au-dessous */
      line-height: 1.25;
      text-align: center;
      white-space: normal;
    }
    .with-tabs main {
      padding-bottom: 112px;
    }
    /* enfants : barre plus haute, icônes plus grandes */
    .tabs[data-public='enfant'] a {
      min-height: 64px;
    }
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .chip-n {
    display: none;
    font-weight: 700;
  }
  /* téléphone : l'en-tête ne déborde jamais (marque réduite, compteur au lieu de la phrase) */
  .top > :global(*) {
    min-width: 0;
  }
  @media (max-width: 599px) {
    .chip-n {
      display: inline;
    }
    /* compte à plusieurs profils : le symbole seul (le nom « Awzid » reste lu), pour laisser le prénom entier */
    .has-who .brand :global(.word) {
      display: none;
    }
    .chip-t {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
</style>
