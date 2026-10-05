<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
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
   * A34 — UNE page du Muṣḥaf de Médine « à l'identique » (édition 1405) : 15 lignes justifiées dessinées par la
   * police « par page » du Complexe (QCF_Pnnn, glyphes des données synchronisées), en-têtes de sourate et basmala
   * en QCF_BSML, cadre ORIGINAL sobre (filet vert, filet or, fond crème très clair : page lumineuse, aussi en
   * thème sombre). Le texte Tanzil reste la référence : lu par les lecteurs d'écran, copié (Ctrl+C), cherché ;
   * les glyphes ne sont qu'une présentation (aria-hidden, non sélectionnables).
   */
  let {
    page,
    juz,
    text,
    basmala,
    current = null,
    fontsReady = false,
    onpick,
  }: {
    page: ExactPage;
    juz: number;
    text: (s: number, a: number) => string | undefined;
    /** texte Tanzil de 1:1 */
    basmala: string;
    current?: { s: number; a: number } | null;
    /** polices de la page et QCF_BSML chargées */
    fontsReady?: boolean;
    onpick?: (s: number, a: number) => void;
  } = $props();

  const lines = $derived(displayLines(page));
  const verses = $derived(pageVerseKeys(page));
  const heads = $derived(new Set(lines.flatMap((l) => (l.kind === 'sourate' ? [l.s] : []))));
  const family = $derived(fontFamily(pageFontFile(page.p)));
  const centered = $derived(page.p <= 2);
  const ar = (n: number) => new Intl.NumberFormat('ar-EG', { useGrouping: false }).format(n);
  const firstSura = $derived(verses[0]?.[0] ?? 1);
  /** mention imprimée en tête des pages du muṣḥaf */
  const JUZ = 'الجزء';

  // taille : la ligne la plus longue occupe toute la largeur ; les autres sont justifiées (espaces entre mots)
  let box = $state<HTMLDivElement>();
  let size = $state(24);
  $effect(() => {
    if (!box || !fontsReady) return;
    const el = box;
    const gap = centered ? 0.25 : 0;
    const count = lines.length;
    const fit = () => {
      // largeur naturelle de chaque ligne en « em » (mesurée à 100 px, espaces des pages centrées compris)
      const ems = [...el.querySelectorAll<HTMLElement>('[data-mesure]')].map(
        (x) => x.scrollWidth / 100 + gap * (Number(x.dataset.mesure) - 1),
      );
      const byWidth = (el.clientWidth / Math.max(1, ...ems)) * 0.985;
      // … et les lignes tiennent dans la hauteur du cadre (1,6 em chacune)
      const byHeight = el.clientHeight / (count * 1.6);
      size = Math.max(10, Math.floor(Math.min(byWidth, byHeight) * 100) / 100);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  });

  /** Ctrl+C dans la page : le texte TANZIL (verset en cours, sinon toute la page), jamais les glyphes */
  function oncopy(e: ClipboardEvent) {
    const keys =
      current && verses.some(([s, a]) => s === current!.s && a === current!.a)
        ? [[current.s, current.a] as [number, number]]
        : verses;
    const out = keys
      .map(([s, a]) => `${tanzilWords(s, a, text(s, a) ?? '', basmala).join(' ')} (${s}:${a})`)
      .join('\n');
    e.clipboardData?.setData('text/plain', out);
    e.preventDefault();
  }
</script>

<article
  class="mpx"
  class:pret={fontsReady}
  data-page={page.p}
  data-testid="mushaf-page-exacte"
  aria-label={t('mp.page_aria', { n: page.p })}
  {oncopy}
>
  <svg class="cadre" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">
    <rect x="1.2" y="1.2" width="97.6" height="137.6" rx="2.4" class="vert" />
    <rect x="2.6" y="2.6" width="94.8" height="134.8" rx="1.6" class="or" />
  </svg>
  <header class="haut" aria-hidden="true">
    <span class="bsml quran-text">{fontsReady ? bsmlSuraName(firstSura) : ''}</span>
    <span lang="ar"><Bidi text={`${JUZ} ${ar(juz)}`} base="ar" /></span>
  </header>

  <div class="lignes quran-text" class:centre={centered} bind:this={box} aria-hidden="true">
    {#each lines as l (l.n)}
      {#if l.kind === 'texte'}
        <div class="ligne" style:font-family="'{family}'" style:font-size="{size}px">
          <span class="mesure" data-mesure={l.w.length} style:font-size="100px"
            >{l.w.map((w) => w[3]).join('')}</span
          >
          {#each l.w as w, i (i)}
            <span
              class="mot"
              class:cur={current?.s === w[0] && current?.a === w[1]}
              data-v="{w[0]}:{w[1]}"
              role="presentation"
              onclick={() => onpick?.(w[0], w[1])}>{w[3]}</span
            >
          {/each}
        </div>
      {:else if l.kind === 'sourate'}
        <div class="ligne entete" style:font-size="{size}px">
          <svg class="cartouche" viewBox="0 0 300 30" preserveAspectRatio="none" aria-hidden="true">
            <rect x="1" y="2" width="298" height="26" rx="13" />
            <path d="M18 15h40M242 15h40" />
            <path d="M150 3l3 3-3 3-3-3z M150 21l3 3-3 3-3-3z" class="losange" />
          </svg>
          <span class="bsml nom">{BSML_SOURATE}{bsmlSuraName(l.s)}</span>
        </div>
      {:else if l.kind === 'basmala'}
        <div class="ligne basmala bsml" style:font-size="{size}px">{BSML_BASMALA}</div>
      {:else}
        <div class="ligne" style:font-size="{size}px"></div>
      {/if}
    {/each}
  </div>

  <footer class="bas" aria-hidden="true" lang="ar"><Bidi text={ar(page.p)} base="ar" /></footer>

  <!-- texte de référence (Tanzil) pour les lecteurs d'écran -->
  <div class="sr quran-text" lang="ar" dir="rtl">
    {#each verses as [s, a] (`${s}:${a}`)}
      {#if a === 1 && heads.has(s)}<p>{suraTitleAr(s)}</p>{/if}
      <p>{text(s, a) ?? ''} ({ar(a)})</p>
    {/each}
  </div>
</article>

<style>
  .mpx {
    --x-papier: #fffef8;
    --x-vert: #1d6b45;
    --x-or: #c29a3a;
    --x-encre: #111a14;
    --x-mark: #dff1e5;
    position: relative;
    display: flex;
    flex-direction: column;
    aspect-ratio: 100 / 140;
    max-width: 640px;
    margin-inline: auto;
    padding: 7% 7.5% 5%;
    color: var(--x-encre);
    background: var(--x-papier);
    border-radius: 6px;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.12);
    container-type: inline-size;
    overflow: hidden;
  }
  .cadre {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .cadre rect {
    fill: none;
    vector-effect: non-scaling-stroke;
  }
  .vert {
    stroke: var(--x-vert);
    stroke-width: 2;
  }
  .or {
    stroke: var(--x-or);
    stroke-width: 1;
  }
  .haut,
  .bas {
    display: flex;
    justify-content: space-between;
    font-family: 'Amiri Quran', serif;
    font-size: max(12px, 2.6cqi);
    color: var(--x-vert);
    direction: rtl;
  }
  .bas {
    justify-content: center;
    margin-top: auto;
  }
  .lignes {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    margin-block: 2% 3%;
    direction: rtl;
    user-select: none;
  }
  .ligne {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 1.6em;
    line-height: 1.6;
    white-space: nowrap;
  }
  .centre .ligne {
    justify-content: center;
    gap: 0.25em;
  }
  .mesure {
    position: absolute;
    visibility: hidden;
    white-space: nowrap;
    pointer-events: none;
  }
  .mot {
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.15s;
  }
  .mot.cur {
    background: var(--x-mark);
  }
  .mpx:not(.pret) .lignes {
    visibility: hidden;
  }
  .bsml {
    font-family: 'QCF_BSML', serif;
  }
  .haut .bsml {
    font-size: 1.4em;
    line-height: 1;
  }
  .basmala {
    justify-content: center;
  }
  .entete {
    justify-content: center;
  }
  .cartouche {
    position: absolute;
    inset: 0.1em 0;
    width: 100%;
    height: calc(100% - 0.2em);
  }
  .cartouche rect {
    fill: #f6fbf7;
    stroke: var(--x-vert);
    stroke-width: 1.2;
  }
  .cartouche path {
    fill: none;
    stroke: var(--x-or);
    stroke-width: 1;
  }
  .cartouche .losange {
    fill: var(--x-or);
    stroke: none;
  }
  .nom {
    position: relative;
    font-size: 0.9em;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
