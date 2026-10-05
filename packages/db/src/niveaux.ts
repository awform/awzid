/**
 * Niveau PAR MATIÈRE, années scolaires, passage de fin d'année, parcours de l'élève (lot F2, revue E8).
 *  - `profile_level` : une ligne ouverte par matière = niveau courant ; l'historique garde chaque changement
 *    (positionnement, épreuve de passage, décision du maître, choix du parent, passage de fin d'année) ;
 *  - passage de fin d'année : décision par élève (admis, redouble, parti), niveau suivant pour les admis,
 *    nouvelle ligne dans la classe de l'année suivante, classes archivées (registre conservé) ;
 *  - « mon parcours » : niveau courant par matière, prochaine leçon, livrets du niveau, niveaux terminés
 *    (révision), niveau suivant (aperçu), piste Coran personnelle et cercles, mots du Coran du livre.
 */
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { lemmaLevelCode, levelParts, subjectOf } from '@awform/content';
import type { Db } from './client.js';
import { currentSchoolYear } from './ecole.js';
import { archivePupil, openEnrolment } from './school.js';
import * as t from './schema.js';

export type LevelSource =
  'positionnement' | 'epreuve' | 'enseignant' | 'parent' | 'passage' | 'reprise' | 'inscription';

/** Niveaux courants d'un profil, par matière. */
export async function currentLevels(db: Db, profileId: string) {
  return db
    .select({
      subject: t.profileLevel.subjectCode,
      levelCode: t.profileLevel.levelCode,
      since: t.profileLevel.since,
      source: t.profileLevel.source,
    })
    .from(t.profileLevel)
    .where(and(eq(t.profileLevel.profileId, profileId), isNull(t.profileLevel.until)))
    .orderBy(asc(t.profileLevel.subjectCode));
}

export async function levelHistory(db: Db, profileId: string) {
  return db
    .select({
      subject: t.profileLevel.subjectCode,
      levelCode: t.profileLevel.levelCode,
      since: t.profileLevel.since,
      until: t.profileLevel.until,
      source: t.profileLevel.source,
      outcome: t.profileLevel.outcome,
    })
    .from(t.profileLevel)
    .where(eq(t.profileLevel.profileId, profileId))
    .orderBy(asc(t.profileLevel.subjectCode), asc(t.profileLevel.since));
}

/**
 * Change le niveau courant d'une matière (la matière se déduit du niveau). L'ancienne ligne est fermée :
 * « termine » si l'élève MONTE dans la même filière, « change » sinon. Arabe : `profile.level_code` suit.
 * Renvoie false si le niveau est inconnu.
 */
export async function setProfileLevel(
  db: Db,
  profileId: string,
  levelCode: string,
  source: LevelSource,
  by: string | null = null,
  details: unknown = null,
): Promise<boolean> {
  const [lv] = await db
    .select({ code: t.level.code, subject: t.level.subjectCode })
    .from(t.level)
    .where(eq(t.level.code, levelCode));
  const subject = lv?.subject ?? subjectOf(levelCode);
  if (!lv || !subject) return false;
  await db.transaction(async (tx) => {
    const [cur] = await tx
      .select({ id: t.profileLevel.id, levelCode: t.profileLevel.levelCode })
      .from(t.profileLevel)
      .where(
        and(
          eq(t.profileLevel.profileId, profileId),
          eq(t.profileLevel.subjectCode, subject),
          isNull(t.profileLevel.until),
        ),
      );
    if (cur?.levelCode === levelCode) return;
    if (cur) {
      const a = levelParts(cur.levelCode);
      const b = levelParts(levelCode);
      await tx
        .update(t.profileLevel)
        .set({
          until: new Date(),
          outcome: a && b && a.prefix === b.prefix && b.n > a.n ? 'termine' : 'change',
        })
        .where(eq(t.profileLevel.id, cur.id));
    }
    await tx.insert(t.profileLevel).values({
      profileId,
      subjectCode: subject,
      levelCode,
      source,
      decidedBy: by,
      details: details as object,
    });
    if (subject === 'arabe')
      await tx.update(t.profile).set({ levelCode }).where(eq(t.profile.id, profileId));
  });
  return true;
}

