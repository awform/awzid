<script lang="ts">
  import { onMount } from 'svelte';
  import { carnetLabel, levelLabel } from '$lib/levels';
  import { resolve } from '$app/paths';
  import ActivityBars from '$lib/ActivityBars.svelte';
  import { demoProfileFor, pendingCount, type DevProfile } from '$lib/attempts';
  import { hifzSummary, localIso, type HifzSummary } from '$lib/hifz';
  import { fmtDate, fmtNumber, t } from '$lib/i18n';
  import { localPacks } from '$lib/offline';
  import { call, cachedMe, type ProfileInfo } from '$lib/session';
  import Sym from '$lib/Sym.svelte';
  import { lastSync } from '$lib/sync-core';

  /**
   * Tableau de bord (cahier L6) : le PARENT voit chacun de ses enfants, l'ADULTE son propre parcours.
   * Leçons par état, activité des 14 derniers jours, tracés et mots révisés, hifẓ. Aucun classement,
   * aucune note de tracé ; hors ligne : la dernière copie gardée sur l'appareil.
   */
  interface Dash {
    levels: Record<string, Record<string, number>>;
    activity: Array<{
      day: string;
      reponses: number;
      traces: number;
      cartes: number;
      hifz: number;
    }>;
    traces: { total: number; reussis: number };
    cartes: { total: number; sus: number };
  }
  interface Row {
    p: ProfileInfo;
    dash: Dash | null;
    hifz: HifzSummary | null;
  }
  let profile: DevProfile | null = $state(null);
  let rows: Row[] = $state([]);
  let totals: Record<string, number> = $state({});
  let pending = $state(0);
  let synced: string | undefined = $state(undefined);
  let packs = $state(0);
  let loaded = $state(false);
  let offline = $state(false);

  onMount(async () => {
    pending = await pendingCount();
    synced = await lastSync();
    packs = (await localPacks()).length;
    profile = await demoProfileFor('');
    const me = await cachedMe();
    const list = me?.account.kind === 'parent' ? me.profiles : profile ? [profile] : [];
    const lv = await call<{ levels: Array<{ code: string; units: number }> }>('GET', '/levels');
    totals = Object.fromEntries((lv.data?.levels ?? []).map((l) => [l.code, l.units]));
    for (const p of list) {
      const r = await call<Dash>('GET', `/dashboard/${p.id}?today=${localIso()}`);
      if (!r.ok) offline = true;
      rows = [...rows, { p, dash: r.data, hifz: await hifzSummary(p.id) }];
    }
    loaded = true;
  });

  const STATUSES = ['maitrisee', 'terminee', 'commencee'];
  const done = (c: Record<string, number>) => (c.maitrisee ?? 0) + (c.terminee ?? 0);
</script>

<svelte:head><title>{t('app.nom')} — {t('onglets.suivi')}</title></svelte:head>

<h1>{t('onglets.suivi')}</h1>
{#if loaded && rows.length === 0}
  <p class="card">
    {t('suivi.choisir_profil')} <a href={resolve('/profils')}>{t('suivi.qui_apprend')}</a>
  </p>
{/if}
{#if offline}<p class="muted">{t('suivi.hors_ligne')}</p>{/if}

{#each rows as r (r.p.id)}
  <section class="card who" data-testid="tableau-{r.p.pseudonym}">
    <h2><Sym id={r.p.avatar ?? 'etoile'} size={32} /> {r.p.pseudonym}</h2>
    {#if r.dash}
      <h3>{t('suivi.mes_lecons')}</h3>
      {#each Object.entries(r.dash.levels) as [level, c] (level)}
        {@const total = totals[level] ?? 0}
        <div class="lv" data-level={level}>
          <strong>{levelLabel(level)}</strong>
          <div
            class="progress"
            role="img"
            aria-label={t('tableau.lecons_finies', { n: done(c), total })}
          >
            <span style:width={`${total ? (done(c) / total) * 100 : 0}%`}></span>
          </div>
          <p class="small">
            {t('tableau.lecons_finies', { n: done(c), total })}
            {#each STATUSES.filter((s) => c[s]) as s (s)}<span class="chip"
                >{t('suivi.compte', { n: c[s] ?? 0, statut: t(`statut.${s}`) })}</span
              >{/each}
          </p>
        </div>
      {:else}
        <p class="muted">{t('suivi.rien')}</p>
      {/each}
      <h3>{t('tableau.activite')}</h3>
      <ActivityBars days={r.dash.activity} />
      <p class="small" data-testid="entrainement">
        {t('tableau.traces_resume', { n: r.dash.traces.reussis, total: r.dash.traces.total })} ·
        {t('tableau.cartes_resume', { n: r.dash.cartes.sus, total: r.dash.cartes.total })}
      </p>
    {/if}
    <h3>{t('suivi.hifz')}</h3>
    <p class="small" data-testid="suivi-hifz">
      {#if r.hifz}
        {r.hifz.plan.mode === 'carnet'
          ? carnetLabel(r.hifz.plan.bookCode ?? '')
          : t('hifz.rythme_actuel', { n: r.hifz.plan.rhythmYears ?? 7 })} ·
        {t('hifz.acquis_carnet', { n: r.hifz.acquired, total: r.hifz.total })} ·
        {t('suivi.a_reviser', { n: r.hifz.due })}
        {#if r.hifz.stopRule}· <span class="warn">{t('hifz.regle_arret')}</span>{/if}
        {#if r.hifz.lastNote}· {t('hifz.note', { n: fmtNumber(r.hifz.lastNote.total) })}{/if}
      {:else}<span class="muted">{t('suivi.hifz_rien')}</span>{/if}
    </p>
  </section>
{/each}

<section class="card">
  <h2>{t('tableau.continuer')}</h2>
  <p class="links">
    <a href={resolve('/revisions')}>{t('revisions.titre')}</a>
    <a href={resolve('/ecriture')}>{t('trace.titre')}</a>
    <a href={resolve('/hifz')}>{t('coran.ouvrir_carnet')}</a>
  </p>
</section>

<section class="card">
  <h2>{t('suivi.appareil')}</h2>
  <p>
    {t('suivi.niveaux', { n: packs })} — <a href={resolve('/hors-ligne')}>{t('horsligne.titre')}</a>
  </p>
  <p>{t('suivi.attente', { n: pending })}</p>
  <p class="muted">
    {synced ? t('suivi.dernier_envoi', { date: fmtDate(synced) }) : t('suivi.jamais')}
  </p>
  <p><a href={resolve('/ecole')}>{t('horsligne.lien_ecole')}</a></p>
</section>

<style>
  .who h2 {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  h3 {
    font-size: 1rem;
    margin: 12px 0 4px;
  }
  .progress {
    height: 10px;
    background: var(--line);
    border-radius: 999px;
    overflow: hidden;
    margin: 4px 0;
  }
  .progress span {
    display: block;
    height: 100%;
    background: var(--teal);
  }
  .chip {
    display: inline-block;
    margin: 0 4px;
    padding: 1px 10px;
    border-radius: 99px;
    background: var(--ok-bg);
    color: var(--ok-ink);
    font-weight: 700;
    font-size: 0.85rem;
  }
  .small {
    font-size: 0.92rem;
  }
  .warn {
    color: var(--warn-ink);
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
</style>
