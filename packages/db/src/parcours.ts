/**
 * Chantier A27 — parcours PAR NIVEAU de l'élève (interface posée sur les fondations F2) :
 *  - espace du niveau : leçons du SEUL niveau courant (état, écriture faite), progression, leçon en cours,
 *    prochaine leçon, dernière faite, examen de fin de niveau, livrets et mots du Coran du niveau, anciens livres
 *    (révision) et niveau suivant en APERÇU (titres seulement) ;
 *  - écriture : leçons du niveau qui ont une activité d'écriture ; « J'écris le Coran » ouvert seulement à partir
 *    de la leçon où le livre fait recopier le PREMIER verset (repéré dans les données : `ecriture.copie` égale à
 *    un verset Tanzil, au squelette près) ;
 *  - mots du Coran du niveau du livre (sens, racine, verset d'exemple des livres) et couverture calculée ;
 *  - essais du test de positionnement et des épreuves de passage (notés par l'API).
 * Rien n'est inventé : tout vient des livres importés et des réponses de l'élève.
 */
import { and, asc, desc, eq, gte, inArray, isNull, like, or, sql } from 'drizzle-orm';
import { levelParts } from '@awform/content';
import { looksQuranic, skeleton } from '@awform/content/audio-cle';
import type { Db } from './client.js';
import { currentLevels } from './niveaux.js';
import * as t from './schema.js';

export type Subject = 'arabe' | 'sciences' | 'coran';
type Kind = 'enfant' | 'ado' | 'adulte';

/** Filière (préfixe des codes de niveau) d'une matière pour un type de profil. */
export function trackPrefix(subject: string, kind: string): string | null {
  if (subject === 'arabe') return kind === 'adulte' ? 'ad' : kind === 'ado' ? 'ado' : 'en';
  if (subject === 'sciences') return kind === 'enfant' ? 're' : 'ra';
  if (subject === 'coran') return 'qc';
  return null;
}

const DONE = new Set(['terminee', 'maitrisee']);

/** Niveaux d'une filière publiés dans l'édition, dans l'ordre. */
export async function trackLevels(db: Db, editionId: string, prefix: string) {
  const rows = await db
    .select({
      code: t.level.code,
      titleFr: sql<string | null>`${t.levelVersion.book}->>'titre_fr'`,
      titleAr: sql<string | null>`${t.levelVersion.book}->>'titre_ar'`,
    })
    .from(t.levelVersion)
    .innerJoin(t.level, eq(t.level.code, t.levelVersion.levelCode))
    .where(eq(t.levelVersion.editionId, editionId));
  return rows
    .map((r) => ({ ...r, n: levelParts(r.code)?.n ?? 0, prefix: levelParts(r.code)?.prefix }))
    .filter((r) => r.prefix === prefix)
    .sort((a, b) => a.n - b.n);
}

/** Niveau courant d'une matière (arabe : copie de compatibilité `profile.level_code` à défaut). */
export async function currentLevelOf(db: Db, profileId: string, subject: string) {
  const cur = (await currentLevels(db, profileId)).find((c) => c.subject === subject);
  if (cur) return cur;
  if (subject !== 'arabe') return null;
  const [p] = await db
    .select({ levelCode: t.profile.levelCode })
    .from(t.profile)
    .where(eq(t.profile.id, profileId));
  return p?.levelCode
    ? { subject, levelCode: p.levelCode, since: null as Date | null, source: 'reprise' }
    : null;
}

async function unitsOf(db: Db, editionId: string, levelCode: string) {
  return db
    .select({
      id: t.unit.id,
      n: t.unit.n,
      kind: t.unit.kind,
      numLecon: t.unitVersion.numLecon,
      numBilan: t.unitVersion.numBilan,
      titleFr: t.unitVersion.titleFr,
      titleAr: t.unitVersion.titleAr,
      // activité d'écriture du livre : bloc « ecriture » ou exercice du cahier (livre « ecriture »)
      aEcriture: sql<boolean>`(${t.unitVersion.content} ? 'ecriture' OR jsonb_path_exists(${t.unitVersion.content}, '$.exercices[*] ? (@.livre == "ecriture")'))`,
    })
    .from(t.unitVersion)
    .innerJoin(t.unit, eq(t.unit.id, t.unitVersion.unitId))
    .where(and(eq(t.unitVersion.editionId, editionId), eq(t.unit.levelCode, levelCode)))
    .orderBy(asc(t.unit.n));
}

