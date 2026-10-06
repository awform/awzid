<script lang="ts">
  import Ar from './Ar.svelte';
  import Bidi from './Bidi.svelte';
  import { arabicWords, LONG_WORDS } from './bidi/segments';
  import type { VerseMark } from '@awform/content/versets';
  import VersetBloc from './quran/VersetBloc.svelte';

  /**
   * Point « arabe + français » d'un bloc de leçon (fiqh, adab, je retiens, rubriques…). Règle du client :
   * jamais un verset ni une phrase arabe sur la même ligne que le français.
   * - verset repéré par le serveur sur le texte Tanzil (`verset_tanzil`) : bloc de verset ;
   * - phrase arabe (3 mots ou plus) ou `stack` : l'arabe sur sa ligne, le français dessous ;
   * - terme isolé (1 ou 2 mots) : « terme — français » sur une ligne.
   */
  let {
    ar = '',
    fr = '',
    verset,
    stack = false,
    lettres = [],
  }: {
    ar?: string;
    fr?: string;
    verset?: unknown;
    stack?: boolean;
    lettres?: ReadonlyArray<{ l: string }>;
  } = $props();

  const m = $derived((verset as VerseMark | undefined)?.j ? (verset as VerseMark) : null);
  const long = $derived(stack || arabicWords(ar) >= LONG_WORDS);
</script>

{#if m && ar}<VersetBloc {ar} {m} {fr} />{:else if long}<span class="arfr"
    >{#if ar}<Ar text={ar} {lettres} block />{/if}{#if fr}<span class="fr arfr-fr"
        ><Bidi text={fr} /></span
      >{/if}</span
  >{:else}{#if ar}<Ar text={ar} {lettres} sep />
  {/if}<span class="fr"><Bidi text={fr} /></span>{/if}

<style>
  .arfr,
  .arfr-fr {
    display: block;
  }
</style>
