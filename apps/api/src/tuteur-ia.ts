/**
 * TUTEUR IA DE CONVERSATION (19/10/2026, docs/projet/TUTEUR_IA.md) — trois étages, le local d'abord.
 *
 *  Étage 1 « guidée » (POST /api/v1/tuteur-ia/:id/guidee) : l'élève dit (ou écrit) sa réplique du dialogue de la
 *    leçon ; l'IA LOCALE (service ecoute-ia, voix jamais conservée) transcrit ; on compare à la réplique du livre.
 *    Aucun modèle de langage. Ouvert à tous, seul mode des enfants. Voix : accord « analyse vocale par IA ».
 *  Étage 2 « libre » (POST /api/v1/tuteur-ia/:id/libre) : Gemini (Vertex AI, UE), vocabulaire du niveau. Ados
 *    (accord parental « tuteur_ia » OBLIGATOIRE avant tout appel) et adultes, à partir du niveau 2.
 *  Étage 3 (révision religion et Madjaliss sur nos contenus audités) : décrit dans TUTEUR_IA.md, non codé.
 *
 * Règles tenues ici : aucune réponse religieuse (question religieuse écrite → renvoi SANS appel au modèle ;
 * réponse du modèle filtrée) ; jamais de Coran généré ni lu par la voix ; plafonds par élève et globaux avec
 * réservation du pire cas (aucun dépassement) ; disjoncteur AWFORM_COUTS_COUPES ; journal minimal (`tutor_log`,
 * 90 jours) ; jamais d'audio conservé.
 */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  accessFor,
  allVerses,
  createTutorAlert,
  currentLevelOf,
  etatDepense,
  getUnitForStudent,
  listUnits,
  logTutor,
  moisCle,
  noterSeuils,
  reserverDepense,
  schema as t,
  solderDepense,
  type Db,
} from '@awform/db';
import {
  classerEntree,
  comparerReplique,
  completerTranscription,
  coutMaxPrononciation,
  coutMaxTour,
  coutMicros,
  decider,
  helpline,
  issueDuTour,
  issuePrononciation,
  prononInvite,
  motifProtection,
  motsEcrits,
  plafondsDepuisEnv,
  PROMPT_VERSION,
  QuranIndex,
  secondesTour,
  seuilsFranchis,
  setupConversation,
  systemPrompt,
  voixPermise,
  AUDIO_MAX_S,
  HISTORIQUE_MAX,
  TEXTE_MAX,
  type Adresse,
  type Audience,
  type ConseilEcoute,
  type ConvContexte,
  type ConvSetup,
  type FilterEvent,
  type Genre,
  type MotNiveau,
  type RemarquePrononciation,
} from '@awform/tutor';
import type { ContentRights } from './billing.js';
import { conversationDir } from './conversation.js';
import {
  clientEcouteDepuisEnv,
  consentementAnalyseVocale,
  coutsCoupes,
  type ClientEcoute,
} from './ecoute-ia.js';
import { exigeFonction } from './f5.js';
import { err, familyProfile } from './guards.js';
import type { Edition } from './routes-common.js';

const UUID = { type: 'string', format: 'uuid' } as const;
const UNITE = '^(en|ado|ad)[0-9]{1,2}\\.l[0-9]{2}$';
const MIMES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac'];
/** 20 s d'audio compressé (Safari : AAC) tiennent largement dans 700 Ko de base64 */
const AUDIO_B64_MAX = 700_000;
const AUDIO_SCHEMA = {
  type: 'object',
  required: ['mime', 'b64', 'secondes'],
  additionalProperties: false,
  properties: {
    mime: { type: 'string', maxLength: 60, pattern: '^audio/[a-z0-9.+-]+(;[ a-z0-9=.,+-]*)?$' },
    b64: { type: 'string', maxLength: AUDIO_B64_MAX, pattern: '^[A-Za-z0-9+/=]+$' },
    secondes: { type: 'number', minimum: 0.2, maximum: AUDIO_MAX_S },
  },
} as const;
/** guidée : réplique de 15 s au plus, 120 essais par heure et par profil (calcul partagé de l'écoute) */
const GUIDEE_MAX_S = 15;
const GUIDEE_PAR_HEURE = 120;

