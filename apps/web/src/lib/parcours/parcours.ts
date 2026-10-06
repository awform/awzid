/**
 * Chantier A27 — parcours par niveau de l'élève (côté appareil) : appels à l'API, copie locale (hors ligne :
 * le dernier état connu reste affiché) et règles PURES de l'interface (testées dans parcours.test.ts) :
 *  - « Ma prochaine activité » : leçon en cours, puis écriture de la leçon faite, puis révisions dues après la
 *    leçon du jour, puis leçon suivante, révisions, et enfin l'épreuve de fin de niveau ;
 *  - onglets de l'espace du niveau : n'apparaissent que s'ils ont du contenu À CE NIVEAU (enfants : Leçons,
 *    Lectures, Écriture seulement) ;
 *  - « J'écris le Coran » : étape 1 (copie guidée), 2 (dictée par récitateur) après l'étape 1 du verset,
 *    3 (de mémoire) quand qc1 est terminé et que la moitié environ du Juzʾ ʿAmma est mémorisée.
 */
import { enqueue } from '$lib/attempts';
import { localIso } from '$lib/hifz';
import { kvGet, kvSet } from '$lib/idb';
import { call, type ApiResult } from '$lib/session';
import { setModeLocal, type Mode } from './mode';

export type { Mode } from './mode';

export type Matiere = 'arabe' | 'sciences' | 'coran';
export type Kind = 'enfant' | 'ado' | 'adulte';

export interface Unite {
  id: string;
  n: number;
  kind: 'lecon' | 'bilan' | 'examen';
  numLecon: number | null;
  numBilan: number | null;
  titleFr: string;
  titleAr: string;
  statut: string | null;
  majLe: string | null;
  aEcriture: boolean;
  ecritureFaite: boolean;
}

export interface Espace {
  edition?: string;
  matiere: Matiere;
  piste: string;
  kind: Kind;
  courant: {
    code: string;
    titre: string | null;
    titreAr: string | null;
    depuis: string | null;
    origine: string;
  } | null;
  proposition: string | null;
  niveaux: string[];
  unites: Unite[];
  progression: { faites: number; total: number };
  enCours: string | null;
  prochaine: string | null;
  derniere: { id: string; le: string | null; aEcriture: boolean; ecritureFaite: boolean } | null;
  examen: { id: string; statut: string | null } | null;
  livrets: number;
  mots: number;
  anciens: Array<{ code: string; titre: string | null; titreAr: string | null }>;
  suivant: {
    code: string;
    titre: string | null;
    titreAr: string | null;
    lecons: Array<Pick<Unite, 'n' | 'kind' | 'numLecon' | 'numBilan' | 'titleFr' | 'titleAr'>>;
  } | null;
  coranEcriture: { depuis: string | null; visible: boolean };
  epreuve: { le: string; reussie: boolean; niveau: string; attendre: string | null } | null;
  /** A39 : mode d'évaluation, leçons terminées cette semaine, niveaux dont l'épreuve est réussie */
  mode?: { mode: Mode; decideur: string; classe: { id: string; name: string } | null };
  semaine?: number;
  epreuvesReussies?: string[];
}

export interface Bref {
  id: string;
  n: number;
  kind: string;
  numLecon: number | null;
  titleFr: string;
}
export interface Resume {
  courant: Espace['courant'];
  proposition: string | null;
  progression: { faites: number; total: number };
  enCours: Bref | null;
  prochaine: Bref | null;
  derniere: (Bref & { le: string | null; aEcriture: boolean; ecritureFaite: boolean }) | null;
  examen: { id: string; statut: string | null } | null;
  suivant: { code: string; titre: string | null } | null;
}
export interface Accueil {
  kind: Kind;
  mode?: Mode;
  semaine?: number;
  arabe: Resume | null;
  sciences: Resume | null;
  coran: {
    niveau: Resume | null;
    plan: { mode: string; bookCode: string | null; rhythmYears: number | null } | null;
    cercles: Array<{ id: string; name: string; portion: string | null }>;
  };
  classes: Array<{ id: string; name: string; kind: string; levelCode: string | null }>;
}

export interface Ecriture {
  niveau: string | null;
  lecons: Array<{
    id: string;
    n: number;
    kind: string;
    numLecon: number | null;
    titleFr: string;
    titleAr: string;
    statut: string | null;
    faite: boolean;
  }>;
  coran: {
    depuis: string | null;
    visible: boolean;
    versets: Array<{ ref: string; lecon: string; texte: string | null }>;
    faits: string[];
    qc1Termine: boolean;
  };
}

