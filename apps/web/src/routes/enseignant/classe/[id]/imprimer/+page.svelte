<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { fmtDate, fmtNumber, t } from '$lib/i18n';
  import { call } from '$lib/session';

  /**
   * Tableau de suivi de la classe, IMPRIMABLE (A4 paysage) : « Imprimer » ou « Enregistrer au format PDF »
   * du navigateur, y compris sur téléphone. Aucune donnée ne quitte l'application par un service tiers.
   */
  interface Row {
    pupil: { id: string; displayName: string; profileId: string | null };
    lessonsDone: number | null;
    bilans: Array<number | null>;
    result: {
      examenPct: number | null;
      cc: number | null;
      nf: number | null;
      decision: { code: string } | null;
    } | null;
    lastHifz: { part: string; total: number } | null;
    assignments: Array<{ done: boolean; late: boolean }>;
  }
  interface Tableau {
    class: {
      name: string;
      schoolName: string | null;
      schoolYear: string | null;
      levelCode: string | null;
    };
    lessons: number;
    bilans: Array<{ id: string; n: number | null }>;
    rows: Row[];
  }
  let tb = $state<Tableau | null>(null);
  let error = $state('');
  const id = $derived(page.params.id ?? '');
  const n = (x: number | null | undefined) => (x === null || x === undefined ? '—' : fmtNumber(x));

  onMount(async () => {
    const r = await call<Tableau>('GET', `/ecole/classes/${id}/tableau`);
    if (r.ok) tb = r.data;
    else error = t(`erreur.${r.code ?? 'reseau'}`);
  });
</script>

<svelte:head><title>{t('app.nom')} — {t('classe.imprimer_tableau')}</title></svelte:head>

<div class="noprint row">
  <a href={resolve('/enseignant/classe/[id]', { id })}>{t('classe.retour_classe')}</a>
  <button type="button" class="primary" onclick={() => window.print()} data-testid="imprimer"
    >{t('classe.imprimer_pdf')}</button
  >
</div>
{#if error}<p class="card" role="alert">{error}</p>{/if}
{#if tb}
  <section class="sheet" data-testid="feuille">
    <h1 id="titre-feuille">{tb.class.name}</h1>
    <p class="small">
      {tb.class.schoolName ?? ''}
      {#if tb.class.schoolYear}· {tb.class.schoolYear}{/if}
      {#if tb.class.levelCode}· {tb.class.levelCode.toUpperCase()}{/if}
      · {fmtDate(new Date(), { dateStyle: 'long' })}
    </p>
    <table aria-labelledby="titre-feuille">
      <thead>
        <tr>
          <th>{t('classe.eleve')}</th>
          <th>{t('classe.lecons')}</th>
          {#each tb.bilans as b, i (b.id)}<th>{t('classe.bilan_n', { n: b.n ?? i + 1 })}</th>{/each}
          <th>{t('classe.examen')}</th>
          <th>{t('classe.cc')}</th>
          <th>{t('classe.nf')}</th>
          <th>{t('classe.decision')}</th>
          <th>{t('classe.hifz')}</th>
          <th>{t('classe.devoirs')}</th>
        </tr>
      </thead>
      <tbody>
        {#each tb.rows as r (r.pupil.id)}
          <tr>
            <td>{r.pupil.displayName}</td>
            <td>{r.lessonsDone === null ? '—' : `${r.lessonsDone}/${tb.lessons}`}</td>
            {#each r.bilans as b, i (i)}<td class="num">{n(b)}</td>{/each}
            <td class="num">{n(r.result?.examenPct)}</td>
            <td class="num">{n(r.result?.cc)}</td>
            <td class="num">{n(r.result?.nf)}</td>
            <td
              >{r.result?.decision
                ? t(`classe.decision_${r.result.decision.code}`)
                : r.result
                  ? t('classe.incomplet')
                  : '—'}</td
            >
            <td
              >{#if r.lastHifz}{r.lastHifz.part} · {fmtNumber(r.lastHifz.total)}{:else}—{/if}</td
            >
            <td
              >{t('classe.faits', {
                n: r.assignments.filter((a) => a.done).length,
                total: r.assignments.length,
              })}</td
            >
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="small">{t('classe.imprime_note')}</p>
  </section>
{/if}

<style>
  @page {
    size: A4 landscape;
    margin: 12mm;
  }
  .row {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 12px;
  }
  .sheet {
    background: var(--card);
    color: var(--ink);
    padding: 12px;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.9rem;
  }
  th,
  td {
    border: 1px solid var(--line);
    padding: 4px 6px;
    text-align: start;
  }
  td.num {
    text-align: end;
    font-variant-numeric: tabular-nums;
  }
  .small {
    font-size: 0.85rem;
  }
  @media print {
    .noprint,
    :global(header.top),
    :global(nav.tabs) {
      display: none !important;
    }
    :global(body) {
      background: var(--card);
    }
    .sheet {
      padding: 0;
    }
  }
</style>