/** Écritures déclarées faites (« J'ai fait l'écriture de cette leçon », journal d'entraînement). */
async function writingDone(db: Db, profileId: string): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ item: t.practiceEvent.item })
    .from(t.practiceEvent)
    .where(
      and(
        eq(t.practiceEvent.profileId, profileId),
        eq(t.practiceEvent.kind, 'trace'),
        eq(t.practiceEvent.ok, true),
        like(t.practiceEvent.item, 'cahier:%'),
      ),
    );
  return new Set(rows.map((r) => r.item.slice('cahier:'.length)));
}

// ---------------------------------------------------------------- premier verset recopié (données des livres)

const verseIndexCache = new Map<string, Map<string, string>>();

/** Index squelette → « s:a » des versets Tanzil (une fois par processus). */
async function verseIndex(db: Db): Promise<Map<string, string>> {
  const hit = verseIndexCache.get('tanzil');
  if (hit) return hit;
  const rows = await db
    .select({ s: t.quranVerse.sura, a: t.quranVerse.aya, text: t.quranVerse.text })
    .from(t.quranVerse);
  const m = new Map<string, string>();
  for (const r of rows) {
    const k = skeleton(r.text);
    if (k && !m.has(k)) m.set(k, `${r.s}:${r.a}`);
  }
  if (m.size) verseIndexCache.set('tanzil', m);
  return m;
}

/** Ligne de copie du livre = un verset ENTIER (squelette identique, crochets de couleur retirés) ? */
export function matchVerse(index: ReadonlyMap<string, string>, line: string): string | null {
  const k = skeleton(line.replace(/[[\]]/g, ''));
  return k.split(' ').length >= 2 ? (index.get(k) ?? null) : null;
}

export interface CopiedVerse {
  unitId: string;
  levelCode: string;
  n: number;
  ref: string;
  /** ligne écrite dans l'orthographe du Muṣḥaf (rasm ʿuthmānī : ٱ, petits signes…) */
  rasm: boolean;
}

/**
 * Premier verset recopié qui OUVRE « J'écris le Coran » : le premier que le livre fait recopier dans
 * l'orthographe du Muṣḥaf (avant, une ligne de verset en écriture courante — ad1 l10 : 112:3 — n'introduit pas
 * encore le rasm ʿuthmānī, enseigné en ad1 l19 ; aucune notion en avance).
 */
export const firstMushafCopy = (list: readonly CopiedVerse[]) => list.find((v) => v.rasm) ?? null;

const copiedCache = new Map<string, CopiedVerse[]>();

/**
 * Versets que les livres d'une filière font RECOPIER (`ecriture.copie`), dans l'ordre du livre : le premier
 * marque l'ouverture de « J'écris le Coran » (en1 l25, ad1 l19 sur les livres actuels).
 */
export async function copiedVerses(
  db: Db,
  editionId: string,
  prefix: string,
): Promise<CopiedVerse[]> {
  const key = `${editionId}|${prefix}`;
  const hit = copiedCache.get(key);
  if (hit) return hit;
  const index = await verseIndex(db);
  const rows = await db
    .select({
      unitId: t.unit.id,
      levelCode: t.unit.levelCode,
      n: t.unit.n,
      copie: sql<unknown>`${t.unitVersion.content}->'ecriture'->'copie'`,
    })
    .from(t.unitVersion)
    .innerJoin(t.unit, eq(t.unit.id, t.unitVersion.unitId))
    .where(
      and(
        eq(t.unitVersion.editionId, editionId),
        like(t.unit.levelCode, `${prefix}%`),
        sql`jsonb_typeof(${t.unitVersion.content}->'ecriture'->'copie') = 'array'`,
      ),
    );
  const out: CopiedVerse[] = [];
  for (const r of rows) {
    if (levelParts(r.levelCode)?.prefix !== prefix || !Array.isArray(r.copie)) continue;
    for (const line of r.copie) {
      const ref = typeof line === 'string' ? matchVerse(index, line) : null;
      if (ref)
        out.push({
          unitId: r.unitId,
          levelCode: r.levelCode,
          n: r.n,
          ref,
          rasm: looksQuranic(line as string),
        });
    }
  }
  out.sort(
    (a, b) =>
      (levelParts(a.levelCode)?.n ?? 0) - (levelParts(b.levelCode)?.n ?? 0) || a.n - b.n || 0,
  );
  copiedCache.set(key, out);
  return out;
}

