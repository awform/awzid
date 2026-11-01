/**
 * V2-5 : création en lot des comptes d'élèves par l'enseignant (une transaction : tout ou rien).
 * Même modèle que `convertPaperPupil` (titulaire = compte technique de l'école, responsable « ecole » avec la PREUVE
 * de l'accord, élève dans la classe) + un identifiant `profile_login` (mêmes protections que l'enfant créé par un
 * parent : session limitée à son profil, verrou, aucun accès hors de son profil).
 */
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { profileKindFromYear } from '@awform/content';
import type { Db } from './client.js';
import { ensureSchoolAccount } from './ecole.js';
import * as t from './schema.js';

/** Plafonds de création (glissants, ne comptent que ce qui a VRAIMENT été créé). */
export const PLAFOND_ELEVES_HEURE = 300;
export const PLAFOND_LOTS_HEURE = 10;
export const PLAFOND_CLASSE = 300;

/** Refus de création : `code` est le code d'erreur de l'API. */
export class RefusCreation extends Error {
  constructor(public readonly code: 'trop_de_demandes' | 'classe_pleine' | 'lot_deja_cree') {
    super(code);
    this.name = 'RefusCreation';
  }
}

/**
 * Plafonds d'un enseignant : 300 élèves et 10 lots par heure glissante (toutes classes confondues), 300 élèves avec
 * identifiant par classe ; clé d'idempotence déjà utilisée. Appelée avant le calcul des empreintes (lecture) puis
 * DANS la transaction, sous verrou (deux demandes simultanées ne dépassent pas ensemble le plafond).
 */
export async function verifierPlafondsLot(
  d: Db,
  p: { teacherAccountId: string; classId: string; nombre: number; cle?: string | null },
): Promise<void> {
  if (p.cle) {
    const dejaPris = await d.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM profile_custodian
      WHERE created_by = ${p.teacherAccountId}::uuid AND nature = 'ecole' AND evidence->>'cle' = ${p.cle}`);
    if ((dejaPris.rows[0]?.n ?? 0) > 0) throw new RefusCreation('lot_deja_cree');
  }
  const lots = await d.execute<{ n: number }>(sql`
    SELECT count(DISTINCT evidence->>'lot')::int AS n FROM profile_custodian
    WHERE created_by = ${p.teacherAccountId}::uuid AND nature = 'ecole' AND evidence->>'lot' IS NOT NULL
      AND created_at > now() - interval '1 hour'`);
  if ((lots.rows[0]?.n ?? 0) >= PLAFOND_LOTS_HEURE) throw new RefusCreation('trop_de_demandes');
  const eleves = await d.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM profile_login
    WHERE created_by_account_id = ${p.teacherAccountId}::uuid AND created_at > now() - interval '1 hour'`);
  if ((eleves.rows[0]?.n ?? 0) + p.nombre > PLAFOND_ELEVES_HEURE)
    throw new RefusCreation('trop_de_demandes');
  if ((await elevesAvecIdentifiant(d, p.classId)) + p.nombre > PLAFOND_CLASSE)
    throw new RefusCreation('classe_pleine');
}

export interface EleveACreer {
  prenom: string;
  annee: number;
  login: string;
  passwordHash: string;
}

export interface EleveCree {
  profileId: string;
  pupilId: string;
  prenom: string;
  annee: number;
  login: string;
}

/** Preuve de l'accord des parents, enregistrée sur chaque profil (école, date, enseignant). */
export function preuveAccordEcole(p: {
  cle?: string | null;
  schoolId: string;
  schoolName: string | null;
  teacherAccountId: string;
  lot: string;
  classId: string;
}) {
  return {
    forme: 'case_accord_ecole',
    recueilliPar: 'ecole',
    texte: 'les_parents_ont_donne_leur_accord_a_l_ecole',
    date: new Date().toISOString().slice(0, 10),
    ecoleId: p.schoolId,
    ecole: p.schoolName,
    enseignant: p.teacherAccountId,
    saisiPar: p.teacherAccountId,
    saisiLe: new Date().toISOString(),
    classe: p.classId,
    lot: p.lot,
    cle: p.cle ?? null,
  };
}

/** identifiants déjà pris parmi ces candidats */
export async function loginsPris(db: Db, logins: readonly string[]): Promise<Set<string>> {
  if (!logins.length) return new Set();
  const r = await db
    .select({ l: t.profileLogin.login })
    .from(t.profileLogin)
    .where(inArray(t.profileLogin.login, [...logins]));
  return new Set(r.map((x) => x.l));
}

