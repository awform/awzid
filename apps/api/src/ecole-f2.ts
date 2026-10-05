/**
 * Lot F2 (revue d'architecture E1, E2, E3, E4, E8) — routes de l'école, des responsables et du parcours :
 *  - école : création, personnel (direction, enseignant, secrétariat), enseignants d'une classe (titulaire,
 *    suppléants), transfert d'une classe, années scolaires, passage de fin d'année ;
 *  - élèves inscrits par l'école : conversion d'un élève « papier » en profil (consentement PAPIER prouvé),
 *    code de rattachement à un parent, mode TABLETTE de classe, registre archivé, niveau décidé par le maître ;
 *  - famille : responsables d'un profil, second parent (invitation, acceptation), émancipation ;
 *  - parcours : niveau par matière (historisé) et « mon parcours » (prêt pour A27).
 * Données des mineurs : tout ce qui touche une classe exige un rôle dans son école et le second facteur.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import {
  acceptParentInvite,
  addSchoolMember,
  archivedPupils,
  claimProfile,
  closeSchoolYear,
  convertPaperPupil,
  createInvite,
  createSchool,
  currentLevels,
  custodiansOf,
  endCustodian,
  ensureSchoolAccount,
  learnerPath,
  levelHistory,
  levelLemmas,
  memberRoles,
  paperResults,
  prepareSchoolYear,
  removeClassTeacher,
  removeSchoolMember,
  schema as t,
  schoolById,
  schoolClasses,
  schoolMembers,
  schoolsOf,
  schoolYears,
  setClassTeacher,
  setProfileLevel,
  teacherClass,
  transferClass,
  yearPupils,
  classTeachers,
  type Db,
} from '@awform/db';
import { ownsProfile } from './auth/routes.js';
import { hashSecret, verifySecret } from './auth/crypto.js';
import { ageFromYear, consentAge } from './auth/policy.js';
import {
  audit,
  clearFailures,
  COOKIE,
  createSession,
  failAttempt,
  isTeacher,
  lockedUntil,
  recordFailure,
  reserveAttempt,
  sessionCookie,
  staffOnly,
} from './auth/service.js';
import { err, UUID } from './guards.js';
import { DAY, LEVEL, type Edition } from './school-common.js';

const CODE = { type: 'string', minLength: 8, maxLength: 14 } as const;
const YEAR_LABEL = '^\\d{4}-\\d{4}$';

export interface F2Options {
  /** cookie « Secure » de la session de tablette (comme les autres sessions) */
  secureFor: (req: FastifyRequest) => boolean;
}

