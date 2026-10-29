<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import Bidi from '$lib/Bidi.svelte';
  import { accountProfiles, demoProfileFor } from '$lib/attempts';
  import type { QuranMeta } from '@awform/hifz';
  import {
    lire,
    justessePartDuJour,
    pageApresRecitation,
    type Registre,
  } from '$lib/ecoute/progres';
  import { loadMeta } from '$lib/hifz';
  import { fmtDate, t } from '$lib/i18n';
  import { readLast, type Position } from '$lib/quran/lecture';
  import Feuille from '$lib/quran/lecture/Feuille.svelte';
  import type { ProfileInfo } from '$lib/session';
  import Creation from './Creation.svelte';
  import {
    aujourdhui,
    charger,
    debutDePage,
    enregistrer,
    modifier,
    type Etat,
    type PlanApi,
  } from './donnees';
  import { apresPartDuJour, avancementDepuisPage, calculer, juzDePart } from './plan';
  import Reglages from './Reglages.svelte';

  /**
   * Khatma et wird (26/10/2026) — carte de l'accueil du Coran, chargée à la demande derrière l'interrupteur `khatma_wird`.
   * Pour chaque plan : la part du jour (recalculée, sans reproche), « J'ai lu ma part du jour », la reprise exacte (la même
   * sur tous les appareils) et, pour un groupe (famille, classe), le seul total collectif. Aucun classement.
   */
  let profil = $state<ProfileInfo | null>(null);
  let profils = $state<ProfileInfo[]>([]);
  let etat = $state<Etat | null>(null);
  let hors = $state(false);
  let charge = $state(false);
  let code = $state<string | null>(null);
  let creation = $state(false);
  let reglage = $state<PlanApi | null>(null);
  let reglageOuvert = $state(false);
  let note = $state('');
  let derniere = $state<Position | null>(null);
  let jour = $state(aujourdhui());
  let recitation = $state.raw<Registre>({});
  let meta = $state.raw<QuranMeta | null>(null);

  const plans = $derived((etat?.plans ?? []).filter((p) => p.status !== 'archivee'));
  const lecteur = resolve('/coran/lecteur');

  onMount(async () => {
    derniere = readLast();
    profil = await demoProfileFor('').catch(() => null);
    profils = await accountProfiles().catch(() => []);
    if (profil) {
      await recharger();
      // récitation gardée sur l'appareil (justesse par page) : pour la proposition de mise à jour et la lecture du jour
      recitation = await lire(profil.id).catch(() => ({}));
      meta = await loadMeta().catch(() => null);
    }
    charge = true;
  });

  async function recharger() {
    if (!profil) return;
    jour = aujourdhui();
    const r = await charger(profil.id);
    etat = r.etat;
    hors = r.hors;
    code = r.code;
  }

  const calc = (p: PlanApi) => calculer(p, p.part, jour);

  function titre(p: PlanApi) {
    if (p.title) return p.title;
    if (p.scope === 'famille') return t('kh.plan_famille');
    if (p.scope === 'classe') return t('kh.plan_classe');
    if (p.kind === 'wird') return t('kh.plan_wird', { pages: p.pagesPerDay ?? 1 });
    if (p.mode === 'pages') return t('kh.plan_pages', { pages: p.pagesPerDay ?? 1 });
    const jours = Math.max(
      1,
      Math.round(
        (Date.parse(`${p.endDate}T00:00:00Z`) - Date.parse(`${p.startDate}T00:00:00Z`)) /
          86_400_000,
      ) + 1,
    );
    return t('kh.plan_duree', { jours });
  }

  function libellePart(p: PlanApi) {
    const j = juzDePart(p.part.firstPage, p.part.lastPage);
    if (j)
      return j[0] === j[1]
        ? t('kh.part_juz', { a: j[0] })
        : t('kh.part_juz_plage', { a: j[0], b: j[1] });
    return t('kh.part_pages', { a: p.part.firstPage, b: p.part.lastPage });
  }

  /** adresse de reprise : la position exacte gardée sur le serveur, sinon le début de la prochaine page */
  function reprise(p: PlanApi, page: number | null) {
    if (p.part.sura && p.part.aya) return `${lecteur}?s=${p.part.sura}&a=${p.part.aya}`;
    return `${lecteur}?vue=page&page=${page ?? p.part.firstPage}`;
  }

  function remplacer(maj: PlanApi) {
    if (!etat) return;
    etat = { ...etat, plans: etat.plans.map((x) => (x.id === maj.id ? maj : x)) };
  }

  async function enregistrerPour(p: PlanApi, done: number, corrige = false) {
    if (!profil) return;
    const taille = p.part.lastPage - p.part.firstPage + 1;
    const suivante =
      p.kind === 'wird' ? p.part.firstPage + (done % taille) : p.part.firstPage + done;
    const pos = done >= taille && p.kind !== 'wird' ? null : await debutDePage(suivante);
    const r = await enregistrer(profil.id, p, {
      done,
      day: aujourdhui(),
      // khatma termin?e : pas de position (le serveur refuse null : ? sura >= 1 ?)
      ...(pos ? { sura: pos[0], aya: pos[1] } : {}),
      corrige,
    });
    if (r.plan) remplacer(r.plan);
    else if (r.code === 'reseau') {
      hors = true;
      await recharger();
    }
  }

  async function repousser(p: PlanApi, date: string) {
    if (!profil) return;
    const r = await modifier(profil.id, p.id, { endDate: date });
    if (r.ok && r.data) remplacer(r.data.plan);
  }

  async function aiLu(p: PlanApi) {
    note = '';
    await enregistrerPour(p, apresPartDuJour(p, p.part, calc(p)));
    note = t('kh.j_ai_lu_ok');
  }

  async function majDepuisLecture(p: PlanApi, page: number) {
    await enregistrerPour(p, avancementDepuisPage(p, p.part, page, calc(p)));
  }

  /** la dernière lecture du Coran est plus loin que le plan : on propose de rattraper le plan, jamais de force */
  function propositionLecture(p: PlanApi): number | null {
    const c = calc(p);
    if (!derniere || c.termine || p.kind === 'wird' || c.pageCourante === null) return null;
    return derniere.p > c.pageCourante && derniere.p <= p.part.lastPage ? derniere.p : null;
  }

  /**
   * tarteel-egal-wip : synchronisation avec la RÉCITATION (« Réciter et vérifier », gardée sur l'appareil) : si les pages
   * qui suivent la reprise du plan ont été récitées entièrement sans écart, on PROPOSE de mettre le plan à jour (jamais
   * de force, comme pour la dernière lecture).
   */
  function propositionRecitation(p: PlanApi): number | null {
    const c = calc(p);
    if (!meta || c.termine || p.kind === 'wird' || c.pageCourante === null) return null;
    const apres = pageApresRecitation(recitation, meta, c.pageCourante, p.part.lastPage);
    return apres > c.pageCourante ? Math.min(apres, p.part.lastPage + 1) : null;
  }

  /** justesse de la récitation sur les pages de la part du jour (lecture du jour), si l'élève en a récité */
  function justesseDuJour(p: PlanApi) {
    const c = calc(p);
    return meta && c.pagesDuJour ? justessePartDuJour(recitation, meta, c.pagesDuJour) : null;
  }

  async function reculer(p: PlanApi, page: number) {
    reglageOuvert = false;
    await majDepuisLecture(p, page);
  }

  function ouvrirReglage(p: PlanApi) {
    reglage = p;
    reglageOuvert = true;
  }

  function apresCreation() {
    creation = false;
    void recharger();
  }
  function apresReglage(archive: boolean, maj: PlanApi | null) {
    if (archive) {
      reglageOuvert = false;
      void recharger();
      return;
    }
    if (maj) {
      remplacer(maj);
      reglage = maj;
    }
  }
