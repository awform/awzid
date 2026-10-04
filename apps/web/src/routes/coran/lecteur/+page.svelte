<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { tanwinDisplay } from '@awform/content/text';
  import { splitBasmala, suraName, type QuranMeta } from '@awform/hifz';
  import CoranTabs from '$lib/quran/CoranTabs.svelte';
  import { loadMeta, loadVerses } from '$lib/hifz';
  import { fmtNumber, t } from '$lib/i18n';

  /**
   * Lecteur coranique (ARCHITECTURE_V2 § 8.2 bis, lot C1) — SANS AUDIO tant qu'aucune récitation n'est
   * sous licence écrite : navigation sourate / verset, texte Tanzil tel quel (octet par octet, découpé en
   * mots aux espaces seulement), lecture guidée mot à mot (le surlignage est prêt pour l'audio), répétition
   * d'un verset ou d'une plage N fois avec une pause « à toi », vitesse réglable, sourate gardée sur
   * l'appareil. Lot 27 : onglet « Lire » de l'espace Coran — aller à une sourate, un juzʾ, un ḥizb ou une
   * page du Muṣḥaf de Médine (repères de page dans le texte) ; l'écoute d'un récitateur est dans « Écouter ».
   */
  type Verse = { s: number; a: number; text: string };
  let meta = $state<(QuranMeta & { basmala: string }) | null>(null);
  let goKind = $state<'juz' | 'hizb' | 'page'>('page');
  let goN = $state(1);
  let sura = $state(1);
  let verses: Verse[] = $state([]);
  let from = $state(1);
  let to = $state(1);
  let repeat = $state(3);
  let pause = $state(3);
  let speed = $state(1);
  let playing = $state(false);
  let cur = $state<{ a: number; w: number } | null>(null);
  let round = $state(0);
  let yourTurn = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const count = $derived(meta?.weights[sura - 1]?.length ?? 0);
  /** début de chaque page du Muṣḥaf dans la sourate ouverte : verset → numéro de page */
  const pageStarts = $derived(
    new Map(
      (meta?.divisions?.pages ?? [])
        .map((p, i) => [p, i + 1] as const)
        .filter(([p]) => p[0] === sura)
        .map(([p, n]) => [p[1], n]),
    ),
  );
  const goMax = $derived(goKind === 'juz' ? 30 : goKind === 'hizb' ? 60 : 604);
  /** Début d'un juzʾ, d'un ḥizb (4 quarts) ou d'une page : [sourate, verset]. */
  function startOf(kind: 'juz' | 'hizb' | 'page', n: number): readonly [number, number] | null {
    const d = meta?.divisions;
    if (!d) return null;
    if (kind === 'juz') return d.juz[n - 1] ?? null;
    if (kind === 'hizb') return d.quarters[(n - 1) * 4] ?? null;
    return d.pages[n - 1] ?? null;
  }
  async function goTo(e?: SubmitEvent) {
    e?.preventDefault();
    const st = startOf(goKind, Math.max(1, Math.min(goMax, Math.round(goN))));
    if (!st) return;
    if (st[0] !== sura) await openSura(st[0]);
    from = st[1];
    to = st[1];
    document.querySelector(`[data-verse="${st[0]}:${st[1]}"]`)?.scrollIntoView({ block: 'center' });
  }
  /** Séparateur entre deux mots : l'espace du texte Tanzil, rien d'autre. */
  const sep = (i: number) => (i > 0 ? ' ' : '');
  const words = (v: Verse) => splitBasmala(v.s, v.a, v.text, meta?.basmala ?? '');

  onMount(async () => {
    meta = await loadMeta();
    const s = Number(page.url.searchParams.get('s'));
    await openSura(s >= 1 && s <= 114 ? s : 1);
    const p = Number(page.url.searchParams.get('page'));
    if (p >= 1 && p <= 604) {
      goKind = 'page';
      goN = p;
      await goTo();
    }
  });
  onDestroy(stop);

  let seq = 0;
  async function openSura(s: number) {
    stop();
    sura = s;
    const tok = ++seq;
    const got = await loadVerses(s, 1, meta?.weights[s - 1]?.length ?? 1);
    if (tok !== seq) return; // une autre sourate a été choisie entre-temps
    verses = got;
    from = 1;
    to = Math.min(verses.length, 1);
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- chemin résolu, suivi d'un paramètre
    void goto(`${resolve('/coran/lecteur')}?s=${s}`, {
      replaceState: true,
      keepFocus: true,
      noScroll: true,
    });
  }

  /** Lecture guidée : un mot après l'autre (≈ 1,6 mot par seconde à la vitesse 1), plage répétée. */
  function play() {
    stop();
    playing = true;
    round = 1;
    step({ a: from, w: 0 });
  }
  function step(pos: { a: number; w: number }) {
    const v = verses[pos.a - 1];
    if (!v) return stop();
    const n = words(v).rest.split(' ').length;
    if (pos.w >= n) {
      if (pos.a < to) return step({ a: pos.a + 1, w: 0 });
      if (round < repeat) {
        // pause « à toi » : l'élève récite seul, puis on reprend
        yourTurn = true;
        cur = null;
        timer = setTimeout(() => {
          yourTurn = false;
          round++;
          step({ a: from, w: 0 });
        }, pause * 1000);
        return;
      }
      return stop();
    }
    cur = pos;
    timer = setTimeout(() => step({ a: pos.a, w: pos.w + 1 }), 620 / speed);
  }
  function stop() {
    if (timer) clearTimeout(timer);
    timer = null;
    playing = false;
    yourTurn = false;
    cur = null;
  }
  function pickVerse(a: number) {
    if (playing) return;
    if (a < from || from !== to) {
      from = a;
      to = a;
    } else to = Math.max(from, a);
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('lecteur.titre')}</title></svelte:head>

