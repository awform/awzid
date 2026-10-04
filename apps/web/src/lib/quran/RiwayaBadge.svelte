<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import { isHafs } from './player';

  /** Lot 27 — riwāya TOUJOURS affichée ; badge marqué pour toute autre riwāya que Ḥafṣ. */
  let { riwaya, label }: { riwaya: string; label: string } = $props();
</script>

<span class="pill rw" class:autre={!isHafs(riwaya)} data-testid="badge-riwaya" data-riwaya={riwaya}
  ><Bidi text={t('ca.riwaya', { nom: label })} />{#if !isHafs(riwaya)}<strong>
      · {t('ca.autre_riwaya')}</strong
    >{/if}</span
>

<style>
  .rw {
    background: var(--primary-soft);
    color: var(--primary);
  }
  .rw.autre {
    background: var(--warn-bg);
    color: var(--warn-ink);
    border: 1px solid currentColor;
  }
</style>
