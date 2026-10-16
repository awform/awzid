<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import BoutonTraduction from '$lib/BoutonTraduction.svelte';
  import { memoriserTraduction, traductionVisible } from '$lib/traduction';
  import { onMount, setContext, untrack } from 'svelte';
  import { chargerModule } from '$lib/charger';
  import ConnexionNecessaire from '$lib/ConnexionNecessaire.svelte';
  import { resolve } from '$app/paths';
  import Ar from '$lib/Ar.svelte';
  import ArFr from '$lib/ArFr.svelte';
  import type { VerseMark } from '@awform/content/versets';
  import Exercise from '$lib/Exercise.svelte';
  import ExamExercise from '$lib/ExamExercise.svelte';
  import { call } from '$lib/session';
  import { relierOriginal } from '@awform/content/projection';
  import ReligionLesson from '$lib/religion/ReligionLesson.svelte';
  import CoranLesson from '$lib/qc/CoranLesson.svelte';
  import { fn } from '$lib/fonctions.svelte';
  import { noter } from '$lib/usage';
  import Illus from '$lib/Illus.svelte';
  import LettresLecon from '$lib/LettresLecon.svelte';
  import Ecouter from '$lib/Ecouter.svelte';
  import { AUDIO_CTX, levelAudio, recitationQuery, type LevelAudio } from '$lib/lecons-audio';
  import Scene from '$lib/Scene.svelte';
  import Sprite from '$lib/Sprite.svelte';
  import { arabicSize, isQuranReadingLevel, unitLabel } from '$lib/api';
  import { fmtNumber, loadTexts, t } from '$lib/i18n';
  import { demoProfileFor, enqueue, flush, onProgress } from '$lib/attempts';
  // A39 : note chiffrée seulement « avec vérification »
  import { showsScore } from '$lib/parcours/mode';
  import type { ItemResponse } from '@awform/grading';
  import { personaKey, type SceneSpec } from '@awform/content/scene';
  import Signaler, { SIGNAL_CTX } from '$lib/Signaler.svelte';
  import VivanteLecon from '$lib/vivante/VivanteLecon.svelte';
  import JeParleBouton from '$lib/conversation/JeParleBouton.svelte';
  import { aUnScenario } from '$lib/conversation/scenario';
  import { localIso } from '$lib/hifz';
  import SeanceSuite from '$lib/SeanceSuite.svelte';
  import { etapeSuivante } from '$lib/seance';
  import Arbre from '$lib/ui/Arbre.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  /**
   * Lecteur de leçon : ordre et règles d'affichage du moteur des livres (awform.js : lectureLesson,
   * lectureBilan, coran, dialogue, lessonCheck, ecritureLesson). La leçon reçue est la projection ÉLÈVE :
   * ni guide, ni translittération, ni texte non préparé, ni traduction des versets dans un bilan.
   */
  let { data } = $props();
  setContext('illustrations', () => data.illustrations);
  // audio des leçons (A3) : fichiers du niveau ; boutons « écouter » seulement là où un fichier existe
  let audio: LevelAudio | null = $state(null);
  setContext(AUDIO_CTX, () => audio);
  $effect(() => {
    const lv = data.unit.levelCode;
    void levelAudio(lv).then((a) => {
      if (data.unit.levelCode === lv) audio = a;
    });
  });

  const u = $derived(data.unit);
  /** lot F1 : édition du contenu affiché (accompagne chaque réponse et chaque signalement) */
  const edition = $derived(data.edition || u.edition || undefined);
  setContext(SIGNAL_CTX, () => ({ unitId: u.id, edition }));
  /** lot F1 (M1) : leçon ou blocs suspendus d'urgence (message neutre) */
  const suspendu = $derived((u.lesson as { _suspendu?: unknown })._suspendu);
  const masque = (x: unknown) => !!(x as { suspendu?: boolean } | null)?.suspendu;
  /** lot F1 (E5) : exercices dont le corrigé a changé depuis les réponses de l'élève (à refaire) */
  let revised: string[] = $state([]);
  /** leçons des sciences islamiques (Religion Enfants re, Ados/Adultes ra) : lecteur dédié */
  const religion = $derived(/^r[ea]\d/.test(u.levelCode));
  /** livrets « Lecture du Coran » (qc1 à qc3, lot 28) : lecteur dédié */
  const lectureCoran = $derived(isQuranReadingLevel(u.levelCode));
  const L = $derived(data.unit.lesson);
  const lettres = $derived(L.lettres ?? []);
  const isEval = $derived(u.kind !== 'lecon');
  const livreEx = $derived(
    (L.exercices ?? [])
      .map((ex, i) => ({ ex, i }))
      .filter((x) => x.ex.livre !== 'ecriture' && !masque(x.ex)),
  );
  const cahierEx = $derived(
    (L.exercices ?? [])
      .map((ex, i) => ({ ex, i }))
      .filter((x) => x.ex.livre === 'ecriture' && !masque(x.ex)),
  );
  type Obj = Record<string, unknown>;
  const R = $derived((L.lecture ?? {}) as Obj & NonNullable<typeof L.lecture>);
  type Phrase = { ar: string; fr?: string; verset_tanzil?: VerseMark };
  const phrases = $derived([
    ...((R.phrases ?? []) as Phrase[]),
    ...((R.paragraphes ?? []) as Array<string | Phrase>).map((p) =>
      typeof p === 'string' ? { ar: p } : p,
    ),
  ] as Phrase[]);
  const E = $derived((L.ecriture ?? {}) as Obj);
  const dialogue = $derived(L.dialogue as (Obj & NonNullable<typeof L.dialogue>) | undefined);
  const Q = $derived(L.coran as (Obj & NonNullable<typeof L.coran>) | undefined);
  const fiqh = $derived(
    L.fiqh_adab as
      | {
          titre_ar?: string;
          titre_fr?: string;
          points?: Array<{ ar?: string; fr?: string; verset_tanzil?: unknown }>;
        }
      | undefined,
  );
  const lexique = $derived(
    (L.lexique ?? []) as Array<{ ar: string; fr?: string; verset_tanzil?: unknown }>,
  );
  const oral = $derived((L.oral ?? []) as Array<{ fr?: string; points?: number }>);
  const checkItems = $derived(L.checklist ?? L.objectifs ?? []);

  // dialogue : côté (gauche/droite) par personnage, dans l'ordre d'apparition
  const sides = $derived.by(() => {
    const m: Record<string, number> = {};
    let n = 0;
    for (const r of dialogue?.repliques ?? []) if (r.qui && !(r.qui in m)) m[r.qui] = n++ % 2;
    return m;
  });

  // tentatives : profil actif du compte connecté (sans profil, les réponses ne sont pas enregistrées)
  let profileId: string | null = $state(null);
  let profileInfo: { id: string; kind: string; birthYear: number | null } | null = $state(null);
  // F5 : tuteur chargé À LA DEMANDE (il a besoin du réseau), seulement si l'interrupteur « tuteur » est ouvert
  let TutorPanel = $state<typeof import('$lib/TutorPanel.svelte').default | null>(null);
  // nouvelles tentatives automatiques, puis « Connexion nécessaire » à la place du tuteur (la leçon reste là)
  let tuteurEchec = $state(false);
  function chargerTuteur() {
    tuteurEchec = false;
    // textes du tuteur : dans `fr-rares` (en ligne seulement, comme le tuteur)
    void Promise.all([chargerModule(() => import('$lib/TutorPanel.svelte')), loadTexts('rares')])
      .then(([m]) => {
        TutorPanel = m.default;
        noter('tuteur');
      })
      .catch(() => (tuteurEchec = true));
  }
  $effect(() => {
    if (!fn('tuteur') || TutorPanel || untrack(() => tuteurEchec)) return;
    untrack(chargerTuteur);
  });
  /** mots de la leçon (bouton « Je ne comprends pas le mot… » du tuteur) */
  const lessonWords = $derived(
    ((L as unknown as { mots?: Array<{ ar?: string }> }).mots ?? [])
      .map((m) => (m.ar ?? '').replace(/[[\]]/g, ''))
      .filter(Boolean)
      .slice(0, 40),
  );
  let progress: { status: string; score: number | null; bestScore: number | null } | null =
    $state(null);
  /**
   * lot 10 : bouton « Voir / Cacher la traduction » (décision du client du 15/10) : français affiché par défaut, choix
   * mémorisé par profil. Il ne cache que la traduction des TEXTES et PHRASES arabes (texte de lecture, phrase vedette,
   * dialogue, sens des versets, points d'adab) ; consignes, explications de grammaire, mots et lexique restent en
   * français. Bilans et examens `sans_traduction` : la projection de l'élève a déjà retiré la traduction (pas de
   * bouton, rien à montrer).
   */
  // valeur relue quand le profil change ; le bouton la remplace (dérivé modifiable)
  let trad = $derived(traductionVisible(profileId));
  function basculerTrad() {
    trad = !trad;
    memoriserTraduction(profileId, trad);
  }
  onMount(() => {
    void demoProfileFor(u.levelCode).then(async (p) => {
      profileId = p?.id ?? null;
      profileInfo = p ? { id: p.id, kind: p.kind, birthYear: p.birthYear } : null;
      void flush();
      // lot F1 : exercices à refaire (corrigé changé dans une édition plus récente)
      if (p) {
        const r = await call<{ revised: string[] }>(
          'GET',
          `/progress/unit?profile=${p.id}&unit=${encodeURIComponent(u.id)}`,
        );
        if (r.ok && r.data) revised = r.data.revised;
      }
    });
    return onProgress((unitId, p) => {
      if (unitId !== u.id) return;
      progress = p;
      if (p.revised) revised = p.revised;
    });
  });
  function record(i: number, itemIndex: number, response: ItemResponse) {
    const meta = u.exercises[i];
    if (!profileId || !meta) return;
    enqueue({
      profileId,
      unitId: u.id,
      eventType: 'reponse',
      exerciseId: meta.id,
      exerciseHash: meta.hash,
      itemIndex,
      response,
      ...(edition ? { edition } : {}),
    });
  }
  // bilan (D7) : réponses recueillies sans corrigé, puis corrigées par le serveur
  let evalAnswers = $state<Record<string, Record<string, unknown>>>({});
  let evalResult = $state<{
    points: number;
    max: number;
    items: Record<string, Record<string, boolean>>;
  } | null>(null);
  let evalError = $state('');
  /** « relier » : position affichée → élément d'origine (même décalage que la projection) */
  function originalAnswers() {
    const out: Record<string, Record<string, unknown>> = {};
    for (const [eid, items] of Object.entries(evalAnswers)) {
      const ex = (L.exercices ?? [])[u.exercises.findIndex((e) => e.id === eid)] as
        { type?: string; gauche?: unknown[] } | undefined;
      if (ex?.type !== 'relier') {
        out[eid] = items;
        continue;
      }
      const n = ex.gauche?.length ?? 0;
      out[eid] = Object.fromEntries(
        Object.entries(items).map(([k, v]) => [
          k,
          { right: relierOriginal(n, (v as { right: number }).right) },
        ]),
      );
    }
    return out;
  }
  async function corrigerBilan() {
    evalError = '';
    const answers = originalAnswers();
    const r = await call<NonNullable<typeof evalResult>>('POST', `/units/${u.id}/corriger`, {
      answers,
    });
    if (!r.ok) {
      evalError = t(`erreur.${r.code ?? 'reseau'}`);
      return;
    }
    evalResult = r.data;
    // progression : les réponses passent par la file habituelle (le serveur recalcule tout)
    for (const [eid, items] of Object.entries(answers)) {
      const i = u.exercises.findIndex((e) => e.id === eid);
      for (const [k, v] of Object.entries(items)) record(i, Number(k), v as ItemResponse);
    }
  }
  function toggleReligion(done: number, total: number) {
    if (profileId)
      enqueue({
        profileId,
        unitId: u.id,
        eventType: 'checklist',
        response: { checked: done, total },
        ...(edition ? { edition } : {}),
      });
  }
  let checked: boolean[] = $state([]);
  const nChecked = $derived(checked.filter(Boolean).length);
  function toggle(i: number, v: boolean) {
    checked[i] = v;
    if (profileId)
      enqueue({
        profileId,
        unitId: u.id,
        eventType: 'checklist',
        response: { checked: checked.filter(Boolean).length, total: checkItems.length },
        ...(edition ? { edition } : {}),
      });
  }

  /**
   * D1 — leçon section par section : une section par écran, dans l'ordre du livre (aucun contenu retiré ni
   * déplacé : les sections absentes du livre sont sautées), barre d'avancement, « Suivant », sommaire. L'adulte
   * et l'enseignant peuvent tout voir d'un coup (choix gardé sur l'appareil). Les sections cachées restent
   * montées : une réponse commencée n'est jamais perdue en changeant d'écran.
   */
  type EtapeId =
    | 'decouvrir'
    | 'lire'
    | 'mots'
    | 'exercices'
    | 'parler'
    | 'lexique'
    | 'coran'
    | 'adab'
    | 'oral'
    | 'bilan'
    | 'ecrire';
  const etapes = $derived.by(() => {
    const s: EtapeId[] = ['decouvrir'];
    if (L.notion || R.syllabes || R.ligne || phrases.length || R.vedette || R.non_prepare)
      s.push('lire');
    if (L.mots?.length) s.push('mots');
    if (isEval && dialogue?.repliques?.length) s.push('parler');
    if (isEval && Q) s.push('coran');
    if (isEval && fiqh?.points?.length) s.push('adab');
    if (livreEx.length) s.push('exercices');
    if (!isEval && dialogue?.repliques?.length) s.push('parler');
    if (lexique.length) s.push('lexique');
    if (!isEval && Q) s.push('coran');
    if (!isEval && fiqh?.points?.length) s.push('adab');
    if (oral.length) s.push('oral');
    s.push('bilan');
    if (!isEval && (E.mots || E.lier || E.copie || E.production || cahierEx.length))
      s.push('ecrire');
    return s;
  });
  const TOUT_KEY = 'awzid.lecon.tout';
  let etape = $state(0);
  let tout = $state(false);
  let fini = $state(false);
  let sommaire = $state(false);
  let feuilles = $state<number | null>(null);
  let titreEtape: HTMLElement | undefined = $state();
  /** tout voir d'un coup : l'adulte et l'enseignant (sans profil d'élève) */
  const peutToutVoir = $derived.by(() => {
    const p = profileInfo as { kind: string } | null;
    return !p || p.kind === 'adulte';
  });
  const ici = $derived(etapes[Math.min(etape, etapes.length - 1)] ?? 'decouvrir');
  const voir = (id: EtapeId) => !fini && (tout || ici === id);
  onMount(() => {
    try {
      tout = localStorage.getItem(TOUT_KEY) === '1';
    } catch {
      /* stockage indisponible : section par section */
    }
  });
  // nouvelle leçon (lien d'une leçon à l'autre) : on repart du début
  $effect(() => {
    void u.id;
    untrack(() => {
      etape = 0;
      fini = false;
      sommaire = false;
    });
  });
  function aller(i: number) {
    etape = Math.max(0, Math.min(i, etapes.length - 1));
    sommaire = false;
    fini = false;
    // l'écran suivant commence en haut ; le lecteur d'écran annonce l'étape
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0 });
      titreEtape?.focus({ preventScroll: true });
    });
  }
  function basculerTout() {
    tout = !tout;
    sommaire = false;
    try {
      localStorage.setItem(TOUT_KEY, tout ? '1' : '0');
    } catch {
      /* choix non gardé */
    }
  }
  const lu = (k: string): number | null => {
    try {
      const v = localStorage.getItem(k);
      return v == null ? null : Number(v) || 0;
    } catch {
      return null;
    }
  };
  /** fin de leçon : « Continuer ma séance » est l'action principale s'il y a une séance, sinon le retour */
  let enSeance = $state(false);
  async function terminer() {
    enSeance = !!etapeSuivante('lecon');
    fini = true;
    sommaire = false;
    // la carte de fin (symbole, titre) commence sous la barre collante (scroll-margin-top de .fin)
    requestAnimationFrame(() =>
      document.querySelector('[data-testid="fin-lecon"]')?.scrollIntoView({ block: 'start' }),
    );
    // « Grandir » : l'arbre gagne tout de suite la feuille de cette leçon (affichage optimiste, dernier compte
    // connu sur l'appareil), puis le compte du serveur le remplace ; une leçon déjà comptée ne pousse pas deux fois
    if (!profileId) return;
    const cle = `awzid.arbre.${profileId}`;
    const dejaComptee = progress?.status === 'terminee' || progress?.status === 'maitrisee';
    const connu = lu(cle);
    feuilles = (connu ?? 0) + (dejaComptee ? 0 : 1);
    await flush().catch(() => {});
    const r = await call<{ jalons: { leconsTerminees: number } }>(
      'GET',
      `/today/${profileId}?today=${localIso()}`,
    ).catch(() => null);
    if (r?.ok && r.data) {
      const serveur = r.data.jalons.leconsTerminees;
      const finie = progress?.status === 'terminee' || progress?.status === 'maitrisee';
      // le serveur n'a peut-être pas encore recalculé la leçon : la feuille de cette leçon reste montrée
      feuilles = finie || dejaComptee ? serveur : Math.max(serveur, feuilles ?? 0, serveur + 1);
      try {
        localStorage.setItem(cle, String(serveur));
      } catch {
        /* compte non gardé */
      }
    }
  }
