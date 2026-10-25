<script lang="ts">
  import { onMount } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { fmtDate, t } from '$lib/i18n';
  import { aujourdhui, archiver, creerClasse, khatmasDeClasse, type ClasseEtat } from './donnees';
  import { ajouterJours, DUREES } from './plan';
  import SuiviGroupe from './SuiviGroupe.svelte';

  /**
   * Khatma de la classe (espace enseignant, interrupteur `khatma_wird`) : les 604 pages sont réparties entre les élèves
   * inscrits (juzʾ entiers jusqu'à 30 élèves), chacun lit sa part et la khatma se termine ensemble. L'enseignant voit les
   * parts de chacun (sans pourcentage si la classe est en mode serein) ; un élève ne voit que le total de la classe.
   */
  let { classId }: { classId: string } = $props();
  let etat = $state<ClasseEtat | null>(null);
  let charge = $state(false);
  let jours = $state(30);
  let titre = $state('');
  let erreur = $state('');
  let envoi = $state(false);
  let ouvert = $state<string | null>(null);

  async function recharger() {
    const r = await khatmasDeClasse(classId);
    if (r.ok && r.data) etat = r.data;
    charge = true;
  }
  onMount(recharger);

  const actives = $derived((etat?.khatmas ?? []).filter((k) => k.status !== 'archivee'));

  async function lancer(e: SubmitEvent) {
    e.preventDefault();
    erreur = '';
    envoi = true;
    try {
      const debut = aujourdhui();
      const r = await creerClasse(classId, {
        startDate: debut,
        endDate: ajouterJours(debut, Math.max(1, Math.min(550, jours)) - 1),
        ...(titre.trim() ? { title: titre.trim().slice(0, 40) } : {}),
      });
      if (!r.ok) {
        erreur = r.code === 'participants_invalides' ? t('kh.classe_min') : t('kh.erreur');
        return;
      }
      await recharger();
    } finally {
      envoi = false;
    }
  }
  async function archive(id: string) {
    const r = await archiver(id);
    if (r.ok) {
      ouvert = null;
      await recharger();
    } else erreur = t('kh.erreur');
  }
</script>

{#if charge}
  <section class="card" aria-labelledby="kh-classe" data-testid="khatma-classe">
    <h2 id="kh-classe">{t('kh.classe_titre')}</h2>
    <p class="muted petit"><Bidi text={t('kh.classe_intro')} /></p>
    {#each actives as k (k.id)}
      <article class="plan" data-testid="khatma-classe-plan">
        <h3><Bidi text={k.title ?? t('kh.plan_classe')} /></h3>
        {#if k.endDate}
          <p class="petit">
            <Bidi text={t('kh.fin_prevue', { date: fmtDate(k.endDate, { dateStyle: 'long' }) })} />
          </p>
        {/if}
        <p class="petit" data-testid="khatma-classe-groupe">
          <Bidi text={t('kh.groupe', { terminees: k.groupe.terminees, parts: k.groupe.parts })} />
        </p>
        <p class="petit muted">
          <Bidi text={k.status === 'terminee' ? t('kh.groupe_termine') : t('kh.groupe_ensemble')} />
        </p>
        {#if etat?.serein}<p class="petit muted">{t('kh.suivi_serein')}</p>{/if}
        <div class="actions">
          <button
            type="button"
            onclick={() => (ouvert = ouvert === k.id ? null : k.id)}
            aria-expanded={ouvert === k.id}
            data-testid="khatma-classe-parts">{t('kh.suivi_titre')}</button
          >
          <button type="button" onclick={() => archive(k.id)} data-testid="khatma-classe-archiver"
            >{t('kh.archiver')}</button
          >
        </div>
        {#if ouvert === k.id}<SuiviGroupe planId={k.id} change={recharger} />{/if}
      </article>
    {/each}
    {#if !actives.length}
      <form class="form" onsubmit={lancer} data-testid="khatma-classe-form">
        <p class="petit"><Bidi text={t('kh.classe_eleves', { n: etat?.eleves ?? 0 })} /></p>
        <div class="pastilles" role="group" aria-label={t('kh.famille_duree')}>
          {#each DUREES.slice(0, 4) as d (d)}
            <button
              type="button"
              class="pastille"
              class:choisie={jours === d}
              aria-pressed={jours === d}
              onclick={() => (jours = d)}><Bidi text={t('kh.duree_jours', { n: d })} /></button
            >
          {/each}
        </div>
        <label
          >{t('kh.famille_duree')}
          <input
            type="number"
            min="1"
            max="550"
            bind:value={jours}
            data-testid="khatma-classe-jours"
          /></label
        >
        <label
          >{t('kh.classe_nom')}
          <input maxlength="40" bind:value={titre} /></label
        >
        {#if erreur}<p class="bad" role="alert"><Bidi text={erreur} /></p>{/if}
        <button
          type="submit"
          class="primary"
          disabled={envoi || (etat?.eleves ?? 0) < 2}
          data-testid="khatma-classe-lancer">{t('kh.classe_lancer')}</button
        >
        {#if (etat?.eleves ?? 0) < 2}<p class="petit muted">{t('kh.classe_min')}</p>{/if}
      </form>
    {/if}
    <p class="petit muted">{t('kh.sans_classement')}</p>
  </section>
{/if}

<style>
  .plan {
    display: grid;
    gap: 6px;
    padding: 8px 0;
    border-top: 1px solid var(--line);
  }
  h2,
  h3 {
    margin: 0;
    font-size: 1.05rem;
  }
  h3 {
    font-size: 1rem;
  }
  .form {
    display: grid;
    gap: 10px;
  }
  .petit {
    margin: 0;
    font-size: 0.9rem;
  }
  .actions,
  .pastilles {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .actions button,
  .form button {
    min-height: 44px;
  }
  .pastille {
    padding: 0 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius-pill);
    background: var(--card);
    color: var(--ink);
  }
  .pastille.choisie {
    color: var(--or-ink);
    background: var(--or-soft);
    border-color: var(--or-line);
    font-weight: 700;
  }
  input {
    font: inherit;
    min-height: 44px;
    width: 100%;
  }
  .bad {
    margin: 0;
    color: var(--bad-ink);
  }
</style>
