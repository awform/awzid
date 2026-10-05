/**
 * Écoute des récitations par l'enseignant (lot 16).
 *  - la FAMILLE (adulte ou ado pour lui-même ; le parent pour un enfant, avec son code parent) choisit
 *    d'envoyer UN enregistrement à l'enseignant de la classe : accord « envoi_recitation » (retirable, ce qui
 *    efface les envois), audio chiffré (AES-256-GCM, clé AWFORM_RECITATION_KEY hors de la base), conservé
 *    le nombre de jours réglé par la classe (1 à 30, 14 par défaut), supprimable à tout moment ;
 *  - l'ENSEIGNANT de la classe (second facteur) écoute et note sur la grille /20 commune (barème des
 *    carnets) ; la note entre dans le journal de hifẓ comme une validation en classe ;
 *  - jamais utilisé pour entraîner une IA : aucun autre chemin ne lit l'audio (ni tuteur, ni export).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import {
  classRecitations,
  decryptAudio,
  deleteRecitation,
  parseRecitationKey,
  profileClasses,
  profileRecitations,
  recitationById,
  recordHifzEvents,
  schema as t,
  storeRecitation,
  teacherClass,
  type Db,
  type RecitationKey,
} from '@awform/db';
import { note, qualityOf, type Counters } from '@awform/hifz';
import { ownsProfile } from './auth/routes.js';
import { minorHolder, parentGate as guardParent } from './guards.js';
import { audit, isTeacher, staffOnly } from './auth/service.js';
import { lawEvidence, TEXT_VERSION } from './auth/policy.js';

const err = (reply: FastifyReply, status: number, code: string, extra: object = {}) =>
  reply.code(status).send({ error: { code, ...extra } });
const UUID = { type: 'string', format: 'uuid' } as const;
const PART = '^\\d{1,3}:\\d{1,3}(-\\d{1,3})?$';
const MIMES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac'];
export const MAX_RECITATION_BYTES = 3 * 1024 * 1024;
const COUNT = { type: 'integer', minimum: 0, maximum: 50 } as const;

export function registerRecitations(app: FastifyInstance, db: Db, key: RecitationKey | null): void {
  // corps audio brut (≤ 3 Mo), jamais JSON
  app.addContentTypeParser(
    /^audio\/(webm|ogg|mp4|mpeg|wav|aac)(;.*)?$/,
    { parseAs: 'buffer', bodyLimit: MAX_RECITATION_BYTES },
    (_req, body, done) => done(null, body),
  );

  const profileOf = async (id: string) => {
    const [p] = await db
      .select({ id: t.profile.id, kind: t.profile.kind })
      .from(t.profile)
      .where(eq(t.profile.id, id));
    return p ?? null;
  };
  const activeConsent = async (profileId: string) => {
    const [c] = await db
      .select({ id: t.consent.id })
      .from(t.consent)
      .where(
        and(
          eq(t.consent.profileId, profileId),
          eq(t.consent.type, 'envoi_recitation'),
          isNull(t.consent.withdrawnAt),
        ),
      );
    return !!c;
  };
  /** pour un enfant : le code parent (s'il existe) est exigé — garde partagée (audit SEC-2) */
  const parentGate = async (req: FastifyRequest, reply: FastifyReply, kind: string) => {
    // audit MIN-10 : la voix d'un ENFANT ne part jamais sans code parent — il doit exister
    if (kind === 'enfant') {
      const [a] = await db
        .select({ h: t.account.parentPinHash })
        .from(t.account)
        .where(eq(t.account.id, req.auth!.accountId));
      if (!a?.h) return err(reply, 409, 'code_parent_a_definir');
    }
    await guardParent(db, req, reply, kind);
  };
  const owned = async (req: FastifyRequest, reply: FastifyReply, profileId: string) => {
    if (!req.auth) return err(reply, 401, 'non_connecte');
    if (staffOnly(req.auth)) return err(reply, 403, 'reserve_aux_familles');
    if (!(await ownsProfile(db, req.auth, profileId))) return err(reply, 404, 'introuvable');
    return null;
  };

  // ---------------------------------------------------------------- famille

  /** Accord d'envoi (une fois par profil ; enfant : code parent). */
  app.post<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/recitations/accord',
    { schema: { params: { type: 'object', required: ['id'], properties: { id: UUID } } } },
    async (req, reply) => {
      await owned(req, reply, req.params.id);
      // une réponse déjà envoyée (refus) arrête ici : une réponse Fastify est « thenable »
      if (reply.sent) return reply;
      const p = (await profileOf(req.params.id))!;
      // audit MIN-1 : un mineur inscrit seul ne peut pas donner cet accord (il faut un parent)
      if (await minorHolder(db, req.auth!.accountId)) return err(reply, 403, 'parent_requis');
      await parentGate(req, reply, p.kind);
      // une réponse déjà envoyée (refus) arrête ici : une réponse Fastify est « thenable »
      if (reply.sent) return reply;
      if (!(await activeConsent(p.id))) {
        await db.insert(t.consent).values({
          accountId: req.auth!.accountId,
          profileId: p.id,
          type: 'envoi_recitation',
          textVersion: TEXT_VERSION,
          country: req.auth!.country,
          evidence: {
            methode: p.kind === 'enfant' ? 'code_parent' : 'titulaire',
            date: new Date().toISOString(),
            ...lawEvidence(req.auth!.country),
          },
        });
        await audit(db, req.auth!.accountId, 'recitation.accord', p.id);
      }
      return { ok: true };
    },
  );

  app.post<{
    Params: { id: string };
    Querystring: { classe: string; passage: string; duree?: number };
  }>(
    '/api/v1/profiles/:id/recitations',
    {
      bodyLimit: MAX_RECITATION_BYTES,
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: UUID } },
        querystring: {
          type: 'object',
          required: ['classe', 'passage'],
          properties: {
            classe: UUID,
            passage: { type: 'string', pattern: PART },
            duree: { type: 'integer', minimum: 1, maximum: 600 },
          },
        },
      },
    },
    async (req, reply) => {
      await owned(req, reply, req.params.id);
      // une réponse déjà envoyée (refus) arrête ici : une réponse Fastify est « thenable »
      if (reply.sent) return reply;
      if (!key) return err(reply, 503, 'envoi_indisponible');
      const p = (await profileOf(req.params.id))!;
      if (!(await activeConsent(p.id))) return err(reply, 409, 'accord_requis');
      await parentGate(req, reply, p.kind);
      // une réponse déjà envoyée (refus) arrête ici : une réponse Fastify est « thenable »
      if (reply.sent) return reply;
      const mime = String(req.headers['content-type'] ?? '')
        .split(';')[0]!
        .trim();
      if (!MIMES.includes(mime) || !Buffer.isBuffer(req.body) || !req.body.length)
        return err(reply, 400, 'audio_invalide');
      // seulement vers une classe dont le profil fait partie
      const classes = await profileClasses(db, p.id);
      if (!classes.some((c) => c.id === req.query.classe))
        return err(reply, 404, 'classe_inconnue');
      const [cls] = await db
        .select({ days: t.classGroup.recitationDays })
        .from(t.classGroup)
        .where(eq(t.classGroup.id, req.query.classe));
      const r = await storeRecitation(db, key, {
        profileId: p.id,
        classId: req.query.classe,
        part: req.query.passage,
        mime,
        durationS: req.query.duree ?? null,
        audio: req.body,
        sentBy: req.auth!.accountId,
        days: Math.min(30, Math.max(1, cls?.days ?? 14)),
        // relais d'école : un envoi rejoué après une coupure n'est enregistré qu'une fois
        idempotencyKey: /^[A-Za-z0-9_-]{8,80}$/.test(String(req.headers['idempotency-key'] ?? ''))
          ? String(req.headers['idempotency-key'])
          : null,
      });
      if (r.duplicate) return reply.code(200).send({ recitation: r, doublon: true });
      await audit(db, req.auth!.accountId, 'recitation.envoi', r.id, {
        profil: p.id,
        classe: req.query.classe,
        octets: req.body.length,
      });
      return reply.code(201).send({ recitation: r });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/recitations',
    { schema: { params: { type: 'object', required: ['id'], properties: { id: UUID } } } },
    async (req, reply) => {
      await owned(req, reply, req.params.id);
      // une réponse déjà envoyée (refus) arrête ici : une réponse Fastify est « thenable »
      if (reply.sent) return reply;
      return {
        classes: (await profileClasses(db, req.params.id)).map((c) => ({ id: c.id, name: c.name })),
        accord: await activeConsent(req.params.id),
        disponible: !!key,
        recitations: await profileRecitations(db, req.params.id),
      };
    },
  );

  app.delete<{ Params: { id: string; rid: string } }>(
    '/api/v1/profiles/:id/recitations/:rid',
    {
      schema: {
        params: { type: 'object', required: ['id', 'rid'], properties: { id: UUID, rid: UUID } },
      },
    },
    async (req, reply) => {
      await owned(req, reply, req.params.id);
      // une réponse déjà envoyée (refus) arrête ici : une réponse Fastify est « thenable »
      if (reply.sent) return reply;
      if (!(await deleteRecitation(db, req.params.id, req.params.rid)))
        return err(reply, 404, 'introuvable');
      await audit(db, req.auth!.accountId, 'recitation.suppression', req.params.rid);
      return { ok: true };
    },
  );

  // ---------------------------------------------------------------- enseignant de la classe

  const needTeacher = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return err(reply, 401, 'non_connecte');
    if (!isTeacher(req.auth)) return err(reply, 403, 'reserve_aux_enseignants');
    if (!req.auth.mfaVerified)
      return err(reply, 403, req.auth.totpEnabled ? 'totp_requis' : 'mfa_a_configurer');
  };
  /** la récitation, si elle vient d'un élève ENCORE inscrit dans une classe de CET enseignant */
  const teacherRecitation = async (req: FastifyRequest, rid: string) => {
    const r = await recitationById(db, rid);
    if (!r || r.expiresAt <= new Date()) return null;
    const cls = await teacherClass(db, req.auth!.accountId, r.classId);
    if (!cls) return null;
    const [m] = await db
      .select({ p: t.classMember.profileId })
      .from(t.classMember)
      .where(and(eq(t.classMember.classId, cls.id), eq(t.classMember.profileId, r.profileId)));
    return m ? r : null;
  };

  app.get<{ Params: { id: string } }>(
    '/api/v1/ecole/classes/:id/recitations',
    {
      preHandler: needTeacher,
      schema: { params: { type: 'object', required: ['id'], properties: { id: UUID } } },
    },
    async (req, reply) => {
      const cls = await teacherClass(db, req.auth!.accountId, req.params.id);
      if (!cls) return err(reply, 404, 'introuvable');
      return { jours: cls.recitationDays, recitations: await classRecitations(db, cls.id) };
    },
  );

  app.get<{ Params: { rid: string } }>(
    '/api/v1/ecole/recitations/:rid/audio',
    {
      preHandler: needTeacher,
      schema: { params: { type: 'object', required: ['rid'], properties: { rid: UUID } } },
    },
    async (req, reply) => {
      const r = await teacherRecitation(req, req.params.rid);
      if (!r || !key || r.keyVersion !== key.version) return err(reply, 404, 'introuvable');
      const audio = decryptAudio(key, r.iv, r.ciphertext);
      if (!r.listenedAt)
        await db
          .update(t.recitationUpload)
          .set({ listenedAt: new Date() })
          .where(eq(t.recitationUpload.id, r.id));
      await audit(db, req.auth!.accountId, 'recitation.ecoute', r.id);
      return reply
        .type(r.mime)
        .header('Cache-Control', 'no-store')
        .header('Content-Disposition', 'inline')
        .send(audio);
    },
  );

  app.post<{ Params: { rid: string }; Body: { counters: Counters; remarque?: string } }>(
    '/api/v1/ecole/recitations/:rid/note',
    {
      preHandler: needTeacher,
      schema: {
        params: { type: 'object', required: ['rid'], properties: { rid: UUID } },
        body: {
          type: 'object',
          required: ['counters'],
          additionalProperties: false,
          properties: {
            counters: {
              type: 'object',
              required: [
                'aides',
                'hesitations',
                'sauts',
                'oublis',
                'claires',
                'discretes',
                'fluidite',
              ],
              additionalProperties: false,
              properties: {
                aides: COUNT,
                hesitations: COUNT,
                sauts: COUNT,
                oublis: COUNT,
                claires: COUNT,
                discretes: COUNT,
                fluidite: { type: 'integer', minimum: 0, maximum: 4 },
              },
            },
            remarque: { type: 'string', maxLength: 500 },
          },
        },
      },
    },
    async (req, reply) => {
      const r = await teacherRecitation(req, req.params.rid);
      if (!r) return err(reply, 404, 'introuvable');
      const n = note(req.body.counters);
      const day = new Date().toISOString().slice(0, 10);
      // même grille que la validation en classe : entre dans le journal de hifẓ de l'élève
      await recordHifzEvents(
        db,
        [
          {
            id: r.id,
            profileId: r.profileId,
            day,
            part: r.part,
            kind: 'revision',
            q: qualityOf(n),
            source: 'enseignant',
            details: {
              counters: req.body.counters,
              note: n,
              remarque: req.body.remarque ?? null,
              ecoute: 'enregistrement envoyé',
            },
            deviceAt: new Date().toISOString(),
          },
        ],
        req.auth!.accountId,
        true,
      );
      await db
        .update(t.recitationUpload)
        .set({
          grade: { counters: req.body.counters, note: n, remarque: req.body.remarque ?? null },
          gradedBy: req.auth!.accountId,
          gradedAt: new Date(),
        })
        .where(eq(t.recitationUpload.id, r.id));
      await audit(db, req.auth!.accountId, 'recitation.note', r.id, { total: n.total });
      return { note: n };
    },
  );
}

export function recitationKeyFromEnv(): RecitationKey | null {
  return parseRecitationKey(process.env.AWFORM_RECITATION_KEY);
}
