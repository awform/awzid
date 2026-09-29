<script lang="ts">
  import { tanwinDisplay } from '@awform/content/text';
  import { splitBasmala } from '@awform/hifz';
  import { fmtNumber } from '$lib/i18n';

  /**
   * Versets d'une portion, texte Tanzil AFFICHÉ TEL QUEL (police Amiri Quran). La basmala d'en-tête du
   * verset 1 est posée sur sa ligne : les deux morceaux sont des sous-chaînes exactes du texte Tanzil.
   * Masquage progressif (« réciter de mémoire ») : les versets se floutent, un toucher en révèle un.
   * Le numéro du verset est affiché à part (hors du texte).
   */
  let {
    verses,
    basmala,
    masked = false,
  }: {
    verses: ReadonlyArray<{ s: number; a: number; text: string }>;
    basmala: string;
    masked?: boolean;
  } = $props();

  let shown: Record<string, boolean> = $state({});
  $effect(() => {
    void masked;
    shown = {};
  });
  const num = (a: number) => fmtNumber(a, { useGrouping: false });
</script>

<div class="verses" lang="ar" dir="rtl">
  {#each verses as v (`${v.s}:${v.a}`)}
    {@const parts = splitBasmala(v.s, v.a, v.text, basmala)}
    {#if parts.basmala}<p class="basmala">
        <span class="quran-text" data-basmala={`${v.s}:${v.a}`}>{tanwinDisplay(parts.basmala)}</span
        >
      </p>{/if}
    <button
      type="button"
      class="verse"
      class:blur={masked && !shown[`${v.s}:${v.a}`]}
      onclick={() => (shown[`${v.s}:${v.a}`] = !shown[`${v.s}:${v.a}`])}
      disabled={!masked}
      ><span class="quran-text" data-verse={`${v.s}:${v.a}`}>{tanwinDisplay(parts.rest)}</span>
      <span class="n" aria-hidden="true">{num(v.a)}</span></button
    >
  {/each}
</div>

<style>
  .verses {
    display: grid;
    gap: 6px;
  }
  .basmala {
    text-align: center;
    margin: 4px 0;
  }
  .verse {
    all: unset;
    display: block;
    line-height: 2.2;
    font-size: 1.6rem;
    cursor: default;
  }
  .verse:not(:disabled) {
    cursor: pointer;
  }
  .verse:focus-visible {
    outline: 3px solid var(--teal);
    border-radius: 6px;
  }
  .blur .quran-text {
    filter: blur(7px);
  }
  .n {
    display: inline-block;
    min-width: 1.8em;
    margin-inline-start: 6px;
    padding: 0 4px;
    border: 1px solid var(--line);
    border-radius: 999px;
    font-size: 0.8rem;
    text-align: center;
    vertical-align: middle;
    font-family: inherit;
  }
</style>
