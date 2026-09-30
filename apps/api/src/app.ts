/**
 * API REST v1 : santé, contenu (niveaux, leçons en projection élève, paquets hors ligne), comptes et profils
 * (lot 4, module auth/), tentatives et progression RÉSERVÉES aux profils du compte connecté.
 * Protection CSRF : toute requête qui modifie quelque chose doit porter l'en-tête « x-awform: 1 » (un site
 * tiers ne peut pas l'envoyer sans autorisation CORS, que l'API ne donne jamais) ; cookie SameSite=Lax.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import type { Lesson } from '@awform/content';
import type { TutorSetup } from '@awform/tutor';
import type { BillingSetup } from '@awform/billing';
import { neededIllustrations } from './needed.js';
import { getPack } from './packs.js';
import { ownsProfile, registerAuth } from './auth/routes.js';

export { neededIllustrations };
import {
  currentEdition,
  getUnitForStudent,
  illustrationsFor,
  levelProgress,
  listLevels,
  listUnits,
  ping,
  recordAttempts,
  recordHifzEvents,
  recordPractice,
  dashboard,
  publicUnit,
  type AttemptInput,
  type PracticeInput,
  type Db,
  type HifzEventInput,
} from '@awform/db';
import { registerHifz } from './hifz.js';
import { registerLibrary } from './library.js';
import { registerTutor } from './tutor.js';
import { registerBilling } from './billing.js';
import { registerAdmin } from './admin.js';
import { registerToday } from './today.js';
import { registerSchool } from './school.js';
import { registerActivities } from './activities.js';
import { recitationKeyFromEnv, registerRecitations } from './recitations.js';
import { messageKeyFromEnv, registerMessagerie } from './messagerie.js';
import { registerPush } from './push.js';
import { registerRelais } from './relais.js';
import { registerCorrections } from './corrections.js';
import { registerActivation } from './activation.js';
import { registerCarnet } from './carnet.js';
import { registerRecital } from './recital.js';
import { registerEpreuves } from './epreuves.js';
import { registerVerification } from './verification.js';
import { certSignerFromEnv, type CertSigner } from './certsign.js';
import type { RecitationKey } from '@awform/db';

export interface AppOptions {
  db: Db;
  /** code d'édition imposé (sinon : l'édition publiée) */
  editionCode?: string;
  logger?: boolean;
  version?: string;
  /** cookie de session « Secure » (défaut : vrai) */
  cookieSecure?: boolean | 'auto';
  /** clé de chiffrement des secrets de second facteur (32 octets) ; absente → 2FA indisponible */
  secretKey?: Buffer | null;
  /** tuteur (tests) ; sinon AWFORM_TUTEUR */
  tutor?: TutorSetup;
  /** clé de chiffrement des récitations envoyées (tests) ; sinon AWFORM_RECITATION_KEY ; null : envoi fermé */
  recitationKey?: RecitationKey | null;
  /** clé de chiffrement des messages (tests) ; sinon AWFORM_MESSAGE_KEY ; null : messagerie fermée */
  messageKey?: RecitationKey | null;
  /** stockage des certificats de Caddy, en lecture (relais d'école) ; sinon AWFORM_RELAIS_CERTS */
  relaisCertsDir?: string | null;
  /** clé de signature des certificats (tests) ; sinon AWFORM_CERT_SIGN_KEY ; null : certificats non signés */
  certSigner?: CertSigner | null;
  /** paiements (tests) ; sinon AWFORM_PAIEMENT */
  billing?: BillingSetup;
}

const LEVEL_CODE = '^[a-z]{2,3}[0-9]{1,2}$';
const UNIT_ID = '^[a-z]{2,3}[0-9]{1,2}\\.l[0-9]{2}$';
const UUID = '^[0-9a-fA-F-]{36}$';

/**
 * Journaux (audit MIN-13) : chemin sans chaîne de requête, identifiants remplacés par « :id », adresse IP
 * tronquée (IPv4 : dernier octet à 0 ; IPv6 : trois premiers groupes). Aucun e-mail, aucun identifiant d'élève.
 */