interface Audio {
  mime: string;
  b64: string;
  secondes: number;
}
/** Ce que l'écran reçoit pour la prononciation : remarque vérifiée OU conseil d'écoute, et leur voix. */
interface ResultatPrononciation {
  remarque: RemarquePrononciation | null;
  conseil: ConseilEcoute | null;
  audio: { mime: string; b64: string } | null;
}
interface Scenario {
  niveau: string;
  lecon: string;
  titre_fr?: string;
  scene?: { lieu?: string };
  tours: Array<
    | { t: 'partenaire'; qui: string; ar: string; fr?: string }
    | { t: 'eleve'; qui: string; choix: Array<{ ar: string; fr?: string; kind: string }> }
  >;
}

export interface OptionsTuteurIa {
  setup?: ConvSetup;
  /** service d'écoute (étage 1) ; undefined : AWFORM_ECOUTE_URL */
  ecoute?: ClientEcoute | null;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
}

const niveauNum = (code: string) => Number(/(\d+)$/.exec(code)?.[1] ?? 0);

export function registerTuteurIa(
  app: FastifyInstance,
  db: Db,
  edition: Edition,
  rights: ContentRights,
  opts: OptionsTuteurIa = {},
): void {
  const env = opts.env ?? process.env;
  const ecoute = opts.ecoute === undefined ? clientEcouteDepuisEnv() : opts.ecoute;
  const setup = opts.setup ?? setupConversation(env);
  const now = opts.now ?? (() => new Date());
  const fournisseurNom = setup.fournisseur?.name ?? 'aucun';
  let quran: QuranIndex | null = null;
  const contextes = new Map<string, Promise<ConvContexte | null>>();
  const essais = new Map<string, number[]>();
  /** appels de prononciation en cours ou finis, lus UNE fois par l'écran (mémoire seulement, 60 s) */
  const prononciations = new Map<
    string,
    { profileId: string; travail: Promise<ResultatPrononciation | null>; fin: number }
  >();

  if (setup.bloque) app.log.warn({ evenement: 'tuteur_ia_bloque', motif: setup.bloque });

  const index = async () => (quran ??= new QuranIndex(await allVerses(db)));

  async function lireScenario(unitId: string): Promise<Scenario | null> {
    const [lv, lecon] = unitId.split('.') as [string, string];
    try {
      return JSON.parse(
        await readFile(join(conversationDir(), lv, `${lecon}.json`), 'utf8'),
      ) as Scenario;
    } catch {
      return null;
    }
  }

  /** Mots déjà vus : leçons du niveau jusqu'à celle-ci et niveaux précédents de la filière (livres). */
  async function motsVus(editionId: string, niveau: string, lecon: number): Promise<MotNiveau[]> {
    const prefixe = niveau.replace(/\d+$/, '');
    const n = niveauNum(niveau);
    const out: MotNiveau[] = [];
    const vus = new Set<string>();
    for (let k = n; k >= 1 && out.length < 450; k--) {
      const code = `${prefixe}${k}`;
      for (const u of (await listUnits(db, editionId, code)).reverse()) {
        if (k === n && (u.numLecon ?? u.n) > lecon) continue;
        const full = await getUnitForStudent(db, editionId, u.id);
        const mots = (full?.lesson as { mots?: unknown } | undefined)?.mots;
        if (!Array.isArray(mots)) continue;
        for (const m of mots as Array<Record<string, unknown>>) {
          const ar = typeof m?.ar === 'string' ? m.ar : '';
          if (!ar || vus.has(ar)) continue;
          vus.add(ar);
          out.push({ ar, ...(typeof m.fr === 'string' && m.fr ? { fr: m.fr } : {}) });
          if (out.length >= 450) break;
        }
      }
    }
    return out;
  }

  function contexte(editionId: string, unitId: string): Promise<ConvContexte | null> {
    const cle = `${editionId}|${unitId}`;
    let p = contextes.get(cle);
    if (!p) {
      p = (async () => {
        const s = await lireScenario(unitId);
        if (!s) return null;
        const lecon = Number(s.lecon.replace(/^l/, ''));
        const dialogue = s.tours.map((x) =>
          x.t === 'partenaire'
            ? { qui: x.qui, ar: x.ar, ...(x.fr ? { fr: x.fr } : {}) }
            : (() => {
                const b = x.choix.find((c) => c.kind === 'bonne')!;
                return { qui: x.qui, ar: b.ar, ...(b.fr ? { fr: b.fr } : {}) };
              })(),
        );
        return {
          unitId,
          niveau: s.niveau,
          lecon,
          ...(s.titre_fr ? { titreFr: s.titre_fr } : {}),
          ...(s.scene?.lieu ? { lieu: s.scene.lieu } : {}),
          dialogue,
          mots: await motsVus(editionId, s.niveau, lecon),
        };
      })().catch(() => null);
      contextes.set(cle, p);
    }
    return p;
  }

  async function qui(
    profileId: string,
  ): Promise<{ audience: Audience; accordTuteur: boolean; pays: string | null }> {
    const [p] = await db
      .select({ kind: t.profile.kind, accountKind: t.account.kind, pays: t.account.country })
      .from(t.profile)
      .innerJoin(t.account, eq(t.account.id, t.profile.ownerAccountId))
      .where(eq(t.profile.id, profileId));
    if (!p) return { audience: 'enfant', accordTuteur: false, pays: null };
    const audience: Audience =
      p.kind === 'adulte' ? (p.accountKind === 'adulte' ? 'adulte' : 'ado') : (p.kind as Audience);
    if (audience === 'adulte') return { audience, accordTuteur: true, pays: p.pays };
    const [c] = await db
      .select({ id: t.consent.id })
      .from(t.consent)
      .where(
        and(
          eq(t.consent.profileId, profileId),
          eq(t.consent.type, 'tuteur_ia'),
          isNull(t.consent.withdrawnAt),
        ),
      )
      .limit(1);
    return { audience, accordTuteur: !!c, pays: p.pays };
  }

  /** Profil, fonction, unité, droits et niveau : renvoie le contexte de la demande ou null (refus envoyé). */
  async function garde(
    req: FastifyRequest,
    reply: FastifyReply,
    profileId: string,
    unitId: string,
  ) {
    if (setup.mode === 'off') return void err(reply, 404, 'tuteur_desactive');
    const p = await familyProfile(db, req, reply, profileId);
    if (!p) return;
    if (!(await exigeFonction(db, req, reply, 'tuteur_ia', p.id))) return;
    const ed = await edition();
    if (!ed) return void err(reply, 404, 'introuvable');
    const unit = await getUnitForStudent(db, ed.id, unitId);
    if (!unit) return void err(reply, 404, 'introuvable');
    const e = await rights.of(req.auth);
    if (!rights.canOpen(e, unit)) return void err(reply, 403, 'droits_insuffisants');
    const [level] = unitId.split('.') as [string];
    const cur = await currentLevelOf(db, p.id, 'arabe');
    if (accessFor(cur?.levelCode ?? null, level) === 'ferme')
      return void err(reply, 403, 'niveau_ferme');
    const ctx = await contexte(ed.id, unitId);
    if (!ctx) return void err(reply, 404, 'sans_dialogue');
    return { p, ctx, level };
  }

  const plafonds = () => plafondsDepuisEnv(env, now());

  // ---------------------------------------------------------------- état (l'écran choisit ce qu'il montre)
  app.get<{ Params: { id: string }; Querystring: { unit?: string } }>(
    '/api/v1/tuteur-ia/:id/etat',
    {
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: UUID } },
        querystring: { type: 'object', properties: { unit: { type: 'string', pattern: UNITE } } },
      },
    },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      if (setup.mode === 'off') return { actif: false };
      if (!(await exigeFonction(db, req, reply, 'tuteur_ia', p.id))) return reply;
      const w = await qui(p.id);
      const cur = await currentLevelOf(db, p.id, 'arabe');
      const niveau = req.query.unit?.split('.')[0] ?? cur?.levelCode ?? '';
      const pl = plafonds();
      const dep = await etatDepense(db, p.id, fournisseurNom, now());
      const raison = !setup.fournisseur
        ? 'mode'
        : w.audience === 'enfant'
          ? 'enfant'
          : niveauNum(niveau) < 2
            ? 'niveau_1'
            : !w.accordTuteur
              ? 'accord_parental'
              : coutsCoupes()
                ? 'couts_coupes'
                : null;
      return {
        actif: true,
        audience: w.audience,
        guidee: {
          voix: !!ecoute || setup.mode === 'simule',
          accordVoix: await consentementAnalyseVocale(db, p.id),
        },
        libre: {
          disponible: raison === null,
          ...(raison ? { raison } : {}),
          simule: setup.fournisseur ? !setup.fournisseur.real : false,
          voix: !!setup.synthese,
        },
        minutesRestantes: Math.max(0, Math.floor((pl.eleveSecondesJour - dep.eleveSecondes) / 60)),
      };
    },
  );

  /**
   * Dialogue de la leçon (scénario « Je parle », texte des livres) pour l'écran du tuteur : mêmes droits que la leçon,
   * sous l'interrupteur `tuteur_ia` (indépendant de « conversation », encore en essai).
   */
  app.get<{ Params: { id: string; unit: string } }>(
    '/api/v1/tuteur-ia/:id/scenario/:unit',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id', 'unit'],
          properties: { id: UUID, unit: { type: 'string', pattern: UNITE } },
        },
      },
    },
    async (req, reply) => {
      const g = await garde(req, reply, req.params.id, req.params.unit);
      if (!g) return reply;
      const s = await lireScenario(req.params.unit);
      if (!s) return err(reply, 404, 'sans_dialogue');
      return reply.header('Cache-Control', 'private, no-store').send(s);
    },
  );

  // ---------------------------------------------------------------- étage 1 : dialogue guidé (local)
  app.post<{
    Params: { id: string };
    Body: { unitId: string; tour: number; texte?: string; audio?: Audio };
  }>(
    '/api/v1/tuteur-ia/:id/guidee',
    {
      bodyLimit: 800_000,
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: UUID } },
        body: {
          type: 'object',
          required: ['unitId', 'tour'],
          additionalProperties: false,
          properties: {
            unitId: { type: 'string', pattern: UNITE },
            tour: { type: 'integer', minimum: 0, maximum: 200 },
            texte: { type: 'string', minLength: 1, maxLength: TEXTE_MAX },
            audio: AUDIO_SCHEMA,
          },
        },
      },
    },
    async (req, reply) => {
      const b = req.body;
      if (!!b.texte === !!b.audio) return err(reply, 400, 'texte_ou_audio');
      const g = await garde(req, reply, req.params.id, b.unitId);
      if (!g) return reply;
      const s = await lireScenario(b.unitId);
      const tour = s?.tours[b.tour];
      if (!tour || tour.t !== 'eleve') return err(reply, 400, 'tour_invalide');
      const attendue = tour.choix.find((c) => c.kind === 'bonne')!.ar;
      if (b.texte) return { ...comparerReplique(attendue, motsEcrits(b.texte)), attendue };
      // voix : accord « analyse vocale par IA » (enfant : donné par le parent, au premier usage)
      if (!(await consentementAnalyseVocale(db, g.p.id)))
        return err(reply, 403, 'accord_voix_requis');
      if (b.audio!.secondes > GUIDEE_MAX_S) return err(reply, 413, 'trop_long');
      if (!MIMES.includes(b.audio!.mime.split(';')[0]!)) return err(reply, 415, 'format_audio');
      const h = Date.now();
      const l = (essais.get(g.p.id) ?? []).filter((x) => h - x < 3_600_000);
      if (l.length >= GUIDEE_PAR_HEURE) return err(reply, 429, 'trop_d_essais');
      essais.set(g.p.id, [...l, h]);
      const audio = Buffer.from(b.audio!.b64, 'base64');
      let mots: Array<{ w: string; conf: number }>;
      if (ecoute) {
        const r = await ecoute.ecouter(audio, b.audio!.mime);
        if ('erreur' in r) return err(reply, r.statut === 503 ? 503 : 502, 'ecoute_indisponible');
        mots = r.mots.map((m) => ({ w: m.w, conf: m.conf }));
      } else if (setup.mode === 'simule') {
        // simulé (tests, démonstration) : « SIMULE:<texte> » est entendu tel quel, sinon la bonne réplique
        const brut = audio.toString('utf8');
        mots = brut.startsWith('SIMULE:')
          ? motsEcrits(brut.slice(7))
          : motsEcrits(attendue).map((m) => ({ ...m, conf: 0.95 }));
      } else return err(reply, 503, 'ecoute_indisponible');
      audio.fill(0);
      return { ...comparerReplique(attendue, mots), attendue };
    },
  );

  // ---------------------------------------------------------------- étage 2 : conversation libre (Gemini)
  app.post<{
    Params: { id: string };
    Body: {
      unitId: string;
      texte?: string;
      audio?: Audio;
      historique?: Array<{ de: 'eleve' | 'tuteur'; ar: string }>;
      genre?: Genre;
      adresse?: Adresse;
    };
  }>(
    '/api/v1/tuteur-ia/:id/libre',
    {
      bodyLimit: 800_000,
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: UUID } },
        body: {
          type: 'object',
          required: ['unitId'],
          additionalProperties: false,
          properties: {
            unitId: { type: 'string', pattern: UNITE },
            texte: { type: 'string', minLength: 1, maxLength: TEXTE_MAX },
            audio: AUDIO_SCHEMA,
            historique: {
              type: 'array',
              maxItems: HISTORIQUE_MAX,
              items: {
                type: 'object',
                required: ['de', 'ar'],
                additionalProperties: false,
                properties: {
                  de: { type: 'string', enum: ['eleve', 'tuteur'] },
                  ar: { type: 'string', maxLength: 400 },
                },
              },
            },
            genre: { type: 'string', enum: ['m', 'f', 'x'] },
            adresse: { type: 'string', enum: ['tu', 'vous'] },
          },
        },
      },
    },
    async (req, reply) => {
      const b = req.body;
      if (!!b.texte === !!b.audio) return err(reply, 400, 'texte_ou_audio');
      const g = await garde(req, reply, req.params.id, b.unitId);
      if (!g) return reply;
      const fournisseur = setup.fournisseur;
      if (!fournisseur || !setup.tarif)
        return err(reply, 404, 'libre_indisponible', setup.bloque ? { motif: setup.bloque } : {});
      // garde-fous AVANT tout appel au modèle : âge, niveau, accord parental, disjoncteur
      const w = await qui(g.p.id);
      if (w.audience === 'enfant') return err(reply, 403, 'reserve_ados_adultes');
      if (niveauNum(g.level) < 2) return err(reply, 403, 'niveau_1');
      if (!w.accordTuteur) return err(reply, 403, 'accord_parental_requis');
      if (coutsCoupes()) return err(reply, 503, 'couts_coupes');
      if (b.audio && !MIMES.includes(b.audio.mime.split(';')[0]!))
        return err(reply, 415, 'format_audio');

      const journal = async (o: {
        route: string;
        decision: 'repondre' | 'recadrer' | 'transmettre' | 'proteger';
        filtre: FilterEvent[];
        reponse?: { ar: string; fr: string };
        question?: string;
        cout?: number;
        modele?: string | null;
      }) =>
        logTutor(db, {
          profileId: g.p.id,
          unitId: b.unitId,
          roleId: 'tuteur_conversation',
          roleVersion: PROMPT_VERSION,
          provider: fournisseur.name,
          model: o.modele ?? null,
          action: b.audio ? 'libre_voix' : 'libre_texte',
          // journal minimal : ce que dit un ADULTE n'est pas gardé ; celui d'un ado l'est (supervision du parent)
          question: w.audience === 'ado' && o.question ? o.question.slice(0, TEXTE_MAX) : null,
          decision: o.decision,
          route: o.route,
          filter: o.filtre,
          segments: o.reponse
            ? [
                { t: 'texte', v: o.reponse.ar },
                { t: 'texte', v: o.reponse.fr },
              ]
            : [],
          refused: null,
          costMicros: o.cout ?? 0,
        });

      // 1. texte écrit : classé AVANT le modèle (religion, détresse, injection, politique, contenu inconvenant —
      //    règle plus stricte pour les ados —, conseil médical, juridique ou financier) — aucun appel, aucun coût
      if (b.texte) {
        const cat = classerEntree(b.texte, w.audience);
        if (cat !== 'normal') return await redirection(cat, b.texte);
      }

      async function redirection(cat: string, question?: string) {
        const route =
          cat === 'religion' || cat === 'coran'
            ? 'conversation_religion'
            : 'conversation_recadrage';
        const logId = await journal({
          route,
          decision:
            cat === 'protection'
              ? 'proteger'
              : cat === 'religion' || cat === 'coran'
                ? 'transmettre'
                : 'recadrer',
          filtre: [{ step: 'entree', action: 'bloque', detail: cat }],
          ...(question ? { question } : {}),
        });
        // 20/10/2026 : rencontre avec un inconnu (internet) ou détresse — message et alerte propres à chacune
        const protection = cat === 'protection' ? motifProtection(question ?? '') : null;
        if (protection)
          await createTutorAlert(db, { profileId: g!.p.id, logId, motif: protection });
        return {
          logId,
          redirection: cat,
          ...(protection ? { aide: helpline(w.pays), protection } : {}),
          reponse_ar: '',
          reponse_fr: '',
          correction: null,
          audio: null,
          lu: false,
        };
      }

      // 2. plafonds : réservation du PIRE cas sous verrou global (aucun dépassement possible) ; à l'oral, le pire cas
      //    de l'appel de prononciation (en parallèle) est réservé AVEC le tour, sur la même ligne
      const pl = plafonds();
      const prononciation = b.audio ? setup.prononciation : null;
      const tarifP = prononciation ? setup.tarifPrononciation : null;
      const reserveP = tarifP ? coutMaxPrononciation(tarifP, pl.usdEur) : 0;
      const reserve = coutMaxTour(setup.tarif, pl.usdEur) + reserveP;
      const res = await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended('tuteur-ia-budget', 0))`,
        );
        const avant = await etatDepense(tx as unknown as Db, g.p.id, fournisseur.name, now());
        const refus = decider(avant, pl, reserve);
        if (refus) return { refus, avant };
        const id = await reserverDepense(tx as unknown as Db, {
          profileId: g.p.id,
          costMicros: reserve,
          fournisseur: fournisseur.name,
        });
        return { id, avant };
      });
      if ('refus' in res) {
        if (res.refus === 'plafond_mois' || res.refus === 'plafond_jour')
          app.log.warn({ evenement: 'tuteur_ia_plafond', refus: res.refus });
        return err(reply, 429, 'plafond', { refus: res.refus });
      }

      // 3. appel au modèle (contexte des livres en lecture seule) ; à l'oral, appel de PRONONCIATION lancé EN MÊME
      //    TEMPS (28/10/2026) : la réponse n'attend pas la remarque, qui arrive juste après (GET …/prononciation/:pid)
      const audioBuf = b.audio ? Buffer.from(b.audio.b64, 'base64') : null;
      const adresse: Adresse = b.adresse ?? 'tu';
      const t0 = Date.now();
      const audioP = prononciation && audioBuf ? Buffer.from(audioBuf) : null;
      const sortieP =
        prononciation && audioP
          ? prononciation
              .ecouter(prononInvite(g.ctx), { mime: b.audio!.mime, data: audioP })
              .catch(() => null)
              .finally(() => audioP.fill(0))
              .then((r) => ({ r, ms: Date.now() - t0 }))
          : null;
      const brut = await fournisseur.repondre(
        systemPrompt(g.ctx, adresse, b.genre ?? 'x', w.audience),
        {
          audience: w.audience,
          adresse,
          genre: b.genre ?? 'x',
          contexte: g.ctx,
          historique: (b.historique ?? []).slice(-HISTORIQUE_MAX),
          ...(b.texte ? { texte: b.texte } : {}),
          ...(audioBuf
            ? { audio: { mime: b.audio!.mime, data: audioBuf, secondes: b.audio!.secondes } }
            : {}),
        },
      );
      audioBuf?.fill(0);
      // garde-fou : transcription vide à l'oral → phrase voulue de l'appel de prononciation (prononciation.ts)
      const { out, complete } = await completerTranscription(
        brut,
        sortieP ? sortieP.then((x) => x.r) : null,
      );
      const msModele = Date.now() - t0;

      const idx = await index();
      const usage = out.usage;
      // issue du tour : MÊME règle que la batterie de contrôle (filtre de sortie, renvois, repli sur le livre)
      const issue = issueDuTour(out, {
        index: idx,
        audio: !!b.audio,
        audience: w.audience,
        mots: g.ctx.mots,
        dialogue: g.ctx.dialogue,
      });
      const filtre: FilterEvent[] = issue.filtre;
      if (complete)
        filtre.push({ step: 'transcription', action: 'ok', detail: 'phrase_voulue_prononciation' });
      const { reponse, correction, transcription, redir, route, repli } = issue;
      // 20/10/2026 : une PANNE du fournisseur (requête refusée, réponse vide ou illisible) se voit dans les journaux
      // du serveur, avec le message technique de Google (jamais la phrase de l'élève)
      if (issue.repliTechnique || out.message)
        app.log.warn({
          evenement: issue.repliTechnique
            ? 'tuteur_ia_erreur_fournisseur'
            : 'tuteur_ia_avertissement',
          statut: out.status,
          detail: out.detail,
          message: out.message,
        });

      // 4. voix : jamais de Coran (décision 7), jamais une redirection
      let audio: { mime: string; b64: string } | null = null;
      let caracteres = 0;
      if (reponse && !redir && setup.synthese && voixPermise(reponse.ar, idx)) {
        const v = await setup.synthese.lire(reponse.ar);
        if (v) {
          audio = { mime: v.mime, b64: v.data.toString('base64') };
          caracteres = v.caracteres;
        }
      } else if (reponse && !voixPermise(reponse.ar, idx))
        filtre.push({ step: 'voix', action: 'bloque', detail: 'coran_ou_latin' });
      // latence (objectif < 2,5 s entre la fin de la parole et le début de la réponse) : mesurée à chaque échange
      filtre.push({
        step: 'latence',
        action: 'ok',
        detail: `modele ${msModele} ms, total ${Date.now() - t0} ms`,
      });

      // 5. solde du coût réel (≤ réservation), alertes de seuil
      const cout = Math.min(
        reserve - reserveP,
        fournisseur.real || setup.mode === 'simule'
          ? coutMicros({ ...usage, caracteresVoix: caracteres }, setup.tarif, pl.usdEur)
          : 0,
      );
      const secondes = secondesTour(Math.max(b.audio?.secondes ?? 0, usage.audio / 32), caracteres);
      // la part de la prononciation reste réservée au PIRE cas tant que son appel n'est pas fini
      await solderDepense(db, res.id, {
        costMicros: cout + (sortieP ? reserveP : 0),
        secondes,
        statut: 'fait',
      });
      const apres = res.avant.moisMicros + cout + (sortieP ? reserveP : 0);
      const nouveaux = await noterSeuils(
        db,
        moisCle(now()),
        seuilsFranchis(res.avant.moisMicros, apres, pl),
        apres,
        pl.moisMicros,
      );
      for (const s of nouveaux)
        app.log.warn({ evenement: 'tuteur_ia_seuil', seuil: s, mois: moisCle(now()) });

      // prononciation (oral) : finie EN TÂCHE DE FOND ; la remarque n'est gardée que pour une réponse NORMALE (jamais
      // après un renvoi ou un repli) ; le coût réel remplace ensuite la part réservée
      let prononciationId: string | undefined;
      if (sortieP) {
        const normal = !!reponse && !redir && !repli;
        const travail = (async (): Promise<ResultatPrononciation | null> => {
          const { r, ms } = await sortieP;
          let coutP = reserveP;
          let resultat: ResultatPrononciation | null = null;
          try {
            let caracteresP = 0;
            if (r && normal) {
              const ip = issuePrononciation(r, {
                mots: g.ctx.mots,
                dialogue: g.ctx.dialogue,
                index: idx,
                audience: w.audience,
              });
              // voix : le mot juste, ou la paire à écouter puis le mot de l'élève (mots des livres ; jamais le Coran)
              const texte = ip.remarque
                ? ip.remarque.correct
                : ip.conseil
                  ? [ip.conseil.paire[0].ar, ip.conseil.paire[1].ar, ip.conseil.mot].join('، ')
                  : '';
              let audioP: { mime: string; b64: string } | null = null;
              if (texte && setup.synthese && voixPermise(texte, idx)) {
                const v = await setup.synthese.lire(texte);
                if (v) {
                  audioP = { mime: v.mime, b64: v.data.toString('base64') };
                  caracteresP = v.caracteres;
                }
              }
              resultat = { remarque: ip.remarque, conseil: ip.conseil, audio: audioP };
              app.log.info({
                evenement: 'tuteur_ia_prononciation',
                ms,
                statut: r.status,
                filtre: ip.filtre,
              });
            } else
              app.log.info({
                evenement: 'tuteur_ia_prononciation',
                ms,
                statut: r?.status ?? 'erreur',
                filtre: [
                  {
                    step: 'prononciation',
                    action: 'ecarte',
                    detail: normal ? 'panne' : 'tour_non_normal',
                  },
                ],
              });
            coutP = Math.min(
              reserveP,
              r && (prononciation!.real || setup.mode === 'simule')
                ? coutMicros({ ...r.usage, caracteresVoix: caracteresP }, tarifP!, pl.usdEur)
                : 0,
            );
          } finally {
            await solderDepense(db, res.id, {
              costMicros: cout + coutP,
              secondes,
              statut: 'fait',
            }).catch(() => undefined);
          }
          return resultat;
        })().catch(() => null);
        if (normal) {
          prononciationId = randomUUID();
          const h = Date.now();
          for (const [k, v] of prononciations) if (v.fin < h) prononciations.delete(k);
          prononciations.set(prononciationId, { profileId: g.p.id, travail, fin: h + 60_000 });
        }
      }

      if (redir) {
        const r = await redirection(redir, transcription || undefined);
        return r;
      }
      const logId = await journal({
        route,
        decision: repli ? 'recadrer' : 'repondre',
        filtre,
        ...(reponse ? { reponse } : {}),
        question: b.texte ?? transcription,
        cout,
        modele: fournisseur.real ? fournisseur.modele : null,
      });
      const dep = await etatDepense(db, g.p.id, fournisseur.name, now());
      return {
        logId,
        ...(transcription ? { transcription } : {}),
        reponse_ar: reponse?.ar ?? '',
        reponse_fr: reponse?.fr ?? '',
        correction: repli ? null : correction,
        repli,
        audio,
        lu: !!audio,
        simule: !fournisseur.real,
        // oral : la remarque de prononciation arrive juste après (GET …/prononciation/:pid)
        ...(prononciationId ? { prononciationId } : {}),
        minutesRestantes: Math.max(0, Math.floor((pl.eleveSecondesJour - dep.eleveSecondes) / 60)),
      };
    },
  );

  // ---------------------------------------------------------------- prononciation (résultat différé, oral)
  /**
   * Remarque de prononciation d'un tour oral (28/10/2026) : attend la fin de l'appel lancé en parallèle (15 s au
   * plus), une seule lecture, 60 s au plus après le tour, et seulement par le profil qui a parlé. Rien n'est gardé.
   */
  app.get<{ Params: { id: string; pid: string } }>(
    '/api/v1/tuteur-ia/:id/prononciation/:pid',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id', 'pid'],
          properties: { id: UUID, pid: UUID },
        },
      },
    },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      const e = prononciations.get(req.params.pid);
      if (!e || e.profileId !== p.id || e.fin < Date.now()) return err(reply, 404, 'introuvable');
      prononciations.delete(req.params.pid);
      const r = await Promise.race([
        e.travail,
        new Promise<null>((ok) => setTimeout(() => ok(null), 15_000).unref()),
      ]);
      return reply
        .header('Cache-Control', 'private, no-store')
        .send(r ?? { remarque: null, conseil: null, audio: null });
    },
  );
}
