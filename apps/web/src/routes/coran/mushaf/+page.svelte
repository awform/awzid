<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { suraName, type QuranMeta } from '@awform/hifz';
  import { demoProfileFor } from '$lib/attempts';
  import type { Reciter, SuraPack } from '$lib/coran-audio';
  import { loadMeta, loadVerses } from '$lib/hifz';
  import { fmtNumber, localeInfo, t } from '$lib/i18n';
  import AudioPlayer from '$lib/quran/AudioPlayer.svelte';
  import CoranTabs from '$lib/quran/CoranTabs.svelte';
  import MushafPage from '$lib/quran/MushafPage.svelte';
  import {
    clampPage,
    juzOfPage,
    MUSHAF_KINDS,
    pageOf,
    pageOfJuz,
    pageSegments,
    pageStarts,
    pageVerses,
    parseRef,
    readPrefs,
    repeatQueue,
    searchVerses,
    spreadOf,
    stepPage,
    suraLengths,
    swipeStep,
    writePrefs,
    type MushafPrefs,
    type Ref,
  } from '$lib/quran/mushaf';
  import { canHighlight, isHafs } from '$lib/quran/player';
  import Icon from '$lib/ui/Icon.svelte';
  import { loadReciters, loadTracks } from '$lib/quran/reciters';
  import RiwayaBadge from '$lib/quran/RiwayaBadge.svelte';
  import { loadTajwid, type TajwidSura } from '$lib/quran/tajwid';
  import {
    loadTranslation,
    noteLines,
    translationInfo,
    TRANSLATIONS,
    type TranslationSura,
  } from '$lib/quran/translation';

  /**
   * Muṣḥaf PAR PAGE (ergonomie de l'application Ayat, AUCUN contenu extrait d'Ayat ; refonte VERTE du 04/10/2026).
   * Pages du Muṣḥaf de Médine (débuts de page Tanzil), double page « livre » sur ordinateur, une page avec
   * balayage sur téléphone. Barre SIMPLIFIÉE : sourate, page, puis quatre actions à icône et libellé (Écouter,
   * Tajwid, Traduction, Plus) ; le menu « Plus » garde le reste (muṣḥaf, langue de la traduction, verset, juzʾ,
   * recherche, lecture seule, test de mémorisation, vue une page). Grandes flèches de page de part et d'autre du
   * livre (sous le livre sur téléphone) avec la position « Page n / 604 ». Panneau de traduction repliable.
   * Audio : seulement les récitateurs licenciés du Complexe ; jamais de lecture avant un geste.
   */
  type Verse = { s: number; a: number; text: string };
  let meta = $state<(QuranMeta & { basmala: string }) | null>(null);
  let prefs = $state<MushafPrefs>(readPrefs());
  let p = $state(1);
  let cur = $state<{ s: number; a: number } | null>(null);
  /** verset entendu (surlignage pendant l'écoute) : distinct de `cur`, qui fixe le début de la plage —
   *  sinon chaque verset entendu recalculait la file et coupait la lecture (A1, constaté avec les vraies récitations) */
  let heard = $state<{ s: number; a: number } | null>(null);
  /** texte Tanzil par sourate : s → (a → texte) */
  let texts = $state<Record<number, Record<number, string>>>({});
  let tajwids = $state<Record<number, TajwidSura | null>>({});
  let trads = $state<Record<number, TranslationSura | null>>({});
  let revealed = $state(new Set<string>());
  let narrow = $state(false);
  let audioOpen = $state(false);
  let tradOpen = $state(true);
  /** dernière traduction choisie : le bouton « Traduction » la remet */
  let lastTrad = $state(readPrefs().translation || TRANSLATIONS[0]!.key);
  let query = $state('');
  let results = $state<Array<{ s: number; a: number }> | null>(null);
  let searchMsg = $state('');
  let noPages = $state(false);
  // audio (récitateurs du Complexe ; aucun audio d'EveryAyah ni d'Ayat)
  let profileId = $state<string | null>(null);
  let reciters = $state<Reciter[]>([]);
  let reciterId = $state<string | null>(null);
  let pack = $state<SuraPack | null>(null);
  let trackCode = $state<string | null>(null);

  const starts = $derived(meta ? pageStarts(meta) : null);
  const lengths = $derived(meta ? suraLengths(meta) : []);
  const double = $derived(!narrow && !prefs.single);
  const shown = $derived(double ? [...spreadOf(p)] : [p]);
  const segs = (n: number) => (starts ? pageSegments(starts, lengths, n) : []);
  const shownVerses = $derived(starts ? shown.flatMap((n) => pageVerses(starts, lengths, n)) : []);
  const reciter = $derived(reciters.find((r) => r.id === reciterId) ?? null);
  const tajwidOn = $derived(prefs.kind === 'hafs-tajwid');
  /** sourate « active » : celle du verset choisi, sinon la première de la page */
  const activeSura = $derived(cur?.s ?? segs(p)[0]?.s ?? 1);
  const activeRange = $derived.by(() => {
    const g = shown.flatMap((n) => segs(n)).filter((x) => x.s === activeSura);
    if (!g.length) return null;
    return { from: cur && cur.s === activeSura ? cur.a : g[0]!.from, to: g[g.length - 1]!.to };
  });
  const queue = $derived(
    pack?.mode === 'sourate'
      ? [0]
      : activeRange
        ? repeatQueue(activeRange.from, activeRange.to, prefs.repeatVerse, prefs.repeatRange)
        : [],
  );
  const trad = $derived(translationInfo(prefs.translation));
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

  const text = (s: number, a: number) => texts[s]?.[a];
  const tajwidOf = (s: number) => tajwids[s] ?? null;

  $effect(() => writePrefs({ ...prefs, page: p }));

  onMount(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    narrow = mq.matches;
    const on = () => (narrow = mq.matches);
    mq.addEventListener('change', on);
    void init();
    return () => mq.removeEventListener('change', on);
  });

  async function init() {
    meta = await loadMeta();
    if (!meta || !pageStarts(meta)) {
      noPages = true;
      return;
    }
    const q = page.url.searchParams;
    const s = Number(q.get('s'));
    const a = Number(q.get('a')) || 1;
    if (s >= 1 && s <= 114) await goVerse(s, Math.min(a, lengths[s - 1] ?? 1));
    else await goPage(Number(q.get('page')) || prefs.page);
    const prof = await demoProfileFor('').catch(() => null);
    profileId = prof?.id ?? null;
    const c = await loadReciters(profileId, 'ecouter');
    reciters = c.list;
    reciterId = c.initial;
    await openTracks();
  }

  /** Charge le texte (et selon les réglages, le tajwid et la traduction) des sourates affichées. */
  async function ensure(pages: number[]) {
    if (!starts) return;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- table locale, jamais rendue
    const need = new Map<number, [number, number]>();
    for (const n of pages)
      for (const g of pageSegments(starts, lengths, n)) {
        const r = need.get(g.s);
        need.set(g.s, r ? [Math.min(r[0], g.from), Math.max(r[1], g.to)] : [g.from, g.to]);
      }
    await Promise.all(
      [...need].map(async ([s, [from, to]]) => {
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
        if (trad && trads[s]?.key !== trad.key) {
          const d = await loadTranslation(trad.key, s);
          trads = { ...trads, [s]: d };
        }
      }),
    );
  }

  async function goPage(n: number) {
    p = clampPage(n);
    if (cur && starts && !shown.includes(pageOf(starts, cur.s, cur.a))) cur = null;
    revealed = new Set();
    results = null;
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- chemin résolu, suivi d'un paramètre
    void goto(`${resolve('/coran/mushaf')}?page=${p}`, {
      replaceState: true,
      keepFocus: true,
      noScroll: true,
    });
    await ensure(double ? [...spreadOf(p)] : [p]);
    await openTracks();
  }
  async function goVerse(s: number, a: number) {
    if (!starts) return;
    cur = { s, a };
    heard = null;
    await goPage(pageOf(starts, s, a));
    cur = { s, a };
    heard = null;
    document.querySelector(`[data-aya="${s}:${a}"]`)?.scrollIntoView({ block: 'center' });
    document
      .querySelector(`[data-trad="${s}:${a}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  const turn = (dir: 1 | -1) => void goPage(stepPage(p, dir, double));

  async function openTracks() {
    pack = null;
    trackCode = null;
    if (!reciterId) return;
    const r = await loadTracks(profileId, reciterId, activeSura, 'ecouter');
    pack = r.pack;
    trackCode = r.code;
  }

  function pick(s: number, a: number) {
    if (prefs.readOnly) return;
    if (prefs.memo > 0) {
      const k = `${s}:${a}`;
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- copie remplacée en entier (réactive par $state)
      const next = new Set(revealed);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      revealed = next;
    }
    const sameSura = cur?.s === s;
    cur = { s, a };
    heard = null;
    if (!sameSura) void openTracks();
    document.querySelector(`[data-trad="${s}:${a}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  async function search(e: SubmitEvent) {
    e.preventDefault();
    searchMsg = '';
    results = null;
    const ref = parseRef(query, lengths);
    if (ref?.kind === 'verse') return goVerse(ref.s, ref.a);
    if (ref?.kind === 'page') return goPage(ref.p);
    if (ref?.kind === 'sura') return goVerse(ref.s, 1);
    if (ref?.kind === 'juz' && meta) return goPage(pageOfJuz(meta, ref.j));
    // texte arabe : recherche dans les sourates déjà chargées sur l'appareil
    const all: Verse[] = Object.entries(texts).flatMap(([s, m]) =>
      Object.entries(m).map(([a, text]) => ({ s: Number(s), a: Number(a), text })),
    );
    all.sort((x, y) => x.s - y.s || x.a - y.a);
    results = searchVerses(all, query);
    if (!results.length) searchMsg = t('mp.recherche_vide');
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
    const step = swipeStep(p1.clientX - touch.x, p1.clientY - touch.y);
    touch = null;
    if (step) turn(step);
  }
  function keys(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement | null)?.tagName ?? '';
    if (/INPUT|SELECT|TEXTAREA/.test(tag)) return;
    // livre arabe : la flèche gauche avance
    if (e.key === 'ArrowLeft') turn(1);
    else if (e.key === 'ArrowRight') turn(-1);
  }

  async function setKind(k: MushafPrefs['kind']) {
    prefs = { ...prefs, kind: k };
    if (k === 'hafs-tajwid') await ensure(shown);
  }
  async function setTranslation(k: string) {
    prefs = { ...prefs, translation: k };
    if (k) {
      lastTrad = k;
      tradOpen = true;
    }
    trads = {};
    await ensure(shown);
  }
  async function setReciter(id: string) {
    reciterId = id;
    await openTracks();
  }
  const ref = (r: Ref) => `${r[0]}:${r[1]}`;
</script>

<svelte:window onkeydown={keys} />
<svelte:head><title>{t('app.nom')} — {t('mp.titre')}</title></svelte:head>

<h1 class="sr-only">{t('mp.titre')}</h1>
<CoranTabs current="mushaf" />

{#if noPages}
  <p class="card" role="status">{t('mp.sans_pages')}</p>
{:else}
  <div class="mushaf-ui">
    <nav class="mp-bar" aria-label={t('mp.commandes')} data-testid="mushaf-bar">
      <label class="fld sura"
        ><span class="lbl">{t('mp.sourate')}</span>
        <select
          value={activeSura}
          onchange={(e) => goVerse(Number(e.currentTarget.value), 1)}
          data-testid="mp-sourate"
        >
          {#each Array.from({ length: 114 }, (_, i) => i + 1) as s (s)}<option value={s}
              >{fmtNumber(s)}. {suraName(s)}</option
            >{/each}
        </select></label
      >
      <label class="fld pg"
        ><span class="lbl">{t('mp.page')}</span>
        <input
          type="number"
          inputmode="numeric"
          min="1"
          max="604"
          value={p}
          onchange={(e) => goPage(Number(e.currentTarget.value))}
          data-testid="mp-page"
        /></label
      >
      <div class="tools">
        <button
          type="button"
          class="tool"
          aria-expanded={audioOpen}
          aria-controls="mp-audio"
          onclick={() => (audioOpen = !audioOpen)}
          data-testid="mp-ecouter"
          ><Icon name="casque" size={22} /><span>{t('ecoute.ecouter')}</span></button
        >
        <button
          type="button"
          class="tool"
          aria-pressed={tajwidOn}
          onclick={() => setKind(tajwidOn ? 'hafs' : 'hafs-tajwid')}
          data-testid="mp-tajwid"
          ><Icon name="tajwid" size={22} /><span>{t('lecon.tajwid')}</span></button
        >
        <button
          type="button"
          class="tool"
          aria-pressed={!!trad}
          onclick={() => setTranslation(trad ? '' : lastTrad)}
          data-testid="mp-trad"
          ><Icon name="traduction" size={22} /><span>{t('mp.traduction_court')}</span></button
        >
        <details class="menu" data-testid="mp-options">
          <summary class="tool"
            ><Icon name="points" size={22} /><span>{t('nav.plus')}</span></summary
          >
          <div class="pop">
            <label class="row"
              >{t('mp.mushaf')}
              <select
                value={prefs.kind}
                onchange={(e) => setKind(e.currentTarget.value as MushafPrefs['kind'])}
                data-testid="mp-mushaf"
              >
                {#each MUSHAF_KINDS as k (k.id)}<option value={k.id} disabled={!k.available}
                    >{t(`mp.mushaf_${k.id.replace('-', '_')}`)}</option
                  >{/each}
              </select></label
            >
            <label class="row"
              >{t('mp.traduction')}
              <select
                value={prefs.translation}
                onchange={(e) => setTranslation(e.currentTarget.value)}
                data-testid="mp-traduction"
              >
                <option value="">{t('mp.sans_traduction')}</option>
                {#each TRANSLATIONS as x (x.key)}<option value={x.key}>{t(x.label)}</option>{/each}
              </select></label
            >
            <div class="pair">
              <label class="row"
                >{t('mp.verset')}
                <input
                  type="number"
                  inputmode="numeric"
                  min="1"
                  max={lengths[activeSura - 1] ?? 1}
                  value={cur?.s === activeSura ? cur.a : (activeRange?.from ?? 1)}
                  onchange={(e) =>
                    goVerse(
                      activeSura,
                      Math.max(
                        1,
                        Math.min(lengths[activeSura - 1] ?? 1, Number(e.currentTarget.value)),
                      ),
                    )}
                  data-testid="mp-verset"
                /></label
              >
              <label class="row"
                >{t('mp.juz')}
                <select
                  value={meta ? juzOfPage(meta, p) : 1}
                  onchange={(e) => meta && goPage(pageOfJuz(meta, Number(e.currentTarget.value)))}
                  data-testid="mp-juz"
                >
                  {#each Array.from({ length: 30 }, (_, i) => i + 1) as j (j)}<option value={j}
                      >{fmtNumber(j)}</option
                    >{/each}
                </select></label
              >
            </div>
            <form class="search" onsubmit={search} role="search">
              <input
                type="search"
                bind:value={query}
                placeholder={t('mp.recherche_aide')}
                aria-label={t('mp.recherche')}
                data-testid="mp-recherche"
              />
              <button type="submit">{t('mp.chercher')}</button>
            </form>
            <label class="row"
              >{t('mp.memorisation')}
              <select bind:value={prefs.memo} data-testid="mp-memo">
                {#each [0, 1, 2, 3] as l (l)}<option value={l}>{t(`mp.memo_${l}`)}</option>{/each}
              </select></label
            >
            <label class="check"
              ><input
                type="checkbox"
                bind:checked={prefs.readOnly}
                data-testid="mp-lecture-seule"
              />
              {t('mp.lecture_seule')}</label
            >
            <label class="check"
              ><input type="checkbox" bind:checked={prefs.single} data-testid="mp-vue-mobile" />
              {t('mp.vue_mobile')}</label
            >
          </div>
        </details>
      </div>
    </nav>

    {#if audioOpen}
      <section id="mp-audio" class="audio" aria-label={t('ecoute.ecouter')} data-testid="mp-audio">
        <label class="row"
          >{t('mp.recitateur')}
          <select
            value={reciterId ?? ''}
            onchange={(e) => setReciter(e.currentTarget.value)}
            disabled={!reciters.length}
            data-testid="mp-recitateur"
          >
            {#if !reciters.length}<option value="">{t('mp.aucun_recitateur')}</option>{/if}
            {#each reciters as r (r.id)}<option value={r.id}>{r.nameFr}</option>{/each}
          </select></label
        >
        <details class="menu rep" data-testid="mp-repetition">
          <summary class="chip"><Icon name="repeter" size={18} />{t('mp.repetition')}</summary>
          <div class="pop">
            <label class="row"
              >{t('mp.repeter_verset')}
              <input type="number" min="1" max="20" bind:value={prefs.repeatVerse} /></label
            >
            <label class="row"
              >{t('mp.repeter_plage')}
              <input type="number" min="1" max="20" bind:value={prefs.repeatRange} /></label
            >
            <p class="hint">
              {#if activeRange}<Bidi
                  text={t('mp.plage_ecoute', {
                    sourate: suraName(activeSura),
                    de: activeRange.from,
                    a: activeRange.to,
                  })}
                />{/if}
            </p>
          </div>
        </details>
        {#if reciter}<RiwayaBadge riwaya={reciter.riwaya} label={reciter.riwayaFr} />{/if}
        {#if reciter && pack && queue.length}
          <div class="player">
            <AudioPlayer
              {reciter}
              {pack}
              {queue}
              onaya={(a) => {
                if (a && canHighlight(reciter) && isHafs(reciter.riwaya))
                  heard = { s: activeSura, a };
              }}
            />
          </div>
        {:else if reciter && trackCode}
          <p class="hint">{t('mp.audio_indisponible')}</p>
        {:else if !reciters.length}
          <p class="hint">{t('mp.audio_attente')}</p>
        {/if}
      </section>
    {/if}

    {#if results?.length || searchMsg}
      <section class="results" aria-label={t('mp.resultats')} data-testid="mp-resultats">
        {#if searchMsg}<p class="hint"><Bidi text={searchMsg} /></p>{/if}
        {#if results?.length}<p class="hint">{t('mp.recherche_portee')}</p>{/if}
        <ul>
          {#each results ?? [] as r (`${r.s}:${r.a}`)}<li>
              <button type="button" class="link" onclick={() => goVerse(r.s, r.a)}
                ><Bidi text={t('mp.resultat', { sourate: suraName(r.s), a: r.a })} /></button
              >
            </li>{/each}
        </ul>
      </section>
    {/if}

    <div class="reader" class:withTrad={!!trad} class:shut={!!trad && !tradOpen}>
      <div class="stage" dir="ltr">
        <button
          type="button"
          class="turn next"
          onclick={() => turn(1)}
          disabled={lastPage}
          aria-label={t('mp.page_suivante')}
          title={t('mp.page_suivante')}
          data-testid="mp-suiv"><span class="back"><Icon name="fleche" size={26} /></span></button
        >
        <div class="book" class:double dir="rtl" bind:this={bookEl} data-testid="mushaf-livre">
          {#each shown as n (n)}
            <MushafPage
              p={n}
              segments={segs(n)}
              {text}
              basmala={meta?.basmala ?? ''}
              juz={meta ? juzOfPage(meta, n) : 1}
              tajwid={tajwidOn ? tajwidOf : null}
              current={heard ?? cur}
              memo={prefs.memo}
              readOnly={prefs.readOnly}
              {revealed}
              compact={double}
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
          data-testid="mp-prec"><Icon name="fleche" size={26} /></button
        >
        <p class="pos" lang={localeInfo().code} dir={localeInfo().dir} aria-live="polite">
          <Bidi text={position} />
        </p>
      </div>

      {#if trad}
        <aside
          class="trad"
          lang={trad.lang}
          dir="ltr"
          aria-label={t('mp.traduction_du_sens')}
          data-testid="mp-panneau-traduction"
        >
          <h2 lang={localeInfo().code} dir={localeInfo().dir}>
            <button
              type="button"
              class="fold"
              aria-expanded={tradOpen}
              aria-controls="mp-trad-list"
              onclick={() => (tradOpen = !tradOpen)}
              data-testid="mp-replier-traduction"
              ><Icon name="traduction" size={20} /><Bidi text={t('mp.traduction_du_sens')} /><span
                class="chev"
                class:up={tradOpen}><Icon name="chevron" size={18} /></span
              ></button
            >
          </h2>
          {#if tradOpen}
            <ol id="mp-trad-list">
              {#each shownVerses as r (ref(r))}
                {@const tv = trads[r[0]]?.verses.get(r[1])}
                <li
                  data-trad={ref(r)}
                  class:on={(heard ?? cur)?.s === r[0] && (heard ?? cur)?.a === r[1]}
                  aria-current={(heard ?? cur)?.s === r[0] && (heard ?? cur)?.a === r[1]
                    ? 'true'
                    : undefined}
                >
                  <button
                    type="button"
                    class="tref"
                    onclick={() => pick(r[0], r[1])}
                    disabled={prefs.readOnly}
                    lang={localeInfo().code}
                    dir={localeInfo().dir}><Bidi text={t('mp.ref', { s: r[0], a: r[1] })} /></button
                  >
                  {#if tv}
                    <span class="ttext"><Bidi text={tv.text} /></span>
                    {#if tv.notes}<details class="notes">
                        <summary lang={localeInfo().code} dir={localeInfo().dir}
                          >{t('mp.notes')}</summary
                        >
                        {#each noteLines(tv.notes) as l, i (i)}<p><Bidi text={l} /></p>{/each}
                      </details>{/if}
                  {:else}<span class="hint">…</span>{/if}
                </li>
              {/each}
            </ol>
            <p class="hint credit" lang={localeInfo().code} dir={localeInfo().dir}>
              <Bidi
                text={t('mp.credit_traduction', { titre: t(trad.label), version: trad.version })}
              />
              <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- lien externe -->
              <a href={trad.url} target="_blank" rel="noopener"
                ><Bidi text={t('mp.lien_source')} /></a
              >
            </p>
          {/if}
        </aside>
      {/if}
    </div>
  </div>
  <p class="muted small credits">
    <Bidi text={t('lecteur.credit')} />
    {#if tajwidOn}<Bidi text={t('tj.credit')} />{/if}
  </p>
  <p class="muted small">{t('mp.mise_en_page_fluide')}</p>
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
  .mushaf-ui {
    color: var(--mp-ink);
  }
  /* —— barre de commandes : sourate, page, quatre actions —— */
  .mp-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 8px 10px;
    padding: 8px 10px;
    background: var(--mp-mint);
    border: 1px solid var(--mp-mint2);
    border-radius: var(--radius-lg);
  }
  .fld {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--mp-ink2);
  }
  .fld.sura {
    flex: 1 1 200px;
    max-width: 320px;
  }
  .fld.pg input {
    width: 5.2em;
  }
  select,
  input {
    font: inherit;
    font-size: 1rem;
    font-weight: 400;
    min-height: var(--target);
    max-width: 100%;
    min-width: 0;
    color: var(--mp-ink);
    background: var(--mp-paper);
    border-color: var(--mp-mint2);
  }
  select:focus-visible,
  input:focus-visible {
    border-color: var(--mp-green);
  }
  .tools {
    display: flex;
    gap: 4px;
    margin-inline-start: auto;
  }
  .tool {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-width: 64px;
    min-height: 52px;
    padding: 4px 8px;
    font: inherit;
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 1.1;
    color: var(--mp-green);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    cursor: pointer;
    list-style: none;
    transition:
      background-color var(--motion-fast) ease,
      border-color var(--motion-fast) ease;
  }
  .tool::-webkit-details-marker {
    display: none;
  }
  .tool:hover {
    background: color-mix(in srgb, var(--mp-mint2) 60%, transparent);
  }
  .tool[aria-pressed='true'],
  .tool[aria-expanded='true'],
  .menu[open] > .tool {
    background: var(--mp-mint2);
    border-color: color-mix(in srgb, var(--mp-green) 35%, transparent);
  }
  .menu {
    position: relative;
  }
  .pop {
    position: absolute;
    z-index: 20;
    inset-inline-end: 0;
    top: calc(100% + 6px);
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: min(340px, calc(100vw - 32px));
    padding: 12px;
    color: var(--mp-ink);
    background: var(--mp-paper);
    border: 1px solid var(--mp-mint2);
    border-top: 3px solid var(--mp-green);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-float);
    animation: pop-in var(--motion-fast) ease-out;
  }
  @keyframes pop-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
  .row {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--mp-ink2);
  }
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--target);
    color: var(--mp-ink);
  }
  .search {
    display: flex;
    gap: 6px;
  }
  .search input {
    flex: 1;
  }
  .search button {
    color: var(--mp-on-band);
    background: var(--mp-band);
    border-color: var(--mp-band);
  }
  /* —— écoute —— */
  .audio {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 10px;
    margin-top: 8px;
    padding: 10px 12px;
    background: var(--mp-mint);
    border: 1px solid var(--mp-mint2);
    border-radius: var(--radius-lg);
  }
  .audio .rep .pop {
    inset-inline: 0 auto;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: var(--target);
    padding: 6px 12px;
    font-weight: 700;
    color: var(--mp-green);
    background: var(--mp-paper);
    border: 1px solid var(--mp-mint2);
    border-radius: var(--radius-pill);
    cursor: pointer;
    list-style: none;
  }
  .player {
    flex: 1 1 260px;
    min-width: 0;
  }
  .hint {
    margin: 0;
    font-size: 0.9rem;
    color: var(--mp-ink2);
  }
  .results {
    margin-top: 8px;
    padding: 10px 12px;
    background: var(--mp-paper);
    border: 1px solid var(--mp-mint2);
    border-radius: var(--radius-md);
  }
  .results ul {
    margin: 0;
    padding-inline-start: 1.2em;
  }
  .link {
    background: none;
    border: 0;
    color: var(--mp-green);
    text-decoration: underline;
    min-height: 0;
    cursor: pointer;
  }
  /* —— livre et flèches de page —— */
  .reader {
    display: grid;
    gap: var(--space-m);
    margin-top: var(--space-m);
  }
  .reader.withTrad {
    grid-template-columns: minmax(0, 2.2fr) minmax(260px, 1fr);
  }
  .reader.withTrad.shut {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  /* ordinateur : le livre sort de la colonne de lecture (double page plus proche d'un Muṣḥaf imprimé) */
  @media (min-width: 901px) {
    .reader {
      margin-inline: calc((100% - min(1400px, 100vw - 48px)) / 2);
    }
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
    top: 40vh;
    align-self: start;
    margin-top: 30vh;
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    padding: 0;
    color: var(--mp-on-band);
    background: var(--mp-band);
    border: 2px solid var(--mp-band);
    border-radius: 50%;
    box-shadow: var(--shadow-float);
    cursor: pointer;
    transition:
      transform var(--motion-fast) ease,
      opacity var(--motion-fast) ease;
  }
  .turn:hover:not(:disabled) {
    transform: scale(1.06);
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
  /* flèche de l'icône orientée vers la droite : « précédente » à droite (livre arabe), « suivante » retournée */
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
    top: var(--space-s);
    max-height: 82vh;
    overflow: auto;
    padding: 0 12px 12px;
    background: var(--mp-paper);
    border: 1px solid var(--mp-mint2);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
  }
  .shut .trad {
    padding-bottom: 0;
  }
  .trad h2 {
    position: sticky;
    top: 0;
    z-index: 1;
    margin: 0 -12px 6px;
    font-size: 0.95rem;
    background: var(--mp-mint);
    border-bottom: 1px solid var(--mp-mint2);
  }
  .fold {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: var(--target);
    padding: 6px 12px;
    font: inherit;
    font-weight: 700;
    color: var(--mp-green);
    background: transparent;
    border: 0;
    border-radius: 0;
    cursor: pointer;
    text-align: start;
  }
  .chev {
    display: inline-flex;
    margin-inline-start: auto;
    transform: rotate(90deg);
    transition: transform var(--motion) ease;
  }
  .chev.up {
    transform: rotate(-90deg);
  }
  .trad ol {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .trad li {
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    border-inline-start: 3px solid transparent;
    line-height: 1.6;
    transition:
      background-color var(--motion) ease,
      border-color var(--motion) ease;
  }
  .trad li.on {
    background: var(--mp-mark);
    border-inline-start-color: var(--mp-green);
  }
  .tref {
    min-height: 0;
    padding: 0 8px;
    margin-inline-end: 6px;
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--mp-green);
    background: var(--mp-mint);
    border: 1px solid var(--mp-mint2);
    border-radius: var(--radius-pill);
  }
  .notes p {
    font-size: 0.85rem;
    margin: 4px 0;
  }
  .credit a {
    color: var(--mp-green);
  }
  .small {
    font-size: 0.9rem;
  }
  .credits {
    margin-top: var(--space-s);
  }
  @media (max-width: 900px) {
    .reader.withTrad,
    .reader.withTrad.shut {
      grid-template-columns: minmax(0, 1fr);
    }
    .stage {
      grid-template-columns: auto minmax(0, 1fr) auto;
      grid-template-areas:
        'book book book'
        'next pos prev';
      align-items: center;
    }
    .turn {
      position: static;
      margin-top: 4px;
      width: 48px;
      height: 48px;
      box-shadow: none;
    }
    .pos {
      margin: 4px 0 0;
    }
    .trad {
      position: static;
      max-height: 55vh;
    }
  }
  @media (max-width: 520px) {
    .mp-bar {
      padding: 6px;
      gap: 6px;
    }
    .fld.sura {
      flex: 1 1 0;
      max-width: none;
    }
    .tools {
      flex: 1 1 100%;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      margin: 0;
    }
    .tool {
      min-width: 0;
      padding-inline: 0;
      font-size: 0.66rem;
      letter-spacing: -0.01em;
    }
    .menu > .tool {
      width: 100%;
      height: 100%;
    }
    .tool span {
      max-width: 100%;
      overflow-wrap: anywhere;
      text-align: center;
    }
  }
</style>
