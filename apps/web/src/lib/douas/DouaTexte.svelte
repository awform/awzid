<script lang="ts">
  import { tanwinDisplay } from '@awform/content/text';
  import Bidi from '$lib/Bidi.svelte';
  import { CROCHETS, type Doua } from './douas';

  /**
   * Texte arabe d'une doua, seul sur sa ligne :
   *  - hadith (ou parole de Compagnon) : la chaîne EXACTE du dossier, affichée telle quelle (aucune normalisation) ;
   *  - Coran : texte Tanzil (police du Coran), entre les crochets ornés ﴿ ﴾ posés À CÔTÉ du texte ; seul
   *    l'affichage des tanwins suit le Muṣḥaf de Médine, comme partout (VerseText) — `tanwinUndo` rend Tanzil.
   */
  let { doua }: { doua: Doua } = $props();
</script>

{#if doua.coran}
  <p class="quran-text ar-long coran" lang="ar" dir="rtl" data-douas-coran>
    <span class="cr" aria-hidden="true">{CROCHETS.ouvre}</span
    >{#each doua.coran as p (`${p.s}:${p.a}`)}<span class="v" data-verset={`${p.s}:${p.a}`}
        >{tanwinDisplay(p.text)}</span
      >{/each}<span class="cr" aria-hidden="true">{CROCHETS.ferme}</span>
  </p>
{:else if doua.ar}
  <!-- <Bidi> découpe sans rien changer : les marques latines du chercheur (« (×3) ») restent lisibles -->
  <p class="ar ar-long" lang="ar" dir="rtl" data-douas-ar><Bidi text={doua.ar} base="ar" /></p>
{/if}

<style>
  p {
    margin: var(--space-xs) 0;
    line-height: 2;
  }
  /* plusieurs versets (20:25-28) : séparés à l'affichage seulement, aucun caractère ajouté au texte */
  .v + .v {
    margin-inline-start: 0.5em;
  }
  .cr {
    margin-inline: 0.2em;
    color: var(--gold);
  }
</style>