// ---------------------------------------------------------------- années scolaires et passage

export interface YearDecision {
  pupilId: string;
  outcome: 'admis' | 'redouble' | 'parti';
  /** classe de l'année suivante (même école) */
  nextClassId?: string | null;
}

export interface ClosureResult {
  classes: number;
  admis: number;
  redouble: number;
  parti: number;
  niveauxMontes: number;
  reinscrits: number;
  nouvelleAnnee: { id: string; label: string };
}

/** Élèves actifs des classes de l'année (pour préparer les décisions). */
export async function yearPupils(db: Db, yearId: string) {
  return db
    .select({
      pupilId: t.classPupil.id,
      displayName: t.classPupil.displayName,
      profileId: t.classPupil.profileId,
      classId: t.classGroup.id,
      className: t.classGroup.name,
      levelCode: t.classGroup.levelCode,
    })
    .from(t.classPupil)
    .innerJoin(t.classGroup, eq(t.classGroup.id, t.classPupil.classId))
    .where(
      and(
        eq(t.classGroup.schoolYearId, yearId),
        eq(t.classGroup.status, 'active'),
        isNull(t.classPupil.leftAt),
      ),
    )
    .orderBy(asc(t.classGroup.name), asc(t.classPupil.displayName));
}

/**
 * Clôture de l'année (passage de fin d'année) : UNE décision par élève actif est exigée. Admis : niveau
 * suivant de la filière de sa classe (origine « passage ») ; inscription dans la classe de l'année suivante si
 * elle est donnée (le partage avec le nouvel enseignant n'est repris d'office que pour un élève inscrit par
 * l'école ; un parent le confirme par le code de classe). Les classes de l'année sont archivées, rien n'est
 * effacé. L'année suivante (en préparation, ou créée) devient l'année en cours.
 */