export interface MotCoran {
  rang: number;
  ar: string;
  sens: string | null;
  racine: string | null;
  ref: string | null;
  categorie: string | null;
  acquis: boolean;
}
export interface MotsCoran {
  niveau: string;
  mots: MotCoran[];
  couverture: { acquis: number; total: number | null; pct: number | null };
}

/** Lecture réseau d'abord ; sans réseau, la dernière copie gardée sur l'appareil (données de l'élève). */
async function cached<T>(key: string, path: string): Promise<ApiResult<T> & { local?: boolean }> {
  const r = await call<T>('GET', path);
  if (r.ok && r.data) {
    await kvSet(`parcours:${key}`, r.data).catch(() => {});
    return r;
  }
  if (r.status === 0 || r.code === 'reseau') {
    const local = await kvGet<T>(`parcours:${key}`).catch(() => undefined);
    if (local) return { ...r, ok: true, data: local, local: true };
  }
  return r;
}

export const espace = async (pid: string, m: Matiere) => {
  const r = await cached<Espace>(`espace:${pid}:${m}`, `/profiles/${pid}/espace/${m}`);
  if (m === 'arabe') setModeLocal(pid, r.data?.mode?.mode);
  return r;
};

/** A39 : récapitulatif bienveillant avant le niveau suivant (notions fragiles, leçons faites). */
export interface Recap {
  niveau: string;
  suivant: string | null;
  mode: Mode;
  lecons: { faites: number; total: number };
  toutesFaites: boolean;
  semaine: number;
  fragiles: Array<{ unitId: string; n: number; numLecon: number | null; titleFr: string }>;
  recommandation: boolean;
}
export const recapitulatif = (pid: string, m: Matiere) =>
  call<Recap>('GET', `/profiles/${pid}/recapitulatif/${m}`);
export const accueil = (pid: string) =>
  cached<Accueil>(`accueil:${pid}`, `/profiles/${pid}/accueil`);
export const ecriture = (pid: string) =>
  cached<Ecriture>(`ecriture:${pid}`, `/profiles/${pid}/ecriture`);
export const motsCoran = (pid: string) =>
  cached<MotsCoran>(`mots:${pid}`, `/profiles/${pid}/mots-coran`);
export const acquerirMots = (pid: string, rangs: number[]) =>
  call<{ ajoutes: number }>('POST', `/profiles/${pid}/mots-coran`, { rangs });
export const commencer = (pid: string, m: Matiere) =>
  call<{ niveau: string }>('POST', `/profiles/${pid}/commencer/${m}`, {});

/** « J'ai fait l'écriture de cette leçon » (cahier papier ou fiche) : journal d'entraînement, hors ligne. */
export const ecritureFaite = (profileId: string, unitId: string) =>
  enqueue({
    profileId,
    unitId: 'entrainement',
    eventType: 'trace',
    response: { item: `cahier:${unitId}`, ok: true, day: localIso() },
  });

/** Étape de « J'écris le Coran » faite pour un verset (avec la liste cochée : jamais de verdict). */
export const etapeCoranFaite = (
  profileId: string,
  ref: string,
  etape: 1 | 2 | 3,
  coches: Record<string, boolean>,
) =>
  enqueue({
    profileId,
    unitId: 'entrainement',
    eventType: 'trace',
    response: { item: `coran:${ref}:${etape}`, ok: true, day: localIso(), details: { coches } },
  });

// ---------------------------------------------------------------- règles pures

export type Activite =
  | { kind: 'lecon'; unitId: string; n: number; titre: string; reprise: boolean }
  | { kind: 'ecriture'; unitId: string; n: number; titre: string }
  | { kind: 'revisions'; mots: number }
  | { kind: 'epreuve'; niveau: string }
  | { kind: 'ouvrir'; niveau: string }
  | { kind: 'commencer'; matiere: Matiere; proposition: string | null }
  | { kind: 'lectures' };

const dayOf = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : localIso(d);
};

/**
 * Ma prochaine activité, choisie selon le livre : (1) la leçon commencée ; (2) l'écriture de la leçon qui vient
 * d'être faite ; (3) les révisions dues si une leçon a été faite aujourd'hui ; (4) la leçon suivante ; (5) les
 * révisions dues ; (6) l'épreuve de fin de niveau (toutes les leçons faites) — en MODE SEREIN (A39), ouvrir le
 * niveau suivant, sans épreuve ; sinon les lectures du niveau.
 */
