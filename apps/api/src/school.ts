/**
 * Espace ÉCOLE (lot 13, rentrée de l'école pilote au Sénégal) :
 *  - classes et groupes ; liste de classe = profils inscrits par leur PARENT (code de classe, consentement)
 *    + élèves « papier » saisis par l'enseignant (prénom et initiale ; aucune date de naissance) ;
 *  - devoirs (leçon, passage de hifẓ, petit livre) avec échéance, pour la classe ou un groupe ; suivi
 *    automatique pour les élèves de l'application, coches de l'enseignant pour tous ;
 *  - tableau de suivi de la classe ; « classe papier » : résultats des bilans et de l'examen des livres
 *    papier, récitations de hifẓ avec les relevés du barème ;
 *  - décision de fin de niveau (règles des livres), certificats de niveau (modèles des livres) et
 *    attestations de hifẓ (jamais une ijāza), registre numéroté ; export CSV (et pages imprimables → PDF).
 * Protection des données des mineurs : TOUT est réservé à l'enseignant de la classe, second facteur
 * vérifié ; un administrateur n'y a pas accès ; chaque export et chaque certificat est journalisé.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  sealCertificate,
  type CertificateRow,
  classOfficialScores,
  addPaperPupil,
  assignmentById,
  classCertificates,
  createAssignment,
  createGroup,
  deleteAssignment,
  deleteGroup,
  deletePaperResult,
  evalDocs,
  hifzEventsOf,
  levelInfo,
  listAssignments,
  listGroups,
  listLevels,
  listPupils,
  listUnits,
  marksOf,
  paperResults,
  profileAssignments,
  progressOf,
  removePupil,
  savePaperResult,
  setMark,
  teacherClass,
  teacherPupil,
  updateClassSettings,
  updatePupil,
  type AssignmentRow,
  type ClassRow,
  type Db,
  type PupilView,
} from '@awform/db';
import { newVerifCode, signCert, type CertSigner } from './certsign.js';
import { note, type Counters, type Note } from '@awform/hifz';
import {
  levelResult,
  rulesFrom,
  toCsv,
  type Gender,
  type LevelResult,
  type Score,
} from '@awform/school';
import { ownsProfile } from './auth/routes.js';
import { audit } from './auth/service.js';

import {
  BOOKLET,
  COUNT,
  DAY,
  err,
  LEVEL,
  PART,
  partLabel,
  today,
  TXT,
  UNIT_ID,
  UUID,
  type Edition,
} from './school-common.js';
import { registerCertificates } from './school-certificats.js';

export function registerSchool(
  app: FastifyInstance,
  db: Db,
  edition: Edition,
  signer: CertSigner | null = null,
): void {
  /** code de vérification et signature (lot 20) : posés une fois, à la délivrance ou à la première lecture */
  const seal = async (c: CertificateRow): Promise<CertificateRow> => {
    if (c.verifCode) return c;
    const signature = signer ? signCert(signer, c) : null;
    return (
      (await sealCertificate(db, c.id, {
        verifCode: newVerifCode(),
        signature,
        keyId: signer?.keyId ?? null,
      })) ?? c
    );
  };
  /** enseignant (pas l'administrateur), second facteur vérifié */
  const needSchoolTeacher = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return err(reply, 401, 'non_connecte');
    if (req.auth.kind !== 'enseignant') return err(reply, 403, 'reserve_aux_enseignants');
    if (!req.auth.mfaVerified)
      return err(reply, 403, req.auth.totpEnabled ? 'totp_requis' : 'mfa_a_configurer');
  };
  const me = (req: FastifyRequest) => req.auth!.accountId;
  const pre = { preHandler: needSchoolTeacher };
  const idParams = (...keys: string[]) => ({
    params: {
      type: 'object',
      required: keys,
      properties: Object.fromEntries(keys.map((k) => [k, UUID])),
    },
  });

  // ---------------------------------------------------------------- classe, groupes, élèves

  app.get<{ Params: { id: string } }>(
    '/api/v1/ecole/classes/:id',
    { ...pre, schema: idParams('id') },
    async (req, reply) => {
      const cls = await teacherClass(db, me(req), req.params.id);
      if (!cls) return err(reply, 404, 'introuvable');
      const ed = await edition();
      return {
        class: cls,
        groups: await listGroups(db, cls.id),
        pupils: await listPupils(db, cls.id),
        levels: ed
          ? (await listLevels(db, ed.id)).map((l) => ({
              code: l.code,
              track: l.track,
              titleFr: l.titleFr,
              codeFr: l.codeFr,
            }))
          : [],
      };
    },
  );

  app.patch<{ Params: { id: string }; Body: Partial<Record<string, string | number | null>> }>(
    '/api/v1/ecole/classes/:id',
    {
      ...pre,
      schema: {
        ...idParams('id'),
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 60 },
            levelCode: { type: ['string', 'null'], pattern: LEVEL },
            schoolName: TXT(120),
            schoolNameAr: TXT(120),
            place: TXT(80),
            placeAr: TXT(80),
            schoolYear: TXT(20),
            recitationDays: { type: 'integer', minimum: 1, maximum: 30 },
          },
        },
      },
    },
    async (req, reply) => {
      const cls = await teacherClass(db, me(req), req.params.id);
      if (!cls) return err(reply, 404, 'introuvable');
      const clean = Object.fromEntries(
        Object.entries(req.body).map(([k, v]) => [k, typeof v === 'string' ? v.trim() || null : v]),
      );
      const c = await updateClassSettings(db, cls.id, clean);
      await audit(db, me(req), 'ecole.classe.reglages', cls.id, Object.keys(clean));
      return { class: c };
    },
  );

  app.post<{ Params: { id: string }; Body: { name: string } }>(
    '/api/v1/ecole/classes/:id/groups',
    {
      ...pre,
      schema: {
        ...idParams('id'),
        body: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: { name: { type: 'string', minLength: 1, maxLength: 40 } },
        },
      },
    },
    async (req, reply) => {
      const cls = await teacherClass(db, me(req), req.params.id);
      if (!cls) return err(reply, 404, 'introuvable');
      return reply.code(201).send({ group: await createGroup(db, cls.id, req.body.name.trim()) });
    },
  );

  app.delete<{ Params: { id: string; gid: string } }>(
    '/api/v1/ecole/classes/:id/groups/:gid',
    { ...pre, schema: idParams('id', 'gid') },
    async (req, reply) => {
      const cls = await teacherClass(db, me(req), req.params.id);
      if (!cls || !(await deleteGroup(db, cls.id, req.params.gid)))
        return err(reply, 404, 'introuvable');
      return { ok: true };
    },
  );

  const groupOk = async (cls: ClassRow, gid: string | null | undefined) =>
    !gid || (await listGroups(db, cls.id)).some((g) => g.id === gid);

  app.post<{
    Params: { id: string };
    Body: { displayName: string; nameAr?: string | null; gender?: Gender; groupId?: string | null };
  }>(
    '/api/v1/ecole/classes/:id/pupils',
    {
      ...pre,
      schema: {
        ...idParams('id'),
        body: {
          type: 'object',
          required: ['displayName'],
          additionalProperties: false,
          properties: {
            displayName: { type: 'string', minLength: 1, maxLength: 60 },
            nameAr: TXT(80),
            gender: { type: ['string', 'null'], enum: ['m', 'f', null] },
            groupId: { type: ['string', 'null'], format: 'uuid' },
          },
        },
      },
    },
    async (req, reply) => {
      const cls = await teacherClass(db, me(req), req.params.id);
      if (!cls) return err(reply, 404, 'introuvable');
      if (!(await groupOk(cls, req.body.groupId))) return err(reply, 400, 'groupe_inconnu');
      const p = await addPaperPupil(db, cls.id, {
        displayName: req.body.displayName.trim(),
        nameAr: req.body.nameAr?.trim() || null,
        gender: req.body.gender ?? null,
        groupId: req.body.groupId ?? null,
      });
      await audit(db, me(req), 'ecole.eleve.ajout', p.id, { classe: cls.id });
      return reply.code(201).send({ pupil: p });
    },
  );

  app.patch<{
    Params: { pid: string };
    Body: {
      displayName?: string;
      nameAr?: string | null;
      gender?: Gender;
      groupId?: string | null;
    };
  }>(
    '/api/v1/ecole/pupils/:pid',
    {
      ...pre,
      schema: {
        ...idParams('pid'),
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            displayName: { type: 'string', minLength: 1, maxLength: 60 },
            nameAr: TXT(80),
            gender: { type: ['string', 'null'], enum: ['m', 'f', null] },
            groupId: { type: ['string', 'null'], format: 'uuid' },
          },
        },
      },
    },
    async (req, reply) => {
      const r = await teacherPupil(db, me(req), req.params.pid);
      if (!r) return err(reply, 404, 'introuvable');
      if (!(await groupOk(r.cls, req.body.groupId))) return err(reply, 400, 'groupe_inconnu');
      // un profil de l'application garde le pseudonyme choisi par sa famille
      if (req.body.displayName !== undefined && r.pupil.profileId)
        return err(reply, 400, 'pseudonyme_de_la_famille');
      const b = req.body;
      const p = await updatePupil(db, r.pupil.id, {
        ...(b.displayName !== undefined ? { displayName: b.displayName.trim() } : {}),
        ...(b.nameAr !== undefined ? { nameAr: b.nameAr?.trim() || null } : {}),
        ...(b.gender !== undefined ? { gender: b.gender } : {}),
        ...(b.groupId !== undefined ? { groupId: b.groupId } : {}),
      });
      return { pupil: p };
    },
  );

  app.delete<{ Params: { pid: string } }>(
    '/api/v1/ecole/pupils/:pid',
    { ...pre, schema: idParams('pid') },
    async (req, reply) => {
      const r = await teacherPupil(db, me(req), req.params.pid);
      if (!r) return err(reply, 404, 'introuvable');
      await removePupil(db, r.pupil);
      await audit(db, me(req), 'ecole.eleve.retrait', r.pupil.id, { classe: r.cls.id });
      return { ok: true };
    },
  );

  // ---------------------------------------------------------------- devoirs

  async function checkTarget(kind: string, target: string): Promise<boolean> {
    if (kind === 'lecon') {
      if (!UNIT_ID.test(target)) return false;
      const ed = await edition();
      if (!ed) return false;
      const level = target.split('.')[0]!;
      return (await listUnits(db, ed.id, level)).some((u) => u.id === target);
    }
    if (kind === 'hifz') {
      const m = PART.exec(target);
      if (!m) return false;
      const s = Number(m[1]);
      const a = Number(m[2]);
      const b = Number(m[3] ?? m[2]);
      return s >= 1 && s <= 114 && a >= 1 && b >= a;
    }
    return BOOKLET.test(target);
  }

  app.post<{
    Params: { id: string };
    Body: { kind: string; target: string; dueDay: string; groupId?: string | null; note?: string };
  }>(
    '/api/v1/ecole/classes/:id/assignments',
    {
      ...pre,
      schema: {
        ...idParams('id'),
        body: {
          type: 'object',
          required: ['kind', 'target', 'dueDay'],
          additionalProperties: false,
          properties: {
            kind: { type: 'string', enum: ['lecon', 'hifz', 'lecture'] },
            target: { type: 'string', minLength: 3, maxLength: 20 },
            dueDay: { type: 'string', pattern: DAY },
            groupId: { type: ['string', 'null'], format: 'uuid' },
            note: { type: 'string', maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      const cls = await teacherClass(db, me(req), req.params.id);
      if (!cls) return err(reply, 404, 'introuvable');
      if (!(await groupOk(cls, req.body.groupId))) return err(reply, 400, 'groupe_inconnu');
      const target = req.body.target.trim();
      if (!(await checkTarget(req.body.kind, target))) return err(reply, 400, 'devoir_invalide');
      const a = await createAssignment(db, {
        classId: cls.id,
        kind: req.body.kind,
        target,
        dueDay: req.body.dueDay,
        groupId: req.body.groupId ?? null,
        note: req.body.note?.trim() || null,
      });
      return reply.code(201).send({ assignment: a });
    },
  );

  app.delete<{ Params: { aid: string } }>(
    '/api/v1/ecole/assignments/:aid',
    { ...pre, schema: idParams('aid') },
    async (req, reply) => {
      const a = await assignmentById(db, req.params.aid);
      const cls = a ? await teacherClass(db, me(req), a.classId) : null;
      if (!a || !cls || !(await deleteAssignment(db, cls.id, a.id)))
        return err(reply, 404, 'introuvable');
      return { ok: true };
    },
  );

  app.put<{ Params: { aid: string; pid: string }; Body: { done: boolean | null } }>(
    '/api/v1/ecole/assignments/:aid/marks/:pid',
    {
      ...pre,
      schema: {
        ...idParams('aid', 'pid'),
        body: {
          type: 'object',
          required: ['done'],
          additionalProperties: false,
          properties: { done: { type: ['boolean', 'null'] } },
        },
      },
    },
    async (req, reply) => {
      const a = await assignmentById(db, req.params.aid);
      const r = await teacherPupil(db, me(req), req.params.pid);
      if (!a || !r || r.cls.id !== a.classId) return err(reply, 404, 'introuvable');
      await setMark(db, a.id, r.pupil.id, req.body.done);
      return { ok: true };
    },
  );

  // ---------------------------------------------------------------- suivi : calcul commun

  interface Row {
    pupil: PupilView;
    lessonsDone: number | null;
    bilans: Array<number | null>;
    result: LevelResult | null;
    lastHifz: { part: string; day: string; total: number; mention: string } | null;
    assignments: Array<{ id: string; done: boolean; late: boolean; manual: boolean }>;
  }

  async function tableau(cls: ClassRow) {
    const ed = await edition();
    const pupils = await listPupils(db, cls.id);
    const profileIds = pupils.flatMap((p) => (p.profileId ? [p.profileId] : []));
    const units = ed && cls.levelCode ? await listUnits(db, ed.id, cls.levelCode) : [];
    const lessons = units.filter((u) => u.kind === 'lecon');
    const bilans = units.filter((u) => u.kind === 'bilan');
    const exam = units.find((u) => u.kind === 'examen') ?? null;
    const assignments = await listAssignments(db, cls.id);
    const assignmentUnits = assignments.filter((a) => a.kind === 'lecon').map((a) => a.target);
    const progress = await progressOf(db, profileIds, [
      ...new Set([...units.map((u) => u.id), ...assignmentUnits]),
    ]);
    const papers = await paperResults(
      db,
      pupils.map((p) => p.id),
    );
    const events = await hifzEventsOf(db, profileIds);
    // notes des épreuves passées dans l'application (lot 19)
    const official = await classOfficialScores(db, cls.id);
    const marks = await marksOf(
      db,
      assignments.map((a) => a.id),
    );
    const docs = ed ? await evalDocs(db, ed.id) : {};
    const rules = rulesFrom(docs.regles);
    const lvl = ed && cls.levelCode ? await levelInfo(db, ed.id, cls.levelCode) : null;
    const day = today();

    const rows: Row[] = pupils.map((p) => {
      const prog = progress.filter((x) => x.profileId === p.profileId);
      const paper = papers.filter((x) => x.pupilId === p.id);
      const paperOf = (item: string): Score | null => {
        const r = paper.find((x) => x.levelCode === cls.levelCode && x.item === item);
        return r ? { score: r.score, max: r.max } : null;
      };
      /** note d'une épreuve passée dans l'application (session ouverte par l'enseignant, lot 19) */
      const officialOf = (unitId: string): Score | null =>
        (p.profileId && official.get(`${p.profileId}|${unitId}`)) || null;
      // audit MET-1 : seules comptent la saisie de l'enseignant (classe papier, prioritaire) et l'épreuve
      // notée ; l'ENTRAÎNEMENT (essais multiples, meilleur essai) ne compte jamais pour la décision
      const b = bilans.map((u) => paperOf(`bilan:${u.id}`) ?? officialOf(u.id));
      const examen = paperOf('examen') ?? (exam ? officialOf(exam.id) : null);
      const result = cls.levelCode
        ? levelResult(
            {
              track: lvl?.track ?? 'enfants',
              bilans: b,
              examen,
              recitations: paperOf('recitations'),
              productions: paperOf('productions'),
            },
            rules,
          )
        : null;
      // dernière récitation validée (application ou classe papier)
      const hz: Row['lastHifz'][] = [
        ...events
          .filter((e) => e.profileId === p.profileId && e.source === 'enseignant')
          .map((e) => {
            const n = (e.details as { note?: Note } | null)?.note;
            return n ? { part: e.part, day: e.day, total: n.total, mention: n.mention } : null;
          }),
        ...paper
          .filter((x) => x.item.startsWith('hifz:'))
          .map((x) => {
            const n = (x.details as { note?: Note } | null)?.note;
            return { part: x.item.slice(5), day: x.day, total: x.score, mention: n?.mention ?? '' };
          }),
      ].filter(Boolean);
      hz.sort((x, y) => (x!.day < y!.day ? -1 : 1));
      const mine = assignments.filter((a) => !a.groupId || a.groupId === p.groupId);
      return {
        pupil: p,
        lessonsDone: p.profileId
          ? prog.filter(
              (x) =>
                lessons.some((u) => u.id === x.unitId) &&
                (x.status === 'terminee' || x.status === 'maitrisee'),
            ).length
          : null,
        bilans: b.map((s) => (s ? Math.round((1000 * s.score) / s.max) / 10 : null)),
        result,
        lastHifz: hz.at(-1) ?? null,
        assignments: mine.map((a) => {
          const mk = marks.find((m) => m.assignmentId === a.id && m.pupilId === p.id);
          const auto = autoDone(a, p, prog, events);
          const done = mk ? mk.done : auto;
          return { id: a.id, done, late: !done && a.dueDay < day, manual: !!mk };
        }),
      };
    });
    return {
      class: cls,
      level: lvl,
      lessons: lessons.length,
      bilans: bilans.map((u) => ({ id: u.id, n: u.numBilan, titleFr: u.titleFr })),
      examen: exam ? { id: exam.id, titleFr: exam.titleFr } : null,
      assignments,
      groups: await listGroups(db, cls.id),
      rows,
    };
  }

  function autoDone(
    a: AssignmentRow,
    p: PupilView,
    prog: Array<{ unitId: string; status: string }>,
    events: Array<{ profileId: string; part: string; day: string; kind: string; source: string }>,
  ): boolean {
    if (!p.profileId) return false;
    if (a.kind === 'lecon')
      return prog.some(
        (x) => x.unitId === a.target && (x.status === 'terminee' || x.status === 'maitrisee'),
      );
    if (a.kind === 'hifz') {
      const since = a.createdAt.toISOString().slice(0, 10);
      return events.some(
        (e) =>
          e.profileId === p.profileId &&
          e.part === a.target &&
          e.day >= since &&
          (e.kind === 'appris' || e.source === 'enseignant'),
      );
    }
    return false; // lecture : le tampon reste sur l'appareil → coche de l'enseignant
  }

  app.get<{ Params: { id: string } }>(
    '/api/v1/ecole/classes/:id/tableau',
    { ...pre, schema: idParams('id') },
    async (req, reply) => {
      const cls = await teacherClass(db, me(req), req.params.id);
      if (!cls) return err(reply, 404, 'introuvable');
      return tableau(cls);
    },
  );

  // ---------------------------------------------------------------- classe papier

  app.put<{
    Params: { pid: string };
    Body: {
      levelCode: string;
      day?: string;
      items: Array<{ item: string; score?: number; max?: number; delete?: boolean }>;
    };
  }>(
    '/api/v1/ecole/pupils/:pid/resultats',
    {
      ...pre,
      schema: {
        ...idParams('pid'),
        body: {
          type: 'object',
          required: ['levelCode', 'items'],
          additionalProperties: false,
          properties: {
            levelCode: { type: 'string', pattern: LEVEL },
            day: { type: 'string', pattern: DAY },
            items: {
              type: 'array',
              maxItems: 20,
              items: {
                type: 'object',
                required: ['item'],
                additionalProperties: false,
                properties: {
                  item: {
                    type: 'string',
                    pattern:
                      '^(bilan:[a-z]{2,3}[0-9]{1,2}\\.l[0-9]{2}|examen|recitations|productions)$',
                  },
                  score: { type: 'number', minimum: 0, maximum: 1000 },
                  max: { type: 'number', exclusiveMinimum: 0, maximum: 1000 },
                  delete: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const r = await teacherPupil(db, me(req), req.params.pid);
      if (!r) return err(reply, 404, 'introuvable');
      const { levelCode } = req.body;
      if (r.cls.levelCode !== levelCode) return err(reply, 400, 'niveau_de_la_classe');
      const ed = await edition();
      const unitIds = new Set(ed ? (await listUnits(db, ed.id, levelCode)).map((u) => u.id) : []);
      for (const it of req.body.items) {
        if (it.item.startsWith('bilan:') && !unitIds.has(it.item.slice(6)))
          return err(reply, 400, 'bilan_inconnu');
        if (!it.delete && (it.score === undefined || it.max === undefined || it.score > it.max))
          return err(reply, 400, 'note_invalide');
      }
      for (const it of req.body.items)
        if (it.delete) await deletePaperResult(db, r.pupil.id, levelCode, it.item);
        else
          await savePaperResult(db, {
            pupilId: r.pupil.id,
            levelCode,
            item: it.item,
            score: it.score!,
            max: it.max!,
            day: req.body.day ?? today(),
            enteredBy: me(req),
          });
      await audit(db, me(req), 'ecole.resultats', r.pupil.id, {
        niveau: levelCode,
        items: req.body.items.map((i) => i.item),
      });
      return { ok: true };
    },
  );

  /** Récitation de hifẓ d'un élève « papier » : mêmes relevés que la validation du maître (barème /20). */
  app.post<{ Params: { pid: string }; Body: { part: string; day: string; counters: Counters } }>(
    '/api/v1/ecole/pupils/:pid/hifz',
    {
      ...pre,
      schema: {
        ...idParams('pid'),
        body: {
          type: 'object',
          required: ['part', 'day', 'counters'],
          additionalProperties: false,
          properties: {
            part: { type: 'string', maxLength: 20 },
            day: { type: 'string', pattern: DAY },
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
          },
        },
      },
    },
    async (req, reply) => {
      const r = await teacherPupil(db, me(req), req.params.pid);
      if (!r) return err(reply, 404, 'introuvable');
      // un élève de l'application est validé par la route habituelle (journal de hifẓ de son profil)
      if (r.pupil.profileId) return err(reply, 400, 'eleve_application');
      if (!(await checkTarget('hifz', req.body.part))) return err(reply, 400, 'passage_invalide');
      const n = note(req.body.counters);
      await savePaperResult(db, {
        pupilId: r.pupil.id,
        levelCode: 'hifz',
        item: `hifz:${req.body.part}`,
        score: n.total,
        max: 20,
        day: req.body.day,
        details: { counters: req.body.counters, note: n },
        enteredBy: me(req),
      });
      await audit(db, me(req), 'ecole.hifz', r.pupil.id, { part: req.body.part, total: n.total });
      return { note: n };
    },
  );

  // ---------------------------------------------------------------- export CSV

  app.get<{ Params: { id: string }; Querystring: { quoi?: string } }>(
    '/api/v1/ecole/classes/:id/export.csv',
    {
      ...pre,
      schema: {
        ...idParams('id'),
        querystring: {
          type: 'object',
          properties: { quoi: { type: 'string', enum: ['tableau', 'devoirs', 'certificats'] } },
        },
      },
    },
    async (req, reply) => {
      const cls = await teacherClass(db, me(req), req.params.id);
      if (!cls) return err(reply, 404, 'introuvable');
      const quoi = req.query.quoi ?? 'tableau';
      const tb = await tableau(cls);
      const group = (id: string | null) => tb.groups.find((g) => g.id === id)?.name ?? '';
      let csv: string;
      if (quoi === 'devoirs') {
        csv = toCsv(
          ['Élève', 'Groupe', 'Devoir', 'Type', 'Échéance', 'Fait', 'En retard'],
          tb.rows.flatMap((r) =>
            r.assignments.map((s) => {
              const a = tb.assignments.find((x) => x.id === s.id)!;
              return [
                r.pupil.displayName,
                group(r.pupil.groupId),
                a.kind === 'hifz' ? partLabel(a.target) : a.target,
                a.kind,
                a.dueDay,
                s.done ? 'oui' : 'non',
                s.late ? 'oui' : 'non',
              ];
            }),
          ),
        );
      } else if (quoi === 'certificats') {
        const certs = await classCertificates(db, cls.id);
        csv = toCsv(
          ['Numéro', 'Type', 'Nom affiché', 'Objet', 'Mention', 'Délivré le'],
          certs.map((c) => [
            c.number,
            c.kind,
            c.holderName ?? '',
            c.kind === 'hifz' ? partLabel(c.subject) : c.subject,
            c.mention ?? '',
            c.issuedAt.toISOString().slice(0, 10),
          ]),
        );
      } else {
        csv = toCsv(
          [
            'Élève',
            'Groupe',
            'Inscription',
            'Leçons terminées',
            ...tb.bilans.map((b, i) => `Bilan ${b.n ?? i + 1} (%)`),
            'Examen (%)',
            'Contrôle continu',
            'Note finale',
            'Décision',
            'Dernière récitation',
            'Note hifẓ /20',
            'Devoirs faits',
            'Devoirs en retard',
          ],
          tb.rows.map((r) => [
            r.pupil.displayName,
            group(r.pupil.groupId),
            r.pupil.profileId ? 'application' : 'papier',
            r.lessonsDone,
            ...r.bilans,
            r.result?.examenPct ?? null,
            r.result?.cc ?? null,
            r.result?.nf ?? null,
            r.result?.decision?.fr ?? (r.result ? 'incomplet' : ''),
            r.lastHifz ? partLabel(r.lastHifz.part) : '',
            r.lastHifz?.total ?? null,
            r.assignments.filter((a) => a.done).length,
            r.assignments.filter((a) => a.late).length,
          ]),
        );
      }
      await audit(db, me(req), 'ecole.export', cls.id, { quoi, eleves: tb.rows.length });
      const file = `awform-${cls.name.replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 30)}-${quoi}-${today()}.csv`;
      return reply
        .type('text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${file}"`)
        .send(csv);
    },
  );

  registerCertificates(app, { db, edition, pre, idParams, me, seal, tableau });

  // ---------------------------------------------------------------- devoirs côté famille

  app.get<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/devoirs',
    { schema: idParams('id') },
    async (req, reply) => {
      if (!req.auth) return err(reply, 401, 'non_connecte');
      if (!(await ownsProfile(db, req.auth.accountId, req.params.id)))
        return err(reply, 404, 'introuvable');
      const rows = await profileAssignments(db, req.params.id);
      const units = rows.filter((r) => r.a.kind === 'lecon').map((r) => r.a.target);
      const prog = await progressOf(db, [req.params.id], units);
      const events = await hifzEventsOf(db, [req.params.id]);
      const marks = await marksOf(
        db,
        rows.map((r) => r.a.id),
      );
      const day = today();
      const view = { profileId: req.params.id } as PupilView;
      return {
        devoirs: rows.map((r) => {
          const mk = marks.find((m) => m.assignmentId === r.a.id && m.pupilId === r.pupilId);
          const done = mk ? mk.done : autoDone(r.a, view, prog, events);
          return {
            id: r.a.id,
            classe: r.className,
            kind: r.a.kind,
            target: r.a.target,
            label: r.a.kind === 'hifz' ? partLabel(r.a.target) : r.a.target,
            dueDay: r.a.dueDay,
            note: r.a.note,
            done,
            late: !done && r.a.dueDay < day,
          };
        }),
      };
    },
  );
}
