<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { fermerBandeau } from '$lib/acces';
  import { t } from '$lib/i18n';

  /**
   * Bandeau « Version bêta » : discret, une ou deux lignes, fermable (la fermeture est retenue sur l'appareil).
   * Le texte est dans la langue de l'interface ; en arabe, il occupe sa propre ligne (Bidi isole le sens d'écriture).
   * Chargé après le démarrage (jamais dans le chargement initial de l'élève).
   */
  let { surFermeture }: { surFermeture?: () => void } = $props();
  let ferme = $state(false);
  function fermer() {
    try {
      fermerBandeau(localStorage);
    } catch {
      /* stockage indisponible */
    }
    ferme = true;
    surFermeture?.();
  }
</script>

{#if !ferme}
  <aside class="bandeau-beta" role="note" aria-label={t('bandeau.aria')} data-testid="bandeau-beta">
    <p class="texte"><Bidi text={t('bandeau.texte')} /></p>
    <button
      type="button"
      class="x"
      onclick={fermer}
      aria-label={t('bandeau.fermer')}
      title={t('bandeau.fermer')}
      data-testid="bandeau-beta-fermer"><span aria-hidden="true">×</span></button
    >
  </aside>
{/if}

<style>
  .bandeau-beta {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    margin: 0;
    padding: 2px 4px 2px 12px;
    background: var(--primary-soft);
    color: var(--ink);
    border-bottom: 1px solid var(--line);
    font-size: 0.82rem;
    line-height: 1.35;
  }
  .texte {
    margin: 0;
    flex: 1;
    text-align: center;
  }
  .x {
    flex: none;
    min-width: 44px;
    min-height: 44px;
    border: 0;
    background: transparent;
    color: inherit;
    font-size: 1.4rem;
    line-height: 1;
    cursor: pointer;
  }
</style>
