<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import {
    checkout,
    myBilling,
    plans,
    price,
    type MyBilling,
    type PlanView,
    type Plans,
  } from '$lib/billing';
  import { t } from '$lib/i18n';
  import { cachedMe, fetchMe, type Me } from '$lib/session';

  /**
   * Offres (lot 10) : formules et prix de la zone du compte, droits de chaque formule, moyens de paiement
   * proposés. L'achat se fait depuis l'espace adulte (code parent demandé s'il existe) ; en démonstration,
   * le paiement est SIMULÉ ; tant que la vente n'est pas ouverte, les offres sont informatives.
   */
  let data = $state<Plans | null>(null);
  let mine = $state<MyBilling | null>(null);
  let me = $state<Me | null>(null);
  let chosen: Record<string, string> = $state({});
  let seats: Record<string, number> = $state({});
  let pin = $state('');
  let pending: string | null = $state(null);
  let error = $state('');

  const kind = $derived(me?.account.kind ?? null);
  const shown = $derived(
    (data?.plans ?? []).filter(
      (p) =>
        !kind || kind === 'admin' || p.pour.includes(kind as 'parent' | 'adulte' | 'enseignant'),
    ),
  );

  onMount(async () => {
    me = (await fetchMe()) ?? (await cachedMe());
    const r = await plans();
    data = r.ok ? r.data : null;
    if (me) {
      const m = await myBilling();
      mine = m.ok ? m.data : null;
    }
  });

  const periodLabel = (p: PlanView) =>
    p.periode?.jours
      ? t('offre.jours', { n: p.periode.jours })
      : p.periode?.mois === 12
        ? t('offre.par_an')
        : p.periode?.mois === 1
          ? t('offre.par_mois')
          : p.periode?.mois
            ? t('offre.mois', { n: p.periode.mois })
            : '';

  async function buy(p: PlanView) {
    error = '';
    // barrière parentale : code parent, ou mot de passe du compte s'il n'y a pas de code (audit PAY-6) ;
    // l'essai gratuit n'est pas un achat
    if (p.kind !== 'essai' && pending !== p.code) {
      pending = p.code;
      return;
    }
    const r = await checkout({
      plan: p.code,
      ...(chosen[p.code] ? { prestataire: chosen[p.code] } : {}),
      ...(p.parPlace ? { places: seats[p.code] ?? 10 } : {}),
      ...(p.kind === 'essai' ? {} : me?.account.hasPin ? { pin } : { motDePasse: pin }),
    });
    if (!r.ok || !r.data) {
      error = t(`paie.err_${r.code ?? 'inconnue'}`);
      return;
    }
    pending = null;
    pin = '';
    if (r.data.essai) await goto(resolve('/abonnement'));
    else if (r.data.checkoutId && r.data.simule)
      await goto(resolve('/abonnement/paiement-simule/[id]', { id: r.data.checkoutId }));
    else window.location.assign(r.data.url);
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('offre.titre')}</title></svelte:head>

