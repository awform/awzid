<script lang="ts">
  import './v4.css';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { SURA_NAMES } from '@awform/hifz';
  import Ar from '$lib/Ar.svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { unitLabel } from '$lib/api';
  import type { HifzToday } from '$lib/hifz';
  import { fmtDate, t } from '$lib/i18n';
  import { levelLabel } from '$lib/levels';
  import { ACTIFS, texteDuCursus } from '$lib/madjaliss/cycles';
  import { lien } from '$lib/madjaliss/liens';
  import { lireProgres, type Progres } from '$lib/madjaliss/progression';
  import { espace, type Unite } from '$lib/parcours/parcours';
  import type { EtapeSeance } from '$lib/seance';
  import type { ProfileInfo } from '$lib/session';
  import AnneauOr from './AnneauOr.svelte';
  import EnTeteSection from './EnTeteSection.svelte';
  import Picto from './Picto.svelte';
  import Rosette from './Rosette.svelte';
  import Segments from './Segments.svelte';
  import {
    derniereLecture,
    heroLecon,
    moment,
    prochainJalon,
    repriseMadjaliss,
    salutation,
    type RepriseMadjaliss,
  } from './donnees';

  /**
   * Refonte 19/10 (maquette 01) — « Aujourd'hui » : la séance du jour en héros (panneau vert, titre arabe du livre
   * sur sa propre ligne, durée, leçon n sur N, bouton doré), puis la semaine (anneau doré, jours), « Reprendre »
   * (dernière lecture du Coran, Madjaliss en cours) et la suite (adhkār du moment, prochain jalon). Données réelles
   * seulement ; la séance elle-même (enchaînement leçon → mots → hifẓ) reste celle de la page.
   */
  interface Today {
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
  let {
    profile,
    data,
    plan,
    minutes,
    hifz,
    devoirs,
    oncommencer,
  }: {
    profile: ProfileInfo;
    data: Today;
    plan: EtapeSeance[];
    minutes: number;
    hifz: HifzToday | null;
    devoirs: Array<{ id: string; kind: string; target: string; libelle: string }>;
    oncommencer: (e: MouseEvent) => void;
  } = $props();

  const NOM: Record<EtapeSeance['k'], string> = {
    lecon: 'auj.lecon',
    mots: 'auj.mots',
    hifz: 'auj.hifz',
  };
  const heure = new Date().getHours();
  const quand = moment(heure);

  let unites = $state<Unite[]>([]);
  let progression = $state<{ faites: number; total: number } | null>(null);
  let coran = $state<{ s: number; a: number } | null>(null);
  let madjlis = $state<RepriseMadjaliss | null>(null);

  const hero = $derived(heroLecon(unites, data.lecon?.id));
  const jalon = $derived(prochainJalon(unites, data.lecon?.id));
  const semaine = $derived(data.regularite && !data.serein ? data.regularite : null);
  const enfant = $derived(profile.kind === 'enfant');

  onMount(async () => {
    try {
      coran = derniereLecture(localStorage);
    } catch {
      coran = null;
    }
    if (data.lecon) {
      const r = await espace(profile.id, 'arabe').catch(() => null);
      if (r?.ok && r.data) {
        unites = r.data.unites;
        progression = r.data.progression;
      }
    }
    // Madjaliss : aperçu seulement pour les enfants (rien à reprendre)
    if (!enfant) {
      const p: Record<string, Progres> = {};
      for (const id of ACTIFS) p[id] = await lireProgres(profile.id, id);
      madjlis = repriseMadjaliss(p, [...ACTIFS]);
    }
  });

  const jour = (d: string, f: 'narrow' | 'long') => fmtDate(d, { weekday: f });
  const etatJour = (d: { day: string; actif: boolean; repos: boolean }) =>
    d.actif ? 'fait' : d.day === data.today ? 'auj' : d.repos ? 'repos' : 'vide';
  const lecteur = resolve('/coran/lecteur');
</script>

<div class="v4 auj" data-testid="v4-aujourdhui">
  <header class="salut">
    <p class="date">{fmtDate(data.today, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    <h1 data-testid="bonjour">
      <Bidi text={t(`v4.${salutation(heure)}`, { nom: profile.pseudonym })} />
    </h1>
  </header>

  <!-- MAINTENANT : une seule action en vedette -->
  <section class="v4-bandeau v4-cadre heros" data-testid="seance" aria-labelledby="v4-seance-titre">
    <h2 class="sur" id="v4-seance-titre">{t('v4.seance_du_jour')}</h2>
    {#if plan.length}
      {#if hero?.unite.titleAr}<div class="titre-ar" data-testid="v4-titre-ar">
          <Ar text={hero.unite.titleAr} block />
        </div>{/if}
      {#if data.lecon?.titleFr}<p class="fr"><Bidi text={data.lecon.titleFr} /></p>{/if}
      <p class="meta">
        {#if hero}<span
            ><Picto name="arabe" size={18} /><Bidi
              text={t('v4.arabe_lecon', { n: hero.numero })}
            /></span
          >{/if}
        <span data-testid="duree"
          ><Picto name="horloge" size={18} /><Bidi text={t('auj.duree', { n: minutes })} /></span
        >
        <span class="etapes"><Bidi text={plan.map((p) => t(NOM[p.k])).join(' · ')} /></span>
      </p>
      {#if plan.length > 1}<Segments total={plan.length} faits={0} ici={0} />{/if}
      {#if hero && progression && data.lecon}
        <p class="niveau">
          <span><Bidi text={levelLabel(data.lecon.levelCode)} /></span>
          <span><Bidi text={t('v4.lecon_sur', { n: hero.numero, total: hero.total })} /></span>
        </p>
        <div
          class="v4-barre"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax={progression.total}
          aria-valuenow={progression.faites}
          aria-label={t('parc.progression', { n: progression.faites, total: progression.total })}
        >
          <i
            style="width: {progression.total ? (100 * progression.faites) / progression.total : 0}%"
          ></i>
        </div>
      {/if}
      <!-- eslint-disable svelte/no-navigation-without-resolve -- chemin résolu dans `plan` -->
      <a
        class="v4-btn go"
        href={plan[0]!.href}
        onclick={oncommencer}
        data-testid="commencer-seance"
        data-etape={plan[0]!.k}
        data-cible={data.lecon && plan[0]!.k === 'lecon' ? data.lecon.id : ''}
        ><Picto name="fleche" size={22} trait={2.2} /><span>{t('v4.commencer')}</span></a
      >
      <!-- eslint-enable svelte/no-navigation-without-resolve -->
      {#if hifz?.nouveau}<p class="petit hifz">
          <Bidi text={`${t('auj.hifz')} · ${t('auj.hifz_nouveau', { portion: hifz.nouveau })}`} />
        </p>{/if}
    {:else}
      <p class="fr"><Bidi text={t('auj.vide_titre')} /></p>
      <p><Bidi text={t('auj.vide_texte')} /></p>
      <a class="v4-btn go" href={resolve('/lectures')}
        ><Picto name="lectures" size={22} /><span>{t('onglets.lectures')}</span></a
      >
    {/if}
  </section>

  {#if devoirs.length}
    <EnTeteSection titre={t('auj.devoirs')} />
    <ul class="v4-pile liste" data-testid="devoirs">
      {#each devoirs as d (d.id)}
        <li data-devoir={d.target}>
          <a
            class="v4-carte v4-ligne"
            href={d.kind === 'lecon'
              ? resolve('/lecons/[id]', { id: d.target })
              : d.kind === 'lecture'
                ? resolve('/lectures/[code]', { code: d.target })
                : resolve('/hifz')}
            ><span class="v4-picto or"><Picto name="classe" /></span><span class="txt"
              ><h3><Bidi text={d.libelle} /></h3></span
            ><span class="v4-chev"><Picto name="chevron" /></span></a
          >
        </li>
      {/each}
    </ul>
  {/if}

  <!-- OÙ J'EN SUIS : la semaine (jamais pour un enfant : aucun compteur) -->
  {#if semaine}
    <EnTeteSection titre={t('auj.semaine')} />
    <a class="v4-carte sem" href={resolve('/suivi')} data-testid="ma-semaine">
      <AnneauOr
        n={semaine.joursActifs}
        sur={semaine.objectif}
        unite={t('v4.jours', { n: semaine.objectif })}
        label={t('v4.semaine_aria', { n: semaine.joursActifs, objectif: semaine.objectif })}
      />
      <span class="sem-droite">
        <span class="jours">
          {#each semaine.semaine as d (d.day)}
            {@const e = etatJour(d)}
            <span class="jour {e}" data-jour={e}
              ><i aria-hidden="true"
                >{#if e === 'fait'}<Picto name="ok" size={16} trait={2.4} />{/if}</i
              ><span aria-hidden="true"><Bidi text={jour(d.day, 'narrow')} /></span><span class="sr"
                ><Bidi text={t(`v4.jour_${e}`, { jour: jour(d.day, 'long') })} /></span
              ></span
            >
          {/each}
        </span>
        <span class="petit doux"><Bidi text={t('v4.objectif', { n: semaine.objectif })} /></span>
      </span>
    </a>
  {:else if data.serein}
    <EnTeteSection titre={t('auj.semaine')} />
    <a class="v4-carte v4-ligne" href={resolve('/suivi')} data-testid="ma-semaine"
      ><span class="v4-picto"><Picto name="suivi" /></span><span class="txt"
        ><Bidi text={t('ser.semaine', { n: data.leconsSemaine ?? 0 })} /></span
      ><span class="v4-chev"><Picto name="chevron" /></span></a
    >
  {/if}

  <!-- REPRENDRE : dernière lecture du Coran, Madjaliss en cours -->
  {#if coran || madjlis}
    <EnTeteSection titre={t('v4.reprendre')} />
    <div class="v4-pile" data-testid="v4-reprendre">
      {#if coran}
        {@const nom = SURA_NAMES[coran.s - 1] ?? ''}
        <!-- eslint-disable svelte/no-navigation-without-resolve -- chemin résolu, suivi de paramètres -->
        <a
          class="v4-carte v4-ligne"
          href={`${lecteur}?s=${coran.s}&a=${coran.a}`}
          data-testid="v4-reprendre-coran"
          aria-label={t('v4.reprendre_lecture', { sourate: nom, a: coran.a })}
          ><span class="v4-picto"><Picto name="coran" /></span><span class="txt"
            ><h3><Bidi text={nom} /></h3>
            <span class="petit doux"><Bidi text={t('v4.coran_verset', { a: coran.a })} /></span
            ></span
          ><span class="v4-rond" aria-hidden="true"
            ><Picto name="fleche" size={22} trait={2.2} /></span
          ></a
        >
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
      {/if}
      {#if madjlis}
        {@const tx = texteDuCursus(madjlis.id)}
        <a
          class="v4-carte v4-ligne"
          href={resolve(
            '/madjaliss/[[texte]]/[[n]]',
            lien(madjlis.id, madjlis.seance ?? undefined),
          )}
          data-testid="v4-reprendre-madjaliss"
          ><span class="v4-picto"><Picto name="madjaliss" /></span><span class="txt">
            {#if tx}<span class="mj-ar"><Ar text={tx.ar} block /></span>{/if}
            <span class="petit doux"
              ><Bidi
                text={madjlis.seance !== null
                  ? t('v4.mj_seance', { n: madjlis.seance })
                  : t('v4.mj_faites', { n: madjlis.faites })}
              /></span
            >
          </span><span class="v4-chev"><Picto name="chevron" /></span></a
        >
      {/if}
    </div>
  {/if}

  <!-- ENSUITE : le moment d'invocation, le prochain jalon -->
  <EnTeteSection titre={t(`v4.ensuite_${quand}`)} />
  <div class="v4-pile">
    <a
      class="v4-carte v4-arc v4-ligne"
      href={resolve('/quotidien/adhkar')}
      data-testid="v4-adhkar"
      data-moment={quand}
      ><span class="v4-picto or"><Picto name={quand === 'matin' ? 'soleil' : 'lune'} /></span><span
        class="txt"
        ><h3><Bidi text={t(`v4.adhkar_${quand}`)} /></h3>
        <span class="petit doux"><Bidi text={t('v4.adhkar_texte')} /></span></span
      ></a
    >
    {#if jalon}
      <div class="v4-jalon" data-testid="v4-jalon">
        <Rosette size={48} />
        <div>
          <h3>{t('v4.jalon')}</h3>
          <p class="petit doux">
            <Bidi text={t('v4.jalon_texte', { unite: unitLabel(jalon), titre: jalon.titleFr })} />
          </p>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .auj {
    padding-bottom: 8px;
  }
  .salut {
    margin: 2px 2px 14px;
  }
  .date {
    font: 700 0.8rem var(--font-ui);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--v4-doux);
  }
  .salut h1 {
    font-size: 1.65rem;
    margin-top: 2px;
  }
  .heros .sur {
    margin: 0;
  }
  .titre-ar {
    margin: 10px 0 0;
    color: var(--v4-sur-bandeau);
  }
  .titre-ar :global(.ar) {
    display: block;
    font-family: var(--font-ar-titre);
    font-weight: 700;
    font-size: 2.3rem;
    line-height: 1.5;
    color: inherit;
  }
  .heros .fr {
    font: 600 1.2rem var(--font-title);
    color: var(--v4-sur-bandeau);
    margin-top: 6px;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    margin: 12px 0 16px;
    font: 700 0.88rem var(--font-ui);
  }
  .meta span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .niveau {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font: 700 0.82rem var(--font-ui);
    margin: 0 0 6px;
  }
  .heros .v4-barre {
    background: rgba(255, 255, 255, 0.16);
    margin-bottom: 18px;
  }
  .go {
    margin-top: 4px;
  }
  .hifz {
    margin-top: 10px;
  }
  .liste {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .sem {
    display: flex;
    gap: 16px;
    align-items: center;
  }
  .sem-droite {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 10px;
  }
  .jours {
    display: flex;
    justify-content: space-between;
    gap: 2px;
  }
  .jour {
    display: grid;
    justify-items: center;
    gap: 6px;
    font: 700 0.78rem var(--font-ui);
    color: var(--v4-doux);
  }
  .jour i {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    border: 1.5px dashed var(--v4-bord);
  }
  .jour.fait i {
    border: 0;
    background: var(--v4-vert);
    color: #fbf7ee;
  }
  .jour.auj i {
    border: 2px solid var(--v4-or);
  }
  .jour.auj {
    color: var(--v4-titre);
  }
  .jour.repos i {
    border-style: dotted;
    opacity: 0.6;
  }
  .mj-ar :global(.ar) {
    display: block;
    font-family: var(--font-ar-titre);
    font-weight: 700;
    font-size: 1.35rem;
    line-height: 1.6;
    color: var(--v4-titre);
    text-align: start;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
