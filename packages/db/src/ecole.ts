/**
 * École, personnel, enseignants de classe, rôles (lot F2, revue d'architecture E1 et E2).
 *  - une classe appartient à une ÉCOLE ; ses enseignants : un titulaire, des suppléants (`class_teacher`) ;
 *  - personnel de l'école : direction, enseignant, secrétariat (`school_member`) ;
 *  - rôles d'un compte = `account_role` (portée : plateforme, école, classe) ∪ rôles d'école ∪ rôle déduit du
 *    type des comptes de personnel existants (enseignant, admin) ;
 *  - suppression d'un compte d'enseignant : ses classes sont TRANSFÉRÉES (suppléant promu, sinon classe « sans
 *    titulaire » confiée à la direction), jamais effacées.
 */
import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import * as t from './schema.js';

export type SchoolRow = typeof t.school.$inferSelect;
export type SchoolRole = 'direction' | 'enseignant' | 'secretariat';

/** Rôles du compte (pour les gardes) : plateforme + écoles + type des comptes de personnel. */
export async function accountRoles(db: Db, accountId: string, kind?: string): Promise<string[]> {
  const [own, school] = await Promise.all([
    db
      .select({ role: t.accountRole.role })
      .from(t.accountRole)
      .where(eq(t.accountRole.accountId, accountId)),
    db
      .select({ role: t.schoolMember.role })
      .from(t.schoolMember)
      .innerJoin(t.school, eq(t.school.id, t.schoolMember.schoolId))
      .where(and(eq(t.schoolMember.accountId, accountId), ne(t.school.status, 'fermee'))),
  ]);
  const out = new Set([...own.map((r) => r.role), ...school.map((r) => r.role)]);
  if (kind === 'enseignant') out.add('enseignant');
  if (kind === 'admin') out.add('admin');
  return [...out].sort();
}

/** Détail des rôles avec leur portée (affiché dans « Mon compte »). */
export async function accountRoleScopes(db: Db, accountId: string) {
  const own = await db
    .select({
      role: t.accountRole.role,
      schoolId: t.accountRole.schoolId,
      classId: t.accountRole.classId,
    })
    .from(t.accountRole)
    .where(eq(t.accountRole.accountId, accountId));
  const school = await db
    .select({ role: t.schoolMember.role, schoolId: t.schoolMember.schoolId })
    .from(t.schoolMember)
    .where(eq(t.schoolMember.accountId, accountId));
  return [...own, ...school.map((s) => ({ ...s, classId: null }))];
}

export async function grantAccountRole(
  db: Db,
  accountId: string,
  role: t.AccountRoleName,
  scope: { schoolId?: string | null; classId?: string | null } = {},
  by: string | null = null,
) {
  await db
    .insert(t.accountRole)
    .values({
      accountId,
      role,
      schoolId: scope.schoolId ?? null,
      classId: scope.classId ?? null,
      grantedBy: by,
    })
    .onConflictDoNothing();
}

// ---------------------------------------------------------------- écoles

export async function schoolById(db: Db, id: string): Promise<SchoolRow | null> {
  const [s] = await db.select().from(t.school).where(eq(t.school.id, id));
  return s ?? null;
}

/** Écoles du compte, avec ses rôles dans chacune. */
export async function schoolsOf(db: Db, accountId: string) {
  const rows = await db
    .select({ school: t.school, role: t.schoolMember.role })
    .from(t.schoolMember)
    .innerJoin(t.school, eq(t.school.id, t.schoolMember.schoolId))
    .where(eq(t.schoolMember.accountId, accountId))
    .orderBy(asc(t.school.name), asc(t.school.id));
  const out = new Map<string, { school: SchoolRow; roles: string[] }>();
  for (const r of rows) {
    const e = out.get(r.school.id) ?? { school: r.school, roles: [] };
    e.roles.push(r.role);
    out.set(r.school.id, e);
  }
  return [...out.values()];
}

export async function memberRoles(db: Db, accountId: string, schoolId: string): Promise<string[]> {
  const rows = await db
    .select({ role: t.schoolMember.role })
    .from(t.schoolMember)
    .where(and(eq(t.schoolMember.accountId, accountId), eq(t.schoolMember.schoolId, schoolId)));
  return rows.map((r) => r.role);
}

/** Crée une école ; son créateur en est direction et enseignant. */
export async function createSchool(
  db: Db,
  s: {
    name: string;
    nameAr?: string | null;
    country?: string | null;
    place?: string | null;
    placeAr?: string | null;
    tz?: string;
    personal?: boolean;
  },
  createdBy: string,
): Promise<SchoolRow> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(t.school)
      .values({
        name: s.name.trim().slice(0, 120) || 'École',
        nameAr: s.nameAr ?? null,
        country: s.country ?? null,
        place: s.place ?? null,
        placeAr: s.placeAr ?? null,
        tz: s.tz ?? 'Africa/Dakar',
        personal: s.personal ?? false,
        createdBy,
      })
      .returning();
    await tx.insert(t.schoolMember).values([
      { schoolId: row!.id, accountId: createdBy, role: 'direction', addedBy: createdBy },
      { schoolId: row!.id, accountId: createdBy, role: 'enseignant', addedBy: createdBy },
    ]);
    return row!;
  });
}

