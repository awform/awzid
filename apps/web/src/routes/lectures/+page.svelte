<script lang="ts">
  import { t } from '$lib/i18n';
</script>

<svelte:head><title>{t('app.nom')} — {t('onglets.lectures')}</title></svelte:head>

<h1>{t('onglets.lectures')}</h1>
<section class="card">
  <h2>{t('lectures.titre')} <span class="soon">V1</span></h2>
  <p>{t('lectures.texte')}</p>
</section>