/** Position d'une leçon dans la filière (niveau, rang) pour comparer « avant / après ». */
const pos = (levelCode: string, n: number) => (levelParts(levelCode)?.n ?? 0) * 1000 + n;

// ---------------------------------------------------------------- espace du niveau

export interface SpaceUnit {
  id: string;
  n: number;
  kind: string;
  numLecon: number | null;
  numBilan: number | null;
  titleFr: string;
  titleAr: string;
  statut: string | null;
  majLe: Date | null;
  aEcriture: boolean;
  ecritureFaite: boolean;
}

/**
 * Espace d'une matière pour un profil : niveau courant SEUL (leçons et état), anciens livres en révision, niveau
 * suivant en aperçu (titres), proposition de premier niveau quand aucun n'est choisi.
 */
export async function levelSpace(db: Db, editionId: string, profileId: string, subject: Subject) {
  const [prof] = await db
    .select({ id: t.profile.id, kind: t.profile.kind })
    .from(t.profile)
    .where(eq(t.profile.id, profileId));
  if (!prof) return null;
  const kind = prof.kind as Kind;
  const cur = await currentLevelOf(db, profileId, subject);
  const curParts = cur ? levelParts(cur.levelCode) : null;
  // filière : celle du niveau courant (choix du maître ou de la famille), sinon celle du type de profil
  const prefix = curParts?.prefix ?? trackPrefix(subject, kind);
  if (!prefix) return null;
  const levels = await trackLevels(db, editionId, prefix);
  const courant = cur ? levels.find((l) => l.code === cur.levelCode) : undefined;
  const base = { matiere: subject, piste: prefix, kind };
  if (!cur || !courant)
    return {
      ...base,
      courant: null,
      proposition: levels[0]?.code ?? null,
      niveaux: levels.map((l) => l.code),
      unites: [] as SpaceUnit[],
      progression: { faites: 0, total: 0 },
      enCours: null,
      prochaine: null,
      derniere: null,
      examen: null,
      livrets: 0,
      mots: 0,
      anciens: [],
      suivant: null,
      coranEcriture: { depuis: null, visible: false },
    };
  const units = await unitsOf(db, editionId, courant.code);
  const prog = units.length
    ? await db
        .select({
          unitId: t.progress.unitId,
          status: t.progress.status,
          updatedAt: t.progress.updatedAt,
        })
        .from(t.progress)
        .where(
          and(
            eq(t.progress.profileId, profileId),
            inArray(
              t.progress.unitId,
              units.map((u) => u.id),
            ),
          ),
        )
    : [];
  const st = new Map(prog.map((p) => [p.unitId, p]));
  const done = await writingDone(db, profileId);
  const unites: SpaceUnit[] = units.map((u) => ({
    ...u,
    aEcriture: !!u.aEcriture,
    statut: st.get(u.id)?.status ?? null,
    majLe: st.get(u.id)?.updatedAt ?? null,
    ecritureFaite: done.has(u.id),
  }));
  const isDone = (u: SpaceUnit) => !!u.statut && DONE.has(u.statut);
  const enCours = unites.find((u) => u.statut === 'commencee') ?? null;
  const prochaine = unites.find((u) => !isDone(u) && u.kind !== 'examen') ?? null;
  const derniere =
    unites
      .filter((u) => isDone(u) && u.kind === 'lecon')
      .sort((a, b) => (b.majLe?.getTime() ?? 0) - (a.majLe?.getTime() ?? 0))[0] ?? null;
  const examen = unites.find((u) => u.kind === 'examen') ?? null;
  const [lv] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.booklet)
    .where(and(eq(t.booklet.editionId, editionId), eq(t.booklet.levelCode, courant.code)));
  const mots = await lemmasOfLevels(db, [courant.code]);
  const next = levels.find((l) => l.n === courant.n + 1) ?? null;
  const verses = subject === 'arabe' ? await copiedVerses(db, editionId, prefix) : [];
  const first = firstMushafCopy(verses);
  // « à partir de la leçon du premier verset » : niveau déjà dépassé, ou leçon atteinte (faite ou en cours, ou
  // toutes les précédentes faites)
  const reached = (unitId: string, levelCode: string, n: number) => {
    if (pos(levelCode, n) < pos(courant.code, 0)) return true;
    if (levelCode !== courant.code) return false;
    const u = unites.find((x) => x.id === unitId);
    return !!u?.statut || (prochaine ? prochaine.n >= n : true);
  };
  return {
    ...base,
    courant: {
      code: courant.code,
      titre: courant.titleFr,
      titreAr: courant.titleAr,
      depuis: cur.since,
      origine: cur.source,
    },
    proposition: null,
    niveaux: levels.map((l) => l.code),
    unites,
    progression: {
      faites: unites.filter((u) => isDone(u) && u.kind !== 'examen').length,
      total: unites.filter((u) => u.kind !== 'examen').length,
    },
    enCours: enCours?.id ?? null,
    prochaine: prochaine?.id ?? null,
    derniere: derniere
      ? {
          id: derniere.id,
          le: derniere.majLe,
          aEcriture: derniere.aEcriture,
          ecritureFaite: derniere.ecritureFaite,
        }
      : null,
    examen: examen ? { id: examen.id, statut: examen.statut } : null,
    livrets: lv?.n ?? 0,
    mots: mots.length,
    anciens: levels
      .filter((l) => l.n < courant.n)
      .map((l) => ({ code: l.code, titre: l.titleFr, titreAr: l.titleAr })),
    suivant: next
      ? {
          code: next.code,
          titre: next.titleFr,
          titreAr: next.titleAr,
          // APERÇU : titres seulement (aucun contenu de leçon)
          lecons: (await unitsOf(db, editionId, next.code)).map((u) => ({
            n: u.n,
            kind: u.kind,
            numLecon: u.numLecon,
            numBilan: u.numBilan,
            titleFr: u.titleFr,
            titleAr: u.titleAr,
          })),
        }
      : null,
    coranEcriture: {
      depuis: first?.unitId ?? null,
      visible: !!first && reached(first.unitId, first.levelCode, first.n),
    },
  };
}

