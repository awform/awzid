<script lang="ts">
  import { t } from '$lib/i18n';

  /** Lot 26 — chargement : silhouettes légères (pas d'animation lourde), annoncé aux lecteurs d'écran. */
  let { lines = 3 }: { lines?: number } = $props();
</script>

<div class="loading" role="status" aria-live="polite" data-testid="chargement">
  <span class="sr">{t('etat.chargement')}</span>
  {#each Array.from({ length: lines }, (_, i) => i) as i (i)}
    <span class="bar" style:width={`${92 - ((i * 23) % 40)}%`}></span>
  {/each}
</div>

<style>
  .loading {
    display: grid;
    gap: 10px;
    padding: var(--space-m) 0;
  }
  .bar {
    height: 16px;
    border-radius: var(--radius-pill);
    background: linear-gradient(90deg, var(--surface), var(--line), var(--surface));
    background-size: 200% 100%;
    animation: shimmer 1.4s ease-in-out infinite;
  }
  @keyframes shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: -100% 0;
    }
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
