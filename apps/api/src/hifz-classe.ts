/**
 * Hifẓ en classe (25/10/2026, interrupteur `hifz_classe`, coupé par défaut) :
 *  - mode « DIRECT » (celui des enfants) : l'élève récite devant le maître, qui coche les erreurs MOT PAR MOT sur sa tablette (oubli,
 *    ajout, changement, tajwīd) ; AUCUN enregistrement, jamais (contrainte de la base : une séance « direct » n'a pas de lien
 *    vers un audio) ;
 *  - mode « ENREGISTREMENT » (adultes consentants seulement) : l'élève s'enregistre, le maître écoute et annote plus tard. La
 *    récitation est chiffrée (AES-256-GCM), conservée AU PLUS 30 jours (durée de la classe, 14 par défaut) puis EFFACÉE
 *    automatiquement chaque nuit (travailleur) ; l'élève peut la supprimer à tout moment ; l'annotation ne contient aucune voix ;
 *  - le maître valide la portion (ou la remet à reprendre) : événement « enseignant » dans le journal de hifẓ de l'élève et marques
 *    mot par mot dans sa carte des erreurs ; les PARENTS voient le suivi (jamais un audio).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  classMembers,
  classRecitations,
  hcCreerSeance,
  hcErreurs,
  hcRemplacerErreurs,
  hcSeance,
  hcSeancesClasse,
  hcSeancesProfil,
  hcTerminer,
  HC_CONSERVATION_MAX_JOURS,
  HC_ISSUES,
  HC_KINDS,
  HC_MAX_ERREURS,
  profileClasses,
  profileRecitations,
  recitationById,
  schema as t,
  storeRecitation,
  teacherClass,
  type Db,
  type HcErreurIn,
  type HcIssue,
  type HcSeanceRow,
  type RecitationKey,
} from '@awform/db';
import { audit, staffOnly } from './auth/service.js';
import { exigeFonction } from './f5.js';
import { err, familyProfile, minorHolder, needTeacher, parentGate, UUID } from './guards.js';
import { STOCKAGE_PAR_ELEVE_OCTETS, stockageRecitations } from './plafonds.js';
import { MAX_RECITATION_BYTES } from './recitations.js';
import { ownsProfile } from './auth/routes.js';

const MIMES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac'];
const PART = '^\\d{1,3}:\\d{1,3}(-\\d{1,3})?$';
const ERREURS: Record<string, number> = {
  mode_invalide: 400,
  portion_invalide: 400,
  portion_trop_longue: 400,
  direct_sans_enregistrement: 400,
  enregistrement_requis: 400,
  erreur_invalide: 400,
  trop_d_erreurs: 400,
  seance_terminee: 409,
  issue_invalide: 400,
  remarque_trop_longue: 400,
  evenement_refuse: 409,
};
const metier = (reply: FastifyReply, e: unknown) => {
  const code = e instanceof Error ? e.message : '';
  if (code in ERREURS) return err(reply, ERREURS[code]!, code);
  throw e;
};

export function registerHifzClasse(app: FastifyInstance, db: Db, key: RecitationKey | null): void {
  /** nombre de versets de la sourate (texte Tanzil importé), pour borner une portion */
  const ayasMax = async (sura: number) => {
    const [r] = await db
      .select({ n: sql<number>`max(${t.quranVerse.aya})::int` })
      .from(t.quranVerse)
      .where(eq(t.quranVerse.sura, sura));
    return r?.n ?? undefined;
  };
  const activeConsent = async (profileId: string) => {
    const [c] = await db
      .select({ id: t.consent.id })
      .from(t.consent)
      .where(
        and(
          eq(t.consent.profileId, profileId),
          eq(t.consent.type, 'envoi_recitation'),
          sql`${t.consent.withdrawnAt} IS NULL`,
        ),
      );
    return !!c;
  };

  // ---------------------------------------------------------------- le maître

  /** la classe de ce maître + fonction ouverte ; sinon le refus est envoyé et on renvoie null */
  const classeDuMaitre = async (req: FastifyRequest, reply: FastifyReply, classId: string) => {
    const cls = await teacherClass(db, req.auth!.accountId, classId);
    if (!cls) {
      err(reply, 404, 'introuvable');
      return null;
    }
    if (!(await exigeFonction(db, req, reply, 'hifz_classe', null))) return null;
    return cls;
  };
  /** la séance, si elle est d'une classe de ce maître ; sinon le refus est envoyé et on renvoie null */
  const seanceDuMaitre = async (
    req: FastifyRequest,
    reply: FastifyReply,
    sid: string,
  ): Promise<HcSeanceRow | null> => {
    const s = await hcSeance(db, sid);
    if (!s || !(await teacherClass(db, req.auth!.accountId, s.classId))) {
      void err(reply, 404, 'introuvable');
      return null;
    }
    if (!(await exigeFonction(db, req, reply, 'hifz_classe', null))) return null;
    return s;
  };

  app.get<{ Params: { id: string } }>(
    '/api/v1/ecole/classes/:id/hifz/eleves',
    {
      preHandler: needTeacher,
      schema: { params: { type: 'object', required: ['id'], properties: { id: UUID } } },
    },
    async (req, reply) => {
      const cls = await classeDuMaitre(req, reply, req.params.id);
      if (!cls) return reply;
      const membres = await classMembers(db, cls.id);
      const adultes = new Set(membres.filter((m) => m.kind === 'adulte').map((m) => m.id));
      const seances = await hcSeancesClasse(db, cls.id, undefined, 30);
      const annotees = new Set(
        (
          await db
            .select({ r: t.hifzClasseSeance.recitationId })
            .from(t.hifzClasseSeance)
            .where(eq(t.hifzClasseSeance.classId, cls.id))
        )
          .map((x) => x.r)
          .filter((x): x is string => !!x),
      );
      // seuls les enregistrements d'ADULTES sont annotés en hifẓ en classe
      const enregistrements = (await classRecitations(db, cls.id))
        .filter((r) => adultes.has(r.profileId))
        .map((r) => ({
          id: r.id,
          profileId: r.profileId,
          pseudonym: r.pseudonym,
          part: r.part,
          createdAt: r.createdAt,
          expiresAt: r.expiresAt,
          annotee: annotees.has(r.id),
        }));
      return {
        classe: { id: cls.id, name: cls.name },
        eleves: membres.map((m) => ({ id: m.id, pseudonym: m.pseudonym, kind: m.kind })),
        enregistrements,
        seances,
        types: HC_KINDS,
      };
    },
  );

  app.post<{
    Params: { id: string };
    Body: {
      profileId: string;
      mode: 'direct' | 'enregistrement';
      sura: number;
      from: number;
      to: number;
      recitationId?: string;
    };
  }>(
    '/api/v1/ecole/classes/:id/hifz/seances',
    {
      preHandler: needTeacher,
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: UUID } },
        body: {
          type: 'object',
          required: ['profileId', 'mode', 'sura', 'from', 'to'],
          additionalProperties: false,
          properties: {
            profileId: UUID,
            mode: { enum: ['direct', 'enregistrement'] },
            sura: { type: 'integer', minimum: 1, maximum: 114 },
            from: { type: 'integer', minimum: 1, maximum: 286 },
            to: { type: 'integer', minimum: 1, maximum: 286 },
            recitationId: UUID,
          },
        },
      },
    },
    async (req, reply) => {
      const cls = await classeDuMaitre(req, reply, req.params.id);
      if (!cls) return reply;
      if (cls.status !== 'active') return err(reply, 409, 'classe_archivee');
      const b = req.body;
      const membre = (await classMembers(db, cls.id)).find((m) => m.id === b.profileId);
      if (!membre) return err(reply, 404, 'introuvable');
      if (b.mode === 'enregistrement') {
        // le mode enregistrement est réservé aux ADULTES consentants
        if (membre.kind !== 'adulte') return err(reply, 403, 'enregistrement_adultes_seulement');
        const r = b.recitationId ? await recitationById(db, b.recitationId) : null;
        if (!r || r.classId !== cls.id || r.profileId !== b.profileId || r.expiresAt <= new Date())
          return err(reply, 404, 'enregistrement_introuvable');
      }
      try {
        const s = await hcCreerSeance(
          db,
          {
            classId: cls.id,
            profileId: b.profileId,
            teacherAccountId: req.auth!.accountId,
            mode: b.mode,
            sura: b.sura,
            from: b.from,
            to: b.to,
            recitationId: b.recitationId ?? null,
          },
          new Map([[b.sura, (await ayasMax(b.sura)) ?? 286]]),
        );
        await audit(db, req.auth!.accountId, 'hifz_classe.seance', s.id, {
          mode: b.mode,
          classe: cls.id,
        });
        return reply.code(201).send({ seance: { id: s.id, mode: s.mode } });
      } catch (e) {
        return metier(reply, e);
      }
    },
  );

  app.get<{ Params: { sid: string } }>(
    '/api/v1/ecole/hifz/seances/:sid',
    {
      preHandler: needTeacher,
      schema: { params: { type: 'object', required: ['sid'], properties: { sid: UUID } } },
    },
    async (req, reply) => {
      const s = await seanceDuMaitre(req, reply, req.params.sid);
      if (!s) return reply;
      return {
        seance: {
          id: s.id,
          classId: s.classId,
          profileId: s.profileId,
          mode: s.mode,
          sura: s.sura,
          from: s.fromAya,
          to: s.toAya,
          status: s.status,
          outcome: s.outcome,
          remark: s.remark,
          recitationId: s.recitationId,
        },
        erreurs: await hcErreurs(db, s.id),
      };
    },
  );

  app.put<{ Params: { sid: string }; Body: { erreurs: HcErreurIn[] } }>(
    '/api/v1/ecole/hifz/seances/:sid/erreurs',
    {
      preHandler: needTeacher,
      schema: {
        params: { type: 'object', required: ['sid'], properties: { sid: UUID } },
        body: {
          type: 'object',
          required: ['erreurs'],
          additionalProperties: false,
          properties: {
            erreurs: {
              type: 'array',
              maxItems: HC_MAX_ERREURS,
              items: {
                type: 'object',
                required: ['a', 'k', 't'],
                additionalProperties: false,
                properties: {
                  a: { type: 'integer', minimum: 1, maximum: 286 },
                  k: { type: 'integer', minimum: 0, maximum: 300 },
                  t: { enum: [...HC_KINDS] },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const s = await seanceDuMaitre(req, reply, req.params.sid);
      if (!s) return reply;
      try {
        return { n: await hcRemplacerErreurs(db, s, req.body.erreurs) };
      } catch (e) {
        return metier(reply, e);
      }
    },
  );

  app.post<{ Params: { sid: string }; Body: { issue: HcIssue; remarque?: string } }>(
    '/api/v1/ecole/hifz/seances/:sid/terminer',
    {
      preHandler: needTeacher,
      schema: {
        params: { type: 'object', required: ['sid'], properties: { sid: UUID } },
        body: {
          type: 'object',
          required: ['issue'],
          additionalProperties: false,
          properties: {
            issue: { enum: [...HC_ISSUES] },
            remarque: { type: 'string', maxLength: 300 },
          },
        },
      },
    },
    async (req, reply) => {
      const s = await seanceDuMaitre(req, reply, req.params.sid);
      if (!s) return reply;
      try {
        const r = await hcTerminer(
          db,
          s,
          req.body.issue,
          req.body.remarque?.trim() || null,
          req.auth!.accountId,
        );
        await audit(db, req.auth!.accountId, 'hifz_classe.validation', s.id, {
          issue: req.body.issue,
          q: r.q,
        });
        return { ok: true, q: r.q, erreurs: r.erreurs };
      } catch (e) {
        return metier(reply, e);
      }
    },
  );

  app.get<{ Params: { id: string }; Querystring: { profil?: string } }>(
    '/api/v1/ecole/classes/:id/hifz/seances',
    {
      preHandler: needTeacher,
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: UUID } },
        querystring: { type: 'object', properties: { profil: UUID } },
      },
    },
    async (req, reply) => {
      const cls = await classeDuMaitre(req, reply, req.params.id);
      if (!cls) return reply;
      return { seances: await hcSeancesClasse(db, cls.id, req.query.profil) };
    },
  );

  // ---------------------------------------------------------------- l'élève adulte (mode enregistrement)

  app.get<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/hifz-classe',
    { schema: { params: { type: 'object', required: ['id'], properties: { id: UUID } } } },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      if (!(await exigeFonction(db, req, reply, 'hifz_classe', p.id))) return reply;
      const classes = await profileClasses(db, p.id);
      const jours = new Map(
        classes.length
          ? (
              await db
                .select({ id: t.classGroup.id, d: t.classGroup.recitationDays })
                .from(t.classGroup)
                .where(
                  inArray(
                    t.classGroup.id,
                    classes.map((c) => c.id),
                  ),
                )
            ).map((c) => [c.id, c.d] as const)
          : [],
      );
      return {
        adulte: p.kind === 'adulte' && !(await minorHolder(db, req.auth!.accountId)),
        disponible: !!key,
        accord: await activeConsent(p.id),
        conservationMaxJours: HC_CONSERVATION_MAX_JOURS,
        classes: classes.map((c) => ({
          id: c.id,
          name: c.name,
          jours: Math.min(HC_CONSERVATION_MAX_JOURS, Math.max(1, jours.get(c.id) ?? 14)),
        })),
        enregistrements: await profileRecitations(db, p.id),
        suivi: await hcSeancesProfil(db, p.id),
      };
    },
  );

  app.post<{
    Params: { id: string };
    Querystring: { classe: string; passage: string; duree?: number };
  }>(
    '/api/v1/profiles/:id/hifz-classe/enregistrements',
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
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      if (!(await exigeFonction(db, req, reply, 'hifz_classe', p.id))) return reply;
      if (!key) return err(reply, 503, 'envoi_indisponible');
      // réservé aux ADULTES (titulaire majeur de son propre profil) : jamais la voix d'un enfant ni d'un ado
      if (p.kind !== 'adulte' || (await minorHolder(db, req.auth!.accountId)))
        return err(reply, 403, 'enregistrement_adultes_seulement');
      if (!(await activeConsent(p.id))) return err(reply, 409, 'accord_requis');
      if (!(await parentGate(db, req, reply, p.kind))) return reply;
      const mime = String(req.headers['content-type'] ?? '')
        .split(';')[0]!
        .trim();
      if (!MIMES.includes(mime) || !Buffer.isBuffer(req.body) || !req.body.length)
        return err(reply, 400, 'audio_invalide');
      const classes = await profileClasses(db, p.id);
      if (!classes.some((c) => c.id === req.query.classe))
        return err(reply, 404, 'classe_inconnue');
      if ((await stockageRecitations(db, p.id)) + req.body.length > STOCKAGE_PAR_ELEVE_OCTETS)
        return err(reply, 413, 'quota_stockage');
      const [cls] = await db
        .select({ days: t.classGroup.recitationDays })
        .from(t.classGroup)
        .where(eq(t.classGroup.id, req.query.classe));
      // durée de conservation : celle de la classe, jamais plus de 30 jours ; puis suppression automatique (travailleur)
      const days = Math.min(HC_CONSERVATION_MAX_JOURS, Math.max(1, cls?.days ?? 14));
      const r = await storeRecitation(db, key, {
        profileId: p.id,
        classId: req.query.classe,
        part: req.query.passage,
        mime,
        durationS: req.query.duree ?? null,
        audio: req.body,
        sentBy: req.auth!.accountId,
        days,
        idempotencyKey: /^[A-Za-z0-9_-]{8,80}$/.test(String(req.headers['idempotency-key'] ?? ''))
          ? String(req.headers['idempotency-key'])
          : null,
      });
      await audit(db, req.auth!.accountId, 'hifz_classe.enregistrement', r.id, {
        profil: p.id,
        classe: req.query.classe,
        octets: req.body.length,
        jours: days,
      });
      return reply.code(r.duplicate ? 200 : 201).send({ recitation: r, jours: days });
    },
  );

  // ---------------------------------------------------------------- la famille : suivi

  app.get<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/hifz-classe/suivi',
    {
      schema: { params: { type: 'object', required: ['id'], properties: { id: UUID } } },
    },
    async (req, reply) => {
      if (!req.auth) return err(reply, 401, 'non_connecte');
      if (staffOnly(req.auth)) return err(reply, 403, 'reserve_aux_familles');
      if (!(await ownsProfile(db, req.auth, req.params.id))) return err(reply, 404, 'introuvable');
      if (!(await exigeFonction(db, req, reply, 'hifz_classe', req.params.id))) return reply;
      // séances terminées seulement : portion, issue, nombre d'erreurs par type, remarque du maître ; jamais un audio
      return { seances: await hcSeancesProfil(db, req.params.id) };
    },
  );
}
