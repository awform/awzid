<script lang="ts">
  import { getContext } from 'svelte';

  /** Une illustration par sa clé ; cadre « à dessiner » si la clé n'existe pas (comme le moteur). */
  let {
    k,
    cls = 'pic',
    label = '',
  }: { k: string | undefined; cls?: string; label?: string } = $props();
  const ill = getContext<() => Record<string, { viewBox: string }>>('illustrations');
  const def = $derived(k ? ill?.()[k] : undefined);
</script>

{#if def}
  <svg
    class={cls}
    viewBox={def.viewBox}
    role={label ? 'img' : undefined}
    aria-label={label || undefined}
    aria-hidden={label ? undefined : 'true'}><use href="#i-{k}" /></svg
  >
{:else if k}
  <svg class="{cls} missing" viewBox="0 0 120 120" aria-hidden="true"
    ><rect x="4" y="4" width="112" height="112" rx="14" fill="#F3E7D0" /></svg
  >
{/if}
