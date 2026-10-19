/**
 * Tuteur de CONVERSATION (19/10/2026) : registre de la dépense et du temps de parole (plafonds), seuils d'alerte.
 * Montants en micro-euros. Les fenêtres « jour » et « mois » sont en UTC (comme le mois du tuteur des leçons).
 */
import { and, desc, eq, gte, lt, ne, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import * as t from './schema.js';

const debutJour = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const debutMois = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
export const moisCle = (now = new Date()) => now.toISOString().slice(0, 7);

export interface EtatDepenseDb {
  moisMicros: number;
  jourMicros: number;
  eleveSecondes: number;
  eleveRequetes: number;
}

/** Dépense globale du mois et du jour (réservations comprises) et usage de l'élève aujourd'hui. */
export async function etatDepense(
  db: Db,
  profileId: string | null,
  fournisseur: string,
  now = new Date(),
): Promise<EtatDepenseDb> {
  const jour = debutJour(now);
  const [g] = await db
    .select({
      mois: sql<string>`coalesce(sum(${t.tutorSpend.costMicros}), 0)`,
      jour: sql<string>`coalesce(sum(${t.tutorSpend.costMicros}) filter (where ${t.tutorSpend.createdAt} >= ${jour}), 0)`,
    })
    .from(t.tutorSpend)
    .where(
      and(
        eq(t.tutorSpend.fournisseur, fournisseur),
        gte(t.tutorSpend.createdAt, debutMois(now)),
        ne(t.tutorSpend.statut, 'annule'),
      ),
    );
  let eleveSecondes = 0;
  let eleveRequetes = 0;
  if (profileId) {
    const [e] = await db
      .select({
        s: sql<string>`coalesce(sum(${t.tutorSpend.secondes}), 0)`,
        n: sql<string>`count(*)`,
      })
      .from(t.tutorSpend)
      .where(and(eq(t.tutorSpend.profileId, profileId), gte(t.tutorSpend.createdAt, jour)));
    eleveSecondes = Number(e?.s ?? 0);
    eleveRequetes = Number(e?.n ?? 0);
  }
  return {
    moisMicros: Number(g?.mois ?? 0),
    jourMicros: Number(g?.jour ?? 0),
    eleveSecondes,
    eleveRequetes,
  };
}

export async function reserverDepense(
  db: Db,
  r: { profileId: string; costMicros: number; fournisseur: string },
): Promise<string> {
  const [x] = await db
    .insert(t.tutorSpend)
    .values({ ...r, statut: 'reserve' })
    .returning({ id: t.tutorSpend.id });
  return x!.id;
}

/** Coût réel (≤ réservation) et temps de parole ; « annule » : aucun coût (appel non fait ou refusé avant). */
export async function solderDepense(
  db: Db,
  id: string,
  s: { costMicros: number; secondes: number; statut: 'fait' | 'annule' },
): Promise<void> {
  await db.update(t.tutorSpend).set(s).where(eq(t.tutorSpend.id, id));
}

/** Enregistre les seuils franchis ; renvoie seulement ceux qui ne l'étaient pas encore ce mois-ci. */
export async function noterSeuils(
  db: Db,
  mois: string,
  seuils: number[],
  depenseMicros: number,
  plafondMicros: number,
): Promise<number[]> {
  if (!seuils.length) return [];
  const r = await db
    .insert(t.tutorBudgetAlert)
    .values(seuils.map((seuil) => ({ mois, seuil, depenseMicros, plafondMicros })))
    .onConflictDoNothing()
    .returning({ seuil: t.tutorBudgetAlert.seuil });
  return r.map((x) => x.seuil).sort((a, b) => a - b);
}

export async function seuilsDuMois(db: Db, mois: string) {
  return db
    .select()
    .from(t.tutorBudgetAlert)
    .where(eq(t.tutorBudgetAlert.mois, mois))
    .orderBy(desc(t.tutorBudgetAlert.seuil));
}

/** Purge (travailleur) : registre de dépense et alertes au-delà de 400 jours (comptes de l'année). */
export async function purgeTuteurDepense(db: Db, now = new Date()): Promise<number> {
  const limite = new Date(now.getTime() - 400 * 86_400_000);
  const a = await db.delete(t.tutorSpend).where(lt(t.tutorSpend.createdAt, limite));
  await db.delete(t.tutorBudgetAlert).where(lt(t.tutorBudgetAlert.createdAt, limite));
  return a.rowCount ?? 0;
}