export async function closeSchoolYear(
  db: Db,
  p: {
    yearId: string;
    by: string;
    decisions: YearDecision[];
    next?: { label: string; startsOn: string; endsOn: string } | null;
  },
): Promise<ClosureResult | { error: string; missing?: string[] }> {
  const [year] = await db.select().from(t.schoolYear).where(eq(t.schoolYear.id, p.yearId));
  if (!year || year.status !== 'en_cours') return { error: 'annee_non_ouverte' };
  const pupils = await yearPupils(db, p.yearId);
  const byId = new Map(p.decisions.map((d) => [d.pupilId, d]));
  const missing = pupils.filter((x) => !byId.has(x.pupilId)).map((x) => x.pupilId);
  if (missing.length) return { error: 'decisions_incompletes', missing };
  const nextIds = [...new Set(p.decisions.map((d) => d.nextClassId).filter(Boolean))] as string[];
  const nextClasses = nextIds.length
    ? await db
        .select({
          id: t.classGroup.id,
          schoolId: t.classGroup.schoolId,
          yearId: t.classGroup.schoolYearId,
        })
        .from(t.classGroup)
        .where(inArray(t.classGroup.id, nextIds))
    : [];
  if (nextClasses.some((c) => c.schoolId !== year.schoolId || c.yearId === year.id))
    return { error: 'classe_suivante_invalide' };
  if (nextClasses.length !== nextIds.length) return { error: 'classe_suivante_invalide' };
  // année suivante : celle en préparation, ou celle donnée, ou la suivante par défaut
  const y0 = Number(year.label.slice(0, 4)) || new Date(year.startsOn).getUTCFullYear();
  const nextDef = p.next ?? {
    label: `${y0 + 1}-${y0 + 2}`,
    startsOn: `${y0 + 1}-09-01`,
    endsOn: `${y0 + 2}-07-31`,
  };
  const known = (await db.select({ code: t.level.code }).from(t.level)).map((l) => l.code);
  const res: ClosureResult = {
    classes: 0,
    admis: 0,
    redouble: 0,
    parti: 0,
    niveauxMontes: 0,
    reinscrits: 0,
    nouvelleAnnee: { id: '', label: '' },
  };
  await db.transaction(async (tx) => {
    const d = tx as unknown as Db;
    for (const pu of pupils) {
      const dec = byId.get(pu.pupilId)!;
      res[dec.outcome]++;
      if (dec.outcome === 'admis' && pu.profileId && pu.levelCode) {
        const p0 = levelParts(pu.levelCode);
        const next = p0 ? `${p0.prefix}${p0.n + 1}` : null;
        if (next && known.includes(next)) {
          await setProfileLevel(d, pu.profileId, next, 'passage', p.by, {
            annee: year.label,
            classe: pu.classId,
          });
          res.niveauxMontes++;
        }
      }
      await archivePupil(d, pu.pupilId, dec.outcome, p.by);
      await tx
        .update(t.enrolment)
        .set({ nextClassId: dec.nextClassId ?? null })
        .where(and(eq(t.enrolment.pupilId, pu.pupilId), eq(t.enrolment.decidedBy, p.by)));
      if (dec.outcome !== 'parti' && dec.nextClassId) {
        const [src] = await tx.select().from(t.classPupil).where(eq(t.classPupil.id, pu.pupilId));
        const [row] = await tx
          .insert(t.classPupil)
          .values({
            classId: dec.nextClassId,
            profileId: src!.profileId,
            displayName: src!.displayName,
            nameAr: src!.nameAr,
            gender: src!.gender,
          })
          .onConflictDoUpdate({
            target: [t.classPupil.classId, t.classPupil.profileId],
            set: { leftAt: null },
          })
          .returning({ id: t.classPupil.id });
        await openEnrolment(d, dec.nextClassId, row!.id);
        if (src!.profileId) {
          // partage repris d'office seulement pour un élève dont l'école est responsable
          const [sc] = await tx
            .select({ id: t.profileCustodian.id })
            .from(t.profileCustodian)
            .where(
              and(
                eq(t.profileCustodian.profileId, src!.profileId),
                eq(t.profileCustodian.schoolId, year.schoolId),
                eq(t.profileCustodian.nature, 'ecole'),
                eq(t.profileCustodian.status, 'actif'),
              ),
            );
          if (sc)
            await tx
              .insert(t.classMember)
              .values({ classId: dec.nextClassId, profileId: src!.profileId, addedBy: p.by })
              .onConflictDoNothing();
          // l'élève quitte la classe de l'année close (partage avec l'ancien enseignant arrêté)
          await tx
            .delete(t.classMember)
            .where(
              and(
                eq(t.classMember.classId, pu.classId),
                eq(t.classMember.profileId, src!.profileId),
              ),
            );
        }
        res.reinscrits++;
      } else if (pu.profileId) {
        await tx
          .delete(t.classMember)
          .where(
            and(eq(t.classMember.classId, pu.classId), eq(t.classMember.profileId, pu.profileId)),
          );
      }
    }
    const archived = await tx
      .update(t.classGroup)
      .set({ status: 'archivee', archivedAt: new Date() })
      .where(and(eq(t.classGroup.schoolYearId, year.id), eq(t.classGroup.status, 'active')))
      .returning({ id: t.classGroup.id });
    res.classes = archived.length;
    await tx
      .update(t.schoolYear)
      .set({ status: 'cloturee', closedAt: new Date(), closedBy: p.by })
      .where(eq(t.schoolYear.id, year.id));
    const [prep] = await tx
      .select()
      .from(t.schoolYear)
      .where(
        and(
          eq(t.schoolYear.schoolId, year.schoolId),
          or(eq(t.schoolYear.status, 'preparation'), eq(t.schoolYear.label, nextDef.label)),
          ne(t.schoolYear.id, year.id),
        ),
      )
      .orderBy(asc(t.schoolYear.startsOn))
      .limit(1);
    if (prep) {
      await tx.update(t.schoolYear).set({ status: 'en_cours' }).where(eq(t.schoolYear.id, prep.id));
      res.nouvelleAnnee = { id: prep.id, label: prep.label };
    } else {
      const [ny] = await tx
        .insert(t.schoolYear)
        .values({ schoolId: year.schoolId, ...nextDef, status: 'en_cours' })
        .returning();
      res.nouvelleAnnee = { id: ny!.id, label: ny!.label };
    }
  });
  return res;
}

