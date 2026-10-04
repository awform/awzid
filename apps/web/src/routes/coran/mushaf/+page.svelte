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
   * Muṣḥaf PAR PAGE (demande du client : ergonomie de l'application Ayat, AUCUN contenu extrait d'Ayat).
   * Pages du Muṣḥaf de Médine (débuts de page Tanzil), double page « livre » sur ordinateur, une page avec
   * balayage sur téléphone ; choix du muṣḥaf (Ḥafṣ, Ḥafṣ tajwid ; Warsh annoncé, désactivé) ; traduction du
   * sens à côté (QuranEnc, verset en cours surligné) ; barre de commandes : récitateur, répétition, sourate /
   * verset / page / juzʾ, recherche, options (lecture seule, test de mémorisation, vue mobile).
   * Audio : seulement les récitateurs licenciés du Complexe ; jamais de lecture avant un geste.
   */
  type Verse = { s: number; a: number; text: string };
  let meta = $state<(QuranMeta & { basmala: string }) | null>(null);
  let prefs = $state<MushafPrefs>(readPrefs());
  let p = $state(1);
  let cur = $state<{ s: number; a: number } | null>(null);
  /** texte Tanzil par sourate : s → (a → texte) */
  let texts = $state<Record<number, Record<number, string>>>({});
  let tajwids = $state<Record<number, TajwidSura | null>>({});
  let trads = $state<Record<number, TranslationSura | null>>({});
  let revealed = $state(new Set<string>());
  let narrow = $state(false);
  let barOpen = $state(true);
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
    activeRange
      ? repeatQueue(activeRange.from, activeRange.to, prefs.repeatVerse, prefs.repeatRange)
      : [],
  );
  const trad = $derived(translationInfo(prefs.translation));

  const text = (s: number, a: number) => texts[s]?.[a];
  const tajwidOf = (s: number) => tajwids[s] ?? null;

  $effect(() => writePrefs({ ...prefs, page: p }));

  onMount(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    narrow = mq.matches;
    // téléphone : barre repliée au départ (le Muṣḥaf d'abord) ; ordinateur : toujours dépliée
    barOpen = !narrow;
    const on = () => {
      narrow = mq.matches;
      if (!narrow) barOpen = true;
    };
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
    await goPage(pageOf(starts, s, a));
    cur = { s, a };
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
  <details class="barwrap" bind:open={barOpen} data-testid="mp-barre">
    <summary class="barsum"
      ><Bidi text={t('mp.commandes_resume', { page: p, sourate: suraName(activeSura) })} /></summary
    >
    <section class="bar card" aria-label={t('mp.commandes')} data-testid="mushaf-bar">
      <div class="cluster audio">
        <label
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
        <details class="menu" data-testid="mp-repetition">
          <summary>{t('mp.repetition')}</summary>
          <div class="pop">
            <label
              >{t('mp.repeter_verset')}
              <input type="number" min="1" max="20" bind:value={prefs.repeatVerse} /></label
            >
            <label
              >{t('mp.repeter_plage')}
              <input type="number" min="1" max="20" bind:value={prefs.repeatRange} /></label
            >
            <p class="muted small">
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
                  cur = { s: activeSura, a };
              }}
            />
          </div>
        {:else if reciter && trackCode}
          <p class="muted small">{t('mp.audio_indisponible')}</p>
        {:else if !reciters.length}
          <p class="muted small">{t('mp.audio_attente')}</p>
        {/if}
      </div>

      <div class="cluster nav">
        <div class="row">
          <label
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
          <label
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
          <details class="menu" data-testid="mp-options">
            <summary>{t('mp.options')}</summary>
            <div class="pop">
              <label class="check"
                ><input
                  type="checkbox"
                  bind:checked={prefs.readOnly}
                  data-testid="mp-lecture-seule"
                />
                {t('mp.lecture_seule')}</label
              >
              <label
                >{t('mp.memorisation')}
                <select bind:value={prefs.memo} data-testid="mp-memo">
                  {#each [0, 1, 2, 3] as l (l)}<option value={l}>{t(`mp.memo_${l}`)}</option>{/each}
                </select></label
              >
              <label class="check"
                ><input type="checkbox" bind:checked={prefs.single} data-testid="mp-vue-mobile" />
                {t('mp.vue_mobile')}</label
              >
            </div>
          </details>
        </div>
        <div class="row">
          <label
            >{t('mp.sourate')}
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
          <label
            >{t('mp.verset')}
            <input
              type="number"
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
          <span class="pager">
            <button
              type="button"
              onclick={() => turn(-1)}
              disabled={p <= 1}
              aria-label={t('mp.page_precedente')}
              data-testid="mp-prec"><Icon name="fleche" size={20} /></button
            >
            <label
              >{t('mp.page')}
              <input
                type="number"
                min="1"
                max="604"
                value={p}
                onchange={(e) => goPage(Number(e.currentTarget.value))}
                data-testid="mp-page"
              /></label
            >
            <button
              type="button"
              onclick={() => turn(1)}
              disabled={p >= 604 || (double && spreadOf(p)[1] >= 604)}
              aria-label={t('mp.page_suivante')}
              data-testid="mp-suiv"
              ><span class="back"><Icon name="fleche" size={20} /></span></button
            >
          </span>
          <label
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
        </div>
      </div>
    </section>
  </details>

  {#if results?.length || searchMsg}
    <section class="card results" aria-label={t('mp.resultats')} data-testid="mp-resultats">
      {#if searchMsg}<p class="muted"><Bidi text={searchMsg} /></p>{/if}
      {#if results?.length}<p class="muted small">{t('mp.recherche_portee')}</p>{/if}
      <ul>
        {#each results ?? [] as r (`${r.s}:${r.a}`)}<li>
            <button type="button" class="link" onclick={() => goVerse(r.s, r.a)}
              ><Bidi text={t('mp.resultat', { sourate: suraName(r.s), a: r.a })} /></button
            >
          </li>{/each}
      </ul>
    </section>
  {/if}

  <div class="reader" class:withTrad={!!trad}>
    <div class="book" class:double dir="rtl" bind:this={bookEl} data-testid="mushaf-livre">
      {#each shown as n (n)}
        <MushafPage
          p={n}
          segments={segs(n)}
          {text}
          basmala={meta?.basmala ?? ''}
          juz={meta ? juzOfPage(meta, n) : 1}
          tajwid={tajwidOn ? tajwidOf : null}
          current={cur}
          memo={prefs.memo}
          readOnly={prefs.readOnly}
          {revealed}
          compact={double}
          onpick={pick}
        />
      {/each}
    </div>

    {#if trad}
      <aside
        class="trad card"
        lang={trad.lang}
        dir="ltr"
        aria-label={t('mp.traduction_du_sens')}
        data-testid="mp-panneau-traduction"
      >
        <h2 class="small" lang={localeInfo().code} dir={localeInfo().dir}>
          <Bidi text={t('mp.traduction_du_sens')} />
        </h2>
        <ol>
          {#each shownVerses as r (ref(r))}
            {@const tv = trads[r[0]]?.verses.get(r[1])}
            <li
              data-trad={ref(r)}
              class:on={cur?.s === r[0] && cur?.a === r[1]}
              aria-current={cur?.s === r[0] && cur?.a === r[1] ? 'true' : undefined}
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
              {:else}<span class="muted">…</span>{/if}
            </li>
          {/each}
        </ol>
        <p class="muted small credit" lang={localeInfo().code} dir={localeInfo().dir}>
          <Bidi text={t('mp.credit_traduction', { titre: t(trad.label), version: trad.version })} />
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- lien externe -->
          <a href={trad.url} target="_blank" rel="noopener"><Bidi text={t('mp.lien_source')} /></a>
        </p>
      </aside>
    {/if}
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
  .bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr);
    gap: var(--space-s);
    background: var(--surface);
  }
  .cluster {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .cluster.audio {
    border-inline-end: 1px solid var(--line);
    padding-inline-end: var(--space-s);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  label {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    max-width: 100%;
    min-width: 0;
  }
  select,
  input {
    font: inherit;
    min-height: var(--target);
    max-width: 100%;
    min-width: 0;
  }
  .barwrap > .barsum {
    cursor: pointer;
    padding: 8px 12px;
    border-radius: var(--radius-md);
    background: var(--surface);
    font-weight: 700;
    min-height: var(--target);
  }
  @media (min-width: 901px) {
    .barwrap > .barsum {
      display: none;
    }
  }
  input[type='number'] {
    width: 4.5em;
  }
  .pager {
    display: inline-flex;
    gap: 4px;
    align-items: center;
  }
  .pager button {
    min-width: var(--target);
    display: inline-grid;
    place-items: center;
  }
  /* flèche de l'icône orientée vers la droite : « précédente » en RTL (livre arabe), « suivante » retournée */
  .back {
    display: inline-flex;
    transform: scaleX(-1);
  }
  .menu {
    position: relative;
  }
  .menu summary {
    cursor: pointer;
    padding: 6px 10px;
    border: 1px solid var(--line);
    border-radius: var(--radius-pill);
    background: var(--card);
    min-height: var(--target);
    display: inline-flex;
    align-items: center;
  }
  .pop {
    position: absolute;
    z-index: 5;
    inset-inline-start: 0;
    top: calc(100% + 4px);
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 240px;
    padding: var(--space-s);
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-float);
  }
  .check {
    gap: 8px;
  }
  .search {
    display: inline-flex;
    gap: 4px;
    flex: 1;
    min-width: 200px;
  }
  .search input {
    flex: 1;
    min-width: 0;
  }
  .player {
    min-width: 0;
  }
  .reader {
    display: grid;
    gap: var(--space-m);
    margin-top: var(--space-m);
  }
  .reader.withTrad {
    grid-template-columns: minmax(0, 2.2fr) minmax(260px, 1fr);
  }
  /* ordinateur : le livre sort de la colonne de lecture (double page plus proche d'un Muṣḥaf imprimé) */
  @media (min-width: 901px) {
    .reader {
      margin-inline: calc((100% - min(1400px, 100vw - 48px)) / 2);
    }
  }
  .book {
    display: grid;
    gap: 6px;
    touch-action: pan-y;
  }
  .book.double {
    grid-template-columns: 1fr 1fr;
  }
  .trad {
    max-height: 80vh;
    overflow: auto;
    position: sticky;
    top: var(--space-s);
  }
  .trad ol {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .trad li {
    padding: 6px 8px;
    border-radius: var(--radius-sm);
    line-height: 1.55;
  }
  .trad li.on {
    background: var(--mark);
  }
  .tref {
    font-size: 0.8rem;
    padding: 0 6px;
    margin-inline-end: 6px;
    min-height: 0;
  }
  .notes p {
    font-size: 0.85rem;
    margin: 4px 0;
  }
  .results ul {
    margin: 0;
    padding-inline-start: 1.2em;
  }
  .link {
    background: none;
    border: 0;
    color: var(--primary);
    text-decoration: underline;
    min-height: 0;
    cursor: pointer;
  }
  .small {
    font-size: 0.9rem;
  }
  .credits {
    margin-top: var(--space-s);
  }
  @media (max-width: 900px) {
    .bar {
      grid-template-columns: minmax(0, 1fr);
    }
    .cluster.audio {
      border-inline-end: 0;
      padding-inline-end: 0;
      border-bottom: 1px solid var(--line);
      padding-bottom: var(--space-s);
    }
    .reader.withTrad {
      grid-template-columns: minmax(0, 1fr);
    }
    .trad {
      position: static;
      max-height: 50vh;
    }
  }
</style>
