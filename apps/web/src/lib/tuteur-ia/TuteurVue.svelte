<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import Ar from '$lib/Ar.svelte';
  import Bidi from '$lib/Bidi.svelte';
  import BoutonTraduction from '$lib/BoutonTraduction.svelte';
  import Brand from '$lib/ui/Brand.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { t } from '$lib/i18n';
  import { memoriserTraduction, traductionVisible } from '$lib/traduction';
  import {
    audioIdFor,
    levelAudio,
    playLessonAudio,
    stopLessonAudio,
    type LevelAudio,
  } from '$lib/lecons-audio';
  import {
    accordVoix,
    enregistrer,
    etat as lireEtat,
    guidee,
    jouer,
    libre,
    prononciation as lirePrononciation,
    scenario as lireScenario,
    type Enregistreur,
    type Scenario,
    type EtatTuteur,
    type ReponseLibre,
    type ResultatGuidee,
    type ResultatPrononciation,
  } from './api';

  /**
   * Tuteur IA de conversation (19/10/2026, TUTEUR_IA.md) — écran chargé À LA DEMANDE.
   *  - « Dialogue guidé » (étage 1, local) : l'élève joue son rôle dans le dialogue de sa leçon ; la voix de l'autre
   *    personnage vient des fichiers audio des leçons ; sa réplique est écoutée par l'IA locale et comparée au livre.
   *  - « Parler librement » (étage 2, Gemini) : réponse à voix haute, correction douce, mots du niveau.
   * Identité Awzid, AUCUN visage ni avatar : symbole de la marque, onde sonore animée, cartes ivoire, vert et or.
   * Mode texte de secours partout (micro refusé ou absent, lieu bruyant). Réglages discrets (genre, vouvoiement).
   */
  let { unitId, profileId }: { unitId: string; profileId: string } = $props();

  type Mode = 'guidee' | 'libre';
  interface Message {
    de: 'eleve' | 'tuteur';
    ar: string;
    fr?: string;
    correction?: ReponseLibre['correction'];
    audio?: ReponseLibre['audio'];
    redirection?: ReponseLibre['redirection'];
    aide?: string;
    protection?: ReponseLibre['protection'];
    repli?: boolean;
    /** 28/10/2026 : remarque de prononciation ou conseil d'écoute, arrivés juste après la réponse */
    prononciation?: ResultatPrononciation;
  }

  let etat = $state<EtatTuteur | null>(null);
  let scenario = $state<Scenario | null>(null);
  let la = $state<LevelAudio | null>(null);
  let mode = $state<Mode>('guidee');
  let trad = $state(true);
  let occupe = $state(false);
  let ecoute = $state(false);
  let parle = $state(false);
  let erreur = $state('');
  let ecrire = $state(false);
  let saisie = $state('');
  let reglages = $state(false);
  let genre = $state<'m' | 'f' | 'x'>('x');
  let vous = $state(false);
  let rec: Enregistreur | null = null;
  let lecteur: HTMLAudioElement | null = null;

  // ---- étage 1
  let pos = $state(0);
  let resultat = $state<ResultatGuidee | null>(null);
  let indice = $state(false);
  // ---- étage 2
  let messages = $state<Message[]>([]);
  let minutes = $state<number | null>(null);

  const tours = $derived(scenario?.tours ?? []);
  const tour = $derived(tours[pos]);
  const fini = $derived(!!scenario && pos >= tours.length);
  const cleReglages = () => `awz-tuia:${profileId}`;

  onMount(async () => {
    trad = traductionVisible(profileId);
    try {
      const r = JSON.parse(localStorage.getItem(cleReglages()) ?? '{}') as {
        genre?: 'm' | 'f' | 'x';
        vous?: boolean;
      };
      genre = r.genre ?? 'x';
      vous = !!r.vous;
    } catch {
      /* stockage indisponible : réglages par défaut */
    }
    const [e, s] = await Promise.all([
      lireEtat(profileId, unitId),
      lireScenario(profileId, unitId),
    ]);
    etat = e.ok ? e.data : { actif: false };
    scenario = s.ok ? s.data : null;
    la = await levelAudio(unitId.split('.')[0]!);
    minutes = etat?.minutesRestantes ?? null;
    const premier = scenario?.tours.find((x) => x.t === 'partenaire');
    if (premier && premier.t === 'partenaire')
      messages = [{ de: 'tuteur', ar: premier.ar, fr: premier.fr ?? '' }];
  });
  onDestroy(() => {
    rec?.annuler();
    lecteur?.pause();
    stopLessonAudio();
  });

  function garderReglages() {
    try {
      localStorage.setItem(cleReglages(), JSON.stringify({ genre, vous }));
    } catch {
      /* rien */
    }
  }
  function basculerTrad() {
    trad = !trad;
    memoriserTraduction(profileId, trad);
  }

  async function ecouterLivre(ar: string) {
    const id = audioIdFor(ar, la);
    if (!id) return;
    parle = true;
    try {
      const a = await playLessonAudio(id, false);
      // 26/10/2026 : la pastille du lecteur pilote ce son (pause, ±5 s, vitesse)
      void import('$lib/lecteur/ouvrir').then((m) => m.piloter(a)).catch(() => {});
      a.onended = () => (parle = false);
    } catch {
      parle = false;
    }
  }

  // ---------------------------------------------------------------- micro
  async function micro() {
    erreur = '';
    if (ecoute) return finir();
    try {
      rec = await enregistrer(mode === 'libre' ? 20 : 12, () => void finir());
      ecoute = true;
    } catch {
      erreur = t('tuia.micro_refuse');
      ecrire = true;
    }
  }
  async function finir() {
    const r = rec;
    rec = null;
    ecoute = false;
    const audio = r ? await r.arreter() : null;
    if (!audio) return;
    if (mode === 'guidee') await verifier({ audio });
    else await envoyer({ audio });
  }

  // ---------------------------------------------------------------- étage 1
  async function verifier(x: {
    texte?: string;
    audio?: { mime: string; b64: string; secondes: number };
  }) {
    occupe = true;
    erreur = '';
    const r = await guidee(profileId, { unitId, tour: pos, ...x });
    occupe = false;
    if (r.ok && r.data) {
      resultat = r.data;
      saisie = '';
    } else if (r.code === 'accord_voix_requis' && etat?.guidee) etat.guidee.accordVoix = false;
    else erreur = t('tuia.erreur');
  }
  function suivant() {
    resultat = null;
    indice = false;
    pos++;
  }
  function recommencer() {
    resultat = null;
    indice = false;
    pos = 0;
  }
  async function donnerAccord() {
    const r = await accordVoix(profileId);
    if (r.ok && etat?.guidee) etat.guidee.accordVoix = true;
    else erreur = t('tuia.accord_refuse');
  }

  // ---------------------------------------------------------------- étage 2
  async function envoyer(x: {
    texte?: string;
    audio?: { mime: string; b64: string; secondes: number };
  }) {
    occupe = true;
    erreur = '';
    const historique = messages
      .filter((m) => m.ar && !m.redirection)
      .slice(-8)
      .map((m) => ({ de: m.de, ar: m.ar }));
    if (x.texte) messages = [...messages, { de: 'eleve', ar: x.texte }];
    const r = await libre(profileId, {
      unitId,
      ...x,
      historique,
      genre,
      adresse: vous ? 'vous' : 'tu',
    });
    occupe = false;
    if (!r.ok || !r.data) {
      erreur =
        r.code === 'plafond'
          ? (r.error?.refus as string)?.startsWith('eleve')
            ? t('tuia.plafond')
            : t('tuia.plafond_global')
          : t('tuia.erreur');
      return;
    }
    const d = r.data;
    saisie = '';
    if (x.audio && d.transcription) messages = [...messages, { de: 'eleve', ar: d.transcription }];
    messages = [
      ...messages,
      {
        de: 'tuteur',
        ar: d.reponse_ar,
        fr: d.reponse_fr,
        correction: d.correction,
        audio: d.audio,
        ...(d.redirection ? { redirection: d.redirection } : {}),
        ...(d.aide ? { aide: d.aide } : {}),
        ...(d.protection ? { protection: d.protection } : {}),
        ...(d.repli ? { repli: true } : {}),
      },
    ];
    if (d.minutesRestantes !== undefined) minutes = d.minutesRestantes;
    if (d.audio) relire(d.audio);
    if (d.prononciationId) void attendrePrononciation(d.prononciationId, messages.length - 1);
  }
  /** conseils d'écoute déjà montrés dans la séance (un par son : rester discret) */
  const conseilsVus: string[] = [];
  /** 28/10/2026 : la remarque arrive juste après la réponse (appel lancé en parallèle par le serveur) */
  async function attendrePrononciation(pid: string, i: number) {
    const r = await lirePrononciation(profileId, pid);
    if (!r.ok || !r.data) return;
    const p = r.data;
    // protection détectée après coup : le message de protection remplace la réponse
    if (p.renvoi) {
      if (messages[i]) messages[i] = { de: 'tuteur', ar: '', ...p.renvoi };
      return;
    }
    // 29/10/2026 : écrit — la correction de grammaire arrive juste après (si la réponse n'en avait pas)
    if (p.correction) {
      const m = messages[i];
      if (m && !m.correction) messages[i] = { ...m, correction: p.correction };
      return;
    }
    if (p.conseil && !p.remarque) {
      if (conseilsVus.includes(p.conseil.son)) return;
      conseilsVus.push(p.conseil.son);
    }
    if (!p.remarque && !p.conseil) return;
    const m = messages[i];
    if (m) messages[i] = { ...m, prononciation: p };
  }
  function relire(a: { mime: string; b64: string }) {
    lecteur?.pause();
    parle = true;
    lecteur = jouer(a, () => (parle = false));
  }
  function soumettre(e: SubmitEvent) {
    e.preventDefault();
    const v = saisie.trim();
    if (!v || occupe) return;
    if (mode === 'guidee') void verifier({ texte: v });
    else void envoyer({ texte: v });
  }

  const actif = $derived(ecoute || parle || occupe);
  const voixGuidee = $derived(!!etat?.guidee?.voix && etat.guidee.accordVoix);
