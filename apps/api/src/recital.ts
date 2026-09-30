/**
 * Suite V1-b — récital de hifẓ (séance devant l'enseignant, CDC §2.6-6).
 *
 *  - L'enseignant planifie une séance pour sa classe (carnet de hifẓ du niveau de la classe, ou choisi).
 *  - Pour chaque élève qui récite, le SERVEUR tire au sort les passages dans le carnet (3 du socle, + 1 du
 *    renforcé au parcours renforcé) ; le tirage est gardé et ne se refait pas. L'élève ajoute un passage au
 *    choix, pris dans le carnet.
 *  - L'enseignant saisit les compteurs du barème du carnet : la note /20 et la mention sont calculées par le
 *    code existant (`note`, @awform/hifz), la note Coran /15 = récital × 0,75 (examen du manuel).
 *  - Publication : résultat officiel, figé, visible par la famille ; chaque passage récité d'un récital
 *    validé (« oui ») compte comme validation de l'enseignant et ouvre l'attestation de hifẓ par passage
 *    (lot 13, `/ecole/pupils/:pid/certificats`, kind « hifz »).
 * Jamais d'ijāza, aucun classement entre élèves (liste par nom), aucun texte coranique renvoyé : des numéros de
 * sourate et de versets seulement (le texte reste dans le lecteur, Tanzil tel quel).
 */
