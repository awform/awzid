<script lang="ts">
  import { fn } from '$lib/fonctions.svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { onDestroy, onMount, tick, untrack } from 'svelte';
  import { getSettings } from '$lib/offline';
  import { chargerModule } from '$lib/charger';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { splitBasmala, suraName, type QuranMeta } from '@awform/hifz';
  import { demoProfileFor } from '$lib/attempts';
  import type { Reciter, SuraPack } from '$lib/coran-audio';
  import { hifzToday, loadMeta, loadVerses } from '$lib/hifz';
  import { fmtNumber, localeInfo, t } from '$lib/i18n';
  import AudioPlayer from '$lib/quran/AudioPlayer.svelte';
  import MushafPage from '$lib/quran/MushafPage.svelte';
  import type { ExactPage } from '$lib/quran/mushaf-exact';
  import {
    exactAvailable,
    exactState,
    loadBsmlFont,
    loadExactPage,
    loadPageFont,
    type ExactState,
  } from '$lib/quran/mushaf-exact-load';
  import QuranText from '$lib/quran/QuranText.svelte';
  import RiwayaBadge from '$lib/quran/RiwayaBadge.svelte';
  import Feuille from '$lib/quran/lecture/Feuille.svelte';
  import MenuVerset from '$lib/quran/lecture/MenuVerset.svelte';
  import Reglages from '$lib/quran/lecture/Reglages.svelte';
  import { appliquerFond } from '$lib/theme/fond';
  import Selecteur from '$lib/quran/lecture/Selecteur.svelte';
  import {
    type Onglet,
    BASMALA,
    basmalaInFatiha,
    clampRange,
    hizbStart,
    isMarked,
    listenFiles,
    needsBasmala,
    nextSuraRange,
    playQueue,
    withBasmala,
    PRESETS,
    presetOf,
    presetRange,
    readMarks,
    reciterFor,
    toggleMark,
    writeLast,
    type PresetId,
    type Range,
  } from '$lib/quran/lecture';
  import {
    clampPage,
    juzOfPage,
    pageOf,
    pageOfJuz,
    pageSegments,
    pageStarts,
    pageVerses,
    parseRef,
    readPrefs,
    searchVerses,
    spreadOf,
    stepPage,
    suraLengths,
    swipeStep,
    TEXT_SCALE,
    writePrefs,
    type MushafPrefs,
  } from '$lib/quran/mushaf';
  import {
    connectionType,
    removeSura,
    saveSura,
    savedSuras,
    setWifiOnly,
    wifiOnly,
  } from '$lib/quran/offline-audio';
  import { canMemorize, HAFS, portionRange, type ChainStep } from '$lib/quran/player';
  import { loadReciters, loadTracks } from '$lib/quran/reciters';
  import type { RiwayaIndex } from '@awform/content/riwayat';
  import {
    ensureRiwayaFont,
    highlightOn,
    isMushafRiwaya,
    loadRiwayaIndex,
    loadRiwayaSura,
    mushafChoice,
    readMushafRiwaya,
    riwayaFamily,
    riwayaText,
    writeMushafRiwaya,
    type MushafRiwaya,
    type RiwayaSura,
  } from '$lib/quran/riwayat';
  import { loadTajwid, readTajwidPrefs, type TajwidSura } from '$lib/quran/tajwid';
  import {
    loadTranslation,
    noteLines,
    translationInfo,
    type TranslationSura,
  } from '$lib/quran/translation';
  import Icon from '$lib/ui/Icon.svelte';
  import BoutonEcoute from '$lib/ecoute/BoutonEcoute.svelte';
  import {
    clampVue,
    isDoubleTap,
    tapZone,
    toggleZoom,
    zoomAt,
    ZOOM_MIN,
    type Vue,
  } from '$lib/quran/zoom';

  /**
   * CORAN ÉPURÉ (06/10/2026) — UN SEUL écran de lecture : le texte occupe l'écran (page du Muṣḥaf ou sourate
   * en versets, au choix). En haut : sur téléphone, une puce « Al-Ikhlāṣ · v. 2 · p. 604 · juzʾ 30 » qui ouvre
   * le sélecteur ; sur grand écran, une barre compacte (écoute | affichage, traduction, recherche | sourate,
   * verset, page, juzʾ en sélecteurs dorés). En bas sur téléphone : la MINI-BARRE de lecture, montrée après le
   * premier appui sur « Écouter ». Toucher un verset ouvre son petit menu. Réglages avancés dans des feuilles.
   * Remplace Lire, Écouter, Mémoriser et le Muṣḥaf page par page (anciennes adresses redirigées ici).
   * Respect : texte Tanzil tel quel, aucune lecture automatique, pas de musique, aucune voix de synthèse,
   * riwāya toujours écrite en clair, surlignage jamais d'une riwāya sur le texte d'une autre.
   */
  type Verse = { s: number; a: number; text: string };
  const TRACK_CODES = [
    'sourate_absente',
    'recitateur_indisponible',
    'recitateur_non_autorise',
    'riwaya_differente_du_carnet',
    'hors_ligne',
  ];

  let meta = $state<(QuranMeta & { basmala: string }) | null>(null);
  let prefs = $state<MushafPrefs>(readPrefs());
  let tjPrefs = $state(readTajwidPrefs());
  let tjData = $state<TajwidSura | null>(null);
  let p = $state(1);
  /** verset choisi (position de lecture) */
  let cur = $state<{ s: number; a: number } | null>(null);
  /** verset entendu (surlignage) — distinct de `cur` (A1 : sinon la file était recalculée et coupée) */
  let heard = $state<{ s: number; a: number } | null>(null);
  let texts = $state<Record<number, Record<number, string>>>({});
  let tajwids = $state<Record<number, TajwidSura | null>>({});
  let trads = $state<Record<number, TranslationSura | null>>({});
  let revealed = $state(new Set<string>());
  let narrow = $state(true);
  let noPages = $state(false);
  let ready = $state(false);

  // écoute
  let profileId = $state<string | null>(null);
  /** A5 : public du profil (enfant : présentation simple de « Réciter et vérifier ») */
  let profKind = $state('adulte');
  let allReciters = $state<Reciter[]>([]);
  let conseil = $state<string | null>(null);
  let restreint = $state(false);
  let reciterId = $state<string | null>(null);
  let pack = $state<SuraPack | null>(null);
  let trackCode = $state<string | null>(null);
  let range = $state<Range>({ s: 1, from: 1, to: 7 });
  let playing = $state(false);
  let step = $state<ChainStep | null>(null);
  let audioOn = $state(false);
  let player = $state<ReturnType<typeof AudioPlayer> | undefined>();
  let saved = $state(false);
  let wifi = $state(true);
  let progress = $state<{ n: number; total: number } | null>(null);
  let offMsg = $state('');
  let portion = $state<Range | null>(null);
  /** audio en train de jouer (pas en pause) */
  let audioPlaying = $state(false);
  /** basmala du récitateur (fichier du verset 1 d'al-Fātiḥa de la MÊME riwāya ; null : pas de fichier) */
  let bsm = $state<{ reciter: string; url: string | null } | null>(null);

  // feuilles et menu
  let selOpen = $state(false);
  let selTab = $state<Onglet>('sourate');
  /** panneau UNIQUE « Réglages » (écoute, récitateur, muṣḥaf, affichage, traduction, tajwid, mémoriser, hors ligne) */
  let regOpen = $state(false);
  let kidAll = $state(false);
  /** public de l'écran (enfant : tuiles simples d'abord, le reste pour le parent) */
  let kid = $state(false);
  /** avis du lecteur : récitateur ou muṣḥaf changés pour garder la même numérotation des versets */
  let notice = $state('');
  let tradSheet = $state(false);
  let infoOpen = $state(false);
  let menuAt = $state<{ s: number; a: number } | null>(null);
  let menuAnchor = $state<HTMLElement | null>(null);
  let marks = $state(readMarks());
  let ecritureRefs = $state<Set<string> | null>(null);

  // A8 : muṣḥaf d'une autre riwāya (texte et police du Complexe) ; Ḥafṣ (Tanzil) par défaut
  let rw = $state<MushafRiwaya>(readMushafRiwaya());
  let rwIndex = $state<RiwayaIndex | null>(null);
  let rwTexts = $state<Record<number, RiwayaSura | null>>({});
  let rwFont = $state<'attente' | 'ok' | 'erreur'>('attente');
  let rwError = $state(false);
  const isRw = $derived(rw !== HAFS);
  const rwDef = $derived(riwayaText(rw));

  const starts = $derived(isRw ? (rwIndex?.pages ?? null) : meta ? pageStarts(meta) : null);
  const lengths = $derived(isRw ? (rwIndex?.counts ?? []) : meta ? suraLengths(meta) : []);
  const juzOf = (n: number) =>
    isRw ? (rwIndex?.pageJuz[n - 1] ?? 1) : meta ? juzOfPage(meta, n) : 1;
  const pageOfJ = (j: number) =>
    isRw
      ? Math.max(1, (rwIndex?.pageJuz.findIndex((x) => x >= j) ?? 0) + 1)
      : meta
        ? pageOfJuz(meta, j)
        : 1;
  const segs = (n: number) => (starts ? pageSegments(starts, lengths, n) : []);
  const vue = $derived(prefs.vue);
  const trad = $derived(isRw ? null : translationInfo(prefs.translation));
  /** traduction à côté de la page (grand écran) ou sous chaque verset (vue « versets ») */
  const tradShown = $derived(!!trad && prefs.showTrad);
  const double = $derived(!narrow && !prefs.single && !tradShown && vue === 'page');
  const shown = $derived(double ? [...spreadOf(p)] : [p]);
  const shownVerses = $derived(starts ? shown.flatMap((n) => pageVerses(starts, lengths, n)) : []);
  /** sourate « active » : celle du verset choisi s'il est affiché, sinon la première de la page */
  const activeSura = $derived(
    cur && (vue === 'versets' || shownVerses.some(([s, a]) => s === cur!.s && a === cur!.a))
      ? cur.s
      : (segs(p)[0]?.s ?? 1),
  );
  // verset choisi ; la basmala (a = 0) compte comme le verset 1 pour la position
  const posA = $derived(
    cur?.s === activeSura
      ? Math.max(1, cur.a)
      : (segs(p).find((g) => g.s === activeSura)?.from ?? 1),
  );
  const suraLen = (s: number) => lengths[s - 1] ?? 1;
  const memo = $derived(prefs.memo > 0);
  const reciters = $derived(memo ? allReciters.filter(canMemorize) : allReciters);
  const reciter = $derived(reciters.find((r) => r.id === reciterId) ?? null);
  const settings = $derived({
    repeatVerse: prefs.repeatVerse,
    repeatRange: prefs.repeatRange,
    chain: prefs.chain,
    repeatNew: prefs.repeatNew,
    repeatChain: prefs.repeatChain,
  });
  const plan = $derived(playQueue(range, settings));
  const preset = $derived(presetOf(settings, range, suraLen(range.s)));
  /**
   * Le fichier « verset n » du récitateur est-il le verset n du texte affiché ? (même riwāya, même découpage).
   * Sert au surlignage ET à la lecture : jamais un verset choisi lu dans une autre numérotation.
   */
  const highlight = $derived(highlightOn(reciter, rw, pack, suraLen(range.s)));
  /** basmala à lire avant le verset 1 (début de sourate, sauf at-Tawba ; Fātiḥa selon la riwāya) */
  const wantBasmala = $derived(
    !!reciter &&
      needsBasmala(range, reciter.riwaya, {
        chain: prefs.chain,
        repeatVerse: prefs.repeatVerse,
        wholeFile: pack?.mode === 'sourate',
      }),
  );
  const bsmUrl = $derived(bsm && bsm.reciter === reciter?.id ? bsm.url : null);
  const queue = $derived(
    withBasmala(listenFiles(pack, highlight, plan.queue), wantBasmala, !!bsmUrl),
  );
  /** basmala voulue mais sans fichier de la même riwāya : rien n'est lu, c'est dit en petit */
  const basmalaMissing = $derived(wantBasmala && !!bsm && bsm.reciter === reciter?.id && !bsm.url);
  const lastPage = $derived(p >= 604 || (double && spreadOf(p)[1] >= 604));
  const position = $derived(
    t('mp.page_sur', {
      n: shown
        .slice()
        .sort((x, y) => x - y)
        .map((n) => fmtNumber(n, { useGrouping: false }))
        .join('–'),
      total: fmtNumber(604, { useGrouping: false }),
    }),
  );
  const chip = $derived(
    t('cl.puce', {
      sourate: suraName(activeSura),
      a: fmtNumber(posA),
      p: fmtNumber(p, { useGrouping: false }),
      juz: fmtNumber(juzOf(p)),
    }),
  );
  const chipDetail = $derived(
    t('cl.puce_detail', {
      a: fmtNumber(posA),
      p: fmtNumber(p, { useGrouping: false }),
      juz: fmtNumber(juzOf(p)),
    }),
  );
  const trackMsg = $derived(
    trackCode ? t(`ca.pistes_${TRACK_CODES.includes(trackCode) ? trackCode : 'erreur'}`) : '',
  );
  const text = (s: number, a: number) => (isRw ? rwTexts[s]?.verses.get(a)?.text : texts[s]?.[a]);
  const rwPage = $derived(
    isRw ? { family: riwayaFamily(rw), suraName: (s: number) => rwTexts[s]?.name } : null,
  );
  const tajwidOn = $derived(!isRw && tjPrefs.on);
  const tajwidOf = (s: number) => (tajwidOn ? (tajwids[s] ?? null) : null);
  /** versets de la sourate affichée en vue « versets » */
  const suraVerses = $derived.by((): Verse[] => {
    const s = activeSura;
    if (isRw) {
      const d = rwTexts[s];
      return d ? [...d.verses.values()].map((x) => ({ s, a: x.a, text: x.text })) : [];
    }
    const m = texts[s] ?? {};
    const out: Verse[] = [];
    for (let a = 1; a <= suraLen(s); a++) {
      const x = m[a];
      if (x === undefined) return out.length ? out : [];
      out.push({ s, a, text: x });
    }
    return out;
  });
  const heardOrCur = $derived(heard ?? cur);
  // A34 : mise en page EXACTE (Ḥafṣ, sans tajwid ni masquage) pour les pages publiées ; sinon page fluide
  let exactInfo = $state<ExactState | null>(null);
  let exactPages = $state<Record<number, ExactPage | null>>({});
  // F5 : interrupteur « Muṣḥaf exact »
  // style choisi par l'élève (Médine à l'identique ou muṣḥaf habituel) ; texte agrandi : page fluide
  const exactOn = $derived(
    fn('mushaf_exact') &&
      !isRw &&
      !tajwidOn &&
      prefs.memo === 0 &&
      prefs.style === 'exact' &&
      prefs.size === 0,
  );
  const exactCount = $derived(
    !exactInfo?.disponible
      ? 0
      : exactInfo.partiel && exactInfo.pages
        ? exactInfo.pages.length
        : 604,
  );
  const exactOf = (n: number) => (exactOn ? (exactPages[n] ?? null) : null);
  const anyExact = $derived(vue === 'page' && shown.some((n) => !!exactOf(n)));
  /** Lignes et polices des pages affichées disponibles en mise en page exacte (montrées une fois prêtes). */
  /** Pages (ou double page) qui précèdent et qui suivent celles affichées, dans le Muṣḥaf (1 à 604). */
  function voisines(vues: number[]): number[] {
    const a = Math.min(...vues);
    const b = Math.max(...vues);
    const pas = vues.length;
    const out: number[] = [];
    for (let i = 1; i <= pas; i++) out.push(a - i, b + i);
    return out.filter((n) => n >= 1 && n <= 604);
  }
  async function ensureExact() {
    const info = exactInfo;
    if (!info || !exactOn || vue !== 'page') return;
    const charger = (pages: number[]) =>
      Promise.all(
        pages.map(async (n) => {
          if (n in exactPages || !exactAvailable(info, n)) return;
          const [pg, f1, f2] = await Promise.all([
            loadExactPage(n, info.version),
            loadPageFont(n),
            loadBsmlFont(),
          ]);
          // une page voisine qui n'a pas pu venir (réseau) sera redemandée quand elle sera affichée
          if (!(pg && f1 && f2) && !shown.includes(n)) return;
          exactPages = { ...exactPages, [n]: pg && f1 && f2 ? pg : null };
        }),
      );
    const vues = [...shown];
    await charger(vues);
    // F5 : pages PRÉCÉDENTE et SUIVANTE (lignes et police) préchargées une fois la page affichée : tourner la
    // page est immédiat, même en 3G ; pas en mode « économe » (données comptées)
    if ((await getSettings().catch(() => null))?.econome) return;
    if (String(vues) !== String(shown)) return;
    await charger(voisines(vues));
  }
  $effect(() => {
    void [exactOn, shown, vue, exactInfo];
    untrack(() => void ensureExact());
  });

  $effect(() => writePrefs({ ...prefs, page: p }));
  // fond de lecture (Ivoire par défaut, Sépia en mode clair) : posé sur la page entière
  $effect(() => appliquerFond(prefs.fond));
  // dernière lecture (accueil : « Reprendre où j'en étais »), gardée sur l'appareil
  $effect(() => {
    if (ready) writeLast({ s: activeSura, a: posA, p });
  });
  // texte, tajwid et traduction des sourates affichées (à la demande)
  $effect(() => {
    void [vue, activeSura, shown, tajwidOn, tradShown, tradSheet, prefs.translation, starts];
    if (ready) untrack(() => void ensure());
  });
  // pistes de la sourate écoutée
  $effect(() => {
    void [range.s, reciterId];
    if (ready) untrack(() => void openTracks());
  });

  onMount(() => {
    // grand écran : large ET (assez haut, ou vraie souris) — un téléphone couché (tactile, peu haut) garde une
    // seule page sur toute la largeur, même au-delà de 900 px
    const mq = window.matchMedia(
      '(min-width: 900px) and (min-height: 561px), (min-width: 900px) and (hover: hover) and (pointer: fine)',
    );
    narrow = !mq.matches;
    const on = () => (narrow = !mq.matches);
    mq.addEventListener('change', on);
    void init();
    return () => mq.removeEventListener('change', on);
  });

  async function init() {
    void exactState().then((s) => (exactInfo = s));
    meta = await loadMeta();
    if (!meta || !pageStarts(meta)) {
      noPages = true;
      return;
    }
    const q = page.url.searchParams;
    const m = q.get('m');
    if (isMushafRiwaya(m)) rw = m;
    const v = q.get('vue');
    if (v === 'page' || v === 'versets') prefs.vue = v;
    const wantMemo = q.get('memo') === '1';
    if (wantMemo) rw = HAFS;
    if (!(await openRiwaya())) rw = HAFS;
    const s = Number(q.get('s'));
    const a = Number(q.get('a')) || 1;
    if (s >= 1 && s <= 114) await goVerse(s, Math.min(a, suraLen(s)), false);
    else await goPage(Number(q.get('page')) || prefs.page);
    const prof = await demoProfileFor('').catch(() => null);
    profileId = prof?.id ?? null;
    profKind = prof?.kind ?? 'adulte';
    wifi = await wifiOnly();
    const c = await loadReciters(profileId, 'ecouter');
    allReciters = c.list;
    conseil = c.conseil;
    restreint = c.restreint;
    const r = q.get('r');
    const asked = r ? c.list.find((x) => x.id === r) : undefined;
    if (asked && !wantMemo && asked.riwaya !== rw && isMushafRiwaya(asked.riwaya)) {
      // récitateur demandé (lien « Écouter » d'une autre riwāya) : le muṣḥaf suit sa riwāya
      reciterId = asked.id;
      await setRiwaya(asked.riwaya, true);
    } else reciterId = reciterFor(reciters, rw, [asked?.id, c.initial, c.conseil]) ?? null;
    range = defaultRange();
    ready = true;
    if (wantMemo) await setMemo(Math.max(1, prefs.memo), true);
    if (q.get('ecoute') === '1') audioOn = true;
    await ensure();
    await openTracks();
  }

  /** Plage proposée à partir de la position (portée du préréglage en cours). */
  function defaultRange(): Range {
    const pr = PRESETS.find((x) => x.id === preset);
    return presetRange(pr?.portee ?? 'suite', activeSura, posA, suraLen(activeSura));
  }
  /** Pendant l'écoute, la plage ne suit pas la navigation (sinon la lecture serait coupée). */
  function follow() {
    if (!playing) range = defaultRange();
  }

  /** Charge le texte (et selon les réglages, le tajwid et la traduction) de ce qui est affiché. */
  async function ensure() {
    if (!starts) return;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- table locale, jamais rendue
    const need = new Map<number, [number, number]>();
    if (vue === 'versets') need.set(activeSura, [1, suraLen(activeSura)]);
    else
      for (const n of shown)
        for (const g of pageSegments(starts, lengths, n)) {
          const r = need.get(g.s);
          need.set(g.s, r ? [Math.min(r[0], g.from), Math.max(r[1], g.to)] : [g.from, g.to]);
        }
    await Promise.all(
      [...need].map(async ([s, [from, to]]) => {
        if (isRw) {
          const key = rw;
          if (rwTexts[s]?.key === key) return;
          const d = await loadRiwayaSura(key, s);
          if (key === rw) rwTexts = { ...rwTexts, [s]: d };
          return;
        }
        const have = texts[s] ?? {};
        let missing = false;
        for (let a = from; a <= to; a++) if (have[a] === undefined) missing = true;
        if (missing) {
          const got: Verse[] = await loadVerses(s, from, to).catch(() => []);
          const next = { ...(texts[s] ?? {}) };
          for (const v of got) next[v.a] = v.text;
          texts = { ...texts, [s]: next };
        }
        if (tajwidOn && !(s in tajwids)) {
          const d = await loadTajwid(s).catch(() => null);
          tajwids = { ...tajwids, [s]: d };
        }
        if (trad && (tradShown || tradSheet) && trads[s]?.key !== trad.key) {
          const d = await loadTranslation(trad.key, s);
          trads = { ...trads, [s]: d };
        }
      }),
    );
  }

  function setUrl() {
    const base = resolve('/coran/lecteur');
    const q = vue === 'versets' ? `?s=${activeSura}` : `?page=${p}`;
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- chemin résolu, suivi d'un paramètre
    void goto(`${base}${q}${isRw ? `&m=${rw}` : ''}`, {
      replaceState: true,
      keepFocus: true,
      noScroll: true,
    });
  }
  async function goPage(n: number) {
    p = clampPage(n);
    if (cur && starts && !shown.includes(pageOf(starts, cur.s, cur.a))) cur = null;
    if (vue === 'versets') {
      // vue « versets » : début de la page dans sa sourate
      const st = starts?.[p - 1];
      if (st) cur = { s: st[0], a: st[1] };
    }
    setUrl();
    follow();
    await ensure();
    if (vue === 'versets' && cur) scrollTo(cur.s, cur.a);
  }
  async function goVerse(s: number, a: number, doFollow = true) {
    if (!starts) return;
    cur = { s, a };
    p = pageOf(starts, s, a);
    setUrl();
    if (doFollow) follow();
    await ensure();
    scrollTo(s, a);
  }
  async function scrollTo(s: number, a: number) {
    await tick();
    const sel =
      vue === 'versets'
        ? `[data-testid="texte-coran"] [data-aya="${a}"]`
        : `[data-testid="mushaf-livre"] [data-aya="${s}:${a}"]`;
    document.querySelector(sel)?.scrollIntoView({ block: 'center' });
    document.querySelector(`[data-trad="${s}:${a}"]`)?.scrollIntoView({ block: 'nearest' });
  }
  /**
   * NAVIGATION (règle du client, 07/10/2026) — à CHAQUE changement d'emplacement fait par l'utilisateur (flèche,
   * glissement, clavier, recherche, « Aller à » une sourate, un juzʾ, un ḥizb, une page) :
   *  1. le premier verset de la destination (ou la basmala si une sourate y commence) est SÉLECTIONNÉ ;
   *  2. une petite proposition « Écouter ici » apparaît en bas (non bloquante, disparaît d'elle-même ≈ 6 s ou au
   *     premier geste ailleurs ; une seule, mise à jour quand on feuillette vite) ;
   *  3. une lecture EN COURS se met en pause : « Écouter ici » / « Reprendre où j'étais » — rien ne repart sans
   *     geste ; réglage « En changeant de page : continuer la lecture » pour l'enchaînement automatique.
   * Quand c'est l'audio qui avance, la page suit la récitation (onaya), sans passer par ici.
   */
  const turn = (dir: 1 | -1) => {
    if (vue === 'versets') {
      const s = Math.max(1, Math.min(114, activeSura + dir));
      if (s !== activeSura) void navigate(() => goVerse(s, 1), 'debut');
      return;
    }
    void navigate(() => goPage(stepPage(p, dir, double)), 'debut');
  };

  /** Premier verset affiché (page : début de la page ; vue versets : début de la sourate). */
  function firstShown(): { s: number; a: number } {
    if (vue === 'versets')
      return cur?.s === activeSura ? { s: cur.s, a: Math.max(1, cur.a) } : { s: activeSura, a: 1 };
    const st = starts?.[p - 1];
    return st ? { s: st[0], a: st[1] } : { s: activeSura, a: posA };
  }
  /** Plage écoutée à partir d'un verset (portée du préréglage en cours : suite, sourate ou verset). */
  function rangeAt(s: number, a: number): Range {
    const pr = PRESETS.find((x) => x.id === preset);
    return presetRange(pr?.portee ?? 'suite', s, Math.max(1, a), suraLen(s));
  }
  /** La basmala est-elle affichée en tête de cette sourate (texte Ḥafṣ, hors al-Fātiḥa et at-Tawba) ? */
  const basmalaShown = (s: number) => !isRw && s !== 1 && s !== 9;

  /** proposition « Écouter ici » (et « Reprendre où j'étais » si la lecture a été mise en pause) */
  let prop = $state<{ s: number; a: number; resume: boolean } | null>(null);
  /** verset écouté au moment de la pause (« Reprendre où j'étais ») */
  let resumeAt: { s: number; a: number } | null = null;
  let propTimer: ReturnType<typeof setTimeout> | null = null;
  let propEl = $state<HTMLElement | undefined>();
  function hideProp() {
    if (propTimer) clearTimeout(propTimer);
    propTimer = null;
    prop = null;
  }
  /** Change d'emplacement ; `to` = « debut » (premier verset affiché) ou le verset visé. */
  async function navigate(go: () => Promise<void>, to: 'debut' | { s: number; a: number }) {
    const wasPlaying = audioPlaying;
    if (wasPlaying && !prefs.navAuto) {
      // pause AVANT de changer de page (sinon la page suivrait encore l'audio)
      resumeAt = heard ? { ...heard } : { s: range.s, a: range.from };
      player?.pause();
      heard = null;
    }
    await go();
    const f = to === 'debut' ? firstShown() : to;
    const sel = f.a === 1 && basmalaShown(f.s) ? { s: f.s, a: 0 } : { s: f.s, a: f.a };
    cur = sel;
    if (wasPlaying && prefs.navAuto) {
      hideProp();
      void playFrom(rangeAt(f.s, f.a));
      return;
    }
    // reprise possible tant que la lecture est en pause (même après plusieurs pages feuilletées)
    if (!wasPlaying && !(playing && !audioPlaying)) resumeAt = null;
    prop = { s: sel.s, a: sel.a, resume: !!resumeAt };
    if (propTimer) clearTimeout(propTimer);
    propTimer = setTimeout(hideProp, 6000);
  }
  async function jumpVerse(s: number, a: number) {
    await navigate(() => goVerse(s, a), { s, a });
  }
  async function jumpPage(n: number) {
    await navigate(() => goPage(n), 'debut');
  }
  function listenHere() {
    const x = prop;
    hideProp();
    resumeAt = null;
    if (x) void playFrom(rangeAt(x.s, x.a));
  }
  async function resumeWhere() {
    const w = resumeAt;
    hideProp();
    resumeAt = null;
    if (!w) return;
    await goVerse(w.s, Math.max(1, w.a), false);
    if (w.a === 0) cur = { s: w.s, a: 0 };
    await player?.resume();
  }
  // premier geste ailleurs : la proposition disparaît
  $effect(() => {
    if (!prop) return;
    const off = (e: PointerEvent) => {
      if (propEl && !propEl.contains(e.target as Node)) hideProp();
    };
    window.addEventListener('pointerdown', off, true);
    return () => window.removeEventListener('pointerdown', off, true);
  });
  onDestroy(() => propTimer && clearTimeout(propTimer));
  /** Fin de la file : la lecture simple continue à la sourate suivante (basmala comprise). */
  function onEnd(why: 'fin' | 'sommeil') {
    if (why !== 'fin' || memo) return;
    const next = nextSuraRange(range, suraLen(range.s), settings, suraLen);
    if (next) void playFrom(next);
  }

  // —— appui long sur un verset (ou la basmala) : lecture immédiate depuis ce verset, sans menu ——
  let longTimer: ReturnType<typeof setTimeout> | null = null;
  let longFired = false;
  let longAt: { x: number; y: number } | null = null;
  function refOf(target: EventTarget | null): { s: number; a: number } | null {
    const el = (target as Element | null)?.closest?.('[data-aya], [data-bsm]');
    if (!el || !el.closest('[data-testid="mushaf-livre"], [data-testid="texte-coran"]'))
      return null;
    const b = el.getAttribute('data-bsm');
    if (b) return { s: Number(b), a: 0 };
    const k = el.getAttribute('data-aya') ?? '';
    if (k.includes(':')) {
      const [s, a] = k.split(':').map(Number);
      return s && a ? { s, a } : null;
    }
    return Number(k) ? { s: activeSura, a: Number(k) } : null;
  }
  function longCancel() {
    if (longTimer) clearTimeout(longTimer);
    longTimer = null;
    longAt = null;
  }
  function longDown(e: PointerEvent) {
    longCancel();
    longFired = false;
    if (prefs.readOnly || guiding || !reciter || (e.pointerType === 'mouse' && e.button !== 0))
      return;
    const r = refOf(e.target);
    if (!r) return;
    longAt = { x: e.clientX, y: e.clientY };
    longTimer = setTimeout(() => {
      longTimer = null;
      longFired = true;
      navigator.vibrate?.(15);
      cur = { s: r.s, a: r.a };
      void playFrom({ s: r.s, from: Math.max(1, r.a), to: suraLen(r.s) });
    }, 550);
  }
  function longMove(e: PointerEvent) {
    if (longAt && Math.hypot(e.clientX - longAt.x, e.clientY - longAt.y) > 10) longCancel();
  }
  /** après un appui long, le clic qui suit n'ouvre pas le menu */
  function longClick(e: MouseEvent) {
    if (!longFired) return;
    longFired = false;
    e.stopPropagation();
    e.preventDefault();
  }

  /**
   * Pistes en cours de chargement : une lecture lancée vers une AUTRE sourate (enchaînement, « Écouter ici »)
   * demande les pistes, et l'effet « sourate écoutée » aussi. Sans ce partage, la seconde réponse remplaçait
   * `pack` pendant la basmala et le lecteur s'arrêtait (file changée).
   */
  let tracksLoading: { key: string; p: Promise<void> } | null = null;
  async function openTracks() {
    const s = range.s;
    const id = reciterId;
    if (!id) {
      pack = null;
      trackCode = null;
      return;
    }
    if (pack?.sura === s && pack.reciter === id) return;
    const mode = memo ? 'memoriser' : 'ecouter';
    const key = `${id}:${s}:${mode}`;
    if (tracksLoading?.key === key) return tracksLoading.p;
    const p = (async () => {
      pack = null;
      trackCode = null;
      saved = false;
      const r = await loadTracks(profileId, id, s, mode);
      if (s !== range.s || id !== reciterId) return;
      pack = r.pack;
      trackCode = r.code;
      saved =
        !!pack &&
        (await savedSuras(pack.reciter)).some((x) => x.sura === s && x.hash === pack!.hash);
    })();
    tracksLoading = { key, p };
    try {
      await p;
    } finally {
      if (tracksLoading?.p === p) tracksLoading = null;
    }
  }

  /**
   * Basmala du récitateur : le fichier du verset 1 d'al-Fātiḥa, SEULEMENT dans une riwāya où la basmala est ce
   * verset (Ḥafṣ, Shuʿba, al-Bazzī) — même récitateur, donc même riwāya (A8). Ailleurs : aucun fichier.
   */
  async function loadBasmala() {
    const r = reciter;
    if (!r || bsm?.reciter === r.id) return;
    let url: string | null = null;
    if (basmalaInFatiha(r.riwaya)) {
      const p1 =
        pack?.sura === 1 && pack.reciter === r.id
          ? pack
          : (await loadTracks(profileId, r.id, 1, memo ? 'memoriser' : 'ecouter')).pack;
      url = p1 && p1.mode !== 'sourate' ? (p1.files.find((f) => f.aya === 1)?.url ?? null) : null;
    }
    if (reciter?.id === r.id) bsm = { reciter: r.id, url };
  }

  /** Lecture sur un geste : plage donnée (ou plage en cours), mini-barre montrée. */
  async function playFrom(r: Range | null) {
    regOpen = false;
    notice = '';
    hideProp();
    resumeAt = null;
    // garde : jamais un récitateur d'une autre riwāya que le texte affiché (autre numérotation des versets)
    if (!reciter || reciter.riwaya !== rw) {
      void openReg('recitateur');
      return;
    }
    if (r) range = clampRange(r, suraLen(r.s));
    audioOn = true;
    await Promise.all([openTracks(), loadBasmala()]);
    await tick();
    if (!pack) {
      void openReg('recitateur');
      return;
    }
    // découpage différent du texte (sourate entière) : on le dit, la file est la sourate entière
    if (!highlight && pack.mode !== 'sourate') notice = t('cl.avis_sourate_entiere');
    await player?.start();
  }
  /** « Répéter ce verset » (menu du verset, tuile des enfants) : le verset seul, en boucle. */
  function repeat(s: number, a: number) {
    Object.assign(prefs, PRESETS.find((x) => x.id === 'repeter')!.set);
    void playFrom({ s, from: a, to: a });
  }
  function onaya(a: number | null) {
    if (a === null || !highlight) {
      heard = null;
      return;
    }
    // basmala : a = 0 (surlignée en tête de sourate, sur la page du verset 1)
    heard = { s: range.s, a: a === BASMALA ? 0 : a };
    // pendant que l'audio avance de lui-même, la vue suit la récitation (sans changer la plage écoutée)
    if (vue === 'versets' && range.s !== activeSura) {
      cur = { s: range.s, a: Math.max(1, heard.a) };
      void ensure();
    }
    if (vue === 'page' && starts) {
      const n = pageOf(starts, range.s, Math.max(1, heard.a));
      if (!shown.includes(n)) {
        p = clampPage(n);
        setUrl();
        void ensure();
      }
    }
  }

  function pick(s: number, a: number, el: HTMLElement) {
    // appui long : la lecture a déjà commencé, pas de menu
    if (longFired) {
      longFired = false;
      return;
    }
    // GESTE (11/10/2026) : sur la page, au doigt, le menu du verset s'ouvre après ≈ 0,3 s — le temps de savoir
    // si c'est un DOUBLE-toucher (zoom) ; à la souris et au clavier, tout de suite (comme avant)
    if (vue === 'page' && touchNow()) {
      if (pickTimer) clearTimeout(pickTimer);
      pickTimer = null;
      if (doubleNow()) {
        zoomToggleAt(downs[1]!.x, downs[1]!.y);
        return;
      }
      pickTimer = setTimeout(() => {
        pickTimer = null;
        openPick(s, a, el);
      }, 320);
      return;
    }
    openPick(s, a, el);
  }
  function openPick(s: number, a: number, el: HTMLElement) {
    cur = { s, a };
    follow();
    menuAnchor = el;
    menuAt = { s, a };
    if (!ecritureRefs && profileId) void loadEcriture();
  }
  async function loadEcriture() {
    const pid = profileId;
    if (!pid) return;
    // F5 : nouvelles tentatives ; sans le module, le menu du verset reste complet (lien d'écriture en moins)
    const m = await chargerModule(() => import('$lib/parcours/parcours')).catch(() => null);
    if (!m) return;
    const r = await m.ecriture(pid).catch(() => null);
    ecritureRefs = new Set(
      r?.ok && r.data?.coran.visible ? r.data.coran.versets.map((v) => v.ref) : [],
    );
  }
  function reveal(s: number, a: number) {
    const k = `${s}:${a}`;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- copie remplacée en entier (réactive par $state)
    const next = new Set(revealed);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    revealed = next;
  }

  async function onsearch(q: string): Promise<Array<{ s: number; a: number }> | null> {
    const ref = parseRef(q, lengths);
    if (ref) {
      if (ref.kind === 'verse') await jumpVerse(ref.s, ref.a);
      else if (ref.kind === 'page') await jumpPage(ref.p);
      else if (ref.kind === 'sura') await jumpVerse(ref.s, 1);
      else await jumpPage(pageOfJ(ref.j));
      return null;
    }
    // texte arabe : recherche dans les sourates déjà ouvertes sur l'appareil (muṣḥaf affiché)
    const all: Verse[] = isRw
      ? Object.values(rwTexts).flatMap((d) =>
          d ? [...d.verses.values()].map((v) => ({ s: d.s, a: v.a, text: v.text })) : [],
        )
      : Object.entries(texts).flatMap(([s, m]) =>
          Object.entries(m).map(([a, text]) => ({ s: Number(s), a: Number(a), text })),
        );
    all.sort((x, y) => x.s - y.s || x.a - y.a);
    return searchVerses(all, q);
  }

  /**
   * GESTES SUR LA PAGE (décision du client, 11/10/2026) — page entière (1×) : glisser à l'horizontale tourne la
   * page ; pincer zoome (1× à 3×) ; double-toucher bascule page entière ↔ zoom confortable (≈ 1,8×). Zoomée :
   * glisser DÉPLACE la page (jamais de changement de page involontaire). Le zoom est une simple mise à l'échelle
   * (transformation CSS) : le rendu du texte coranique n'est pas modifié. Zoom gardé (réglage de l'appareil) et
   * conservé en tournant la page.
   * TOUCHER SIMPLE : sur un VERSET → son menu (au doigt, après ≈ 0,3 s pour reconnaître un double-toucher) ;
   * ailleurs sur la page → bords latéraux (≈ 18 %) : page suivante (gauche) ou précédente (droite), milieu :
   * montrer / cacher les commandes. Appui long sur un verset : écoute immédiate (inchangé).
   */
  let bookEl = $state<HTMLElement | undefined>();
  let vz = $state<Vue>({ z: 1, x: 0, y: 0 });
  const zoomed = $derived(vue === 'page' && vz.z > ZOOM_MIN + 0.01);
  /** derniers appuis (doigt ou souris) : reconnaît le double-toucher */
  let downs: Array<{ t: number; x: number; y: number; touch: boolean }> = [];
  let pickTimer: ReturnType<typeof setTimeout> | null = null;
  let tapTimer: ReturnType<typeof setTimeout> | null = null;
  const touchNow = () => !!downs[1]?.touch;
  const doubleNow = () =>
    !!downs[0]?.touch && !!downs[1]?.touch && isDoubleTap(downs[0], downs[1]!);
  function frame() {
    return { w: bookEl?.clientWidth || 1, h: bookEl?.clientHeight || 1 };
  }
  /** Zoom et position ; `keep` : gardé dans les réglages (fin du geste). */
  function setVue(v: Vue, keep = true) {
    const f = frame();
    vz = clampVue(v, f.w, f.h);
    if (keep) prefs.zoom = vz.z;
  }
  /** Position de départ d'une page zoomée : en haut, à DROITE (début de la ligne arabe). */
  function vueStart(z: number): Vue {
    const f = frame();
    return clampVue({ z, x: f.w - f.w * z, y: 0 }, f.w, f.h);
  }
  function zoomToggleAt(cx: number, cy: number) {
    const r = bookEl?.getBoundingClientRect();
    if (!r || vue !== 'page') return;
    const f = frame();
    setVue(toggleZoom(vz, cx - r.left, cy - r.top, f.w, f.h));
  }
  function zoomBy(step: number) {
    const f = frame();
    setVue(zoomAt(vz, vz.z + step, f.w / 2, f.h / 2, f.w, f.h));
  }
  // zoom changé dans les réglages (curseur) : appliqué au centre de la page
  $effect(() => {
    const z = prefs.zoom;
    untrack(() => {
      if (Math.abs(z - vz.z) < 0.01) return;
      const f = frame();
      vz = z <= ZOOM_MIN ? { z: 1, x: 0, y: 0 } : zoomAt(vz, z, f.w / 2, f.h / 2, f.w, f.h);
    });
  });
  // nouvelle page : même zoom, en haut à droite ; page entière si la vue est en versets
  $effect(() => {
    void [p, vue, bookEl];
    untrack(() => {
      vz = vue === 'page' && bookEl ? vueStart(prefs.zoom) : { z: 1, x: 0, y: 0 };
    });
  });

  let g: {
    kind: 'un' | 'pince' | 'deplace' | 'souris';
    x0: number;
    y0: number;
    v0: Vue;
    d0: number;
    cx: number;
    cy: number;
  } | null = null;
  $effect(() => {
    const el = bookEl;
    if (!el) return;
    el.addEventListener('touchstart', tstart, { passive: true });
    el.addEventListener('touchmove', tmove, { passive: false });
    el.addEventListener('touchend', tend, { passive: true });
    el.addEventListener('touchcancel', tend, { passive: true });
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('touchstart', tstart);
      el.removeEventListener('touchmove', tmove);
      el.removeEventListener('touchend', tend);
      el.removeEventListener('touchcancel', tend);
      el.removeEventListener('wheel', wheel);
    };
  });
  const mid = (a: Touch, b: Touch) => ({
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
    d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1,
  });
  function tstart(e: TouchEvent) {
    const r = bookEl?.getBoundingClientRect();
    if (!r) return;
    if (e.touches.length >= 2 && vue === 'page') {
      longCancel();
      if (pickTimer) clearTimeout(pickTimer);
      pickTimer = null;
      const m = mid(e.touches[0]!, e.touches[1]!);
      g = {
        kind: 'pince',
        x0: m.x,
        y0: m.y,
        v0: { ...vz },
        d0: m.d,
        cx: m.x - r.left,
        cy: m.y - r.top,
      };
      return;
    }
    if (g?.kind === 'pince') return;
    const t0 = e.touches[0];
    if (!t0) return;
    g = {
      kind: zoomed ? 'deplace' : 'un',
      x0: t0.clientX,
      y0: t0.clientY,
      v0: { ...vz },
      d0: 1,
      cx: 0,
      cy: 0,
    };
  }
  function tmove(e: TouchEvent) {
    if (!g) return;
    if (g.kind === 'pince' && e.touches.length >= 2) {
      e.preventDefault();
      const r = bookEl!.getBoundingClientRect();
      const m = mid(e.touches[0]!, e.touches[1]!);
      const f = frame();
      const v = zoomAt(g.v0, (g.v0.z * m.d) / g.d0, g.cx, g.cy, f.w, f.h);
      setVue({ ...v, x: v.x + (m.x - r.left - g.cx), y: v.y + (m.y - r.top - g.cy) }, false);
    } else if (g.kind === 'deplace' && e.touches.length === 1) {
      e.preventDefault();
      const t1 = e.touches[0]!;
      if (Math.hypot(t1.clientX - g.x0, t1.clientY - g.y0) > 10) longCancel();
      setVue({ z: g.v0.z, x: g.v0.x + t1.clientX - g.x0, y: g.v0.y + t1.clientY - g.y0 }, false);
    }
  }
  function tend(e: TouchEvent) {
    if (!g) return;
    if (g.kind === 'pince') {
      // pincement fini quand tous les doigts sont levés (jamais un « glisser » au lever du premier doigt)
      if (e.touches.length) return;
      g = null;
      setVue(vz.z <= ZOOM_MIN + 0.05 ? { z: 1, x: 0, y: 0 } : vz);
      return;
    }
    const kind = g.kind;
    const p1 = e.changedTouches[0];
    const x0 = g.x0;
    const y0 = g.y0;
    g = null;
    if (kind === 'deplace') {
      prefs.zoom = vz.z;
      return;
    }
    if (!p1 || zoomed) return;
    const st = swipeStep(p1.clientX - x0, p1.clientY - y0);
    if (st) turn(st);
  }
  /** Ctrl + molette (ou pincement du pavé tactile) : zoom autour du pointeur. */
  function wheel(e: WheelEvent) {
    if (!e.ctrlKey || vue !== 'page') return;
    e.preventDefault();
    const r = bookEl!.getBoundingClientRect();
    const f = frame();
    setVue(
      zoomAt(
        vz,
        vz.z * (e.deltaY < 0 ? 1.1 : 1 / 1.1),
        e.clientX - r.left,
        e.clientY - r.top,
        f.w,
        f.h,
      ),
    );
  }
  /** Souris : glisser la page zoomée pour la déplacer. */
  function mouseDown(e: PointerEvent) {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !zoomed) return;
    g = { kind: 'souris', x0: e.clientX, y0: e.clientY, v0: { ...vz }, d0: 1, cx: 0, cy: 0 };
  }
  function mouseMove(e: PointerEvent) {
    if (g?.kind !== 'souris' || !(e.buttons & 1)) return;
    setVue({ z: g.v0.z, x: g.v0.x + e.clientX - g.x0, y: g.v0.y + e.clientY - g.y0 }, false);
  }
  function mouseUp() {
    if (g?.kind !== 'souris') return;
    g = null;
    prefs.zoom = vz.z;
  }
  /** Toucher (ou clic) hors d'un verset et hors des commandes : bords = tourner, milieu = commandes. */
  function onTap(e: MouseEvent) {
    const el = e.target as Element | null;
    if (
      !el ||
      el.closest(
        'button, a, input, select, textarea, label, summary, details, dialog, [data-aya], [data-bsm], [data-exact-verse], .cbar, .prop-zone, .pastille, .avis',
      )
    )
      return;
    if (tapTimer) clearTimeout(tapTimer);
    tapTimer = null;
    const inBook = vue === 'page' && !!bookEl?.contains(el);
    if (inBook && doubleNow()) {
      zoomToggleAt(e.clientX, e.clientY);
      return;
    }
    const x = e.clientX;
    const act = () => {
      tapTimer = null;
      if (inBook && bookEl) {
        const r = bookEl.getBoundingClientRect();
        const zone = tapZone(x - r.left, r.width, zoomed);
        if (zone === 'suivante') return turn(1);
        if (zone === 'precedente') return turn(-1);
      }
      toggleChrome();
    };
    // au doigt, sur la page : on attend ≈ 0,3 s qu'un second toucher fasse un double-toucher (zoom)
    if (inBook && touchNow()) tapTimer = setTimeout(act, 320);
    else act();
  }
  function onDbl(e: MouseEvent) {
    // souris : double-clic = zoom (au doigt, le double-toucher est reconnu par `onTap` et `pick`)
    if (touchNow() || vue !== 'page') return;
    zoomToggleAt(e.clientX, e.clientY);
  }
  onDestroy(() => {
    if (pickTimer) clearTimeout(pickTimer);
    if (tapTimer) clearTimeout(tapTimer);
  });

  /**
   * LECTURE ÉPURÉE (décision du client, 11/10/2026 ; PAR DÉFAUT pour tous, adultes et enfants) — l'en-tête, la
   * barre du lecteur (puce, Traduction, Réglages, audio), les flèches et la barre d'onglets du bas s'effacent
   * après 3 s sans geste ; un toucher au milieu de la page les montre (et les recache). Ils restent dans l'ordre
   * du clavier et lus par les lecteurs d'écran : un focus sur l'un d'eux (ou le bouton « Afficher les
   * commandes ») les montre. Au doigt, cachés, ils ne captent plus les touchers (le texte dessous reste
   * touchable). Pendant l'écoute, une pastille discrète (pause/lecture + verset) remplace la barre audio.
   */
  let chrome = $state(true);
  let chromeTimer: ReturnType<typeof setTimeout> | null = null;
  /** « Lire » : à la fermeture du panneau, les commandes s'effacent tout de suite */
  let quiet = false;
  const sheetOpen = $derived(selOpen || regOpen || tradSheet || infoOpen || !!menuAt);
  const hidden = $derived.by(() => prefs.epure && ready && !chrome && !sheetOpen && !guiding);
  const CHROME = '.cbar, header.top, nav.tabs, .turn, .montrer';
  function chromeHeld(): boolean {
    const a = document.activeElement;
    // survol : seulement avec une vraie souris (au doigt, :hover reste collé après un toucher)
    // focus du CLAVIER seulement (après un toucher ou un clic, le bouton garde le focus sans le montrer)
    return (
      (!!a?.closest?.(CHROME) && a.matches(':focus-visible')) ||
      (window.matchMedia('(hover: hover)').matches &&
        !!document.querySelector('.cbar:hover, header.top:hover, nav.tabs:hover, .turn:hover'))
    );
  }
  function armChrome() {
    if (chromeTimer) clearTimeout(chromeTimer);
    chromeTimer = null;
    if (!prefs.epure) return;
    chromeTimer = setTimeout(() => {
      chromeTimer = null;
      if (chromeHeld() || sheetOpen) armChrome();
      else chrome = false;
    }, 3000);
  }
  function showChrome() {
    chrome = true;
    armChrome();
  }
  function toggleChrome() {
    if (hidden) showChrome();
    else if (prefs.epure) {
      if (chromeTimer) clearTimeout(chromeTimer);
      chromeTimer = null;
      chrome = false;
    }
  }
  // prêt, feuille refermée, réglage changé : les commandes restent 3 s puis s'effacent
  $effect(() => {
    void [ready, sheetOpen, prefs.epure];
    untrack(() => {
      if (!prefs.epure) {
        chrome = true;
        if (chromeTimer) clearTimeout(chromeTimer);
        chromeTimer = null;
      } else if (ready && !sheetOpen) {
        if (quiet) chrome = false;
        else showChrome();
      }
      quiet = false;
    });
  });
  $effect(() => {
    const h = document.documentElement;
    if (hidden) h.dataset.epure = '';
    else delete h.dataset.epure;
  });
  // première fois que les commandes s'effacent (vue page, en haut de l'écran) : la page vient en haut
  let scrolled = false;
  $effect(() => {
    if (!hidden || scrolled || vue !== 'page') return;
    scrolled = true;
    untrack(() => {
      if (window.scrollY > 8 || !bookEl) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const top = bookEl.getBoundingClientRect().top + window.scrollY - 8;
      window.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' });
    });
  });
  onMount(() => {
    const h = document.documentElement;
    h.dataset.lecteur = '';
    const down = (e: PointerEvent) => {
      const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
      if (touch) h.dataset.lecteurTactile = '';
      downs = [
        downs[1] ?? { t: -1e9, x: 0, y: 0, touch: false },
        {
          t: e.timeStamp,
          x: e.clientX,
          y: e.clientY,
          touch,
        },
      ];
      if ((e.target as Element | null)?.closest?.(CHROME)) showChrome();
    };
    const move = (e: PointerEvent) => {
      // souris : la bouger montre les commandes (comme un lecteur vidéo)
      // (sauf sur la pastille d'écoute : elle reste sous le pointeur jusqu'au clic)
      if (
        e.pointerType === 'mouse' &&
        (hidden || chromeTimer) &&
        !(e.target as Element | null)?.closest?.('.pastille')
      )
        showChrome();
    };
    const focus = (e: FocusEvent) => {
      if ((e.target as Element | null)?.closest?.(CHROME)) showChrome();
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('focusin', focus);
    // l'écran ne s'éteint pas pendant la lecture ou l'écoute (refusé ou absent : sans effet)
    const vis = () => {
      if (document.visibilityState === 'visible') void holdWake();
    };
    void holdWake();
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('focusin', focus);
      document.removeEventListener('visibilitychange', vis);
      if (chromeTimer) clearTimeout(chromeTimer);
      delete h.dataset.lecteur;
      delete h.dataset.epure;
      delete h.dataset.lecteurTactile;
      void wake?.release().catch(() => {});
      wake = null;
    };
  });
  /**
   * Ancrage de la barre audio (téléphone) : MESURÉ — juste au-dessus de la barre d'onglets (sa hauteur réelle,
   * enfant ou adulte, marge de sécurité comprise) ; la proposition « Écouter ici » et l'espace de fin au-dessus
   * de la barre audio (sa hauteur réelle, une ou deux lignes).
   */
  let tabsH = $state(76);
  let ecouteH = $state(0);
  let ecouteEl = $state<HTMLElement | undefined>();
  $effect(() => {
    const tabs = document.querySelector<HTMLElement>('nav.tabs');
    const el = ecouteEl;
    const ro = new ResizeObserver(() => {
      const fixed = tabs && getComputedStyle(tabs).position === 'fixed';
      tabsH = fixed ? Math.ceil(tabs.getBoundingClientRect().height) : 0;
      ecouteH = el && audioOn ? Math.ceil(el.getBoundingClientRect().height) : 0;
    });
    if (tabs) ro.observe(tabs);
    if (el) ro.observe(el);
    void audioOn;
    return () => ro.disconnect();
  });
  type Sentinel = { release(): Promise<void>; addEventListener(t: 'release', f: () => void): void };
  let wake: Sentinel | null = null;
  async function holdWake() {
    const wl = (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<Sentinel> } })
      .wakeLock;
    if (!wl || wake || document.visibilityState !== 'visible') return;
    try {
      const s = await wl.request('screen');
      wake = s;
      s.addEventListener('release', () => {
        if (wake === s) wake = null;
      });
    } catch {
      wake = null;
    }
  }
  /** pastille (écoute, commandes cachées) : verset entendu */
  const pastille = $derived(
    heard && heard.a === 0
      ? t('cl.pastille_basmala')
      : t('cl.pastille', { n: fmtNumber(heard?.a ?? range.from) }),
  );
  function pastilleToggle() {
    if (audioPlaying) player?.pause();
    else void player?.resume();
  }

  function keys(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement | null)?.tagName ?? '';
    if (/INPUT|SELECT|TEXTAREA/.test(tag) || document.querySelector('dialog[open]')) return;
    // livre arabe : la flèche gauche avance
    if (e.key === 'ArrowLeft') turn(1);
    else if (e.key === 'ArrowRight') turn(-1);
    else if (vue === 'page' && (e.key === '+' || e.key === '=')) zoomBy(0.5);
    else if (vue === 'page' && e.key === '-') zoomBy(-0.5);
    else if (vue === 'page' && e.key === '0') setVue({ z: 1, x: 0, y: 0 });
  }

  /** Prépare le muṣḥaf choisi (index et police de la riwāya, à la demande). Faux si indisponible. */
  async function openRiwaya(): Promise<boolean> {
    rwError = false;
    rwTexts = {};
    if (rw === HAFS) {
      rwIndex = null;
      return true;
    }
    const key = rw;
    rwFont = 'attente';
    void ensureRiwayaFont(key).then((ok) => {
      if (key === rw) rwFont = ok ? 'ok' : 'erreur';
    });
    const idx = await loadRiwayaIndex(key);
    if (key !== rw) return false;
    rwIndex = idx;
    if (!idx) rwError = true;
    return !!idx;
  }
  /**
   * Autre muṣḥaf (riwāya). Le récitateur SUIT : la numérotation des versets change d'une riwāya à l'autre
   * (p. ex. « الم » est le verset 2:1 en Ḥafṣ, pas en Qālūn) — un récitateur d'une autre riwāya lirait un autre
   * verset que celui touché. On prévient quand le récitateur change.
   */
  async function setRiwaya(m: MushafRiwaya, fromReciter = false) {
    rw = m;
    heard = null;
    revealed = new Set();
    if (!(await openRiwaya())) rw = HAFS;
    writeMushafRiwaya(rw);
    if (!fromReciter && reciters.length) {
      const id = reciterFor(reciters, rw, [reciterId, conseil]);
      if (id !== reciterId) {
        player?.stop();
        reciterId = id;
        const r = reciters.find((x) => x.id === id);
        notice = r
          ? t('cl.avis_recitateur_change', { nom: r.nameFr, riwaya: r.riwayaFr })
          : t('cl.avis_sans_recitateur', { riwaya: mushafChoice(rw).fr });
      }
    }
    // même verset (vue « versets ») ou même numéro de page dans l'autre muṣḥaf
    if (vue === 'versets' && cur) await goVerse(cur.s, Math.min(cur.a, suraLen(cur.s)));
    else {
      cur = null;
      await goPage(p);
    }
  }
  /** Choix d'un récitateur : d'une autre riwāya, le muṣḥaf passe à cette riwāya (même numérotation), prévenu. */
  async function chooseReciter(id: string) {
    const r = reciters.find((x) => x.id === id);
    if (!r) return;
    reciterId = id;
    if (r.riwaya !== rw && isMushafRiwaya(r.riwaya)) {
      await setRiwaya(r.riwaya, true);
      notice = t('cl.avis_mushaf_change', { riwaya: r.riwayaFr, nom: r.nameFr });
    }
  }
  /** Ouvre le panneau « Réglages » (à une section donnée). */
  async function openReg(section = '') {
    kid = document.documentElement.dataset.public === 'enfant';
    // enfant : les tuiles d'abord ; une section précise (récitateur, mémoriser…) ouvre « tous les réglages »
    kidAll = !!section;
    // adulte : les trois manières de lire d'abord, « Avancé » replié (ouvert pour une section précise)
    avOpen = !!section;
    regOpen = true;
    if (!section) return;
    await tick();
    document.getElementById(`reg-${section}`)?.scrollIntoView({ block: 'start' });
  }
  /** Mémoriser : masquer peu à peu (texte de Ḥafṣ, récitateurs en Ḥafṣ ; portion du carnet proposée). */
  async function setMemo(level: number, fromCarnet = false) {
    prefs.memo = Math.max(0, Math.min(3, level));
    revealed = new Set();
    if (prefs.memo > 0) {
      if (rw !== HAFS) await setRiwaya(HAFS);
      if (reciter && !canMemorize(reciter)) reciterId = reciters[0]?.id ?? null;
      if (profileId && !portion) {
        const today = await hifzToday(profileId).catch(() => null);
        const pr = portionRange(today?.nouveau ?? null);
        portion = pr ? { s: pr.s, from: pr.from, to: pr.to } : null;
      }
      if (fromCarnet) {
        prefs.chain = true;
        if (portion) await usePortion();
      }
    }
  }
  async function usePortion() {
    if (!portion) return;
    await goVerse(portion.s, portion.from, false);
    range = clampRange(portion, suraLen(portion.s));
  }
  /** « Avancé » du panneau Réglages (adulte) */
  let avOpen = $state(false);
  /** Préréglage « Lire » : texte seul, sans audio ni masquage, commandes effacées. */
  async function modeLire() {
    quiet = prefs.epure;
    regOpen = false;
    player?.stop();
    audioOn = false;
    if (prefs.memo > 0) await setMemo(0);
    chrome = false;
  }
  /** Préréglage « Mémoriser » : masquage progressif et écoute « écouter, répéter, enchaîner ». */
  async function modeMemoriser() {
    applyPreset('memoriser');
    await setMemo(Math.max(1, prefs.memo));
    avOpen = true;
    await tick();
    document.getElementById('reg-memoriser')?.scrollIntoView({ block: 'start' });
  }
  function applyPreset(id: PresetId) {
    const pr = PRESETS.find((x) => x.id === id)!;
    Object.assign(prefs, pr.set);
    range = presetRange(pr.portee, activeSura, posA, suraLen(activeSura));
  }
  function toggleTrad() {
    if (isRw) return;
    if (narrow && vue === 'page') {
      tradSheet = true;
      return;
    }
    prefs.showTrad = !prefs.showTrad;
  }
  async function keep() {
    if (!pack) return;
    offMsg = '';
    if (wifi && connectionType() === null) offMsg = t('ca.wifi_inconnu');
    progress = { n: 0, total: pack.files.length };
    const r = await saveSura(pack, (n, total) => (progress = { n, total }));
    progress = null;
    if (r.ok) saved = true;
    else offMsg = t(`ca.refus_${r.refus}`);
  }
  async function drop() {
    if (!pack) return;
    await removeSura(pack.reciter, pack.sura);
    saved = false;
  }
  // —— lecture guidée mot à mot SANS SON (lot C1, gardée) : ≈ 1,6 mot par seconde à la vitesse 1 ——
  let guide = $state({ repeat: 3, pause: 3 });
  let word = $state<{ a: number; w: number } | null>(null);
  let guiding = $state(false);
  let gRound = $state(0);
  let yourTurn = $state(false);
  let gTimer: ReturnType<typeof setTimeout> | null = null;
  async function guidePlay() {
    guideStop();
    regOpen = false;
    if (prefs.vue !== 'versets') {
      prefs.vue = 'versets';
      await ensure();
    }
    if (range.s !== activeSura) range = defaultRange();
    guiding = true;
    gRound = 1;
    gStep({ a: range.from, w: 0 });
  }
  function gStep(pos: { a: number; w: number }) {
    const v = suraVerses.find((x) => x.a === pos.a);
    if (!v) return guideStop();
    const n = splitBasmala(v.s, v.a, v.text, meta?.basmala ?? '').rest.split(' ').length;
    if (pos.w >= n) {
      if (pos.a < range.to) return gStep({ a: pos.a + 1, w: 0 });
      if (gRound < guide.repeat) {
        // pause « à toi » : l'élève récite seul, puis on reprend
        yourTurn = true;
        word = null;
        gTimer = setTimeout(() => {
          yourTurn = false;
          gRound++;
          gStep({ a: range.from, w: 0 });
        }, guide.pause * 1000);
        return;
      }
      return guideStop();
    }
    word = pos;
    gTimer = setTimeout(() => gStep({ a: pos.a, w: pos.w + 1 }), 620 / prefs.rate);
  }
  function guideStop() {
    if (gTimer) clearTimeout(gTimer);
    gTimer = null;
    guiding = false;
    yourTurn = false;
    word = null;
  }
  onDestroy(guideStop);

  function openSel(tab: Onglet) {
    selTab = tab;
    selOpen = true;
  }
  const ecrireHref = $derived(
    menuAt && ecritureRefs?.has(`${menuAt.s}:${menuAt.a}`) && !isRw
      ? `${resolve('/ecriture/coran')}?ref=${menuAt.s}:${menuAt.a}`
      : null,
  );
