/**
 * Indication des MADD (25/10/2026, interrupteur `tajwid_madd`, bêta fermée, ADULTES seulement). Voir
 * `recherche_coran_ia/ETUDE_TAJWID.md` et `services/ecoute-ia/madd.py` (la décision).
 *
 * L'adulte récite UN verset ; l'API envoie au mode « madd » du service d'écoute (conteneur À PART, variable AWFORM_MADD_URL — le
 * service d'écoute de production n'est pas touché) la récitation d'Ayyūb du même verset (référence) et la récitation de l'élève.
 * La réponse est UNE INDICATION OU RIEN : « trop_court » (madd long, muttaṣil ou lāzim) ou null. Jamais « correct », jamais de
 * note, jamais de mesure : une indication automatique, en cours de validation par des maîtres ; le maître reste la référence.
 *
 * RÈGLES ABSOLUES :
 *  - la voix de l'élève n'est JAMAIS conservée : le corps reste en mémoire, est transmis puis abandonné ; rien en base, rien sur
 *    disque, rien dans les journaux (le journal d'audit ne garde que le code de la décision, sans voix ni mesure) ;
 *  - la référence est la récitation d'Ayyūb (fichier du Complexe déjà hébergé) : aucune synthèse vocale sur un verset ;
 *  - adultes seulement (profil adulte), accord « analyse vocale par IA » (`analyse_vocale_ia`) exigé, comme l'écoute IA ;
 *  - tout doute = silence (seuil, confiance, correspondance des madd, verset mal reconnu : voir madd.py).
 */
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { schema as t, type Db } from '@awform/db';
import { audit } from './auth/service.js';
import {
  coutsCoupes,
  consentementAnalyseVocale,
  ECOUTE_PAR_HEURE,
  type Echec,
} from './ecoute-ia.js';
import { exigeFonction } from './f5.js';
import { err, familyProfile, UUID } from './guards.js';

/** récitateur de référence : Muḥammad Ayyūb (Ḥafṣ), seul récitateur du Coran dans l'application */
export const REFERENCE_MADD = 'ayyoub-hafs';
export const MADD_MAX_OCTETS = 4 * 1024 * 1024;
export const TYPES_MADD = ['muttasil', 'lazim'] as const;
export type TypeMadd = (typeof TYPES_MADD)[number];
export type IndicationMadd = 'trop_court' | null;

export interface DemandeMadd {
  k: number;
  type: TypeMadd;
  n?: number;
}
export interface ClientMadd {
  madd(
    reference: Buffer,
    eleve: Buffer,
    d: DemandeMadd,
  ): Promise<{ indication: unknown; raison?: string } | Echec>;
  sante(): Promise<boolean>;
}
/** Récitation d'Ayyūb d'un verset (octets du fichier), ou null si elle n'est pas hébergée. */
export type FournisseurReference = (sura: number, aya: number) => Promise<Buffer | null>;

export interface OptionsMadd {
  client?: ClientMadd | null;
  reference?: FournisseurReference;
  audioDir?: string | null;
  consentement?: (db: Db, profileId: string) => Promise<boolean>;
}

/** Client HTTP du mode « madd » (réseau Docker interne). Corps = 4 octets (taille de la référence) + référence + élève. */
export function clientMaddHttp(base: string): ClientMadd {
  const url = base.replace(/\/$/, '');
  return {
    madd: async (reference, eleve, d) => {
      const entete = Buffer.alloc(4);
      entete.writeUInt32BE(reference.length, 0);
      const corps = Buffer.concat([entete, reference, eleve]);
      const q = new URLSearchParams({ k: String(d.k), type: d.type });
      if (d.n !== undefined) q.set('n', String(d.n));
      try {
        const r = await fetch(`${url}/madd?${q}`, {
          method: 'POST',
          headers: { 'content-type': 'application/octet-stream' },
          body: new Uint8Array(corps.buffer, corps.byteOffset, corps.byteLength),
          signal: AbortSignal.timeout(90_000),
        });
        const j = (await r.json().catch(() => null)) as {
          indication?: unknown;
          raison?: string;
          error?: { code?: string };
        } | null;
        if (!r.ok || !j) return { erreur: j?.error?.code ?? 'madd_indisponible', statut: r.status };
        return { indication: j.indication ?? null, raison: j.raison };
      } catch {
        return { erreur: 'madd_indisponible', statut: 503 };
      }
    },
    sante: async () => {
      try {
        const r = await fetch(`${url}/madd/sante`, { signal: AbortSignal.timeout(3_000) });
        const j = (await r.json().catch(() => null)) as { pret?: boolean } | null;
        return r.ok && j?.pret === true;
      } catch {
        return false;
      }
    },
  };
}

export function clientMaddDepuisEnv(): ClientMadd | null {
  const u = process.env.AWFORM_MADD_URL;
  return u ? clientMaddHttp(u) : null;
}

/** Référence lue dans le stockage audio du Complexe (piste d'Ayyūb du verset, récitateur ACTIF). */
export function referenceDepuisStockage(db: Db, audioDir: string | null): FournisseurReference {
  return async (sura, aya) => {
    if (!audioDir) return null;
    const [tr] = await db
      .select({ path: t.quranTrack.path, status: t.quranReciter.status })
      .from(t.quranTrack)
      .innerJoin(t.quranReciter, eq(t.quranReciter.id, t.quranTrack.reciterId))
      .where(
        and(
          eq(t.quranTrack.reciterId, REFERENCE_MADD),
          eq(t.quranTrack.sura, sura),
          eq(t.quranTrack.aya, aya),
        ),
      );
    if (!tr || tr.status !== 'actif') return null;
    const f = normalize(join(audioDir, tr.path));
    if (!f.startsWith(normalize(audioDir))) return null;
    return readFile(f).catch(() => null);
  };
}

