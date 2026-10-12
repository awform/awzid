<script lang="ts">
  import { tanwinDisplay } from '@awform/content/text';
  import { splitBasmala } from '@awform/hifz';
  import { fmtNumber, t } from '$lib/i18n';

  /**
   * Hifẓ complet — un verset MOT PAR MOT (texte Tanzil exact, découpé comme l'IA d'écoute : `texte.split(' ')`),
   * avec le surlignage DISCRET des erreurs et hésitations gardées, l'amorce du test (premiers mots seulement) et,
   * si `onmot` est donné, un bouton par mot pour marquer une erreur ou une hésitation.
   */
  let {
    v,
    mots = new Map(),
    visibles = Infinity,
    onmot,
    basmala = '',
    grand = false,
  }: {
    /** écran enfant : texte plus grand */
    grand?: boolean;
    v: { s: number; a: number; text: string };
    /** texte Tanzil de la basmala (méta du Coran) : détachée sur sa ligne en tête du verset 1 */
    basmala?: string;
    /** rang du mot → marque (erreur, hésitation) */
    mots?: ReadonlyMap<number, 'erreur' | 'hesitation'>;
    /** nombre de mots montrés (amorce du test) ; les autres sont cachés */
    visibles?: number;
    /** marquer un mot (le parent ou l'élève, après la récitation) */
    onmot?: (k: number) => void;
  } = $props();
  const ESPACE = ' ';
  const words = $derived(v.text.split(' '));
  /**
   * Basmala d'en-tête du verset 1 (texte Tanzil) : sur SA ligne, centrée, sans numéro — elle ne fait pas partie du
   * verset (sauf al-Fātiḥa en Ḥafṣ, où elle EST le verset 1 : `splitBasmala` ne la détache pas). Les rangs des mots
   * restent ceux de `texte.split(' ')`.
   */
  const nb = $derived.by(() => {
    const p = basmala ? splitBasmala(v.s, v.a, v.text, basmala) : null;
    return p?.basmala ? p.basmala.split(' ').length : 0;
  });
</script>

<div class="mv quran-text" class:grand lang="ar" dir="rtl" data-mots={`${v.s}:${v.a}`}>
  {#if nb}<p class="bsm" data-testid="basmala-ligne">
      {#each words.slice(0, nb) as w, k (k)}<span class="mot" data-k={k}>{tanwinDisplay(w)}</span
        >{ESPACE}{/each}
    </p>{/if}
  <p class="ligne">
    {#each words.slice(nb, visibles) as w, i (i)}
      {@const k = i + nb}
      {#if onmot}<button
          type="button"
          class="mot {mots.get(k) ?? ''}"
          aria-pressed={mots.has(k)}
          onclick={() => onmot(k)}
          data-k={k}>{tanwinDisplay(w)}</button
        >{:else}<span class="mot {mots.get(k) ?? ''}" data-k={k}>{tanwinDisplay(w)}</span
        >{/if}{ESPACE}
    {/each}{#if visibles < words.length}<span class="suite" data-testid="suite-cachee"
        >{t('hz.suite_cachee')}</span
      >{ESPACE}{/if}<span class="n">{fmtNumber(v.a, { useGrouping: false })}</span>
  </p>
</div>

<style>
  .mv {
    font-family: var(--font-quran);
    font-size: 1.6rem;
    line-height: 2.3;
    margin: 0 0 6px;
  }
  :global(.enfant) .mv,
  .grand {
    font-size: 1.9rem;
  }
  .mv p {
    margin: 0;
  }
  .bsm {
    text-align: center;
  }
  .mot {
    border-radius: 6px;
    padding: 0 2px;
  }
  button.mot {
    all: unset;
    cursor: pointer;
    border-radius: 6px;
    padding: 0 2px;
    min-height: 44px;
  }
  button.mot:focus-visible {
    outline: 3px solid var(--teal);
  }
  /* surlignage DISCRET : un fond pâle et un soulignement, jamais la couleur seule */
  .erreur {
    background: var(--bad-bg);
    text-decoration: underline wavy var(--bad-ink);
    text-underline-offset: 8px;
  }
  .hesitation {
    background: var(--warn-bg);
    text-decoration: underline dotted var(--warn-ink);
    text-underline-offset: 8px;
  }
  .suite {
    font-family: var(--font-ui);
    font-size: 0.9rem;
    color: var(--ink2);
    border-bottom: 2px dotted var(--ink2);
  }
  .n {
    display: inline-block;
    min-width: 1.8em;
    padding: 0 4px;
    border: 1px solid var(--line);
    border-radius: 999px;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    text-align: center;
    vertical-align: middle;
  }
</style>
