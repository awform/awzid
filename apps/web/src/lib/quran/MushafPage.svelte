<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { tanwinDisplay } from '@awform/content/text';
  import { splitBasmala } from '@awform/hifz';
  import { fmtNumber, localeInfo, t } from '$lib/i18n';
  import { visibleWords } from './player';
  import type { PageSegment } from './mushaf';
  import { suraTitleAr, ayaNumberAr } from './sura-names-ar';
  import { verseRuns, type TajwidSura } from './tajwid';
  import TajwidRuns from './TajwidRuns.svelte';

  /**
   * Muṣḥaf par page — UNE page du Muṣḥaf de Médine (versets de la page d'après les métadonnées Tanzil) dans un
   * cadre orné dessiné par nous (SVG géométrique et floral, sans figuration). Texte Tanzil tel quel, découpé en
   * mots aux espaces seulement ; couleurs du tajwid = enveloppes ; masquage = voile à l'affichage. Mise en page
   * FLUIDE (lignes non exactes : docs/projet/SOURCES_MUSHAF.md § 1).
   */
  let {
    p,
    segments,
    text,
    basmala,
    juz,
    tajwid = null,
    current = null,
    memo = 0,
    readOnly = false,
    revealed = new Set<string>(),
    compact = false,
    onpick,
  }: {
    /** double page : texte un peu plus petit (page entière plus visible) */
    compact?: boolean;
    p: number;
    segments: PageSegment[];
    text: (s: number, a: number) => string | undefined;
    basmala: string;
    juz: number;
    tajwid?: ((s: number) => TajwidSura | null) | null;
    current?: { s: number; a: number } | null;
    memo?: number;
    readOnly?: boolean;
    revealed?: Set<string>;
    onpick?: (s: number, a: number) => void;
  } = $props();

  const sep = (i: number) => (i > 0 ? ' ' : '');
  const uid = $derived(`mp-band-${p}`);
  const firstSura = $derived(segments[0]?.s ?? 1);
  const complete = $derived(
    segments.every((g) => {
      for (let a = g.from; a <= g.to; a++) if (text(g.s, a) === undefined) return false;
      return true;
    }),
  );
</script>

<article
  class="page"
  class:readonly={readOnly}
  class:compact
  data-page={p}
  data-testid="mushaf-page"
  aria-label={t('mp.page_aria', { n: p })}