// ---------------------------------------------------------------- écriture

/**
 * Écriture de l'élève : leçons de SON niveau atteintes qui ont une activité d'écriture (« Mon cahier ») ;
 * « J'écris le Coran » : versets que le livre a fait recopier jusqu'à la leçon atteinte (texte Tanzil),
 * étape 1 faite par verset, qc1 terminé (déclencheur de l'étape 3 avec la moitié du Juzʾ ʿAmma).
 */
export async function writingSpace(db: Db, editionId: string, profileId: string) {
  const space = await levelSpace(db, editionId, profileId, 'arabe');
  if (!space) return null;
  const prochaineN = space.unites.find((u) => u.id === space.prochaine)?.n ?? Infinity;
  const lecons = space.unites
    .filter((u) => u.aEcriture && u.kind !== 'examen' && (!!u.statut || u.n <= prochaineN))
    .map((u) => ({
      id: u.id,
      n: u.n,
      kind: u.kind,
      numLecon: u.numLecon,
      titleFr: u.titleFr,
      titleAr: u.titleAr,
      statut: u.statut,
      faite: u.ecritureFaite,
    }));
  const all = space.courant ? await copiedVerses(db, editionId, space.piste) : [];
  const curCode = space.courant?.code ?? '';
  const versesReached = all.filter(
    (v) =>
      pos(v.levelCode, v.n) < pos(curCode, 0) ||
      (v.levelCode === curCode &&
        (space.unites.find((u) => u.id === v.unitId)?.statut || v.n <= prochaineN)),
  );
  // rien avant l'ouverture (leçon du premier verset en orthographe du Muṣḥaf)
  const refs = space.coranEcriture.visible
    ? [...new Map(versesReached.map((v) => [v.ref, v])).values()]
    : [];
  const texts = refs.length
    ? await db
        .select({ s: t.quranVerse.sura, a: t.quranVerse.aya, text: t.quranVerse.text })
        .from(t.quranVerse)
        .where(
          or(
            ...refs.map((v) => {
              const [s, a] = v.ref.split(':').map(Number);
              return and(eq(t.quranVerse.sura, s!), eq(t.quranVerse.aya, a!));
            }),
          ),
        )
    : [];
  const steps = await db
    .selectDistinct({ item: t.practiceEvent.item })
    .from(t.practiceEvent)
    .where(
      and(
        eq(t.practiceEvent.profileId, profileId),
        eq(t.practiceEvent.kind, 'trace'),
        eq(t.practiceEvent.ok, true),
        like(t.practiceEvent.item, 'coran:%'),
      ),
    );
  return {
    niveau: space.courant?.code ?? null,
    lecons,
    coran: {
      depuis: space.coranEcriture.depuis,
      visible: space.coranEcriture.visible,
      versets: refs.map((v) => ({
        ref: v.ref,
        lecon: v.unitId,
        // texte Tanzil tel quel (jamais retapé ni normalisé)
        texte: texts.find((x) => `${x.s}:${x.a}` === v.ref)?.text ?? null,
      })),
      faits: steps.map((s) => s.item.slice('coran:'.length)),
      qc1Termine: await qcLevelDone(db, editionId, profileId, 'qc1'),
    },
  };
}