/**
 * École par défaut d'un compte qui crée une classe : son unique école (enseignant ou direction) ; s'il en a
 * plusieurs, la première où il enseigne ; s'il n'en a aucune, une école « personnelle » est créée.
 */
export async function defaultSchoolFor(db: Db, accountId: string): Promise<string> {
  const mine = (await schoolsOf(db, accountId)).filter(
    (s) =>
      s.school.status === 'active' &&
      (s.roles.includes('enseignant') || s.roles.includes('direction')),
  );
  const pick = mine.find((s) => s.roles.includes('enseignant')) ?? mine[0];
  if (pick) return pick.school.id;
  const [a] = await db
    .select({ country: t.account.country })
    .from(t.account)
    .where(eq(t.account.id, accountId));
  return (
    await createSchool(
      db,
      { name: 'École personnelle', personal: true, country: a?.country ?? null },
      accountId,
    )
  ).id;
}

/** Libellé et dates de l'année scolaire qui contient ce jour (1er septembre → 31 juillet). */
export function schoolYearFor(now = new Date()): {
  label: string;
  startsOn: string;
  endsOn: string;
} {
  const y = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return { label: `${y}-${y + 1}`, startsOn: `${y}-09-01`, endsOn: `${y + 1}-07-31` };
}

/** Année scolaire en cours de l'école (créée si elle n'existe pas encore). */
export async function currentSchoolYear(db: Db, schoolId: string, now = new Date()) {
  const [open] = await db
    .select()
    .from(t.schoolYear)
    .where(and(eq(t.schoolYear.schoolId, schoolId), eq(t.schoolYear.status, 'en_cours')))
    .orderBy(desc(t.schoolYear.startsOn))
    .limit(1);
  if (open) return open;
  const y = schoolYearFor(now);
  await db
    .insert(t.schoolYear)
    .values({
      schoolId,
      label: y.label,
      startsOn: y.startsOn,
      endsOn: y.endsOn,
      status: 'en_cours',
    })
    .onConflictDoNothing();
  const [row] = await db
    .select()
    .from(t.schoolYear)
    .where(and(eq(t.schoolYear.schoolId, schoolId), eq(t.schoolYear.label, y.label)));
  return row!;
}

export async function schoolYears(db: Db, schoolId: string) {
  return db
    .select()
    .from(t.schoolYear)
    .where(eq(t.schoolYear.schoolId, schoolId))
    .orderBy(desc(t.schoolYear.startsOn));
}

// ---------------------------------------------------------------- personnel

export async function schoolMembers(db: Db, schoolId: string) {
  const rows = await db
    .select({
      accountId: t.schoolMember.accountId,
      role: t.schoolMember.role,
      since: t.schoolMember.since,
      email: t.account.email,
    })
    .from(t.schoolMember)
    .innerJoin(t.account, eq(t.account.id, t.schoolMember.accountId))
    .where(and(eq(t.schoolMember.schoolId, schoolId), isNull(t.account.deletedAt)))
    .orderBy(asc(t.account.email));
  // minimisation : l'adresse n'est montrée qu'en partie (comme dans « Mon compte »)
  return rows.map((r) => {
    const [local = '', domain = ''] = (r.email ?? '').split('@');
    return { ...r, email: r.email ? `${local.slice(0, 2)}…@${domain}` : null };
  });
}

export async function addSchoolMember(
  db: Db,
  schoolId: string,
  accountId: string,
  role: SchoolRole,
  by: string,
) {
  await db
    .insert(t.schoolMember)
    .values({ schoolId, accountId, role, addedBy: by })
    .onConflictDoNothing();
}

/** Retire un rôle d'école ; un enseignant retiré quitte aussi les classes de l'école (classes transférées). */
export async function removeSchoolMember(
  db: Db,
  schoolId: string,
  accountId: string,
  role: SchoolRole,
): Promise<boolean> {
  if (role === 'direction') {
    const directors = await db
      .select({ a: t.schoolMember.accountId })
      .from(t.schoolMember)
      .where(and(eq(t.schoolMember.schoolId, schoolId), eq(t.schoolMember.role, 'direction')));
    // une école garde toujours au moins une personne à la direction
    if (directors.length <= 1) return false;
  }
  await db
    .delete(t.schoolMember)
    .where(
      and(
        eq(t.schoolMember.schoolId, schoolId),
        eq(t.schoolMember.accountId, accountId),
        eq(t.schoolMember.role, role),
      ),
    );
  if (role === 'enseignant') {
    const classes = await db
      .select({ id: t.classGroup.id })
      .from(t.classTeacher)
      .innerJoin(t.classGroup, eq(t.classGroup.id, t.classTeacher.classId))
      .where(and(eq(t.classTeacher.accountId, accountId), eq(t.classGroup.schoolId, schoolId)));
    for (const c of classes) await removeClassTeacher(db, c.id, accountId);
  }
  return true;
}