<h1>{t('offre.titre')}</h1>
{#if data?.mode === 'off'}<p class="card info" data-testid="vente-fermee">
    {t('offre.vente_fermee')}
  </p>{/if}
{#if data?.mode === 'simule'}<p class="card warn" data-testid="demo-paiement">
    {t('offre.demo')}
  </p>{/if}
{#if error}<p class="card bad" role="alert"><Bidi text={error} /></p>{/if}
{#if mine}
  <p class="muted">
    <Bidi text={t('offre.actuelle', { plan: t(`offre.nom_${mine.droits.plan}`) })} />
    <a href={resolve('/abonnement')}>{t('offre.voir_abonnement')}</a>
  </p>
{/if}

<ul class="plans" data-testid="offres">
  {#each shown as p (p.code)}
    <li class="card plan" data-plan={p.code} class:current={mine?.droits.plan === p.code}>
      <h2><Bidi text={t(`offre.nom_${p.code}`)} /></h2>
      <p class="price">
        {#if p.prix}<strong><Bidi text={price(p.prix.montant, p.prix.devise)} /></strong>
          {#if p.parPlace}{t('offre.par_eleve')}{/if}
          <Bidi text={periodLabel(p)} />
        {:else if p.kind === 'essai'}<strong>{t('offre.gratuit')}</strong>
          <Bidi text={periodLabel(p)} />
        {:else}<strong>{t('offre.gratuit')}</strong>{/if}
      </p>
      <p class="muted small"><Bidi text={t(`offre.desc_${p.code}`)} /></p>
      <ul class="rights">
        <li>
          <Bidi
            text={p.droits.niveaux === 'tous'
              ? t('offre.d_tous')
              : t('offre.d_decouverte', { n: p.droits.leconsOuvertes ?? 0 })}
          />
        </li>
        <li>
          <Bidi text={p.droits.horsLigne ? t('offre.d_hors_ligne') : t('offre.d_en_ligne')} />
        </li>
        <li>
          <Bidi
            text={p.droits.hifz === 'complet'
              ? t('offre.d_hifz_complet')
              : t('offre.d_hifz_carnet')}
          />
        </li>
        <li>
          <Bidi
            text={p.droits.bibliotheque === 'complete'
              ? t('offre.d_biblio_complete')
              : t('offre.d_biblio_partielle')}
          />
        </li>
        {#if p.droits.tuteurIA}<li>{t('offre.d_tuteur')}</li>{/if}
        {#if p.kind !== 'licence'}<li>
            <Bidi text={t('offre.d_profils', { n: p.droits.profilsMax })} />
          </li>{/if}
      </ul>
      {#if p.kind === 'gratuit'}
        {#if mine?.droits.plan === 'gratuit'}<p class="tag">{t('offre.formule_actuelle')}</p>{/if}
      {:else if data?.mode !== 'off' && me}
        {#if p.prestataires.length > 1}
          <fieldset class="moyens">
            <legend>{t('offre.moyen')}</legend>
            {#each p.prestataires as m (m)}
              <label
                ><input
                  type="radio"
                  name="moyen-{p.code}"
                  value={m}
                  checked={(chosen[p.code] ?? p.prestataires[0]) === m}
                  onchange={() => (chosen[p.code] = m)}
                />
                <Bidi text={t(`paie.moyen_${m}`)} /></label
              >
            {/each}
          </fieldset>
        {:else if p.prestataires.length === 1}
          <p class="small">
            {t('offre.moyen')} : <Bidi text={t(`paie.moyen_${p.prestataires[0]}`)} />
          </p>
        {/if}
        {#if p.parPlace}
          <label class="small"
            >{t('offre.places')}
            <input
              type="number"
              min="1"
              max="2000"
              value={seats[p.code] ?? 10}
              oninput={(e) => (seats[p.code] = Number(e.currentTarget.value))}
              data-testid="places"
            /></label
          >
        {/if}
        {#if pending === p.code}
          <form
            class="pin"
            onsubmit={(e) => {
              e.preventDefault();
              void buy(p);
            }}
          >
            {#if me?.account.hasPin}
              <label for="pin-{p.code}">{t('offre.code_parent')}</label>
              <input
                id="pin-{p.code}"
                inputmode="numeric"
                maxlength="4"
                autocomplete="off"
                bind:value={pin}
                data-testid="pin-achat"
              />
            {:else}
              <label for="pin-{p.code}">{t('offre.mot_de_passe')}</label>
              <input
                id="pin-{p.code}"
                type="password"
                maxlength="512"
                autocomplete="current-password"
                bind:value={pin}
                data-testid="mdp-achat"
              />
            {/if}
            <button type="submit" class="primary">{t('offre.confirmer')}</button>
          </form>
        {:else if p.kind === 'essai'}
          {#if mine?.essaiDisponible}<button
              type="button"
              class="primary"
              onclick={() => buy(p)}
              data-testid="choisir-{p.code}">{t('offre.essayer')}</button
            >{:else}<p class="muted small">{t('offre.essai_utilise')}</p>{/if}
        {:else}
          <button
            type="button"
            class="primary"
            onclick={() => buy(p)}
            data-testid="choisir-{p.code}">{t('offre.choisir')}</button
          >
        {/if}
      {/if}
    </li>
  {/each}
</ul>
<p class="muted small">
  <Bidi text={t('offre.prix_a_valider')} /> <a href={resolve('/garanties')}>{t('gar.titre')}</a>
</p>

<style>
  .plans {
    list-style: none;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 12px;
  }
  .plan {
    display: grid;
    align-content: start;
    gap: 6px;
    margin: 0;
  }
  .plan.current {
    border-color: var(--teal);
  }
  .plan h2 {
    font-size: 1.15rem;
  }
  .price strong {
    font-size: 1.3rem;
  }
  .rights {
    margin: 0;
    padding-inline-start: 18px;
  }
  .moyens {
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    display: grid;
    gap: 2px;
  }
  .tag {
    color: var(--ok-ink);
    font-weight: 700;
  }
  .pin {
    display: grid;
    gap: 4px;
  }
  .info {
    background: var(--sand);
  }
  .warn {
    background: var(--warn-bg);
  }
  .bad {
    color: var(--bad-ink);
  }
  .small {
    font-size: 0.9rem;
  }
</style>