import { randomInt, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import {
  getHifzBook,
  listPupils,
  paperResults,
  recordHifzEvents,
  savePaperResult,
  schema as t,
  teacherClass,
  type Db,
  type HifzEventInput,
} from '@awform/db';
import {
  coranNote15,
  drawRecital,
  note,
  qualityOf,
  recitalChoices,
  suraName,
  type Counters,
  type HifzBookData,
  type Note,
  type Parcours,
} from '@awform/hifz';
import { audit } from './auth/service.js';
import { err, familyProfile, needTeacher, UUID } from './guards.js';

type Edition = () => Promise<{ id: string; code: string } | null>;

const DAY = '^\\d{4}-\\d{2}-\\d{2}$';
const BOOK = '^[a-z]{2,3}[0-9]{1,2}$';
const COUNT = { type: 'integer', minimum: 0, maximum: 50 } as const;
const PART = /^(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/;

/** « Al-Ikhlāṣ (112:1-4) » : nom de la sourate (métadonnées) et numéros, jamais le texte */
export const partLabel = (key: string) => {
  const m = PART.exec(key);
  return m ? `${suraName(Number(m[1]))} (${key})` : key;
};

/** Résultat d'un passage au récital : note du barème et note Coran /15. */
export function recitalResult(c: Counters): Note & { coran15: number } {
  const n = note(c);
  return { ...n, coran15: coranNote15(n.total) };
}

const idParams = (...keys: string[]) => ({
  params: {
    type: 'object',
    required: keys,
    properties: Object.fromEntries(keys.map((k) => [k, UUID])),
  },
});

export function registerRecital(app: FastifyInstance, db: Db, edition: Edition): void {
  const me = (req: { auth: { accountId: string } | null }) => req.auth!.accountId;

  const bookOf = async (code: string) => {
    const ed = await edition();
    if (!ed) return null;
    return (await getHifzBook(db, ed.id, code)) as HifzBookData | null;
  };

  /** séance d'une classe de CET enseignant (ou null) */
  const ownRecital = async (teacherId: string, recitalId: string) => {
    const [r] = await db
      .select({ recital: t.hifzRecital })
      .from(t.hifzRecital)
      .innerJoin(t.classGroup, eq(t.classGroup.id, t.hifzRecital.classId))
      .where(and(eq(t.hifzRecital.id, recitalId), eq(t.classGroup.teacherAccountId, teacherId)));
    return r?.recital ?? null;
  };

  const entriesOf = (recitalIds: string[]) =>
    recitalIds.length
      ? db
          .select()
          .from(t.hifzRecitalEntry)
          .where(inArray(t.hifzRecitalEntry.recitalId, recitalIds))
      : Promise.resolve([] as Array<typeof t.hifzRecitalEntry.$inferSelect>);

  const viewEntry = (e: typeof t.hifzRecitalEntry.$inferSelect) => ({
    id: e.id,
    pupilId: e.pupilId,
    parcours: e.parcours as Parcours,
    tires: (e.drawn as string[]).map((k) => ({ passage: k, libelle: partLabel(k) })),
    choix: e.choice ? { passage: e.choice, libelle: partLabel(e.choice) } : null,
    compteurs: (e.counters as Counters | null) ?? null,
    note: (e.note as (Note & { coran15: number }) | null) ?? null,
    secondJury: e.secondJury,
  });

  // ---------------------------------------------------------------- enseignant

  app.post<{ Params: { id: string }; Body: { titre: string; jour: string; carnet?: string } }>(
    '/api/v1/ecole/classes/:id/recitals',
    {
      preHandler: needTeacher,
      schema: {
        ...idParams('id'),
        body: {
          type: 'object',
          required: ['titre', 'jour'],
          additionalProperties: false,
          properties: {
            titre: { type: 'string', minLength: 1, maxLength: 120 },
            jour: { type: 'string', pattern: DAY },
            carnet: { type: 'string', pattern: BOOK },
          },
        },
      },
    },
    async (req, reply) => {
      const cls = await teacherClass(db, me(req), req.params.id);
      if (!cls) return err(reply, 404, 'introuvable');
      const code = req.body.carnet ?? cls.levelCode ?? '';
      if (!code) return err(reply, 400, 'carnet_requis');
      const book = await bookOf(code);
      if (!book || !book.parcours?.socle?.length) return err(reply, 400, 'carnet_inconnu');
      const [r] = await db
        .insert(t.hifzRecital)
        .values({
          classId: cls.id,
          bookCode: code,
          title: req.body.titre,
          day: req.body.jour,
          createdBy: me(req),
        })
        .returning();
      await audit(db, me(req), 'recital.creation', r!.id, { classe: cls.id, carnet: code });
      return reply.code(201).send({ recital: r });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/ecole/classes/:id/recitals',
    { preHandler: needTeacher, schema: idParams('id') },
    async (req, reply) => {
      const cls = await teacherClass(db, me(req), req.params.id);
      if (!cls) return err(reply, 404, 'introuvable');
      const recitals = await db
        .select()
        .from(t.hifzRecital)
        .where(eq(t.hifzRecital.classId, cls.id))
        .orderBy(asc(t.hifzRecital.day), asc(t.hifzRecital.createdAt));
      const entries = await entriesOf(recitals.map((r) => r.id));
      // élèves par NOM (jamais par note : aucun classement)
      const pupils = await listPupils(db, cls.id);
      const books = new Map<string, string[]>();
      for (const r of recitals)
        if (!books.has(r.bookCode)) {
          const b = await bookOf(r.bookCode);
          books.set(r.bookCode, b ? recitalChoices(b, 'renforce') : []);
        }
      return {
        eleves: pupils
          .map((p) => ({ id: p.id, nom: p.displayName }))
          .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
        recitals: recitals.map((r) => ({
          id: r.id,
          titre: r.title,
          jour: r.day,
          carnet: r.bookCode,
          publie: r.publishedAt,
          annule: r.canceledAt,
          choixPossibles: (books.get(r.bookCode) ?? []).map((k) => ({
            passage: k,
            libelle: partLabel(k),
          })),
          passages: entries.filter((e) => e.recitalId === r.id).map(viewEntry),
        })),
      };
    },
  );

  /** séance modifiable : à moi, ni publiée ni annulée */
  const openRecital = async (teacherId: string, recitalId: string) => {
    const r = await ownRecital(teacherId, recitalId);
    if (!r) return { error: [404, 'introuvable'] as const };
    if (r.canceledAt) return { error: [409, 'recital_annule'] as const };
    if (r.publishedAt) return { error: [409, 'recital_publie'] as const };
    return { recital: r };
  };

  app.post<{ Params: { rid: string }; Body: { pupilId: string; parcours: Parcours } }>(
    '/api/v1/ecole/recitals/:rid/tirages',
    {
      preHandler: needTeacher,
      schema: {
        ...idParams('rid'),
        body: {
          type: 'object',
          required: ['pupilId', 'parcours'],
          additionalProperties: false,
          properties: {
            pupilId: UUID,
            parcours: { type: 'string', enum: ['socle', 'renforce'] },
          },
        },
      },
    },
    async (req, reply) => {
      const o = await openRecital(me(req), req.params.rid);
      if (o.error) return err(reply, o.error[0], o.error[1]);
      const r = o.recital;
      const [pupil] = await db
        .select({ id: t.classPupil.id })
        .from(t.classPupil)
        .where(and(eq(t.classPupil.id, req.body.pupilId), eq(t.classPupil.classId, r.classId)));
      if (!pupil) return err(reply, 404, 'eleve_introuvable');
      const book = await bookOf(r.bookCode);
      if (!book) return err(reply, 409, 'carnet_inconnu');
      // tirage au sort par le serveur (crypto), gardé : un second tirage est refusé
      const drawn = drawRecital(book, req.body.parcours, (k) => randomInt(k));
      const [e] = await db
        .insert(t.hifzRecitalEntry)
        .values({ recitalId: r.id, pupilId: pupil.id, parcours: req.body.parcours, drawn })
        .onConflictDoNothing()
        .returning();
      if (!e) return err(reply, 409, 'deja_tire');
      await audit(db, me(req), 'recital.tirage', e.id, { recital: r.id, passages: drawn });
      return reply.code(201).send({ passage: viewEntry(e) });
    },
  );

  app.put<{
    Params: { rid: string; eid: string };
    Body: { choix?: string | null; compteurs: Counters; secondJury?: boolean };
  }>(
    '/api/v1/ecole/recitals/:rid/tirages/:eid',
    {
      preHandler: needTeacher,
      schema: {
        ...idParams('rid', 'eid'),
        body: {
          type: 'object',
          required: ['compteurs'],
          additionalProperties: false,
          properties: {
            choix: { type: ['string', 'null'], maxLength: 20 },
            secondJury: { type: 'boolean' },
            compteurs: {
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
      const o = await openRecital(me(req), req.params.rid);
      if (o.error) return err(reply, o.error[0], o.error[1]);
      const r = o.recital;
      const [e] = await db
        .select()
        .from(t.hifzRecitalEntry)
        .where(
          and(eq(t.hifzRecitalEntry.id, req.params.eid), eq(t.hifzRecitalEntry.recitalId, r.id)),
        );
      if (!e) return err(reply, 404, 'introuvable');
      const choice = req.body.choix ?? null;
      if (choice !== null) {
        const book = await bookOf(r.bookCode);
        const allowed = book ? recitalChoices(book, e.parcours as Parcours) : [];
        // le passage choisi vient du carnet et n'est pas déjà tiré
        if (!allowed.includes(choice) || (e.drawn as string[]).includes(choice))
          return err(reply, 400, 'choix_hors_carnet');
      }
      const res = recitalResult(req.body.compteurs);
      const [u] = await db
        .update(t.hifzRecitalEntry)
        .set({
          choice,
          counters: req.body.compteurs,
          note: res,
          secondJury: req.body.secondJury ?? e.secondJury,
          scoredAt: new Date(),
          scoredBy: me(req),
        })
        .where(eq(t.hifzRecitalEntry.id, e.id))
        .returning();
      await audit(db, me(req), 'recital.note', e.id, { total: res.total, mention: res.mention });
      return { passage: viewEntry(u!) };
    },
  );

  app.post<{ Params: { rid: string } }>(
    '/api/v1/ecole/recitals/:rid/publier',
    { preHandler: needTeacher, schema: idParams('rid') },
    async (req, reply) => {
      const o = await openRecital(me(req), req.params.rid);
      if (o.error) return err(reply, o.error[0], o.error[1]);
      const r = o.recital;
      const entries = await entriesOf([r.id]);
      const scored = entries.filter((e) => e.note);
      if (!scored.length) return err(reply, 409, 'aucune_note');
      if (scored.length < entries.length) return err(reply, 409, 'notes_manquantes');
      // publication atomique : un seul appel gagne (deux clics, deux onglets)
      const [pub] = await db
        .update(t.hifzRecital)
        .set({ publishedAt: new Date() })
        .where(and(eq(t.hifzRecital.id, r.id), isNull(t.hifzRecital.publishedAt)))
        .returning();
      if (!pub) return err(reply, 409, 'recital_publie');
      // récital validé (« oui ») : chaque passage récité compte comme validation officielle de l'enseignant
      const pupils = await db
        .select({ id: t.classPupil.id, profileId: t.classPupil.profileId })
        .from(t.classPupil)
        .where(
          inArray(
            t.classPupil.id,
            scored.map((e) => e.pupilId),
          ),
        );
      let validations = 0;
      for (const e of scored) {
        const n = e.note as Note & { coran15: number };
        if (n.validation !== 'oui') continue;
        const pupil = pupils.find((p) => p.id === e.pupilId);
        if (!pupil) continue;
        const parts = [...(e.drawn as string[]), ...(e.choice ? [e.choice] : [])];
        if (pupil.profileId) {
          const events: HifzEventInput[] = parts.map((part) => ({
            id: randomUUID(),
            profileId: pupil.profileId!,
            day: r.day,
            part,
            kind: 'revision',
            q: qualityOf(n),
            source: 'enseignant',
            details: { counters: e.counters, note: n, recital: r.id },
            deviceAt: new Date().toISOString(),
          }));
          const res = await recordHifzEvents(db, events, me(req), true);
          validations += res.accepted.length;
        } else {
          // classe papier : ne remplace jamais une validation déjà acquise pour ce passage
          const done = new Set(
            (await paperResults(db, [pupil.id], 'hifz'))
              .filter(
                (x) =>
                  (x.details as { note?: Note } | null)?.note?.validation === 'oui' &&
                  x.item.startsWith('hifz:'),
              )
              .map((x) => x.item),
          );
          for (const part of parts) {
            if (done.has(`hifz:${part}`)) continue;
            await savePaperResult(db, {
              pupilId: pupil.id,
              levelCode: 'hifz',
              item: `hifz:${part}`,
              score: n.total,
              max: 20,
              day: r.day,
              details: { counters: e.counters, note: n, recital: r.id },
              enteredBy: me(req),
            });
            validations++;
          }
        }
      }
      await audit(db, me(req), 'recital.publication', r.id, {
        passages: scored.length,
        validations,
      });
      return { publie: pub.publishedAt, validations };
    },
  );

  app.post<{ Params: { rid: string } }>(
    '/api/v1/ecole/recitals/:rid/annuler',
    { preHandler: needTeacher, schema: idParams('rid') },
    async (req, reply) => {
      const o = await openRecital(me(req), req.params.rid);
      if (o.error) return err(reply, o.error[0], o.error[1]);
      await db
        .update(t.hifzRecital)
        .set({ canceledAt: new Date() })
        .where(eq(t.hifzRecital.id, o.recital.id));
      await audit(db, me(req), 'recital.annulation', o.recital.id, {});
      return { ok: true };
    },
  );

  // ---------------------------------------------------------------- famille

  /**
   * Séances des classes d'un profil de la famille : date et titre ; SES passages seulement (jamais ceux des
   * autres élèves) ; la note n'apparaît qu'une fois le résultat publié.
   */
  app.get<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/recitals',
    { schema: idParams('id') },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      const pupils = await db
        .select({ id: t.classPupil.id, classId: t.classPupil.classId, classe: t.classGroup.name })
        .from(t.classPupil)
        .innerJoin(t.classGroup, eq(t.classGroup.id, t.classPupil.classId))
        .where(eq(t.classPupil.profileId, p.id));
      if (!pupils.length) return { recitals: [] };
      const recitals = await db
        .select()
        .from(t.hifzRecital)
        .where(
          and(
            inArray(
              t.hifzRecital.classId,
              pupils.map((x) => x.classId),
            ),
            isNull(t.hifzRecital.canceledAt),
          ),
        )
        .orderBy(asc(t.hifzRecital.day));
      const mine = recitals.length
        ? await db
            .select()
            .from(t.hifzRecitalEntry)
            .where(
              and(
                inArray(
                  t.hifzRecitalEntry.recitalId,
                  recitals.map((r) => r.id),
                ),
                inArray(
                  t.hifzRecitalEntry.pupilId,
                  pupils.map((x) => x.id),
                ),
              ),
            )
        : [];
      return {
        recitals: recitals.map((r) => {
          const e = mine.find((x) => x.recitalId === r.id);
          const v = e ? viewEntry(e) : null;
          return {
            id: r.id,
            titre: r.title,
            jour: r.day,
            classe: pupils.find((x) => x.classId === r.classId)?.classe ?? '',
            publie: !!r.publishedAt,
            passages: v ? [...v.tires, ...(v.choix ? [v.choix] : [])] : [],
            // résultat officiel seulement après publication ; jamais les compteurs détaillés des autres
            resultat:
              v && r.publishedAt && v.note
                ? {
                    total: v.note.total,
                    mention: v.note.mention,
                    validation: v.note.validation,
                    coran15: v.note.coran15,
                  }
                : null,
          };
        }),
      };
    },
  );
}
