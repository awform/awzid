/**
 * Tableau de bord « école » (suite V1-b, CDC §2.9) : synthèse de TOUTES les classes de l'enseignant connecté —
 * effectifs (application / papier), élèves actifs sur 7 jours, devoirs en cours, copies à corriger,
 * certificats délivrés, récitals publiés. Des COMPTES seulement : aucune donnée élève par élève, aucun
 * classement. Pas de rôle « direction » (décision du client, D15) : chacun ne voit que ses propres classes.
 */
import type { FastifyInstance } from 'fastify';
import { and, count, countDistinct, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { schema as t, teachesClass, type Db } from '@awform/db';
import { needTeacher } from './guards.js';

export interface ClassSummary {
  id: string;
  nom: string;
  niveau: string | null;
  ecole: string | null;
  eleves: number;
  elevesApplication: number;
  elevesPapier: number;
  actifs7j: number;
  devoirsEnCours: number;
  copiesACorriger: number;
  certificats: number;
  recitalsPublies: number;
}

type Totals = Omit<ClassSummary, 'id' | 'nom' | 'niveau' | 'ecole'>;

/** Totaux de l'ensemble des classes (les élèves inscrits dans deux classes comptent deux fois). */
export function totals(rows: ClassSummary[]): Totals & { classes: number } {
  const z: Totals = {
    eleves: 0,
    elevesApplication: 0,
    elevesPapier: 0,
    actifs7j: 0,
    devoirsEnCours: 0,
    copiesACorriger: 0,
    certificats: 0,
    recitalsPublies: 0,
  };
  for (const r of rows) for (const k of Object.keys(z) as Array<keyof Totals>) z[k] += r[k];
  return { classes: rows.length, ...z };
}

/** Taux d'activité (%) arrondi : élèves actifs / élèves de l'application ; null sans élève de l'application. */
export function activityRate(
  r: Pick<ClassSummary, 'actifs7j' | 'elevesApplication'>,
): number | null {
  return r.elevesApplication > 0 ? Math.round((100 * r.actifs7j) / r.elevesApplication) : null;
}

/** Compte par classe (requête groupée) → Map classe → nombre. */
async function byClass(
  rows: Promise<Array<{ classId: string | null; n: number }>>,
): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  for (const r of await rows) if (r.classId) m.set(r.classId, Number(r.n));
  return m;
}

export function registerEcoleSynthese(app: FastifyInstance, db: Db): void {
  app.get('/api/v1/ecole/synthese', { preHandler: needTeacher }, async (req) => {
    const me = req.auth!.accountId;
    const classes = await db
      .select({
        id: t.classGroup.id,
        nom: t.classGroup.name,
        niveau: t.classGroup.levelCode,
        ecole: t.classGroup.schoolName,
      })
      .from(t.classGroup)
      .where(teachesClass(me))
      .orderBy(t.classGroup.name);
    const ids = classes.map((c) => c.id);
    if (!ids.length) return { classes: [], totaux: totals([]) };
    const today = new Date().toISOString().slice(0, 10);
    const since = new Date(Date.now() - 7 * 86_400_000);

    const [pupils, app_, actifs, devoirs, copies, certs, recitals] = await Promise.all([
      byClass(
        db
          .select({ classId: t.classPupil.classId, n: count() })
          .from(t.classPupil)
          .where(inArray(t.classPupil.classId, ids))
          .groupBy(t.classPupil.classId),
      ),
      byClass(
        db
          .select({ classId: t.classPupil.classId, n: count() })
          .from(t.classPupil)
          .where(and(inArray(t.classPupil.classId, ids), isNotNull(t.classPupil.profileId)))
          .groupBy(t.classPupil.classId),
      ),
      // élèves de l'application qui ont envoyé au moins une réponse ces 7 derniers jours
      byClass(
        db
          .select({ classId: t.classPupil.classId, n: countDistinct(t.classPupil.profileId) })
          .from(t.classPupil)
          .innerJoin(t.attempt, eq(t.attempt.profileId, t.classPupil.profileId))
          .where(and(inArray(t.classPupil.classId, ids), gte(t.attempt.serverAt, since)))
          .groupBy(t.classPupil.classId),
      ),
      byClass(
        db
          .select({ classId: t.classAssignment.classId, n: count() })
          .from(t.classAssignment)
          .where(and(inArray(t.classAssignment.classId, ids), gte(t.classAssignment.dueDay, today)))
          .groupBy(t.classAssignment.classId),
      ),
      byClass(
        db
          .select({ classId: t.freeAnswer.classId, n: count() })
          .from(t.freeAnswer)
          .where(and(inArray(t.freeAnswer.classId, ids), isNull(t.freeAnswer.correctedAt)))
          .groupBy(t.freeAnswer.classId),
      ),
      byClass(
        db
          .select({ classId: t.certificate.classId, n: count() })
          .from(t.certificate)
          .where(and(inArray(t.certificate.classId, ids), isNull(t.certificate.revokedAt)))
          .groupBy(t.certificate.classId),
      ),
      byClass(
        db
          .select({ classId: t.hifzRecital.classId, n: count() })
          .from(t.hifzRecital)
          .where(
            and(
              inArray(t.hifzRecital.classId, ids),
              isNotNull(t.hifzRecital.publishedAt),
              sql`${t.hifzRecital.canceledAt} IS NULL`,
            ),
          )
          .groupBy(t.hifzRecital.classId),
      ),
    ]);
    const rows: ClassSummary[] = classes.map((c) => {
      const eleves = pupils.get(c.id) ?? 0;
      const application = app_.get(c.id) ?? 0;
      return {
        ...c,
        eleves,
        elevesApplication: application,
        elevesPapier: eleves - application,
        actifs7j: actifs.get(c.id) ?? 0,
        devoirsEnCours: devoirs.get(c.id) ?? 0,
        copiesACorriger: copies.get(c.id) ?? 0,
        certificats: certs.get(c.id) ?? 0,
        recitalsPublies: recitals.get(c.id) ?? 0,
      };
    });
    return {
      classes: rows.map((r) => ({ ...r, tauxActivite: activityRate(r) })),
      totaux: totals(rows),
    };
  });
}
