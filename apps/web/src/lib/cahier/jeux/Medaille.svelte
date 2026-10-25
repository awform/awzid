<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import type { Med } from './modele';

  /**
   * Médaille de bronze, d'argent ou d'or (cahier des ados, 25/10/2026) : un disque, un ruban et un chiffre (1 à 3) pour ne
   * jamais compter sur la seule couleur ; le nom est toujours écrit à côté (lecteurs d'écran compris).
   */
  let { med, grand = false }: { med: Med; grand?: boolean } = $props();
  const NOMS = ['', 'bronze', 'argent', 'or'] as const;
</script>

{#if med > 0}
  <span class="medaille {NOMS[med]}" class:grand data-medaille={NOMS[med]}>
    <svg viewBox="0 0 40 52" aria-hidden="true">
      <path class="ruban" d="M10 0h8l4 16-9 3zM30 0h-8l-4 16 9 3z" />
      <circle class="disque" cx="20" cy="33" r="16" />
      <circle class="anneau" cx="20" cy="33" r="11.5" />
      <text x="20" y="38.5" text-anchor="middle">{med}</text>
    </svg>
    <span class="nom"><Bidi text={t(`cahier.med_${NOMS[med]}`)} /></span>
  </span>
{/if}

<style>
  .medaille {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-weight: 700;
    color: var(--ink);
  }
  svg {
    width: 1.7rem;
    height: 2.2rem;
  }
  .grand svg {
    width: 3.2rem;
    height: 4.2rem;
  }
  .grand .nom {
    font-size: 1.1rem;
  }
  .ruban {
    fill: var(--primary);
  }
  .anneau {
    fill: none;
    stroke: rgb(0 0 0 / 0.35);
    stroke-width: 1.5;
  }
  text {
    font: 700 15px var(--font-ui);
    fill: #1b1b1b;
  }
  .bronze .disque {
    fill: #c98a55;
  }
  .argent .disque {
    fill: #c9d0d6;
  }
  .or .disque {
    fill: #f0c445;
  }
</style>
