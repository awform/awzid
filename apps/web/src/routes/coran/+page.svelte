<script lang="ts">
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n';
</script>

<svelte:head><title>{t('app.nom')} — {t('onglets.coran')}</title></svelte:head>

<h1>{t('onglets.coran')}</h1>
<p class="muted">{t('coran.intro')}</p>

<section class="card">
  <h2>{t('coran.hifz_titre')}</h2>
  <p>{t('coran.hifz_texte')}</p>
  <p>
    <a class="button primary" href={resolve('/hifz')} data-testid="ouvrir-hifz"
      >{t('coran.ouvrir_carnet')}</a
    >
  </p>
</section>

<section class="card">
  <h2>{t('coran.lecteur_titre')} <span class="soon">{t('etat.preparation')}</span></h2>
  <ul>
    <li>{t('coran.lecteur_1')}</li>
    <li>{t('coran.lecteur_2')}</li>
    <li>{t('coran.lecteur_3')}</li>
    <li>{t('coran.lecteur_4')}</li>
    <li>{t('coran.lecteur_5')}</li>
  </ul>
  <p class="muted">{t('coran.lecteur_licence')}</p>
</section>

<section class="card">
  <h2>{t('coran.qaida_titre')} <span class="soon">{t('etat.a_venir')}</span></h2>
  <p>{t('coran.qaida_texte')}</p>
</section>