</script>

{#if charge && profil && !(code && !etat && code !== 'reseau')}
  <section class="card khatma" aria-labelledby="kh-titre" data-testid="khatma-carte">
    <h2 id="kh-titre"><Bidi text={t('kh.titre')} /></h2>
    {#if hors}<p class="muted petit" role="status" data-testid="khatma-hors-ligne">
        {t('kh.hors_ligne')}
      </p>{/if}
    {#if !plans.length}
      <p class="muted" data-testid="khatma-intro"><Bidi text={t('kh.intro')} /></p>
    {/if}
    {#each plans as p (p.id)}
      {@const c = calc(p)}
      {@const prop = propositionLecture(p)}
      {@const propR = propositionRecitation(p)}
      {@const justesse = justesseDuJour(p)}
      <article class="plan" data-testid="khatma-plan" data-plan={p.id} data-statut={p.status}>
        <h3><Bidi text={titre(p)} /></h3>
        {#if p.scope !== 'profil'}
          <p class="petit"><Bidi text={t('kh.ma_part', { part: libellePart(p) })} /></p>
        {/if}
        {#if c.termine && p.scope === 'profil'}
          <p class="ok" role="status" data-testid="khatma-terminee">
            <Bidi text={t('kh.termine')} />
          </p>
        {:else}
          {#if c.pagesDuJour}
            <p class="jour" data-testid="khatma-jour">
              <strong>{t('kh.aujourdhui')}</strong> :
              <Bidi
                text={c.pagesDuJour[0] === c.pagesDuJour[1]
                  ? t('kh.page_jour', { n: c.pagesDuJour[0] })
                  : t('kh.pages_jour', { de: c.pagesDuJour[0], a: c.pagesDuJour[1] })}
              />
            </p>
            <progress
              max={c.partDuJour}
              value={Math.min(c.luAujourdhui, c.partDuJour)}
              aria-label={t('kh.aujourdhui')}
            ></progress>
          {/if}
          {#if c.jourLu}
            <p class="ok" role="status" data-testid="khatma-jour-lu">
              <Bidi text={t('kh.jour_lu')} />
            </p>
          {/if}
        {/if}
        {#if p.kind === 'wird'}
          <p class="petit muted"><Bidi text={t('kh.tours', { n: c.tours })} /></p>
        {:else if !(c.termine && p.scope === 'profil')}
          <p class="petit muted"><Bidi text={t('kh.lues', { n: c.fait, total: c.taille })} /></p>
        {/if}
        {#if p.kind === 'khatma' && p.mode === 'duree' && !c.termine && p.scope === 'profil'}
          <p class="petit" data-testid="khatma-rythme">
            <Bidi text={t(`kh.msg_${c.rythme}`)} />
            {#if c.joursRestants && c.joursRestants > 0}
              <Bidi text={t('kh.jours_restants', { n: c.joursRestants })} />
            {/if}
          </p>
        {/if}
        {#if c.finPrevue && p.mode === 'pages' && !c.termine}
          <p class="petit muted">
            <Bidi
              text={t('kh.fin_prevue', { date: fmtDate(c.finPrevue, { dateStyle: 'long' }) })}
            />
          </p>
        {/if}
        {#if c.finDepassee && c.finProposee}
          <div class="info" data-testid="khatma-fin-passee">
            <p>
              <Bidi
                text={t('kh.fin_passee', { date: fmtDate(c.finProposee, { dateStyle: 'long' }) })}
              />
            </p>
            {#if p.responsable}
              <button
                type="button"
                onclick={() => repousser(p, c.finProposee!)}
                data-testid="khatma-repousser"
                ><Bidi
                  text={t('kh.repousser_a', {
                    date: fmtDate(c.finProposee, { dateStyle: 'long' }),
                  })}
                /></button
              >
            {/if}
          </div>
        {/if}
        {#if p.groupe}
          <p class="petit" data-testid="khatma-groupe">
            <Bidi text={t('kh.groupe', { terminees: p.groupe.terminees, parts: p.groupe.parts })} />
          </p>
          <p class="petit muted">
            <Bidi
              text={p.status === 'terminee' ? t('kh.groupe_termine') : t('kh.groupe_ensemble')}
            />
          </p>
        {/if}
        {#if prop}
          <button
            type="button"
            class="petit"
            onclick={() => majDepuisLecture(p, prop)}
            data-testid="khatma-maj-lecture"
            ><Bidi text={t('kh.maj_depuis_lecture', { p: prop })} /></button
          >
        {/if}
        {#if justesse}
          <!-- récitation de « Réciter et vérifier » (gardée sur l'appareil) sur les pages du jour : un compte de mots -->
          <p class="petit muted" data-testid="khatma-justesse">
            <Bidi text={t('kh.justesse_jour', { j: justesse.justesse, n: justesse.pages })} />
          </p>
        {/if}
        {#if propR}
          <button
            type="button"
            class="petit"
            onclick={() => majDepuisLecture(p, propR)}
            data-testid="khatma-maj-recitation"
            ><Bidi text={t('kh.maj_depuis_recitation', { p: propR - 1 })} /></button
          >
        {/if}
        <div class="actions">
          {#if !c.termine || p.kind === 'wird'}
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- chemin résolu, suivi d'un paramètre -->
            <a class="dore" href={reprise(p, c.pageCourante)} data-testid="khatma-reprendre"
              >{t('kh.reprendre')}</a
            >
            {#if !c.jourLu}
              <button
                type="button"
                class="primary"
                onclick={() => aiLu(p)}
                data-testid="khatma-ai-lu">{t('kh.j_ai_lu')}</button
              >
            {/if}
          {/if}
          <button type="button" onclick={() => ouvrirReglage(p)} data-testid="khatma-regler"
            >{t('kh.regler')}</button
          >
        </div>
      </article>
    {/each}
    {#if note}<p class="ok petit" role="status"><Bidi text={note} /></p>{/if}
    <button
      type="button"
      class="nouveau"
      onclick={() => (creation = true)}
      data-testid="khatma-nouveau">{t('kh.nouveau')}</button
    >
    <p class="petit muted">{t('kh.sans_classement')}</p>
  </section>

  <Feuille
    id="kh-creer"
    title={t('kh.cree_titre')}
    bind:open={creation}
    testid="khatma-feuille-creation"
  >
    <Creation
      {profil}
      {profils}
      {derniere}
      limites={etat?.limites ?? { joursMax: 550, pagesParJourMax: 100 }}
      rappelActif={etat?.rappel ?? false}
      ferme={() => (creation = false)}
      fait={apresCreation}
    />
  </Feuille>

  <Feuille
    id="kh-regler"
    title={t('kh.regler_titre')}
    bind:open={reglageOuvert}
    testid="khatma-feuille-reglage"
  >
    {#if reglage}
      <Reglages
        plan={reglage}
        {profil}
        {jour}
        rappel={etat?.rappel ?? false}
        corriger={(page) => reculer(reglage!, page)}
        fait={apresReglage}
      />
    {/if}
  </Feuille>
{/if}

<style>
  .khatma {
    display: grid;
    gap: 8px;
    margin: var(--space-m) 0;
    border-inline-start: 6px solid var(--gold, var(--or-line));
  }
  h2 {
    margin: 0;
    font-size: 1.15rem;
  }
  h3 {
    margin: 0;
    font-size: 1rem;
  }
  .plan {
    display: grid;
    gap: 6px;
    padding: 10px 0;
    border-top: 1px solid var(--line);
  }
  .petit {
    font-size: 0.9rem;
    margin: 0;
  }
  .jour {
    margin: 0;
  }
  progress {
    width: 100%;
    height: 10px;
    accent-color: var(--primary);
  }
  .ok {
    margin: 0;
    padding: 6px 10px;
    border-radius: 8px;
    background: var(--ok-bg);
    color: var(--ok-ink);
  }
  .info {
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--info-bg);
  }
  .info p {
    margin: 0 0 6px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .actions button,
  .nouveau,
  .info button {
    min-height: 44px;
  }
  .nouveau {
    justify-self: start;
  }
</style>
