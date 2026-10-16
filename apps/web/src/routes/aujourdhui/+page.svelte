<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { demoProfileFor } from '$lib/attempts';
  import { dueWords, loadBoxes, loadDeck } from '$lib/cards';
  import { hifzToday, localIso, type HifzToday } from '$lib/hifz';
  import { fmtDate, t } from '$lib/i18n';
  import { demarrerSeance, type EtapeSeance } from '$lib/seance';
  import { call, type ProfileInfo } from '$lib/session';
  import EpreuvesCarte from '$lib/EpreuvesCarte.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import Onboarding from '$lib/ui/Onboarding.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';

  /**
   * « Aujourd'hui » (lot 11 ; D1 : un seul écran). En héros, « Ma séance du jour » : un bouton enchaîne la
   * leçon, 5 minutes de mots puis le hifẓ (durée annoncée ; on peut déplier et lancer une seule étape). Puis
   * les devoirs (s'il y en a) et « Ma semaine » en une ligne, qui ouvre « Mon suivi » (semaine, arbre, jalons,
   * rapport). Les espaces sont dans la barre du bas ; avis, aide et liens juridiques dans « Plus ».
   */
  interface Today {
    profil: { id: string; kind: string; enfant: boolean; levelCode: string | null };
    today: string;
    lecon: { id: string; titleFr: string | null; levelCode: string; n: number } | null;
    regularite: {
      objectif: number;
      joursActifs: number;
      semaine: Array<{ day: string; weekday: number; actif: boolean; repos: boolean }>;
    } | null;
    serein?: boolean;
    leconsSemaine?: number;
  }
  const LESSON_MIN = 15;
  const WORDS_MIN = 5;

  let profile = $state<ProfileInfo | null>(null);
  let data = $state<Today | null>(null);
  let hifz = $state<HifzToday | null>(null);
  let due = $state(0);
  let loaded = $state(false);
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
  /** ordre de la séance : leçon → mots → hifẓ */
  const plan = $derived<EtapeSeance[]>([
    ...(data?.lecon
      ? [{ k: 'lecon' as const, href: resolve('/lecons/[id]', { id: data.lecon.id }) }]
      : []),
    ...(due > 0 ? [{ k: 'mots' as const, href: resolve('/revisions') }] : []),
    ...(hifz ? [{ k: 'hifz' as const, href: resolve('/hifz') }] : []),
  ]);

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
      const dv = await call<{ devoirs: typeof devoirs }>('GET', `/profiles/${profile.id}/devoirs`);
      devoirs = dv.ok ? (dv.data?.devoirs ?? []).filter((d) => !d.done) : [];
      hifz = await hifzToday(profile.id).catch(() => null);
      try {
        const deck = await loadDeck(profile);
        due = dueWords(deck.words, await loadBoxes(profile.id), localIso()).length;
      } catch {
        due = 0;
      }
    }
    loaded = true;
  }

  function commencer(e: MouseEvent) {
    const first = plan[0];
    if (!first) return;
    e.preventDefault();
    demarrerSeance(plan);
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- chemins résolus dans `plan`
    void goto(first.href);
  }
  const NOM: Record<EtapeSeance['k'], string> = {
    lecon: 'auj.lecon',
    mots: 'auj.mots',
    hifz: 'auj.hifz',
  };
  const ICONE: Record<EtapeSeance['k'], string> = {
    lecon: 'alif',
    mots: 'revisions',
    hifz: 'mushaf',
  };
</script>

<svelte:head><title>{t('app.nom')} — {t('auj.titre')}</title></svelte:head>

