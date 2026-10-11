<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n';

  /** Page d'erreur de l'application (lot 14) : message simple, sans détail technique, chemin de retour. */
  const introuvable = $derived(page.status === 404);
  // F5 : page rare (en ligne seulement, non gardée sur l'appareil) ouverte sans réseau
  const horsLigne = $derived(
    !introuvable && typeof navigator !== 'undefined' && navigator.onLine === false,
  );
</script>

<svelte:head><title>{t('app.nom')} — {t('erreur_page.titre')}</title></svelte:head>

<section class="card" data-testid="page-erreur">
  {#if horsLigne}
    <h1 data-testid="page-en-ligne"><Bidi text={t('erreur_page.en_ligne')} /></h1>
    <p><Bidi text={t('erreur_page.en_ligne_texte')} /></p>
  {:else}
    <h1><Bidi text={introuvable ? t('erreur_page.introuvable') : t('erreur_page.titre')} /></h1>
    <p><Bidi text={introuvable ? t('erreur_page.introuvable_texte') : t('erreur_page.texte')} /></p>
  {/if}
  <p class="muted small"><Bidi text={t('erreur_page.code', { code: page.status })} /></p>
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