/** nombre d'élèves de la classe qui ont déjà un identifiant */
export async function elevesAvecIdentifiant(db: Db, classId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.classPupil)
    .innerJoin(t.profileLogin, eq(t.profileLogin.profileId, t.classPupil.profileId))
    .where(and(eq(t.classPupil.classId, classId), isNull(t.classPupil.leftAt)));
  return r?.n ?? 0;
}

/**
 * Crée les élèves. Lève l'erreur d'unicité PostgreSQL (23505) si un identifiant est pris entre-temps : l'appelant
 * en tire d'autres et recommence (rien n'a été écrit : transaction annulée).
 */
export async function creerElevesEnLot(
  db: Db,
  p: {
    classId: string;
    schoolId: string;
    schoolName: string | null;
    levelCode: string | null;
    teacherAccountId: string;
    eleves: readonly EleveACreer[];
    /** clé d'idempotence choisie par l'appareil (un double envoi ne crée pas deux fois les comptes) */
    cle?: string | null;
    /** exécuté DANS la transaction (niveau des profils, journal) : tout ou rien */
    apres?: (d: Db, creation: { lot: string; eleves: EleveCree[] }) => Promise<void>;
  },
): Promise<{ lot: string; eleves: EleveCree[] }> {
  const owner = await ensureSchoolAccount(db, p.schoolId);
  const lot = randomUUID();
  const evidence = preuveAccordEcole({
    schoolId: p.schoolId,
    schoolName: p.schoolName,
    teacherAccountId: p.teacherAccountId,
    lot,
    classId: p.classId,
    cle: p.cle,
  });
  const [cl] = await db
    .select({ year: t.classGroup.schoolYearId })
    .from(t.classGroup)
    .where(eq(t.classGroup.id, p.classId));
  const jour = new Date().toISOString().slice(0, 10);
  const crees = await db.transaction(async (tx) => {
    const d = tx as unknown as Db;
    // un enseignant à la fois, une classe à la fois : le contrôle des plafonds et la création sont indivisibles
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`lot:${p.teacherAccountId}`}))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`classe:${p.classId}`}))`);
    await verifierPlafondsLot(d, {
      teacherAccountId: p.teacherAccountId,
      classId: p.classId,
      nombre: p.eleves.length,
      cle: p.cle,
    });
    const out: EleveCree[] = [];
    for (const e of p.eleves) {
      const [prof] = await tx
        .insert(t.profile)
        .values({
          ownerAccountId: owner,
          kind: profileKindFromYear(e.annee) ?? 'enfant',
          pseudonym: e.prenom,
          birthYear: e.annee,
          avatar: 'etoile',
          levelCode: p.levelCode,
        })
        .returning({ id: t.profile.id });
      await tx.insert(t.profileLogin).values({
        profileId: prof!.id,
        login: e.login,
        passwordHash: e.passwordHash,
        createdByAccountId: p.teacherAccountId,
      });
      await tx.insert(t.profileCustodian).values({
        profileId: prof!.id,
        nature: 'ecole',
        schoolId: p.schoolId,
        status: 'actif',
        evidence,
        createdBy: p.teacherAccountId,
        acceptedAt: new Date(),
      });
      await tx.insert(t.consent).values(
        ['compte_suivi', 'partage_enseignant'].map((type) => ({
          accountId: owner,
          profileId: prof!.id,
          type,
          textVersion: 'case_accord_ecole',
          evidence,
        })),
      );
      const [pu] = await tx
        .insert(t.classPupil)
        .values({ classId: p.classId, profileId: prof!.id, displayName: e.prenom })
        .returning({ id: t.classPupil.id });
      await tx.insert(t.enrolment).values({
        classId: p.classId,
        pupilId: pu!.id,
        schoolYearId: cl?.year ?? null,
        fromDay: jour,
      });
      await tx
        .insert(t.classMember)
        .values({ classId: p.classId, profileId: prof!.id, addedBy: p.teacherAccountId })
        .onConflictDoNothing();
      out.push({
        profileId: prof!.id,
        pupilId: pu!.id,
        prenom: e.prenom,
        annee: e.annee,
        login: e.login,
      });
    }
    await p.apres?.(d, { lot, eleves: out });
    return out;
  });
  return { lot, eleves: crees };
}