<header class="hello">
  <h1 class="titre-page">{t('auj.titre')}</h1>
  {#if profile}<p class="muted" data-testid="bonjour">
      <Bidi text={t('auj.bonjour', { nom: profile.pseudonym })} />
    </p>{/if}
</header>

{#if !loaded}
  <Loading lines={3} />
{:else if failed}
  <StatusMessage kind={failed} onretry={load} />
{:else if !profile}
  <p class="card">
    {t('auj.sans_profil')} <a href={resolve('/profils')}>{t('auj.choisir_profil')}</a>
  </p>
{:else if data}
  <section class="seance" data-testid="seance" aria-labelledby="seance-titre">
    <!-- refonte 16/10 : bandeau vert profond au motif étoilé, liseré doré, titre et durée dedans -->
    <div class="bandeau">
      <h2 id="seance-titre">{t('auj.seance')}</h2>
      {#if plan.length}
        <p class="resume">
          <span class="duree" data-testid="duree"
            ><Bidi text={t('auj.duree', { n: minutes })} /></span
          >
          <span><Bidi text={plan.map((p) => t(NOM[p.k])).join(' · ')} /></span>
        </p>
      {/if}
    </div>
    <div class="seance-corps">
      {#if plan.length}
        <!-- eslint-disable svelte/no-navigation-without-resolve -- chemin résolu dans `plan` -->
        <a
          class="button primary go"
          href={plan[0]!.href}
          onclick={commencer}
          data-testid="commencer-seance"
          data-etape={plan[0]!.k}
          data-cible={data.lecon && plan[0]!.k === 'lecon' ? data.lecon.id : ''}
          ><Icon name="fleche" size={22} /><span>{t('auj.commencer_seance')}</span></a
        >
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
        <details class="detail">
          <summary>{t('auj.voir_etapes')}</summary>
          <ol class="steps">
            {#each plan as p (p.k)}
              <li data-step={p.k}>
                <span class="step-ic"><Icon name={ICONE[p.k]} /></span>
                <div class="step-body">
                  <strong><Bidi text={t(NOM[p.k])} /></strong> ·
                  <Bidi
                    text={t('auj.minutes', {
                      n:
                        p.k === 'lecon'
                          ? LESSON_MIN
                          : p.k === 'mots'
                            ? WORDS_MIN
                            : (hifz?.minutes ?? 0),
                    })}
                  />
                  <p class="muted small">
                    {#if p.k === 'lecon'}<Bidi text={data.lecon?.titleFr ?? ''} />
                    {:else if p.k === 'mots'}<Bidi text={t('auj.mots_dus', { n: due })} />
                    {:else if hifz}{#if hifz.nouveau}<Bidi
                          text={t('auj.hifz_nouveau', { portion: hifz.nouveau })}
                        /> ·{/if}
                      <Bidi
                        text={t('auj.hifz_revisions', { recent: hifz.recent, ancien: hifz.ancien })}
                      />{/if}
                  </p>
                </div>
                <!-- eslint-disable svelte/no-navigation-without-resolve -- chemin résolu dans `plan` -->
                <a
                  class="button"
                  href={p.href}
                  data-testid={p.k === 'lecon' ? 'aller-lecon' : undefined}>{t('auj.commencer')}</a
                >
                <!-- eslint-enable svelte/no-navigation-without-resolve -->
              </li>
            {/each}
          </ol>
        </details>
      {:else}
        <EmptyState icon="coche" title={t('auj.vide_titre')} text={t('auj.vide_texte')}>
          <a class="button" href={resolve('/lectures')}>{t('onglets.lectures')}</a>
        </EmptyState>
        <p class="sr">{t('auj.rien')}</p>
      {/if}
    </div>
  </section>

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

  <EpreuvesCarte profileId={profile.id} />

  <!-- « Ma semaine » en une ligne : un toucher ouvre « Mon suivi » (semaine, arbre, jalons, rapport) -->
  <a class="semaine" href={resolve('/suivi')} data-testid="ma-semaine">
    <span class="sem-ic"><Icon name="courbe" /></span>
    <span class="sem-txt">
      <strong>{t('auj.semaine')}</strong>
      {#if data.regularite && !data.serein}
        <small
          ><Bidi
            text={t('auj.semaine_ligne', {
              n: data.regularite.joursActifs,
              objectif: data.regularite.objectif,
            })}
          /></small
        >
      {:else if data.serein}
        <small><Bidi text={t('ser.semaine', { n: data.leconsSemaine ?? 0 })} /></small>
      {:else}
        <small>{t('auj.vers_suivi')}</small>
      {/if}
    </span>
    {#if data.regularite}
      <span class="points" aria-hidden="true">
        {#each data.regularite.semaine as d (d.day)}<span class:on={d.actif}></span>{/each}
      </span>
    {/if}
    <span class="chev" aria-hidden="true"><Icon name="chevron" size={20} /></span>
  </a>

  <Onboarding audience={profile.kind} />
{/if}

<style>
  .hello h1 {
    margin-bottom: 0;
  }
  .hello p {
    margin: 10px 0 var(--space-l);
    font-size: 1.05rem;
  }
  /* héros : bandeau vert profond (mêmes couleurs en clair et en sombre), motif étoilé fin, liseré doré */
  .seance {
    overflow: hidden;
    border-radius: var(--radius-lg);
    background: var(--card);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-card);
    margin-bottom: var(--space-l);
  }
  .bandeau {
    display: grid;
    gap: 10px;
    padding: 22px 20px 26px;
    color: var(--bande-texte);
    background: var(--motif-etoile) var(--bande-1);
    box-shadow: inset 0 -4px 0 var(--gold);
  }
  .seance h2 {
    margin: 0;
    color: inherit;
    font-size: 1.45rem;
  }
  .seance-corps {
    padding: 20px;
    display: grid;
    gap: var(--space-s);
  }
  .resume {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    align-items: center;
    margin: 0;
  }
  /* durée : pastille dorée, texte foncé sur l'or (6:1) */
  .duree {
    padding: 2px 12px;
    border-radius: var(--radius-pill);
    background: var(--gold);
    color: var(--sur-or);
    font-weight: 700;
  }
  .go {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 56px;
    font-size: 1.1rem;
  }
  .detail summary {
    min-height: 44px;
    display: flex;
    align-items: center;
    cursor: pointer;
    color: var(--primary);
    font-weight: 600;
  }
  .steps {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 10px;
  }
  .steps li {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: var(--space-s) var(--space-m);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    padding: 12px var(--space-m);
  }
  .steps li > :global(a) {
    grid-column: 1 / -1;
  }
  .step-ic {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: var(--primary-soft);
    color: var(--primary);
  }
  .step-body p {
    margin: 2px 0 0;
  }
  .semaine {
    display: flex;
    align-items: center;
    gap: var(--space-m);
    min-height: 72px;
    padding: 12px 20px;
    margin-bottom: var(--space-l);
    border-radius: var(--radius-lg);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-card);
    background: var(--card);
    color: var(--ink);
    text-decoration: none;
  }
  .sem-ic {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    flex: none;
    border-radius: 50%;
    background: var(--primary-soft);
    color: var(--primary);
  }
  .sem-txt {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  .sem-txt small {
    color: var(--ink2);
  }
  .points {
    display: flex;
    gap: 4px;
  }
  .points span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1.5px solid var(--primary);
  }
  .points span.on {
    background: var(--primary);
  }
  .chev {
    color: var(--ink2);
  }
  :global([dir='rtl']) .chev {
    transform: scaleX(-1);
  }
  .small {
    font-size: 0.9rem;
  }
</style>