/** Un livret de lecture du Coran (qc1…) est terminé : niveau dépassé, ou toutes ses unités faites. */
export async function qcLevelDone(db: Db, editionId: string, profileId: string, code: string) {
  const cur = await currentLevelOf(db, profileId, 'coran');
  const a = cur ? levelParts(cur.levelCode) : null;
  const b = levelParts(code);
  if (a && b && a.prefix === b.prefix && a.n > b.n) return true;
  const units = await unitsOf(db, editionId, code);
  if (!units.length) return false;
  const rows = await db
    .select({ unitId: t.progress.unitId, status: t.progress.status })
    .from(t.progress)
    .where(
      and(
        eq(t.progress.profileId, profileId),
        inArray(
          t.progress.unitId,
          units.map((u) => u.id),
        ),
      ),
    );
  return units.every((u) => rows.some((r) => r.unitId === u.id && DONE.has(r.status)));
}

// ---------------------------------------------------------------- mots du Coran

/** Mots du Coran rattachés à ces niveaux de livre (ordre du livre = rang de fréquence). */
export async function lemmasOfLevels(db: Db, codes: string[]) {
  if (!codes.length) return [];
  return db
    .select({
      rank: t.quranLemma.rank,
      arabic: t.quranLemma.arabic,
      meaningFr: t.quranLemma.meaningFr,
      root: t.quranLemma.root,
      exampleRef: t.quranLemma.exampleRef,
      category: t.quranLemma.category,
      frequency: t.quranLemma.frequency,
    })
    .from(t.quranLemma)
    .where(
      or(
        inArray(t.quranLemma.levelEnfants, codes),
        inArray(t.quranLemma.levelAdultes, codes),
        inArray(t.quranLemma.levelAdos, codes),
      ),
    )
    .orderBy(asc(t.quranLemma.rank));
}

/**
 * Mots du Coran de l'élève : ceux de SON niveau (acquis / à découvrir), et la couverture « tu reconnais X % des
 * mots du Coran » = somme des fréquences des mots acquis (niveaux terminés + mots validés) / total du Coran.
 * Sans total importé : pas de pourcentage (jamais inventé).
 */