export function registerEcoleF2(
  app: FastifyInstance,
  db: Db,
  edition: Edition,
  opts: F2Options,
): void {
  const me = (req: FastifyRequest) => req.auth!.accountId;
  const ids = (...keys: string[]) => ({
    params: {
      type: 'object',
      required: keys,
      properties: Object.fromEntries(keys.map((k) => [k, UUID])),
    },
  });

  /** personnel d'école (enseignant, direction, secrétariat), second facteur vérifié */
  const needStaff = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return err(reply, 401, 'non_connecte');
    if (!isTeacher(req.auth) && !req.auth.roles.includes('secretariat'))
      return err(reply, 403, 'reserve_aux_enseignants');
    if (!req.auth.mfaVerified)
      return err(reply, 403, req.auth.totpEnabled ? 'totp_requis' : 'mfa_a_configurer');
  };
  const pre = { preHandler: needStaff };

  /** rôles du compte dans l'école ; null (refus envoyé) si aucun */
  const schoolRoles = async (req: FastifyRequest, reply: FastifyReply, schoolId: string) => {
    const roles = await memberRoles(db, me(req), schoolId);
    if (!roles.length) {
      void err(reply, 404, 'introuvable');
      return null;
    }
    return roles;
  };
  const needDirection = async (req: FastifyRequest, reply: FastifyReply, schoolId: string) => {
    const roles = await schoolRoles(req, reply, schoolId);
    if (!roles) return false;
    if (!roles.includes('direction')) {
      void err(reply, 403, 'reserve_direction');
      return false;
    }
    return true;
  };

  /** classe accessible : enseignant de la classe, direction — ou secrétariat de l'école si `secretariat` */
  const staffClass = async (req: FastifyRequest, classId: string, secretariat = false) => {
    const cls = await teacherClass(db, me(req), classId);
    if (cls) return { cls, roles: await memberRoles(db, me(req), cls.schoolId) };
    if (!secretariat) return null;
    const [c] = await db.select().from(t.classGroup).where(eq(t.classGroup.id, classId));
    if (!c) return null;
    const roles = await memberRoles(db, me(req), c.schoolId);
    return roles.includes('secretariat') ? { cls: c, roles } : null;
  };
  const staffPupil = async (req: FastifyRequest, pupilId: string, secretariat = false) => {
    const [p] = await db.select().from(t.classPupil).where(eq(t.classPupil.id, pupilId));
    if (!p) return null;
    const c = await staffClass(req, p.classId, secretariat);
    return c ? { pupil: p, ...c } : null;
  };

  // ================================================================ écoles

  app.get('/api/v1/ecole/ecoles', pre, async (req) => {
    const list = await schoolsOf(db, me(req));
    return {
      ecoles: list.map((s) => ({
        id: s.school.id,
        name: s.school.name,
        nameAr: s.school.nameAr,
        place: s.school.place,
        personal: s.school.personal,
        status: s.school.status,
        roles: s.roles,
      })),
    };
  });

  app.post<{
    Body: { name: string; nameAr?: string | null; country?: string | null; place?: string | null };
  }>(
    '/api/v1/ecole/ecoles',
    {
      ...pre,
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 120 },
            nameAr: { type: ['string', 'null'], maxLength: 120 },
            country: { type: ['string', 'null'], pattern: '^[A-Z]{2}$' },
            place: { type: ['string', 'null'], maxLength: 80 },
          },
        },
      },
    },
    async (req, reply) => {
      if (!isTeacher(req.auth)) return err(reply, 403, 'reserve_aux_enseignants');
      const s = await createSchool(
        db,
        {
          name: req.body.name,
          nameAr: req.body.nameAr ?? null,
          country: req.body.country ?? req.auth!.country,
          place: req.body.place ?? null,
        },
        me(req),
      );
      await audit(db, me(req), 'ecole.creation', s.id);
      return reply.code(201).send({ ecole: s });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/ecole/ecoles/:id',
    { ...pre, schema: ids('id') },
    async (req, reply) => {
      const roles = await schoolRoles(req, reply, req.params.id);
      if (!roles) return reply;
      const s = (await schoolById(db, req.params.id))!;
      const lead = roles.includes('direction') || roles.includes('secretariat');
      const classes = await schoolClasses(db, s.id);
      const mine = new Set(
        (
          await db
            .select({ c: t.classTeacher.classId })
            .from(t.classTeacher)
            .where(eq(t.classTeacher.accountId, me(req)))
        ).map((r) => r.c),
      );
      return {
        ecole: {
          id: s.id,
          name: s.name,
          nameAr: s.nameAr,
          place: s.place,
          placeAr: s.placeAr,
          country: s.country,
          personal: s.personal,
          status: s.status,
        },
        roles,
        membres: lead ? await schoolMembers(db, s.id) : [],
        classes: lead ? classes : classes.filter((c) => mine.has(c.id)),
        annees: await schoolYears(db, s.id),
      };
    },
  );

  app.patch<{
    Params: { id: string };
    Body: { name?: string; nameAr?: string | null; place?: string | null; placeAr?: string | null };
  }>(
    '/api/v1/ecole/ecoles/:id',
    {
      ...pre,
      schema: {
        ...ids('id'),
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 120 },
            nameAr: { type: ['string', 'null'], maxLength: 120 },
            place: { type: ['string', 'null'], maxLength: 80 },
            placeAr: { type: ['string', 'null'], maxLength: 80 },
          },
        },
      },
    },
    async (req, reply) => {
      if (!(await needDirection(req, reply, req.params.id))) return reply;
      const [s] = await db
        .update(t.school)
        .set(req.body)
        .where(eq(t.school.id, req.params.id))
        .returning();
      await audit(db, me(req), 'ecole.reglages', s!.id, Object.keys(req.body));
      return { ecole: s };
    },
  );

  // ---------------------------------------------------------------- personnel

  app.post<{
    Params: { id: string };
    Body: { email: string; role: 'direction' | 'enseignant' | 'secretariat' };
  }>(
    '/api/v1/ecole/ecoles/:id/membres',
    {
      ...pre,
      schema: {
        ...ids('id'),
        body: {
          type: 'object',
          required: ['email', 'role'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', maxLength: 254 },
            role: { enum: ['direction', 'enseignant', 'secretariat'] },
          },
        },
      },
    },
    async (req, reply) => {
      if (!(await needDirection(req, reply, req.params.id))) return reply;
      // essais limités : on ne sonde pas l'existence des adresses
      const key = `membre:${me(req)}`;
      if (await lockedUntil(db, key)) return err(reply, 429, 'verrouille');
      const [a] = await db
        .select({ id: t.account.id, kind: t.account.kind })
        .from(t.account)
        .where(
          and(
            eq(t.account.email, req.body.email.trim().toLowerCase()),
            isNull(t.account.deletedAt),
          ),
        );
      // un compte d'école (technique) ou un compte inconnu ne devient jamais personnel
      if (!a || a.kind === 'ecole') {
        await recordFailure(db, key, 20);
        return err(reply, 404, 'compte_inconnu');
      }
      await addSchoolMember(db, req.params.id, a.id, req.body.role, me(req));
      await audit(db, me(req), 'ecole.membre.ajout', req.params.id, { role: req.body.role });
      return reply.code(201).send({ ok: true, accountId: a.id });
    },
  );

  app.delete<{ Params: { id: string; accountId: string; role: string } }>(
    '/api/v1/ecole/ecoles/:id/membres/:accountId/:role',
    {
      ...pre,
      schema: {
        params: {
          type: 'object',
          required: ['id', 'accountId', 'role'],
          properties: {
            id: UUID,
            accountId: UUID,
            role: { enum: ['direction', 'enseignant', 'secretariat'] },
          },
        },
      },
    },
    async (req, reply) => {
      if (!(await needDirection(req, reply, req.params.id))) return reply;
      const ok = await removeSchoolMember(
        db,
        req.params.id,
        req.params.accountId,
        req.params.role as 'direction' | 'enseignant' | 'secretariat',
      );
      if (!ok) return err(reply, 409, 'derniere_direction');
      await audit(db, me(req), 'ecole.membre.retrait', req.params.id, { role: req.params.role });
      return { ok: true };
    },
  );

  // ---------------------------------------------------------------- enseignants d'une classe, transfert

  app.get<{ Params: { id: string } }>(
    '/api/v1/ecole/classes/:id/enseignants',
    { ...pre, schema: ids('id') },
    async (req, reply) => {
      const c = await staffClass(req, req.params.id, true);
      if (!c) return err(reply, 404, 'introuvable');
      return { enseignants: await classTeachers(db, c.cls.id) };
    },
  );

  /** direction de l'école, ou titulaire de la classe (pour ses suppléants) */
  const canManageTeachers = async (req: FastifyRequest, classId: string) => {
    const c = await staffClass(req, classId);
    if (!c) return null;
    const lead = c.roles.includes('direction') || c.cls.teacherAccountId === me(req);
    return lead ? c : null;
  };

  app.put<{ Params: { id: string; accountId: string }; Body: { role: 'titulaire' | 'suppleant' } }>(
    '/api/v1/ecole/classes/:id/enseignants/:accountId',
    {
      ...pre,
      schema: {
        ...ids('id', 'accountId'),
        body: {
          type: 'object',
          required: ['role'],
          additionalProperties: false,
          properties: { role: { enum: ['titulaire', 'suppleant'] } },
        },
      },
    },
    async (req, reply) => {
      const c = await canManageTeachers(req, req.params.id);
      if (!c) return err(reply, 404, 'introuvable');
      if (req.body.role === 'titulaire' && !c.roles.includes('direction'))
        return err(reply, 403, 'reserve_direction');
      if (!(await setClassTeacher(db, c.cls.id, req.params.accountId, req.body.role)))
        return err(reply, 400, 'pas_enseignant_de_l_ecole');
      await audit(db, me(req), 'classe.enseignant', c.cls.id, { role: req.body.role });
      return { enseignants: await classTeachers(db, c.cls.id) };
    },
  );

  app.delete<{ Params: { id: string; accountId: string } }>(
    '/api/v1/ecole/classes/:id/enseignants/:accountId',
    { ...pre, schema: ids('id', 'accountId') },
    async (req, reply) => {
      const self = req.params.accountId === me(req);
      const c = self
        ? await staffClass(req, req.params.id)
        : await canManageTeachers(req, req.params.id);
      if (!c) return err(reply, 404, 'introuvable');
      await removeClassTeacher(db, c.cls.id, req.params.accountId);
      await audit(db, me(req), 'classe.enseignant.retrait', c.cls.id);
      return { enseignants: await classTeachers(db, c.cls.id) };
    },
  );

  app.post<{ Params: { id: string }; Body: { accountId: string; garderAncien?: boolean } }>(
    '/api/v1/ecole/classes/:id/transfert',
    {
      ...pre,
      schema: {
        ...ids('id'),
        body: {
          type: 'object',
          required: ['accountId'],
          additionalProperties: false,
          properties: { accountId: UUID, garderAncien: { type: 'boolean' } },
        },
      },
    },
    async (req, reply) => {
      const c = await canManageTeachers(req, req.params.id);
      if (!c) return err(reply, 404, 'introuvable');
      if (!(await transferClass(db, c.cls.id, req.body.accountId, req.body.garderAncien === true)))
        return err(reply, 400, 'pas_enseignant_de_l_ecole');
      await audit(db, me(req), 'classe.transfert', c.cls.id, { vers: req.body.accountId });
      return { enseignants: await classTeachers(db, c.cls.id) };
    },
  );

  // ---------------------------------------------------------------- années et passage de fin d'année

  const yearSchool = async (yearId: string) =>
    (await db.select().from(t.schoolYear).where(eq(t.schoolYear.id, yearId)))[0] ?? null;

  app.post<{ Params: { id: string }; Body: { label: string; startsOn: string; endsOn: string } }>(
    '/api/v1/ecole/ecoles/:id/annees',
    {
      ...pre,
      schema: {
        ...ids('id'),
        body: {
          type: 'object',
          required: ['label', 'startsOn', 'endsOn'],
          additionalProperties: false,
          properties: {
            label: { type: 'string', pattern: YEAR_LABEL },
            startsOn: { type: 'string', pattern: DAY },
            endsOn: { type: 'string', pattern: DAY },
          },
        },
      },
    },
    async (req, reply) => {
      if (!(await needDirection(req, reply, req.params.id))) return reply;
      if (req.body.endsOn <= req.body.startsOn) return err(reply, 400, 'dates_invalides');
      const y = await prepareSchoolYear(db, req.params.id, req.body);
      if (!y) return err(reply, 409, 'annee_existante');
      return reply.code(201).send({ annee: y });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/ecole/annees/:id/eleves',
    { ...pre, schema: ids('id') },
    async (req, reply) => {
      const y = await yearSchool(req.params.id);
      if (!y) return err(reply, 404, 'introuvable');
      if (!(await needDirection(req, reply, y.schoolId))) return reply;
      return { annee: y, eleves: await yearPupils(db, y.id) };
    },
  );

  app.post<{
    Params: { id: string };
    Body: {
      decisions: Array<{
        pupilId: string;
        outcome: 'admis' | 'redouble' | 'parti';
        nextClassId?: string | null;
      }>;
      next?: { label: string; startsOn: string; endsOn: string } | null;
    };
  }>(
    '/api/v1/ecole/annees/:id/cloture',
    {
      ...pre,
      schema: {
        ...ids('id'),
        body: {
          type: 'object',
          required: ['decisions'],
          additionalProperties: false,
          properties: {
            decisions: {
              type: 'array',
              maxItems: 5000,
              items: {
                type: 'object',
                required: ['pupilId', 'outcome'],
                additionalProperties: false,
                properties: {
                  pupilId: UUID,
                  outcome: { enum: ['admis', 'redouble', 'parti'] },
                  nextClassId: { type: ['string', 'null'], format: 'uuid' },
                },
              },
            },
            next: {
              type: ['object', 'null'],
              required: ['label', 'startsOn', 'endsOn'],
              additionalProperties: false,
              properties: {
                label: { type: 'string', pattern: YEAR_LABEL },
                startsOn: { type: 'string', pattern: DAY },
                endsOn: { type: 'string', pattern: DAY },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const y = await yearSchool(req.params.id);
      if (!y) return err(reply, 404, 'introuvable');
      if (!(await needDirection(req, reply, y.schoolId))) return reply;
      const r = await closeSchoolYear(db, {
        yearId: y.id,
        by: me(req),
        decisions: req.body.decisions,
        next: req.body.next ?? null,
      });
      if ('error' in r) return err(reply, 400, r.error, r.missing ? { manquants: r.missing } : {});
      await audit(db, me(req), 'ecole.annee.cloture', y.id, r);
      return r;
    },
  );

  // ---------------------------------------------------------------- élèves de l'école

  /** registre ARCHIVÉ de la classe : élèves partis, avec leurs notes (jamais effacées au départ) */
  app.get<{ Params: { id: string } }>(
    '/api/v1/ecole/classes/:id/archives',
    { ...pre, schema: ids('id') },
    async (req, reply) => {
      const c = await staffClass(req, req.params.id, true);
      if (!c) return err(reply, 404, 'introuvable');
      const pupils = await archivedPupils(db, c.cls.id);
      const notes = await paperResults(
        db,
        pupils.map((p) => p.id),
      );
      return {
        eleves: pupils.map((p) => ({ ...p, notes: notes.filter((n) => n.pupilId === p.id) })),
      };
    },
  );

  app.post<{
    Params: { pid: string };
    Body: {
      pseudonym?: string;
      birthYear: number;
      avatar?: string;
      levelCode?: string | null;
      consent: {
        date: string;
        signataire: 'parent' | 'tuteur' | 'autre';
        reference?: string | null;
      };
    };
  }>(
    '/api/v1/ecole/pupils/:pid/profil',
    {
      ...pre,
      schema: {
        ...ids('pid'),
        body: {
          type: 'object',
          required: ['birthYear', 'consent'],
          additionalProperties: false,
          properties: {
            pseudonym: { type: 'string', minLength: 1, maxLength: 40 },
            birthYear: { type: 'integer', minimum: 1990, maximum: 2100 },
            avatar: { enum: ['etoile', 'lune', 'soleil', 'feuille', 'goutte', 'livre'] },
            levelCode: { type: ['string', 'null'], pattern: LEVEL },
            consent: {
              type: 'object',
              required: ['date', 'signataire'],
              additionalProperties: false,
              properties: {
                date: { type: 'string', pattern: DAY },
                signataire: { enum: ['parent', 'tuteur', 'autre'] },
                reference: { type: ['string', 'null'], maxLength: 60 },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const x = await staffPupil(req, req.params.pid, true);
      if (!x || x.pupil.leftAt) return err(reply, 404, 'introuvable');
      const age = ageFromYear(req.body.birthYear);
      if (age < 3) return err(reply, 400, 'annee_naissance_invalide');
      // un élève inscrit par l'école est un MINEUR (un adulte ouvre son propre compte)
      if (age >= 18) return err(reply, 400, 'adulte_compte_personnel');
      if (req.body.consent.date > new Date().toISOString().slice(0, 10))
        return err(reply, 400, 'date_consentement_invalide');
      const levelCode = req.body.levelCode ?? x.cls.levelCode ?? null;
      if (levelCode) {
        const [lv] = await db
          .select({ c: t.level.code })
          .from(t.level)
          .where(eq(t.level.code, levelCode));
        if (!lv) return err(reply, 400, 'niveau_inconnu');
      }
      const r = await convertPaperPupil(db, {
        pupilId: x.pupil.id,
        classId: x.cls.id,
        schoolId: x.cls.schoolId,
        pseudonym: (req.body.pseudonym ?? x.pupil.displayName).trim().slice(0, 40),
        birthYear: req.body.birthYear,
        avatar: req.body.avatar ?? null,
        levelCode,
        consent: req.body.consent,
        by: me(req),
      });
      if (r === 'deja_profil') return err(reply, 409, 'deja_profil');
      if (levelCode) await setProfileLevel(db, r.profileId, levelCode, 'inscription', me(req));
      await audit(db, me(req), 'ecole.eleve.profil', r.profileId, { classe: x.cls.id });
      return reply.code(201).send({ profileId: r.profileId });
    },
  );

  /** code à remettre (sur papier) au parent pour rattacher le profil de l'élève à son compte */
  app.post<{ Params: { pid: string } }>(
    '/api/v1/ecole/pupils/:pid/code-parent',
    { ...pre, schema: ids('pid') },
    async (req, reply) => {
      const x = await staffPupil(req, req.params.pid, true);
      if (!x?.pupil.profileId) return err(reply, 404, 'introuvable');
      const [sc] = await db
        .select({ id: t.profileCustodian.id })
        .from(t.profileCustodian)
        .where(
          and(
            eq(t.profileCustodian.profileId, x.pupil.profileId),
            eq(t.profileCustodian.schoolId, x.cls.schoolId),
            eq(t.profileCustodian.nature, 'ecole'),
            eq(t.profileCustodian.status, 'actif'),
          ),
        );
      if (!sc) return err(reply, 409, 'profil_non_gere_par_l_ecole');
      const inv = await createInvite(db, {
        profileId: x.pupil.profileId,
        nature: 'parent',
        schoolId: x.cls.schoolId,
        createdBy: me(req),
        days: 60,
      });
      await audit(db, me(req), 'ecole.eleve.code_parent', x.pupil.profileId);
      return reply.code(201).send({ code: inv.code, expire: inv.expiresAt });
    },
  );

  /** niveau d'un élève décidé par le maître (épreuve de passage, positionnement, décision) */
  app.put<{
    Params: { pid: string };
    Body: {
      levelCode: string;
      source: 'enseignant' | 'epreuve' | 'positionnement';
      note?: string | null;
    };
  }>(
    '/api/v1/ecole/pupils/:pid/niveau',
    {
      ...pre,
      schema: {
        ...ids('pid'),
        body: {
          type: 'object',
          required: ['levelCode', 'source'],
          additionalProperties: false,
          properties: {
            levelCode: { type: 'string', pattern: LEVEL },
            source: { enum: ['enseignant', 'epreuve', 'positionnement'] },
            note: { type: ['string', 'null'], maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      const x = await staffPupil(req, req.params.pid);
      if (!x?.pupil.profileId || x.pupil.leftAt) return err(reply, 404, 'introuvable');
      const ok = await setProfileLevel(
        db,
        x.pupil.profileId,
        req.body.levelCode,
        req.body.source,
        me(req),
        {
          classe: x.cls.id,
          note: req.body.note ?? null,
        },
      );
      if (!ok) return err(reply, 400, 'niveau_inconnu');
      await audit(db, me(req), 'ecole.eleve.niveau', x.pupil.profileId, {
        niveau: req.body.levelCode,
        source: req.body.source,
      });
      return { niveaux: await currentLevels(db, x.pupil.profileId) };
    },
  );

  /**
   * Mode TABLETTE DE CLASSE : l'enseignant ouvre, sur l'appareil de la classe, une session limitée aux élèves de
   * cette classe (profils inscrits par l'école, ou par leur parent qui a donné le code de classe). Sa propre
   * session est fermée sur cet appareil ; il se reconnecte normalement pour en sortir.
   */
  app.post<{ Params: { id: string }; Body: { pin?: string } }>(
    '/api/v1/ecole/classes/:id/tablette',
    {
      ...pre,
      schema: {
        ...ids('id'),
        body: {
          type: 'object',
          additionalProperties: false,
          properties: { pin: { type: 'string', pattern: '^[0-9]{4}$' } },
        },
      },
    },
    async (req, reply) => {
      const c = await staffClass(req, req.params.id);
      if (!c || c.cls.status !== 'active') return err(reply, 404, 'introuvable');
      const schoolAccount = await ensureSchoolAccount(db, c.cls.schoolId);
      // code de 4 chiffres de la tablette : protège les réglages du mode école (comme le code parent)
      if (req.body?.pin)
        await db
          .update(t.account)
          .set({ parentPinHash: await hashSecret(req.body.pin) })
          .where(eq(t.account.id, schoolAccount));
      const s = await createSession(db, schoolAccount, 'ecole', false, {
        tabletClassId: c.cls.id,
        tabletOpenedBy: me(req),
        ttlMs: 10 * 3600_000,
      });
      await db
        .update(t.session)
        .set({ revokedAt: new Date() })
        .where(eq(t.session.tokenHash, req.auth!.tokenHash));
      await audit(db, me(req), 'ecole.tablette.ouverture', c.cls.id);
      reply.header('Set-Cookie', sessionCookie(s.token, s.ttl, opts.secureFor(req)));
      void COOKIE;
      return reply.code(201).send({ ok: true, classe: { id: c.cls.id, name: c.cls.name } });
    },
  );

  // ================================================================ famille : responsables

  /** famille connectée (pas une tablette, pas un compte de personnel seul) */
  const family = (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) {
      void err(reply, 401, 'non_connecte');
      return false;
    }
    if (staffOnly(req.auth) || req.auth.kind === 'ecole' || req.auth.tablet) {
      void err(reply, 403, 'reserve_aux_familles');
      return false;
    }
    return true;
  };

  /** ressaisie du mot de passe (actes sur la responsabilité d'un mineur) : essais réservés, verrou */
  const passwordOk = async (reply: FastifyReply, accountId: string, given: string) => {
    const [a] = await db.select().from(t.account).where(eq(t.account.id, accountId));
    const key = `mdp:${accountId}`;
    if (!a || !(await reserveAttempt(db, key, 10))) {
      void err(reply, 429, 'verrouille');
      return false;
    }
    if (!(await verifySecret(given, a.passwordHash))) {
      await failAttempt(db, key, 10);
      void err(reply, 401, 'mot_de_passe_incorrect');
      return false;
    }
    await clearFailures(db, key);
    return true;
  };

  const ownedProfile = async (accountId: string, profileId: string) =>
    (
      await db
        .select()
        .from(t.profile)
        .where(and(eq(t.profile.id, profileId), eq(t.profile.ownerAccountId, accountId)))
    )[0] ?? null;

  app.get<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/responsables',
    { schema: ids('id') },
    async (req, reply) => {
      if (!family(req, reply)) return reply;
      if (!(await ownsProfile(db, req.auth, req.params.id))) return err(reply, 404, 'introuvable');
      const [p] = await db
        .select({ owner: t.profile.ownerAccountId })
        .from(t.profile)
        .where(eq(t.profile.id, req.params.id));
      return {
        titulaire: p?.owner === me(req),
        responsables: (await custodiansOf(db, req.params.id)).map((c) => ({
          ...c,
          moi: c.accountId === me(req),
        })),
      };
    },
  );

  /** invitation du SECOND PARENT (le titulaire, parent d'un enfant ou d'un ado) */
  app.post<{ Params: { id: string }; Body: { password: string } }>(
    '/api/v1/profiles/:id/second-parent',
    {
      schema: {
        ...ids('id'),
        body: {
          type: 'object',
          required: ['password'],
          additionalProperties: false,
          properties: { password: { type: 'string', maxLength: 512 } },
        },
      },
    },
    async (req, reply) => {
      if (!family(req, reply)) return reply;
      if (req.auth!.kind !== 'parent') return err(reply, 403, 'reserve_aux_parents');
      const p = await ownedProfile(me(req), req.params.id);
      if (!p || p.kind === 'adulte') return err(reply, 404, 'introuvable');
      if (!(await passwordOk(reply, me(req), req.body.password))) return reply;
      const inv = await createInvite(db, {
        profileId: p.id,
        nature: 'parent',
        createdBy: me(req),
        days: 14,
      });
      await audit(db, me(req), 'profil.second_parent.invitation', p.id);
      return reply.code(201).send({ code: inv.code, expire: inv.expiresAt });
    },
  );

  /**
   * Un PARENT accepte une invitation : second parent, ou rattachement d'un élève inscrit par l'école (le parent
   * en devient titulaire ; l'école reste responsable pour sa classe). Mot de passe ressaisi = preuve.
   */
  app.post<{ Body: { code: string; password: string } }>(
    '/api/v1/profiles/rattacher',
    {
      schema: {
        body: {
          type: 'object',
          required: ['code', 'password'],
          additionalProperties: false,
          properties: { code: CODE, password: { type: 'string', maxLength: 512 } },
        },
      },
    },
    async (req, reply) => {
      if (!family(req, reply)) return reply;
      if (req.auth!.kind !== 'parent') return err(reply, 403, 'reserve_aux_parents');
      const key = `rattacher:${me(req)}`;
      if (await lockedUntil(db, key)) return err(reply, 429, 'verrouille');
      if (!(await passwordOk(reply, me(req), req.body.password))) return reply;
      const r = await acceptParentInvite(db, req.body.code, me(req), {
        methode: 'code_a_usage_unique+reauthentification_mot_de_passe',
        date: new Date().toISOString(),
        pays: req.auth!.country,
      });
      if (!r) {
        await recordFailure(db, key);
        return err(reply, 404, 'code_inconnu');
      }
      await clearFailures(db, key);
      await audit(db, me(req), 'profil.rattachement', r.profileId, { titulaire: r.titulaire });
      return reply.code(201).send(r);
    },
  );

  /** fin d'une responsabilité : le titulaire retire un autre parent, ou un parent se retire lui-même */
  app.delete<{ Params: { id: string; accountId: string } }>(
    '/api/v1/profiles/:id/responsables/:accountId',
    { schema: ids('id', 'accountId') },
    async (req, reply) => {
      if (!family(req, reply)) return reply;
      const self = req.params.accountId === me(req);
      const owner = await ownedProfile(me(req), req.params.id);
      if (self ? !(await ownsProfile(db, req.auth, req.params.id)) || owner : !owner)
        return err(reply, 404, 'introuvable');
      if (
        !(await endCustodian(
          db,
          req.params.id,
          req.params.accountId,
          self ? 'retrait' : 'retire_par_titulaire',
        ))
      )
        return err(reply, 404, 'introuvable');
      await audit(db, me(req), 'profil.responsable.fin', req.params.id);
      return { ok: true };
    },
  );

  /**
   * ÉMANCIPATION (revue E4) : le titulaire (parent) prépare la reprise du profil par le jeune, à partir de l'âge
   * du consentement numérique de son pays ; le jeune crée son compte adulte et saisit le code.
   */
  app.post<{ Params: { id: string }; Body: { password: string } }>(
    '/api/v1/profiles/:id/emancipation',
    {
      schema: {
        ...ids('id'),
        body: {
          type: 'object',
          required: ['password'],
          additionalProperties: false,
          properties: { password: { type: 'string', maxLength: 512 } },
        },
      },
    },
    async (req, reply) => {
      if (!family(req, reply)) return reply;
      if (req.auth!.kind !== 'parent') return err(reply, 403, 'reserve_aux_parents');
      const p = await ownedProfile(me(req), req.params.id);
      if (!p) return err(reply, 404, 'introuvable');
      const min = consentAge(req.auth!.country);
      if (!p.birthYear || ageFromYear(p.birthYear) < min)
        return err(reply, 403, 'trop_jeune', { age: min });
      if (!(await passwordOk(reply, me(req), req.body.password))) return reply;
      const inv = await createInvite(db, {
        profileId: p.id,
        nature: 'emancipation',
        createdBy: me(req),
        days: 30,
      });
      // A27 (D-F2 2) : la demande du jeune, s'il y en avait une, est satisfaite
      await db.update(t.profile).set({ emancipationRequestAt: null }).where(eq(t.profile.id, p.id));
      await audit(db, me(req), 'profil.emancipation.preparee', p.id);
      return reply.code(201).send({ code: inv.code, expire: inv.expiresAt });
    },
  );

  /**
   * A27 (décision D-F2 2) : le JEUNE demande à reprendre son profil, à partir de l'âge du consentement numérique
   * du pays ; le parent valide (code ci-dessus) ou refuse. À 18 ans, c'est DE DROIT : le code est donné aussitôt.
   */
  app.post<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/emancipation/demande',
    { schema: ids('id') },
    async (req, reply) => {
      if (!family(req, reply)) return reply;
      if (!(await ownsProfile(db, req.auth, req.params.id))) return err(reply, 404, 'introuvable');
      const [p] = await db.select().from(t.profile).where(eq(t.profile.id, req.params.id));
      if (!p) return err(reply, 404, 'introuvable');
      const [owner] = await db
        .select({ kind: t.account.kind })
        .from(t.account)
        .where(eq(t.account.id, p.ownerAccountId));
      // un profil déjà porté par son propre compte adulte n'a rien à demander
      if (owner?.kind !== 'parent') return err(reply, 409, 'deja_autonome');
      const age = p.birthYear ? ageFromYear(p.birthYear) : 0;
      const min = consentAge(req.auth!.country);
      if (age < min) return err(reply, 403, 'trop_jeune', { age: min });
      if (age >= 18) {
        const inv = await createInvite(db, {
          profileId: p.id,
          nature: 'emancipation',
          createdBy: me(req),
          days: 30,
        });
        await db
          .update(t.profile)
          .set({ emancipationRequestAt: null })
          .where(eq(t.profile.id, p.id));
        await audit(db, me(req), 'profil.emancipation.de_droit', p.id);
        return reply.code(201).send({ deDroit: true, code: inv.code, expire: inv.expiresAt });
      }
      await db
        .update(t.profile)
        .set({ emancipationRequestAt: new Date() })
        .where(eq(t.profile.id, p.id));
      await audit(db, me(req), 'profil.emancipation.demandee', p.id);
      return reply.code(201).send({ deDroit: false, demandee: true });
    },
  );

  /** le parent titulaire refuse la demande (elle peut être refaite plus tard) */
  app.delete<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/emancipation/demande',
    { schema: ids('id') },
    async (req, reply) => {
      if (!family(req, reply)) return reply;
      if (req.auth!.kind !== 'parent') return err(reply, 403, 'reserve_aux_parents');
      const p = await ownedProfile(me(req), req.params.id);
      if (!p) return err(reply, 404, 'introuvable');
      await db.update(t.profile).set({ emancipationRequestAt: null }).where(eq(t.profile.id, p.id));
      await audit(db, me(req), 'profil.emancipation.refusee', p.id);
      return { ok: true };
    },
  );

  /** le jeune, connecté à SON compte adulte, reprend son profil (tout l'historique) */
  app.post<{ Body: { code: string } }>(
    '/api/v1/account/reprendre-profil',
    {
      schema: {
        body: {
          type: 'object',
          required: ['code'],
          additionalProperties: false,
          properties: { code: CODE },
        },
      },
    },
    async (req, reply) => {
      if (!family(req, reply)) return reply;
      if (req.auth!.kind !== 'adulte') return err(reply, 403, 'reserve_aux_adultes');
      const key = `reprise:${me(req)}`;
      if (await lockedUntil(db, key)) return err(reply, 429, 'verrouille');
      const r = await claimProfile(db, req.body.code, me(req));
      if (r === 'code_invalide') {
        await recordFailure(db, key);
        return err(reply, 404, 'code_inconnu');
      }
      if (r === 'compte_occupe') return err(reply, 409, 'compte_deja_utilise');
      await clearFailures(db, key);
      await audit(db, me(req), 'profil.emancipation', r.profileId);
      return reply.code(201).send(r);
    },
  );

  // ================================================================ niveaux par matière et parcours

  app.get<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/niveaux',
    { schema: ids('id') },
    async (req, reply) => {
      if (!req.auth) return err(reply, 401, 'non_connecte');
      if (!(await ownsProfile(db, req.auth, req.params.id))) return err(reply, 404, 'introuvable');
      return {
        courants: await currentLevels(db, req.params.id),
        historique: await levelHistory(db, req.params.id),
      };
    },
  );

  /** la famille choisit un niveau (ou enregistre le résultat d'un test de positionnement) */
  app.put<{
    Params: { id: string };
    Body: { levelCode: string; source: 'parent' | 'positionnement'; score?: number | null };
  }>(
    '/api/v1/profiles/:id/niveaux',
    {
      schema: {
        ...ids('id'),
        body: {
          type: 'object',
          required: ['levelCode', 'source'],
          additionalProperties: false,
          properties: {
            levelCode: { type: 'string', pattern: LEVEL },
            source: { enum: ['parent', 'positionnement'] },
            score: { type: ['number', 'null'], minimum: 0, maximum: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      if (!family(req, reply)) return reply;
      if (!(await ownsProfile(db, req.auth, req.params.id))) return err(reply, 404, 'introuvable');
      const ok = await setProfileLevel(
        db,
        req.params.id,
        req.body.levelCode,
        req.body.source,
        me(req),
        req.body.score === undefined ? null : { score: req.body.score },
      );
      if (!ok) return err(reply, 400, 'niveau_inconnu');
      return { courants: await currentLevels(db, req.params.id) };
    },
  );

  /** « Mon parcours » (A27) : niveau par matière, prochaine leçon, livrets, révision, aperçu, Coran */
  app.get<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/parcours',
    { schema: ids('id') },
    async (req, reply) => {
      if (!req.auth) return err(reply, 401, 'non_connecte');
      if (!(await ownsProfile(db, req.auth, req.params.id))) return err(reply, 404, 'introuvable');
      const ed = await edition();
      if (!ed) return err(reply, 503, 'aucune_edition');
      const p = await learnerPath(db, ed.id, req.params.id);
      if (!p) return err(reply, 404, 'introuvable');
      return { edition: ed.code, ...p };
    },
  );

  /** mots du Coran rattachés à un niveau de livre (données des livres ; public, comme les niveaux) */
  app.get<{ Params: { code: string } }>(
    '/api/v1/levels/:code/mots-coran',
    {
      schema: {
        params: {
          type: 'object',
          required: ['code'],
          properties: { code: { type: 'string', pattern: LEVEL } },
        },
      },
    },
    async (req) => ({ niveau: req.params.code, mots: await levelLemmas(db, req.params.code) }),
  );
}
