<script lang="ts">
  /** Refonte 19/10 : rosette enluminée en or (jalon : fin d'unité, fin de cycle) — jamais de confettis. */
  let { size = 48 }: { size?: number } = $props();
</script>

<svg
  class="v4-rosette"
  viewBox="0 0 64 64"
  width={size}
  height={size}
  aria-hidden="true"
  focusable="false"
  ><g fill="none" stroke="currentColor"
    ><circle cx="32" cy="32" r="30" stroke-width="1.5" /><circle
      cx="32"
      cy="32"
      r="26.5"
      stroke-width=".8"
    /><rect x="15" y="15" width="34" height="34" stroke-width="1.6" /><rect
      x="15"
      y="15"
      width="34"
      height="34"
      stroke-width="1.6"
      transform="rotate(45 32 32)"
    /><circle cx="32" cy="32" r="10" stroke-width="1.2" /><path
      d="M27 32.5l3.5 3.5 7-8"
      stroke-width="2.4"
      stroke-linecap="round"
      stroke-linejoin="round"
    /></g
  ><g fill="currentColor"
    ><circle cx="32" cy="3.5" r="1.6" /><circle cx="32" cy="60.5" r="1.6" /><circle
      cx="3.5"
      cy="32"
      r="1.6"
    /><circle cx="60.5" cy="32" r="1.6" /></g
  ></svg
>