// ---------------------------------------------------------------- enseignants d'une classe

export async function classTeachers(db: Db, classId: string) {
  const rows = await db
    .select({
      accountId: t.classTeacher.accountId,
      role: t.classTeacher.role,
      since: t.classTeacher.since,
      email: t.account.email,
    })
    .from(t.classTeacher)
    .innerJoin(t.account, eq(t.account.id, t.classTeacher.accountId))
    .where(eq(t.classTeacher.classId, classId))
    .orderBy(asc(t.classTeacher.role), asc(t.classTeacher.since));
  return rows.map((r) => {
    const [local = '', domain = ''] = (r.email ?? '').split('@');
    return { ...r, email: r.email ? `${local.slice(0, 2)}…@${domain}` : null };
  });
}

/**
 * Donne un rôle dans la classe. « titulaire » : l'ancien titulaire devient suppléant ; la copie
 * `class_group.teacher_account_id` suit. Le compte doit être enseignant de l'école de la classe.
 */
export async function setClassTeacher(
  db: Db,
  classId: string,
  accountId: string,
  role: 'titulaire' | 'suppleant',
): Promise<boolean> {
  const [c] = await db
    .select({ schoolId: t.classGroup.schoolId })
    .from(t.classGroup)
    .where(eq(t.classGroup.id, classId));
  if (!c) return false;
  const roles = await memberRoles(db, accountId, c.schoolId);
  if (!roles.includes('enseignant') && !roles.includes('direction')) return false;
  await db.transaction(async (tx) => {
    if (role === 'titulaire') {
      await tx
        .update(t.classTeacher)
        .set({ role: 'suppleant' })
        .where(
          and(
            eq(t.classTeacher.classId, classId),
            eq(t.classTeacher.role, 'titulaire'),
            ne(t.classTeacher.accountId, accountId),
          ),
        );
      await tx
        .update(t.classGroup)
        .set({ teacherAccountId: accountId })
        .where(eq(t.classGroup.id, classId));
    }
    await tx
      .insert(t.classTeacher)
      .values({ classId, accountId, role })
      .onConflictDoUpdate({
        target: [t.classTeacher.classId, t.classTeacher.accountId],
        set: { role },
      });
  });
  return true;
}

/**
 * Retire un enseignant d'une classe. S'il en était le titulaire : le plus ancien suppléant le devient ; sans
 * suppléant, la classe reste « sans titulaire » (visible de la direction, qui en désigne un).
 */
export async function removeClassTeacher(db: Db, classId: string, accountId: string) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(t.classTeacher)
      .where(and(eq(t.classTeacher.classId, classId), eq(t.classTeacher.accountId, accountId)))
      .returning({ role: t.classTeacher.role });
    const [cls] = await tx
      .select({ teacher: t.classGroup.teacherAccountId })
      .from(t.classGroup)
      .where(eq(t.classGroup.id, classId));
    if (row?.role !== 'titulaire' && cls?.teacher !== accountId) return;
    const [next] = await tx
      .select({ a: t.classTeacher.accountId })
      .from(t.classTeacher)
      .where(eq(t.classTeacher.classId, classId))
      .orderBy(asc(t.classTeacher.since))
      .limit(1);
    if (next)
      await tx
        .update(t.classTeacher)
        .set({ role: 'titulaire' })
        .where(and(eq(t.classTeacher.classId, classId), eq(t.classTeacher.accountId, next.a)));
    await tx
      .update(t.classGroup)
      .set({ teacherAccountId: next?.a ?? null })
      .where(eq(t.classGroup.id, classId));
  });
}

/**
 * Transfert d'une classe à un autre enseignant de la même école (procédure de la revue E1) : il devient
 * titulaire ; l'ancien titulaire reste suppléant (`keepPrevious`) ou quitte la classe.
 */
export async function transferClass(
  db: Db,
  classId: string,
  toAccountId: string,
  keepPrevious = false,
): Promise<boolean> {
  const [c] = await db
    .select({ teacher: t.classGroup.teacherAccountId })
    .from(t.classGroup)
    .where(eq(t.classGroup.id, classId));
  if (!c) return false;
  if (!(await setClassTeacher(db, classId, toAccountId, 'titulaire'))) return false;
  if (c.teacher && c.teacher !== toAccountId && !keepPrevious)
    await db
      .delete(t.classTeacher)
      .where(and(eq(t.classTeacher.classId, classId), eq(t.classTeacher.accountId, c.teacher)));
  return true;
}

