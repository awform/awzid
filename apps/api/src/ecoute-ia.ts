/**
 * A5 — « L'IA QUI ÉCOUTE LA RÉCITATION » (prototype du canal bêta, interrupteur « ecoute_ia »).
 *
 * L'élève récite une portion (sourate, versets) ; le SERVICE D'ÉCOUTE (conteneur `ecoute`, CPU, réseau interne)
 * renvoie les mots entendus ; l'API les compare au texte Tanzil (Ḥafṣ) avec `comparer` (@awform/hifz) et rend
 * la liste des écarts (mot oublié, ajouté, remplacé, ordre, verset sauté) avec leur position et leur confiance.
 *
 * RÈGLES ABSOLUES :
 *  - mots seulement : jamais de tajwīd, jamais de note, jamais « ta récitation est valide » ; seul le maître juge
 *    (l'élève peut lui envoyer sa récitation : lot 16, `recitations.ts`, accord et chiffrement à part) ;
 *  - en cas de doute, rien n'est signalé (« je n'ai pas bien entendu, réessaie ») ;
 *  - la VOIX N'EST JAMAIS CONSERVÉE : le corps de la requête reste en mémoire, est transmis au service puis
 *    abandonné ; rien en base, rien sur disque, rien dans les journaux (ni audio ni mots entendus) ; jamais
 *    d'entraînement ;
 *  - accord « analyse vocale par IA » (`analyse_vocale_ia`, lot F3) demandé au PREMIER USAGE, jamais d'avance ;
 *    enfant : donné par le parent (code parent) ; mineur inscrit seul : impossible (il faut un parent).
 *
 * INTERRUPTEUR « shazam_coran » (F5, coupé par défaut, 25/10/2026) : « Retrouve ce verset » (`/ecoute/retrouver` :
 * 5 à 15 s de récitation -> passages du Coran, index Tanzil `IndexCoran`, @awform/hifz) et le SUIVI de la récitation
 * qui signale les erreurs pendant qu'on récite (`/ecoute/direct?suivi=1` : passages relus avec leur contexte, deux
 * lectures d'accord). Mêmes règles : accord F3 (enfant : code parent), quota par heure, voix jamais gardée.
 *
 * Deux points À BRANCHER quand les lots arrivent :
 *  - interrupteur : `decisionEcouteIa` (aujourd'hui AWFORM_ECOUTE_IA=on|beta|off) -> registre F5
 *    `fonctionActive('ecoute_ia', …)`, entrée `ecoute_ia: { defaut: 'beta' }` ;
 *  - consentement : `consentementAnalyseVocale` (table `consent`, type F3 `analyse_vocale_ia`).
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import { schema as t, versesOf, type Db } from '@awform/db';
import {
  chercherDouble,
  comparer,
  decisionRetrouver,
  IndexCoran,
  instantsDesMots,
  motsARevoir,
  motsAttendus,
  VOIX_MIN_RETROUVER,
  type MotEntendu,
} from '@awform/hifz';
import { ownsProfile } from './auth/routes.js';
import { minorHolder, parentGate as guardParent } from './guards.js';
import { audit, staffOnly } from './auth/service.js';
import { lawEvidence, TEXT_VERSION } from './auth/policy.js';
import { fonctionsDe } from './f5.js';

export const ECOUTE_MAX_S = 300;
/** 5 min d'Opus ≈ 1,5 Mo ; marge pour les formats moins compacts (mp4 de Safari) */
export const ECOUTE_MAX_OCTETS = 8 * 1024 * 1024;
/** morceau du direct : PCM 16 bits 16 kHz, 4 s au plus */
export const DIRECT_MAX_OCTETS = 4 * 2 * 16000;
export const CONSENTEMENT_ECOUTE = 'analyse_vocale_ia';
/** vérifications par compte et par heure (protège le calcul partagé) */
export const ECOUTE_PAR_HEURE = Number(process.env.AWFORM_ECOUTE_PAR_HEURE ?? 60) || 60;
const MAX_MOTS = 1500;

