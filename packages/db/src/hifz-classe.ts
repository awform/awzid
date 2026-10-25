/**
 * Hifẓ en classe (25/10/2026, interrupteur `hifz_classe`) : séances où l'élève récite devant son maître, qui coche les erreurs
 * MOT PAR MOT (oubli, ajout, changement, tajwīd), puis valide la portion ou la remet à reprendre.
 *  - mode « direct » : la récitation se fait devant le maître, SANS AUCUN enregistrement (aucun lien vers un audio, imposé par une
 *    contrainte de la base) ; c'est le mode des enfants ;
 *  - mode « enregistrement » : un ADULTE consentant s'est enregistré (récitation chiffrée, conservée au plus 30 jours puis effacée par
 *    le travailleur) ; le maître l'écoute et l'annote plus tard ; l'annotation ne contient aucune voix et reste après l'effacement ;
 *  - la validation entre dans le journal de hifẓ de l'élève (événement « enseignant ») et dans sa carte des erreurs (marques mot par
 *    mot) ; les parents voient le suivi (jamais un audio) ;
 *  - le texte coranique n'est jamais manipulé ici : des références de versets et des rangs de mots (`texte.split(' ')`).
 */
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import { recordHifzEvents } from './hifz.js';
import * as t from './schema.js';

export const HC_KINDS = ['oubli', 'ajout', 'changement', 'tajwid'] as const;
export type HcKind = (typeof HC_KINDS)[number];
export const HC_MAX_ERREURS = 600;
/** conservation maximale d'un enregistrement envoyé pour le hifẓ en classe (jours) : puis suppression automatique */
export const HC_CONSERVATION_MAX_JOURS = 30;
export const HC_ISSUES = ['validee', 'a_reprendre'] as const;
export type HcIssue = (typeof HC_ISSUES)[number];

export type HcSeanceRow = typeof t.hifzClasseSeance.$inferSelect;

export interface HcSeanceInput {
  classId: string;
  profileId: string;
  teacherAccountId: string;
  mode: 'direct' | 'enregistrement';
  sura: number;
  from: number;
  to: number;
  recitationId?: string | null;
}

/** Contrôle d'une séance avant création (code d'erreur ou null). */
export function hcCheckSeance(i: HcSeanceInput, ayas?: ReadonlyMap<number, number>): string | null {
  const int = (n: unknown, lo: number, hi: number) =>
    Number.isInteger(n) && (n as number) >= lo && (n as number) <= hi;
  if (i.mode !== 'direct' && i.mode !== 'enregistrement') return 'mode_invalide';
  if (!int(i.sura, 1, 114)) return 'portion_invalide';
  const max = ayas?.get(i.sura) ?? 286;
  if (!int(i.from, 1, max) || !int(i.to, i.from, max)) return 'portion_invalide';
  // une portion de classe reste courte : jamais plus de 60 versets d'un coup
  if (i.to - i.from + 1 > 60) return 'portion_trop_longue';
  if (i.mode === 'direct' && i.recitationId) return 'direct_sans_enregistrement';
  if (i.mode === 'enregistrement' && !i.recitationId) return 'enregistrement_requis';
  return null;
}

export async function hcCreerSeance(
  db: Db,
  i: HcSeanceInput,
  ayas?: ReadonlyMap<number, number>,
): Promise<HcSeanceRow> {
  const bad = hcCheckSeance(i, ayas);
  if (bad) throw new Error(bad);
  const [row] = await db
    .insert(t.hifzClasseSeance)
    .values({
      classId: i.classId,
      profileId: i.profileId,
      teacherAccountId: i.teacherAccountId,
      mode: i.mode,
      sura: i.sura,
      fromAya: i.from,
      toAya: i.to,
      recitationId: i.mode === 'enregistrement' ? (i.recitationId ?? null) : null,
    })
    .returning();
  return row!;
}

export async function hcSeance(db: Db, id: string): Promise<HcSeanceRow | null> {
  const [r] = await db.select().from(t.hifzClasseSeance).where(eq(t.hifzClasseSeance.id, id));
  return r ?? null;
}

export interface HcErreurIn {
  a: number;
  k: number;
  t: HcKind;
}

