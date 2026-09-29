<script lang="ts">
  import { letterColorIndex, splitMarked, tanwinDisplay } from '@awform/content/text';

  /**
   * Texte arabe tel qu'écrit dans le livre. Le balisage `[..]` colore la lettre étudiée selon sa position
   * dans `lettres` (rouge, bleu, vert, or — règle du moteur des livres). Seul l'affichage des tanwins suit le
   * Muṣḥaf de Médine (tanwinDisplay, comme awform.js) ; le texte lui-même n'est jamais modifié.
   */
  let {
    text,
    lettres = [],
    quran = false,
    tag = 'span',
  }: {
    text: string;
    lettres?: ReadonlyArray<{ l: string }>;
    quran?: boolean;
    tag?: 'span' | 'p' | 'h1' | 'h2' | 'div';
  } = $props();

  // tanwins du Muṣḥaf de Médine : AFFICHAGE seulement (le texte reçu, stocké et comparé reste celui du livre / Tanzil)
  const segments = $derived(splitMarked(tanwinDisplay(text)));
</script>

<svelte:element this={tag} class={quran ? 'quran-text' : 'ar'} lang="ar" dir="rtl"
  >{#each segments as s, i (i)}{#if s.marked}<span class="c{letterColorIndex(s.text, lettres)}"
        >{s.text}</span
      >{:else}{s.text}{/if}{/each}</svelte:element
>
