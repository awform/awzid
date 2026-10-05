<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { fmtNumber, t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';

  /**
   * A12 — compteur de répétitions (tasbīḥ) : un grand bouton à toucher, l'objectif dit par le livre (ou choisi),
   * un anneau de progression ; silencieux (aucun son, aucune vibration imposée), remise à zéro.
   */
  let { target = null, compact = false }: { target?: number | null; compact?: boolean } = $props();
  let n = $state(0);
  const done = $derived(target !== null && n >= target);
  const R = 26;
  const C = 2 * Math.PI * R;
  const frac = $derived(target ? Math.min(1, n / target) : 0);
</script>

<div class="compteur" class:compact class:done data-testid="qt-compteur">
  <button
    type="button"
    class="tap"
    onclick={() => (n += 1)}
    aria-label={target
      ? t('qt.compteur_aria_cible', { n, cible: target })
      : t('qt.compteur_aria', { n })}
  >
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r={R} class="track" />
      {#if target}
        <circle
          cx="32"
          cy="32"
          r={R}
          class="prog"
          stroke-dasharray={`${(C * frac).toFixed(1)} ${C.toFixed(1)}`}
          transform="rotate(-90 32 32)"
        />
      {/if}
    </svg>
    <span class="n" aria-hidden="true"><Bidi text={fmtNumber(n)} /></span>
  </button>
  <div class="meta">
    {#if target}<span class="cible"
        ><Bidi text={t('qt.compteur_sur', { cible: fmtNumber(target) })} /></span
      >{/if}
    {#if done}<span class="fini" role="status"
        ><Icon name="coche" size={16} />{t('qt.compteur_fini')}</span
      >{/if}
    {#if n > 0}<button type="button" class="ghost raz" onclick={() => (n = 0)}
        >{t('qt.compteur_zero')}</button
      >{/if}
  </div>
</div>

<style>
  .compteur {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: var(--space-s);
  }
  .tap {
    position: relative;
    display: grid;
    place-items: center;
    width: 72px;
    height: 72px;
    min-height: 72px;
    padding: 0;
    border-radius: 50%;
    border: 0;
    background: var(--primary-soft);
    color: var(--primary);
    touch-action: manipulation;
    user-select: none;
  }
  .compact .tap {
    width: 60px;
    height: 60px;
    min-height: 60px;
  }
  .tap:active {
    transform: scale(0.96);
  }
  .tap svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .track {
    fill: none;
    stroke: var(--line);
    stroke-width: 4;
  }
  .prog {
    fill: none;
    stroke: var(--primary);
    stroke-width: 5;
    stroke-linecap: round;
    transition: stroke-dasharray var(--motion-fast) ease;
  }
  .n {
    position: relative;
    font-weight: 800;
    font-size: 1.25rem;
    font-variant-numeric: tabular-nums;
  }
  .done .tap {
    background: var(--ok-bg);
    color: var(--ok-ink);
  }
  .done .prog {
    stroke: var(--ok-ink);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
    color: var(--ink2);
    font-size: 0.92rem;
  }
  .fini {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--ok-ink);
    font-weight: 700;
  }
  .raz {
    min-height: 44px;
  }
</style>
