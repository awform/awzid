<script lang="ts">
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n';

  /**
   * « Nos garanties » (lot 11, étude rec. 4) : page PUBLIQUE, sans compte. Chaque promesse correspond à un
   * mécanisme vérifié par les tests automatiques (JOURNAL_DEV, AUDIT_BRIEF).
   */
  const ITEMS = [
    'coran',
    'hadiths',
    'ia',
    'voix',
    'traceurs',
    'enfants',
    'recompenses',
    'paiement',
    'resiliation',
    'donnees',
    'hors_ligne',
  ] as const;
</script>

<svelte:head><title>{t('app.nom')} — {t('gar.titre')}</title></svelte:head>

<h1>{t('gar.titre')}</h1>
<p class="lead">{t('gar.intro')}</p>
<ol class="garanties" data-testid="garanties">
  {#each ITEMS as k (k)}
    <li class="card" data-garantie={k}>
      <h2>{t(`gar.${k}_titre`)}</h2>
      <p>{t(`gar.${k}`)}</p>
      <p class="muted small">{t(`gar.${k}_preuve`)}</p>
    </li>
  {/each}
</ol>
<p class="muted small">{t('gar.contact')}</p>
<p><a href={resolve('/')}>{t('gar.retour')}</a></p>

<style>
  .garanties {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 10px;
  }
  .garanties h2 {
    font-size: 1.1rem;
  }
  .lead {
    font-size: 1.05rem;
  }
  .small {
    font-size: 0.88rem;
  }
</style>