export async function quranWords(db: Db, editionId: string, profileId: string) {
  const space = await levelSpace(db, editionId, profileId, 'arabe');
  if (!space?.courant) return null;
  const mine = await lemmasOfLevels(db, [space.courant.code]);
  const older = await lemmasOfLevels(
    db,
    space.anciens.map((a) => a.code),
  );
  const validated = await db
    .select({ rank: t.profileLemma.rank })
    .from(t.profileLemma)
    .where(eq(t.profileLemma.profileId, profileId));
  const acquired = new Set([...older.map((l) => l.rank), ...validated.map((v) => v.rank)]);
  const [meta] = await db.select().from(t.quranLemmaMeta).where(eq(t.quranLemmaMeta.id, 1));
  const freq = new Map<number, number>();
  for (const l of [...mine, ...older]) freq.set(l.rank, l.frequency ?? 0);
  // fréquences des mots validés hors de ces niveaux (changement de filière) : lues aussi
  const missing = [...acquired].filter((r) => !freq.has(r));
  if (missing.length)
    for (const r of await db
      .select({ rank: t.quranLemma.rank, frequency: t.quranLemma.frequency })
      .from(t.quranLemma)
      .where(inArray(t.quranLemma.rank, missing)))
      freq.set(r.rank, r.frequency ?? 0);
  const covered = [...acquired].reduce((s, r) => s + (freq.get(r) ?? 0), 0);
  return {
    niveau: space.courant.code,
    mots: mine.map((l) => ({
      rang: l.rank,
      ar: l.arabic,
      sens: l.meaningFr,
      racine: l.root,
      ref: l.exampleRef,
      categorie: l.category,
      acquis: acquired.has(l.rank),
    })),
    couverture: {
      acquis: acquired.size,
      total: meta?.totalWords ?? null,
      pct: meta?.totalWords
        ? Math.min(100, Math.round((covered / meta.totalWords) * 1000) / 10)
        : null,
    },
  };
}

/** Mots validés par l'élève (quiz du niveau) : seulement des mots de son niveau ou de ses anciens livres. */
export async function acquireWords(
  db: Db,
  editionId: string,
  profileId: string,
  ranks: number[],
): Promise<number> {
  const space = await levelSpace(db, editionId, profileId, 'arabe');
  if (!space?.courant || !ranks.length) return 0;
  const allowed = new Set(
    (await lemmasOfLevels(db, [space.courant.code, ...space.anciens.map((a) => a.code)])).map(
      (l) => l.rank,
    ),
  );
  const ok = [...new Set(ranks)].filter((r) => allowed.has(r));
  if (!ok.length) return 0;
  const rows = await db
    .insert(t.profileLemma)
    .values(ok.map((rank) => ({ profileId, rank, source: 'carte' })))
    .onConflictDoNothing()
    .returning({ rank: t.profileLemma.rank });
  return rows.length;
}

// ---------------------------------------------------------------- positionnement et épreuve de passage

export async function recordPlacement(
  db: Db,
  a: {
    profileId: string;
    subject: string;
    kind: 'positionnement' | 'epreuve';
    levelCode: string;
    points: number;
    max: number;
    passed: boolean;
  },
) {
  await db.insert(t.placementAttempt).values({
    profileId: a.profileId,
    subjectCode: a.subject,
    kind: a.kind,
    levelCode: a.levelCode,
    points: a.points,
    max: a.max,
    passed: a.passed,
  });
}

/** Essais récents (depuis `since`) d'un profil pour une matière, du plus ancien au plus récent. */
export async function placementAttempts(
  db: Db,
  profileId: string,
  subject: string,
  kind: 'positionnement' | 'epreuve',
  since: Date,
) {
  return db
    .select()
    .from(t.placementAttempt)
    .where(
      and(
        eq(t.placementAttempt.profileId, profileId),
        eq(t.placementAttempt.subjectCode, subject),
        eq(t.placementAttempt.kind, kind),
        gte(t.placementAttempt.at, since),
      ),
    )
    .orderBy(asc(t.placementAttempt.at));
}

/** Dernier essai d'épreuve de passage (pour « réessayer demain »). */
export async function lastPassageAttempt(db: Db, profileId: string, subject: string) {
  const [r] = await db
    .select()
    .from(t.placementAttempt)
    .where(
      and(
        eq(t.placementAttempt.profileId, profileId),
        eq(t.placementAttempt.subjectCode, subject),
        eq(t.placementAttempt.kind, 'epreuve'),
      ),
    )
    .orderBy(desc(t.placementAttempt.at))
    .limit(1);
  return r ?? null;
}