>
  <svg class="frame" aria-hidden="true" focusable="false">
    <defs>
      <pattern id={uid} width="22" height="22" patternUnits="userSpaceOnUse">
        <rect
          x="5"
          y="5"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          stroke-width="1"
        />
        <rect
          x="5"
          y="5"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          stroke-width="1"
          transform="rotate(45 11 11)"
        />
        <circle cx="11" cy="11" r="1.8" fill="currentColor" />
        <circle cx="0" cy="0" r="1.2" fill="currentColor" />
        <circle cx="22" cy="0" r="1.2" fill="currentColor" />
        <circle cx="0" cy="22" r="1.2" fill="currentColor" />
        <circle cx="22" cy="22" r="1.2" fill="currentColor" />
      </pattern>
    </defs>
    <rect x="0" y="0" width="100%" height="100%" fill={`url(#${uid})`} />
  </svg>
  {#each ['tr', 'tl', 'br', 'bl'] as c (c)}
    <svg class="rosette {c}" viewBox="-20 -20 40 40" aria-hidden="true" focusable="false">
      {#each [0, 45, 90, 135, 180, 225, 270, 315] as r (r)}<ellipse
          rx="5"
          ry="13"
          cy="-7"
          transform={`rotate(${r})`}
          class="petal"
        />{/each}
      <circle r="6" class="heart" />
      <circle r="2.4" class="dot" />
    </svg>
  {/each}

  <div class="inner">
    <header class="running" lang={localeInfo().code} dir={localeInfo().dir}>
      <span data-testid="page-juz"><Bidi text={t('mp.juz_n', { n: juz })} /></span>
      <span class="sura-ar"><Bidi text={suraTitleAr(firstSura)} base="ar" /></span>
    </header>

    <div class="body" lang="ar" dir="rtl">
      {#if !complete}<p class="muted small" lang={localeInfo().code} dir={localeInfo().dir}>
          {t('mp.chargement')}
        </p>{/if}
      {#each segments as g (g.s)}
        {#if g.from === 1}
          <div class="band" data-sura-start={g.s}>
            <svg
              class="cartouche"
              viewBox="0 0 400 44"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d="M22 4 H378 L396 22 L378 40 H22 L4 22 Z"
                class="cart-out"
                vector-effect="non-scaling-stroke"
              />
              <path
                d="M30 9 H370 L383 22 L370 35 H30 L17 22 Z"
                class="cart-in"
                vector-effect="non-scaling-stroke"
              />
            </svg>
            <span class="band-title"><Bidi text={suraTitleAr(g.s)} base="ar" /></span>
          </div>
        {/if}
        <p class="flow">
          {#each Array.from({ length: g.to - g.from + 1 }, (_, i) => g.from + i) as a (a)}
            {@const raw = text(g.s, a)}
            {#if raw !== undefined}
              {@const parts = splitBasmala(g.s, a, raw, basmala)}
              {@const tj = tajwid ? tajwid(g.s) : null}
              {@const tv = tj ? verseRuns({ s: g.s, a, text: raw }, basmala, tj) : null}
              {@const ws = parts.rest.split(' ')}
              {@const vis = visibleWords(ws.length, revealed.has(`${g.s}:${a}`) ? 0 : memo)}
              {#if parts.basmala}<span class="basmala"
                  ><span class="quran-text" data-basmala={`${g.s}:${a}`}
                    >{#if tv?.basmala}{#each tv.basmala as bw, i (i)}{sep(i)}<TajwidRuns
                          runs={bw}
                        />{/each}{:else}{tanwinDisplay(parts.basmala)}{/if}</span
                  ></span
                >{/if}
              <span
                class="aya"
                class:on={current?.s === g.s && current?.a === a}
                data-aya={`${g.s}:${a}`}
                role="button"
                tabindex={readOnly ? -1 : 0}
                aria-disabled={readOnly ? 'true' : undefined}
                onclick={() => !readOnly && onpick?.(g.s, a)}
                onkeydown={(e) => !readOnly && e.key === 'Enter' && onpick?.(g.s, a)}
                ><span class="quran-text" data-verse={`${g.s}:${a}`}
                  >{#each ws as w, i (i)}{sep(i)}<span class="w" class:voile={!vis[i]}
                      >{#if tv}<TajwidRuns runs={tv.words[i] ?? []} />{:else}{tanwinDisplay(
                          w,
                        )}{/if}</span
                    >{/each}</span
                ><span class="n" aria-hidden="true"><Bidi text={ayaNumberAr(a)} base="ar" /></span
                ></span
              >
            {/if}
          {/each}
        </p>
      {/each}
    </div>

    <footer class="folio" lang={localeInfo().code} dir={localeInfo().dir}>
      <span class="folio-n" data-testid="page-n">{fmtNumber(p, { useGrouping: false })}</span>
    </footer>
  </div>
</article>

<style>
  .page {
    position: relative;
    color: var(--accent);
    background: var(--sand);
    border-radius: var(--radius-sm);
    padding: 22px;
    box-shadow: var(--shadow-card);
    min-height: 100%;
    display: flex;
  }
  .frame {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0.55;
    border-radius: inherit;
  }
  .rosette {
    position: absolute;
    width: 40px;
    height: 40px;
  }
  .rosette.tr {
    top: 1px;
    right: 1px;
  }
  .rosette.tl {
    top: 1px;
    left: 1px;
  }
  .rosette.br {
    bottom: 1px;
    right: 1px;
  }
  .rosette.bl {
    bottom: 1px;
    left: 1px;
  }
  .petal {
    fill: var(--card);
    stroke: var(--accent);
    stroke-width: 1.2;
  }
  .heart {
    fill: var(--teal);
  }
  .dot {
    fill: var(--card);
  }
  .inner {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--card);
    color: var(--ink);
    border: 2px solid var(--accent);
    outline: 1px solid var(--teal);
    outline-offset: -6px;
    padding: 10px 16px 8px;
    min-width: 0;
  }
  .running {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 0.85rem;
    color: var(--ink2);
    font-family: var(--font-ui);
    border-bottom: 1px solid var(--line);
    padding-bottom: 4px;
  }
  .sura-ar {
    font-family: var(--font-quran);
  }
  .body {
    flex: 1;
    padding-top: 6px;
  }
  .flow {
    margin: 0;
    text-align: justify;
    text-align-last: center;
    font-family: var(--font-quran);
    font-size: clamp(1.3rem, 1.1rem + 0.9vw, 1.75rem);
    line-height: 2.25;
  }
  .compact .flow {
    font-size: clamp(1.1rem, 0.55rem + 0.85vw, 1.5rem);
    line-height: 2.1;
  }
  .band {
    position: relative;
    display: grid;
    place-items: center;
    height: 2.6rem;
    margin: 8px 0 4px;
  }
  .cartouche {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .cart-out {
    fill: var(--sand);
    stroke: var(--accent);
    stroke-width: 2;
  }
  .cart-in {
    fill: none;
    stroke: var(--teal);
    stroke-width: 1;
  }
  .band-title {
    position: relative;
    font-family: var(--font-quran);
    font-size: 1.35rem;
    color: var(--ink);
  }
  .basmala {
    display: block;
    text-align: center;
  }
  .aya {
    border-radius: 6px;
    cursor: pointer;
  }
  /* espace entre deux versets (point de coupure et justification), hors du texte coranique */
  .aya::after {
    content: ' ';
  }
  .readonly .aya {
    cursor: default;
  }
  .aya.on {
    background: var(--mark);
  }
  .aya:focus-visible {
    outline: 2px solid var(--focus);
  }
  .n {
    font-family: var(--font-quran);
    color: var(--teal);
    margin-inline: 2px;
    white-space: nowrap;
  }
  .w.voile {
    color: transparent;
    background: var(--surface);
    border-radius: 4px;
  }
  .folio {
    display: flex;
    justify-content: center;
    margin-top: 6px;
  }
  .folio-n {
    min-width: 2.4em;
    padding: 0 8px;
    text-align: center;
    border: 1px solid var(--accent);
    border-radius: var(--radius-pill);
    font-size: 0.85rem;
    color: var(--ink2);
  }
  .small {
    font-size: 0.9rem;
  }
  @media (max-width: 520px) {
    .page {
      padding: 14px;
    }
    .rosette {
      width: 26px;
      height: 26px;
    }
    .inner {
      padding: 8px 10px 6px;
    }
  }
</style>
