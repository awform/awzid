<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import type { Niveau } from './outils';

  /** Indicateur de fraîcheur écrit en toutes lettres (frais, à revoir, urgent), avec une forme distincte. */
  let { niveau }: { niveau: Niveau } = $props();
</script>

<span class="pastille {niveau}" data-niveau={niveau}
  ><span class="forme" aria-hidden="true"></span><Bidi text={t(`hz.niveau_${niveau}`)} /></span
>

<style>
  .pastille {
    display: inline-flex;
    gap: 4px;
    align-items: center;
    font-size: 0.85rem;
    font-weight: 700;
    border: 1px solid currentColor;
    border-radius: 999px;
    padding: 1px 8px;
    white-space: nowrap;
  }
  /* forme distincte de chaque niveau (jamais la couleur seule) : plein, demi, contour */
  .forme {
    width: 0.7em;
    height: 0.7em;
    border-radius: 50%;
    border: 2px solid currentColor;
  }
  .frais .forme {
    background: currentColor;
  }
  .a_revoir .forme {
    background: linear-gradient(90deg, currentColor 50%, transparent 50%);
  }
  .urgent .forme {
    border-radius: 2px;
    transform: rotate(45deg);
  }
  .frais {
    color: var(--ok-ink);
    background: var(--ok-bg);
  }
  .a_revoir {
    color: var(--warn-ink);
    background: var(--warn-bg);
  }
  .urgent {
    color: var(--bad-ink);
    background: var(--bad-bg);
  }
</style>
