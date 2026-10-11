<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';

  /**
   * F5 — un module chargé à la demande n'a pas pu venir, même après les nouvelles tentatives automatiques
   * (lib/charger.ts) : on le DIT, et le reste de la page reste utilisable (jamais un écran figé).
   */
  let { onretry }: { onretry?: () => void } = $props();
</script>

<p class="module-echec" role="status" data-testid="module-echec">
  <Bidi text={t('module.connexion_necessaire')} />
  {#if onretry}<button
      type="button"
      class="ghost"
      data-testid="module-reessayer"
      onclick={() => onretry?.()}>{t('etat.reessayer')}</button
    >{/if}
</p>

<style>
  .module-echec {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    color: var(--muted, inherit);
    font-size: 0.95rem;
  }
  .module-echec button {
    min-height: 44px;
  }
</style>
