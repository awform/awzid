/**
 * Tafsīr abrégé et mot à mot (2/11/2026) — format des fichiers `packages/content/tafsir/NNN.json` (un par sourate, 114 au total),
 * construction depuis les fichiers du référent (`application/tafsir/*.json` + al-Fātiḥa de `data/priere/sourates.json`) et FILTRAGE
 * par public. Les fichiers ne sont JAMAIS publics (pas dans `apps/web/static`) : l'API les sert avec les droits de l'élève,
 * une sourate à la fois, après filtrage (`filtrerSourate`).
 *
 * Règles (D-TF-445, D-TF-498, confirmées par le référent le 1/11) :
 *  - un segment marqué « mention publique INTERDITE avant relecture » (chapitre du jihād d'ar-Risāla) n'est montré à AUCUN élève,
 *    même adulte : il n'est visible que du compte « tout voir » du client (`acces: 'interdit'`) ;
 *  - un segment « niveau adulte + relecture du comité » n'est montré qu'aux profils adultes, TOUJOURS avec sa note de contexte
 *    (`acces: 'adulte'` + `note_contexte` obligatoire) ;
 *  - les fichiers du référent actuels ne portent aucun de ces segments (ils n'ont pas été cités dans le texte) : le mécanisme est
 *    prêt pour la suite, et la construction REFUSE tout texte qui contient un de ces marqueurs sans être marqué.
 *
 * Aucune normalisation (NFC interdite) : l'arabe est celui de Tanzil, octet pour octet, contrôlé à la construction.
 */
import { ayahCandidates, type Tanzil } from './quran.js';

export const TAFSIR_VERSION = 1;

export type AccesTafsir = 'adulte' | 'interdit';
/** Public d'une réponse : l'élève (enfant, ado, ou sans profil adulte), le profil adulte, ou le compte « tout voir ». */
export type PublicTafsir = 'eleve' | 'adulte' | 'tout';

export interface PointTafsir {
  /** numéro d'ordre dans la sourate (référencé par `p` des versets) */
  id: number;
  titre: string;
  texte: string;
  sources: string[];
  /** versets couverts, [de, à] ; vide = point général de la sourate */
  plage: Array<[number, number]>;
  acces?: AccesTafsir;
  /** note de contexte, obligatoire pour `acces: 'adulte'` */
  note_contexte?: string;
}

export interface VersetTafsir {
  a: number;
  /** texte du verset (Tanzil ; basmala d'en-tête retirée au verset 1, comme le lecteur) */
  ar: string;
  /** mot à mot : [arabe Tanzil du mot, sens français] */
  mots: Array<[string, string]>;
  sens: string;
  note?: string;
  /** `id` des points du tafsīr qui couvrent ce verset */
  p: number[];
}

export interface SourateTafsir {
  v: number;
  s: number;
  nom_ar: string;
  nom_fr: string;
  sens_general?: string;
  contexte?: string;
  traduction?: string;
  points: PointTafsir[];
  versets: VersetTafsir[];
}

/** Marqueurs des Madjaliss qui ne doivent JAMAIS figurer dans un texte non marqué (mentions internes comprises). */
export const MARQUEURS_INTERDITS =
  /mention publique interdite|niveau adulte|relecture du comit|CORPUS_CORAN|A_VERIFIER|\bD-TF-\d|\bV-B\d-\d|\bB\d-\d{1,3}\b/i;

/** Plages d'un titre « … (v. 1-3, 5) » ; `[]` : point général ; `null` : parenthèse « (v. … ) » illisible. */
export function lirePlage(titre: string): Array<[number, number]> | null {
  const m = /\((?:v|vv)\.\s*([^)]*)\)/.exec(titre);
  if (!m) return [];
  const out: Array<[number, number]> = [];
  for (const part of m[1]!.split(/\s*(?:,|;|\bet\b)\s*/)) {
    const r = /^(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?$/.exec(part.trim());
    if (!r) return null;
    const de = Number(r[1]);
    const a = r[2] ? Number(r[2]) : de;
    if (a < de) return null;
    out.push([de, a]);
  }
  return out.length ? out : null;
}