/** Remplace TOUTES les erreurs d'une séance en cours (enregistrement automatique de l'écran du maître). */
export async function hcRemplacerErreurs(
  db: Db,
  s: HcSeanceRow,
  erreurs: readonly HcErreurIn[],
): Promise<number> {
  if (s.status !== 'en_cours') throw new Error('seance_terminee');
  if (erreurs.length > HC_MAX_ERREURS) throw new Error('trop_d_erreurs');
  const vues = new Set<string>();
  const lignes: Array<typeof t.hifzClasseErreur.$inferInsert> = [];
  for (const e of erreurs) {
    if (
      !Number.isInteger(e.a) ||
      e.a < s.fromAya ||
      e.a > s.toAya ||
      !Number.isInteger(e.k) ||
      e.k < 0 ||
      e.k > 300 ||
      !(HC_KINDS as readonly string[]).includes(e.t)
    )
      throw new Error('erreur_invalide');
    const cle = `${e.a}:${e.k}:${e.t}`;
    if (vues.has(cle)) continue;
    vues.add(cle);
    lignes.push({ seanceId: s.id, aya: e.a, word: e.k, kind: e.t });
  }
  await db.transaction(async (tx) => {
    await tx.delete(t.hifzClasseErreur).where(eq(t.hifzClasseErreur.seanceId, s.id));
    if (lignes.length) await tx.insert(t.hifzClasseErreur).values(lignes);
  });
  return lignes.length;
}

export async function hcErreurs(db: Db, seanceId: string): Promise<HcErreurIn[]> {
  const rows = await db
    .select({ a: t.hifzClasseErreur.aya, k: t.hifzClasseErreur.word, t: t.hifzClasseErreur.kind })
    .from(t.hifzClasseErreur)
    .where(eq(t.hifzClasseErreur.seanceId, seanceId))
    .orderBy(asc(t.hifzClasseErreur.aya), asc(t.hifzClasseErreur.word));
  return rows.map((r) => ({ a: r.a, k: r.k, t: r.t as HcKind }));
}

/** Résultat noté dans le journal de hifẓ (0 à 3) : portion validée sans erreur 3, avec erreurs 2, à reprendre 1 (0 si trop d'oublis). */
export function hcQualite(issue: HcIssue, c: Record<HcKind, number>): number {
  if (issue === 'validee') return c.oubli + c.ajout + c.changement + c.tajwid === 0 ? 3 : 2;
  return c.oubli >= 3 ? 0 : 1;
}

export const hcCompte = (e: readonly HcErreurIn[]): Record<HcKind, number> => {
  const c: Record<HcKind, number> = { oubli: 0, ajout: 0, changement: 0, tajwid: 0 };
  for (const x of e) c[x.t]++;
  return c;
};

const partDe = (s: HcSeanceRow) =>
  s.fromAya === s.toAya ? `${s.sura}:${s.fromAya}` : `${s.sura}:${s.fromAya}-${s.toAya}`;

/**
 * Termine la séance : le maître valide la portion ou la remet à reprendre (remarque facultative de 300 signes). Écrit, dans le journal
 * de hifẓ de l'élève, un événement « enseignant » ; dans sa carte des erreurs, une marque par erreur (oubli → « oubli », les autres →
 * « erreur », source « enseignant ») et, si la portion est validée, « juste » sur les versets sans erreur.
 */
export async function hcTerminer(
  db: Db,
  s: HcSeanceRow,
  issue: HcIssue,
  remarque: string | null,
  teacherAccountId: string,
  now = new Date(),
): Promise<{ q: number; erreurs: Record<HcKind, number> }> {
  if (s.status !== 'en_cours') throw new Error('seance_terminee');
  if (!(HC_ISSUES as readonly string[]).includes(issue)) throw new Error('issue_invalide');
  if (remarque !== null && remarque.length > 300) throw new Error('remarque_trop_longue');
  const erreurs = await hcErreurs(db, s.id);
  const c = hcCompte(erreurs);
  const q = hcQualite(issue, c);
  const jour = now.toISOString().slice(0, 10);
  const r = await recordHifzEvents(
    db,
    [
      {
        id: s.id,
        profileId: s.profileId,
        day: jour,
        part: partDe(s),
        kind: 'revision',
        q,
        source: 'enseignant',
        details: { hifzClasse: s.mode, issue, erreurs: c, remarque },
        deviceAt: now.toISOString(),
      },
    ],
    teacherAccountId,
    true,
  );
  if (r.rejected.length) throw new Error('evenement_refuse');
  const marques: Array<typeof t.hifzMark.$inferInsert> = erreurs.map((e) => ({
    id: randomUUID(),
    profileId: s.profileId,
    day: jour,
    sura: s.sura,
    aya: e.a,
    word: e.k,
    kind: e.t === 'oubli' ? 'oubli' : 'erreur',
    source: 'enseignant',
    deviceAt: now,
  }));
  if (issue === 'validee') {
    const avecErreur = new Set(erreurs.map((e) => e.a));
    for (let a = s.fromAya; a <= s.toAya; a++)
      if (!avecErreur.has(a))
        marques.push({
          id: randomUUID(),
          profileId: s.profileId,
          day: jour,
          sura: s.sura,
          aya: a,
          word: -1,
          kind: 'juste',
          source: 'enseignant',
          deviceAt: now,
        });
  }
  await db.transaction(async (tx) => {
    if (marques.length) await tx.insert(t.hifzMark).values(marques);
    await tx
      .update(t.hifzClasseSeance)
      .set({
        status: 'terminee',
        outcome: issue,
        remark: remarque?.trim() || null,
        eventId: s.id,
        finishedAt: now,
      })
      .where(eq(t.hifzClasseSeance.id, s.id));
  });
  return { q, erreurs: c };
}