/**
 * Suppression d'un compte (demande, puis effacement définitif) : il quitte toutes ses classes et ses écoles,
 * ses classes sont transférées (suppléant promu) ou restent sans titulaire, à la direction. Les classes, listes,
 * notes, épreuves et récitals restent à l'école. Renvoie le nombre de classes touchées et laissées sans titulaire.
 */
export async function releaseTeacher(
  db: Db,
  accountId: string,
): Promise<{ classes: number; sansTitulaire: number }> {
  const mine = await db
    .select({ classId: t.classTeacher.classId })
    .from(t.classTeacher)
    .where(eq(t.classTeacher.accountId, accountId));
  const owned = await db
    .select({ classId: t.classGroup.id })
    .from(t.classGroup)
    .where(eq(t.classGroup.teacherAccountId, accountId));
  const ids = [...new Set([...mine, ...owned].map((r) => r.classId))];
  for (const id of ids) await removeClassTeacher(db, id, accountId);
  let sansTitulaire = 0;
  if (ids.length)
    sansTitulaire = (
      await db
        .select({ id: t.classGroup.id })
        .from(t.classGroup)
        .where(and(inArray(t.classGroup.id, ids), isNull(t.classGroup.teacherAccountId)))
    ).length;
  // l'école garde au moins une direction : un directeur seul reste membre jusqu'à l'effacement définitif
  const memberships = await db
    .select({ schoolId: t.schoolMember.schoolId, role: t.schoolMember.role })
    .from(t.schoolMember)
    .where(eq(t.schoolMember.accountId, accountId));
  for (const m of memberships) {
    if (m.role === 'direction') {
      const [other] = await db
        .select({ a: t.schoolMember.accountId })
        .from(t.schoolMember)
        .where(
          and(
            eq(t.schoolMember.schoolId, m.schoolId),
            eq(t.schoolMember.role, 'direction'),
            ne(t.schoolMember.accountId, accountId),
          ),
        )
        .limit(1);
      if (!other) continue;
    }
    await db
      .delete(t.schoolMember)
      .where(
        and(
          eq(t.schoolMember.schoolId, m.schoolId),
          eq(t.schoolMember.accountId, accountId),
          eq(t.schoolMember.role, m.role),
        ),
      );
  }
  return { classes: ids.length, sansTitulaire };
}

/** Classes d'une école (pour la direction et le secrétariat), avec leur titulaire et leur effectif. */
export async function schoolClasses(db: Db, schoolId: string) {
  return db
    .select({
      id: t.classGroup.id,
      name: t.classGroup.name,
      kind: t.classGroup.kind,
      portion: t.classGroup.portion,
      levelCode: t.classGroup.levelCode,
      subjectCode: t.classGroup.subjectCode,
      status: t.classGroup.status,
      schoolYearId: t.classGroup.schoolYearId,
      teacherAccountId: t.classGroup.teacherAccountId,
      pupils: sql<number>`(SELECT count(*)::int FROM "class_pupil" p WHERE p."class_id" = ${t.classGroup.id} AND p."left_at" IS NULL)`,
    })
    .from(t.classGroup)
    .where(eq(t.classGroup.schoolId, schoolId))
    .orderBy(asc(t.classGroup.status), asc(t.classGroup.name));
}

// ---------------------------------------------------------------- compte technique de l'école

/**
 * Compte titulaire des profils inscrits par l'école (type « ecole », sans e-mail ni mot de passe : personne ne
 * s'y connecte ; il ne sert qu'aux profils et au mode tablette de classe). Créé à la première inscription.
 */
export async function ensureSchoolAccount(db: Db, schoolId: string): Promise<string> {
  const s = await schoolById(db, schoolId);
  if (!s) throw new Error('école inconnue');
  if (s.accountId) return s.accountId;
  return db.transaction(async (tx) => {
    const [a] = await tx
      .insert(t.account)
      .values({ kind: 'ecole', country: s.country ?? null })
      .returning({ id: t.account.id });
    const done = await tx
      .update(t.school)
      .set({ accountId: a!.id })
      .where(and(eq(t.school.id, schoolId), isNull(t.school.accountId)))
      .returning({ id: t.school.id });
    if (!done.length) throw new Error('compte de l’école créé en parallèle : réessayer');
    return a!.id;
  });
}

/** École dont ce compte est le compte technique (null sinon). */
export async function schoolOfAccount(db: Db, accountId: string): Promise<SchoolRow | null> {
  const [s] = await db.select().from(t.school).where(eq(t.school.accountId, accountId));
  return s ?? null;
}
