<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onDestroy, onMount, tick, untrack } from 'svelte';
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
  import Affichage from '$lib/quran/lecture/Affichage.svelte';
  import Feuille from '$lib/quran/lecture/Feuille.svelte';
  import MenuVerset from '$lib/quran/lecture/MenuVerset.svelte';
  import ReglagesEcoute from '$lib/quran/lecture/ReglagesEcoute.svelte';
  import Selecteur from '$lib/quran/lecture/Selecteur.svelte';
  import {
    type Onglet,
    clampRange,
    hizbStart,
    isMarked,
    playQueue,
    PRESETS,
    presetOf,
    presetRange,
    readMarks,
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

  // feuilles et menu
  let selOpen = $state(false);
  let selTab = $state<Onglet>('sourate');
  let regOpen = $state(false);
  let affOpen = $state(false);
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
  const posA = $derived(
    cur?.s === activeSura ? cur.a : (segs(p).find((g) => g.s === activeSura)?.from ?? 1),
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
  const queue = $derived(pack?.mode === 'sourate' ? [0] : plan.queue);
  const preset = $derived(presetOf(settings, range, suraLen(range.s)));
  const highlight = $derived(highlightOn(reciter, rw, pack, suraLen(range.s)));
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
  const exactOn = $derived(!isRw && !tajwidOn && prefs.memo === 0);
  const exactOf = (n: number) => (exactOn ? (exactPages[n] ?? null) : null);
  const anyExact = $derived(vue === 'page' && shown.some((n) => !!exactOf(n)));
  /** Lignes et polices des pages affichées disponibles en mise en page exacte (montrées une fois prêtes). */
  async function ensureExact() {
    const info = exactInfo;
    if (!info || !exactOn || vue !== 'page') return;
    await Promise.all(
      shown.map(async (n) => {
        if (n in exactPages || !exactAvailable(info, n)) return;
        const [pg, f1, f2] = await Promise.all([
          loadExactPage(n, info.version),
          loadPageFont(n),
          loadBsmlFont(),
        ]);
        exactPages = { ...exactPages, [n]: pg && f1 && f2 ? pg : null };
      }),
    );
  }
  $effect(() => {
    void [exactOn, shown, vue, exactInfo];
    untrack(() => void ensureExact());
  });

  $effect(() => writePrefs({ ...prefs, page: p }));
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
    const mq = window.matchMedia('(min-width: 900px)');
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
    wifi = await wifiOnly();
    const c = await loadReciters(profileId, 'ecouter');
    allReciters = c.list;
    conseil = c.conseil;
    restreint = c.restreint;
    const r = q.get('r');
    reciterId = r && c.list.some((x) => x.id === r) ? r : c.initial;
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
  const turn = (dir: 1 | -1) => {
    if (vue === 'versets') {
      const s = Math.max(1, Math.min(114, activeSura + dir));
      if (s !== activeSura) void goVerse(s, 1);
      return;
    }
    void goPage(stepPage(p, dir, double));
  };

  async function openTracks() {
    const s = range.s;
    const id = reciterId;
    if (!id) {
      pack = null;
      trackCode = null;
      return;
    }
    if (pack?.sura === s && pack.reciter === id) return;
    pack = null;
    trackCode = null;
    saved = false;
    const r = await loadTracks(profileId, id, s, memo ? 'memoriser' : 'ecouter');
    if (s !== range.s || id !== reciterId) return;
    pack = r.pack;
    trackCode = r.code;
    saved =
      !!pack && (await savedSuras(pack.reciter)).some((x) => x.sura === s && x.hash === pack!.hash);
  }

  /** Lecture sur un geste : plage donnée (ou plage en cours), mini-barre montrée. */
  async function playFrom(r: Range | null) {
    if (!reciter) {
      regOpen = true;
      return;
    }
    if (r) range = clampRange(r, suraLen(r.s));
    audioOn = true;
    await openTracks();
    await tick();
    if (!pack) {
      regOpen = true;
      return;
    }
    await player?.start();
  }
  function onaya(a: number | null) {
    if (a === null || !highlight) {
      heard = null;
      return;
    }
    heard = { s: range.s, a };
    // la page suit la récitation (sans changer la plage écoutée)
    if (vue === 'page' && starts) {
      const n = pageOf(starts, range.s, a);
      if (!shown.includes(n)) {
        p = clampPage(n);
        setUrl();
        void ensure();
      }
    }
  }

  function pick(s: number, a: number, el: HTMLElement) {
    cur = { s, a };
    follow();
    menuAnchor = el;
    menuAt = { s, a };
    if (!ecritureRefs && profileId) void loadEcriture();
  }
  async function loadEcriture() {
    const pid = profileId;
    if (!pid) return;
    const m = await import('$lib/parcours/parcours');
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
      if (ref.kind === 'verse') await goVerse(ref.s, ref.a);
      else if (ref.kind === 'page') await goPage(ref.p);
      else if (ref.kind === 'sura') await goVerse(ref.s, 1);
      else await goPage(pageOfJ(ref.j));
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

  // balayage (téléphone) : une page à la fois
  let bookEl = $state<HTMLElement | undefined>();
  $effect(() => {
    const el = bookEl;
    if (!el) return;
    el.addEventListener('touchstart', tstart, { passive: true });
    el.addEventListener('touchend', tend, { passive: true });
    return () => {
      el.removeEventListener('touchstart', tstart);
      el.removeEventListener('touchend', tend);
    };
  });
  let touch: { x: number; y: number } | null = null;
  function tstart(e: TouchEvent) {
    const p0 = e.touches[0];
    touch = p0 ? { x: p0.clientX, y: p0.clientY } : null;
  }
  function tend(e: TouchEvent) {
    const p1 = e.changedTouches[0];
    if (!touch || !p1) return;
    const st = swipeStep(p1.clientX - touch.x, p1.clientY - touch.y);
    touch = null;
    if (st) turn(st);
  }
  function keys(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement | null)?.tagName ?? '';
    if (/INPUT|SELECT|TEXTAREA/.test(tag) || document.querySelector('dialog[open]')) return;
    // livre arabe : la flèche gauche avance
    if (e.key === 'ArrowLeft') turn(1);
    else if (e.key === 'ArrowRight') turn(-1);
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
  async function setRiwaya(m: MushafRiwaya) {
    rw = m;
    heard = null;
    revealed = new Set();
    if (!(await openRiwaya())) rw = HAFS;
    writeMushafRiwaya(rw);
    // même verset (vue « versets ») ou même numéro de page dans l'autre muṣḥaf
    if (vue === 'versets' && cur) await goVerse(cur.s, Math.min(cur.a, suraLen(cur.s)));
    else {
      cur = null;
      await goPage(p);
    }
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
    affOpen = false;
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
  <div class="lecture" class:audio-on={audioOn}>
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
        <button
          type="button"
          class="tool search-btn"
          onclick={() => openSel('sourate')}
          aria-label={t('mp.recherche')}
          title={t('mp.recherche')}
          data-testid="ouvrir-recherche"><Icon name="loupe" size={22} /></button
        >
        {#if !isRw}
          <button
            type="button"
            class="tool"
            aria-pressed={narrow && vue === 'page' ? tradSheet : tradShown}
            onclick={toggleTrad}
            aria-label={t('mp.traduction_court')}
            title={t('mp.traduction_court')}
            data-testid="mp-trad"><Icon name="traduction" size={22} /></button
          >
        {/if}
        <button
          type="button"
          class="tool"
          onclick={() => (affOpen = true)}
          aria-haspopup="dialog"
          aria-label={t('cl.affichage')}
          title={t('cl.affichage')}
          data-testid="ouvrir-affichage"><Icon name="points" size={22} /></button
        >
      </div>
      <div class="ecoute" class:on={audioOn} data-testid="mini-barre">
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
            {onaya}
            onindex={(i) => {
              playing = i !== null;
              step = i === null ? null : (plan.steps?.[i] ?? null);
            }}
            onsettings={() => (regOpen = true)}
            onvolume={(v) => (prefs.volume = v)}
          />
        {:else}
          <button
            type="button"
            class="tool"
            onclick={() => (regOpen = true)}
            data-testid="sans-recitateur"
            ><Icon name="casque" size={22} /><span>{t('mp.aucun_recitateur')}</span></button
          >
        {/if}
      </div>
    </nav>
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
        <button type="button" class="link" onclick={() => (affOpen = true)}
          >{t('cl.changer')}</button
        >
        <button
          type="button"
          class="link"
          onclick={() => setMemo(0)}
          data-testid="quitter-memoriser">{t('cl.quitter_memoriser')}</button
        >
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
        <div class="stage">
          <button
            type="button"
            class="turn next"
            onclick={() => turn(1)}
            disabled={lastPage}
            aria-label={t('mp.page_suivante')}
            title={t('mp.page_suivante')}
            data-testid="mp-suiv"><span class="back"><Icon name="fleche" size={24} /></span></button
          >
          <div class="book" class:double dir="rtl" bind:this={bookEl} data-testid="mushaf-livre">
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

    <p class="credits" data-testid="credit-texte">
      {#if rwDef}<Bidi
          text={t('rw.credit', {
            riwaya: rwDef.fr,
            version: rwDef.version,
            police: rwDef.fontVersion,
          })}
        />{:else}<Bidi text={t('lecteur.credit')} />{/if}
      <button
        type="button"
        class="info"
        onclick={() => (infoOpen = true)}
        aria-label={t('cl.infos')}
        title={t('cl.infos')}
        data-testid="infos-texte"><Icon name="info" size={18} /></button
      >
    </p>
    {#if audioOn}<div class="spacer" aria-hidden="true"></div>{/if}
  </div>

  <Selecteur
    bind:open={selOpen}
    bind:tab={selTab}
    pos={{ s: activeSura, a: posA, p, juz: juzOf(p) }}
    {lengths}
    hizb={!isRw}
    onverse={(s, a) => goVerse(s, a)}
    onpage={goPage}
    onjuz={(j) => goPage(pageOfJ(j))}
    onhizb={(n) => {
      const st = hizbStart(meta?.divisions?.quarters, n);
      if (st) void goVerse(st[0], st[1]);
    }}
    {onsearch}
  />
  <ReglagesEcoute
    bind:open={regOpen}
    bind:prefs
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
    onreciter={(id) => (reciterId = id)}
    onpreset={applyPreset}
    onrange={(from, to) => (range = clampRange({ s: range.s, from, to }, suraLen(range.s)))}
    onkeep={keep}
    ondrop={drop}
    onwifi={(on) => {
      wifi = on;
      void setWifiOnly(on);
    }}
    onriwaya={setRiwaya}
    onportion={usePortion}
  />
  <Affichage
    bind:open={affOpen}
    bind:prefs
    bind:tjPrefs
    bind:tjData
    {rw}
    wide={!narrow}
    sura={activeSura}
    verses={suraVerses}
    basmala={meta?.basmala ?? ''}
    onriwaya={setRiwaya}
    onmemo={(n) => setMemo(n)}
    bind:guide
    onguide={guidePlay}
  />
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
    onrepeat={(s, a) => {
      Object.assign(prefs, PRESETS.find((x) => x.id === 'repeter')!.set);
      void playFrom({ s, from: a, to: a });
    }}
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
  /* téléphone : la mini-barre, fixe en bas, au-dessus de la navigation, après le premier « Écouter » */
  .ecoute {
    display: none;
  }
  .ecoute.on {
    position: fixed;
    inset-inline: 8px;
    bottom: calc(76px + env(safe-area-inset-bottom));
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
    height: 84px;
  }
  .search-btn {
    display: none;
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
    .search-btn {
      display: inline-flex;
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
    display: grid;
    gap: 6px;
    min-width: 0;
    touch-action: pan-y;
  }
  .book.double {
    grid-template-columns: 1fr 1fr;
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
    .cbar {
      top: 60px;
      flex-wrap: nowrap;
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
</style>
