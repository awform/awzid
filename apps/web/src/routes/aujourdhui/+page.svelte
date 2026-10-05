<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { suraName } from '@awform/hifz';
  import { demoProfileFor } from '$lib/attempts';
  import { dueWords, loadBoxes, loadDeck } from '$lib/cards';
  import { hifzToday, loadMeta, localIso, type HifzToday } from '$lib/hifz';
  import { fmtDate, fmtNumber, t } from '$lib/i18n';
  import { completeHizb, completeJuz, completeQuarters, completeSuras } from '$lib/milestones';
  import { call, type ProfileInfo } from '$lib/session';
  import EpreuvesCarte from '$lib/EpreuvesCarte.svelte';
  import AccueilEleve from '$lib/parcours/AccueilEleve.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import Onboarding from '$lib/ui/Onboarding.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';

  /**
   * « Aujourd'hui » (lot 11, étude des plateformes, rec. 1) : la séance du jour enchaîne la portion de hifẓ
   * (trois pistes), la leçon en cours et 5 minutes de mots, avec une durée annoncée. Régularité SANS
   * punition pour les ados et adultes (rien pour les enfants) ; jalons de maîtrise, jamais de points.
   */
  interface Today {
    profil: { id: string; kind: string; enfant: boolean; levelCode: string | null };
    today: string;
    dimanche: boolean;
    lecon: { id: string; titleFr: string | null; levelCode: string; n: number } | null;
    regularite: {
      objectif: number;
      repos: number[];
      joursActifs: number;
      semaine: Array<{ day: string; weekday: number; actif: boolean; repos: boolean }>;
    } | null;
    jalons: { lettres: string[]; leconsTerminees: number; leconsMaitrisees: number };
  }
  const LESSON_MIN = 15;
  const WORDS_MIN = 5;

  let profile = $state<ProfileInfo | null>(null);
  let data = $state<Today | null>(null);
  let hifz = $state<HifzToday | null>(null);
  let due = $state(0);
  let suras = $state<number[]>([]);
  let juz = $state<number[]>([]);
  let hizb = $state<number[] | null>(null);
  let quarts = $state<number[] | null>(null);
  let loaded = $state(false);
  let goal = $state(4);
  let rest = $state<number[]>([]);
  let saved = $state(false);
  /** devoirs donnés par l'enseignant de la classe (espace école) ; jamais de « retard » affiché à l'élève */
  let devoirs = $state<
    Array<{
      id: string;
      classe: string;
      kind: string;
      target: string;
      label: string;
      dueDay: string;
      note: string | null;
      done: boolean;
    }>
  >([]);

  const minutes = $derived(
    (hifz?.minutes ?? 0) + (data?.lecon ? LESSON_MIN : 0) + (due > 0 ? WORDS_MIN : 0),
  );

  /** lot 26 : échec explicite (réseau absent ou serveur en panne), avec « Réessayer » */
  let failed = $state<'erreur' | 'hors_ligne' | null>(null);

  onMount(load);

  async function load() {
    failed = null;
    loaded = false;
    profile = await demoProfileFor('');
    if (profile) {
      const r = await call<Today>('GET', `/today/${profile.id}?today=${localIso()}`);
      data = r.ok ? r.data : null;
      if (!r.ok) {
        failed = navigator.onLine ? 'erreur' : 'hors_ligne';
        loaded = true;
        return;
      }
      goal = data?.regularite?.objectif ?? 4;
      rest = [...(data?.regularite?.repos ?? [])];
      const dv = await call<{ devoirs: typeof devoirs }>('GET', `/profiles/${profile.id}/devoirs`);
      devoirs = dv.ok ? (dv.data?.devoirs ?? []).filter((d) => !d.done) : [];
      hifz = await hifzToday(profile.id).catch(() => null);
      if (hifz) {
        const meta = await loadMeta();
        const counts = (meta?.weights ?? []).map((w) => w.length);
        suras = completeSuras(hifz.acquis, counts);
        const d = meta?.divisions;
        juz = completeJuz(hifz.acquis, counts, d?.juz);
        if (d) {
          hizb = completeHizb(hifz.acquis, counts, d.quarters);
          quarts = completeQuarters(hifz.acquis, counts, d.quarters);
        }
      }
      try {
        const deck = await loadDeck(profile);
        due = dueWords(deck.words, await loadBoxes(profile.id), localIso()).length;
      } catch {
        due = 0;
      }
    }
    loaded = true;
  }

  async function saveRhythm(e: SubmitEvent) {
    e.preventDefault();
    if (!profile) return;
    const r = await call<{ objectif: number; repos: number[] }>(
      'PUT',
      `/profiles/${profile.id}/regularite`,
      {
        objectif: goal,
        repos: rest,
      },
    );
    if (r.ok && data?.regularite && r.data) {
      data.regularite.objectif = r.data.objectif;
      data.regularite.repos = r.data.repos;
      data.regularite.semaine = data.regularite.semaine.map((d) => ({
        ...d,
        repos: r.data!.repos.includes(d.weekday),
      }));
      saved = true;
    }
  }
  function toggleRest(d: number, on: boolean) {
    rest = on ? [...rest, d] : rest.filter((x) => x !== d);
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('auj.titre')}</title></svelte:head>

