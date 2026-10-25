<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { fmtDate, t } from '$lib/i18n';
  import type { ProfileInfo } from '$lib/session';
  import { archiver, modifier, rappelCompte, type PlanApi } from './donnees';
  import { ajouterJours, calculer, HEURES_RAPPEL, PAGES_PAR_JOUR, WIRD_PAGES } from './plan';
  import SuiviGroupe from './SuiviGroupe.svelte';

  /**
   * Régler un plan : repousser la fin (une pause, sans reproche), changer le rythme, le rappel, corriger l'avancement,
   * archiver ; pour le responsable d'un groupe, voir les parts (sans pourcentage en « mode serein ») et en confier une.
   */
  let {
    plan,
    profil,
    jour,
    rappel,
    corriger,
    fait,
  }: {
    plan: PlanApi;
    profil: ProfileInfo | null;
    jour: string;
    rappel: boolean;
    corriger: (page: number) => void;
    fait: (archive: boolean, maj: PlanApi | null) => void;
  } = $props();

  const c = $derived(calculer(plan, plan.part, jour));
  let fin = $state('');
  let pagesJour = $state(0);
  let heure = $state<number | null>(null);
  let page = $state(0);
  let message = $state('');
  let erreur = $state('');

  onMount(() => {
    fin = plan.endDate ?? '';
    pagesJour = plan.pagesPerDay ?? 1;
    heure = plan.reminderHour;
    page = c.pageCourante ?? plan.part.lastPage;
  });

  async function appliquer(corps: object, ok: string) {
    if (!profil) return;
    erreur = '';
    message = '';
    const r = await modifier(profil.id, plan.id, corps);
    if (r.ok && r.data) {
      message = ok;
      fait(false, r.data.plan);
    } else erreur = r.code === 'reseau' ? t('kh.erreur_reseau') : t('kh.erreur');
  }

  async function pause() {
    const base = plan.endDate && plan.endDate > jour ? plan.endDate : jour;
    const nouvelle = ajouterJours(base, 7);
    await appliquer(
      { endDate: nouvelle },
      t('kh.pause_faite', { date: fmtDate(nouvelle, { dateStyle: 'long' }) }),
    );
  }
  async function changerFin(e: SubmitEvent) {
    e.preventDefault();
    if (fin) await appliquer({ endDate: fin }, t('kh.enregistre'));
  }
  async function changerRythme(e: SubmitEvent) {
    e.preventDefault();
    await appliquer({ pagesPerDay: pagesJour }, t('kh.enregistre'));
  }
  async function changerRappel(e: SubmitEvent) {
    e.preventDefault();
    await appliquer({ reminderHour: heure }, t('kh.enregistre'));
    if (heure !== null && !rappel) await rappelCompte(true);
  }
  async function archive() {
    const r = await archiver(plan.id);
    if (r.ok) fait(true, null);
    else erreur = t('kh.erreur');
  }
</script>

<div class="reg" data-testid="khatma-reglages">
  {#if plan.responsable && plan.mode === 'duree'}
    <form onsubmit={changerFin} class="bloc">
      <label
        >{t('kh.fin_a')}
        <input type="date" min={jour} bind:value={fin} data-testid="kh-fin" /></label
      >
      <button type="submit" data-testid="kh-fin-ok">{t('kh.enregistrer')}</button>
    </form>
    <button type="button" class="bloc-bouton" onclick={pause} data-testid="kh-pause"
      >{t('kh.pause')}</button
    >
  {/if}

  {#if plan.responsable && plan.mode !== 'duree'}
    <form onsubmit={changerRythme} class="bloc">
      <label
        >{t('kh.pages_par_jour')}
        <select bind:value={pagesJour} data-testid="kh-rythme">
          {#each plan.kind === 'wird' ? WIRD_PAGES : PAGES_PAR_JOUR as n (n)}
            <option value={n}>{n}</option>
          {/each}
        </select></label
      >
      <button type="submit" data-testid="kh-rythme-ok">{t('kh.enregistrer')}</button>
    </form>
  {/if}

  <form onsubmit={changerRappel} class="bloc">
    <label
      >{t('kh.rappel')}
      <select
        value={heure ?? ''}
        onchange={(e) =>
          (heure = e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
        data-testid="kh-rappel-reglage"
      >
        <option value="">{t('kh.rappel_aucun')}</option>
        {#each HEURES_RAPPEL as h (h)}<option value={h}>{t('kh.rappel_a', { h })}</option>{/each}
      </select></label
    >
    <button type="submit">{t('kh.enregistrer')}</button>
  </form>
  {#if heure !== null}<p class="petit muted">{t('kh.rappel_aide')}</p>{/if}

  <form
    class="bloc"
    onsubmit={(e) => {
      e.preventDefault();
      corriger(page);
    }}
  >
    <label
      >{t('kh.corriger')}
      <input
        type="number"
        min={plan.part.firstPage}
        max={plan.part.lastPage}
        bind:value={page}
        data-testid="kh-page"
      /></label
    >
    <p class="petit muted">
      <Bidi text={t('kh.corriger_aide', { a: plan.part.firstPage, b: plan.part.lastPage })} />
    </p>
    <button type="submit" data-testid="kh-corriger">{t('kh.enregistrer')}</button>
  </form>

  {#if plan.responsable && plan.scope !== 'profil'}
    <SuiviGroupe planId={plan.id} />
  {/if}

  {#if plan.responsable}
    <button type="button" class="bloc-bouton danger" onclick={archive} data-testid="kh-archiver"
      >{t('kh.archiver')}</button
    >
  {/if}
  {#if message}<p class="ok" role="status" data-testid="kh-message"><Bidi text={message} /></p>{/if}
  {#if erreur}<p class="bad" role="alert"><Bidi text={erreur} /></p>{/if}
</div>

<style>
  .reg {
    display: grid;
    gap: 14px;
  }
  .bloc {
    display: grid;
    gap: 6px;
  }
  .bloc-bouton,
  .bloc button {
    min-height: 44px;
    justify-self: start;
  }
  input,
  select {
    font: inherit;
    min-height: 44px;
    width: 100%;
  }
  .petit {
    margin: 0;
    font-size: 0.9rem;
  }
  .ok {
    margin: 0;
    color: var(--ok-ink);
  }
  .bad {
    margin: 0;
    color: var(--bad-ink);
  }
  .danger {
    color: var(--bad-ink);
  }
</style>
