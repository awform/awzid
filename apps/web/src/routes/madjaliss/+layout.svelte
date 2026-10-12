<script lang="ts">
  import type { Snippet } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';

  /**
   * Madjaliss — règles du référent sur TOUTES les pages de la rubrique : bandeau « Traduction Awzid — en cours de
   * relecture savante » (aucune mention de relecteur avant la relecture) et, en bas de page, le rappel que ce
   * n'est pas une fatwa.
   */
  let { children }: { children: Snippet } = $props();
</script>

<div class="madjaliss">
  <p class="relecture" role="note" data-testid="mj-relecture">
    <Icon name="info" size={18} /><Bidi text={t('mj.bandeau')} />
  </p>
  {@render children()}
  <p class="fatwa" role="note" data-testid="mj-fatwa"><Bidi text={t('mj.fatwa')} /></p>
</div>

<style>
  .relecture {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 var(--space-m);
    padding: 6px var(--space-m);
    border-radius: var(--radius-md);
    background: var(--warn-bg);
    color: var(--ink);
    font-size: 0.92rem;
    font-weight: 600;
  }
  .fatwa {
    margin: var(--space-l, 24px) 0 0;
    padding-top: var(--space-s);
    border-top: 1px solid var(--line);
    color: var(--ink2);
    font-size: 0.9rem;
  }
</style>
