<script lang="ts">
  import {
    BSML_BASMALA,
    BSML_SOURATE,
    bsmlSuraName,
    displayLines,
    pageFontFile,
    pageVerseKeys,
    tanzilWords,
    type ExactPage,
  } from './mushaf-exact';
  import { fontFamily } from './mushaf-exact-load';
  import { suraTitleAr } from './sura-names-ar';

  /**
   * A34 — corps d'une page du Muṣḥaf de Médine « à l'identique » (édition 1405), placé DANS le cadre commun de
   * MushafPage (un seul style de cadre) : 15 lignes justifiées dessinées par la police « par page » du Complexe
   * (QCF_Pnnn, glyphes de la copie Content Sync), en-têtes de sourate (même cartouche que la page fluide) et
   * basmala en QCF_BSML. Le texte TANZIL reste la référence : boutons de verset pour lecteurs d'écran et clavier,
   * Ctrl+C = texte Tanzil ; les glyphes ne sont qu'une présentation (aria-hidden, non sélectionnables).
   */
  let {
    page,
    text,
    basmala,
    current = null,
    readOnly = false,
    onpick,
  }: {
    page: ExactPage;
    text: (s: number, a: number) => string | undefined;
    basmala: string;
    current?: { s: number; a: number } | null;
    readOnly?: boolean;
    onpick?: (s: number, a: number, el: HTMLElement) => void;
  } = $props();

  const lines = $derived(displayLines(page));
  const verses = $derived(pageVerseKeys(page));
  const heads = $derived(new Set(lines.flatMap((l) => (l.kind === 'sourate' ? [l.s] : []))));
  const family = $derived(fontFamily(pageFontFile(page.p)));
  const centered = $derived(page.p <= 2);
  const ar = (n: number) => new Intl.NumberFormat('ar-EG', { useGrouping: false }).format(n);
  let focused = $state('');

  // taille : la ligne la plus longue remplit la largeur ; hauteur bornée à celle d'une page (≈ 1,45 × largeur)
  let box = $state<HTMLDivElement>();
  let size = $state(20);
  $effect(() => {
    if (!box) return;
    const el = box;
    const gap = centered ? 0.25 : 0;
    const count = Math.max(lines.length, centered ? 8 : 15);
    const fit = () => {
      const ems = [...el.querySelectorAll<HTMLElement>('[data-mesure]')].map(
        (x) => x.scrollWidth / 100 + gap * (Number(x.dataset.mesure) - 1),
      );
      const w = el.clientWidth;
      const byWidth = (w / Math.max(1, ...ems)) * 0.985;
      const byHeight = (w * 1.45) / (count * 1.75);
      size = Math.max(10, Math.floor(Math.min(byWidth, byHeight) * 100) / 100);
    };
    fit();
    void document.fonts?.ready.then(fit);
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  });

  const glyphOf = (s: number, a: number) =>
    box?.querySelector<HTMLElement>(`[data-aya="${s}:${a}"]`) ?? null;
  function choose(s: number, a: number, el: HTMLElement) {
    if (!readOnly) onpick?.(s, a, glyphOf(s, a) ?? el);
  }

  /** Ctrl+C dans la page : le texte TANZIL (verset choisi, sinon toute la page), jamais les glyphes */
  function oncopy(e: ClipboardEvent) {
    const c = current;
    const keys =
      c && verses.some(([s, a]) => s === c.s && a === c.a)
        ? [[c.s, c.a] as [number, number]]
        : verses;
    e.clipboardData?.setData(
      'text/plain',
      keys
        .map(([s, a]) => `${tanzilWords(s, a, text(s, a) ?? '', basmala).join(' ')} (${s}:${a})`)
        .join('\n'),
    );
    e.preventDefault();
  }
</script>

<div class="exact" data-testid="page-exacte" data-exact-page={page.p} {oncopy} role="none">
  <div class="lignes quran-text" class:centre={centered} bind:this={box} aria-hidden="true">
    {#each lines as l (l.n)}
      {#if l.kind === 'texte'}
        <div class="ligne" style:font-family="'{family}'" style:font-size="{size}px">
          <span class="mesure" data-mesure={l.w.length} style:font-size="100px"
            >{l.w.map((w) => w[3]).join('')}</span
          >
          {#each l.w as w, i (i)}
            <span
              class="g"
              class:on={current?.s === w[0] && current?.a === w[1]}
              class:focus={focused === `${w[0]}:${w[1]}`}
              data-aya={`${w[0]}:${w[1]}`}
              role="presentation"
              onclick={(e) => choose(w[0], w[1], e.currentTarget)}>{w[3]}</span
            >
          {/each}
        </div>
      {:else if l.kind === 'sourate'}
        <div class="ligne band" style:font-size="{size}px" data-sura-start={l.s}>
          <svg class="cartouche" viewBox="0 0 400 48" preserveAspectRatio="none">
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
          <span class="bsml titre">{BSML_SOURATE}{bsmlSuraName(l.s)}</span>
        </div>
      {:else if l.kind === 'basmala'}
        <div class="ligne bsml basmala" style:font-size="{size}px">{BSML_BASMALA}</div>
      {:else}
        <div class="ligne" style:font-size="{size}px"></div>
      {/if}
    {/each}
  </div>

  <!-- texte de référence (Tanzil) : lecteurs d'écran et clavier (un bouton par verset, visible au focus) -->
  <div class="sr quran-text" lang="ar" dir="rtl">
    {#each verses as [s, a] (`${s}:${a}`)}
      {#if a === 1 && heads.has(s)}<p>{suraTitleAr(s)}</p>{/if}
      <button
        type="button"
        class="v"
        tabindex={readOnly ? -1 : 0}
        aria-haspopup={readOnly ? undefined : 'dialog'}
        data-exact-verse={`${s}:${a}`}
        onfocus={() => (focused = `${s}:${a}`)}
        onblur={() => (focused = '')}
        onclick={(e) => choose(s, a, e.currentTarget)}>{text(s, a) ?? ''} ({ar(a)})</button
      >
    {/each}
  </div>
</div>

<style>
  .exact {
    position: relative;
    padding-block: 6px 2px;
  }
  .lignes {
    display: flex;
    flex-direction: column;
    direction: rtl;
    color: var(--mp-ink);
    user-select: none;
    -webkit-user-select: none;
  }
  .ligne {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 1.75em;
    white-space: nowrap;
    line-height: 1;
  }
  .centre .ligne {
    justify-content: center;
    gap: 0.25em;
  }
  .mesure {
    position: absolute;
    visibility: hidden;
    pointer-events: none;
  }
  .g {
    border-radius: 6px;
    cursor: pointer;
    transition: background-color var(--motion) ease;
  }
  @media (hover: hover) {
    .g:hover {
      background: color-mix(in srgb, var(--mp-mark) 55%, transparent);
    }
  }
  .g.on {
    background: var(--mp-mark);
    box-shadow: 0 0 0 2px var(--mp-mark);
  }
  .g.focus {
    outline: 2px solid var(--mp-green);
    outline-offset: 1px;
  }
  .bsml {
    font-family: 'QCF_BSML', var(--font-quran);
  }
  .basmala {
    justify-content: center;
  }
  .band {
    justify-content: center;
  }
  .cartouche {
    position: absolute;
    inset: 0.12em 0;
    width: 100%;
    height: calc(100% - 0.24em);
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
  .titre {
    position: relative;
    font-size: 0.85em;
    color: var(--mp-on-band);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .sr .v:focus {
    outline: none;
  }
</style>