</script>

<svelte:window onkeydown={keys} />
<svelte:head><title>{t('app.nom')} — {t('lecteur.titre')}</title></svelte:head>

{#snippet credit()}
  {#if rwDef}<Bidi
      text={t('rw.credit', {
        riwaya: rwDef.fr,
        version: rwDef.version,
        police: rwDef.fontVersion,
      })}
    />{:else}<Bidi text={t('lecteur.credit')} />{/if}
{/snippet}

{#snippet tradList(list: ReadonlyArray<readonly [number, number]>)}
  {#if trad}
    <ol class="tlist">
      {#each list as r (`${r[0]}:${r[1]}`)}
        {@const tv = trads[r[0]]?.verses.get(r[1])}
        {@const on = heardOrCur?.s === r[0] && heardOrCur?.a === r[1]}
        <li data-trad={`${r[0]}:${r[1]}`} class:on aria-current={on ? 'true' : undefined}>
          <button
            type="button"
            class="tref"
            onclick={() => {
              cur = { s: r[0], a: r[1] };
              follow();
            }}
            disabled={prefs.readOnly}
            lang={localeInfo().code}
            dir={localeInfo().dir}><Bidi text={t('mp.ref', { s: r[0], a: r[1] })} /></button
          >
          {#if tv}
            <span class="ttext"><Bidi text={tv.text} /></span>
            {#if tv.notes}<details class="notes">
                <summary lang={localeInfo().code} dir={localeInfo().dir}>{t('mp.notes')}</summary>
                {#each noteLines(tv.notes) as l, i (i)}<p><Bidi text={l} /></p>{/each}
              </details>{/if}
          {:else}<span class="hint">…</span>{/if}
        </li>
      {/each}
    </ol>
    <p class="hint credit" lang={localeInfo().code} dir={localeInfo().dir}>
      <Bidi text={t('mp.credit_traduction', { titre: t(trad.label), version: trad.version })} />
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- lien externe -->
      <a href={trad.url} target="_blank" rel="noopener"><Bidi text={t('mp.lien_source')} /></a>
    </p>
  {/if}
{/snippet}

<h1 class="sr-only">{t('lecteur.titre')}</h1>

{#if noPages}
  <p class="card" role="status">{t('mp.sans_pages')}</p>
{:else}
  <!-- clavier : bouton « Afficher les commandes », flèches, + et - (le toucher de la page n'a pas d'équivalent à donner) -->
  <div
    class="lecture"
    class:audio-on={audioOn}
    class:epure={prefs.epure}
    style:--qz={TEXT_SCALE[prefs.size] ?? 1}
    style:--bas={`${tabsH}px`}
    style:--ecoute-h={`${ecouteH}px`}
    role="none"
    onpointerdown={longDown}
    onpointermove={longMove}
    onpointerup={longCancel}
    onpointercancel={longCancel}
    onclickcapture={longClick}
    onclick={onTap}
    ondblclick={onDbl}
    oncontextmenu={(e) => refOf(e.target) && e.preventDefault()}
  >
    <!-- lecture épurée : visible au focus du clavier (et pour les lecteurs d'écran), montre les commandes -->
    <button
      type="button"
      class="montrer"
      onclick={showChrome}
      aria-expanded={!hidden}
      data-testid="afficher-commandes"><Bidi text={t('cl.afficher_commandes')} /></button
    >
    <!-- barre unique : puce (téléphone) ou sélecteurs dorés (grand écran), outils, écoute -->
    <nav class="cbar" aria-label={t('mp.commandes')} data-testid="barre-coran">
      <div class="nav-zone">
        <button
          type="button"
          class="puce"
          onclick={() => openSel('sourate')}
          aria-haspopup="dialog"
          data-testid="puce"
          aria-label={chip}
          ><span class="c"
            ><span class="cs"><Bidi text={suraName(activeSura)} /></span><span class="cd"
              >{#each chipDetail.split(' · ') as part, i (i)}<span class="nw"
                  ><Bidi text={part} /></span
                >{/each}</span
            ></span
          ><Icon name="chevron" size={16} /></button
        >
        <div class="gold" role="group" aria-label={t('cl.aller_a')}>
          <button type="button" onclick={() => openSel('sourate')} data-testid="barre-sourate"
            ><small>{t('mp.sourate')}</small><Bidi
              text={`${fmtNumber(activeSura)}. ${suraName(activeSura)}`}
            /></button
          >
          <button type="button" onclick={() => openSel('sourate')} data-testid="barre-verset"
            ><small>{t('mp.verset')}</small>{fmtNumber(posA)}</button
          >
          <button type="button" onclick={() => openSel('page')} data-testid="barre-page"
            ><small>{t('mp.page')}</small>{fmtNumber(p, { useGrouping: false })}</button
          >
          <button type="button" onclick={() => openSel('juz')} data-testid="barre-juz"
            ><small>{t('mp.juz')}</small>{fmtNumber(juzOf(p))}</button
          >
        </div>
        {#if isRw}<span class="rwbadge" data-testid="mp-riwaya-affichee"
            ><RiwayaBadge riwaya={rw} label={mushafChoice(rw).fr} /></span
          >{/if}
      </div>
      <div class="tools">
        {#if !audioOn}
          <button
            type="button"
            class="tool ecouter-btn"
            onclick={() => playFrom(null)}
            disabled={!ready}
            data-testid="ouvrir-ecoute"
            ><Icon name="casque" size={22} /><span>{t('ecoute.ecouter')}</span></button
          >
        {/if}
        <!-- recherche : par la puce ou les sélecteurs dorés (même sélecteur ; plus de loupe en double) -->
        {#if !isRw}
          <button
            type="button"
            class="tool"
            aria-pressed={narrow && vue === 'page' ? tradSheet : tradShown}
            onclick={toggleTrad}
            aria-label={t('mp.traduction_court')}
            title={t('mp.traduction_court')}
            data-testid="mp-trad"
            ><Icon name="traduction" size={22} /><span class="trad-lbl"
              >{t('mp.traduction_court')}</span
            ></button
          >
        {/if}
        <!-- UN SEUL point d'entrée pour tous les réglages du lecteur : icône ET libellé, téléphone et bureau -->
        <button
          type="button"
          class="tool reg-btn"
          onclick={() => openReg()}
          aria-haspopup="dialog"
          data-testid="ouvrir-reglages-lecteur"
          ><Icon name="reglages" size={22} /><span>{t('cl.reglages')}</span></button
        >
      </div>
      <div class="ecoute" class:on={audioOn} data-testid="mini-barre" bind:this={ecouteEl}>
        {#if basmalaMissing && audioOn}<p class="hint bsm-hint" data-testid="basmala-absente">
            <Bidi text={t('cl.basmala_absente')} />
          </p>{/if}
        {#if reciter}
          <AudioPlayer
            bind:this={player}
            {reciter}
            {pack}
            {queue}
            rate={prefs.rate}
            sleepMin={prefs.sleepMin}
            volume={prefs.volume}
            status={step
              ? step.kind === 'nouveau'
                ? t('ca.etape_nouveau', { aya: fmtNumber(step.aya) })
                : t('ca.etape_enchainer', {
                    de: fmtNumber(range.from),
                    a: fmtNumber(step.learning),
                  })
              : ''}
            basmala={bsmUrl}
            {onaya}
            onindex={(i) => {
              playing = i !== null;
              step = i === null ? null : (plan.steps?.[i] ?? null);
            }}
            onplaystate={(on) => (audioPlaying = on)}
            onend={onEnd}
            onsettings={(sec) => openReg(sec ?? 'ecoute')}
            onvolume={(v) => (prefs.volume = v)}
          />
        {:else}
          <button
            type="button"
            class="tool"
            onclick={() => openReg('recitateur')}
            data-testid="sans-recitateur"
            ><Icon name="casque" size={22} /><span>{t('mp.aucun_recitateur')}</span></button
          >
        {/if}
      </div>
    </nav>
    <!-- proposition après un changement d'emplacement : non bloquante, annoncée, disparaît d'elle-même -->
    <div class="prop-zone" role="status" aria-live="polite">
      {#if prop}
        <div class="prop" bind:this={propEl} data-testid="proposition">
          <button
            type="button"
            class="prop-play"
            onclick={listenHere}
            disabled={!ready}
            data-testid="ecouter-ici"
            ><Icon name="lecture" filled size={20} /><Bidi text={t('cl.ecouter_ici')} /></button
          >
          {#if prop.resume}
            <button
              type="button"
              class="prop-alt"
              onclick={resumeWhere}
              data-testid="reprendre-lecture"><Bidi text={t('cl.reprendre_lecture')} /></button
            >
          {/if}
          {#if prop.a > 0}
            <!-- autres actions du verset (traduction, répéter, signet…) : son menu -->
            <button
              type="button"
              class="prop-alt"
              onclick={(e) => {
                if (!prop) return;
                const at = { s: prop.s, a: prop.a };
                const el =
                  document.querySelector<HTMLElement>(
                    vue === 'versets'
                      ? `[data-testid="texte-coran"] [data-aya="${at.a}"]`
                      : `[data-testid="mushaf-livre"] [data-aya="${at.s}:${at.a}"]`,
                  ) ?? e.currentTarget;
                hideProp();
                pick(at.s, at.a, el);
              }}
              aria-label={t('cl.autres_actions')}
              title={t('cl.autres_actions')}
              data-testid="ici-actions"><Icon name="ajouter" size={20} /></button
            >
          {/if}
        </div>
      {/if}
    </div>
    {#if notice}
      <p class="avis" role="status" data-testid="avis-lecteur">
        <Icon name="info" size={18} /><span><Bidi text={notice} /></span>
      </p>
    {/if}
    {#if rwError || (isRw && rwFont === 'erreur')}<p class="hint" role="status">
        <Bidi text={rwError ? t('rw.indisponible') : t('rw.police_erreur')} />
      </p>{/if}
    {#if guiding}
      <p class="memo-line" data-testid="guidage">
        <span data-testid="tour"
          ><Bidi text={t('lecteur.tour', { n: gRound, total: guide.repeat })} /></span
        >
        {#if yourTurn}<strong role="status" data-testid="a-toi">{t('lecteur.a_toi')}</strong>{/if}
        <button type="button" class="link" onclick={guideStop} data-testid="arreter"
          >{t('lecteur.arreter')}</button
        >
      </p>
    {/if}
    {#if memo}
      <p class="memo-line" data-testid="mode-memoriser">
        <Icon name="masque" size={18} /><Bidi text={t(`ca.masque_${prefs.memo}`)} />
        <button type="button" class="link" onclick={() => openReg('memoriser')}
          >{t('cl.changer')}</button
        >
        <button
          type="button"
          class="link"
          onclick={() => setMemo(0)}
          data-testid="quitter-memoriser">{t('cl.quitter_memoriser')}</button
        >
        {#if profileId}
          <!-- A5 : l'IA écoute la récitation (interrupteur « ecoute_ia », canal bêta) -->
          <BoutonEcoute {profileId} kind={profKind} portion={range} memoriser />
        {/if}
      </p>
    {/if}
    {#if reciter && heard === null && playing && !highlight && pack?.mode !== 'sourate'}
      <p class="hint" data-testid="sans-surlignage"><Bidi text={t('ca.sans_surlignage')} /></p>
    {/if}

    {#if vue === 'page'}
      <div class="reader" class:withTrad={tradShown && !narrow} dir="ltr">
        {#if tradShown && !narrow}
          <aside
            class="trad"
            lang={trad?.lang}
            aria-label={t('mp.traduction_du_sens')}
            data-testid="mp-panneau-traduction"
          >
            <h2 lang={localeInfo().code} dir={localeInfo().dir}>
              <Icon name="traduction" size={18} /><Bidi text={t('mp.traduction_du_sens')} />
            </h2>
            {@render tradList(shownVerses)}
          </aside>
        {/if}
        <div class="stage" class:epure={prefs.epure}>
          <button
            type="button"
            class="turn next"
            onclick={() => turn(1)}
            disabled={lastPage}
            aria-label={t('mp.page_suivante')}
            title={t('mp.page_suivante')}
            data-testid="mp-suiv"><span class="back"><Icon name="fleche" size={24} /></span></button
          >
          <div
            class="book"
            class:zoomed
            dir="rtl"
            bind:this={bookEl}
            data-testid="mushaf-livre"
            data-zoom={vz.z}
            role="none"
            onpointerdown={mouseDown}
            onpointermove={mouseMove}
            onpointerup={mouseUp}
            onpointercancel={mouseUp}
          >
            <!-- zoom : simple mise à l'échelle de la page (le rendu du texte n'est pas modifié) -->
            <div
              class="zoomer"
              class:double
              data-testid="zoom-page-cadre"
              style:transform={vz.z > 1 ? `translate(${vz.x}px, ${vz.y}px) scale(${vz.z})` : null}
            >
              {#each shown as n (n)}
                <MushafPage
                  p={n}
                  segments={segs(n)}
                  {text}
                  basmala={meta?.basmala ?? ''}
                  juz={juzOf(n)}
                  riwaya={rwPage}
                  tajwid={tajwidOn ? tajwidOf : null}
                  current={heardOrCur}
                  memo={prefs.memo}
                  readOnly={prefs.readOnly}
                  {revealed}
                  compact={double}
                  exact={exactOf(n)}
                  onpick={pick}
                />
              {/each}
            </div>
          </div>
          <button
            type="button"
            class="turn prev"
            onclick={() => turn(-1)}
            disabled={p <= 1}
            aria-label={t('mp.page_precedente')}
            title={t('mp.page_precedente')}
            data-testid="mp-prec"><Icon name="fleche" size={24} /></button
          >
          <p class="pos" lang={localeInfo().code} dir={localeInfo().dir} aria-live="polite">
            <Bidi text={position} />
          </p>
        </div>
      </div>
    {:else}
      <div class="versets">
        <QuranText
          sura={activeSura}
          verses={suraVerses}
          basmala={meta?.basmala ?? ''}
          current={heard?.s === activeSura ? heard.a : null}
          selected={cur?.s === activeSura ? cur.a : null}
          from={playing && range.s === activeSura ? range.from : 0}
          to={playing && range.s === activeSura ? range.to : 0}
          mask={prefs.memo}
          {revealed}
          riwaya={isRw ? riwayaFamily(rw) : null}
          tajwid={tajwidOn ? (tajwids[activeSura] ?? null) : null}
          motifs={tjPrefs.motifs}
          trad={tradShown ? (a) => trads[activeSura]?.verses.get(a) : null}
          tradLang={trad?.lang ?? 'fr'}
          readOnly={prefs.readOnly || guiding}
          {word}
          onpick={(a, el) => pick(activeSura, a, el)}
        />
        <div class="sura-nav">
          <button type="button" class="link" onclick={() => turn(-1)} disabled={activeSura <= 1}
            >{t('cl.sourate_prec')}</button
          >
          <button
            type="button"
            class="link"
            onclick={() => turn(1)}
            disabled={activeSura >= 114}
            data-testid="sourate-suivante">{t('cl.sourate_suiv')}</button
          >
        </div>
      </div>
    {/if}
    {#if tajwidOn && tajwids[activeSura] === null}<p
        class="hint"
        role="status"
        data-testid="tajwid-absent"
      >
        {t('tj.indisponible')}
      </p>{/if}

    <!-- 11/10/2026 : crédits (texte long) derrière ⓘ ; lus en entier par les lecteurs d'écran -->
    <p class="credits" data-testid="credit-texte">
      <span class="sr-only">{@render credit()}</span>
      <button
        type="button"
        class="info"
        onclick={() => (infoOpen = true)}
        title={t('cl.infos')}
        data-testid="infos-texte"
        ><Icon name="info" size={18} /><span>{t('cl.sources')}</span></button
      >
    </p>
    {#if audioOn}<div class="spacer" aria-hidden="true"></div>{/if}
    {#if audioOn && hidden && reciter}
      <!-- écoute, commandes cachées : pastille discrète (pause/lecture + verset) ; toucher le verset ouvre tout -->
      <div class="pastille" data-testid="pastille-audio">
        <button
          type="button"
          class="pj"
          onclick={pastilleToggle}
          aria-pressed={audioPlaying}
          aria-label={audioPlaying ? t('ca.pause') : t('ca.ecouter')}
          data-testid="pastille-jouer"
          >{#if audioPlaying}<Icon name="pause" size={20} />{:else}<Icon
              name="lecture"
              filled
              size={20}
            />{/if}</button
        >
        <button
          type="button"
          class="po"
          onclick={showChrome}
          aria-label={`${pastille} — ${t('cl.pastille_ouvrir')}`}
          data-testid="pastille-ouvrir"><Bidi text={pastille} /></button
        >
      </div>
    {/if}
  </div>

  <Selecteur
    bind:open={selOpen}
    bind:tab={selTab}
    pos={{ s: activeSura, a: posA, p, juz: juzOf(p) }}
    {lengths}
    hizb={!isRw}
    onverse={(s, a) => jumpVerse(s, a)}
    onpage={jumpPage}
    onjuz={(j) => jumpPage(pageOfJ(j))}
    onhizb={(n) => {
      const st = hizbStart(meta?.divisions?.quarters, n);
      if (st) void jumpVerse(st[0], st[1]);
    }}
    {onsearch}
  />
  {#snippet tous()}
    <Reglages
      bind:prefs
      bind:tjPrefs
      bind:tjData
      bind:guide
      {reciters}
      {reciterId}
      {conseil}
      {restreint}
      {rw}
      {range}
      length={suraLen(range.s)}
      {preset}
      {pack}
      {trackMsg}
      {saved}
      {wifi}
      {progress}
      {offMsg}
      portion={memo ? portion : null}
      wide={!narrow}
      sura={activeSura}
      verses={suraVerses}
      basmala={meta?.basmala ?? ''}
      exactPages={exactCount}
      onreciter={chooseReciter}
      onpreset={applyPreset}
      onrange={(from, to) => (range = clampRange({ s: range.s, from, to }, suraLen(range.s)))}
      onkeep={keep}
      ondrop={drop}
      onwifi={(on) => {
        wifi = on;
        void setWifiOnly(on);
      }}
      onportion={usePortion}
      onriwaya={(m) => setRiwaya(m)}
      onmemo={(n) => setMemo(n)}
      onguide={guidePlay}
    />
  {/snippet}
  <Feuille id="reglages" title={t('cl.reglages')} bind:open={regOpen} testid="reglages">
    {#if kid}
      <!-- ENFANT : quatre grosses tuiles ; le reste pour le parent -->
      <div class="tuiles" data-testid="reglages-enfant">
        <button
          type="button"
          class="tuile"
          onclick={() => playFrom(null)}
          data-testid="tuile-ecouter"><Icon name="casque" size={36} />{t('cl.k_ecouter')}</button
        >
        <button
          type="button"
          class="tuile"
          onclick={() => repeat(activeSura, posA)}
          data-testid="tuile-repeter"><Icon name="repeter" size={36} />{t('cl.k_repeter')}</button
        >
        <button
          type="button"
          class="tuile"
          aria-pressed={prefs.size > 0}
          onclick={() => (prefs.size = (prefs.size + 1) % TEXT_SCALE.length)}
          data-testid="tuile-grand"
          ><Icon name="taille" size={36} /><Bidi
            text={t(prefs.size === TEXT_SCALE.length - 1 ? 'cl.k_normal' : 'cl.k_grand')}
          /></button
        >
        <button
          type="button"
          class="tuile"
          aria-pressed={prefs.memo > 0}
          onclick={() => setMemo(prefs.memo > 0 ? 0 : 2)}
          data-testid="tuile-masquer"
          ><Icon name="masque" size={36} /><Bidi
            text={t(prefs.memo > 0 ? 'cl.k_montrer' : 'cl.k_masquer')}
          /></button
        >
      </div>
      <details class="parent" bind:open={kidAll} data-testid="reglages-parent">
        <summary>{t('cl.k_parent')}</summary>
        {@render tous()}
      </details>
    {:else}
      <!-- ADULTE (11/10/2026) : trois préréglages en tête, le reste dans « Avancé » (replié) -->
      <div class="modes" data-testid="reglages-modes">
        <button
          type="button"
          class="mode"
          aria-pressed={!audioOn && !memo}
          onclick={modeLire}
          data-testid="mode-lire"><Icon name="lire" size={26} />{t('cl.mode_lire')}</button
        >
        <button
          type="button"
          class="mode"
          aria-pressed={audioOn && !memo}
          onclick={() => playFrom(null)}
          data-testid="mode-ecouter"><Icon name="casque" size={26} />{t('cl.mode_ecouter')}</button
        >
        <button
          type="button"
          class="mode"
          aria-pressed={memo}
          onclick={modeMemoriser}
          data-testid="mode-memoriser"
          ><Icon name="masque" size={26} />{t('cl.mode_memoriser')}</button
        >
      </div>
      <details class="parent" bind:open={avOpen} data-testid="reglages-avance">
        <summary>{t('cl.avance')}</summary>
        {@render tous()}
      </details>
    {/if}
  </Feuille>
  <Feuille
    id="trad-feuille"
    title={t('mp.traduction_du_sens')}
    bind:open={tradSheet}
    testid="feuille-traduction"
  >
    <div lang={trad?.lang} dir="ltr" class="trad-sheet" data-testid="mp-panneau-traduction">
      {@render tradList(shownVerses)}
    </div>
  </Feuille>
  <Feuille id="infos" title={t('cl.infos')} bind:open={infoOpen} testid="feuille-infos">
    <p class="small" data-testid="credit-feuille">{@render credit()}</p>
    <ul class="adab">
      <li>{t('ca.adab_1')}</li>
      <li>{t('ca.adab_2')}</li>
      <li>{t('ca.adab_3')}</li>
    </ul>
    <p class="small">
      <Bidi
        text={isRw
          ? t('rw.mise_en_page')
          : anyExact
            ? t('mpx.mise_en_page_exacte')
            : t('mp.mise_en_page_fluide')}
      />
    </p>
    {#if anyExact}<p class="small" data-testid="credit-exact">
        <Bidi text={t('mpx.credit')} />
      </p>{/if}
    {#if isRw}<p class="small" data-testid="mp-trad-hafs">{t('rw.traduction_hafs')}</p>{/if}
    {#if tajwidOn}<p class="small"><Bidi text={t('tj.credit')} /></p>{/if}
    <p class="small"><a href={resolve('/garanties')}>{t('pied.garanties')}</a></p>
  </Feuille>
  <MenuVerset
    bind:at={menuAt}
    anchor={menuAnchor}
    canListen={!!reciter}
    hafs={!isRw}
    {memo}
    revealed={!!menuAt && revealed.has(`${menuAt.s}:${menuAt.a}`)}
    marked={!!menuAt && isMarked(marks, menuAt.s, menuAt.a)}
    ecrire={ecrireHref}
    tradKey={prefs.translation}
    loadTrad={async (s, a) => (await loadTranslation(prefs.translation, s))?.verses.get(a) ?? null}
    onlisten={(s, a) => playFrom({ s, from: a, to: suraLen(s) })}
    onrepeat={repeat}
    onmark={(s, a) => (marks = toggleMark({ s, a, p: starts ? pageOf(starts, s, a) : p }))}
    onreveal={reveal}
  />
{/if}

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .lecture {
    color: var(--mp-ink);
  }
  /* —— barre unique —— */
  .cbar {
    position: sticky;
    top: 64px;
    z-index: 15;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    padding: 6px 8px;
    /* fond plein : pas de backdrop-filter (il ferait de la barre le repère de la mini-barre fixe) */
    background: var(--card);
    border: 1px solid var(--mp-mint2);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
  }
  .nav-zone {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1 1 auto;
  }
  .puce {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    max-width: 100%;
    min-height: 44px;
    padding: 4px 10px 4px 12px;
    font: inherit;
    font-size: 0.86rem;
    font-weight: 700;
    color: var(--or-ink);
    background: var(--or-soft);
    border: 1px solid var(--or-line);
    border-radius: var(--radius-pill);
    cursor: pointer;
  }
  .puce .c {
    display: grid;
    min-width: 0;
    text-align: start;
    line-height: 1.15;
  }
  .cs,
  .cd {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cd {
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--mp-ink2);
    /* « v. 1 · p. 604 · juzʾ 30 » toujours en entier : passe sur deux lignes plutôt que d'être coupé */
    white-space: normal;
    overflow: visible;
  }
  /* blocs insécables (« v. 1 », « p. 604 », « juzʾ 30 ») : la ligne ne se coupe qu'entre eux */
  .nw {
    display: inline-block;
    white-space: nowrap;
  }
  .nw + .nw::before {
    content: '\00a0·\00a0';
  }
  .puce :global(svg) {
    flex: none;
    transform: rotate(90deg);
  }
  .gold {
    display: none;
    gap: 6px;
  }
  .gold button {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    min-height: 48px;
    padding: 2px 12px;
    font: inherit;
    font-weight: 700;
    line-height: 1.15;
    color: var(--or-ink);
    background: var(--or-soft);
    border: 1px solid var(--or-line);
    border-radius: var(--radius-md);
    cursor: pointer;
    white-space: nowrap;
  }
  .gold small {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--mp-ink2);
  }
  .gold button:hover,
  .puce:hover {
    box-shadow: 0 0 0 2px var(--or-line);
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .tool {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 44px;
    min-height: 44px;
    padding: 0 8px;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--mp-green);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-pill);
    cursor: pointer;
  }
  .tool:hover {
    background: var(--mp-mint);
  }
  .tool[aria-pressed='true'] {
    color: var(--or-ink);
    background: var(--or-soft);
    border-color: var(--or-line);
  }
  .ecouter-btn {
    color: var(--mp-on-band);
    background: var(--mp-band);
    padding: 0 14px;
  }
  .ecouter-btn:hover {
    background: var(--mp-green);
  }
  .rwbadge {
    flex: none;
  }
  /* « Réglages » : toujours avec son libellé (téléphone et bureau) */
  .reg-btn {
    padding: 0 12px;
    color: var(--or-ink);
    background: var(--or-soft);
    border-color: var(--or-line);
  }
  .avis {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    margin: 8px 0 0;
    padding: 6px 12px;
    font-size: 0.92rem;
    color: var(--ink);
    background: var(--or-soft);
    border: 1px solid var(--or-line);
    border-radius: var(--radius-md);
  }
  .avis > span {
    flex: 1 1 200px;
  }
  /* panneau « Réglages » des enfants : quatre grosses tuiles */
  .tuiles {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin: 4px 0 14px;
  }
  .tuile {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 8px;
    min-height: 120px;
    padding: 12px 8px;
    font: inherit;
    font-size: 1.15rem;
    font-weight: 800;
    color: var(--mp-green);
    background: var(--mp-mint);
    border: 2px solid var(--mp-mint2);
    border-radius: var(--radius-lg);
    text-align: center;
  }
  .tuile[aria-pressed='true'] {
    color: var(--or-ink);
    background: var(--or-soft);
    border-color: var(--or-line);
  }
  .parent summary {
    min-height: 44px;
    display: flex;
    align-items: center;
    font-weight: 700;
    color: var(--ink2);
    cursor: pointer;
  }
  /* téléphone : la mini-barre, fixe en bas, au-dessus de la navigation, après le premier « Écouter » */
  .ecoute {
    display: none;
  }
  .ecoute.on {
    position: fixed;
    inset-inline: 8px;
    /* juste au-dessus de la barre d'onglets, hauteur mesurée (marge de sécurité de l'écran comprise) */
    bottom: calc(var(--bas, 76px) + 6px);
    z-index: 19;
    display: block;
    padding: 4px 6px;
    background: var(--card);
    border: 1px solid var(--mp-mint2);
    border-top: 2px solid var(--or-line);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-float);
  }
  .spacer {
    height: calc(var(--ecoute-h, 100px) + 12px);
  }
  .bsm-hint {
    margin: 0 4px 2px;
    font-size: 0.78rem;
  }
  /* proposition « Écouter ici » : en bas, au-dessus de la mini-barre, sans cacher le texte ni bloquer */
  .prop-zone {
    position: fixed;
    inset-inline: 0;
    bottom: calc(84px + env(safe-area-inset-bottom));
    z-index: 18;
    display: flex;
    justify-content: center;
    pointer-events: none;
  }
  .audio-on .prop-zone {
    bottom: calc(var(--bas, 76px) + var(--ecoute-h, 100px) + 14px);
  }
  .prop {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    max-width: calc(100vw - 24px);
    padding: 6px;
    background: var(--card);
    border: 1px solid var(--or-line);
    border-radius: var(--radius-pill);
    box-shadow: var(--shadow-float);
    pointer-events: auto;
    animation: prop-in var(--motion) ease-out;
  }
  @keyframes prop-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
  .prop-play,
  .prop-alt {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 14px;
    font: inherit;
    font-weight: 800;
    border-radius: var(--radius-pill);
    cursor: pointer;
  }
  .prop-play {
    color: var(--mp-on-band);
    background: var(--mp-band);
    border: 0;
  }
  .prop-alt {
    font-weight: 700;
    color: var(--or-ink);
    background: var(--or-soft);
    border: 1px solid var(--or-line);
  }
  /* enfants : proposition plus grande */
  :global([data-public='enfant']) .prop-play,
  :global([data-public='enfant']) .prop-alt {
    min-height: 56px;
    padding: 0 20px;
    font-size: 1.15rem;
  }
  @media (min-width: 900px) {
    .prop-zone,
    .audio-on .prop-zone {
      bottom: 24px;
    }
  }
  @media (min-width: 900px) {
    .lecture {
      margin-inline: calc((100% - min(1400px, 100vw - 48px)) / 2);
    }
    .cbar {
      flex-wrap: nowrap;
      top: 72px;
    }
    .puce {
      display: none;
    }
    .gold {
      display: flex;
    }
    .ecouter-btn {
      display: none;
    }
    /* grand écran : l'écoute est dans la barre, à gauche (réglages, récitateur, lecture, progression, volume) */
    .ecoute,
    .ecoute.on {
      position: static;
      order: -1;
      display: block;
      flex: 1 1 420px;
      min-width: 0;
      padding: 0;
      background: transparent;
      border: 0;
      border-inline-end: 1px solid var(--mp-mint2);
      border-radius: 0;
      box-shadow: none;
    }
    .nav-zone {
      flex: 0 1 auto;
      justify-content: flex-end;
    }
    .tools {
      padding-inline-end: 6px;
      border-inline-end: 1px solid var(--mp-mint2);
    }
    .spacer {
      display: none;
    }
  }
  .memo-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
    margin: 8px 0 0;
    font-size: 0.9rem;
    color: var(--mp-green);
  }
  .hint {
    margin: 6px 0 0;
    font-size: 0.9rem;
    color: var(--mp-ink2);
  }
  .link {
    min-height: 44px;
    padding: 0 4px;
    font: inherit;
    color: var(--mp-green);
    background: none;
    border: 0;
    text-decoration: underline;
    cursor: pointer;
  }
  .link:disabled {
    opacity: 0.4;
  }
  /* —— livre —— */
  .reader {
    display: grid;
    gap: var(--space-m);
    margin-top: var(--space-m);
  }
  .reader.withTrad {
    grid-template-columns: minmax(260px, 1fr) minmax(0, 1.5fr);
  }
  .stage {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas:
      'next book prev'
      '. pos .';
    gap: 4px 10px;
    min-width: 0;
  }
  .book {
    grid-area: book;
    min-width: 0;
    touch-action: pan-y;
  }
  /* zoomée : la page se déplace dans son cadre (aucun défilement ni changement de page au glisser) */
  .book.zoomed {
    overflow: hidden;
    touch-action: none;
    cursor: grab;
    border-radius: var(--radius-md);
  }
  .zoomer {
    display: grid;
    gap: 6px;
    min-width: 0;
    transform-origin: 0 0;
  }
  .zoomer.double {
    grid-template-columns: 1fr 1fr;
  }
  /* —— lecture épurée (11/10/2026) : commandes effacées après 3 s, gardées dans l'ordre du clavier —— */
  .montrer {
    position: fixed;
    top: 8px;
    inset-inline-start: 8px;
    z-index: 30;
    min-height: 44px;
    padding: 0 14px;
    font: inherit;
    font-weight: 700;
    color: var(--mp-on-band);
    background: var(--mp-band);
    border: 0;
    border-radius: var(--radius-pill);
    /* invisible tant qu'il n'a pas le focus du clavier */
    clip-path: inset(50%);
    width: 1px;
    height: 1px;
    overflow: hidden;
    white-space: nowrap;
  }
  .montrer:focus-visible {
    clip-path: none;
    width: auto;
    height: auto;
  }
  :global(html[data-lecteur] header.top),
  :global(html[data-lecteur] nav.tabs),
  .cbar,
  .turn {
    transition:
      opacity var(--motion) ease,
      transform var(--motion) ease;
  }
  :global(html[data-epure] header.top),
  :global(html[data-epure]) .cbar {
    opacity: 0;
    transform: translateY(-6px);
  }
  :global(html[data-epure] nav.tabs) {
    opacity: 0;
    transform: translateY(6px);
  }
  :global(html[data-epure]) .turn {
    opacity: 0;
  }
  /* au doigt, cachées, elles laissent passer les touchers vers le texte (le clavier les atteint toujours) */
  :global(html[data-epure][data-lecteur-tactile] header.top),
  :global(html[data-epure][data-lecteur-tactile] nav.tabs),
  :global(html[data-epure][data-lecteur-tactile]) .cbar,
  :global(html[data-epure][data-lecteur-tactile]) .turn {
    pointer-events: none;
  }
  @media (prefers-reduced-motion: reduce) {
    :global(html[data-lecteur] header.top),
    :global(html[data-lecteur] nav.tabs),
    .cbar,
    .turn {
      transition: none;
    }
    :global(html[data-epure] header.top),
    :global(html[data-epure] nav.tabs),
    :global(html[data-epure]) .cbar {
      transform: none;
    }
  }
  /* pastille d'écoute (commandes cachées) */
  .pastille {
    position: fixed;
    bottom: calc(14px + env(safe-area-inset-bottom));
    inset-inline-start: 50%;
    z-index: 21;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    background: var(--card);
    border: 1px solid var(--or-line);
    border-radius: var(--radius-pill);
    box-shadow: var(--shadow-float);
    transform: translateX(-50%);
  }
  :global([dir='rtl']) .pastille {
    transform: translateX(50%);
  }
  .pastille .pj {
    display: inline-grid;
    place-items: center;
    width: 44px;
    height: 44px;
    padding: 0;
    color: var(--mp-on-band);
    background: var(--mp-band);
    border: 0;
    border-radius: 50%;
  }
  .pastille .po {
    min-height: 44px;
    padding: 0 14px 0 10px;
    font: inherit;
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--mp-green);
    background: transparent;
    border: 0;
    border-radius: var(--radius-pill);
    white-space: nowrap;
  }
  /* panneau « Réglages » de l'adulte : trois préréglages */
  .modes {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin: 4px 0 12px;
  }
  .mode {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 4px;
    min-height: 76px;
    padding: 8px 4px;
    font: inherit;
    font-weight: 800;
    color: var(--mp-green);
    background: var(--mp-mint);
    border: 2px solid var(--mp-mint2);
    border-radius: var(--radius-lg);
    text-align: center;
  }
  .mode[aria-pressed='true'] {
    color: var(--or-ink);
    background: var(--or-soft);
    border-color: var(--or-line);
  }
  .turn {
    position: sticky;
    top: 45vh;
    align-self: start;
    margin-top: 30vh;
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    padding: 0;
    color: var(--mp-green);
    background: var(--card);
    border: 1px solid var(--or-line);
    border-radius: 50%;
    box-shadow: var(--shadow-card);
    cursor: pointer;
    transition: transform var(--motion-fast) ease;
  }
  .turn:hover:not(:disabled) {
    transform: scale(1.06);
    background: var(--or-soft);
  }
  .turn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .turn.next {
    grid-area: next;
  }
  .turn.prev {
    grid-area: prev;
  }
  .back {
    display: inline-flex;
    transform: scaleX(-1);
  }
  .pos {
    grid-area: pos;
    margin: 4px 0 0;
    text-align: center;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--mp-ink2);
  }
  /* —— traduction —— */
  .trad {
    align-self: start;
    position: sticky;
    top: 150px;
    max-height: calc(100vh - 170px);
    overflow: auto;
    padding: 0 12px 12px;
    background: var(--card);
    border: 1px solid var(--mp-mint2);
    border-radius: var(--radius-lg);
  }
  .trad h2 {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 -12px 6px;
    padding: 10px 12px;
    font-size: 0.95rem;
    color: var(--mp-green);
    background: var(--mp-mint);
    border-bottom: 1px solid var(--mp-mint2);
  }
  .tlist {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .tlist li {
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    border-inline-start: 3px solid transparent;
    line-height: 1.6;
    transition: background-color var(--motion) ease;
  }
  .tlist li:hover {
    background: color-mix(in srgb, var(--mp-mark) 45%, transparent);
  }
  .tlist li.on {
    background: var(--mp-mark);
    border-inline-start-color: var(--or-line);
  }
  .tref {
    min-height: 0;
    padding: 0 8px;
    margin-inline-end: 6px;
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--or-ink);
    background: var(--or-soft);
    border: 1px solid var(--or-line);
    border-radius: var(--radius-pill);
  }
  .notes p {
    font-size: 0.85rem;
    margin: 4px 0;
  }
  .credit a {
    color: var(--mp-green);
  }
  .versets {
    margin-top: var(--space-m);
    max-width: 860px;
    margin-inline: auto;
  }
  .sura-nav {
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
  }
  .credits {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 4px 8px;
    margin: var(--space-m) 0 0;
    font-size: 0.8rem;
    color: var(--mp-ink2);
    text-align: center;
  }
  .info {
    display: inline-grid;
    place-items: center;
    width: 44px;
    height: 44px;
    min-height: 44px;
    padding: 0;
    color: var(--mp-green);
    background: transparent;
    border: 0;
    border-radius: 50%;
  }
  .adab {
    padding-inline-start: 1.2em;
  }
  .small {
    font-size: 0.9rem;
  }
  @media (max-width: 899px) {
    /* téléphone et tablette : la puce (emplacement en entier, lisible) sur sa ligne, les outils dessous */
    .cbar {
      top: 60px;
      flex-wrap: wrap;
    }
    .nav-zone {
      flex: 1 1 100%;
    }
    .puce {
      flex: 1 1 auto;
      justify-content: space-between;
    }
    /* Écouter, Traduction, Réglages : toujours icône ET mot écrit (passent à la ligne plutôt que perdre le mot) */
    .tools {
      flex: 1 1 100%;
      flex-wrap: wrap;
      gap: 6px;
    }
  }
  @media (max-width: 379px) {
    .tools {
      gap: 4px;
    }
    .tools .tool {
      gap: 4px;
      padding: 0 7px;
      font-size: 0.8rem;
    }
    .reg-btn {
      margin-inline-start: auto;
    }
    .stage {
      grid-template-areas:
        'book book book'
        'next pos prev';
      align-items: center;
    }
    .turn {
      position: static;
      margin-top: 4px;
      box-shadow: none;
    }
  }
  /*
   * téléphone, lecture épurée : la page prend toute la largeur (plus de colonnes de flèches) ; les flèches
   * deviennent de petites commandes au bord de l'écran, effacées avec les autres (glisser et bords suffisent)
   */
  @media (max-width: 899px),
    (orientation: landscape) and (max-height: 560px) and (pointer: coarse) {
    .stage.epure {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        'book'
        'pos';
    }
    .stage.epure .turn {
      position: fixed;
      top: 50%;
      z-index: 16;
      width: 40px;
      height: 40px;
      margin: 0;
      opacity: 0.92;
      box-shadow: var(--shadow-card);
    }
    .stage.epure .turn.next {
      left: 4px;
    }
    .stage.epure .turn.prev {
      right: 4px;
    }
    :global(html[data-epure]) .stage.epure .turn {
      opacity: 0;
    }
  }
  /* paysage (téléphone couché) : la page prend toute la largeur de l'écran */
  @media (orientation: landscape) and (max-height: 560px) {
    :global(html[data-lecteur] main) {
      max-width: none;
      padding-inline: 8px;
    }
  }
</style>