/** Seule valeur possible hors silence : « trop_court ». Tout le reste devient « rien » (le service ne peut pas élargir la sortie). */
export const indicationSure = (v: unknown): IndicationMadd =>
  v === 'trop_court' ? 'trop_court' : null;

export function registerTajwidMadd(app: FastifyInstance, db: Db, opts: OptionsMadd = {}): void {
  const client = opts.client === undefined ? clientMaddDepuisEnv() : opts.client;
  const audioDir =
    opts.audioDir === undefined ? (process.env.AWFORM_AUDIO_DIR ?? null) : opts.audioDir;
  const reference = opts.reference ?? referenceDepuisStockage(db, audioDir);
  const consenti = opts.consentement ?? consentementAnalyseVocale;
  const compteur = new Map<string, number[]>();
  const quota = (accountId: string) => {
    const now = Date.now();
    const l = (compteur.get(accountId) ?? []).filter((x) => now - x < 3_600_000);
    if (l.length >= ECOUTE_PAR_HEURE) return false;
    l.push(now);
    compteur.set(accountId, l);
    return true;
  };
  /** profil ADULTE de la famille connectée, fonction ouverte ; sinon refus déjà envoyé (null) */
  const garde = async (req: FastifyRequest, reply: FastifyReply, profileId: string) => {
    const p = await familyProfile(db, req, reply, profileId);
    if (!p) return null;
    if (!(await exigeFonction(db, req, reply, 'tajwid_madd', p.id))) return null;
    if (p.kind !== 'adulte') {
      void err(reply, 403, 'adultes_seulement');
      return null;
    }
    return p;
  };

  /** État pour l'appareil : fonction ouverte, service prêt, accord donné. Profil non adulte : fonction absente. */
  app.get<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/tajwid/madd',
    { schema: { params: { type: 'object', required: ['id'], properties: { id: UUID } } } },
    async (req, reply) => {
      const p = await garde(req, reply, req.params.id);
      if (!p) return reply;
      return {
        active: !coutsCoupes(),
        disponible: client ? await client.sante() : false,
        accord: await consenti(db, p.id),
      };
    },
  );

  // corps BRUT (audio de l'élève) : analyseur propre à ce périmètre, jamais écrit nulle part
  app.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser(
      /^(audio\/(webm|ogg|mp4|mpeg|wav|aac|x-wav)|application\/octet-stream)(;.*)?$/,
      { parseAs: 'buffer', bodyLimit: MADD_MAX_OCTETS },
      (_req, body, done) => done(null, body),
    );

    scope.post<{
      Params: { id: string };
      Querystring: { s: number; a: number; k: number; type: TypeMadd; n?: number };
    }>(
      '/api/v1/profiles/:id/tajwid/madd',
      {
        bodyLimit: MADD_MAX_OCTETS,
        schema: {
          params: { type: 'object', required: ['id'], properties: { id: UUID } },
          querystring: {
            type: 'object',
            required: ['s', 'a', 'k', 'type'],
            additionalProperties: false,
            properties: {
              s: { type: 'integer', minimum: 1, maximum: 114 },
              a: { type: 'integer', minimum: 1, maximum: 286 },
              k: { type: 'integer', minimum: 0, maximum: 60 },
              type: { type: 'string', enum: [...TYPES_MADD] },
              n: { type: 'integer', minimum: 1, maximum: 80 },
            },
          },
        },
      },
      async (req, reply) => {
        const p = await garde(req, reply, req.params.id);
        if (!p) return reply;
        if (coutsCoupes() || !client) return err(reply, 503, 'madd_indisponible');
        if (!(await consenti(db, p.id))) return err(reply, 409, 'accord_requis');
        const mime = String(req.headers['content-type'] ?? '')
          .split(';')[0]!
          .trim();
        if (!Buffer.isBuffer(req.body) || !req.body.length || !mime.startsWith('audio/'))
          return err(reply, 400, 'audio_invalide');
        const { s, a, k, type, n } = req.query;
        const [v] = await db
          .select({ id: t.quranVerse.aya })
          .from(t.quranVerse)
          .where(and(eq(t.quranVerse.sura, s), eq(t.quranVerse.aya, a)));
        if (!v) return err(reply, 400, 'portion_invalide');
        const ref = await reference(s, a);
        if (!ref) return err(reply, 404, 'reference_absente');
        if (!quota(req.auth!.accountId)) return err(reply, 429, 'trop_de_demandes');
        const r = await client.madd(ref, req.body, { k, type, ...(n !== undefined ? { n } : {}) });
        // la voix n'est plus référencée nulle part (ni base, ni disque, ni journal)
        (req as { body: unknown }).body = null;
        if ('erreur' in r) {
          const code =
            r.statut === 413 || r.erreur === 'audio_trop_long'
              ? 'audio_trop_long'
              : r.statut === 400
                ? 'audio_invalide'
                : r.erreur === 'occupe'
                  ? 'ecoute_occupee'
                  : 'madd_indisponible';
          return err(reply, r.statut === 413 ? 413 : r.statut === 400 ? 400 : 503, code);
        }
        const indication = indicationSure(r.indication);
        // journal sans voix ni mesure : le verset, le type, la décision (compteur des fausses alertes en bêta)
        await audit(db, req.auth!.accountId, 'tajwid.madd', p.id, {
          verset: `${s}:${a}`,
          type,
          indication,
        });
        // SEULE sortie : une indication ou rien (jamais « correct », jamais un nombre)
        return { indication };
      },
    );
  });
}
