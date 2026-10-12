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
  <!-- une ligne par formule ou par verset (saut de ligne du texte, décision du référent), avec son moment s'il y en a -->
  {#each doua.ar.split('\n') as ligne, i (i)}
    {#if doua.lignes?.[i]}<p class="ligne-moment"><Bidi text={doua.lignes[i]} /></p>{/if}
    <p class="ar ar-long" lang="ar" dir="rtl" data-douas-ar><Bidi text={ligne} base="ar" /></p>
  {/each}
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
  .ligne-moment {
    margin: var(--space-s) 0 0;
    font-weight: 700;
    color: var(--primary);
    line-height: 1.4;
  }
  .cr {
    margin-inline: 0.2em;
    color: var(--gold);
  }
</style>
