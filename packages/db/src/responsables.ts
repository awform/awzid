/**
 * Responsables d'un profil et cycle de vie du mineur (lot F2, revue d'architecture E3 et E4).
 *  - Accès à un profil (`canActForProfile`) : son TITULAIRE, un PARENT actif (`profile_custodian`, ex-
 *    guardianship enfin lue), ou une session de TABLETTE DE CLASSE pour les élèves de cette classe.
 *  - École : élève « papier » converti en profil (titulaire : compte de l'école ; preuve du consentement PAPIER) ;
 *    rattachement ultérieur à un parent par un code à usage unique.
 *  - Second parent : invitation par code, acceptation par l'autre parent connecté.
 *  - Type enfant / ado / adulte recalculé depuis l'année de naissance à chaque lecture.
 *  - Émancipation : le jeune reprend son profil (tout l'historique) dans son propre compte.
 * Les codes ne sont jamais stockés en clair (SHA-256), ils expirent et ne servent qu'une fois.
 */
import { createHash, randomInt } from 'node:crypto';
import { and, asc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { profileKindFromYear } from '@awform/content';
import type { Db } from './client.js';
import { ensureSchoolAccount } from './ecole.js';
import * as t from './schema.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newInviteCode(): string {
  let s = '';
  for (let i = 0; i < 10; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}
export const codeHash = (code: string) =>
  createHash('sha256').update(code.replace(/[\s-]/g, '').toUpperCase()).digest('hex');

// ---------------------------------------------------------------- accès

export interface TabletScope {
  classId: string;
}

/**
 * Le compte peut-il agir pour ce profil ? Titulaire, parent actif ; en mode tablette (compte de l'école),
 * seulement un élève PRÉSENT dans la liste de la classe de la tablette, inscrit par l'école ou dont le parent a
 * donné son accord (inscription à la classe).
 */
export async function canActForProfile(
  db: Db,
  accountId: string,
  profileId: string,
  tablet?: TabletScope | null,
): Promise<boolean> {
  if (tablet) {
    const [r] = await db
      .select({ owner: t.profile.ownerAccountId, member: t.classMember.profileId })
      .from(t.classPupil)
      .innerJoin(t.profile, eq(t.profile.id, t.classPupil.profileId))
      .leftJoin(
        t.classMember,
        and(
          eq(t.classMember.classId, t.classPupil.classId),
          eq(t.classMember.profileId, t.classPupil.profileId),
        ),
      )
      .where(
        and(
          eq(t.classPupil.classId, tablet.classId),
          eq(t.classPupil.profileId, profileId),
          isNull(t.classPupil.leftAt),
        ),
      );
    return !!r && (r.owner === accountId || !!r.member);
  }
  const [p] = await db
    .select({ id: t.profile.id })
    .from(t.profile)
    .where(
      and(
        eq(t.profile.id, profileId),
        or(
          eq(t.profile.ownerAccountId, accountId),
          sql`EXISTS (SELECT 1 FROM "profile_custodian" pc WHERE pc."profile_id" = ${t.profile.id}
            AND pc."account_id" = ${accountId}::uuid AND pc."nature" = 'parent' AND pc."status" = 'actif')`,
        ),
      ),
    );
  return !!p;
}

export interface FamilyProfile {
  id: string;
  kind: 'enfant' | 'ado' | 'adulte';
  pseudonym: string;
  birthYear: number | null;
  avatar: string | null;
  levelCode: string | null;
  /** titulaire : le compte connecté porte le profil ; parent : second parent ; classe : tablette */
  lien: 'titulaire' | 'parent' | 'classe';
}

/** Profils visibles par le compte (titulaire + parent actif), ou les élèves de la classe en mode tablette. */
export async function visibleProfiles(
  db: Db,
  accountId: string,
  tablet?: TabletScope | null,
): Promise<FamilyProfile[]> {
  const cols = {
    id: t.profile.id,
    kind: t.profile.kind,
    pseudonym: t.profile.pseudonym,
    birthYear: t.profile.birthYear,
    avatar: t.profile.avatar,
    levelCode: t.profile.levelCode,
    owner: t.profile.ownerAccountId,
    createdAt: t.profile.createdAt,
  };
  let rows: Array<{
    id: string;
    kind: 'enfant' | 'ado' | 'adulte';
    pseudonym: string;
    birthYear: number | null;
    avatar: string | null;
    levelCode: string | null;
    owner: string;
    createdAt: Date;
  }>;
  if (tablet) {
    rows = (
      await db
        .select({ ...cols, member: t.classMember.profileId })
        .from(t.classPupil)
        .innerJoin(t.profile, eq(t.profile.id, t.classPupil.profileId))
        .leftJoin(
          t.classMember,
          and(
            eq(t.classMember.classId, t.classPupil.classId),
            eq(t.classMember.profileId, t.classPupil.profileId),
          ),
        )
        .where(and(eq(t.classPupil.classId, tablet.classId), isNull(t.classPupil.leftAt)))
        .orderBy(asc(t.profile.pseudonym))
    ).filter((r) => r.owner === accountId || !!r.member);
  } else {
    rows = await db
      .select(cols)
      .from(t.profile)
      .where(
        or(
          eq(t.profile.ownerAccountId, accountId),
          sql`EXISTS (SELECT 1 FROM "profile_custodian" pc WHERE pc."profile_id" = ${t.profile.id}
            AND pc."account_id" = ${accountId}::uuid AND pc."nature" = 'parent' AND pc."status" = 'actif')`,
        ),
      )
      .orderBy(asc(t.profile.createdAt));
  }
  await refreshProfileKinds(db, rows);
  return rows.map((r) => ({
    id: r.id,
    kind: (profileKindFromYear(r.birthYear) ?? r.kind) as FamilyProfile['kind'],
    pseudonym: r.pseudonym,
    birthYear: r.birthYear,
    avatar: r.avatar,
    levelCode: r.levelCode,
    lien: tablet ? 'classe' : r.owner === accountId ? 'titulaire' : 'parent',
  }));
}

/**
 * Revue E4 : le type (enfant < 13 ans, ado < 18 ans, adulte) suit l'année de naissance — corrigé en base dès
 * qu'il ne correspond plus (un enfant de 12 ans devient « ado » l'année de ses 13 ans, protections adaptées).
 */
export async function refreshProfileKinds(
  db: Db,
  rows: Array<{ id: string; kind: string; birthYear: number | null }>,
  now = new Date(),
): Promise<number> {
  let n = 0;
  for (const r of rows) {
    const k = profileKindFromYear(r.birthYear, now);
    if (k && k !== r.kind) {
      await db.update(t.profile).set({ kind: k }).where(eq(t.profile.id, r.id));
      n++;
    }
  }
  return n;
}

// ---------------------------------------------------------------- responsables

export async function custodiansOf(db: Db, profileId: string) {
  const rows = await db
    .select({
      id: t.profileCustodian.id,
      nature: t.profileCustodian.nature,
      status: t.profileCustodian.status,
      accountId: t.profileCustodian.accountId,
      schoolId: t.profileCustodian.schoolId,
      schoolName: t.school.name,
      email: t.account.email,
      acceptedAt: t.profileCustodian.acceptedAt,
      codeExpiresAt: t.profileCustodian.codeExpiresAt,
    })
    .from(t.profileCustodian)
    .leftJoin(t.account, eq(t.account.id, t.profileCustodian.accountId))
    .leftJoin(t.school, eq(t.school.id, t.profileCustodian.schoolId))
    .where(
      and(eq(t.profileCustodian.profileId, profileId), ne(t.profileCustodian.status, 'termine')),
    )
    .orderBy(asc(t.profileCustodian.createdAt));
  return rows.map((r) => {
    const [local = '', domain = ''] = (r.email ?? '').split('@');
    return { ...r, email: r.email ? `${local.slice(0, 2)}…@${domain}` : null };
  });
}

/** Ajoute (ou réactive) un parent actif. */
export async function addParentCustodian(
  db: Db,
  profileId: string,
  accountId: string,
  evidence: unknown,
  by: string | null,
) {
  const [exists] = await db
    .select({ id: t.profileCustodian.id })
    .from(t.profileCustodian)
    .where(
      and(
        eq(t.profileCustodian.profileId, profileId),
        eq(t.profileCustodian.accountId, accountId),
        eq(t.profileCustodian.nature, 'parent'),
        eq(t.profileCustodian.status, 'actif'),
      ),
    );
  if (exists) return;
  await db.insert(t.profileCustodian).values({
    profileId,
    nature: 'parent',
    accountId,
    status: 'actif',
    evidence: evidence as object,
    createdBy: by,
    acceptedAt: new Date(),
  });
}

/** Fin d'un lien (parent retiré, second parent qui se retire, émancipation). */
export async function endCustodian(
  db: Db,
  profileId: string,
  accountId: string,
  reason: string,
): Promise<boolean> {
  const r = await db
    .update(t.profileCustodian)
    .set({ status: 'termine', endedAt: new Date(), endReason: reason })
    .where(
      and(
        eq(t.profileCustodian.profileId, profileId),
        eq(t.profileCustodian.accountId, accountId),
        eq(t.profileCustodian.status, 'actif'),
      ),
    )
    .returning({ id: t.profileCustodian.id });
  return r.length > 0;
}

/**
 * Invitation à usage unique : « parent » (second parent, ou rattachement d'un élève inscrit par l'école) ou
 * « emancipation » (le jeune reprend son profil). Une seule invitation ouverte par profil et par nature : la
 * précédente est annulée. Renvoie le code EN CLAIR (affiché une fois).
 */
export async function createInvite(
  db: Db,
  i: {
    profileId: string;
    nature: 'parent' | 'emancipation';
    createdBy: string;
    schoolId?: string | null;
    days?: number;
  },
): Promise<{ code: string; expiresAt: Date }> {
  await db
    .update(t.profileCustodian)
    .set({ status: 'termine', endedAt: new Date(), endReason: 'remplacee' })
    .where(
      and(
        eq(t.profileCustodian.profileId, i.profileId),
        eq(t.profileCustodian.nature, i.nature),
        eq(t.profileCustodian.status, 'invite'),
      ),
    );
  const code = newInviteCode();
  const expiresAt = new Date(Date.now() + (i.days ?? 14) * 86400_000);
  await db.insert(t.profileCustodian).values({
    profileId: i.profileId,
    nature: i.nature,
    schoolId: i.schoolId ?? null,
    status: 'invite',
    codeHash: codeHash(code),
    codeExpiresAt: expiresAt,
    createdBy: i.createdBy,
  });
  return { code, expiresAt };
}

/** Invitation encore valable pour ce code (sans la consommer). */
export async function openInvite(db: Db, code: string, nature: 'parent' | 'emancipation') {
  const [r] = await db
    .select()
    .from(t.profileCustodian)
    .where(
      and(
        eq(t.profileCustodian.codeHash, codeHash(code)),
        eq(t.profileCustodian.nature, nature),
        eq(t.profileCustodian.status, 'invite'),
        gt(t.profileCustodian.codeExpiresAt, new Date()),
      ),
    );
  return r ?? null;
}

/**
 * Acceptation par un PARENT (second parent, ou rattachement d'un élève de l'école) : le parent devient
 * responsable actif. Un profil dont le titulaire est le compte d'une école passe au parent (il devient titulaire :
 * export, suppression, achats) ; l'école reste responsable pour sa classe.
 */
export async function acceptParentInvite(
  db: Db,
  code: string,
  parentAccountId: string,
  evidence: object,
): Promise<{ profileId: string; titulaire: boolean } | null> {
  const inv = await openInvite(db, code, 'parent');
  if (!inv) return null;
  return db.transaction(async (tx) => {
    const done = await tx
      .update(t.profileCustodian)
      .set({ status: 'termine', endedAt: new Date(), endReason: 'acceptee', codeHash: null })
      .where(and(eq(t.profileCustodian.id, inv.id), eq(t.profileCustodian.status, 'invite')))
      .returning({ id: t.profileCustodian.id });
    if (!done.length) return null;
    const d = tx as unknown as Db;
    await addParentCustodian(d, inv.profileId, parentAccountId, evidence, inv.createdBy);
    const [p] = await tx
      .select({ owner: t.profile.ownerAccountId, ownerKind: t.account.kind })
      .from(t.profile)
      .innerJoin(t.account, eq(t.account.id, t.profile.ownerAccountId))
      .where(eq(t.profile.id, inv.profileId));
    let titulaire = false;
    if (p?.ownerKind === 'ecole') {
      await tx
        .update(t.profile)
        .set({ ownerAccountId: parentAccountId })
        .where(eq(t.profile.id, inv.profileId));
      titulaire = true;
    }
    return { profileId: inv.profileId, titulaire };
  });
}

// ---------------------------------------------------------------- école : élève papier → profil

/**
 * Conversion d'un élève « papier » en profil de l'application (revue E3) : titulaire = compte de l'école,
 * responsable « ecole » avec la PREUVE du consentement recueilli sur papier (date, signataire, référence du
 * formulaire, auteur de la saisie). Le profil rejoint la classe (partage avec l'enseignant).
 */
export async function convertPaperPupil(
  db: Db,
  p: {
    pupilId: string;
    classId: string;
    schoolId: string;
    pseudonym: string;
    birthYear: number;
    avatar?: string | null;
    levelCode?: string | null;
    consent: { date: string; signataire: string; reference?: string | null };
    by: string;
  },
): Promise<{ profileId: string } | 'deja_profil'> {
  const [pupil] = await db
    .select({ profileId: t.classPupil.profileId })
    .from(t.classPupil)
    .where(eq(t.classPupil.id, p.pupilId));
  if (pupil?.profileId) return 'deja_profil';
  const owner = await ensureSchoolAccount(db, p.schoolId);
  const kind = profileKindFromYear(p.birthYear) ?? 'enfant';
  return db.transaction(async (tx) => {
    const [prof] = await tx
      .insert(t.profile)
      .values({
        ownerAccountId: owner,
        kind,
        pseudonym: p.pseudonym,
        birthYear: p.birthYear,
        avatar: p.avatar ?? 'etoile',
        levelCode: p.levelCode ?? null,
      })
      .returning({ id: t.profile.id });
    const evidence = {
      forme: 'papier',
      recueilliPar: 'ecole',
      date: p.consent.date,
      signataire: p.consent.signataire,
      reference: p.consent.reference ?? null,
      saisiPar: p.by,
      saisiLe: new Date().toISOString(),
    };
    await tx.insert(t.profileCustodian).values({
      profileId: prof!.id,
      nature: 'ecole',
      schoolId: p.schoolId,
      status: 'actif',
      evidence,
      createdBy: p.by,
      acceptedAt: new Date(),
    });
    await tx.insert(t.consent).values(
      ['compte_suivi', 'partage_enseignant'].map((type) => ({
        accountId: owner,
        profileId: prof!.id,
        type,
        textVersion: 'papier',
        evidence,
      })),
    );
    await tx
      .update(t.classPupil)
      .set({ profileId: prof!.id })
      .where(eq(t.classPupil.id, p.pupilId));
    await tx
      .insert(t.classMember)
      .values({ classId: p.classId, profileId: prof!.id, addedBy: p.by })
      .onConflictDoNothing();
    return { profileId: prof!.id };
  });
}

// ---------------------------------------------------------------- émancipation

/**
 * Le jeune (titulaire d'un compte adulte qu'il vient de créer) reprend son profil avec TOUT l'historique :
 * le profil change de titulaire ; les parents cessent d'en être responsables ; le profil vide « Moi » créé à
 * l'inscription est retiré s'il n'a aucune activité. Refusé si le compte est déjà titulaire d'un profil actif.
 */
export async function claimProfile(
  db: Db,
  code: string,
  adultAccountId: string,
): Promise<{ profileId: string } | 'code_invalide' | 'compte_occupe'> {
  const inv = await openInvite(db, code, 'emancipation');
  if (!inv) return 'code_invalide';
  const own = await db
    .select({ id: t.profile.id })
    .from(t.profile)
    .where(eq(t.profile.ownerAccountId, adultAccountId));
  const busy: string[] = [];
  for (const o of own) {
    const [a] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(t.attempt)
      .where(eq(t.attempt.profileId, o.id));
    const [h] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(t.hifzEvent)
      .where(eq(t.hifzEvent.profileId, o.id));
    if ((a?.n ?? 0) + (h?.n ?? 0) > 0) busy.push(o.id);
  }
  if (busy.length) return 'compte_occupe';
  return db.transaction(async (tx) => {
    const done = await tx
      .update(t.profileCustodian)
      .set({
        status: 'termine',
        endedAt: new Date(),
        endReason: 'emancipation',
        accountId: adultAccountId,
        codeHash: null,
      })
      .where(and(eq(t.profileCustodian.id, inv.id), eq(t.profileCustodian.status, 'invite')))
      .returning({ id: t.profileCustodian.id });
    if (!done.length) return 'code_invalide' as const;
    if (own.length)
      await tx.delete(t.profile).where(
        inArray(
          t.profile.id,
          own.map((o) => o.id),
        ),
      );
    const [p] = await tx
      .select({ birthYear: t.profile.birthYear })
      .from(t.profile)
      .where(eq(t.profile.id, inv.profileId));
    await tx
      .update(t.profile)
      .set({
        ownerAccountId: adultAccountId,
        kind: profileKindFromYear(p?.birthYear) === 'adulte' ? 'adulte' : 'ado',
      })
      .where(eq(t.profile.id, inv.profileId));
    await tx
      .update(t.profileCustodian)
      .set({ status: 'termine', endedAt: new Date(), endReason: 'emancipation' })
      .where(
        and(
          eq(t.profileCustodian.profileId, inv.profileId),
          eq(t.profileCustodian.nature, 'parent'),
          ne(t.profileCustodian.status, 'termine'),
        ),
      );
    return { profileId: inv.profileId };
  });
}

/**
 * Avant l'effacement d'un compte : ses profils qui ont un AUTRE responsable passent à lui (second parent
 * d'abord, sinon le compte de l'école responsable) au lieu de disparaître. Renvoie les profils transférés.
 */
export async function handOverProfiles(db: Db, accountId: string): Promise<string[]> {
  const owned = await db
    .select({ id: t.profile.id })
    .from(t.profile)
    .where(eq(t.profile.ownerAccountId, accountId));
  const moved: string[] = [];
  for (const p of owned) {
    const [other] = await db
      .select({ a: t.profileCustodian.accountId })
      .from(t.profileCustodian)
      .innerJoin(t.account, eq(t.account.id, t.profileCustodian.accountId))
      .where(
        and(
          eq(t.profileCustodian.profileId, p.id),
          eq(t.profileCustodian.nature, 'parent'),
          eq(t.profileCustodian.status, 'actif'),
          ne(t.profileCustodian.accountId, accountId),
          isNull(t.account.deletedAt),
        ),
      )
      .orderBy(asc(t.profileCustodian.createdAt))
      .limit(1);
    let to = other?.a ?? null;
    if (!to) {
      const [sc] = await db
        .select({ schoolId: t.profileCustodian.schoolId })
        .from(t.profileCustodian)
        .where(
          and(
            eq(t.profileCustodian.profileId, p.id),
            eq(t.profileCustodian.nature, 'ecole'),
            eq(t.profileCustodian.status, 'actif'),
          ),
        )
        .limit(1);
      if (sc?.schoolId) to = await ensureSchoolAccount(db, sc.schoolId);
    }
    if (!to) continue;
    await db.update(t.profile).set({ ownerAccountId: to }).where(eq(t.profile.id, p.id));
    await endCustodian(db, p.id, accountId, 'compte_supprime');
    moved.push(p.id);
  }
  return moved;
}