const UUID_ANY = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
export function logSafeUrl(url: string): string {
  return (url.split('?')[0] ?? '').replace(UUID_ANY, ':id');
}
export function truncIp(ip: string | undefined): string {
  if (!ip) return '';
  const v4 = /^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.\d+$/.exec(ip);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0`;
  return `${ip.split(':').slice(0, 3).join(':')}::`;
}
export const logSerializers = {
  req: (req: { method?: string; url?: string; ip?: string }) => ({
    method: req.method,
    url: logSafeUrl(req.url ?? ''),
    remoteAddress: truncIp(req.ip),
  }),
};

function notFound(message: string) {
  return { error: { code: 'introuvable', message } };
}

export function buildApp(opts: AppOptions): FastifyInstance {
  const hops = /^[1-9]$/.test(process.env.TRUST_PROXY ?? '') ? Number(process.env.TRUST_PROXY) : 0;
  // fonction de confiance : seuls les `hops` sauts les plus proches (Caddy) sont crus
  const proxyOpts = hops ? { trustProxy: (_addr: string, hop: number) => hop < hops } : {};
  const app = Fastify({
    logger: opts.logger
      ? {
          level: 'info',
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          serializers: logSerializers,
        }
      : false,
    bodyLimit: 1_048_576,
    // audit INF-6 : UN seul mandataire de confiance (Caddy) — l'adresse du client est la dernière qu'il
    // ajoute ; jamais `true` (Fastify prendrait l'adresse la plus à gauche, forgée par le client)
    ...proxyOpts,
  });
  const { db } = opts;

  // CSRF : en-tête obligatoire sur toute requête qui modifie
  app.addHook('onRequest', async (req, reply) => {
    // exception : webhooks signés des prestataires de paiement (signature vérifiée, aucun cookie)
    if (req.url.startsWith('/api/v1/billing/webhook/')) return;
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers['x-awform'] !== '1')
      return reply.code(403).send({ error: { code: 'csrf' } });
  });
  registerAuth(app, {
    db,
    cookieSecure: opts.cookieSecure ?? true,
    secretKey: opts.secretKey ?? null,
  });

  // en-têtes de sécurité de base (la CSP stricte est posée par SvelteKit / Caddy)
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    if (!reply.hasHeader('Cache-Control')) reply.header('Cache-Control', 'no-store');
    return payload;
  });

  app.setNotFoundHandler((req, reply) => {
    void reply.code(404).send(notFound(`route inconnue : ${req.method} ${req.url}`));
  });

  app.setErrorHandler(
    (err: { statusCode?: number; validation?: unknown; message: string }, req, reply) => {
      if (err.validation)
        return reply.code(400).send({ error: { code: 'requete_invalide', message: err.message } });
      if (err.statusCode && err.statusCode < 500)
        return reply
          .code(err.statusCode)
          .send({ error: { code: 'requete_invalide', message: err.message } });
      req.log.error(err);
      return reply.code(500).send({ error: { code: 'erreur_interne', message: 'erreur interne' } });
    },
  );

  const edition = async () => currentEdition(db, opts.editionCode);
  const signer = opts.certSigner === undefined ? certSignerFromEnv() : opts.certSigner;
  registerHifz(app, db, edition);
  registerLibrary(app, db, edition);
  registerTutor(app, db, edition, opts.tutor);
  registerMessagerie(
    app,
    db,
    opts.messageKey === undefined ? messageKeyFromEnv() : opts.messageKey,
  );
  const rights = registerBilling(app, db, opts.billing);
  registerAdmin(app, db);
  registerToday(app, db, edition);
  registerSchool(app, db, edition, signer);
  registerActivities(app, db, edition);
  registerRecitations(
    app,
    db,
    opts.recitationKey === undefined ? recitationKeyFromEnv() : opts.recitationKey,
  );
  registerPush(app, db);
  registerCorrections(app, db, edition);
  registerEpreuves(app, db, edition);
  registerCarnet(app, db, edition);
  registerRecital(app, db, edition);
  registerActivation(app, db);
  registerVerification(app, db, signer);
  registerRelais(
    app,
    db,
    opts.relaisCertsDir === undefined
      ? (process.env.AWFORM_RELAIS_CERTS ?? null)
      : opts.relaisCertsDir,
  );

  app.get('/api/v1/health', async () => {
    const dbOk = await ping(db).catch(() => false);
    const ed = dbOk ? await edition() : null;
    return {
      status: dbOk ? 'ok' : 'degrade',
      db: dbOk,
      edition: ed?.code ?? null,
      version: opts.version ?? '0.2.0',
    };
  });

  app.get('/api/v1/levels', async (_req, reply) => {
    const ed = await edition();
    if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
    return { edition: ed.code, levels: await listLevels(db, ed.id) };
  });

  app.get<{ Params: { code: string } }>(
    '/api/v1/levels/:code/units',
    {
      schema: {
        params: {
          type: 'object',
          properties: { code: { type: 'string', pattern: LEVEL_CODE } },
          required: ['code'],
        },
      },
    },
    async (req, reply) => {
      const ed = await edition();
      if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
      const units = await listUnits(db, ed.id, req.params.code);
      if (units.length === 0)
        return reply.code(404).send(notFound(`niveau ${req.params.code} absent de l'édition`));
      return { edition: ed.code, level: req.params.code, units };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/units/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', pattern: UNIT_ID } },
          required: ['id'],
        },
      },
    },
    async (req, reply) => {
      const ed = await edition();
      if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
      const unit = await getUnitForStudent(db, ed.id, req.params.id);
      if (!unit) return reply.code(404).send(notFound(`leçon ${req.params.id} introuvable`));
      // audit PAY-4 : droits appliqués au contenu quand AWFORM_DROITS=on (leçons ouvertes de la formule)
      const e = await rights.of(req.auth);
      if (!rights.canOpen(e, unit))
        return reply.code(403).send({ error: { code: 'droits_insuffisants', plan: e?.plan } });
      const illustrations = await illustrationsFor(
        db,
        ed.id,
        neededIllustrations(unit.lesson as Lesson),
      );
      return { edition: ed.code, unit, illustrations };
    },
  );

  // ---------------------------------------------------------------- paquets de niveau (hors ligne)

  /** Manifeste : pour chaque niveau, empreinte du paquet, poids compressé, empreinte de chaque leçon. */
  app.get('/api/v1/packs', async (_req, reply) => {
    const ed = await edition();
    if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
    const levels = await listLevels(db, ed.id);
    const packs = [];
    for (const l of levels) {
      const p = await getPack(db, ed.id, ed.code, l.code);
      if (!p) continue;
      packs.push({
        level: l.code,
        titleFr: l.titleFr,
        codeFr: l.codeFr,
        hash: p.pack.hash,
        units: p.perUnit,
        illustrations: Object.keys(p.pack.illustrations).length,
        rawBytes: p.rawBytes,
        bytes: p.brotliBytes,
      });
    }
    return { edition: ed.code, packs };
  });

  /** Paquet complet d'un niveau (ETag = empreinte ; 304 si l'appareil l'a déjà). */
  app.get<{ Params: { code: string } }>(
    '/api/v1/packs/:code',
    {
      schema: {
        params: {
          type: 'object',
          properties: { code: { type: 'string', pattern: LEVEL_CODE } },
          required: ['code'],
        },
      },
    },
    async (req, reply) => {
      const ed = await edition();
      if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
      // audit PAY-4 : le paquet hors ligne (niveau entier) est réservé aux formules qui l'incluent
      const e = await rights.of(req.auth);
      // lot 23 : un code d'activation ouvre aussi le paquet hors ligne de SON niveau (livre acheté)
      if (e && !e.droits.horsLigne && !e.packs?.includes(req.params.code))
        return reply.code(403).send({ error: { code: 'hors_ligne_reserve', plan: e.plan } });
      const p = await getPack(db, ed.id, ed.code, req.params.code);
      if (!p)
        return reply.code(404).send(notFound(`niveau ${req.params.code} absent de l'édition`));
      const etag = `"${p.pack.hash}"`;
      reply.header('ETag', etag).header('Cache-Control', 'no-cache');
      if (req.headers['if-none-match'] === etag) return reply.code(304).send();
      reply.type('application/json; charset=utf-8').header('Vary', 'Accept-Encoding');
      // paquet déjà compressé en Brotli (qualité 11) une fois pour toutes
      if (/\bbr\b/.test(String(req.headers['accept-encoding'] ?? '')))
        return reply.header('Content-Encoding', 'br').send(p.brotli);
      return reply.send(p.json);
    },
  );

  // ---------------------------------------------------------------- tentatives et progression (connecté)

  app.post<{ Body: { events: AttemptInput[] } }>(
    '/api/v1/attempts',
    {
      schema: {
        body: {
          type: 'object',
          required: ['events'],
          properties: {
            events: {
              type: 'array',
              maxItems: 500,
              // audit SEC-8 : champs connus seulement (les autres sont retirés), longueurs bornées ; les
              // valeurs sont vérifiées ensuite événement par événement (un fautif est refusé SEUL, OFF-2)
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string', maxLength: 40 },
                  profileId: { type: 'string', maxLength: 40 },
                  unitId: { type: 'string', maxLength: 40 },
                  eventType: { type: 'string', maxLength: 20 },
                  exerciseId: { type: 'string', maxLength: 80 },
                  exerciseHash: { type: 'string', maxLength: 128 },
                  itemIndex: {},
                  response: {},
                  deviceAt: { type: 'string', maxLength: 40 },
                  deviceId: { type: 'string', maxLength: 64 },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: { code: 'non_connecte' } });
      const ed = await edition();
      if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
      const owned = new Map<string, boolean>();
      const allowed: AttemptInput[] = [];
      const hifz: HifzEventInput[] = [];
      const practice: PracticeInput[] = [];
      const refused: Array<{ id: string; reason: string; code?: string }> = [];
      for (const e of req.body.events) {
        // audit SEC-8 : un événement ne dépasse jamais 8 Ko de JSON (réponse, détails compris)
        if (JSON.stringify(e ?? null).length > 8000) {
          refused.push({ id: String(e?.id ?? ''), reason: 'événement trop volumineux' });
          continue;
        }
        const pid = String(e?.profileId ?? '');
        if (!owned.has(pid))
          owned.set(
            pid,
            /^[0-9a-f-]{36}$/i.test(pid) && (await ownsProfile(db, req.auth.accountId, pid)),
          );
        if (!owned.get(pid)) {
          // code stable : l'appareil GARDE ces réponses (autre compte sur un appareil partagé, audit OFF-3)
          refused.push({
            id: String(e?.id ?? ''),
            reason: 'profil non autorisé',
            code: 'autre_compte',
          });
          continue;
        }
        // événements du hifẓ : même file hors ligne, journal séparé
        if ((e.eventType as string) === 'hifz') {
          const r = (e.response ?? {}) as Partial<HifzEventInput>;
          hifz.push({
            ...r,
            id: e.id,
            profileId: pid,
            deviceAt: e.deviceAt,
          } as HifzEventInput);
        } else if ((e.eventType as string) === 'trace' || (e.eventType as string) === 'carte') {
          // entraînement (tracé, cartes de mots) : journal séparé, jamais de note
          const r = (e.response ?? {}) as Partial<PracticeInput>;
          practice.push({
            ...r,
            id: e.id,
            profileId: pid,
            kind: e.eventType as 'trace' | 'carte',
            deviceAt: e.deviceAt,
          } as PracticeInput);
        } else allowed.push(e);
      }
      const r = await recordAttempts(db, ed.id, allowed);
      const h = hifz.length
        ? await recordHifzEvents(db, hifz, req.auth.accountId, false)
        : { accepted: [], duplicates: [], rejected: [] };
      const pr = practice.length
        ? await recordPractice(db, practice)
        : { accepted: [], duplicates: [], rejected: [] };
      return {
        edition: ed.code,
        ...r,
        accepted: [
          ...r.accepted,
          ...[...h.accepted, ...pr.accepted].map((id) => ({ id, correct: null })),
        ],
        duplicates: [...r.duplicates, ...h.duplicates, ...pr.duplicates],
        rejected: [...r.rejected, ...h.rejected, ...pr.rejected, ...refused],
      };
    },
  );

  app.get<{ Querystring: { profile: string; level: string } }>(
    '/api/v1/progress',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['profile', 'level'],
          properties: {
            profile: { type: 'string', pattern: UUID },
            level: { type: 'string', pattern: LEVEL_CODE },
          },
        },
      },
    },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: { code: 'non_connecte' } });
      if (!(await ownsProfile(db, req.auth.accountId, req.query.profile)))
        return reply.code(404).send(notFound('profil introuvable'));
      const ed = await edition();
      if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
      const units = await listUnits(db, ed.id, req.query.level);
      const rows = await levelProgress(
        db,
        req.query.profile,
        units.map((u) => u.id),
      );
      return { profile: req.query.profile, level: req.query.level, progress: rows };
    },
  );
  // ---------------------------------------------------------------- tableau de bord (parent, adulte)

  app.get<{ Params: { id: string }; Querystring: { today?: string } }>(
    '/api/v1/dashboard/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', pattern: UUID } },
          required: ['id'],
        },
        querystring: {
          type: 'object',
          properties: { today: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } },
        },
      },
    },
    async (req, reply) => {
      if (!req.auth) return reply.code(401).send({ error: { code: 'non_connecte' } });
      if (!(await ownsProfile(db, req.auth.accountId, req.params.id)))
        return reply.code(404).send(notFound('profil introuvable'));
      const today = req.query.today ?? new Date().toISOString().slice(0, 10);
      return { profile: req.params.id, today, ...(await dashboard(db, req.params.id, today)) };
    },
  );

  // ---------------------------------------------------------------- page publique du QR code (sans compte)

  app.get<{ Params: { slug: string } }>(
    '/api/v1/public/l/:slug',
    {
      schema: {
        params: {
          type: 'object',
          properties: { slug: { type: 'string', pattern: '^[a-z]{2,3}[0-9]{1,2}-[0-9]{2}$' } },
          required: ['slug'],
        },
      },
    },
    async (req, reply) => {
      const ed = await edition();
      if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
      const u = await publicUnit(db, ed.id, req.params.slug);
      if (!u) return reply.code(404).send(notFound(`leçon ${req.params.slug} introuvable`));
      reply.header('Cache-Control', 'public, max-age=3600');
      return { edition: ed.code, ...u };
    },
  );
  return app;
}
