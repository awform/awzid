<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { fmtNumber, t } from '$lib/i18n';
  import { fetchMe, type Me } from '$lib/session';
  import { loadSynthese, type ClassSummary, type Totaux } from '$lib/ecole';

  /**
   * Tableau de bord « école » (suite V1-b, CDC §2.9) : synthèse de toutes les classes de l'enseignant.
   * Des chiffres seulement (aucun élève comparé aux autres) ; pas de rôle « direction » (D15).
   */
  let me = $state<Me | null>(null);
  let loaded = $state(false);
  let rows = $state<ClassSummary[]>([]);
  let tot = $state<Totaux | null>(null);
  let error = $state('');
  const isTeacher = $derived(me?.account.kind === 'enseignant');
  const blocked = $derived(!!me && me.mfaRequired && !me.mfaVerified);

  onMount(async () => {
    me = await fetchMe();
    if (isTeacher && !blocked) {
      const r = await loadSynthese();
      if (!r.ok) error = t(`erreur.${r.code ?? 'reseau'}`);
      rows = r.data?.classes ?? [];
      tot = r.data?.totaux ?? null;
    }
    loaded = true;
  });
  const taux = (n: number | null) => (n === null ? '—' : t('eco.taux', { n: fmtNumber(n) }));
</script>

<svelte:head><title>{t('app.nom')} — {t('eco.titre')}</title></svelte:head>

<h1>{t('eco.titre')}</h1>
{#if error}<p class="card bad" role="alert"><Bidi text={error} /></p>{/if}
{#if loaded && !isTeacher}
  <p class="card">{t('ens.reserve')}</p>
{:else if blocked}
  <p class="card warnbox">
    {t('compte.totp_obligatoire')} <a href={resolve('/compte')}>{t('entete.compte')}</a>
  </p>
{:else if loaded}
  <p class="muted small">{t('eco.aide')}</p>
  {#if rows.length}
    <div class="tw">
      <table data-testid="synthese" aria-label={t('eco.tableau')}>
        <thead>
          <tr>
            <th scope="col">{t('eco.classe')}</th>
            <th scope="col">{t('eco.eleves')}</th>
            <th scope="col">{t('eco.actifs')}</th>
            <th scope="col">{t('eco.devoirs')}</th>
            <th scope="col">{t('eco.copies')}</th>
            <th scope="col">{t('eco.certificats')}</th>
            <th scope="col">{t('eco.recitals')}</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as r (r.id)}
            <tr>
              <th scope="row"
                ><a href={resolve('/enseignant/classe/[id]', { id: r.id })}><Bidi text={r.nom} /></a
                >
                {#if r.niveau}<span class="muted small"><Bidi text={r.niveau.toUpperCase()} /></span
                  >{/if}</th
              >
              <td class="num"
                >{fmtNumber(r.eleves)} ({fmtNumber(r.elevesApplication)} / {fmtNumber(
                  r.elevesPapier,
                )})</td
              >
              <td class="num">{fmtNumber(r.actifs7j)} · <Bidi text={taux(r.tauxActivite)} /></td>
              <td class="num">{fmtNumber(r.devoirsEnCours)}</td>
              <td class="num">{fmtNumber(r.copiesACorriger)}</td>
              <td class="num">{fmtNumber(r.certificats)}</td>
              <td class="num">{fmtNumber(r.recitalsPublies)}</td>
            </tr>
          {/each}
        </tbody>
        {#if tot}
          <tfoot>
            <tr data-testid="synthese-total">
              <th scope="row"><Bidi text={t('eco.total', { n: tot.classes })} /></th>
              <td class="num"
                >{fmtNumber(tot.eleves)} ({fmtNumber(tot.elevesApplication)} / {fmtNumber(
                  tot.elevesPapier,
                )})</td
              >
              <td class="num">{fmtNumber(tot.actifs7j)}</td>
              <td class="num">{fmtNumber(tot.devoirsEnCours)}</td>
              <td class="num">{fmtNumber(tot.copiesACorriger)}</td>
              <td class="num">{fmtNumber(tot.certificats)}</td>
              <td class="num">{fmtNumber(tot.recitalsPublies)}</td>
            </tr>
          </tfoot>
        {/if}
      </table>
    </div>
  {:else}
    <p class="muted">{t('eco.aucune')}</p>
  {/if}
{/if}

<style>
  .tw {
    overflow-x: auto;
    max-width: calc(100vw - 32px);
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.95rem;
  }
  th,
  td {
    border-bottom: 1px solid var(--line);
    padding: 6px;
    text-align: start;
    vertical-align: top;
  }
  td.num {
    text-align: end;
    font-variant-numeric: tabular-nums;
  }
  tfoot th,
  tfoot td {
    font-weight: 700;
  }
  .small {
    font-size: 0.9rem;
  }
</style>
