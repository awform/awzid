<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { splitBasmala, suraName } from '@awform/hifz';
  import { loadMeta, loadVerses } from '$lib/hifz';
  import { fmtNumber, t } from '$lib/i18n';

  /**
   * Lecteur coranique (ARCHITECTURE_V2 § 8.2 bis, lot C1) — SANS AUDIO tant qu'aucune récitation n'est
   * sous licence écrite : navigation sourate / verset, texte Tanzil tel quel (octet par octet, découpé en
   * mots aux espaces seulement), lecture guidée mot à mot (le surlignage est prêt pour l'audio), répétition
   * d'un verset ou d'une plage N fois avec une pause « à toi », vitesse réglable, sourate gardée sur
   * l'appareil. Choix du récitant et page du Muṣḥaf : « bientôt ».
   */
  type Verse = { s: number; a: number; text: string };
  let meta = $state<{ weights: number[][]; basmala: string } | null>(null);
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
  /** Séparateur entre deux mots : l'espace du texte Tanzil, rien d'autre. */
  const sep = (i: number) => (i > 0 ? ' ' : '');
  const words = (v: Verse) => splitBasmala(v.s, v.a, v.text, meta?.basmala ?? '');

  onMount(async () => {
    meta = await loadMeta();
    const s = Number(page.url.searchParams.get('s'));
    await openSura(s >= 1 && s <= 114 ? s : 1);
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

<p><a href={resolve('/coran')}>{t('lecteur.retour')}</a></p>
<h1>{t('lecteur.titre')}</h1>

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
  <label
    >{t('lecteur.recitant')}
    <select disabled data-testid="recitant"><option>{t('lecteur.bientot')}</option></select></label
  >
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
</section>

<section class="card mushaf" data-testid="sourate-texte" lang="ar" dir="rtl">
  <h2 class="titre">{suraName(sura)}</h2>
  {#each verses as v (v.a)}
    {@const parts = words(v)}
    {#if parts.basmala}<p class="basmala">
        <span class="quran-text" data-basmala={`${v.s}:${v.a}`}>{parts.basmala}</span>
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
            data-w={i}>{w}</span
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
    background: #ffe38a;
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
