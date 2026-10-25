<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import type { Position } from '$lib/quran/lecture';
  import type { ProfileInfo } from '$lib/session';
  import { aujourdhui, creerFamille, creerPersonnel, rappelCompte } from './donnees';
  import {
    ajouterJours,
    DUREES,
    HEURES_RAPPEL,
    joursPourRythme,
    PAGES_PAR_JOUR,
    pagesPourDuree,
    WIRD_PAGES,
  } from './plan';

  /**
   * Nouveau plan : une khatma (sur un nombre de jours, ou avec des pages par jour), un wird (des pages chaque jour), ou une
   * khatma en famille (parts réparties, fin commune). Rien d'obligatoire : un rappel facultatif, un départ là où l'on en est.
   */
  let {
    profil,
    profils,
    derniere,
    limites,
    ferme,
    fait,
  }: {
    profil: ProfileInfo;
    profils: ProfileInfo[];
    derniere: Position | null;
    limites: { joursMax: number; pagesParJourMax: number };
    ferme: () => void;
    fait: () => void;
  } = $props();

  type Type = 'khatma' | 'wird' | 'famille';
  let type = $state<Type>('khatma');
  let mode = $state<'duree' | 'pages'>('duree');
  let jours = $state(60);
  let pages = $state(5);
  let wirdPages = $state(2);
  let depuis = $state(false);
  let rappel = $state<number | null>(null);
  let choisis = $state<string[]>([]);
  let joursFamille = $state(30);
  let erreur = $state('');
  let envoi = $state(false);

  const peutFamille = $derived(profils.length >= 2);
  const jourMax = $derived(limites.joursMax);

  function message(code: string | null) {
    if (code === 'trop_de_plans') return t('kh.trop_de_plans');
    if (code === 'reseau') return t('kh.erreur_reseau');
    return t('kh.erreur');
  }

  async function creer(e: SubmitEvent) {
    e.preventDefault();
    erreur = '';
    const debut = aujourdhui();
    envoi = true;
    try {
      if (type === 'famille') {
        if (choisis.length < 2) return void (erreur = t('kh.famille_min'));
        const r = await creerFamille({
          startDate: debut,
          endDate: ajouterJours(debut, Math.max(1, Math.min(jourMax, joursFamille)) - 1),
          profileIds: choisis,
          ...(rappel !== null ? { reminderHour: rappel } : {}),
        });
        if (!r.ok) return void (erreur = message(r.code));
      } else {
        const corps: Record<string, unknown> = {
          kind: type,
          mode: type === 'wird' ? 'wird' : mode,
          startDate: debut,
          ...(rappel !== null ? { reminderHour: rappel } : {}),
        };
        if (type === 'wird') corps.pagesPerDay = wirdPages;
        else if (mode === 'duree')
          corps.endDate = ajouterJours(debut, Math.max(1, Math.min(jourMax, jours)) - 1);
        else corps.pagesPerDay = pages;
        if (depuis && derniere && derniere.p > 1) {
          corps.seedDone = derniere.p - 1;
          corps.seedSura = derniere.s;
          corps.seedAya = derniere.a;
        }
        const r = await creerPersonnel(profil.id, corps);
        if (!r.ok) return void (erreur = message(r.code));
      }
      if (rappel !== null) await rappelCompte(true);
      fait();
    } finally {
      envoi = false;
    }
  }

  function basculer(id: string) {
    choisis = choisis.includes(id) ? choisis.filter((x) => x !== id) : [...choisis, id];
  }
</script>