</script>

<svelte:head><title>{t('app.nom')} — {unitLabel(u)} · {u.titleFr}</title></svelte:head>

<Sprite illustrations={data.illustrations} />

{#if suspendu}<p class="card warnbox" role="status" data-testid="contenu-suspendu">
    <Bidi text={t(suspendu === 'unite' ? 'signal.suspendu_lecon' : 'signal.suspendu_bloc')} />
  </p>{/if}
{#if revised.length}<p class="card warnbox" role="status" data-testid="corrige-change">
    <Bidi
      text={t('signal.corrige_change', {
        n: revised.map((id) => u.exercises.findIndex((e) => e.id === id) + 1).join(', '),
      })}
    />
  </p>{/if}

{#if suspendu === 'unite'}
  <p class="nav">
    <a href={resolve('/niveaux/[code]', { code: u.levelCode })}
      ><Bidi text={t('lecon.retour', { level: u.levelCode })} /></a
    >
  </p>
{:else if lectureCoran}
  <CoranLesson unit={u} {progress} onChecklist={toggleReligion} />
{:else if religion}
  <ReligionLesson
    unit={u}
    {profileId}
    profileKind={profileInfo?.kind ?? null}
    {progress}
    onChecklist={toggleReligion}
  />
{:else}
  <article
    class="lesson"
    class:eval={isEval}
    style="--ar-size: {arabicSize(u.levelCode)}px"
    data-unit={u.id}
  >
    <p class="nav">
      <a href={resolve('/niveaux/[code]', { code: u.levelCode })}
        ><Bidi text={t('lecon.retour', { level: u.levelCode })} /></a
      >
    </p>
    {@render barreEtapes()}
    <div class="etape" data-etape="decouvrir" hidden={!voir('decouvrir')}>
      <header class="ltitle">
        <p class="num"><Bidi text={unitLabel(u)} /> · <Bidi text={u.titleFr} /></p>
        <h1 class="ar titre-page" lang="ar" dir="rtl">
          <Ar text={L.titre_ar} {lettres} />
          {#if lettres.length && !isEval}<span class="fam"
              >{#each lettres as x, i (i)}<span class="c{i % 4}"><Bidi text={x.l} base="ar" /></span
                >{/each}</span
            >{/if}
        </h1>
        {#if progress}<p class="prog" data-testid="progression">
            <Bidi text={t('lecon.progression', { statut: t(`statut.${progress.status}`) })} /><Bidi
              text={progress.bestScore != null &&
              profileInfo &&
              showsScore(profileInfo.id, profileInfo.kind)
                ? ` · ${fmtNumber(progress.bestScore, { style: 'percent' })}`
                : ''}
            />
          </p>{/if}
      </header>

      {#if isEval && lettres.length}
        <p class="readline big" dir="rtl">
          {#each lettres as x, i (i)}<span class="c{i % 4}"><Bidi text={x.l} base="ar" /></span
            >{/each}
        </p>
      {/if}

      {#if L.scene}
        <Scene spec={L.scene as SceneSpec} {lettres} />
        {#if (L.scene as SceneSpec).bulle_fr}<p class="bulle fr">
            « <Bidi text={(L.scene as SceneSpec).bulle_fr} /> »
          </p>{/if}
      {/if}

      {#if L.objectifs?.length && !isEval}
        <div class="goal">
          <svg viewBox="0 0 40 40" aria-hidden="true"
            ><circle cx="20" cy="20" r="18" fill="#E5484D" /><circle
              cx="20"
              cy="20"
              r="12"
              fill="#fff"
            /><circle cx="20" cy="20" r="6" fill="#E5484D" /></svg
          >
          <div>
            <Ar text={'هَدَفِي: ' + L.objectifs[0]!.ar} {lettres} />
            <p class="fr"><Bidi text={t('lecon.objectif', { texte: L.objectifs[0]!.fr })} /></p>
          </div>
        </div>
      {/if}

      {#if !isEval}
        <LettresLecon
          {lettres}
          decouvreAr={L.decouvre_ar as string | undefined}
          decouvreFr={L.decouvre_fr as string | undefined}
        />
      {/if}
    </div>

    {#if L.notion || R.syllabes || R.ligne || phrases.length || R.vedette || R.non_prepare}
      <section class="blk etape" data-etape="lire" hidden={!voir('lire')}>
        {#if L.notion}
          {@const N = L.notion as {
            titre_ar?: string;
            titre_fr?: string;
            signe?: string;
            texte_ar?: string;
            texte_fr?: string;
          }}
          <h2>
            <Ar text={N.titre_ar ?? 'أَقْرَأُ'} />
            <span><Bidi text={N.titre_fr ?? t('lecon.je_lis')} /></span>
          </h2>
          <div class="notion">
            {#if N.signe}<span class="mk ar" lang="ar"><Bidi text={N.signe} base="ar" /></span>{/if}
            {#if N.texte_ar}<Ar text={N.texte_ar} {lettres} /><Ecouter text={N.texte_ar} />{/if}
            {#if N.texte_fr}<p class="fr"><Bidi text={N.texte_fr} /></p>{/if}
          </div>
        {:else}
          <h2>
            <Ar text="أَقْرَأُ" />
            <span><Bidi text={isEval ? t('lecon.je_relis') : t('lecon.je_lis')} /></span>
          </h2>
        {/if}
        {@render boutonTrad(!R.non_prepare && (!!R.vedette?.fr || phrases.some((p) => !!p.fr)))}
        {#if R.syllabes?.length}
          <div class="syl" dir="rtl">
            {#each R.syllabes as s, i (i)}<span class="sylc"
                ><Ar text={s.ar} {lettres} /><Ecouter text={s.ar} /></span
              >{/each}
          </div>
        {/if}
        {#if R.ligne?.length}
          <p class="hint fr">
            <Bidi
              text={R.vedette && !R.non_prepare ? t('lecon.ligne_vedette') : t('lecon.ligne')}
            />
          </p>
          <p class="readline" dir="rtl">
            {#each R.ligne as w, i (i)}<span><Ar text={w} {lettres} /></span>{/each}
            {#if R.vedette && !R.non_prepare}<span class="star-word"
                ><Ar text={R.vedette.ar} {lettres} /></span
              >{/if}
          </p>
        {/if}
        {#if R.non_prepare}
          <div class="np-box" data-testid="non-prepare">
            <b class="fr">{t('lecon.non_prepare')}</b>
            <Ar text="نَصٌّ يُوَزِّعُهُ الْمُعَلِّمُ يَوْمَ الِاخْتِبَارِ" />
          </div>
        {:else}
          {#if R.vedette}
            {@const vt = (R.vedette as { verset_tanzil?: unknown }).verset_tanzil}
            <div class="note">
              <ArFr
                ar={R.vedette.ar}
                fr={R.vedette.fr && trad ? `« ${R.vedette.fr} »` : ''}
                verset={vt}
                {lettres}
                stack
              />{#if !vt}<Ecouter text={R.vedette.ar} />{/if}
              {#if R.vedette.note_fr}<p class="fr"><Bidi text={R.vedette.note_fr} /></p>{/if}
            </div>
          {/if}
          {#each phrases as p, i (i)}
            <div class="phrase">
              <ArFr
                ar={p.ar}
                fr={trad ? (p.fr ?? '') : ''}
                verset={p.verset_tanzil}
                {lettres}
                stack
              />
              {#if !p.verset_tanzil}<Ecouter text={p.ar} />{/if}
            </div>
          {/each}
        {/if}
      </section>
    {/if}

    {#if L.mots?.length}
      <section class="blk etape" data-etape="mots" hidden={!voir('mots')}>
        <h2><Ar text="أَسْمَعُ وَأُرَدِّدُ" /> <span>{t('lecon.ecoute_repete')}</span></h2>
        <p class="hint fr">
          <Bidi text={(L.mots_fr as string) ?? t('lecon.mots_consigne')} />
        </p>
        <div class="words">
          {#each L.mots as w, i (i)}
            <div class="wc">
              <Illus k={w.img} label={w.fr} />
              <Ar text={w.ar} {lettres} /><Ecouter text={w.ar} />
              <span class="fr"><Bidi text={w.fr} /></span>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    {#if isEval && dialogue?.repliques?.length}
      <div class="etape" data-etape="parler" hidden={!voir('parler')}>{@render dlg()}</div>
    {/if}
    {#if isEval && Q}
      <div class="etape" data-etape="coran" hidden={!voir('coran')}>{@render coran()}</div>
    {/if}
    {#if isEval && fiqh?.points?.length}
      <div class="etape" data-etape="adab" hidden={!voir('adab')}>{@render fiqhBlock()}</div>
    {/if}

    {#if livreEx.length}
      <section class="blk etape" data-etape="exercices" hidden={!voir('exercices')}>
        <h2>
          <Ar text={isEval ? 'حَصِيلَةٌ' : 'أَتَدَرَّبُ'} />
          <span><Bidi text={isEval ? t('lecon.mes_exercices') : t('lecon.entraine')} /></span>
        </h2>
        {#if u.kind === 'examen'}
          <p class="card" data-testid="examen-note">{t('lecon.examen_note_seulement')}</p>
        {:else if isEval}
          <!-- D7 : bilan sans corrigé sur l'appareil ; le serveur corrige, item par item -->
          {#each livreEx as { ex, i } (i)}
            {@const eid = u.exercises[i]?.id ?? `${u.id}.ex${i + 1}`}
            <ExamExercise
              ex={ex as unknown as Record<string, unknown>}
              n={i + 1}
              bind:value={
                () => evalAnswers[eid] ?? {}, (v) => (evalAnswers = { ...evalAnswers, [eid]: v })
              }
            />
            {#if evalResult?.items[eid]}
              {@const r = Object.values(evalResult.items[eid]!)}
              <p class="muted" data-testid="resultat-exercice">
                <Bidi
                  text={t('lecon.bilan_resultat', { ok: r.filter(Boolean).length, n: r.length })}
                />
              </p>
            {/if}
          {/each}
          <button type="button" class="primary" onclick={corrigerBilan} data-testid="corriger-bilan"
            >{t('lecon.bilan_corriger')}</button
          >
          {#if evalResult}<p class="card" role="status">
              <Bidi
                text={t('lecon.bilan_total', { points: evalResult.points, max: evalResult.max })}
              />
            </p>{/if}
          {#if evalError}<p class="retry" role="alert"><Bidi text={evalError} /></p>{/if}
        {:else}
          {#each livreEx as { ex, i } (i)}
            <Exercise
              {ex}
              id={u.exercises[i]?.id ?? `${u.id}.ex${i + 1}`}
              {lettres}
              onanswer={(k, r) => record(i, k, r)}
            />
            <Signaler
              kind="exercice"
              path={`ex:${u.exercises[i]?.id ?? ''}`}
              excerpt={ex.consigne_fr ?? ''}
            />
          {/each}
        {/if}
      </section>
    {/if}

    {#if !isEval && dialogue?.repliques?.length}
      <div class="etape" data-etape="parler" hidden={!voir('parler')}>{@render dlg()}</div>
    {/if}

    {#if lexique.length}
      <section class="blk etape" data-etape="lexique" hidden={!voir('lexique')}>
        <h2><Ar text="مُعْجَمُ الدَّرْسِ" /> <span>{t('lecon.lexique')}</span></h2>
        <div class="lex">
          {#each lexique as x, i (i)}<div>
              <ArFr ar={x.ar} fr={x.fr ?? ''} verset={x.verset_tanzil} />
            </div>{/each}
        </div>
      </section>
    {/if}

    {#if !isEval && Q}
      <div class="etape" data-etape="coran" hidden={!voir('coran')}>{@render coran()}</div>
    {/if}
    {#if !isEval && fiqh?.points?.length}
      <div class="etape" data-etape="adab" hidden={!voir('adab')}>{@render fiqhBlock()}</div>
    {/if}

    {#if oral.length}
      <section class="blk etape" data-etape="oral" hidden={!voir('oral')}>
        <h2><Ar text="الِاخْتِبَارُ الشَّفَهِيُّ" /> <span>{t('lecon.oral')}</span></h2>
        <ol>
          {#each oral as o, i (i)}<li>
              <span class="fr"><Bidi text={o.fr} /></span>{#if o.points != null}
                <b><Bidi text={t('lecon.points', { n: o.points })} /></b>{/if}
            </li>{/each}
        </ol>
      </section>
    {/if}

    <section class="blk recap etape" data-etape="bilan" hidden={!voir('bilan')}>
      <h2><Ar text="حَصِيلَتِي" /> <span>{t('lecon.mon_bilan')}</span></h2>
      {#if lettres.some((x) => x.points_ar)}
        <div class="memo">
          <h3><Ar text="أَتَذَكَّرُ" /> <span>{t('lecon.je_retiens')}</span></h3>
          {#each lettres as x, i (i)}
            <div class="row">
              <span class="l c{i % 4}" lang="ar"><Bidi text={x.l} base="ar" /></span
              >{#if x.points_ar}<Ar text={x.points_ar} />{/if}
              <span class="fr"><Bidi text={x.points_fr ?? ''} /></span>
            </div>
          {/each}
        </div>
      {:else if L.retiens?.length}
        <div class="memo">
          <h3><Ar text="أَتَذَكَّرُ" /> <span>{t('lecon.je_retiens')}</span></h3>
          {#each L.retiens as r, i (i)}<div class="row pt">
              <ArFr
                ar={r.ar}
                fr={r.fr}
                verset={(r as { verset_tanzil?: unknown }).verset_tanzil}
                stack
              />
            </div>{/each}
        </div>
      {/if}
      <div class="bravo">
        <div
          class="stars"
          aria-label={t('lecon.etoiles_aria', { n: nChecked, total: checkItems.length })}
        >
          {#each checkItems as _c, i (i)}<span class="star" class:lit={i < nChecked}>★</span>{/each}
        </div>
        <p class="fr" aria-live="polite">
          {#if nChecked === checkItems.length && checkItems.length}{t('lecon.bravo_termine')}
            <span class="ar" lang="ar">تَبَارَكَ اللَّهُ</span>{:else if nChecked}<Bidi
              text={t('lecon.continue', {
                n: nChecked,
                total: checkItems.length,
              })}
            />{:else}{t('lecon.coche')}{/if}
        </p>
      </div>
      <div class="check">
        {#each checkItems as c, i (i)}
          <label>
            <input
              type="checkbox"
              checked={checked[i] ?? false}
              onchange={(e) => toggle(i, e.currentTarget.checked)}
            />
            <span
              ><Ar text={'أَنَا أَسْتَطِيعُ: ' + c.ar} />
              <span class="fr"><Bidi text={c.fr} /></span></span
            >
          </label>
        {/each}
      </div>
    </section>

    {#if !isEval && (E.mots || E.lier || E.copie || E.production || cahierEx.length)}
      <section class="blk cahier etape" data-etape="ecrire" hidden={!voir('ecrire')}>
        <h2><Ar text="أَكْتُبُ" /> <span>{t('lecon.cahier')}</span></h2>
        <p class="hint fr">
          {t('lecon.cahier_consigne')}
        </p>
        {#if lettres.length}
          <!-- eslint-disable svelte/no-navigation-without-resolve -- chemin résolu par resolve(), suivi d'un paramètre -->
          <p class="links">
            {#each lettres as x (x.l)}<a
                class="button"
                href={`${resolve('/ecriture')}?lettre=${encodeURIComponent(x.l)}`}
                data-testid="tracer-lettre"><Bidi text={t('lecon.tracer_lettre', { l: x.l })} /></a
              >{/each}
          </p>
          <!-- eslint-enable svelte/no-navigation-without-resolve -->
        {/if}
        {#if Array.isArray(E.mots) && E.mots.length}
          <h3>{t('lecon.ecris_mots')}</h3>
          <p class="trace" dir="rtl">
            {#each E.mots as m, i (i)}<span><Ar text={String(m)} {lettres} /></span>{/each}
          </p>
          <!-- eslint-disable svelte/no-navigation-without-resolve -- chemin résolu par resolve(), suivi d'un paramètre -->
          <p class="links">
            {#each E.mots as m, i (i)}<a
                class="button"
                href={`${resolve('/ecriture')}?mot=${encodeURIComponent(String(m).replace(/[[\]]/g, ''))}`}
                ><Bidi text={t('lecon.repasser_mot', { n: i + 1 })} /></a
              >{/each}
          </p>
          <!-- eslint-enable svelte/no-navigation-without-resolve -->
        {/if}
        {#if Array.isArray(E.lier) && E.lier.length}
          <h3>{t('lecon.relie_lettres')}</h3>
          <ul class="lier">
            {#each E.lier as x, i (i)}
              {@const lk = x as { lettres?: string[] }}
              <li dir="rtl">
                <span class="ar" lang="ar"
                  ><Bidi text={(lk.lettres ?? []).join(' + ')} base="ar" /></span
                >
              </li>
            {/each}
          </ul>
        {/if}
        {#if Array.isArray(E.copie) && E.copie.length}
          <h3>{t('lecon.recopie')}</h3>
          {#each E.copie as c, i (i)}<Ar tag="p" text={String(c)} {lettres} />{/each}
        {/if}
        {#if E.production}
          {@const P = E.production as {
            consigne_fr?: string;
            fr?: string;
            modele_ar?: string;
            ar?: string;
          }}
          <h3>{t('lecon.ecris_moi')}</h3>
          <p class="fr"><Bidi text={P.consigne_fr ?? P.fr ?? ''} /></p>
          {#if P.modele_ar ?? P.ar}<Ar tag="p" text={P.modele_ar ?? P.ar ?? ''} />{/if}
        {/if}
        <h3>{t('lecon.dictee')}</h3>
        <p class="fr">
          {t('lecon.dictee_consigne')}
        </p>
        {#each cahierEx as { ex, i } (i)}
          <Exercise
            {ex}
            id={u.exercises[i]?.id ?? `${u.id}.ex${i + 1}`}
            {lettres}
            onanswer={(k, r) => record(i, k, r)}
          />
        {/each}
      </section>
    {/if}
    <!-- A21 : leçons vivantes (animations après chaque partie, condensé ; chargées à la demande) -->
    <div class="etape" hidden={!voir(etapes[etapes.length - 1]!)}><VivanteLecon unit={u} /></div>
    {@render navEtapes()}
    {#if fini}{@render finLecon()}{/if}
  </article>
  {#if TutorPanel && fn('tuteur')}<TutorPanel
      unitId={u.id}
      profile={profileInfo}
      words={lessonWords}
    />{:else if tuteurEchec && fn('tuteur')}<ConnexionNecessaire onretry={chargerTuteur} />{/if}
{/if}
<!-- D1 : « Signaler une erreur » sur la leçon : à la dernière étape (ou leçon entière), pas au premier écran -->
{#if suspendu !== 'unite' && (religion || lectureCoran || tout || fini || ici === etapes.at(-1))}<p
    class="sig-lecon"
    data-testid="signaler-lecon"
  >
    <Signaler kind="lecon" excerpt={u.titleFr} />
  </p>{/if}
{#if audio?.fichiers.size}
  <p class="audio-credit fr" data-testid="audio-credit">
    <Bidi text={[t('audio.mention'), ...audio.credits].join(' · ')} />
  </p>
{/if}

{#snippet barreEtapes()}
  <!-- D1 : barre d'avancement de la leçon (Découvrir → … → Bilan, selon les sections du livre) -->
  <div class="etapes-barre" data-testid="etapes" data-tout={tout}>
    <p class="etape-nom" tabindex="-1" bind:this={titreEtape} aria-live="polite">
      {#if fini}<strong>{t('fin.titre')}</strong>
      {:else if tout}<strong>{t('etape.toute_lecon')}</strong>
      {:else}<span class="muted"
          ><Bidi text={t('etape.n_sur', { n: etape + 1, total: etapes.length })} /></span
        >
        ·
        <strong data-testid="etape-courante" data-etape={ici}
          ><Bidi text={t(`etape.${ici}`)} /></strong
        >{/if}
    </p>
    <button
      type="button"
      class="sommaire-btn"
      aria-expanded={sommaire}
      aria-controls="sommaire-lecon"
      onclick={() => (sommaire = !sommaire)}
      data-testid="sommaire"
      ><Icon name="grille" size={18} /><span>{t('etape.sommaire')}</span></button
    >
    {#if !tout}
      <ol class="segments" aria-hidden="true">
        {#each etapes as _e, i (i)}<li
            class:fait={fini || i < etape}
            class:ici={!fini && i === etape}
          ></li>{/each}
      </ol>
    {/if}
  </div>
  {#if sommaire}
    <nav
      class="sommaire"
      id="sommaire-lecon"
      aria-label={t('etape.aria')}
      data-testid="sommaire-liste"
    >
      <ol>
        {#each etapes as e, i (e + i)}
          <li>
            <button
              type="button"
              aria-current={!tout && !fini && i === etape ? 'step' : undefined}
              onclick={() => {
                if (tout) basculerTout();
                aller(i);
              }}
              data-aller={e}
              ><span class="num" aria-hidden="true"
                >{#if fini || i < etape}✓{:else}<Bidi text={i + 1} />{/if}</span
              ><span><Bidi text={t(`etape.${e}`)} /></span></button
            >
          </li>
        {/each}
      </ol>
      {#if peutToutVoir}
        <button type="button" class="bascule" onclick={basculerTout} data-testid="tout-voir"
          ><Bidi text={t(tout ? 'etape.par_etape' : 'etape.tout_voir')} /></button
        >
      {/if}
    </nav>
  {/if}
{/snippet}

{#snippet navEtapes()}
  {#if !fini}
    <div class="etapes-nav" data-testid="etapes-nav">
      {#if !tout && etape > 0}<button
          type="button"
          onclick={() => aller(etape - 1)}
          data-testid="etape-precedente">{t('etape.precedent')}</button
        >{/if}
      {#if !tout && etape < etapes.length - 1}
        <button
          type="button"
          class="primary"
          onclick={() => aller(etape + 1)}
          data-testid="etape-suivante"
          ><span>{t('etape.suivant')}</span><Icon name="fleche" size={20} /></button
        >
      {:else}
        <button type="button" class="primary" onclick={terminer} data-testid="terminer-lecon"
          >{t('etape.terminer')}</button
        >
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet finLecon()}
  <!-- D1 « Grandir » : la feuille du logo pousse, l'arbre de l'élève gagne une feuille (ni points ni classement) -->
  <section class="fin" data-testid="fin-lecon" aria-labelledby="fin-titre">
    <span class="pousse" aria-hidden="true"
      ><img src="/awzid-symbole.svg" alt="" width="62" height="80" class="clair" /><img
        src="/awzid-symbole-sombre.svg"
        alt=""
        width="62"
        height="80"
        class="sombre"
      /></span
    >
    <h2 id="fin-titre">{t('fin.titre')}</h2>
    {#if feuilles != null}
      <!-- étoile d'or : bilan réussi (au moins la moitié des points) -->
      <Arbre
        {feuilles}
        pousse
        etoile={isEval && !!evalResult && evalResult.points * 2 >= evalResult.max}
        taille={140}
      />
      <p class="muted"><Bidi text={t('fin.feuille')} /></p>
    {/if}
    <SeanceSuite ici="lecon" />
    <p class="fin-actions">
      <a
        class="button"
        class:primary={!enSeance}
        href={profileId ? resolve('/') : resolve('/niveaux/[code]', { code: u.levelCode })}
        data-testid="retour-lecons">{t('fin.retour')}</a
      >
      <button type="button" onclick={() => aller(0)}>{t('fin.revoir')}</button>
    </p>
  </section>
{/snippet}

{#snippet boutonTrad(utile: boolean)}
  {#if utile}<p class="bascule-trad">
      <BoutonTraduction visible={trad} onbasculer={basculerTrad} />
    </p>{/if}
{/snippet}

{#snippet dlg()}
  <section class="blk">
    <h2>
      <Ar text={dialogue?.titre_ar ?? 'أَتَكَلَّمُ'} />
      <span><Bidi text={dialogue?.titre_fr ?? t('lecon.je_parle')} /></span>
    </h2>
    <p class="hint fr">
      <Bidi text={(dialogue?.consigne_fr as string) ?? t('lecon.dialogue_consigne')} />
    </p>
    {@render boutonTrad((dialogue?.repliques ?? []).some((r) => !!r.fr))}
    {#if dialogue?.lieu}
      <Scene
        spec={{
          lieu: dialogue.lieu as string,
          persos: Object.keys(sides)
            .map(personaKey)
            .filter((k) => data.illustrations[k]),
          props: dialogue.props as string[] | undefined,
          alt_fr: dialogue.titre_fr,
        }}
        {lettres}
      />
    {/if}
    <div class="dlg">
      {#each dialogue?.repliques ?? [] as r, i (i)}
        <div class="line" class:r={sides[r.qui ?? ''] === 1}>
          <div class="av"><Illus k={personaKey(r.qui ?? '')} cls="avatar" /></div>
          <div class="bub">
            <div class="who">
              {#if r.qui_ar}<span class="ar" lang="ar"><Bidi text={r.qui_ar} base="ar" /></span> ·
              {/if}<Bidi text={r.qui} />
            </div>
            <Ar text={r.ar} {lettres} /><Ecouter text={r.ar} />
            {#if r.fr && trad}<p class="fr"><Bidi text={r.fr} /></p>{/if}
          </div>
        </div>
      {/each}
    </div>
    {#if dialogue?.note_ar || dialogue?.note_fr}
      <div class="note">
        <b>{t('lecon.je_retiens_deux_points')}</b>
        {#if dialogue.note_ar}<Ar text={dialogue.note_ar as string} />{/if}
        <span class="fr"><Bidi text={dialogue.note_fr ?? ''} /></span>
      </div>
    {/if}
    <!-- A26b : « Je parle », scénario guidé sans IA (écran et scénario chargés à la demande, hors ligne ensuite) -->
    {#if !isEval && profileId && fn('conversation') && aUnScenario(u.id)}<JeParleBouton
        unitId={u.id}
        {profileId}
      />{/if}
  </section>
{/snippet}

{#snippet coran()}
  <section class="blk quran">
    <h2>
      <Ar text={Q?.titre_ar ?? 'مِنَ الْقُرْآنِ'} />
      <span><Bidi text={Q?.titre_fr ?? t('lecon.coran')} /></span>
    </h2>
    {@render boutonTrad((Q?.versets ?? []).some((v) => !!v.fr && !masque(v) && !v.non_prepare))}
    {#each Q?.versets ?? [] as v, i (i)}
      {#if masque(v)}
        <p class="muted">{t('signal.suspendu_bloc')}</p>
      {:else if v.non_prepare}
        <div class="np-box" data-testid="non-prepare">
          <b class="fr">{t('lecon.non_prepare')}</b>
          <Ar text="نَصٌّ يُوَزِّعُهُ الْمُعَلِّمُ يَوْمَ الِاخْتِبَارِ" />
        </div>
      {:else}
        <div class="ayah" data-ref={v.ref_fr}>
          <Ar tag="p" quran text={v.ar} {lettres} />
          {#if v.fr && trad}<p class="fr sens"><Bidi text={v.fr} /></p>{/if}
          <div class="cap">
            <span class="ref"><Bidi text={v.ref_fr ?? ''} /></span>
            {#if v.consigne_fr}<span class="fr">— <Bidi text={v.consigne_fr} /></span>{/if}
            <!-- A3 : JAMAIS de synthèse sur un verset ; renvoi à la récitation du Complexe -->
            <!-- eslint-disable svelte/no-navigation-without-resolve -- chemin résolu, suivi d'un paramètre -->
            {#if recitationQuery(v.ref_fr)}<a
                class="rec-link"
                data-testid="ecouter-recitation"
                href={`${resolve('/coran/ecouter')}${recitationQuery(v.ref_fr)}`}
                >{t('audio.recitation')}</a
              >{/if}
            <!-- eslint-enable svelte/no-navigation-without-resolve -->
            <Signaler
              kind="verset"
              path={`coran.versets.${i}`}
              block={v}
              ref={v.ref_fr ?? ''}
              excerpt={v.ar}
            />
          </div>
        </div>
      {/if}
    {/each}
    {#if Q?.mots?.length}
      <div class="qwords">
        {#each Q.mots as m, i (i)}<div>
            <Ar text={m.ar} />
            <span class="fr"
              >« <Bidi text={m.fr} /> »<Bidi text={m.ref ? ` (${m.ref})` : ''} /></span
            >
          </div>{/each}
      </div>
    {/if}
    {#if Q?.tajwid}
      <div class="tajwid">
        <b
          ><Bidi
            text={t('lecon.tajwid_titre', { titre: Q.tajwid.titre_fr ?? t('lecon.tajwid') })}
          /></b
        >
        <span class="fr"><Bidi text={Q.tajwid.texte_fr ?? ''} /></span>
        {#if Q.tajwid.exemple_ar}<Ar quran text={Q.tajwid.exemple_ar} {lettres} />{/if}
      </div>
    {/if}
  </section>
{/snippet}

{#snippet fiqhBlock()}
  <section class="blk fiqh">
    <h2>
      <Ar text={fiqh?.titre_ar ?? 'آدَابِي'} />
      <span><Bidi text={fiqh?.titre_fr ?? t('lecon.adab')} /></span>
    </h2>
    {@render boutonTrad((fiqh?.points ?? []).some((p) => !!p.fr && !!p.ar))}
    <ul>
      {#each fiqh?.points ?? [] as p, i (i)}<li class="pt">
          <!-- verset (texte Tanzil exact) : bloc de verset ; hadith, phrase : l'arabe sur sa ligne, le français dessous -->
          <!-- lot 10 : un point sans arabe est une explication : toujours en français -->
          <ArFr
            ar={p.ar ?? ''}
            fr={trad || !p.ar ? (p.fr ?? '') : ''}
            verset={p.verset_tanzil}
            stack
          />
        </li>{/each}
    </ul>
    <!-- lot F1 (G2) : école juridique, étiquette posée à l'import (le texte du livre est inchangé) -->
    {#if u.madhhab?.fiqh_adab}<p class="muted" data-testid="madhhab">
        <Bidi text={t(`madhhab.${u.madhhab.fiqh_adab}`)} />
      </p>{/if}
    <Signaler kind="fiqh" path="fiqh_adab" block={L.fiqh_adab} excerpt={fiqh?.titre_fr ?? ''} />
  </section>
{/snippet}

<style>
  /* lot 10 : bouton « Voir / Cacher la traduction » */
  .bascule-trad {
    margin: 0 0 var(--space-s);
    display: flex;
    justify-content: flex-end;
  }
  /* D1 : leçon section par section */
  .etapes-barre {
    position: sticky;
    top: 60px;
    z-index: 5;
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 6px 10px;
    padding: 8px 0;
    background: var(--paper);
    border-bottom: 1px solid var(--line);
  }
  .etape-nom {
    margin: 0;
    font-family: var(--font-title);
    min-width: 0;
  }
  .etape-nom:focus {
    outline: none;
  }
  .sommaire-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 12px;
    border-radius: var(--radius-pill);
    font-weight: 600;
  }
  .segments {
    grid-column: 1 / -1;
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    gap: 4px;
  }
  .segments li {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: var(--line);
    transition: background var(--motion-fast) ease;
  }
  .segments li.fait {
    background: var(--primary);
  }
  .segments li.ici {
    background: var(--gold);
  }
  .sommaire {
    margin: 8px 0;
    padding: 8px;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--card);
    box-shadow: var(--shadow-card);
  }
  .sommaire ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  .sommaire li button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 48px;
    padding: 0 10px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--ink);
    text-align: start;
    font: inherit;
  }
  .sommaire li button[aria-current='step'] {
    background: var(--primary-soft);
    color: var(--primary);
    font-weight: 700;
  }
  .sommaire .num {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1.5px solid currentColor;
    font-size: 0.85rem;
    flex: none;
  }
  .bascule {
    margin-top: 8px;
    width: 100%;
    min-height: 48px;
  }
  .etapes-nav {
    display: flex;
    gap: 10px;
    justify-content: space-between;
    margin: 24px 0 8px;
  }
  .etapes-nav button {
    min-height: 56px;
    padding: 0 20px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .etapes-nav .primary {
    margin-inline-start: auto;
    flex: 1 1 auto;
    justify-content: center;
    font-size: 1.05rem;
  }
  :global([dir='rtl']) .etapes-nav .primary :global(svg) {
    transform: scaleX(-1);
  }
  .fin {
    scroll-margin-top: 150px;
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 8px;
    padding: 24px 16px;
    margin: 16px 0;
    border-radius: var(--radius-lg);
    border: 1px solid var(--line);
    border-top: 3px solid var(--gold);
    background: var(--card);
    box-shadow: var(--shadow-card);
  }
  .fin h2 {
    border: 0;
    margin: 0;
    font-size: 1.5rem;
  }
  .pousse {
    display: inline-flex;
    transform-origin: 50% 100%;
    animation: pousse 700ms cubic-bezier(0.2, 0.8, 0.3, 1.15) both;
  }
  .pousse .clair {
    display: var(--mp-clair, block);
  }
  .pousse .sombre {
    display: var(--mp-sombre, none);
  }
  @keyframes pousse {
    from {
      transform: scale(0.55);
      opacity: 0.4;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .pousse {
      animation: none;
    }
    .segments li {
      transition: none;
    }
  }
  .fin-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
  }
  .fin-actions > * {
    min-height: 48px;
    display: inline-flex;
    align-items: center;
  }
  .nav {
    margin: 0 0 4px;
  }
  .num {
    color: var(--teal);
    font-weight: 700;
    margin: 0;
  }
  h1 {
    margin: 4px 0;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: baseline;
  }
  .fam {
    font-family: 'Noto Naskh Arabic', serif;
    display: inline-flex;
    gap: 10px;
  }
  .prog {
    display: inline-block;
    background: var(--ok-bg);
    color: var(--ok-ink);
    border-radius: 99px;
    padding: 2px 12px;
    font-weight: 700;
    margin: 4px 0;
  }
  h2 {
    font-size: 1.1rem;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    align-items: baseline;
    /* refonte 16/10 : petit liseré doré au lieu d'un trait gris */
    background: linear-gradient(var(--gold), var(--gold)) no-repeat 0 100% / 2.5rem 3px;
    padding-bottom: 8px;
    margin: 32px 0 12px;
  }
  h3 {
    font-size: 1rem;
    margin: 14px 0 6px;
  }
  .fr {
    color: var(--ink2);
  }
  .hint {
    font-size: 0.92rem;
    margin: 4px 0;
  }
  .bulle {
    text-align: center;
    margin: 0;
    font-size: 0.92rem;
  }
  .goal {
    display: flex;
    gap: 12px;
    align-items: center;
    background: color-mix(in srgb, var(--c0) 6%, var(--card));
    border: 2px solid color-mix(in srgb, var(--c0) 35%, var(--card));
    border-radius: 16px;
    padding: 8px 14px;
    margin: 12px 0;
  }
  .goal svg {
    width: 36px;
    height: 36px;
    flex: none;
  }
  .goal p {
    margin: 0;
  }
  .letters {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    direction: rtl;
  }
  .fcard {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    background: var(--card);
    border: 3px solid var(--line);
    border-radius: 18px;
    padding: 8px 18px;
    direction: ltr;
    min-width: 130px;
  }
  .b0 {
    border-color: color-mix(in srgb, var(--c0) 35%, var(--card));
  }
  .b1 {
    border-color: color-mix(in srgb, var(--c1) 35%, var(--card));
  }
  .b2 {
    border-color: color-mix(in srgb, var(--c2) 35%, var(--card));
  }
  .b3 {
    border-color: color-mix(in srgb, var(--c3) 35%, var(--card));
  }
  .pos {
    position: absolute;
    top: 4px;
    inset-inline-start: 8px;
    font-size: 0.8rem;
    color: var(--ink2);
  }
  .big {
    font-family: 'Noto Naskh Arabic', serif;
    font-size: calc(var(--ar-size) * 2.4);
    line-height: 1.3;
    text-decoration: none;
  }
  .dots {
    font-size: calc(var(--ar-size) * 0.7);
  }
  .tw {
    overflow-x: auto;
  }
  .forms {
    border-collapse: collapse;
    width: 100%;
  }
  .syl {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .sylc {
    border: 2px solid var(--line);
    border-radius: 12px;
    padding: 0 12px;
    background: var(--card);
  }
  .readline {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    background: var(--card);
    border: 2px solid var(--line);
    border-radius: 14px;
    padding: 6px 14px;
  }
  .readline.big {
    font-family: 'Noto Naskh Arabic', serif;
    font-size: 44px;
  }
  .star-word {
    border: 3px solid var(--gold);
    border-radius: 10px;
    padding: 0 8px;
    background: var(--warn-bg);
  }
  .note,
  .notion {
    background: var(--sand);
    border-radius: 12px;
    padding: 8px 12px;
    margin: 8px 0;
  }
  .mk {
    font-size: calc(var(--ar-size) * 1.6);
    margin-inline-end: 10px;
  }
  .phrase {
    text-align: right;
    margin: 6px 0;
  }
  .phrase p {
    margin: 0;
  }
  .phrase .fr {
    text-align: left;
    font-size: 0.9rem;
  }
  .np-box {
    border: 3px dashed var(--c3);
    background: var(--warn-bg);
    border-radius: 14px;
    padding: 12px;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .words {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 10px;
  }
  .wc {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    padding: 8px;
    text-align: center;
  }
  .wc :global(.pic) {
    width: 84px;
    height: 84px;
  }
  .dlg {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .line {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .line.r {
    flex-direction: row-reverse;
  }
  .av :global(.avatar) {
    width: 56px;
    height: 72px;
  }
  .bub {
    background: var(--card);
    border: 2px solid var(--line);
    border-radius: 16px;
    padding: 6px 12px;
    flex: 1;
    text-align: right;
  }
  .bub .fr {
    text-align: left;
    margin: 2px 0 0;
    font-size: 0.9rem;
  }
  .who {
    font-size: 0.85rem;
    color: var(--teal);
    font-weight: 700;
    text-align: left;
  }
  .audio-credit {
    margin: 12px 16px;
    font-size: 13px;
    color: var(--ink2);
    text-align: center;
  }
  .rec-link {
    font-weight: 700;
    color: var(--teal);
  }
  .quran {
    background: linear-gradient(var(--surface), var(--card));
    border-radius: 18px;
    padding: 4px 12px 12px;
  }
  .ayah {
    margin: 12px 0;
    padding: 10px 16px;
    background: var(--card);
    border-inline-start: 4px solid var(--navy);
    border-radius: 12px;
    text-align: right;
  }
  .ayah p {
    margin: 0;
  }
  .ayah .sens {
    text-align: left;
    font-size: 0.95rem;
  }
  .cap {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 0.88rem;
  }
  .ref {
    font-weight: 700;
    color: var(--navy);
  }
  .qwords {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 6px;
  }
  .tajwid {
    background: var(--card);
    border: 2px dashed color-mix(in srgb, var(--c1) 35%, var(--card));
    border-radius: 12px;
    padding: 8px 12px;
    margin-top: 8px;
  }
  .fiqh ul {
    list-style: none;
    padding: 0;
  }
  /* points sans puce, séparés par un filet discret */
  .pt {
    padding-block: 8px;
    border-top: 1px solid var(--line);
  }
  .memo .row {
    display: flex;
    gap: 10px;
    align-items: baseline;
    flex-wrap: wrap;
  }
  .memo .l {
    font-family: 'Noto Naskh Arabic', serif;
    font-size: calc(var(--ar-size) * 1.4);
    text-decoration: none;
  }
  .bravo {
    text-align: center;
  }
  .stars {
    font-size: 2rem;
    letter-spacing: 6px;
  }
  .star {
    color: var(--line);
  }
  .star.lit {
    color: var(--gold);
  }
  .check label {
    /* audit A11Y-1 : toute la ligne est la cible tactile (48 px), la case suit */
    min-height: 48px;
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 8px;
    border: 2px solid var(--line);
    border-radius: 12px;
    margin: 6px 0;
    background: var(--card);
  }
  .check input {
    width: 28px;
    height: 28px;
    flex: none;
  }
  .trace {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 24px;
    font-size: calc(var(--ar-size) + 8px);
  }
  .lex {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 6px;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>
