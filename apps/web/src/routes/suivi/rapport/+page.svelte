<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { localIso } from '$lib/hifz';
  import { fmtDate, t } from '$lib/i18n';
  import { call, fetchMe, type Me } from '$lib/session';

  /**
   * Rapport de la semaine (lot 11, étude rec. 10) : chaque dimanche, pour chaque profil du compte, ce qui a
   * été fait du lundi au dimanche — sans points publics ni comparaison ; pour un enfant, aucun compteur de
   * jours. Semaine précédente consultable.
   */
  interface Report {
    profil: { id: string; pseudonym: string; enfant: boolean };
    semaine: { lundi: string; dimanche: string };
    joursActifs: number | null;
    totaux: { reponses: number; cartes: number; traces: number; hifz: number };
    lecons: Array<{ unitId: string; status: string }>;
    validations: Array<{ day: string; part: string; mention: string | null }>;
    reponsesEnseignant: Array<{ text: string; answer: string | null }>;
    jalons: { lettres: string[]; leconsTerminees: number; leconsMaitrisees: number };
  }
  let me = $state<Me | null>(null);
  let reports = $state<Report[]>([]);
  let offset = $state(0);
  let loaded = $state(false);

  /** dimanche de référence : aujourd'hui si c'est dimanche, sinon le dernier dimanche passé */
  function sunday(weeksBack: number): string {
    const d = new Date(`${localIso()}T00:00:00Z`);
    const back = d.getUTCDay() === 0 ? 0 : d.getUTCDay();
    return new Date(d.getTime() - (back + 7 * weeksBack) * 86_400_000).toISOString().slice(0, 10);
  }
  async function load() {
    const out: Report[] = [];
    for (const p of me?.profiles ?? []) {
      const r = await call<Report>('GET', `/rapport-hebdo/${p.id}?dimanche=${sunday(offset)}`);
      if (r.ok && r.data) out.push(r.data);
    }
    reports = out;
    loaded = true;
  }
  onMount(async () => {
    me = await fetchMe();
    await load();
  });
  async function shift(n: number) {
    offset = Math.max(0, offset + n);
    await load();
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('rap.titre')}</title></svelte:head>

<p><a href={resolve('/suivi')}>{t('rap.retour')}</a></p>
<h1>{t('rap.titre')}</h1>
{#if reports[0]}
  <p class="muted" data-testid="semaine">
    {t('rap.semaine', {
      lundi: fmtDate(reports[0].semaine.lundi),
      dimanche: fmtDate(reports[0].semaine.dimanche),
    })}
  </p>
{/if}
<p class="row">
  <button type="button" onclick={() => shift(1)} data-testid="semaine-precedente"
    >{t('rap.precedente')}</button
  >
  {#if offset > 0}<button type="button" onclick={() => shift(-1)}>{t('rap.suivante')}</button>{/if}
</p>

{#if loaded && !reports.length}<p class="card">{t('rap.aucun')}</p>{/if}
{#each reports as r (r.profil.id)}
  <section class="card" data-rapport={r.profil.id}>
    <h2>{r.profil.pseudonym}</h2>
    <ul>
      {#if r.joursActifs !== null}<li>{t('rap.jours', { n: r.joursActifs })}</li>{/if}
      <li>{t('rap.reponses', { n: r.totaux.reponses })}</li>
      <li>{t('rap.hifz', { n: r.totaux.hifz })}</li>
      <li>{t('rap.mots', { n: r.totaux.cartes })} · {t('rap.traces', { n: r.totaux.traces })}</li>
      <li>{t('rap.lecons', { n: r.lecons.length })}</li>
      <!-- la même partie peut être validée deux fois le même jour : clé = position (jamais jour + partie) -->
      {#each r.validations as v, i (i)}
        <li>
          {t('rap.validation', { part: v.part, date: fmtDate(v.day) })}{#if v.mention}
            — {v.mention}{/if}
        </li>
      {/each}
      {#each r.reponsesEnseignant as a, i (i)}<li>
          {t('rap.reponse_enseignant')} « {a.answer} »
        </li>{/each}
      <li>
        {t('auj.j_lettres', { n: r.jalons.lettres.length })} · {t('auj.j_lecons', {
          n: r.jalons.leconsTerminees,
          m: r.jalons.leconsMaitrisees,
        })}
      </li>
    </ul>
  </section>
{/each}
<p class="muted small">{t('rap.sans_comparaison')}</p>

<style>
  .row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .small {
    font-size: 0.9rem;
  }
</style>
