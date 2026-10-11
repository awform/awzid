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
  import LignesExactes from './LignesExactes.svelte';
  import type { ExactPage } from './mushaf-exact';

  /**
   * Muṣḥaf par page — UNE page du Muṣḥaf de Médine (versets de la page d'après les métadonnées Tanzil) dans un
   * cadre orné dessiné par nous (SVG géométrique épuré : treillis d'étoiles à huit pointes, rosaces aux coins,
   * cartouche des sourates ; aucune figuration). Palette VERTE du Muṣḥaf (jetons --mp-*, 04/10/2026). Texte
   * Tanzil tel quel, découpé en mots aux espaces seulement ; couleurs du tajwid = enveloppes ; masquage = voile à
   * l'affichage ; numéros de verset dans des rosettes (ornement hors du texte). Mise en page FLUIDE (lignes non
   * exactes : docs/projet/SOURCES_MUSHAF.md § 1).
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
    riwaya = null,
    exact = null,
    onpick,
  }: {
    /**
     * A34 — lignes EXACTES de la page (copie Content Sync + police QCF de la page déjà chargée) : affichées dans
     * ce même cadre à la place de la mise en page fluide. Null = mise en page fluide.
     */
    exact?: ExactPage | null;
    /**
     * A8 — muṣḥaf d'une autre riwāya que Ḥafṣ : texte du Complexe affiché TEL QUEL (avec son signe de fin de
     * verset et son numéro, dessinés par la police du Complexe), noms de sourate du Complexe, aucune retouche
     * (ni basmala séparée, ni tanwīn, ni tajwid, ni masquage, ni rosette ajoutée).
     */
    riwaya?: { family: string; suraName: (s: number) => string | undefined } | null;
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
    onpick?: (s: number, a: number, el: HTMLElement) => void;
  } = $props();
  function key(e: KeyboardEvent, s: number, a: number) {
    if (readOnly || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    onpick?.(s, a, e.currentTarget as HTMLElement);
  }

  const sep = (i: number) => (i > 0 ? ' ' : '');
  const uid = $derived(`mp-lattice-${p}`);
  const firstSura = $derived(segments[0]?.s ?? 1);
  /** chiffres arabes seuls : la rosette remplace le signe ۝ (ornement, jamais dans le texte coranique) */
  const num = (a: number) => ayaNumberAr(a).slice(1);
  const complete = $derived(
    segments.every((g) => {
      for (let a = g.from; a <= g.to; a++) if (text(g.s, a) === undefined) return false;
      return true;
    }),
  );
  /** étoile à huit pointes (deux carrés tournés), centrée en 0,0 */
  const star = (r: number) => {
    const q = r * 0.7071;
    return `M0 ${-r}L${q} ${-q}L${r} 0L${q} ${q}L0 ${r}L${-q} ${q}L${-r} 0L${-q} ${-q}Z`;
  };
</script>

<article
  class="page"
  class:readonly={readOnly}
  class:compact
  data-page={p}
  data-exact={exact ? '1' : undefined}
  data-testid="mushaf-page"
  aria-label={t('mp.page_aria', { n: p })}
>
  <svg class="frame" aria-hidden="true" focusable="false">
    <defs>
      <pattern id={uid} width="28" height="28" patternUnits="userSpaceOnUse">
        <g class="lat" transform="translate(14 14)">
          <rect x="-5" y="-5" width="10" height="10" />
          <rect x="-5" y="-5" width="10" height="10" transform="rotate(45)" />
        </g>
        <circle class="lat-dot" cx="0" cy="0" r="1.1" />
        <circle class="lat-dot" cx="28" cy="0" r="1.1" />
        <circle class="lat-dot" cx="0" cy="28" r="1.1" />
        <circle class="lat-dot" cx="28" cy="28" r="1.1" />
      </pattern>
    </defs>
    <rect x="0" y="0" width="100%" height="100%" fill={`url(#${uid})`} />
  </svg>
  {#each ['tr', 'tl', 'br', 'bl'] as c (c)}
    <svg class="rosette {c}" viewBox="-20 -20 40 40" aria-hidden="true" focusable="false">
      <path d={star(17)} class="r-out" />
      <path d={star(11)} class="r-in" transform="rotate(22.5)" />
      <circle r="4.2" class="r-heart" />
    </svg>
  {/each}

  <div class="inner">
    <header class="running" lang={localeInfo().code} dir={localeInfo().dir}>
      <span data-testid="page-juz"><Bidi text={t('mp.juz_n', { n: juz })} /></span>
      {#if riwaya}<span class="sura-ar rw" style:font-family={riwaya.family}
          ><Bidi text={riwaya.suraName(firstSura) ?? ''} base="ar" /></span
        >{:else}<span class="sura-ar"><Bidi text={suraTitleAr(firstSura)} base="ar" /></span>{/if}
    </header>

    <div
      class="body"
      class:riwaya={!!riwaya}
      lang="ar"
      dir="rtl"
      style:--rw-font={riwaya ? `${riwaya.family}` : undefined}
    >
      {#if exact}
        <LignesExactes page={exact} {text} {basmala} {current} {readOnly} {onpick} />
      {:else}
        {#if !complete}<p class="loading small" lang={localeInfo().code} dir={localeInfo().dir}>
            {t('mp.chargement')}
          </p>{/if}
        {#each segments as g (g.s)}
          {#if g.from === 1}
            <div class="band" data-sura-start={g.s}>
              <svg
                class="cartouche"
                viewBox="0 0 400 48"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d="M30 3 H370 Q384 3 397 24 Q384 45 370 45 H30 Q16 45 3 24 Q16 3 30 3 Z"
                  class="cart-out"
                  vector-effect="non-scaling-stroke"
                />
                <path
                  d="M34 8 H366 Q377 8 387 24 Q377 40 366 40 H34 Q23 40 13 24 Q23 8 34 8 Z"
                  class="cart-in"
                  vector-effect="non-scaling-stroke"
                />
              </svg>
              <svg class="medal s" viewBox="-12 -12 24 24" aria-hidden="true" focusable="false"
                ><path d={star(10)} /><circle r="3" /></svg
              >
              {#if riwaya}<span class="band-title rw"
                  ><Bidi text={riwaya.suraName(g.s) ?? ''} base="ar" /></span
                >{:else}<span class="band-title"><Bidi text={suraTitleAr(g.s)} base="ar" /></span
                >{/if}
              <svg class="medal e" viewBox="-12 -12 24 24" aria-hidden="true" focusable="false"
                ><path d={star(10)} /><circle r="3" /></svg
              >
            </div>
          {/if}
          <p class="flow">
            {#each Array.from({ length: g.to - g.from + 1 }, (_, i) => g.from + i) as a (a)}
              {@const raw = text(g.s, a)}
              {#if raw !== undefined && riwaya}
                <span
                  class="aya"
                  class:on={current?.s === g.s && current?.a === a}
                  data-aya={`${g.s}:${a}`}
                  role="button"
                  tabindex={readOnly ? -1 : 0}
                  aria-disabled={readOnly ? 'true' : undefined}
                  aria-haspopup={readOnly ? undefined : 'dialog'}
                  onclick={(e) => !readOnly && onpick?.(g.s, a, e.currentTarget)}
                  onkeydown={(e) => key(e, g.s, a)}
                  ><span class="quran-text rw-text" data-verse={`${g.s}:${a}`}>{raw}</span></span
                >
              {:else if raw !== undefined}
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
                  aria-haspopup={readOnly ? undefined : 'dialog'}
                  onclick={(e) => !readOnly && onpick?.(g.s, a, e.currentTarget)}
                  onkeydown={(e) => key(e, g.s, a)}
                  ><span class="quran-text" data-verse={`${g.s}:${a}`}
                    >{#each ws as w, i (i)}{sep(i)}<span class="w" class:voile={!vis[i]}
                        >{#if tv}<TajwidRuns runs={tv.words[i] ?? []} />{:else}{tanwinDisplay(
                            w,
                          )}{/if}</span
                      >{/each}</span
                  ><span class="n" aria-hidden="true"><Bidi text={num(a)} base="ar" /></span></span
                >
              {/if}
            {/each}
          </p>
        {/each}
      {/if}
    </div>

    <footer class="folio" lang={localeInfo().code} dir={localeInfo().dir}>
      <span class="folio-n" data-testid="page-n">{fmtNumber(p, { useGrouping: false })}</span>
    </footer>
  </div>
</article>

<style>
  .page {
    position: relative;
    display: flex;
    min-height: 100%;
    padding: 20px;
    color: var(--mp-green);
    background: var(--mp-mint);
    border: 1px solid var(--mp-green);
    border-radius: var(--radius-md);
    /* double filet : menthe puis or, à l'intérieur du filet vert */
    box-shadow:
      inset 0 0 0 4px var(--mp-mint),
      inset 0 0 0 5px var(--mp-gold),
      var(--shadow-card);
    animation: mp-in var(--motion) ease-out;
  }
  @keyframes mp-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
  .frame {
    position: absolute;
    inset: 6px;
    width: calc(100% - 12px);
    height: calc(100% - 12px);
    opacity: 0.32;
  }
  .lat {
    fill: none;
    stroke: var(--mp-green);
    stroke-width: 0.8;
  }
  .lat-dot {
    fill: var(--mp-gold);
  }
  .rosette {
    position: absolute;
    z-index: 1;
    width: 34px;
    height: 34px;
  }
  .rosette.tr {
    top: 3px;
    right: 3px;
  }
  .rosette.tl {
    top: 3px;
    left: 3px;
  }
  .rosette.br {
    bottom: 3px;
    right: 3px;
  }
  .rosette.bl {
    bottom: 3px;
    left: 3px;
  }
  .r-out {
    fill: var(--mp-paper);
    stroke: var(--mp-green);
    stroke-width: 1.4;
    stroke-linejoin: round;
  }
  .r-in {
    fill: var(--mp-mint2);
    stroke: var(--mp-gold);
    stroke-width: 1;
  }
  .r-heart {
    fill: var(--mp-green);
  }
  .inner {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 12px 20px 10px;
    color: var(--mp-ink);
    background: var(--mp-paper);
    border: 1px solid var(--mp-green);
    border-radius: 3px;
    box-shadow:
      0 0 0 3px var(--mp-paper),
      0 0 0 4px var(--mp-gold);
  }
  .running {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    padding: 0 10px 6px;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--mp-ink2);
    border-bottom: 1px solid color-mix(in srgb, var(--mp-gold) 55%, transparent);
  }
  .sura-ar {
    font-family: var(--font-quran);
    font-size: 1rem;
    font-weight: 400;
    color: var(--mp-green);
  }
  .body {
    flex: 1;
    padding-top: 8px;
  }
  .loading {
    color: var(--mp-ink2);
  }
  .flow {
    margin: 0;
    text-align: justify;
    text-align-last: center;
    font-family: var(--font-quran);
    /* --qz : taille du texte choisie (réglage « Taille du texte », « Plus grand ») */
    font-size: calc(clamp(1.3rem, 1.1rem + 0.9vw, 1.8rem) * var(--qz, 1));
    line-height: 2.3;
  }
  .compact .flow {
    font-size: calc(clamp(1.1rem, 0.55rem + 0.85vw, 1.55rem) * var(--qz, 1));
    line-height: 2.15;
  }
  .band {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 2.9rem;
    margin: 12px 0 6px;
  }
  .cartouche {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .cart-out {
    fill: var(--mp-band);
    stroke: var(--mp-green);
    stroke-width: 1;
  }
  .cart-in {
    fill: none;
    stroke: var(--mp-gold);
    stroke-width: 1;
  }
  .medal {
    position: relative;
    width: 18px;
    height: 18px;
    flex: none;
  }
  .medal path {
    fill: none;
    stroke: var(--mp-gold);
    stroke-width: 1.4;
  }
  .medal circle {
    fill: var(--mp-gold);
  }
  .band-title {
    position: relative;
    font-family: var(--font-quran);
    font-size: 1.4rem;
    line-height: 1;
    color: var(--mp-on-band);
  }
  /* A8 : police fournie par le Complexe pour la riwāya (repli : police coranique de l'application) */
  .body.riwaya .flow,
  .body.riwaya .quran-text,
  .body.riwaya .band-title {
    font-family: var(--rw-font), var(--font-quran);
  }
  .body.riwaya .flow {
    line-height: 2.5;
  }
  .basmala {
    display: block;
    margin: 2px 0 4px;
    text-align: center;
    font-size: 1.06em;
  }
  .aya {
    border-radius: 8px;
    cursor: pointer;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
    transition:
      background-color var(--motion) ease,
      box-shadow var(--motion) ease;
  }
  /* espace entre deux versets (point de coupure et justification), hors du texte coranique */
  .aya::after {
    content: ' ';
  }
  .readonly .aya {
    cursor: default;
  }
  @media (hover: hover) {
    .page:not(.readonly) .aya:hover {
      background: color-mix(in srgb, var(--mp-mark) 55%, transparent);
    }
  }
  .aya.on,
  .page:not(.readonly) .aya.on:hover {
    background: var(--mp-mark);
    box-shadow: 0 0 0 3px var(--mp-mark);
  }
  .aya:focus-visible {
    outline: 2px solid var(--mp-green);
    outline-offset: 2px;
  }
  /* numéro de verset dans une rosette verte (étoile à huit pointes) */
  .n {
    position: relative;
    display: inline-grid;
    place-items: center;
    width: 2.1em;
    height: 2.1em;
    margin-inline: 3px;
    vertical-align: -0.1em;
    font-family: var(--font-quran);
    font-size: 0.68em;
    line-height: 1;
    color: var(--mp-green);
    white-space: nowrap;
  }
  .n::before {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--mp-green);
    -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='-20 -20 40 40'%3E%3Cg fill='none' stroke='%23000' stroke-linejoin='round'%3E%3Cpath stroke-width='2.4' d='M0-18L5.3-12.7H12.7V-5.3L18 0 12.7 5.3V12.7H5.3L0 18-5.3 12.7H-12.7V5.3L-18 0-12.7-5.3V-12.7H-5.3Z'/%3E%3C/g%3E%3C/svg%3E")
      center / contain no-repeat;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='-20 -20 40 40'%3E%3Cg fill='none' stroke='%23000' stroke-linejoin='round'%3E%3Cpath stroke-width='2.4' d='M0-18L5.3-12.7H12.7V-5.3L18 0 12.7 5.3V12.7H5.3L0 18-5.3 12.7H-12.7V5.3L-18 0-12.7-5.3V-12.7H-5.3Z'/%3E%3C/g%3E%3C/svg%3E")
      center / contain no-repeat;
  }
  .w.voile {
    color: transparent;
    background: var(--mp-mint2);
    border-radius: 4px;
  }
  .folio {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
  }
  .folio::before,
  .folio::after {
    content: '';
    flex: 1;
    height: 1px;
    background: color-mix(in srgb, var(--mp-gold) 55%, transparent);
  }
  .folio-n {
    min-width: 2.6em;
    padding: 1px 10px;
    text-align: center;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--mp-green);
    border: 1px solid var(--mp-green);
    border-radius: var(--radius-pill);
  }
  .small {
    font-size: 0.9rem;
  }
  @media (max-width: 520px) {
    .page {
      padding: 12px;
    }
    .rosette {
      width: 24px;
      height: 24px;
    }
    .inner {
      padding: 10px 10px 8px;
    }
    .running {
      padding-inline: 4px;
    }
  }
</style>
