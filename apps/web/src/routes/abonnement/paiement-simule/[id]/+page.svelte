<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { checkoutDetail, OPERATEURS, price, simulate, type Operateur } from '$lib/billing';
  import { t } from '$lib/i18n';

  /**
   * Page de paiement SIMULÉE (démonstration) : remplace la page hébergée du prestataire (Stripe, PayPal,
   * agrégateur mobile money). Aucune donnée de carte ni de téléphone n'est demandée ; aucun argent n'est prélevé.
   */
  type D = NonNullable<Awaited<ReturnType<typeof checkoutDetail>>['data']>;
  let d: D | null = $state(null);
  let error = $state('');
  let busy = $state(false);
  // mobile money simulé : l'opérateur choisi signe la notification (Wave par défaut)
  let operateur = $state<Operateur>('wave');

  onMount(async () => {
    const r = await checkoutDetail(page.params.id ?? '');
    d = r.ok ? r.data : null;
    if (!d) error = t('paie.err_introuvable');
  });

  async function go(resultat: 'succes' | 'echec') {
    if (!d) return;
    busy = true;
    const r = await simulate(
      d.id,
      resultat,
      d.prestataire === 'mobile_money' ? operateur : undefined,
    );
    busy = false;
    if (!r.ok) {
      error = t('paie.err_inconnue');
      return;
    }
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- chemin résolu, suivi d'un paramètre
    if (resultat === 'succes') await goto(`${resolve('/abonnement')}?paiement=ok`);
    else error = t('paie.refuse');
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('paie.titre')}</title></svelte:head>

<p><a href={resolve('/offres')}>{t('paie.retour')}</a></p>
<h1>{t('paie.titre')}</h1>
<p class="card warn" data-testid="paiement-simule">{t('paie.avertissement')}</p>
{#if error}<p class="card bad" role="alert" data-testid="paiement-erreur">{error}</p>{/if}
{#if d}
  <section class="card">
    <p>{t('paie.moyen')} : <strong>{t(`paie.moyen_${d.prestataire}`)}</strong></p>
    <p>
      {t(`offre.nom_${d.plan}`)}{#if d.places}
        · {t('abo.places', { n: d.places })}{/if}
    </p>
    <p class="total" data-testid="montant">{price(d.montant, d.devise)}</p>
    {#if d.status === 'ouverte' && d.prestataire === 'mobile_money'}
      <fieldset class="ops" data-testid="operateurs">
        <legend>{t('paie.operateur')}</legend>
        {#each OPERATEURS as o (o)}
          <label
            ><input type="radio" name="operateur" value={o} bind:group={operateur} />
            {t(`paie.op_${o}`)}</label
          >
        {/each}
      </fieldset>
      <p class="muted small">{t('paie.mobile_aide')}</p>
    {/if}
    {#if d.status === 'ouverte'}
      <div class="row">
        <button
          type="button"
          class="primary"
          disabled={busy}
          onclick={() => go('succes')}
          data-testid="payer">{t('paie.payer')}</button
        >
        <button type="button" disabled={busy} onclick={() => go('echec')} data-testid="refuser"
          >{t('paie.simuler_refus')}</button
        >
      </div>
    {:else}
      <p class="muted">{t(`abo.paiement_${d.status}`)}</p>
    {/if}
  </section>
{/if}

<style>
  .ops {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    border: 2px solid var(--line);
    border-radius: var(--radius-md);
  }
  .warn {
    background: var(--warn-bg);
  }
  .bad {
    color: var(--bad-ink);
  }
  .total {
    font-size: 1.6rem;
    font-weight: 800;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>