/** Prépare l'année suivante (classes créées à l'avance, statut « preparation »). */
export async function prepareSchoolYear(
  db: Db,
  schoolId: string,
  y: { label: string; startsOn: string; endsOn: string },
) {
  await currentSchoolYear(db, schoolId);
  const [row] = await db
    .insert(t.schoolYear)
    .values({ schoolId, ...y, status: 'preparation' })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

// ---------------------------------------------------------------- parcours de l'élève (A27)

export type LevelAccess = 'courant' | 'revision' | 'apercu' | 'ferme' | 'libre';

/** Accès d'un profil à un niveau (règle du parcours par niveau, appliquée par l'interface A27). */
export function accessFor(current: string | null, levelCode: string): LevelAccess {
  if (!current) return 'libre';
  const a = levelParts(current);
  const b = levelParts(levelCode);
  if (!a || !b || a.subject !== b.subject) return 'libre';
  if (a.prefix !== b.prefix) return 'ferme';
  if (b.n === a.n) return 'courant';
  if (b.n < a.n) return 'revision';
  return b.n === a.n + 1 ? 'apercu' : 'ferme';
}

async function editionLevels(db: Db, editionId: string) {
  return db
    .select({
      code: t.level.code,
      track: t.level.track,
      rank: t.level.rank,
      subject: t.level.subjectCode,
      titleFr: sql<string | null>`${t.levelVersion.book}->>'titre_fr'`,
    })
    .from(t.levelVersion)
    .innerJoin(t.level, eq(t.level.code, t.levelVersion.levelCode))
    .where(eq(t.levelVersion.editionId, editionId))
    .orderBy(asc(t.level.track), asc(t.level.rank));
}

/** Première leçon (ou bilan) du niveau que l'élève n'a pas terminée. */
async function nextUnit(db: Db, editionId: string, profileId: string, levelCode: string) {
  const [u] = await db
    .select({ id: t.unit.id, n: t.unit.n, kind: t.unit.kind })
    .from(t.unit)
    .innerJoin(
      t.unitVersion,
      and(eq(t.unitVersion.unitId, t.unit.id), eq(t.unitVersion.editionId, editionId)),
    )
    .leftJoin(
      t.progress,
      and(eq(t.progress.unitId, t.unit.id), eq(t.progress.profileId, profileId)),
    )
    .where(
      and(
        eq(t.unit.levelCode, levelCode),
        or(isNull(t.progress.status), inArray(t.progress.status, ['ouverte', 'commencee'])),
      ),
    )
    .orderBy(asc(t.unit.n))
    .limit(1);
  return u ?? null;
}

async function levelBooklets(db: Db, editionId: string, codes: string[]) {
  if (!codes.length) return [];
  return db
    .select({ code: t.booklet.code, levelCode: t.booklet.levelCode, rank: t.booklet.rank })
    .from(t.booklet)
    .where(and(eq(t.booklet.editionId, editionId), inArray(t.booklet.levelCode, codes)))
    .orderBy(asc(t.booklet.levelCode), asc(t.booklet.rank));
}

/** Mots du Coran rattachés à ces niveaux de livre (données des livres). */
async function lemmaCount(db: Db, codes: string[]) {
  if (!codes.length) return 0;
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.quranLemma)
    .where(
      or(
        inArray(t.quranLemma.levelEnfants, codes),
        inArray(t.quranLemma.levelAdultes, codes),
        inArray(t.quranLemma.levelAdos, codes),
      ),
    );
  return r?.n ?? 0;
}

