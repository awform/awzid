/**
 * Lot 11 (étude des plateformes, recommandations « à adopter tout de suite ») :
 * - séance du jour (« Aujourd'hui ») : leçon en cours ; le hifẓ et les mots sont calculés sur l'appareil ;
 * - régularité SANS PUNITION (ados et adultes) : jours de travail de la semaine, objectif et jours de repos
 *   choisis ; RIEN pour les enfants (aucun compteur) ; aucune série à perdre, aucune notification ;
 * - jalons de maîtrise (lettres sues, leçons terminées / maîtrisées) — jamais de points ni de classement ;
 * - rapport hebdomadaire (semaine du lundi au dimanche), pour le parent et l'adulte ;
 * - réglages protecteurs des mineurs (état lisible par le parent).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { dashboard, levelProgress, listUnits, schema as t, type Db } from '@awform/db';
import { ownsProfile } from './auth/routes.js';

type Edition = () => Promise<{ id: string; code: string } | null>;
const err = (reply: FastifyReply, status: number, code: string) =>
  reply.code(status).send({ error: { code } });
const UUID = { type: 'string', format: 'uuid' } as const;
const DAY = '^\\d{4}-\\d{2}-\\d{2}$';

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
/** 1 = lundi … 7 = dimanche */
export const isoWeekday = (d: string) => ((new Date(ms(d)).getUTCDay() + 6) % 7) + 1;
/** lundi de la semaine d'un jour */
export const mondayOf = (d: string) => iso(ms(d) - (isoWeekday(d) - 1) * 86_400_000);

