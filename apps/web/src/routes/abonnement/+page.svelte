<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { cancel, myBilling, price, type MyBilling } from '$lib/billing';
  import { fmtDate, t } from '$lib/i18n';

  /** Mon abonnement (lot 10) : formule et droits actuels, abonnements, profils couverts, paiements. */
  let data: MyBilling | null = $state(null);
  let loaded = $state(false);
  let msg = $state('');
  const paid = $derived(page.url.searchParams.get('paiement') === 'ok');

  async function load() {
    const r = await myBilling();
    data = r.ok ? r.data : null;
    loaded = true;
  }
  onMount(load);

  async function stop(id: string) {
    const r = await cancel(id);
    if (r.ok) {
      msg = t('abo.annule');
      await load();
    }
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('abo.titre')}</title></svelte:head>

<h1>{t('abo.titre')}</h1>
{#if paid}<p class="card ok" role="status" data-testid="paiement-ok">{t('abo.paiement_ok')}</p>{/if}
{#if msg}<p class="card ok" role="status">{msg}</p>{/if}
{#if data?.mode === 'simule'}<p class="card warn">{t('offre.demo')}</p>{/if}

{#if loaded && !data}
  <p class="card">{t('abo.connexion')}</p>
{:else if data}
  <section class="card" data-testid="formule-actuelle" data-plan={data.droits.plan}>
    <h2>{t(`offre.nom_${data.droits.plan}`)}</h2>
    {#if data.droits.jusquAu}<p>{t('abo.jusqu_au', { date: fmtDate(data.droits.jusquAu) })}</p>{/if}
    <ul>
      <li>
        {data.droits.droits.niveaux === 'tous'
          ? t('offre.d_tous')
          : t('offre.d_decouverte', { n: data.droits.droits.leconsOuvertes ?? 0 })}
      </li>
      <li>{data.droits.droits.horsLigne ? t('offre.d_hors_ligne') : t('offre.d_en_ligne')}</li>
      <li>
        {data.droits.droits.hifz === 'complet'
          ? t('offre.d_hifz_complet')
          : t('offre.d_hifz_carnet')}
      </li>
      {#if data.droits.droits.tuteurIA}<li>{t('offre.d_tuteur')}</li>{/if}
    </ul>
    <p>
      <a class="button primary" href={resolve('/offres')} data-testid="voir-offres"
        >{t('abo.voir_offres')}</a
      >
      <a class="button" href={resolve('/activation')} data-testid="lien-activation"
        >{t('act.lien')}</a
      >
    </p>
  </section>

  {#if data.profils.length}
    <section class="card">
      <h2>{t('abo.profils')}</h2>
      <ul>
        {#each data.profils as p (p.id)}<li data-profil-plan={p.plan}>
            {p.pseudonym} : {t(`offre.nom_${p.plan}`)}
          </li>{/each}
      </ul>
    </section>
  {/if}

  <section class="card">
    <h2>{t('abo.abonnements')}</h2>
    <ul class="list" data-testid="abonnements">
      {#each data.abonnements as s (s.id)}
        <li data-abonnement={s.plan} data-status={s.status}>
          <strong>{t(`offre.nom_${s.plan}`)}</strong> · {t(`abo.statut_${s.status}`)}
          {#if s.seats}· {t('abo.places', { n: s.seats })}{/if}
          {#if s.fin}· {t('abo.fin', { date: fmtDate(s.fin) })}{/if}
          {#if (s.status === 'active' || s.status === 'essai') && !s.annulationFinPeriode}
            <button type="button" class="small" onclick={() => stop(s.id)} data-testid="annuler"
              >{s.status === 'essai' ? t('abo.arreter_essai') : t('abo.annuler')}</button
            >
          {/if}
        </li>
      {:else}
        <li class="muted">{t('abo.aucun')}</li>
      {/each}
    </ul>
  </section>

  {#if data.paiements.length}
    <section class="card">
      <h2>{t('abo.paiements')}</h2>
      <ul class="list">
        {#each data.paiements as p (p.id)}
          <li>
            {fmtDate(p.date)} · {t(`offre.nom_${p.plan}`)} · {price(p.montant, p.devise)} · {t(
              `paie.moyen_${p.prestataire}`,
            )}
            · {t(`abo.paiement_${p.status}`)}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
{/if}

<style>
  .list {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .ok {
    background: var(--ok-bg);
  }
  .warn {
    background: var(--warn-bg);
  }
  .small {
    font-size: 0.9rem;
    /* audit A11Y-1 : 44 px au moins */
    min-height: 44px;
  }
</style>
