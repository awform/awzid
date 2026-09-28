<script lang="ts">
  import { fmtDate, t } from '$lib/i18n';

  /**
   * Activité des 14 derniers jours : une seule série (activités par jour), barres fines à bouts arrondis,
   * info-bulle au survol, valeur du meilleur jour étiquetée, tableau équivalent pour les lecteurs d'écran.
   */
  interface Day {
    day: string;
    reponses: number;
    traces: number;
    cartes: number;
    hifz: number;
  }
  let { days }: { days: Day[] } = $props();
  const total = (d: Day) => d.reponses + d.traces + d.cartes + d.hifz;
  const max = $derived(Math.max(1, ...days.map(total)));
  const best = $derived(days.reduce((b, d, i) => (total(d) > total(days[b]!) ? i : b), 0));
  const label = (d: Day) =>
    `${fmtDate(d.day, { weekday: 'short', day: 'numeric', month: 'short' })} : ${t(
      'tableau.detail',
      {
        reponses: d.reponses,
        traces: d.traces,
        cartes: d.cartes,
        hifz: d.hifz,
      },
    )}`;
</script>

<figure class="chart" data-testid="activite">
  <div
    class="bars"
    role="img"
    aria-label={t('tableau.activite_aria', { n: days.reduce((s, d) => s + total(d), 0) })}
  >
    {#each days as d, i (d.day)}
      <div class="col" title={label(d)}>
        {#if i === best && total(d) > 0}<span class="val">{total(d)}</span>{/if}
        <span class="bar" style:height={`${(total(d) / max) * 100}%`}></span>
      </div>
    {/each}
  </div>
  <div class="axis">
    <span>{days[0] ? fmtDate(days[0].day, { day: 'numeric', month: 'short' }) : ''}</span>
    <span>{days.at(-1) ? fmtDate(days.at(-1)!.day, { day: 'numeric', month: 'short' }) : ''}</span>
  </div>
  <details>
    <summary>{t('tableau.voir_tableau')}</summary>
    <table>
      <thead>
        <tr
          ><th>{t('tableau.jour')}</th><th>{t('tableau.reponses')}</th><th>{t('tableau.traces')}</th
          ><th>{t('tableau.cartes')}</th><th>{t('tableau.hifz')}</th></tr
        >
      </thead>
      <tbody>
        {#each days as d (d.day)}
          <tr
            ><td>{fmtDate(d.day, { dateStyle: 'short' })}</td><td>{d.reponses}</td><td
              >{d.traces}</td
            ><td>{d.cartes}</td><td>{d.hifz}</td></tr
          >
        {/each}
      </tbody>
    </table>
  </details>
</figure>

<style>
  .chart {
    margin: 8px 0;
  }
  .bars {
    display: grid;
    grid-template-columns: repeat(14, 1fr);
    gap: 2px;
    height: 96px;
    align-items: end;
    border-bottom: 1px solid var(--line);
  }
  .col {
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
  }
  .col:hover .bar {
    opacity: 0.8;
  }
  .bar {
    display: block;
    width: 70%;
    min-height: 0;
    background: var(--teal);
    border-radius: 4px 4px 0 0;
  }
  .val {
    font-size: 0.75rem;
    color: var(--ink2);
  }
  .axis {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
    color: var(--ink2);
  }
  table {
    border-collapse: collapse;
    font-size: 0.85rem;
  }
  th,
  td {
    padding: 2px 8px;
    border-bottom: 1px solid var(--line);
    text-align: start;
  }
</style>