const err = (reply: FastifyReply, status: number, code: string, extra: object = {}) =>
  reply.code(status).send({ error: { code, ...extra } });
const UUID = { type: 'string', format: 'uuid' } as const;

// ------------------------------------------------------------------ service d'écoute

export interface EcouteBrute {
  mots: MotEntendu[];
  voix: Array<[number, number]>;
  duree: number;
  calcul: number;
}
export interface DirectBrut {
  /** mode direct (A5) : nouveaux mots sûrs (passages finis) */
  mots?: MotEntendu[];
  partiel: MotEntendu[];
  /** zones de voix des passages finis (secondes depuis le début de la séance) */
  voix?: Array<[number, number]>;
  t: number;
  /** mode suivi (shazam_coran) : mots STABLES du passage relu avec son contexte, en deux lectures */
  stables?: MotEntendu[];
  stables_ctc?: MotEntendu[];
  /** mode suivi : mots provisoires du dernier passage fini (remplacent les précédents) */
  provisoires?: MotEntendu[];
}
/** « Retrouve ce verset » : deux lectures du même extrait (RNN-T et tête CTC), voix entendue */
export interface RetrouverBrut {
  mots: MotEntendu[];
  mots_ctc: MotEntendu[];
  voix_s: number;
  duree: number;
  calcul: number;
  /** seconde lecture sans le début de l'extrait, quand la première a « décroché » (trop peu de mots) */
  relecture?: { mots?: MotEntendu[]; mots_ctc?: MotEntendu[] };
}

/** Toutes les lectures d'un extrait (la recherche garde la plus sûre). */
export const lecturesDe = (r: RetrouverBrut): string[][] =>
  [r.mots, r.mots_ctc, r.relecture?.mots, r.relecture?.mots_ctc]
    .filter((l): l is MotEntendu[] => !!l?.length)
    .map((l) => l.map((m) => m.w));
export type Echec = { erreur: string; statut: number };
export interface ClientEcoute {
  ecouter(audio: Buffer, mime: string): Promise<EcouteBrute | Echec>;
  direct(sid: string, pcm: Buffer, suivi?: boolean): Promise<DirectBrut | Echec>;
  finDirect(sid: string): Promise<void>;
  sante(): Promise<boolean>;
  /** shazam_coran : mode « retrouver » du service (absent : fonction indisponible) */
  retrouver?(audio: Buffer, mime: string): Promise<RetrouverBrut | Echec>;
}