<header class="hello">
  <h1>{t('auj.titre')}</h1>
  {#if profile}<p class="muted" data-testid="bonjour">
      <Bidi text={t('auj.bonjour', { nom: profile.pseudonym })} />
    </p>{/if}
</header>

{#if profile}<Onboarding audience={profile.kind} />{/if}

{#if !loaded}
  <Loading lines={4} />
{:else if failed}
  <StatusMessage kind={failed} onretry={load} />
{:else if !profile}
  <p class="card">
    {t('auj.sans_profil')} <a href={resolve('/profils')}>{t('auj.choisir_profil')}</a>
  </p>
{:else if data}
  <!-- A27 : « Ma prochaine activité » selon le livre, puis Mon arabe, Mon Coran, Mes sciences… -->
  {#if profile}<AccueilEleve {profile} {due} />{/if}
  <section class="card seance" data-testid="seance">
    <h2>
      {t('auj.seance')}
      <span class="duree" data-testid="duree"><Bidi text={t('auj.duree', { n: minutes })} /></span>
    </h2>
    <ol class="steps">
      {#if hifz}
        <li data-step="hifz">
          <span class="step-ic"><Icon name="mushaf" /></span>
          <div class="step-body">
            <strong>{t('auj.hifz')}</strong> · <Bidi text={t('auj.minutes', { n: hifz.minutes })} />
            <p class="muted small">
              {#if hifz.nouveau}<Bidi text={t('auj.hifz_nouveau', { portion: hifz.nouveau })} /> ·{/if}
              <Bidi text={t('auj.hifz_revisions', { recent: hifz.recent, ancien: hifz.ancien })} />
            </p>
          </div>
          <a class="button" href={resolve('/hifz')}>{t('auj.commencer')}</a>
        </li>
      {/if}
      {#if data.lecon}
        <li data-step="lecon">
          <span class="step-ic"><Icon name="alif" /></span>
          <div class="step-body">
            <strong>{t('auj.lecon')}</strong> · <Bidi text={t('auj.minutes', { n: LESSON_MIN })} />
            <p class="muted small"><Bidi text={data.lecon.titleFr} /></p>
          </div>
          <a
            class="button primary"
            href={resolve('/lecons/[id]', { id: data.lecon.id })}
            data-testid="aller-lecon">{t('auj.commencer')}</a
          >
        </li>
      {/if}
      {#if due > 0}
        <li data-step="mots">
          <span class="step-ic"><Icon name="revisions" /></span>
          <div class="step-body">
            <strong>{t('auj.mots')}</strong> · <Bidi text={t('auj.minutes', { n: WORDS_MIN })} />
            <p class="muted small"><Bidi text={t('auj.mots_dus', { n: due })} /></p>
          </div>
          <a class="button" href={resolve('/revisions')}>{t('auj.commencer')}</a>
        </li>
      {/if}
    </ol>
    {#if !hifz && !data.lecon && due === 0}
      <EmptyState icon="coche" title={t('auj.vide_titre')} text={t('auj.vide_texte')}>
        <a class="button" href={resolve('/lectures')}>{t('onglets.lectures')}</a>
      </EmptyState>
      <p class="sr">{t('auj.rien')}</p>
    {/if}
  </section>

  {#if profile.kind === 'enfant'}
    <section aria-labelledby="espaces">
      <h2 id="espaces">{t('auj.espaces')}</h2>
      <ul class="tiles">
        <li>
          <a class="tile" href={resolve('/lectures')}
            ><span class="tile-ic"><Icon name="lire" size={32} /></span><strong
              >{t('onglets.lectures')}</strong
            ></a
          >
        </li>
        <li>
          <a class="tile" href={resolve('/revisions')}
            ><span class="tile-ic"><Icon name="revisions" size={32} /></span><strong
              >{t('revisions.titre')}</strong
            ></a
          >
        </li>
        <li>
          <a class="tile" href={resolve('/suivi')}
            ><span class="tile-ic"><Icon name="etoile" size={32} /></span><strong
              >{t('onglets.suivi')}</strong
            ></a
          >
        </li>
      </ul>
    </section>
  {/if}

  {#if devoirs.length}
    <section class="card" data-testid="devoirs">
      <h2>{t('auj.devoirs')}</h2>
      <ul class="devoirs">
        {#each devoirs as d (d.id)}
          <li data-devoir={d.target}>
            {#if d.kind === 'lecon'}<a href={resolve('/lecons/[id]', { id: d.target })}
                ><Bidi text={t('auj.devoir_lecon', { id: d.target })} /></a
              >{:else if d.kind === 'lecture'}<a
                href={resolve('/lectures/[code]', { code: d.target })}
                ><Bidi text={t('auj.devoir_lecture', { code: d.target })} /></a
              >{:else}<a href={resolve('/hifz')}
                ><Bidi text={t('auj.devoir_hifz', { passage: d.label })} /></a
              >{/if}
            <span class="muted small"
              >· <Bidi
                text={t('auj.pour_le', { date: fmtDate(d.dueDay, { dateStyle: 'medium' }) })}
              /> · <Bidi text={d.classe} /></span
            >
            {#if d.note}<p class="small"><Bidi text={d.note} /></p>{/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if profile}<EpreuvesCarte profileId={profile.id} />{/if}

  {#if data.regularite}
    {@const r = data.regularite}
    <section class="card" data-testid="regularite">
      <h2>{t('auj.semaine')}</h2>
      <p data-testid="jours-travail">
        <Bidi text={t('auj.jours_travail', { n: r.joursActifs, objectif: r.objectif })} />
      </p>
      <ol class="week">
        {#each r.semaine as d (d.day)}
          <li class:actif={d.actif} class:repos={d.repos} data-day={d.day} data-actif={d.actif}>
            <span><Bidi text={t(`auj.j${d.weekday}`)} /></span>
            <small><Bidi text={d.actif ? '✓' : d.repos ? t('auj.repos') : ''} /></small>
          </li>
        {/each}
      </ol>
      <p class="muted small">{t('auj.sans_punition')}</p>
      <details>
        <summary>{t('auj.regler')}</summary>
        <form class="rhythm" onsubmit={saveRhythm}>
          <label
            >{t('auj.objectif')}
            <select bind:value={goal} data-testid="objectif">
              {#each [3, 4, 5, 6] as n (n)}<option value={n}>{t('auj.jours', { n })}</option>{/each}
            </select></label
          >
          <fieldset>
            <legend>{t('auj.jours_repos')}</legend>
            {#each [1, 2, 3, 4, 5, 6, 7] as d (d)}
              <label class="day"
                ><input
                  type="checkbox"
                  checked={rest.includes(d)}
                  onchange={(e) => toggleRest(d, e.currentTarget.checked)}
                  data-repos={d}
                />
                <Bidi text={t(`auj.j${d}`)} /></label
              >
            {/each}
          </fieldset>
          <button type="submit" data-testid="enregistrer-regularite">{t('auj.enregistrer')}</button>
          {#if saved}<span role="status">{t('auj.enregistre')}</span>{/if}
        </form>
      </details>
    </section>
  {/if}

  {#if (profile?.kind === 'enfant' && data.jalons.lettres.length) || /^ad([2-9]|10)$/.test(profile?.levelCode ?? '')}
    <section class="card" data-testid="activites">
      <h2>{t('act.titre')}</h2>
      <ul>
        {#if profile?.kind === 'enfant' && data.jalons.lettres.length}
          <li><a href={resolve('/activites/enseigner')}>{t('act.enseigner')}</a></li>
        {/if}
        {#if /^ad([2-9]|10)$/.test(profile?.levelCode ?? '')}
          <li><a href={resolve('/activites/racines')}>{t('act.racines')}</a></li>
        {/if}
      </ul>
    </section>
  {/if}

  <section class="card" data-testid="jalons">
    <h2>{t('auj.jalons')}</h2>
    <ul class="milestones">
      <li data-jalon="lettres">
        <Bidi text={t('auj.j_lettres', { n: data.jalons.lettres.length })} />
        {#if data.jalons.lettres.length}<span class="ar" lang="ar" dir="rtl"
            ><Bidi text={data.jalons.lettres.join(' ')} base="ar" /></span
          >{/if}
      </li>
      <li data-jalon="lecons">
        <Bidi
          text={t('auj.j_lecons', {
            n: data.jalons.leconsTerminees,
            m: data.jalons.leconsMaitrisees,
          })}
        />
      </li>
      {#if hifz}
        <li data-jalon="sourates">
          <Bidi text={t('auj.j_sourates', { n: suras.length })} />{#if suras.length}
            : <Bidi
              text={suras
                .slice(-6)
                .map((s) => suraName(s))
                .join(', ')}
            />{/if}
        </li>
        <li data-jalon="juz">
          <Bidi text={t('auj.j_juz', { n: juz.length })} />{#if juz.length}
            : <Bidi text={juz.map((j) => fmtNumber(j)).join(', ')} />{/if}
        </li>
        {#if hizb && quarts}
          <li data-jalon="hizb"><Bidi text={t('auj.j_hizb', { n: hizb.length })} /></li>
          <li data-jalon="quarts"><Bidi text={t('auj.j_quarts', { n: quarts.length })} /></li>
        {:else}<li class="muted small">{t('auj.j_hizb_bientot')}</li>{/if}
      {/if}
    </ul>
    <p class="muted small">{t('auj.jalons_regle')}</p>
  </section>

  {#if !data.profil.enfant || data.dimanche}
    <p><a href={resolve('/suivi/rapport')} data-testid="lien-rapport">{t('auj.rapport')}</a></p>
  {/if}
{/if}

<style>
  .duree {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--teal);
    margin-inline-start: 8px;
  }
  .steps {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 10px;
  }
  .hello h1 {
    margin-bottom: 0;
  }
  .hello p {
    margin: 4px 0 0;
    font-size: 1.05rem;
  }
  .steps li {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--space-s) var(--space-m);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    padding: var(--space-s) var(--space-m);
    background: var(--card);
  }
  .step-ic {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: var(--radius-md);
    background: var(--primary-soft);
    color: var(--primary);
  }
  .step-body p {
    margin: 2px 0 0;
  }
  /* petit écran : le bouton passe sous le texte */
  @media (max-width: 520px) {
    .steps li {
      grid-template-columns: auto 1fr;
    }
    .steps li > :global(a) {
      grid-column: 1 / -1;
    }
  }
  .seance {
    border-inline-start: 4px solid var(--primary);
  }
  .week {
    list-style: none;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 4px;
  }
  .week li {
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    text-align: center;
    padding: 4px 0;
    display: grid;
  }
  .week li.actif {
    background: var(--ok-bg);
    color: var(--ok-ink);
    font-weight: 700;
  }
  .week li.repos {
    background: var(--sand);
  }
  .rhythm {
    display: grid;
    gap: 8px;
  }
  .day {
    display: inline-flex;
    gap: 4px;
    margin-inline-end: 8px;
  }
  .milestones {
    display: grid;
    gap: 4px;
  }
  .small {
    font-size: 0.9rem;
  }
</style>