<form class="form" onsubmit={creer} data-testid="khatma-creation">
  <fieldset>
    <legend>{t('kh.type')}</legend>
    <label class="choix"
      ><input
        type="radio"
        name="kh-type"
        value="khatma"
        bind:group={type}
        data-testid="kh-type-khatma"
      />
      {t('kh.type_khatma')}</label
    >
    <label class="choix"
      ><input
        type="radio"
        name="kh-type"
        value="wird"
        bind:group={type}
        data-testid="kh-type-wird"
      />
      {t('kh.type_wird')}</label
    >
    {#if peutFamille}
      <label class="choix"
        ><input
          type="radio"
          name="kh-type"
          value="famille"
          bind:group={type}
          data-testid="kh-type-famille"
        />
        {t('kh.type_famille')}</label
      >
    {/if}
  </fieldset>

  {#if type === 'khatma'}
    <fieldset>
      <legend>{t('kh.comment')}</legend>
      <label class="choix"
        ><input
          type="radio"
          name="kh-mode"
          value="duree"
          bind:group={mode}
          data-testid="kh-mode-duree"
        />
        {t('kh.par_duree')}</label
      >
      <label class="choix"
        ><input
          type="radio"
          name="kh-mode"
          value="pages"
          bind:group={mode}
          data-testid="kh-mode-pages"
        />
        {t('kh.par_pages')}</label
      >
    </fieldset>
    {#if mode === 'duree'}
      <div class="pastilles" role="group" aria-label={t('kh.par_duree')}>
        {#each DUREES as d (d)}
          <button
            type="button"
            class="pastille"
            class:choisie={jours === d}
            aria-pressed={jours === d}
            onclick={() => (jours = d)}
            data-testid={`kh-jours-${d}`}><Bidi text={t('kh.duree_jours', { n: d })} /></button
          >
        {/each}
      </div>
      <label
        >{t('kh.autre_duree')}
        <input
          type="number"
          min="1"
          max={jourMax}
          bind:value={jours}
          data-testid="kh-jours"
        /></label
      >
      <p class="petit muted" data-testid="kh-cela-fait">
        <Bidi text={t('kh.cela_fait', { pages: pagesPourDuree(jours || 1) })} />
      </p>
    {:else}
      <div class="pastilles" role="group" aria-label={t('kh.pages_par_jour')}>
        {#each PAGES_PAR_JOUR as n (n)}
          <button
            type="button"
            class="pastille"
            class:choisie={pages === n}
            aria-pressed={pages === n}
            onclick={() => (pages = n)}
            data-testid={`kh-pages-${n}`}><Bidi text={n} /></button
          >
        {/each}
      </div>
      <p class="petit muted" data-testid="kh-cela-dure">
        <Bidi text={t('kh.cela_dure', { jours: joursPourRythme(pages || 1) })} />
      </p>
    {/if}
  {:else if type === 'wird'}
    <div class="pastilles" role="group" aria-label={t('kh.pages_par_jour')}>
      {#each WIRD_PAGES as n (n)}
        <button
          type="button"
          class="pastille"
          class:choisie={wirdPages === n}
          aria-pressed={wirdPages === n}
          onclick={() => (wirdPages = n)}
          data-testid={`kh-wird-${n}`}><Bidi text={t('kh.plan_wird', { pages: n })} /></button
        >
      {/each}
    </div>
  {:else}
    <fieldset>
      <legend>{t('kh.famille_qui')}</legend>
      {#each profils as p (p.id)}
        <label class="choix"
          ><input
            type="checkbox"
            checked={choisis.includes(p.id)}
            onchange={() => basculer(p.id)}
            data-testid="kh-membre"
          />
          <Bidi text={p.pseudonym} /></label
        >
      {/each}
    </fieldset>
    <label
      >{t('kh.famille_duree')}
      <input
        type="number"
        min="1"
        max={jourMax}
        bind:value={joursFamille}
        data-testid="kh-jours-famille"
      /></label
    >
    <p class="petit muted"><Bidi text={t('kh.famille_aide')} /></p>
  {/if}

  {#if type !== 'famille' && derniere && derniere.p > 1}
    <label class="choix"
      ><input type="checkbox" bind:checked={depuis} data-testid="kh-depuis" />
      <Bidi text={t('kh.depuis_ma_lecture', { p: derniere.p })} /></label
    >
  {/if}

  <label
    >{t('kh.rappel')}
    <select
      onchange={(e) =>
        (rappel = e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
      data-testid="kh-rappel"
    >
      <option value="">{t('kh.rappel_aucun')}</option>
      {#each HEURES_RAPPEL as h (h)}<option value={h}>{t('kh.rappel_a', { h })}</option>{/each}
    </select></label
  >
  {#if rappel !== null}<p class="petit muted">{t('kh.rappel_aide')}</p>{/if}

  {#if erreur}<p role="alert" class="bad" data-testid="kh-erreur"><Bidi text={erreur} /></p>{/if}
  <div class="actions">
    <button type="submit" class="primary" disabled={envoi} data-testid="kh-creer"
      >{t('kh.creer')}</button
    >
    <button type="button" onclick={ferme}>{t('kh.annuler')}</button>
  </div>
</form>

<style>
  .form {
    display: grid;
    gap: 12px;
  }
  fieldset {
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 0;
    border: 0;
  }
  legend {
    font-weight: 700;
    margin-bottom: 4px;
  }
  .choix {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
  }
  .pastilles {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .pastille {
    min-height: 44px;
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
  input[type='number'],
  select {
    font: inherit;
    min-height: 44px;
    width: 100%;
  }
  .petit {
    margin: 0;
    font-size: 0.9rem;
  }
  .bad {
    margin: 0;
    color: var(--bad-ink);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .actions button {
    min-height: 44px;
  }
</style>