/** Client HTTP du service (réseau Docker interne). Aucun journal du contenu. */
export function clientEcouteHttp(base: string): ClientEcoute {
  const url = base.replace(/\/$/, '');
  const appel = async <T>(chemin: string, init: RequestInit, ms: number): Promise<T | Echec> => {
    try {
      const r = await fetch(`${url}${chemin}`, { ...init, signal: AbortSignal.timeout(ms) });
      const j = (await r.json().catch(() => null)) as (T & { error?: { code?: string } }) | null;
      if (!r.ok || !j) return { erreur: j?.error?.code ?? 'ecoute_indisponible', statut: r.status };
      return j;
    } catch {
      return { erreur: 'ecoute_indisponible', statut: 503 };
    }
  };
  return {
    // temps cible < 2 × la durée ; au plus 5 min d'audio -> 10 min, plus l'attente dans la file
    ecouter: (audio, mime) =>
      appel<EcouteBrute>(
        '/ecouter',
        {
          method: 'POST',
          headers: { 'content-type': mime },
          body: new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength),
        },
        12 * 60_000,
      ),
    direct: (sid, pcm, suivi = false) =>
      appel<DirectBrut>(
        `/direct/${sid}${suivi ? '?mode=suivi' : ''}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/octet-stream' },
          body: new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength),
        },
        30_000,
      ),
    finDirect: async (sid) => {
      await appel(`/direct/${sid}`, { method: 'DELETE' }, 5_000);
    },
    // 15 s d'audio : quelques dixièmes de seconde de calcul au calme ; 30 s laissent passer la file d'attente
    retrouver: (audio, mime) =>
      appel<RetrouverBrut>(
        '/ecouter?mode=retrouver',
        {
          method: 'POST',
          headers: { 'content-type': mime },
          body: new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength),
        },
        30_000,
      ),
    sante: async () => {
      const r = await appel<{ pret: boolean }>('/sante', {}, 3_000);
      return 'pret' in r && r.pret === true;
    },
  };
}

export function clientEcouteDepuisEnv(): ClientEcoute | null {
  const u = process.env.AWFORM_ECOUTE_URL;
  return u ? clientEcouteHttp(u) : null;
}

// ------------------------------------------------------------------ points à brancher

/**
 * INTERRUPTEUR « ecoute_ia ». Prototype : AWFORM_ECOUTE_IA = on (tous) | beta (canal bêta : comptes listés dans
 * AWFORM_ECOUTE_IA_BETA, identifiants séparés par des virgules) | off (défaut). À remplacer par le registre F5.
 */
export type DecisionFonction = (req: FastifyRequest) => boolean | Promise<boolean>;
export const decisionEcouteIaParDefaut: DecisionFonction = (req) => {
  if (coutsCoupes()) return false;
  const v = process.env.AWFORM_ECOUTE_IA ?? 'off';
  if (v === 'on') return true;
  if (v !== 'beta' || !req.auth) return false;
  return (process.env.AWFORM_ECOUTE_IA_BETA ?? '')
    .split(',')
    .map((x) => x.trim())
    .includes(req.auth.accountId);
};
/**
 * DISJONCTEUR DE COÛT (décision du référent, 14/10/2026) : AWFORM_COUTS_COUPES=1 coupe les fonctions COÛTEUSES (écoute IA ;
 * la voix à la demande n'existe pas encore : audio pré-généré) et seulement elles. Il ne coupe JAMAIS la machine ni le
 * reste de l'application. Posé à la main dans prod.env quand l'alerte unique de 80 € arrive ; retirer la ligne pour rouvrir.
 */
export const coutsCoupes = () => process.env.AWFORM_COUTS_COUPES === '1';
/** Suivi en direct : sous-interrupteur (AWFORM_ECOUTE_DIRECT=off le coupe ; ouvert sinon quand ecoute_ia l'est). */
export const directOuvert = () => (process.env.AWFORM_ECOUTE_DIRECT ?? 'on') !== 'off';

/**
 * INTERRUPTEUR « shazam_coran » (registre F5, COUPÉ par défaut) : « Retrouve ce verset » et le suivi de la récitation
 * qui signale les erreurs pendant qu'on récite. Fonction coûteuse : coupée aussi par le disjoncteur de coût.
 */
export type DecisionShazam = (req: FastifyRequest, profileId: string) => boolean | Promise<boolean>;
export const decisionShazamParDefaut =
  (db: Db): DecisionShazam =>
  async (req, profileId) =>
    !coutsCoupes() && (await fonctionsDe(db, req, profileId)).fonctions.shazam_coran === true;

/** Durée maximale d'un extrait de « Retrouve ce verset » (l'appareil s'arrête à 15 s) */
export const RETROUVER_MAX_S = 20;
/** 15 s d'Opus ≈ 60 Ko ; marge pour le mp4 de Safari */
export const RETROUVER_MAX_OCTETS = 2 * 1024 * 1024;

/**
 * INDEX du texte Tanzil entier pour « Retrouve ce verset » (272 000 lettres, 50 000 quatre-grammes ; ≈ 0,3 s à
 * construire), une fois par base, à la première demande — ou d'avance, dès qu'un appareil voit la fonction ouverte.
 */
const index = new WeakMap<Db, Promise<IndexCoran>>();
export function indexCoran(db: Db): Promise<IndexCoran> {
  let p = index.get(db);
  if (!p) {
    p = db
      .select({ s: t.quranVerse.sura, a: t.quranVerse.aya, text: t.quranVerse.text })
      .from(t.quranVerse)
      .then((vs) => new IndexCoran(vs));
    p.catch(() => index.delete(db));
    index.set(db, p);
  }
  return p;
}

/** CONSENTEMENT « analyse vocale par IA » (type F3) : accord actif pour ce profil. */
export async function consentementAnalyseVocale(db: Db, profileId: string): Promise<boolean> {
  const [c] = await db
    .select({ id: t.consent.id })
    .from(t.consent)
    .where(
      and(
        eq(t.consent.profileId, profileId),
        eq(t.consent.type, CONSENTEMENT_ECOUTE),
        isNull(t.consent.withdrawnAt),
      ),
    );
  return !!c;
}

export interface OptionsEcoute {
  client?: ClientEcoute | null;
  decision?: DecisionFonction;
  consentement?: (db: Db, profileId: string) => Promise<boolean>;
  /** interrupteur shazam_coran (défaut : registre F5 et disjoncteur de coût) */
  shazam?: DecisionShazam;
}

// ------------------------------------------------------------------ routes

export function registerEcouteIa(app: FastifyInstance, db: Db, opts: OptionsEcoute = {}): void {
  const client = opts.client === undefined ? clientEcouteDepuisEnv() : opts.client;
  const decision = opts.decision ?? decisionEcouteIaParDefaut;
  const consenti = opts.consentement ?? consentementAnalyseVocale;
  const shazam = opts.shazam ?? decisionShazamParDefaut(db);
  const compteur = new Map<string, number[]>();
  /** séances du direct : sid -> propriétaire (en mémoire ; l'audio, lui, n'est jamais ici) */
  const seances = new Map<
    string,
    { accountId: string; profileId: string; fin: number; suivi: boolean }
  >();

  const profileOf = async (id: string) => {
    const [p] = await db
      .select({ id: t.profile.id, kind: t.profile.kind })
      .from(t.profile)
      .where(eq(t.profile.id, id));
    return p ?? null;
  };
  /**
   * profil de la famille, fonction ouverte (« Réciter et vérifier » : ecoute_ia ; « Retrouve ce verset » :
   * shazam_coran) ; renvoie le profil ou null (réponse déjà envoyée)
   */
  const garde = async (
    req: FastifyRequest,
    reply: FastifyReply,
    profileId: string,
    fonction: 'ecoute' | 'shazam' = 'ecoute',
  ) => {
    if (!req.auth) return void err(reply, 401, 'non_connecte');
    if (staffOnly(req.auth)) return void err(reply, 403, 'reserve_aux_familles');
    if (!(await ownsProfile(db, req.auth, profileId))) return void err(reply, 404, 'introuvable');
    const ouverte = fonction === 'shazam' ? await shazam(req, profileId) : await decision(req);
    if (!ouverte) return void err(reply, 404, 'fonction_fermee');
    return (await profileOf(profileId))!;
  };
  /** l'accord se donne depuis « Réciter et vérifier » OU « Retrouve ce verset » */
  const gardeAccord = async (req: FastifyRequest, reply: FastifyReply, profileId: string) => {
    if (req.auth && !staffOnly(req.auth) && (await ownsProfile(db, req.auth, profileId)))
      if (!(await decision(req)) && (await shazam(req, profileId)))
        return garde(req, reply, profileId, 'shazam');
    return garde(req, reply, profileId);
  };
  const quota = (accountId: string) => {
    const now = Date.now();
    const l = (compteur.get(accountId) ?? []).filter((x) => now - x < 3_600_000);
    if (l.length >= ECOUTE_PAR_HEURE) return false;
    l.push(now);
    compteur.set(accountId, l);
    return true;
  };

  /** État pour l'appareil : fonction ouverte ? accord donné ? service prêt ? */
  app.get<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/ecoute',
    { schema: { params: { type: 'object', required: ['id'], properties: { id: UUID } } } },
    async (req, reply) => {
      if (!req.auth) return err(reply, 401, 'non_connecte');
      if (staffOnly(req.auth) || !(await ownsProfile(db, req.auth, req.params.id)))
        return { active: false };
      const active = await decision(req);
      // shazam_coran : « Retrouve ce verset » et suivi qui signale les erreurs (champ absent quand c'est coupé)
      const sh = await shazam(req, req.params.id);
      if (!active && !sh) return { active: false };
      if (sh) void indexCoran(db).catch(() => null); // index prêt avant la première recherche
      const p = (await profileOf(req.params.id))!;
      return {
        active,
        disponible: client ? await client.sante() : false,
        direct: active && directOuvert(),
        accord: await consenti(db, p.id),
        enfant: p.kind === 'enfant',
        maxSecondes: ECOUTE_MAX_S,
        ...(sh ? { shazam: true } : {}),
      };
    },
  );

  /** Accord « analyse vocale par IA » au premier usage (enfant : code parent ; mineur seul : refusé). */
  app.post<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/ecoute/accord',
    { schema: { params: { type: 'object', required: ['id'], properties: { id: UUID } } } },
    async (req, reply) => {
      const p = await gardeAccord(req, reply, req.params.id);
      if (!p) return reply;
      if (await minorHolder(db, req.auth!.accountId)) return err(reply, 403, 'parent_requis');
      if (p.kind === 'enfant') {
        // la voix d'un ENFANT n'est analysée qu'avec l'accord du parent, prouvé par son code
        const [a] = await db
          .select({ h: t.account.parentPinHash })
          .from(t.account)
          .where(eq(t.account.id, req.auth!.accountId));
        if (!a?.h) return err(reply, 409, 'code_parent_a_definir');
      }
      await guardParent(db, req, reply, p.kind);
      if (reply.sent) return reply;
      if (!(await consenti(db, p.id))) {
        await db.insert(t.consent).values({
          accountId: req.auth!.accountId,
          profileId: p.id,
          type: CONSENTEMENT_ECOUTE,
          textVersion: TEXT_VERSION,
          country: req.auth!.country,
          evidence: {
            methode: p.kind === 'enfant' ? 'code_parent' : 'titulaire',
            date: new Date().toISOString(),
            premier_usage: 'ecoute_ia',
            ...lawEvidence(req.auth!.country),
          },
        });
        await audit(db, req.auth!.accountId, 'ecoute.accord', p.id);
      }
      return { ok: true };
    },
  );

  /** Retrait de l'accord (aussi dans « mes accords » après F3). Rien d'autre à effacer : rien n'est gardé. */
  app.delete<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/ecoute/accord',
    { schema: { params: { type: 'object', required: ['id'], properties: { id: UUID } } } },
    async (req, reply) => {
      if (!req.auth) return err(reply, 401, 'non_connecte');
      if (staffOnly(req.auth) || !(await ownsProfile(db, req.auth, req.params.id)))
        return err(reply, 404, 'introuvable');
      await db
        .update(t.consent)
        .set({ withdrawnAt: new Date() })
        .where(
          and(
            eq(t.consent.profileId, req.params.id),
            eq(t.consent.type, CONSENTEMENT_ECOUTE),
            isNull(t.consent.withdrawnAt),
          ),
        );
      for (const [sid, s] of seances)
        if (s.profileId === req.params.id) {
          seances.delete(sid);
          await client?.finDirect(sid);
        }
      await audit(db, req.auth.accountId, 'ecoute.retrait', req.params.id);
      return { ok: true };
    },
  );

  /**
   * « L'IA s'est trompée » : l'élève (ou son maître à côté de lui) signale un résultat faux. Seul un COMPTEUR est
   * gardé (journal : nombre d'écarts montrés, statut) — ni voix, ni mots : c'est la mesure des fausses alertes
   * en bêta.
   */
  app.post<{ Params: { id: string }; Body: { ecarts: number; statut: string } }>(
    '/api/v1/profiles/:id/ecoute/signalement',
    {
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: UUID } },
        body: {
          type: 'object',
          required: ['ecarts', 'statut'],
          additionalProperties: false,
          properties: {
            ecarts: { type: 'integer', minimum: 0, maximum: 500 },
            statut: { type: 'string', enum: ['resultat', 'pas_compris'] },
          },
        },
      },
    },
    async (req, reply) => {
      const p = await garde(req, reply, req.params.id);
      if (!p) return reply;
      await audit(db, req.auth!.accountId, 'ecoute.ia_trompee', p.id, {
        ecarts: req.body.ecarts,
        statut: req.body.statut,
      });
      return { ok: true };
    },
  );

  /** Portion demandée : versets Tanzil (Ḥafṣ) existants, mots attendus. */
  const portion = async (s: number, from: number, to: number) => {
    if (to < from) return null;
    const vs = await versesOf(db, s, from, to);
    if (vs.length !== to - from + 1) return null;
    const [b] = await versesOf(db, 1, 1, 1);
    const att = motsAttendus(vs, b?.text ?? '');
    return att.length && att.length <= MAX_MOTS ? att : null;
  };
  const QS = {
    type: 'object',
    required: ['s', 'from', 'to'],
    properties: {
      s: { type: 'integer', minimum: 1, maximum: 114 },
      from: { type: 'integer', minimum: 1, maximum: 286 },
      to: { type: 'integer', minimum: 1, maximum: 286 },
    },
  } as const;

  /**
   * Début d'un suivi en direct (séance en mémoire du service, 5 min au plus). `suivi=1` (shazam_coran ouvert) :
   * mode « suivi de la récitation », passages relus avec leur contexte, erreurs signalées pendant la récitation.
   */
  app.post<{
    Params: { id: string };
    Querystring: { s: number; from: number; to: number; suivi?: number };
  }>(
    '/api/v1/profiles/:id/ecoute/direct',
    {
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: UUID } },
        querystring: {
          ...QS,
          properties: { ...QS.properties, suivi: { type: 'integer', enum: [0, 1] } },
        },
      },
    },
    async (req, reply) => {
      const p = await garde(req, reply, req.params.id);
      if (!p) return reply;
      if (!directOuvert()) return err(reply, 404, 'fonction_fermee');
      if (!client) return err(reply, 503, 'ecoute_indisponible');
      if (!(await consenti(db, p.id))) return err(reply, 409, 'accord_requis');
      if (!(await portion(req.query.s, req.query.from, req.query.to)))
        return err(reply, 400, 'portion_invalide');
      if (!quota(req.auth!.accountId)) return err(reply, 429, 'trop_de_demandes');
      // une seule séance par compte : la précédente est close (son audio effacé)
      for (const [sid, s] of seances)
        if (s.accountId === req.auth!.accountId || s.fin < Date.now()) {
          seances.delete(sid);
          await client.finDirect(sid);
        }
      const sid = randomUUID();
      const suivi = req.query.suivi === 1 && (await shazam(req, p.id));
      seances.set(sid, {
        accountId: req.auth!.accountId,
        profileId: p.id,
        fin: Date.now() + (ECOUTE_MAX_S + 30) * 1000,
        suivi,
      });
      return { sid, maxSecondes: ECOUTE_MAX_S, ...(suivi ? { suivi: true } : {}) };
    },
  );

  app.delete<{ Params: { sid: string } }>(
    '/api/v1/ecoute/direct/:sid',
    { schema: { params: { type: 'object', required: ['sid'], properties: { sid: UUID } } } },
    async (req, reply) => {
      const s = seances.get(req.params.sid);
      if (!req.auth || !s || s.accountId !== req.auth.accountId)
        return err(reply, 404, 'introuvable');
      seances.delete(req.params.sid);
      await client?.finDirect(req.params.sid);
      return { ok: true };
    },
  );

  // corps BRUTS (audio, PCM) : analyseurs propres à ce périmètre, jamais écrits nulle part
  app.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser(
      /^(audio\/(webm|ogg|mp4|mpeg|wav|aac|x-wav)|application\/octet-stream)(;.*)?$/,
      { parseAs: 'buffer', bodyLimit: ECOUTE_MAX_OCTETS },
      (_req, body, done) => done(null, body),
    );

    /** Vérifier un enregistrement (une portion) : écarts, positions, confiance. L'audio n'est pas gardé. */
    scope.post<{ Params: { id: string }; Querystring: { s: number; from: number; to: number } }>(
      '/api/v1/profiles/:id/ecoute/verifier',
      {
        bodyLimit: ECOUTE_MAX_OCTETS,
        schema: {
          params: { type: 'object', required: ['id'], properties: { id: UUID } },
          querystring: QS,
        },
      },
      async (req, reply) => {
        const p = await garde(req, reply, req.params.id);
        if (!p) return reply;
        if (!client) return err(reply, 503, 'ecoute_indisponible');
        if (!(await consenti(db, p.id))) return err(reply, 409, 'accord_requis');
        const mime = String(req.headers['content-type'] ?? '')
          .split(';')[0]!
          .trim();
        if (!Buffer.isBuffer(req.body) || !req.body.length || !mime.startsWith('audio/'))
          return err(reply, 400, 'audio_invalide');
        const att = await portion(req.query.s, req.query.from, req.query.to);
        if (!att) return err(reply, 400, 'portion_invalide');
        if (!quota(req.auth!.accountId)) return err(reply, 429, 'trop_de_demandes');
        const r = await client.ecouter(req.body, mime);
        // la voix n'est plus référencée nulle part (ni base, ni disque, ni journal)
        (req as { body: unknown }).body = null;
        if ('erreur' in r) {
          const code =
            r.erreur === 'audio_trop_long'
              ? 'audio_trop_long'
              : r.erreur.startsWith('audio_')
                ? 'audio_invalide'
                : r.erreur === 'occupe'
                  ? 'ecoute_occupee'
                  : 'ecoute_indisponible';
          return err(reply, r.statut === 413 ? 413 : r.statut === 400 ? 400 : 503, code);
        }
        const res = comparer(att, r.mots, { voix: r.voix });
        // compteur sans contenu (ni audio, ni mots entendus) : durée, nombre d'écarts
        await audit(db, req.auth!.accountId, 'ecoute.verifier', p.id, {
          secondes: Math.round(r.duree),
          ecarts: res.ecarts.length,
          statut: res.statut,
        });
        return {
          resultat: res,
          aRevoir: motsARevoir(res),
          // position de chaque mot attendu dans le texte affiché (sourate, verset, rang du mot)
          positions: att.map((m) => [m.s, m.a, m.k]),
          // tarteel-egal-wip : instants (secondes) de chaque mot reconnu, pour « Réécouter ma récitation » d'un verset.
          // SEULEMENT pour un profil ADULTE (jamais un enfant ni un ado : pas de réécoute) ; des nombres, jamais les mots
          // entendus ; l'audio, lui, reste sur l'appareil et n'est ni gardé ni renvoyé
          ...(p.kind === 'adulte' && res.statut === 'resultat'
            ? { instants: instantsDesMots(att, r.mots) }
            : {}),
          duree: r.duree,
          calcul: r.calcul,
        };
      },
    );

    /**
     * « RETROUVE CE VERSET » (shazam_coran) : 5 à 15 s de récitation -> les passages du Coran qui y correspondent,
     * au-dessus du seuil validé (0,6), et les passages au MÊME texte ailleurs (ex æquo). Moins de 3 s de voix :
     * « trop_court » (l'appli demande de réciter plus longtemps). Jamais de jugement de la récitation. L'audio n'est
     * pas gardé (ni base, ni disque, ni journal) ; le journal ne compte que des totaux (durée, trouvé ou non).
     */
    scope.post<{ Params: { id: string } }>(
      '/api/v1/profiles/:id/ecoute/retrouver',
      {
        bodyLimit: RETROUVER_MAX_OCTETS,
        schema: { params: { type: 'object', required: ['id'], properties: { id: UUID } } },
      },
      async (req, reply) => {
        const p = await garde(req, reply, req.params.id, 'shazam');
        if (!p) return reply;
        if (!client?.retrouver) return err(reply, 503, 'ecoute_indisponible');
        if (!(await consenti(db, p.id))) return err(reply, 409, 'accord_requis');
        const mime = String(req.headers['content-type'] ?? '')
          .split(';')[0]!
          .trim();
        if (!Buffer.isBuffer(req.body) || !req.body.length || !mime.startsWith('audio/'))
          return err(reply, 400, 'audio_invalide');
        if (!quota(req.auth!.accountId)) return err(reply, 429, 'trop_de_demandes');
        const t0 = performance.now();
        const [r, idx] = await Promise.all([
          client.retrouver(req.body, mime),
          indexCoran(db).catch(() => null),
        ]);
        // la voix n'est plus référencée nulle part (ni base, ni disque, ni journal)
        (req as { body: unknown }).body = null;
        if ('erreur' in r) {
          const code =
            r.erreur === 'audio_trop_long'
              ? 'audio_trop_long'
              : r.erreur === 'audio_trop_court'
                ? 'trop_court'
                : r.erreur.startsWith('audio_')
                  ? 'audio_invalide'
                  : r.erreur === 'occupe'
                    ? 'ecoute_occupee'
                    : 'ecoute_indisponible';
          if (code === 'trop_court') return { statut: 'trop_court', resultats: [], egaux: [] };
          return err(reply, r.statut === 413 ? 413 : r.statut === 400 ? 400 : 503, code);
        }
        if (r.duree > RETROUVER_MAX_S + 0.5) return err(reply, 413, 'audio_trop_long');
        if (!idx) return err(reply, 503, 'ecoute_indisponible');
        const court = r.voix_s < VOIX_MIN_RETROUVER;
        const d = court ? null : decisionRetrouver(chercherDouble(idx, lecturesDe(r)));
        const statut = court ? 'trop_court' : d!.statut;
        // compteur sans contenu (ni audio, ni mots entendus, ni verset trouvé)
        await audit(db, req.auth!.accountId, 'ecoute.retrouver', p.id, {
          secondes: Math.round(r.duree),
          statut,
        });
        return {
          statut,
          resultats: d?.resultats ?? [],
          egaux: d?.egaux ?? [],
          duree: r.duree,
          calcul: Math.round(performance.now() - t0) / 1000,
        };
      },
    );

    /** Morceau du suivi en direct : PCM 16 bits mono 16 kHz ; renvoie les mots sûrs et partiels. */
    scope.post<{ Params: { sid: string } }>(
      '/api/v1/ecoute/direct/:sid',
      {
        bodyLimit: DIRECT_MAX_OCTETS,
        schema: { params: { type: 'object', required: ['sid'], properties: { sid: UUID } } },
      },
      async (req, reply) => {
        const s = seances.get(req.params.sid);
        if (!req.auth || !s || s.accountId !== req.auth.accountId)
          return err(reply, 404, 'introuvable');
        if (s.fin < Date.now()) {
          seances.delete(req.params.sid);
          await client?.finDirect(req.params.sid);
          return err(reply, 413, 'audio_trop_long');
        }
        if (!client) return err(reply, 503, 'ecoute_indisponible');
        if (!Buffer.isBuffer(req.body) || req.body.length % 2)
          return err(reply, 400, 'audio_invalide');
        const r = await client.direct(req.params.sid, req.body, s.suivi);
        (req as { body: unknown }).body = null;
        if ('erreur' in r) {
          if (r.statut === 413) seances.delete(req.params.sid);
          return err(
            reply,
            r.statut === 413 ? 413 : 503,
            r.statut === 413
              ? 'audio_trop_long'
              : r.erreur === 'occupe'
                ? 'ecoute_occupee'
                : 'ecoute_indisponible',
          );
        }
        return r;
      },
    );
  });
}