</script>

<section class="tuia" data-testid="tuteur-ia" data-mode={mode}>
  <div class="tete carte">
    <Brand size={28} />
    <div class="onde" class:actif aria-hidden="true">
      {#each [0, 1, 2, 3, 4, 5, 6] as i (i)}<i style:animation-delay="{i * 90}ms"></i>{/each}
    </div>
    <button
      type="button"
      class="ico"
      aria-label={t('tuia.reglages')}
      aria-expanded={reglages}
      onclick={() => (reglages = !reglages)}><Icon name="reglages" size={22} /></button
    >
  </div>
  <p class="programme petit"><Bidi text={t('tuia.programme')} /></p>
  {#if etat?.libre?.simule}<p class="badge" data-testid="tuia-simule">
      <Bidi text={t('tuia.simule')} />
    </p>{/if}

  {#if reglages}
    <div class="carte reglages" data-testid="tuia-reglages">
      <label
        ><Bidi text={t('tuia.genre')} />
        <select bind:value={genre} onchange={garderReglages}>
          <option value="x">{t('tuia.genre_x')}</option>
          <option value="m">{t('tuia.genre_m')}</option>
          <option value="f">{t('tuia.genre_f')}</option>
        </select></label
      >
      {#if etat?.audience === 'adulte'}<label class="case"
          ><input type="checkbox" bind:checked={vous} onchange={garderReglages} />
          <Bidi text={t('tuia.vous')} /></label
        >{/if}
      <p class="petit doux"><Bidi text={t('tuia.journal')} /></p>
    </div>
  {/if}

  <div class="puces" role="tablist">
    <button
      type="button"
      role="tab"
      class="puce"
      aria-selected={mode === 'guidee'}
      data-testid="tuia-mode-guidee"
      onclick={() => (mode = 'guidee')}><Bidi text={t('tuia.guidee')} /></button
    >
    <button
      type="button"
      role="tab"
      class="puce"
      aria-selected={mode === 'libre'}
      data-testid="tuia-mode-libre"
      onclick={() => (mode = 'libre')}><Bidi text={t('tuia.libre')} /></button
    >
    <span class="trad"><BoutonTraduction visible={trad} onbasculer={basculerTrad} /></span>
  </div>

  {#if !etat}
    <p class="doux" aria-busy="true"><Bidi text={t('tuia.chargement')} /></p>
  {:else if mode === 'guidee'}
    <!-- ================================================= étage 1 : dialogue guidé (local) -->
    {#if !scenario}
      <p class="carte"><Bidi text={t('tuia.sans_dialogue')} /></p>
    {:else}
      <p class="aide petit"><Bidi text={t('tuia.guidee_aide', { role: scenario.role.qui })} /></p>
      <ol class="fil" data-testid="tuia-fil">
        {#each tours.slice(0, pos) as x, i (i)}
          {#if x.t === 'partenaire'}
            <li class="bulle tuteur">
              <Ar text={x.ar} block />{#if trad && x.fr}<p class="fr"><Bidi text={x.fr} /></p>{/if}
            </li>
          {:else}
            {@const b = x.choix.find((c) => c.kind === 'bonne')}
            <li class="bulle eleve"><Ar text={b?.ar ?? ''} block /></li>
          {/if}
        {/each}
      </ol>
      {#if fini}
        <div class="carte fin" data-testid="tuia-fin">
          <p><Bidi text={t('tuia.fin_dialogue')} /></p>
          <button type="button" onclick={recommencer}><Bidi text={t('tuia.recommencer')} /></button>
          {#if etat.libre?.disponible}<button
              type="button"
              class="primaire"
              onclick={() => (mode = 'libre')}><Bidi text={t('tuia.libre')} /></button
            >{/if}
        </div>
      {:else if tour?.t === 'partenaire'}
        <div class="carte scene" data-testid="tuia-partenaire">
          <p class="qui petit"><Bidi text={tour.qui} /></p>
          <Ar text={tour.ar} block />
          {#if trad && tour.fr}<p class="fr"><Bidi text={tour.fr} /></p>{/if}
          <div class="actions">
            {#if audioIdFor(tour.ar, la)}<button type="button" onclick={() => ecouterLivre(tour.ar)}
                ><Icon name="lecture" size={18} /> <Bidi text={t('tuia.ecouter')} /></button
              >{/if}
            <button type="button" class="primaire" data-testid="tuia-continuer" onclick={suivant}
              ><Bidi text={t('tuia.continuer')} /></button
            >
          </div>
        </div>
      {:else if tour?.t === 'eleve'}
        {@const bonne = tour.choix.find((c) => c.kind === 'bonne')}
        <div class="carte a-toi" data-testid="tuia-a-toi">
          <p class="qui petit"><Bidi text={t('tuia.a_toi', { role: tour.qui })} /></p>
          {#if resultat}
            <p
              class="mots"
              lang="ar"
              dir="rtl"
              data-testid="tuia-resultat"
              data-bilan={resultat.bilan}
            >
              {#each resultat.mots as m, k (k)}<span class="mot {m.etat}"><Bidi text={m.ar} /></span
                >
              {/each}
            </p>
            <p class="bilan {resultat.bilan}"><Bidi text={t(`tuia.${resultat.bilan}`)} /></p>
            {#if resultat.bilan !== 'bravo'}<p class="petit doux">
                <Bidi text={t('tuia.legende')} />
              </p>{/if}
            <div class="actions">
              <button type="button" onclick={() => (resultat = null)}
                ><Icon name="repeter" size={18} /> <Bidi text={t('tuia.reessayer')} /></button
              >
              <button type="button" class="primaire" data-testid="tuia-suivant" onclick={suivant}
                ><Bidi text={t('tuia.suivant')} /></button
              >
            </div>
          {:else}
            {#if indice && bonne}<Ar text={bonne.ar} block />{#if trad && bonne.fr}<p class="fr">
                  <Bidi text={bonne.fr} />
                </p>{/if}{/if}
            <button type="button" class="lien petit" onclick={() => (indice = !indice)}
              ><Bidi text={t('tuia.indice')} /></button
            >
          {/if}
        </div>
        {#if !resultat && etat.guidee?.voix && !etat.guidee.accordVoix}
          <div class="carte accord" data-testid="tuia-accord-voix">
            <p class="petit"><Bidi text={t('tuia.accord_voix')} /></p>
            <button type="button" onclick={donnerAccord}
              ><Bidi text={t('tuia.accord_voix_bouton')} /></button
            >
          </div>
        {/if}
      {/if}
    {/if}
  {:else}
    <!-- ================================================= étage 2 : conversation libre (Gemini) -->
    {#if !etat.libre?.disponible}
      <p class="carte raison" data-testid="tuia-libre-ferme">
        <Bidi text={t(`tuia.libre_raison_${etat.libre?.raison ?? 'mode'}`)} />
      </p>
    {:else}
      <p class="aide petit"><Bidi text={t('tuia.libre_aide')} /></p>
      <ol class="fil" data-testid="tuia-messages" aria-live="polite">
        {#each messages as m, i (i)}
          <li class="bulle {m.de}" data-de={m.de}>
            {#if m.redirection}
              <div class="renvoi" data-testid="tuia-renvoi" data-redirection={m.redirection}>
                <p>
                  <Bidi
                    text={m.redirection === 'religion'
                      ? t('tuia.religion')
                      : m.redirection === 'coran'
                        ? t('tuia.coran')
                        : m.redirection === 'protection'
                          ? t(
                              m.protection === 'rencontre'
                                ? 'tuia.protection_rencontre'
                                : 'tuia.protection',
                              { tel: m.aide ?? '' },
                            )
                          : m.redirection === 'politique'
                            ? t('tuia.politique')
                            : m.redirection === 'inconvenant'
                              ? t('tuia.inconvenant')
                              : m.redirection === 'conseil'
                                ? t('tuia.conseil')
                                : t('tuia.recadrage')}
                  />
                </p>
                {#if m.redirection === 'religion'}
                  <p class="liens">
                    <a href={resolve('/lecons/[id]', { id: unitId })}
                      ><Bidi text={t('tuia.lien_lecons')} /></a
                    >
                    <a href={resolve('/madjaliss')}><Bidi text={t('tuia.lien_madjaliss')} /></a>
                    <a href={resolve('/aide')}><Bidi text={t('tuia.lien_referent')} /></a>
                  </p>
                {/if}
              </div>
            {:else}
              {#if m.repli}<p class="petit doux"><Bidi text={t('tuia.repli')} /></p>{/if}
              {#if /[\u0600-\u06FF]/.test(m.ar)}<Ar text={m.ar} block />{:else}<p class="fr-eleve">
                  <Bidi text={m.ar || m.fr || ''} />
                </p>{/if}
              {#if trad && m.fr && m.ar}<p class="fr"><Bidi text={m.fr} /></p>{/if}
              {#if m.correction}
                <div class="correction" data-testid="tuia-correction">
                  <p class="petit"><Bidi text={t('tuia.correction')} /></p>
                  <Ar text={m.correction.correct} block />
                  <p class="petit"><Bidi text={m.correction.explication_fr} /></p>
                </div>
              {/if}
              {#if m.prononciation}
                {@const p = m.prononciation}
                <div class="correction" data-testid="tuia-prononciation">
                  {#if p.remarque}
                    <p class="petit"><Bidi text={t('tuia.prononciation')} /></p>
                    <Ar text={p.remarque.correct} block />
                    <p class="petit"><Bidi text={p.remarque.explication_fr} /></p>
                  {:else if p.conseil}
                    <p class="petit"><Bidi text={t('tuia.ecoute_difference')} /></p>
                    {#each p.conseil.paire as w (w.ar)}
                      <Ar text={w.ar} block />
                      {#if trad && w.fr}<p class="fr petit"><Bidi text={w.fr} /></p>{/if}
                    {/each}
                    <Ar text={p.conseil.mot} block />
                    <p class="petit"><Bidi text={p.conseil.explication_fr} /></p>
                  {/if}
                  {#if p.audio}<button
                      type="button"
                      class="lien petit"
                      onclick={() => p.audio && relire(p.audio)}
                      ><Icon name="lecture" size={16} /> <Bidi text={t('tuia.ecouter')} /></button
                    >{/if}
                </div>
              {/if}
              {#if m.audio}<button
                  type="button"
                  class="lien petit"
                  onclick={() => m.audio && relire(m.audio)}
                  ><Icon name="repeter" size={16} /> <Bidi text={t('tuia.reecouter')} /></button
                >{/if}
            {/if}
          </li>
        {/each}
        {#if occupe}<li class="bulle tuteur pense" aria-busy="true">
            <Bidi text={t('tuia.reflexion')} />
          </li>{/if}
      </ol>
      {#if minutes !== null}<p class="petit doux minutes" data-testid="tuia-minutes">
          <Bidi text={t('tuia.minutes', { n: minutes })} />
        </p>{/if}
    {/if}
  {/if}

  {#if erreur}<p class="erreur" role="alert"><Bidi text={erreur} /></p>{/if}

  {#if etat && scenario && ((mode === 'guidee' && tour?.t === 'eleve' && !resultat) || (mode === 'libre' && etat.libre?.disponible))}
    <div class="dock">
      {#if (mode === 'guidee' && voixGuidee) || (mode === 'libre' && !ecrire)}
        <button
          type="button"
          class="micro"
          class:ecoute
          disabled={occupe}
          aria-pressed={ecoute}
          data-testid="tuia-micro"
          onclick={micro}
          ><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"
            ><rect x="9" y="3" width="6" height="11" rx="3" /><path
              d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"
            /></svg
          ><span><Bidi text={ecoute ? t('tuia.arreter') : t('tuia.parler')} /></span></button
        >
      {/if}
      {#if ecrire || !(mode === 'guidee' ? voixGuidee : true)}
        <form class="ecrire" onsubmit={soumettre}>
          <input
            type="text"
            lang="ar"
            dir="rtl"
            maxlength="300"
            bind:value={saisie}
            placeholder={t('tuia.ecrire_place')}
            aria-label={t('tuia.ecrire_place')}
            data-testid="tuia-saisie"
          />
          <button
            type="submit"
            class="primaire"
            disabled={occupe || !saisie.trim()}
            data-testid="tuia-envoyer"
            ><Bidi text={mode === 'guidee' ? t('tuia.verifier') : t('tuia.envoyer')} /></button
          >
        </form>
      {/if}
      {#if !ecrire && (mode === 'libre' || voixGuidee)}<button
          type="button"
          class="lien petit"
          data-testid="tuia-ecrire"
          onclick={() => (ecrire = true)}><Bidi text={t('tuia.ecrire')} /></button
        >{/if}
    </div>
  {/if}
</section>

<style>
  .tuia {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    overflow-wrap: anywhere;
    gap: var(--space-s);
    max-width: 640px;
    margin: 0 auto;
    padding: 0 var(--space-s) 120px;
  }
  .carte {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    padding: var(--space-m);
  }
  .tete {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    padding: var(--space-s) var(--space-m);
  }
  .onde {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 5px;
    height: 36px;
  }
  .onde i {
    display: block;
    width: 5px;
    height: 8px;
    border-radius: 3px;
    background: var(--primary);
    opacity: 0.55;
  }
  .onde i:nth-child(odd) {
    background: var(--gold);
  }
  .onde.actif i {
    animation: onde 0.9s ease-in-out infinite;
    opacity: 1;
  }
  @keyframes onde {
    0%,
    100% {
      height: 8px;
    }
    50% {
      height: 32px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .onde.actif i {
      animation: none;
      height: 20px;
    }
  }
  .ico {
    min-width: var(--target);
    min-height: var(--target);
    border-radius: 50%;
    background: transparent;
    border: 0;
    color: var(--ink2);
  }
  .programme,
  .aide {
    color: var(--ink2);
    margin: 0;
  }
  .badge {
    justify-self: start;
    margin: 0;
    padding: 4px 10px;
    border-radius: var(--radius-pill);
    background: var(--sand);
    color: var(--soon-ink);
    font-size: 0.85rem;
    border: 1px dashed var(--gold);
  }
  .puces {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .puce {
    min-height: 44px;
    padding: 0 16px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink);
    font-weight: 700;
  }
  .puce[aria-selected='true'] {
    background: var(--primary);
    color: var(--on-primary);
    border-color: var(--primary);
  }
  .trad {
    margin-inline-start: auto;
  }
  .fil {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: var(--space-s);
  }
  .bulle {
    border-radius: var(--radius-lg);
    padding: var(--space-s) var(--space-m);
    border: 1px solid var(--line);
    background: var(--card);
  }
  .bulle.tuteur {
    border-inline-start: 3px solid var(--gold);
  }
  .bulle.eleve {
    background: var(--primary-soft);
    border-color: transparent;
    margin-inline-start: 18%;
  }
  .bulle.pense {
    color: var(--ink2);
    font-style: italic;
  }
  .fr {
    color: var(--ink2);
    margin: 4px 0 0;
  }
  .scene,
  .a-toi {
    border: 1.5px solid var(--gold);
    background: linear-gradient(var(--card), var(--sand));
  }
  .qui {
    font-weight: 700;
    color: var(--navy);
    margin: 0 0 4px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: var(--space-s);
  }
  button {
    min-height: var(--target);
    border-radius: 14px;
    padding: 0 16px;
    border: 1.5px solid var(--line);
    background: var(--card);
    color: var(--navy);
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  button.primaire {
    background: var(--primary);
    color: var(--on-primary);
    border-color: var(--primary);
  }
  button.lien {
    border: 0;
    background: none;
    min-height: 44px;
    padding: 0;
    text-decoration: underline;
    color: var(--teal);
  }
  .mots {
    display: flex;
    flex-wrap: wrap;
    gap: 0 0.4em;
    font-family: var(--font-ar);
    font-size: calc(var(--ar-size) * 1.15);
    line-height: 2;
    margin: 0;
  }
  .mot.juste {
    color: var(--good);
  }
  .mot.manquant {
    color: var(--soon-ink);
    text-decoration: underline wavy var(--gold);
  }
  .mot.doute {
    color: var(--ink2);
  }
  .bilan {
    font-weight: 700;
    margin: 4px 0 0;
  }
  .bilan.bravo {
    color: var(--good);
  }
  .correction {
    margin-top: var(--space-s);
    padding: var(--space-s);
    border-radius: var(--radius-md);
    background: var(--sand);
    border: 1px dashed var(--gold);
  }
  .renvoi .liens {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  .reglages {
    display: grid;
    gap: 8px;
  }
  .case {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .doux {
    color: var(--ink2);
  }
  .petit {
    font-size: 0.88rem;
  }
  .erreur {
    color: var(--bad-ink);
    background: var(--bad-bg);
    border-radius: var(--radius-md);
    padding: 8px 12px;
    margin: 0;
  }
  .dock {
    position: sticky;
    bottom: 76px;
    display: grid;
    justify-items: center;
    gap: 8px;
    padding: var(--space-s);
    background: linear-gradient(transparent, var(--paper) 35%);
  }
  .micro {
    width: 84px;
    height: 84px;
    border-radius: 50%;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    padding: 0;
    background: var(--primary);
    color: var(--on-primary);
    border: 3px solid var(--gold);
    font-size: 0.78rem;
    box-shadow: var(--shadow-float);
  }
  .micro svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
  }
  .micro.ecoute {
    background: var(--navy);
    outline: 4px solid var(--primary-soft);
  }
  .ecrire {
    display: flex;
    gap: 8px;
    width: 100%;
  }
  .ecrire button {
    flex: none;
    white-space: nowrap;
  }
  .fr-eleve {
    margin: 0;
  }
  .ecrire input {
    flex: 1;
    min-height: var(--target);
    border-radius: 14px;
    border: 1.5px solid var(--line);
    padding: 0 12px;
    font-family: var(--font-ar);
    font-size: 1.15rem;
    background: var(--card);
    color: var(--ink);
  }
</style>
