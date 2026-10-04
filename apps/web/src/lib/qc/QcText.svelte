<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { letterColorIndex, tanwinDisplay } from '@awform/content/text';
  import { markColor, qcSegments } from './check';

  /**
   * Texte d'un livret « Lecture du Coran » : crochets `[..]` = lettre étudiée (couleur de la leçon, règle du
   * moteur), `[g:..]`, `[m4:..]`… = famille de règle (couleur de la famille, soulignée). Coran : graphie du
   * Muṣḥaf (texte Tanzil contrôlé à l'import ; seul l'affichage des tanwins suit le Muṣḥaf de Médine).
   * Sans `quran` : écriture courante, dans un cadre gris (convention du livret).
   */
  let {
    text,
    lettres = [],
    quran = false,
  }: { text: string; lettres?: ReadonlyArray<{ l: string }>; quran?: boolean } = $props();

  const segments = $derived(qcSegments(quran ? tanwinDisplay(text) : text));
</script>

<span class={quran ? 'quran-text' : 'ar courant'} lang="ar" dir="rtl"
  >{#each segments as s, i (i)}{#if s.mark === null}<Bidi
        text={s.text}
        base="ar"
      />{:else if s.mark === ''}<span class="c{letterColorIndex(s.text, lettres)}"
        ><Bidi text={s.text} base="ar" /></span
      >{:else}<span class="c{markColor(s.mark)} regle" data-regle={s.mark}
        ><Bidi text={s.text} base="ar" /></span
      >{/if}{/each}</span
>

<style>
  .courant {
    background: var(--soft);
    border-radius: 6px;
    padding: 0 6px;
  }
  .regle {
    text-decoration: underline;
    text-underline-offset: 0.35em;
  }
</style>