/** Proposition de premier niveau par matière d'après le type du profil (aucun niveau encore choisi). */
function firstLevelFor(subject: string, kind: string): string | null {
  if (subject === 'arabe') return kind === 'adulte' ? 'ad1' : kind === 'ado' ? 'ado1' : 'en1';
  if (subject === 'sciences') return kind === 'adulte' ? 'ra1' : 're1';
  if (subject === 'coran') return 'qc1';
  return null;
}

/**
 * « Mon parcours » (prêt pour A27) : par matière, niveau courant, prochaine leçon, livrets du niveau, niveaux
 * terminés (révision), aperçu du niveau suivant, façons de monter ; Coran : plan de hifẓ et cercles ; mots du
 * Coran du livre de l'élève.
 */
export async function learnerPath(db: Db, editionId: string, profileId: string) {
  const [prof] = await db
    .select({ id: t.profile.id, kind: t.profile.kind, levelCode: t.profile.levelCode })
    .from(t.profile)
    .where(eq(t.profile.id, profileId));
  if (!prof) return null;
  const levels = await editionLevels(db, editionId);
  const cur = await currentLevels(db, profileId);
  const subjects = await db.select().from(t.subject).orderBy(asc(t.subject.rank));
  const out = [];
  for (const s of subjects) {
    const c = cur.find((x) => x.subject === s.code);
    const currentCode =
      c?.levelCode ?? (s.code === 'arabe' && prof.levelCode ? prof.levelCode : null);
    const cp = currentCode ? levelParts(currentCode) : null;
    const track = cp ? levels.filter((l) => levelParts(l.code)?.prefix === cp.prefix) : [];
    const termines = track.filter((l) => cp && (levelParts(l.code)?.n ?? 0) < cp.n);
    const suivant = track.find((l) => cp && levelParts(l.code)?.n === cp.n + 1) ?? null;
    const courant = track.find((l) => l.code === currentCode) ?? null;
    out.push({
      matiere: s.code,
      titre: s.titleFr,
      aDesNiveaux: s.hasLevels,
      courant: courant
        ? {
            code: courant.code,
            titre: courant.titleFr,
            depuis: c?.since ?? null,
            origine: c?.source ?? 'reprise',
            prochaineLecon: await nextUnit(db, editionId, profileId, courant.code),
            livrets: (await levelBooklets(db, editionId, [courant.code])).map((b) => b.code),
          }
        : null,
      proposition:
        !courant && s.hasLevels
          ? (levels.find((l) => l.code === firstLevelFor(s.code, prof.kind))?.code ?? null)
          : null,
      termines: termines.map((l) => ({ code: l.code, titre: l.titleFr, acces: 'revision' })),
      suivant: suivant ? { code: suivant.code, titre: suivant.titleFr, acces: 'apercu' } : null,
      monter: courant ? ['positionnement', 'epreuve'] : ['positionnement'],
    });
  }
  // Coran : piste personnelle (hifẓ) et cercles (ḥalaqa) de l'élève
  const [plan] = await db
    .select({
      mode: t.hifzPlan.mode,
      bookCode: t.hifzPlan.bookCode,
      rhythmYears: t.hifzPlan.rhythmYears,
      startDate: t.hifzPlan.startDate,
    })
    .from(t.hifzPlan)
    .where(eq(t.hifzPlan.profileId, profileId));
  const cercles = await db
    .select({ id: t.classGroup.id, name: t.classGroup.name, portion: t.classGroup.portion })
    .from(t.classMember)
    .innerJoin(t.classGroup, eq(t.classGroup.id, t.classMember.classId))
    .where(
      and(
        eq(t.classMember.profileId, profileId),
        eq(t.classGroup.kind, 'cercle'),
        eq(t.classGroup.status, 'active'),
      ),
    );
  // mots du Coran : ceux du livre de l'élève (niveau d'arabe courant) et des niveaux terminés
  const arabe = out.find((o) => o.matiere === 'arabe');
  const doneCodes = arabe?.termines.map((x) => x.code) ?? [];
  const acquisNiveau = await lemmaCount(db, doneCodes);
  const [perso] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.profileLemma)
    .where(eq(t.profileLemma.profileId, profileId));
  return {
    profileId,
    kind: prof.kind,
    matieres: out,
    coran: { plan: plan ?? null, cercles },
    motsDuCoran: {
      niveau: arabe?.courant?.code ?? null,
      motsDuNiveau: arabe?.courant ? await lemmaCount(db, [arabe.courant.code]) : 0,
      acquisNiveauxTermines: acquisNiveau,
      acquisPersonnels: perso?.n ?? 0,
      lienLecon: false,
    },
  };
}