/** Signe de pause, ornement ou ponctuation isolé de Tanzil : un « mot » du texte qui n'est pas un mot du mot à mot. */
function estSigneIsole(w: string): boolean {
  for (const c of w) {
    const n = c.codePointAt(0)!;
    // U+0600-061F (signes arabes, dont le numéro de verset), U+06D6-06DE (signes de pause, fin de verset), U+06E9 (sajda)
    if (!((n >= 0x600 && n <= 0x61f) || (n >= 0x6d6 && n <= 0x6de) || n === 0x6e9)) return false;
  }
  return w.length > 0;
}

/** Mots d'un verset Tanzil : groupes séparés par une espace, hors signes de pause isolés. */
export function motsDuVerset(ar: string): string[] {
  return ar.split(' ').filter((w) => w && !estSigneIsole(w));
}

// ---------------------------------------------------------------- source du référent
interface SourceVerset {
  ref: string;
  ar: string;
  mot_a_mot: Array<{ ar: string; fr: string }>;
  sens: string;
  note?: string;
}
interface SourcePoint {
  point: string;
  explication: string;
  sources?: string[];
  acces?: string;
  note_contexte?: string;
}
export interface SourceSourate {
  numero: number;
  nom_ar: string;
  nom_fr: string;
  nombre_versets: number;
  sens_general?: string;
  contexte?: string;
  traduction?: string;
  versets: SourceVerset[];
  tafsir: SourcePoint[];
}

export interface Construit {
  sourate: SourateTafsir;
  erreurs: string[];
}

const texte = (x: unknown): string => (typeof x === 'string' ? x : '');

/** Construit le fichier d'une sourate depuis la source du référent ; `erreurs` non vide : ne rien écrire. */
export function construireSourate(src: SourceSourate, tanzil: Tanzil): Construit {
  const s = src.numero;
  const erreurs: string[] = [];
  const err = (m: string) => erreurs.push(`${s} : ${m}`);
  const marqueur = (champ: string, t: string | undefined) => {
    if (t && MARQUEURS_INTERDITS.test(t)) err(`${champ} contient un marqueur interne ou réservé`);
  };
  if (src.versets.length !== src.nombre_versets)
    err(`${src.versets.length} versets pour nombre_versets = ${src.nombre_versets}`);

  const points: PointTafsir[] = [];
  src.tafsir.forEach((p, id) => {
    const plage = lirePlage(p.point);
    if (plage === null) {
      err(`point « ${p.point} » : plage de versets illisible`);
      return;
    }
    for (const [de, a] of plage)
      if (de < 1 || a > src.versets.length)
        err(`point « ${p.point} » : versets hors de la sourate`);
    const acces = p.acces;
    if (acces !== undefined && acces !== 'adulte' && acces !== 'interdit')
      err(`point « ${p.point} » : acces inconnu`);
    if (acces === 'adulte' && !p.note_contexte?.trim())
      err(`point « ${p.point} » : segment adulte sans note de contexte (D-TF-445)`);
    if (!acces) {
      marqueur(`point « ${p.point} »`, p.point);
      marqueur(`point « ${p.point} »`, p.explication);
      for (const so of p.sources ?? []) marqueur(`sources de « ${p.point} »`, so);
    }
    if (!texte(p.point).trim() || !texte(p.explication).trim()) err(`point ${id} vide`);
    const pt: PointTafsir = {
      id,
      titre: p.point,
      texte: p.explication,
      sources: p.sources ?? [],
      plage,
    };
    if (acces === 'adulte' || acces === 'interdit') pt.acces = acces;
    if (p.note_contexte) pt.note_contexte = p.note_contexte;
    points.push(pt);
  });

  const versets: VersetTafsir[] = src.versets.map((v, i) => {
    const a = i + 1;
    if (v.ref !== `${s}:${a}`) err(`verset ${a} : référence « ${v.ref} »`);
    if (!ayahCandidates(tanzil, s, a).includes(v.ar))
      err(`verset ${a} : texte différent de Tanzil`);
    const attendus = motsDuVerset(v.ar);
    const ar = v.mot_a_mot.map((m) => m.ar);
    if (attendus.length !== ar.length || attendus.some((w, k) => w !== ar[k]))
      err(`verset ${a} : mot à mot différent des mots de Tanzil`);
    if (!v.mot_a_mot.length || v.mot_a_mot.some((m) => !m.fr?.trim()))
      err(`verset ${a} : mot sans sens`);
    if (!v.sens?.trim()) err(`verset ${a} : sens vide`);
    marqueur(`verset ${a}`, v.sens);
    marqueur(`verset ${a} (note)`, v.note);
    for (const m of v.mot_a_mot) marqueur(`verset ${a} (mot)`, m.fr);
    const e: VersetTafsir = {
      a,
      ar: v.ar,
      mots: v.mot_a_mot.map((m) => [m.ar, m.fr]),
      sens: v.sens,
      p: points
        .filter((pt) => pt.plage.some(([de, fin]) => a >= de && a <= fin))
        .map((pt) => pt.id),
    };
    if (v.note) e.note = v.note;
    return e;
  });

  marqueur('sens_general', src.sens_general);
  marqueur('contexte', src.contexte);
  marqueur('traduction', src.traduction);
  const sourate: SourateTafsir = {
    v: TAFSIR_VERSION,
    s,
    nom_ar: src.nom_ar,
    nom_fr: src.nom_fr,
    points,
    versets,
  };
  if (src.sens_general) sourate.sens_general = src.sens_general;
  if (src.contexte) sourate.contexte = src.contexte;
  if (src.traduction) sourate.traduction = src.traduction;
  return { sourate, erreurs };
}

