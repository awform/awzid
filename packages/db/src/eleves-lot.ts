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
  });
  const [cl] = await db
    .select({ year: t.classGroup.schoolYearId })
    .from(t.classGroup)
    .where(eq(t.classGroup.id, p.classId));
  const jour = new Date().toISOString().slice(0, 10);
  const crees = await db.transaction(async (tx) => {
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
    return out;
  });
  return { lot, eleves: crees };
}
