<script lang="ts">
  /** Lot 26 — barre de progression accessible (valeur annoncée), sans comparaison avec les autres. */
  let { value, max = 100, label }: { value: number; max?: number; label: string } = $props();
  const pct = $derived(max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0);
</script>

<div
  class="progress"
  role="progressbar"
  aria-label={label}
  aria-valuemin="0"
  aria-valuemax={max}
  aria-valuenow={value}
>
  <span style:inline-size={`${pct}%`}></span>
</div>

<style>
  .progress {
    block-size: 10px;
    border-radius: var(--radius-pill);
    background: var(--surface);
    overflow: hidden;
  }
  span {
    display: block;
    block-size: 100%;
    border-radius: inherit;
    background: var(--primary);
    transition: inline-size var(--motion) ease-out;
  }
</style>
