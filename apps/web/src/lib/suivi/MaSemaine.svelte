<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { suraName } from '@awform/hifz';
  import { hifzToday, loadMeta, localIso, type HifzToday } from '$lib/hifz';
  import { fmtNumber, t } from '$lib/i18n';
  import { completeHizb, completeJuz, completeQuarters, completeSuras } from '$lib/milestones';
  import { call, type ProfileInfo } from '$lib/session';
  import Arbre from '$lib/ui/Arbre.svelte';

  /**
   * D1 — « Mon suivi » de l'élève : semaine (régularité sans punition, réglable), arbre (une feuille par leçon
   * terminée), jalons de maîtrise (jamais de points), activités et rapport de la semaine. Déplacé depuis
   * l'accueil « Aujourd'hui », qui n'en garde qu'une ligne (« Ma semaine »).
   */
  let { profile }: { profile: Pick<ProfileInfo, 'id' | 'kind'> } = $props();
  interface Today {
    profil: { id: string; kind: string; enfant: boolean; levelCode: string | null };
    dimanche: boolean;
    regularite: {
      objectif: number;
      repos: number[];
      joursActifs: number;
      semaine: Array<{ day: string; weekday: number; actif: boolean; repos: boolean }>;
    } | null;
    jalons: { lettres: string[]; leconsTerminees: number; leconsMaitrisees: number };
    serein?: boolean;
    leconsSemaine?: number;
  }
  let data = $state<Today | null>(null);
  let hifz = $state<HifzToday | null>(null);
  let suras = $state<number[]>([]);
  let juz = $state<number[]>([]);
  let hizb = $state<number[] | null>(null);
  let quarts = $state<number[] | null>(null);
  let goal = $state(4);
  let rest = $state<number[]>([]);
  let saved = $state(false);

  onMount(async () => {
    const r = await call<Today>('GET', `/today/${profile.id}?today=${localIso()}`);
    if (!r.ok || !r.data) return;
    data = r.data;
    goal = data.regularite?.objectif ?? 4;
    rest = [...(data.regularite?.repos ?? [])];
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
  });

  async function saveRhythm(e: SubmitEvent) {
    e.preventDefault();
    const r = await call<{ objectif: number; repos: number[] }>(
      'PUT',
      `/profiles/${profile.id}/regularite`,
      { objectif: goal, repos: rest },
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

{#if data}
  {#if data.regularite}
    {@const r = data.regularite}
    <section class="card" data-testid="regularite">
      <h2>{t('auj.semaine')}</h2>
      {#if data.serein}
        <!-- A39 : mode serein — aucun objectif ni série imposés, seulement un encouragement -->
        <p data-testid="encouragement-semaine">
          <Bidi text={t('ser.semaine', { n: data.leconsSemaine ?? 0 })} />
        </p>
      {:else}
        <p data-testid="jours-travail">
          <Bidi text={t('auj.jours_travail', { n: r.joursActifs, objectif: r.objectif })} />
        </p>
      {/if}
      <ol class="week">
        {#each r.semaine as d (d.day)}
          <li class:actif={d.actif} class:repos={d.repos} data-day={d.day} data-actif={d.actif}>
            <span><Bidi text={t(`auj.j${d.weekday}`)} /></span>
            <small><Bidi text={d.actif ? '✓' : d.repos ? t('auj.repos') : ''} /></small>
          </li>
        {/each}
      </ol>
      <p class="muted small">{t('auj.sans_punition')}</p>
      <details hidden={data.serein}>
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

  <section class="card arbre-carte" data-testid="mon-arbre">
    <Arbre feuilles={data.jalons.leconsTerminees} taille={96} />
    <div>
      <h2>{t('suivi.mon_arbre')}</h2>
      <p class="muted small"><Bidi text={t('fin.arbre', { n: data.jalons.leconsTerminees })} /></p>
    </div>
  </section>

  {#if (profile.kind === 'enfant' && data.jalons.lettres.length) || /^ad([2-9]|10)$/.test(data.profil.levelCode ?? '')}
    <section class="card" data-testid="activites">
      <h2>{t('act.titre')}</h2>
      <ul>
        {#if profile.kind === 'enfant' && data.jalons.lettres.length}
          <li><a href={resolve('/activites/enseigner')}>{t('act.enseigner')}</a></li>
        {/if}
        {#if /^ad([2-9]|10)$/.test(data.profil.levelCode ?? '')}
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
  .arbre-carte {
    display: flex;
    align-items: center;
    gap: var(--space-m);
  }
  .arbre-carte h2 {
    margin: 0;
  }
</style>
