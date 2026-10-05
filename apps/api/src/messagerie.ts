/**
 * Lot 21 (V1-f) — messagerie ENCADRÉE et visio planifiée (CDC §2.11, §2.12, protection des mineurs) :
 *  1. aucune messagerie entre élèves : seuls un enseignant et les familles (comptes parent ou adulte) écrivent ;
 *     un titulaire mineur (compte « adulte » dont le profil est « ado ») n'écrit pas (un parent le fait) ;
 *  2. enseignant ↔ famille : un fil privé par élève et par classe ; annonces de classe (enseignant → familles,
 *     sans réponse collective) ;
 *  4. pièces jointes : de l'enseignant seulement, PNG, JPEG ou PDF vérifiés par leur signature, 2 Mo ; aucun
 *     lien raccourci ;
 *  5. signalement sur chaque message → file de modération de l'administrateur ; la réponse oriente vers le
 *     numéro d'aide du pays du compte ;
 *  6. aucune notification de message (donc jamais la nuit pour un mineur) ;
 *  7. conservation : 12 mois après la fin de l'année scolaire (purge du travailleur, décision D11) ;
 *  8. chaque consultation par la modération est journalisée.
 * Corps et pièces jointes CHIFFRÉS (AES-256-GCM, clé AWFORM_MESSAGE_KEY hors de la base, version de clé).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  decryptAudio,
  encryptAudio,
  parseRecitationKey,
  profileClasses,
  schema as t,
  teacherClass,
  type Db,
  type RecitationKey,
} from '@awform/db';
import { helpline } from '@awform/tutor';
import { ownsProfile } from './auth/routes.js';
import { audit, hasRole, isTeacher } from './auth/service.js';
import { err, minorHolder, needTeacher, UUID } from './guards.js';

export const messageKeyFromEnv = () => parseRecitationKey(process.env.AWFORM_MESSAGE_KEY);

const MAX_TEXT = 2000;
const MAX_ATTACHMENT = 2 * 1024 * 1024;
/** services de liens raccourcis (on ne sait pas où ils mènent) */
const SHORTENER =
  /\b(bit\.ly|tinyurl\.com|goo\.gl|t\.co|ow\.ly|is\.gd|cutt\.ly|rebrand\.ly|shorturl\.at|tiny\.cc|rb\.gy|s\.id|lnkd\.in|buff\.ly)\//i;

/** type RÉEL d'une pièce jointe, d'après sa signature (jamais d'après le nom ni le type annoncé) */
export function sniffAttachment(b: Buffer): 'image/png' | 'image/jpeg' | 'application/pdf' | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

/** services de visio reconnus (lien https seulement) ; sinon « autre » */
export function videoProvider(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || SHORTENER.test(`${u.host}/`)) return null;
  const h = u.hostname.toLowerCase();
  if (h === 'meet.google.com') return 'google_meet';
  if (h === 'zoom.us' || h.endsWith('.zoom.us')) return 'zoom';
  if (h === 'teams.microsoft.com' || h === 'teams.live.com') return 'teams';
  if (h === 'meet.jit.si') return 'jitsi';
  if (h === 'whereby.com' || h.endsWith('.whereby.com')) return 'whereby';
  return 'autre';
}

/** fin de conservation (§2.12.7) : messages d'avant le 1er août de l'année scolaire close depuis 12 mois */
export function messageRetentionCutoff(now = new Date()): Date {
  const y = now.getUTCFullYear();
  const aug1 = Date.UTC(y, 7, 1);
  return new Date(Date.UTC(now.getTime() >= aug1 ? y - 1 : y - 2, 7, 1));
}

type Body = { texte: string; piece?: { nom: string; base64: string } };
const BODY_SCHEMA = {
  type: 'object',
  required: ['texte'],
  additionalProperties: false,
  properties: {
    texte: { type: 'string', minLength: 1, maxLength: MAX_TEXT },
    piece: {
      type: 'object',
      required: ['nom', 'base64'],
      additionalProperties: false,
      properties: {
        nom: { type: 'string', minLength: 1, maxLength: 120 },
        base64: { type: 'string', maxLength: Math.ceil((MAX_ATTACHMENT * 4) / 3) + 8 },
      },
    },
  },
} as const;