export function registerToday(app: FastifyInstance, db: Db, edition: Edition): void {
  const guard = async (req: FastifyRequest, reply: FastifyReply, id: string) => {
    if (!req.auth) return err(reply, 401, 'non_connecte');
    if (!(await ownsProfile(db, req.auth.accountId, id)))
      return err(reply, 404, 'profil_introuvable');
  };

  async function profileOf(id: string) {
    const [p] = await db.select().from(t.profile).where(eq(t.profile.id, id));
    if (!p) return null;
    // audit MIN-2 : même source que le tuteur — le genre du profil
    return { ...p, enfant: p.kind === 'enfant', mineur: p.kind !== 'adulte' };
  }

  async function milestones(profileId: string) {
    const traces = await db
      .select({ item: t.practiceEvent.item, details: t.practiceEvent.details })
      .from(t.practiceEvent)
      .where(
        and(
          eq(t.practiceEvent.profileId, profileId),
          eq(t.practiceEvent.kind, 'trace'),
          eq(t.practiceEvent.ok, true),
        ),
      );
    // lettre SUE : tracée seule (étape 3), sans modèle
    const lettres = [
      ...new Set(
        traces
          .filter((x) => (x.details as { etape?: number } | null)?.etape === 3)
          .map((x) => x.item.split(':')[0] ?? ''),
      ),
    ].filter(Boolean);
    const prog = await db
      .select({ status: t.progress.status, n: sql<number>`count(*)::int` })
      .from(t.progress)
      .where(eq(t.progress.profileId, profileId))
      .groupBy(t.progress.status);
    const n = (s: string) => prog.find((p) => p.status === s)?.n ?? 0;
    return {
      lettres,
      leconsTerminees: n('terminee') + n('maitrisee'),
      leconsMaitrisees: n('maitrisee'),
    };
  }

  async function rhythm(profileId: string) {
    const [r] = await db
      .select()
      .from(t.profileRhythm)
      .where(eq(t.profileRhythm.profileId, profileId));
    return { objectif: r?.weeklyGoal ?? 4, repos: (r?.restDays as number[] | undefined) ?? [] };
  }

  /** jours actifs d'une semaine (lundi → dimanche) : au moins une activité enregistrée */
  async function week(profileId: string, monday: string) {
    const sunday = iso(ms(monday) + 6 * 86_400_000);
    const d = await dashboard(db, profileId, sunday, 7);
    return d.activity.map((a) => ({
      ...a,
      weekday: isoWeekday(a.day),
      actif: a.reponses + a.traces + a.cartes + a.hifz > 0,
    }));
  }

  // ---------------------------------------------------------------- séance du jour
  app.get<{ Params: { id: string }; Querystring: { today?: string } }>(
    '/api/v1/today/:id',
    {
      schema: {
        params: { type: 'object', properties: { id: UUID }, required: ['id'] },
        querystring: { type: 'object', properties: { today: { type: 'string', pattern: DAY } } },
      },
    },
    async (req, reply) => {
      await guard(req, reply, req.params.id);
      // une réponse déjà envoyée (refus) arrête ici : une réponse Fastify est « thenable »
      if (reply.sent) return reply;
      const p = await profileOf(req.params.id);
      if (!p) return err(reply, 404, 'profil_introuvable');
      const today = req.query.today ?? iso(Date.now());
      const ed = await edition();
      let lecon: { id: string; titleFr: string | null; levelCode: string; n: number } | null = null;
      if (ed && p.levelCode) {
        const units = await listUnits(db, ed.id, p.levelCode);
        const prog = await levelProgress(
          db,
          p.id,
          units.map((u) => u.id),
        );
        const done = new Set(
          (prog as Array<{ unitId: string; status: string }>)
            .filter((x) => x.status === 'terminee' || x.status === 'maitrisee')
            .map((x) => x.unitId),
        );
        const next = units.find((u) => !done.has(u.id));
        if (next)
          lecon = { id: next.id, titleFr: next.titleFr ?? null, levelCode: p.levelCode, n: next.n };
      }
      let regularite = null;
      if (!p.enfant) {
        const r = await rhythm(p.id);
        const days = await week(p.id, mondayOf(today));
        regularite = {
          ...r,
          joursActifs: days.filter((d) => d.actif && d.day <= today).length,
          semaine: days.map((d) => ({
            day: d.day,
            weekday: d.weekday,
            actif: d.actif && d.day <= today,
            repos: r.repos.includes(d.weekday),
          })),
        };
      }
      return {
        profil: { id: p.id, kind: p.kind, enfant: p.enfant, levelCode: p.levelCode },
        today,
        dimanche: isoWeekday(today) === 7,
        lecon,
        regularite,
        jalons: await milestones(p.id),
      };
    },
  );

  /** Régularité : objectif (3 à 6 jours) et jours de repos — ados et adultes seulement. */
  app.put<{ Params: { id: string }; Body: { objectif: number; repos: number[] } }>(
    '/api/v1/profiles/:id/regularite',
    {
      schema: {
        params: { type: 'object', properties: { id: UUID }, required: ['id'] },
        body: {
          type: 'object',
          required: ['objectif', 'repos'],
          additionalProperties: false,
          properties: {
            objectif: { type: 'integer', minimum: 3, maximum: 6 },
            repos: {
              type: 'array',
              maxItems: 4,
              uniqueItems: true,
              items: { type: 'integer', minimum: 1, maximum: 7 },
            },
          },
        },
      },
    },
    async (req, reply) => {
      await guard(req, reply, req.params.id);
      // une réponse déjà envoyée (refus) arrête ici : une réponse Fastify est « thenable »
      if (reply.sent) return reply;
      const p = await profileOf(req.params.id);
      if (!p || p.enfant) return err(reply, 400, 'pas_pour_les_enfants');
      if (req.body.objectif + req.body.repos.length > 7)
        return err(reply, 400, 'objectif_trop_haut');
      await db
        .insert(t.profileRhythm)
        .values({
          profileId: p.id,
          weeklyGoal: req.body.objectif,
          restDays: [...req.body.repos].sort(),
        })
        .onConflictDoUpdate({
          target: t.profileRhythm.profileId,
          set: {
            weeklyGoal: req.body.objectif,
            restDays: [...req.body.repos].sort(),
            updatedAt: new Date(),
          },
        });
      return rhythm(p.id);
    },
  );

  // ---------------------------------------------------------------- rapport hebdomadaire
  app.get<{ Params: { id: string }; Querystring: { dimanche?: string } }>(
    '/api/v1/rapport-hebdo/:id',
    {
      schema: {
        params: { type: 'object', properties: { id: UUID }, required: ['id'] },
        querystring: { type: 'object', properties: { dimanche: { type: 'string', pattern: DAY } } },
      },
    },
    async (req, reply) => {
      await guard(req, reply, req.params.id);
      // une réponse déjà envoyée (refus) arrête ici : une réponse Fastify est « thenable »
      if (reply.sent) return reply;
      const p = await profileOf(req.params.id);
      if (!p) return err(reply, 404, 'profil_introuvable');
      const ref = req.query.dimanche ?? iso(Date.now());
      const monday = mondayOf(ref);
      const sunday = iso(ms(monday) + 6 * 86_400_000);
      const days = await week(p.id, monday);
      const start = new Date(`${monday}T00:00:00Z`);
      const end = new Date(ms(sunday) + 86_400_000);
      const lessons = await db
        .select({ unitId: t.progress.unitId, status: t.progress.status })
        .from(t.progress)
        .where(
          and(
            eq(t.progress.profileId, p.id),
            gte(t.progress.updatedAt, start),
            lte(t.progress.updatedAt, end),
            sql`${t.progress.status} IN ('terminee', 'maitrisee')`,
          ),
        );
      const validations = await db
        .select({ day: t.hifzEvent.day, part: t.hifzEvent.part, details: t.hifzEvent.details })
        .from(t.hifzEvent)
        .where(
          and(
            eq(t.hifzEvent.profileId, p.id),
            eq(t.hifzEvent.source, 'enseignant'),
            gte(t.hifzEvent.day, monday),
            lte(t.hifzEvent.day, sunday),
          ),
        );
      const answered = await db
        .select({ text: t.tutorQuestion.text, answer: t.tutorQuestion.answer })
        .from(t.tutorQuestion)
        .where(
          and(
            eq(t.tutorQuestion.profileId, p.id),
            eq(t.tutorQuestion.status, 'repondue'),
            gte(t.tutorQuestion.answeredAt, start),
            lte(t.tutorQuestion.answeredAt, end),
          ),
        );
      return {
        profil: { id: p.id, pseudonym: p.pseudonym, enfant: p.enfant },
        semaine: { lundi: monday, dimanche: sunday },
        // enfants : aucun compteur de jours (seulement ce qui a été fait)
        joursActifs: p.enfant ? null : days.filter((d) => d.actif).length,
        totaux: {
          reponses: days.reduce((s, d) => s + d.reponses, 0),
          cartes: days.reduce((s, d) => s + d.cartes, 0),
          traces: days.reduce((s, d) => s + d.traces, 0),
          hifz: days.reduce((s, d) => s + d.hifz, 0),
        },
        lecons: lessons,
        validations: validations.map((v) => ({
          day: v.day,
          part: v.part,
          mention: (v.details as { note?: { mention?: string } } | null)?.note?.mention ?? null,
        })),
        reponsesEnseignant: answered,
        jalons: await milestones(p.id),
      };
    },
  );

  // ---------------------------------------------------------------- réglages protecteurs (mineurs)
  app.get<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/protections',
    { schema: { params: { type: 'object', properties: { id: UUID }, required: ['id'] } } },
    async (req, reply) => {
      await guard(req, reply, req.params.id);
      // une réponse déjà envoyée (refus) arrête ici : une réponse Fastify est « thenable »
      if (reply.sent) return reply;
      const p = await profileOf(req.params.id);
      if (!p) return err(reply, 404, 'profil_introuvable');
      const consents = await db
        .select({ type: t.consent.type })
        .from(t.consent)
        .where(and(eq(t.consent.profileId, p.id), isNull(t.consent.withdrawnAt)));
      const has = (k: string) => consents.some((c) => c.type === k);
      return {
        mineur: p.mineur,
        enfant: p.enfant,
        // valeurs PAR DÉFAUT protectrices ; seul le parent peut les changer (Mon compte)
        tuteurIA: has('tuteur_ia'),
        texteLibreTuteur: !p.enfant,
        partageEnseignant: has('partage_enseignant'),
        rappels: has('rappels'),
        horaireNuit: p.enfant ? 'aucun tuteur entre 21 h et 7 h' : null,
        compteurRegularite: !p.enfant,
        personnalisationComportementale: false,
        monnaieVirtuelle: false,
        lectureAutomatique: false,
        publicite: false,
        // lot 16 : seulement si la famille l'a choisi (accord « envoi_recitation »), vers l'enseignant de la classe
        enregistrementsEnvoyes: has('envoi_recitation'),
      };
    },
  );
}