<h1>{t('lecteur.titre')}</h1>
<CoranTabs current="lire" />

<section class="card controls">
  <label
    >{t('lecteur.sourate')}
    <select
      value={sura}
      onchange={(e) => openSura(Number(e.currentTarget.value))}
      data-testid="sourate"
    >
      {#each Array.from({ length: 114 }, (_, i) => i + 1) as s (s)}<option value={s}
          >{fmtNumber(s)}. {suraName(s)}</option
        >{/each}
    </select></label
  >
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- chemin résolu, suivi d'un paramètre -->
  <a class="button" href={`${resolve('/coran/ecouter')}?s=${sura}`} data-testid="recitant"
    >{t('ca.ecouter_sourate')}</a
  >
  <form class="row aller" onsubmit={goTo} data-testid="aller-a">
    <label
      >{t('ca.aller_a')}
      <select bind:value={goKind} data-testid="aller-type">
        <option value="juz">{t('ca.juz')}</option>
        <option value="hizb">{t('ca.hizb')}</option>
        <option value="page">{t('ca.page')}</option>
      </select></label
    >
    <input
      type="number"
      min="1"
      max={goMax}
      bind:value={goN}
      aria-label={t('ca.numero')}
      data-testid="aller-n"
    />
    <button type="submit">{t('ca.aller')}</button>
  </form>
  <p class="muted small">{t('lecteur.sans_audio')}</p>
  <div class="row">
    <label
      >{t('lecteur.plage')}
      <input type="number" min="1" max={count} bind:value={from} data-testid="de" /></label
    >
    <label
      >{t('lecteur.a')}
      <input type="number" min={from} max={count} bind:value={to} data-testid="a" /></label
    >
    <label
      >{t('lecteur.repeter')}
      <input type="number" min="1" max="20" bind:value={repeat} data-testid="repeter" /></label
    >
    <label
      >{t('lecteur.pause')}
      <input type="number" min="0" max="30" bind:value={pause} data-testid="pause" /></label
    >
    <label
      >{t('lecteur.vitesse')}
      <input
        type="range"
        min="0.5"
        max="1.5"
        step="0.25"
        bind:value={speed}
        data-testid="vitesse"
      />
      {fmtNumber(speed)}×</label
    >
  </div>
  <div class="row">
    {#if playing}<button type="button" onclick={stop} data-testid="arreter"
        >{t('lecteur.arreter')}</button
      >
    {:else}<button type="button" class="primary" onclick={play} data-testid="lire"
        >{t('lecteur.lire')}</button
      >{/if}
    {#if playing}<span class="muted" data-testid="tour"
        >{t('lecteur.tour', { n: round, total: repeat })}</span
      >{/if}
    {#if yourTurn}<span class="aToi" role="status" data-testid="a-toi">{t('lecteur.a_toi')}</span
      >{/if}
  </div>
  <p class="muted small">{t('lecteur.page_mushaf')}</p>
  <p class="muted small">{t('lecteur.credit')}</p>
</section>

<section class="card mushaf" data-testid="sourate-texte" lang="ar" dir="rtl">
  <h2 class="titre">{suraName(sura)}</h2>
  {#each verses as v (v.a)}
    {@const parts = words(v)}
    {#if pageStarts.has(v.a)}<p
        class="page-mark"
        data-page={pageStarts.get(v.a)}
        lang="fr"
        dir="ltr"
      >
        {t('ca.page_n', { n: pageStarts.get(v.a) ?? 0 })}
      </p>{/if}
    {#if parts.basmala}<p class="basmala">
        <span class="quran-text" data-basmala={`${v.s}:${v.a}`}>{tanwinDisplay(parts.basmala)}</span
        >
      </p>{/if}
    <div
      class="aya"
      class:range={v.a >= from && v.a <= to}
      onclick={() => pickVerse(v.a)}
      onkeydown={(e) => e.key === 'Enter' && pickVerse(v.a)}
      role="button"
      tabindex="0"
    >
      <span class="quran-text" data-verse={`${v.s}:${v.a}`}
        >{#each parts.rest.split(' ') as w, i (i)}{sep(i)}<span
            class="w"
            class:on={cur?.a === v.a && cur?.w === i}
            data-w={i}>{tanwinDisplay(w)}</span
          >{/each}</span
      >
      <span class="n" aria-hidden="true">{fmtNumber(v.a, { useGrouping: false })}</span>
    </div>
  {/each}
</section>

<style>
  .controls label {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    margin-inline-end: 12px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin: 6px 0;
  }
  input[type='number'] {
    width: 4.5em;
  }
  select,
  input {
    font: inherit;
  }
  .titre {
    text-align: center;
  }
  .basmala {
    text-align: center;
  }
  .page-mark {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 10px 0 2px;
    font-size: 0.8rem;
    color: var(--ink2);
    font-family: var(--font-ui);
  }
  .page-mark::before,
  .page-mark::after {
    content: '';
    flex: 1;
    border-top: 1px solid var(--line);
  }
  .aya {
    font-size: 1.7rem;
    line-height: 2.3;
    margin: 0;
    cursor: pointer;
    border-radius: 8px;
  }
  .aya.range {
    background: var(--sand);
  }
  .w.on {
    background: var(--mark);
    border-radius: 6px;
  }
  .n {
    display: inline-block;
    min-width: 1.8em;
    margin-inline-start: 6px;
    border: 1px solid var(--line);
    border-radius: 999px;
    font-size: 0.8rem;
    text-align: center;
    font-family: inherit;
  }
  .aToi {
    font-weight: 800;
    color: var(--ok-ink);
  }
  .small {
    font-size: 0.9rem;
  }
</style>