export function registerMessagerie(app: FastifyInstance, db: Db, key: RecitationKey | null): void {
  const enc = (s: string) => {
    const e = encryptAudio(key!, Buffer.from(s, 'utf8'));
    return { keyVersion: key!.version, iv: e.iv, body: e.ciphertext };
  };
  const dec = (m: { iv: Buffer; body: Buffer; removedAt: Date | null }) =>
    m.removedAt ? null : decryptAudio(key!, m.iv, m.body).toString('utf8');

  /** texte et pièce jointe contrôlés ; renvoie null (réponse déjà envoyée) si refusé */
  const prepare = (reply: FastifyReply, b: Body, allowAttachment: boolean) => {
    if (!key) return void err(reply, 503, 'messagerie_indisponible');
    const texte = b.texte.trim();
    if (!texte) return void err(reply, 400, 'message_vide');
    if (SHORTENER.test(texte)) return void err(reply, 400, 'lien_raccourci');
    let piece: Record<string, unknown> = {};
    if (b.piece) {
      if (!allowAttachment) return void err(reply, 403, 'piece_jointe_enseignant_seulement');
      const buf = Buffer.from(b.piece.base64, 'base64');
      if (!buf.length || buf.length > MAX_ATTACHMENT)
        return void err(reply, 413, 'piece_trop_lourde');
      const mime = sniffAttachment(buf);
      if (!mime) return void err(reply, 415, 'piece_type_refuse');
      const e = encryptAudio(key, buf);
      piece = {
        attachmentName: b.piece.nom.replace(/[^\p{L}\p{N} ._-]/gu, '_').slice(0, 120),
        attachmentMime: mime,
        attachmentIv: e.iv,
        attachment: e.ciphertext,
      };
    }
    return { ...enc(texte), ...piece };
  };

  const view = (m: typeof t.message.$inferSelect, me: string, reads: Set<string>) => ({
    id: m.id,
    kind: m.kind,
    deMoi: m.authorAccountId === me,
    // A27 (D-F2 8) : auteur parti (compte enseignant supprimé) — message gardé pour l'école, « ancien enseignant »
    // (un compte famille supprimé emporte ses fils : un message sans auteur vient donc d'un enseignant)
    ancienEnseignant: m.authorAccountId === null,
    texte: dec(m),
    retire: !!m.removedAt,
    piece:
      m.attachmentName && !m.removedAt ? { nom: m.attachmentName, type: m.attachmentMime } : null,
    le: m.createdAt,
    lu: m.authorAccountId === me || reads.has(m.id),
  });

  const readsOf = async (accountId: string, ids: string[]) =>
    new Set(
      ids.length
        ? (
            await db
              .select({ id: t.messageRead.messageId })
              .from(t.messageRead)
              .where(
                and(eq(t.messageRead.accountId, accountId), inArray(t.messageRead.messageId, ids)),
              )
          ).map((r) => r.id)
        : [],
    );
  const markRead = async (accountId: string, ids: string[]) => {
    if (ids.length)
      await db
        .insert(t.messageRead)
        .values(ids.map((messageId) => ({ messageId, accountId })))
        .onConflictDoNothing();
  };

  /** famille autorisée à écrire : compte parent ou adulte majeur (jamais un titulaire mineur, jamais un élève) */
  const familyWriter = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return void err(reply, 401, 'non_connecte');
    if ((req.auth.kind !== 'parent' && req.auth.kind !== 'adulte') || req.auth.tablet)
      return void err(reply, 403, 'reserve_aux_familles');
    if (await minorHolder(db, req.auth.accountId)) return void err(reply, 403, 'parent_requis');
    return req.auth.accountId;
  };

  /** fil d'un élève dans une classe (créé au premier message) */
  const threadFor = async (classId: string, teacherId: string, profileId: string) => {
    const [p] = await db
      .select({ owner: t.profile.ownerAccountId })
      .from(t.profile)
      .where(eq(t.profile.id, profileId));
    if (!p) return null;
    const [th] = await db
      .insert(t.messageThread)
      .values({ classId, teacherAccountId: teacherId, familyAccountId: p.owner, profileId })
      .onConflictDoUpdate({
        target: [t.messageThread.classId, t.messageThread.profileId],
        // A27 (D-F2 8) : fil gardé d'un enseignant parti → repris par l'enseignant qui écrit
        set: {
          lastAt: sql`${t.messageThread.lastAt}`,
          teacherAccountId: sql`COALESCE("message_thread"."teacher_account_id", ${teacherId}::uuid)`,
        },
      })
      .returning();
    return th!;
  };
  const isMember = async (classId: string, profileId: string) =>
    (
      await db
        .select({ p: t.classMember.profileId })
        .from(t.classMember)
        .where(and(eq(t.classMember.classId, classId), eq(t.classMember.profileId, profileId)))
    ).length > 0;

  const post = async (
    classId: string,
    threadId: string | null,
    author: string,
    data: Record<string, unknown>,
  ) => {
    const [m] = await db
      .insert(t.message)
      .values({
        classId,
        threadId,
        kind: threadId ? 'prive' : 'annonce',
        authorAccountId: author,
        ...(data as { keyVersion: number; iv: Buffer; body: Buffer }),
      })
      .returning({ id: t.message.id, createdAt: t.message.createdAt });
    if (threadId)
      await db
        .update(t.messageThread)
        .set({ lastAt: new Date() })
        .where(eq(t.messageThread.id, threadId));
    return m!;
  };

  const idParams = (...names: string[]) => ({
    params: {
      type: 'object',
      required: names,
      properties: Object.fromEntries(names.map((n) => [n, UUID])),
    },
  });

  // ---------------------------------------------------------------- enseignant
  app.get<{ Params: { id: string } }>(
    '/api/v1/ecole/classes/:id/messages',
    { preHandler: needTeacher, schema: idParams('id') },
    async (req, reply) => {
      const me = req.auth!.accountId;
      const cls = await teacherClass(db, me, req.params.id);
      if (!cls) return err(reply, 404, 'introuvable');
      const annonces = await db
        .select()
        .from(t.message)
        .where(and(eq(t.message.classId, cls.id), eq(t.message.kind, 'annonce')))
        .orderBy(desc(t.message.createdAt))
        .limit(50);
      const fils = await db
        .select({
          id: t.messageThread.id,
          profileId: t.messageThread.profileId,
          pseudonym: t.profile.pseudonym,
          lastAt: t.messageThread.lastAt,
          nonLus: sql<number>`(select count(*)::int from message m where m.thread_id = ${t.messageThread.id}
            and m.author_account_id is distinct from ${me}
            and not exists (select 1 from message_read r where r.message_id = m.id and r.account_id = ${me}))`,
        })
        .from(t.messageThread)
        .innerJoin(t.profile, eq(t.profile.id, t.messageThread.profileId))
        .where(eq(t.messageThread.classId, cls.id))
        .orderBy(desc(t.messageThread.lastAt));
      const reads = await readsOf(
        me,
        annonces.map((a) => a.id),
      );
      return { annonces: annonces.map((m) => view(m, me, reads)), fils };
    },
  );

  app.post<{ Params: { id: string }; Body: Body }>(
    '/api/v1/ecole/classes/:id/annonces',
    {
      preHandler: needTeacher,
      schema: { ...idParams('id'), body: BODY_SCHEMA },
      bodyLimit: 3_200_000,
    },
    async (req, reply) => {
      const me = req.auth!.accountId;
      const cls = await teacherClass(db, me, req.params.id);
      if (!cls) return err(reply, 404, 'introuvable');
      const data = prepare(reply, req.body, true);
      if (!data) return reply;
      const m = await post(cls.id, null, me, data);
      await audit(db, me, 'message.annonce', m.id);
      return reply.code(201).send({ message: m });
    },
  );

  app.post<{ Params: { id: string; profileId: string }; Body: Body }>(
    '/api/v1/ecole/classes/:id/eleves/:profileId/messages',
    {
      preHandler: needTeacher,
      schema: { ...idParams('id', 'profileId'), body: BODY_SCHEMA },
      bodyLimit: 3_200_000,
    },
    async (req, reply) => {
      const me = req.auth!.accountId;
      const cls = await teacherClass(db, me, req.params.id);
      if (!cls || !(await isMember(cls.id, req.params.profileId)))
        return err(reply, 404, 'introuvable');
      // §2.12.3 : aucun message privé entre un adulte et un mineur titulaire de son compte (V2 : fil visible
      // du parent) — l'enseignant passe par les annonces
      const [owner] = await db
        .select({ id: t.profile.ownerAccountId })
        .from(t.profile)
        .where(eq(t.profile.id, req.params.profileId));
      if (await minorHolder(db, owner!.id)) return err(reply, 403, 'famille_mineure');
      const data = prepare(reply, req.body, true);
      if (!data) return reply;
      const th = (await threadFor(cls.id, me, req.params.profileId))!;
      const m = await post(cls.id, th.id, me, data);
      return reply.code(201).send({ fil: th.id, message: m });
    },
  );

  // ---------------------------------------------------------------- famille
  /** annonces des classes des profils du compte, et ses fils */
  app.get('/api/v1/famille/messages', async (req, reply) => {
    const me = await familyWriter(req, reply);
    if (!me) return reply;
    const profiles = (
      await db
        .select({ id: t.profile.id, pseudonym: t.profile.pseudonym })
        .from(t.profile)
        .where(eq(t.profile.ownerAccountId, me))
    ).filter(Boolean);
    const classIds = new Set<string>();
    for (const p of profiles) for (const c of await profileClasses(db, p.id)) classIds.add(c.id);
    const annonces = classIds.size
      ? await db
          .select()
          .from(t.message)
          .where(and(inArray(t.message.classId, [...classIds]), eq(t.message.kind, 'annonce')))
          .orderBy(desc(t.message.createdAt))
          .limit(50)
      : [];
    const fils = await db
      .select({
        id: t.messageThread.id,
        classId: t.messageThread.classId,
        classe: t.classGroup.name,
        profileId: t.messageThread.profileId,
        pseudonym: t.profile.pseudonym,
        lastAt: t.messageThread.lastAt,
      })
      .from(t.messageThread)
      .innerJoin(t.profile, eq(t.profile.id, t.messageThread.profileId))
      .innerJoin(t.classGroup, eq(t.classGroup.id, t.messageThread.classId))
      .where(eq(t.messageThread.familyAccountId, me))
      .orderBy(desc(t.messageThread.lastAt));
    const reads = await readsOf(
      me,
      annonces.map((a) => a.id),
    );
    await markRead(
      me,
      annonces.map((a) => a.id),
    );
    return {
      annonces: annonces.map((m) => ({ ...view(m, me, reads), classId: m.classId })),
      fils,
      aide: helpline(req.auth!.country),
    };
  });

  /** la famille écrit à l'enseignant d'une classe de son enfant (le fil est celui de l'élève) */
  app.post<{ Params: { profileId: string; classId: string }; Body: Body }>(
    '/api/v1/profiles/:profileId/classes/:classId/messages',
    { schema: { ...idParams('profileId', 'classId'), body: BODY_SCHEMA } },
    async (req, reply) => {
      const me = await familyWriter(req, reply);
      if (!me) return reply;
      const { profileId, classId } = req.params;
      if (!(await ownsProfile(db, req.auth, profileId)) || !(await isMember(classId, profileId)))
        return err(reply, 404, 'introuvable');
      const data = prepare(reply, req.body, false);
      if (!data) return reply;
      const [cls] = await db
        .select({ teacher: t.classGroup.teacherAccountId })
        .from(t.classGroup)
        .where(eq(t.classGroup.id, classId));
      // lot F2 : classe momentanément sans titulaire (enseignant parti) → la direction en désigne un
      if (!cls?.teacher) return err(reply, 409, 'classe_sans_titulaire');
      const th = (await threadFor(classId, cls.teacher, profileId))!;
      const m = await post(classId, th.id, me, data);
      return reply.code(201).send({ fil: th.id, message: m });
    },
  );

  // ---------------------------------------------------------------- fil (enseignant ou famille du fil)
  const threadOf = async (req: FastifyRequest, id: string) => {
    const [th] = await db.select().from(t.messageThread).where(eq(t.messageThread.id, id));
    if (!th || !req.auth) return null;
    const me = req.auth.accountId;
    // lot F2 : tout enseignant de la classe (titulaire, suppléant) ou la direction, second facteur vérifié
    if (isTeacher(req.auth) && req.auth.mfaVerified && (await teacherClass(db, me, th.classId)))
      return { th, role: 'enseignant' as const };
    // la famille : seulement tant que l'élève est dans la classe
    if (th.familyAccountId === me && (await isMember(th.classId, th.profileId)))
      return { th, role: 'famille' as const };
    return null;
  };

  app.get<{ Params: { id: string } }>(
    '/api/v1/fils/:id',
    { schema: idParams('id') },
    async (req, reply) => {
      const x = await threadOf(req, req.params.id);
      if (!x) return err(reply, 404, 'introuvable');
      const me = req.auth!.accountId;
      const rows = await db
        .select()
        .from(t.message)
        .where(eq(t.message.threadId, x.th.id))
        .orderBy(asc(t.message.createdAt));
      const reads = await readsOf(
        me,
        rows.map((r) => r.id),
      );
      await markRead(
        me,
        rows.map((r) => r.id),
      );
      return { fil: x.th.id, role: x.role, messages: rows.map((m) => view(m, me, reads)) };
    },
  );

  app.post<{ Params: { id: string }; Body: Body }>(
    '/api/v1/fils/:id/messages',
    { schema: { ...idParams('id'), body: BODY_SCHEMA }, bodyLimit: 3_200_000 },
    async (req, reply) => {
      const x = await threadOf(req, req.params.id);
      if (!x) return err(reply, 404, 'introuvable');
      if (x.role === 'famille' && !(await familyWriter(req, reply))) return reply;
      const data = prepare(reply, req.body, x.role === 'enseignant');
      if (!data) return reply;
      const m = await post(x.th.classId, x.th.id, req.auth!.accountId, data);
      return reply.code(201).send({ message: m });
    },
  );

  // ---------------------------------------------------------------- pièce jointe et signalement
  /** un message est-il visible de ce compte ? (auteur, participant du fil, famille d'une classe pour l'annonce) */
  const visible = async (req: FastifyRequest, id: string) => {
    const [m] = await db.select().from(t.message).where(eq(t.message.id, id));
    if (!m || !req.auth) return null;
    if (m.threadId) return (await threadOf(req, m.threadId)) ? m : null;
    const me = req.auth.accountId;
    if (await teacherClass(db, me, m.classId)) return m;
    const members = await db
      .select({ p: t.classMember.profileId })
      .from(t.classMember)
      .innerJoin(t.profile, eq(t.profile.id, t.classMember.profileId))
      .where(and(eq(t.classMember.classId, m.classId), eq(t.profile.ownerAccountId, me)));
    return members.length ? m : null;
  };

  app.get<{ Params: { id: string } }>(
    '/api/v1/messages/:id/piece',
    { schema: idParams('id') },
    async (req, reply) => {
      const m = await visible(req, req.params.id);
      if (!m || !m.attachment || !m.attachmentIv || m.removedAt || !key)
        return err(reply, 404, 'introuvable');
      const buf = decryptAudio(key, m.attachmentIv, m.attachment);
      return reply
        .header('Content-Type', m.attachmentMime ?? 'application/octet-stream')
        .header(
          'Content-Disposition',
          `attachment; filename="piece${m.attachmentMime === 'application/pdf' ? '.pdf' : m.attachmentMime === 'image/png' ? '.png' : '.jpg'}"`,
        )
        .header('X-Content-Type-Options', 'nosniff')
        .header('Cache-Control', 'no-store')
        .send(buf);
    },
  );

  app.post<{ Params: { id: string }; Body: { motif: string } }>(
    '/api/v1/messages/:id/signaler',
    {
      schema: {
        ...idParams('id'),
        body: {
          type: 'object',
          required: ['motif'],
          additionalProperties: false,
          properties: { motif: { type: 'string', minLength: 1, maxLength: 500 } },
        },
      },
    },
    async (req, reply) => {
      const m = await visible(req, req.params.id);
      if (!m) return err(reply, 404, 'introuvable');
      await db
        .insert(t.messageReport)
        .values({ messageId: m.id, reporterAccountId: req.auth!.accountId, reason: req.body.motif })
        .onConflictDoNothing();
      await audit(db, req.auth!.accountId, 'message.signalement', m.id);
      // orientation vers le numéro d'aide du pays du compte (§2.12.5)
      return { ok: true, aide: helpline(req.auth!.country) };
    },
  );

  // ---------------------------------------------------------------- modération (administrateur, 2FA)
  const needAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return err(reply, 401, 'non_connecte');
    // lot F2 (revue E2) : administrateur ou modérateur
    if (!hasRole(req.auth, 'admin', 'moderateur')) return err(reply, 403, 'reserve_admin');
    if (!req.auth.mfaVerified) return err(reply, 403, 'mfa_requis');
  };

  app.get('/api/v1/admin/moderation', { preHandler: needAdmin }, async (req) => {
    const rows = await db
      .select({ report: t.messageReport, message: t.message })
      .from(t.messageReport)
      .innerJoin(t.message, eq(t.message.id, t.messageReport.messageId))
      .where(isNull(t.messageReport.handledAt))
      .orderBy(asc(t.messageReport.createdAt))
      .limit(50);
    // §2.12.8 : chaque consultation d'un message par la modération est journalisée
    for (const r of rows)
      await audit(db, req.auth!.accountId, 'moderation.consultation', r.message.id);
    return {
      signalements: rows.map((r) => ({
        id: r.report.id,
        motif: r.report.reason,
        le: r.report.createdAt,
        message: { id: r.message.id, kind: r.message.kind, texte: key ? dec(r.message) : null },
      })),
    };
  });

  app.post<{ Params: { id: string }; Body: { decision: 'classe' | 'retire' } }>(
    '/api/v1/admin/moderation/:id',
    {
      preHandler: needAdmin,
      schema: {
        ...idParams('id'),
        body: {
          type: 'object',
          required: ['decision'],
          additionalProperties: false,
          properties: { decision: { type: 'string', enum: ['classe', 'retire'] } },
        },
      },
    },
    async (req, reply) => {
      const [r] = await db
        .update(t.messageReport)
        .set({ handledAt: new Date(), handledBy: req.auth!.accountId, decision: req.body.decision })
        .where(and(eq(t.messageReport.id, req.params.id), isNull(t.messageReport.handledAt)))
        .returning();
      if (!r) return err(reply, 404, 'introuvable');
      if (req.body.decision === 'retire')
        // le texte et la pièce jointe sont effacés ; la trace (date, auteur) reste
        await db
          .update(t.message)
          .set({
            removedAt: new Date(),
            iv: Buffer.alloc(12),
            body: Buffer.alloc(0),
            attachment: null,
            attachmentIv: null,
            attachmentName: null,
            attachmentMime: null,
          })
          .where(eq(t.message.id, r.messageId));
      await audit(db, req.auth!.accountId, `moderation.${req.body.decision}`, r.messageId);
      return { ok: true };
    },
  );

  // ---------------------------------------------------------------- visio (liens externes planifiés)
  app.post<{
    Params: { id: string };
    Body: { titre: string; debut: string; dureeMin: number; url: string };
  }>(
    '/api/v1/ecole/classes/:id/visios',
    {
      preHandler: needTeacher,
      schema: {
        ...idParams('id'),
        body: {
          type: 'object',
          required: ['titre', 'debut', 'dureeMin', 'url'],
          additionalProperties: false,
          properties: {
            titre: { type: 'string', minLength: 1, maxLength: 120 },
            debut: { type: 'string', format: 'date-time' },
            dureeMin: { type: 'integer', minimum: 10, maximum: 240 },
            url: { type: 'string', maxLength: 500 },
          },
        },
      },
    },
    async (req, reply) => {
      const me = req.auth!.accountId;
      const cls = await teacherClass(db, me, req.params.id);
      if (!cls) return err(reply, 404, 'introuvable');
      const provider = videoProvider(req.body.url);
      if (!provider) return err(reply, 400, 'lien_visio_invalide');
      const [v] = await db
        .insert(t.videoSession)
        .values({
          classId: cls.id,
          title: req.body.titre,
          startsAt: new Date(req.body.debut),
          durationMin: req.body.dureeMin,
          url: req.body.url,
          provider,
          createdBy: me,
        })
        .returning();
      return reply.code(201).send({ visio: v });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/ecole/classes/:id/visios',
    { preHandler: needTeacher, schema: idParams('id') },
    async (req, reply) => {
      const cls = await teacherClass(db, req.auth!.accountId, req.params.id);
      if (!cls) return err(reply, 404, 'introuvable');
      const visios = await db
        .select()
        .from(t.videoSession)
        .where(eq(t.videoSession.classId, cls.id))
        .orderBy(desc(t.videoSession.startsAt))
        .limit(50);
      const presences = visios.length
        ? await db
            .select()
            .from(t.videoPresence)
            .where(
              inArray(
                t.videoPresence.sessionId,
                visios.map((v) => v.id),
              ),
            )
        : [];
      return {
        visios: visios.map((v) => ({
          ...v,
          presences: presences.filter((p) => p.sessionId === v.id),
        })),
      };
    },
  );

  const teacherVideo = async (req: FastifyRequest, id: string) => {
    const [v] = await db.select().from(t.videoSession).where(eq(t.videoSession.id, id));
    return v && (await teacherClass(db, req.auth!.accountId, v.classId)) ? v : null;
  };

  app.post<{ Params: { id: string } }>(
    '/api/v1/ecole/visios/:id/annuler',
    { preHandler: needTeacher, schema: idParams('id') },
    async (req, reply) => {
      const v = await teacherVideo(req, req.params.id);
      if (!v) return err(reply, 404, 'introuvable');
      await db
        .update(t.videoSession)
        .set({ canceledAt: new Date() })
        .where(eq(t.videoSession.id, v.id));
      return { ok: true };
    },
  );

  app.put<{
    Params: { id: string };
    Body: { presences: Array<{ pupilId: string; present: boolean }> };
  }>(
    '/api/v1/ecole/visios/:id/presence',
    {
      preHandler: needTeacher,
      schema: {
        ...idParams('id'),
        body: {
          type: 'object',
          required: ['presences'],
          additionalProperties: false,
          properties: {
            presences: {
              type: 'array',
              maxItems: 200,
              items: {
                type: 'object',
                required: ['pupilId', 'present'],
                additionalProperties: false,
                properties: { pupilId: UUID, present: { type: 'boolean' } },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const v = await teacherVideo(req, req.params.id);
      if (!v) return err(reply, 404, 'introuvable');
      const pupils = new Set(
        (
          await db
            .select({ id: t.classPupil.id })
            .from(t.classPupil)
            .where(eq(t.classPupil.classId, v.classId))
        ).map((p) => p.id),
      );
      const rows = req.body.presences.filter((p) => pupils.has(p.pupilId));
      if (rows.length !== req.body.presences.length) return err(reply, 400, 'eleve_hors_classe');
      for (const p of rows)
        await db
          .insert(t.videoPresence)
          .values({ sessionId: v.id, pupilId: p.pupilId, present: p.present })
          .onConflictDoUpdate({
            target: [t.videoPresence.sessionId, t.videoPresence.pupilId],
            set: { present: p.present },
          });
      return { ok: true, notees: rows.length };
    },
  );

  /** séances à venir des classes d'un profil ; le lien n'est donné que 15 min avant le début et jusqu'à la fin */
  app.get<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/visios',
    { schema: idParams('id') },
    async (req, reply) => {
      if (!req.auth) return err(reply, 401, 'non_connecte');
      if (!(await ownsProfile(db, req.auth, req.params.id))) return err(reply, 404, 'introuvable');
      const classes = await profileClasses(db, req.params.id);
      if (!classes.length) return { visios: [] };
      const now = Date.now();
      const rows = await db
        .select()
        .from(t.videoSession)
        .where(
          and(
            inArray(
              t.videoSession.classId,
              classes.map((c) => c.id),
            ),
            isNull(t.videoSession.canceledAt),
            sql`${t.videoSession.startsAt} + make_interval(mins => ${t.videoSession.durationMin}) > now()`,
          ),
        )
        .orderBy(asc(t.videoSession.startsAt));
      return {
        visios: rows.map((v) => {
          const start = v.startsAt.getTime();
          const open = now >= start - 15 * 60_000 && now <= start + v.durationMin * 60_000;
          return {
            id: v.id,
            classe: classes.find((c) => c.id === v.classId)?.name,
            titre: v.title,
            debut: v.startsAt,
            dureeMin: v.durationMin,
            service: v.provider,
            url: open ? v.url : null,
          };
        }),
      };
    },
  );
}