export interface HcSeanceVue {
  id: string;
  classId: string;
  className: string;
  profileId: string;
  pseudonym: string;
  mode: string;
  sura: number;
  from: number;
  to: number;
  status: string;
  outcome: string | null;
  remark: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  erreurs: Record<HcKind, number>;
}

async function vues(db: Db, rows: Array<{ s: HcSeanceRow; className: string; pseudonym: string }>) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.s.id);
  const cs = await db
    .select({
      id: t.hifzClasseErreur.seanceId,
      kind: t.hifzClasseErreur.kind,
      n: sql<number>`count(*)::int`,
    })
    .from(t.hifzClasseErreur)
    .where(inArray(t.hifzClasseErreur.seanceId, ids))
    .groupBy(t.hifzClasseErreur.seanceId, t.hifzClasseErreur.kind);
  return rows.map(({ s, className, pseudonym }): HcSeanceVue => {
    const erreurs: Record<HcKind, number> = { oubli: 0, ajout: 0, changement: 0, tajwid: 0 };
    for (const c of cs) if (c.id === s.id) erreurs[c.kind as HcKind] = c.n;
    return {
      id: s.id,
      classId: s.classId,
      className,
      profileId: s.profileId,
      pseudonym,
      mode: s.mode,
      sura: s.sura,
      from: s.fromAya,
      to: s.toAya,
      status: s.status,
      outcome: s.outcome,
      remark: s.remark,
      createdAt: s.createdAt,
      finishedAt: s.finishedAt,
      erreurs,
    };
  });
}

/** Séances d'une classe (les plus récentes d'abord), éventuellement d'un seul élève. */
export async function hcSeancesClasse(
  db: Db,
  classId: string,
  profileId?: string,
  limite = 50,
): Promise<HcSeanceVue[]> {
  const rows = await db
    .select({ s: t.hifzClasseSeance, className: t.classGroup.name, pseudonym: t.profile.pseudonym })
    .from(t.hifzClasseSeance)
    .innerJoin(t.classGroup, eq(t.classGroup.id, t.hifzClasseSeance.classId))
    .innerJoin(t.profile, eq(t.profile.id, t.hifzClasseSeance.profileId))
    .where(
      and(
        eq(t.hifzClasseSeance.classId, classId),
        ...(profileId ? [eq(t.hifzClasseSeance.profileId, profileId)] : []),
      ),
    )
    .orderBy(desc(t.hifzClasseSeance.createdAt))
    .limit(limite);
  return vues(db, rows);
}

/** Suivi d'un élève, vu par sa famille : séances TERMINÉES seulement (jamais un audio), les plus récentes d'abord. */
export async function hcSeancesProfil(
  db: Db,
  profileId: string,
  limite = 50,
): Promise<HcSeanceVue[]> {
  const rows = await db
    .select({ s: t.hifzClasseSeance, className: t.classGroup.name, pseudonym: t.profile.pseudonym })
    .from(t.hifzClasseSeance)
    .innerJoin(t.classGroup, eq(t.classGroup.id, t.hifzClasseSeance.classId))
    .innerJoin(t.profile, eq(t.profile.id, t.hifzClasseSeance.profileId))
    .where(
      and(eq(t.hifzClasseSeance.profileId, profileId), eq(t.hifzClasseSeance.status, 'terminee')),
    )
    .orderBy(desc(t.hifzClasseSeance.finishedAt))
    .limit(limite);
  return vues(db, rows);
}
