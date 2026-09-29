<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n';

  /** Page d'erreur de l'application (lot 14) : message simple, sans détail technique, chemin de retour. */
  const introuvable = $derived(page.status === 404);
</script>

<svelte:head><title>{t('app.nom')} — {t('erreur_page.titre')}</title></svelte:head>

<section class="card" data-testid="page-erreur">
  <h1>{introuvable ? t('erreur_page.introuvable') : t('erreur_page.titre')}</h1>
  <p>{introuvable ? t('erreur_page.introuvable_texte') : t('erreur_page.texte')}</p>
  <p class="muted small">{t('erreur_page.code', { code: page.status })}</p>
  <p class="row">
    <a class="button primary" href={resolve('/aujourdhui')}>{t('erreur_page.accueil')}</a>
    <a class="button" href={resolve('/aide')}>{t('aide.titre')}</a>
  </p>
</section>

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .small {
    font-size: 0.9rem;
  }
</style>