/** Texte JSON d'un fichier de sourate (une ligne par verset et par point : diffs lisibles). */
export function sourateJson(x: SourateTafsir): string {
  const { points, versets, ...tete } = x;
  const entete = JSON.stringify(tete).slice(0, -1);
  return `${entete},\n"points":[\n${points.map((p) => JSON.stringify(p)).join(',\n')}\n],\n"versets":[\n${versets.map((v) => JSON.stringify(v)).join(',\n')}\n]}\n`;
}

// ---------------------------------------------------------------- filtrage par public
/** Ce que le public a le droit de voir d'un segment. */
export function voit(acces: AccesTafsir | undefined, pub: PublicTafsir): boolean {
  if (!acces) return true;
  if (acces === 'adulte') return pub === 'adulte' || pub === 'tout';
  return pub === 'tout';
}

/**
 * Public d'une demande : « tout voir » (le compte du client, décidé par le serveur), adulte (profil de type adulte), sinon élève.
 * Un compte sans profil adulte (parent, enseignant, administrateur ordinaire) reste « élève » : rien d'adulte sans profil adulte.
 */
export function publicDe(i: { toutVoir: boolean; age: string | null | undefined }): PublicTafsir {
  if (i.toutVoir) return 'tout';
  return i.age === 'adulte' ? 'adulte' : 'eleve';
}

/** La sourate telle que ce public la voit : les segments refusés disparaissent SANS laisser de trace (ni compte, ni identifiant). */
export function filtrerSourate(x: SourateTafsir, pub: PublicTafsir): SourateTafsir {
  if (x.points.every((p) => voit(p.acces, pub))) return x;
  const gardes = x.points.filter((p) => voit(p.acces, pub));
  const ids = new Set(gardes.map((p) => p.id));
  return {
    ...x,
    points: gardes,
    versets: x.versets.map((v) => ({ ...v, p: v.p.filter((i) => ids.has(i)) })),
  };
}