export function nextActivity(
  a: Pick<
    Resume,
    'courant' | 'proposition' | 'enCours' | 'prochaine' | 'derniere' | 'examen' | 'suivant'
  > | null,
  due: number,
  today: string,
  mode?: Mode,
): Activite {
  if (!a || !a.courant)
    return { kind: 'commencer', matiere: 'arabe', proposition: a?.proposition ?? null };
  if (a.enCours)
    return {
      kind: 'lecon',
      unitId: a.enCours.id,
      n: a.enCours.n,
      titre: a.enCours.titleFr,
      reprise: true,
    };
  const d = a.derniere;
  if (d && d.aEcriture && !d.ecritureFaite)
    return { kind: 'ecriture', unitId: d.id, n: d.n, titre: d.titleFr };
  if (d && due > 0 && dayOf(d.le) === today) return { kind: 'revisions', mots: due };
  if (a.prochaine && a.prochaine.kind !== 'examen')
    return {
      kind: 'lecon',
      unitId: a.prochaine.id,
      n: a.prochaine.n,
      titre: a.prochaine.titleFr,
      reprise: false,
    };
  if (due > 0) return { kind: 'revisions', mots: due };
  if (a.suivant) return { kind: mode === 'serein' ? 'ouvrir' : 'epreuve', niveau: a.courant.code };
  return { kind: 'lectures' };
}

export type Onglet = 'lecons' | 'lectures' | 'ecriture' | 'pratique' | 'mots';

/** Onglets de l'espace du niveau : seulement ceux qui ont du contenu à CE niveau. */
export function tabsFor(
  e: Pick<Espace, 'unites' | 'livrets' | 'mots' | 'progression'>,
  kind: Kind,
): Onglet[] {
  const out: Onglet[] = [];
  if (e.unites.length) out.push('lecons');
  if (e.livrets > 0) out.push('lectures');
  if (e.unites.some((u) => u.aEcriture)) out.push('ecriture');
  if (kind === 'enfant') return out;
  // pratique : révisions et activités à partir de la première leçon faite
  if (e.progression.faites > 0) out.push('pratique');
  if (e.mots > 0) out.push('mots');
  return out;
}

/** Juzʾ ʿAmma : sourates 78 à 114. Part des versets acquis (0 à 1). */
export function juzAmmaShare(acquis: ReadonlySet<string>, counts: readonly number[]): number {
  let total = 0;
  let got = 0;
  for (let s = 78; s <= 114; s++) {
    const n = counts[s - 1] ?? 0;
    total += n;
    for (let a = 1; a <= n; a++) if (acquis.has(`${s}:${a}`)) got++;
  }
  return total ? got / total : 0;
}

/** Seuil « environ la moitié » du Juzʾ ʿAmma pour l'étape 3 (de mémoire). */
export const JUZ_AMMA_SEUIL = 0.5;

export interface EtapesCoran {
  1: boolean;
  2: boolean;
  3: boolean;
}
/** Étapes ouvertes pour un verset : 1 toujours ; 2 après l'étape 1 de ce verset ; 3 : qc1 + moitié du Juzʾ ʿAmma. */
export function etapesCoran(
  ref: string,
  faits: readonly string[],
  qc1Termine: boolean,
  juzAmma: number,
): EtapesCoran {
  const e1 = faits.includes(`${ref}:1`);
  return { 1: true, 2: e1, 3: qc1Termine && juzAmma >= JUZ_AMMA_SEUIL };
}

/** Mots du verset Tanzil (séparés par les espaces seulement, jamais retouchés) pour la comparaison guidée. */
export const versetMots = (texte: string) => texte.split(' ').filter(Boolean);

export type Acces = 'courant' | 'revision' | 'apercu' | 'ferme' | 'libre';

/**
 * Accès d'un élève à un livre (même règle que l'API, `accessFor`) : son niveau courant ; les niveaux terminés
 * de sa filière en révision ; le suivant en aperçu ; le reste fermé. Sans niveau dans la matière : libre.
 */
export function accessFor(current: string | null, code: string): Acces {
  const p = (c: string) => {
    const m = /^([a-z]+?)(\d+)$/.exec(c);
    return m ? { prefix: m[1]!, n: Number(m[2]) } : null;
  };
  if (!current) return 'libre';
  const a = p(current);
  const b = p(code);
  if (!a || !b) return 'libre';
  const subj = (x: string) => (/^r[ea]$/.test(x) ? 's' : x === 'qc' ? 'q' : 'a');
  if (subj(a.prefix) !== subj(b.prefix)) return 'libre';
  if (a.prefix !== b.prefix) return 'ferme';
  if (b.n === a.n) return 'courant';
  if (b.n < a.n) return 'revision';
  return b.n === a.n + 1 ? 'apercu' : 'ferme';
}

/** Matière d'un code de niveau. */
export const matiereOf = (code: string): Matiere =>
  /^r[ea]\d/.test(code) ? 'sciences' : /^qc\d/.test(code) ? 'coran' : 'arabe';

/** Numéro de leçon affiché dans le livre, sinon le rang. */
export const numero = (u: { numLecon?: number | null; n: number }) => u.numLecon ?? u.n;
