<script lang="ts">
  import { t } from '$lib/i18n';
</script>

<svelte:head><title>{t('app.nom')} — {t('onglets.ecriture')}</title></svelte:head>

<h1>{t('onglets.ecriture')}</h1>
<section class="card">
  <h2>{t('ecriture.trace_titre')} <span class="soon">{t('lot.n', { n: 6 })}</span></h2>
  <p>{t('ecriture.trace_texte')}</p>
</section>
<p class="muted">{t('ecriture.en_attendant')}</p>
