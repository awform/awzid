<script lang="ts">
  import { SYMBOLS } from './symbols';
  let { id, size = 40 }: { id: string; size?: number } = $props();
  const s = $derived(SYMBOLS.find((x) => x.id === id) ?? SYMBOLS[0]);
</script>

<svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
  <path d={s.d} fill={s.fill} stroke="#1b1b1b" stroke-width="0.8" stroke-linejoin="round" />
</svg>
