<script lang="ts">
  import { t } from '$lib/i18n';
</script>

<svelte:head><title>{t('app.nom')} — {t('onglets.sciences')}</title></svelte:head>

<h1>{t('onglets.sciences')}</h1>
<p class="muted">{t('sciences.intro')}</p>

<section class="card">
  <h2>{t('sciences.re_titre')} <span class="soon">V1</span></h2>
  <p>{t('sciences.re_texte')}</p>
</section>
<section class="card">
  <h2>{t('sciences.ra_titre')} <span class="soon">V1</span></h2>
  <p>{t('sciences.ra_texte')}</p>
</section>
<p class="muted">{t('sciences.fidelite')}</p>
