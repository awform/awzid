<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';

  /**
   * Lot 6 — bandeau du groupe « bêta fermée » : ces comptes voient le contenu différé et non relu, avec la mention
   * « Contenu en relecture : ne pas diffuser ».
   */
</script>

<p class="bandeau-relecture" role="note" data-testid="mj-bandeau-relecture">
  <Icon name="info" size={20} /><strong><Bidi text={t('mj.beta_relecture')} /></strong>
</p>

<style>
  .bandeau-relecture {
    display: flex;
    gap: var(--space-s);
    align-items: center;
    margin: var(--space-s) 0 var(--space-m);
    padding: var(--space-s) var(--space-m);
    border: 2px solid var(--warn, #b45309);
    border-radius: var(--radius-md);
    background: var(--card);
    color: var(--ink);
  }
</style>