/**
 * Niveau à tester ensuite dans un test de positionnement en cours : le premier niveau de la filière, ou celui
 * qui suit une suite d'essais réussis (un échec, ou le dernier niveau réussi, termine le test).
 */
export function expectedPlacementLevel(
  levels: readonly string[],
  attempts: ReadonlyArray<{ levelCode: string; passed: boolean }>,
): string | null {
  let i = 0;
  for (const a of attempts) {
    if (levels[i] === a.levelCode && a.passed) i = i + 1 < levels.length ? i + 1 : 0;
    else i = 0;
  }
  return levels[i] ?? null;
}

// ---------------------------------------------------------------- classes de l'élève (« Ma classe »)

/** Classes et cercles ACTIFS où l'élève est inscrit (partage par la famille ou inscription par l'école). */
export async function learnerClasses(db: Db, profileId: string) {
  return db
    .select({
      id: t.classGroup.id,
      name: t.classGroup.name,
      kind: t.classGroup.kind,
      levelCode: t.classGroup.levelCode,
      portion: t.classGroup.portion,
    })
    .from(t.classMember)
    .innerJoin(t.classGroup, eq(t.classGroup.id, t.classMember.classId))
    .where(and(eq(t.classMember.profileId, profileId), eq(t.classGroup.status, 'active')))
    .orderBy(asc(t.classGroup.name));
}

// ---------------------------------------------------------------- D-F2 (5) propositions de réinscription

export async function reenrolmentOffers(db: Db, profileIds: string[]) {
  if (!profileIds.length) return [];
  return db
    .select({
      id: t.reenrolmentOffer.id,
      profileId: t.reenrolmentOffer.profileId,
      classId: t.reenrolmentOffer.classId,
      className: t.classGroup.name,
      levelCode: t.classGroup.levelCode,
      createdAt: t.reenrolmentOffer.createdAt,
    })
    .from(t.reenrolmentOffer)
    .innerJoin(t.classGroup, eq(t.classGroup.id, t.reenrolmentOffer.classId))
    .where(
      and(
        inArray(t.reenrolmentOffer.profileId, profileIds),
        eq(t.reenrolmentOffer.status, 'proposee'),
        eq(t.classGroup.status, 'active'),
      ),
    )
    .orderBy(asc(t.reenrolmentOffer.createdAt));
}

/** La famille confirme (le partage avec la classe de l'année suivante reprend) ou refuse, d'un geste. */
export async function decideReenrolment(
  db: Db,
  offerId: string,
  profileIds: string[],
  by: string,
  accept: boolean,
): Promise<{ classId: string; profileId: string } | null> {
  return db.transaction(async (tx) => {
    const [o] = await tx
      .select()
      .from(t.reenrolmentOffer)
      .where(
        and(
          eq(t.reenrolmentOffer.id, offerId),
          eq(t.reenrolmentOffer.status, 'proposee'),
          profileIds.length ? inArray(t.reenrolmentOffer.profileId, profileIds) : sql`false`,
        ),
      );
    if (!o) return null;
    await tx
      .update(t.reenrolmentOffer)
      .set({ status: accept ? 'acceptee' : 'refusee', decidedBy: by, decidedAt: new Date() })
      .where(eq(t.reenrolmentOffer.id, o.id));
    if (accept)
      await tx
        .insert(t.classMember)
        .values({ classId: o.classId, profileId: o.profileId, addedBy: by })
        .onConflictDoNothing();
    else
      // refus : l'élève ne figure plus sur la liste de la classe suivante (rien d'autre n'est effacé)
      await tx
        .update(t.classPupil)
        .set({ leftAt: new Date() })
        .where(
          and(
            eq(t.classPupil.classId, o.classId),
            eq(t.classPupil.profileId, o.profileId),
            isNull(t.classPupil.leftAt),
          ),
        );
    return { classId: o.classId, profileId: o.profileId };
  });
}