// ---------------------------------------------------------------- mots du Coran (données des livres)

export interface LemmaSource {
  meta?: Record<string, unknown>;
  lemmes: Array<{
    n: number;
    arabe: string;
    lemme_corpus_buckwalter: string;
    frequence?: number;
    niveau_enfants?: string;
    niveau_adultes?: string;
    niveau_ados?: string;
  }>;
}

/**
 * Import du rattachement lemme ↔ niveau de livre (`mots_coran_1000.json` des livres), idempotent. Seuls le
 * rang, la clé du lemme, sa forme arabe et ses niveaux sont gardés. Un niveau absent de la base est ignoré
 * (et compté). Renvoie le nombre de lemmes et de rattachements.
 */
export async function importQuranLemmas(db: Db, src: LemmaSource, sha256: string) {
  const known = new Set((await db.select({ code: t.level.code }).from(t.level)).map((l) => l.code));
  const lv = (v?: string) => {
    const c = lemmaLevelCode(v);
    return c && known.has(c) ? c : null;
  };
  let enfants = 0;
  let adultes = 0;
  let ignores = 0;
  await db.transaction(async (tx) => {
    for (const l of src.lemmes) {
      const e = lv(l.niveau_enfants);
      const a = lv(l.niveau_adultes);
      if (l.niveau_enfants && !e) ignores++;
      if (l.niveau_adultes && !a) ignores++;
      if (e) enfants++;
      if (a) adultes++;
      const row = {
        lemmaKey: l.lemme_corpus_buckwalter,
        arabic: l.arabe,
        levelEnfants: e,
        levelAdultes: a,
        levelAdos: null,
        frequency: l.frequence ?? null,
        sourceSha256: sha256,
      };
      await tx
        .insert(t.quranLemma)
        .values({ rank: l.n, ...row })
        .onConflictDoUpdate({ target: t.quranLemma.rank, set: row });
    }
  });
  return { lemmes: src.lemmes.length, enfants, adultes, ignores };
}

/** Mots du Coran d'un niveau de livre (pour l'onglet « Mots du Coran » d'A27). */
export async function levelLemmas(db: Db, levelCode: string) {
  return db
    .select({
      rank: t.quranLemma.rank,
      lemmaKey: t.quranLemma.lemmaKey,
      arabic: t.quranLemma.arabic,
    })
    .from(t.quranLemma)
    .where(
      or(
        eq(t.quranLemma.levelEnfants, levelCode),
        eq(t.quranLemma.levelAdultes, levelCode),
        eq(t.quranLemma.levelAdos, levelCode),
      ),
    )
    .orderBy(asc(t.quranLemma.rank));
}

/** Dernière décision de niveau prise par l'école pour un élève (affichée au parent). */
export async function lastLevelDecision(db: Db, profileId: string) {
  const [r] = await db
    .select()
    .from(t.profileLevel)
    .where(eq(t.profileLevel.profileId, profileId))
    .orderBy(desc(t.profileLevel.since))
    .limit(1);
  return r ?? null;
}
