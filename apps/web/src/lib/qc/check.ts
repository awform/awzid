/**
 * Livrets « Lecture du Coran » (qc1 à qc3, lot 28) : affichage des crochets de couleur et correction SUR
 * L'APPAREIL des exercices d'entraînement (les corrigés viennent du livret, comme le guide papier ; jamais de
 * note). Bilans et examens : aucun corrigé n'arrive sur l'appareil (D7), l'adulte corrige avec le guide.
 * Fonctions pures, testées.
 */

export interface QcSegment {
  text: string;
  /** crochet du livret : '' (lettre étudiée) ou famille de règle (g, m, m4, m6, q, t, w, x) */
  mark: string | null;
}

/** Découpe `أَحَ[دٌ] [g:مِنْ]` en segments ; le texte n'est jamais modifié (on retire seulement les crochets). */
export function qcSegments(s: string): QcSegment[] {
  const out: QcSegment[] = [];
  const re = /\[(?:([gmqtxw]\d?):)?([^\]]*)\]/g;
  let last = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push({ text: s.slice(last, m.index), mark: null });
    out.push({ text: m[2] ?? '', mark: m[1] ?? '' });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last), mark: null });
  return out;
}

/** Couleur d'une famille de règle (jetons existants c0 à c3) : allongements, nasalisation, rebond, autres. */
export function markColor(mark: string): number {
  if (mark.startsWith('m')) return 0;
  if (mark === 'q') return 1;
  if (mark === 'g') return 2;
  return 3;
}

/** Texte sans crochets (mêmes règles que le contrôle d'import). */
export function qcPlain(s: string): string {
  return s.replace(/\[(?:[gmqtxw]\d?:)?/g, '').replace(/\]/g, '');
}

/** Mots d'un extrait (le signe de fin de verset ۝ n'est pas un mot). */
export function qcWords(s: string): string[] {
  return qcPlain(s)
    .split(' ')
    .filter((w) => w && w !== '۝');
}

/** Réponse à choix : indice (paire, QCM) ou valeur (durée, règle, arrêt, complète) ; QCM : texte d'option accepté. */
export function choiceOk(
  item: { reponse?: unknown; options?: unknown[] },
  choice: number | string,
): boolean {
  const r = item.reponse;
  if (r === undefined || r === null) return false;
  if (typeof r === 'number')
    return typeof choice === 'number' ? r === choice : String(r) === String(choice);
  if (typeof choice === 'number' && item.options) return String(item.options[choice]) === String(r);
  return String(r) === String(choice);
}

/** Cible d'une chasse / d'un repérage : « بت » (chaque lettre) ou « لٓ,مٓ » (groupes séparés par des virgules). */
export function targets(cible: string): string[] {
  return /[,\s]/.test(cible)
    ? cible.split(/[,\s]+/).filter(Boolean)
    : [...cible].filter((c) => !/[ً-ٰٟۖ-ۭ]/.test(c));
}

/** Cases d'une grille « chasse » qui portent la lettre cherchée. */
export function chasseTargets(grille: readonly string[], cible: string): number[] {
  return grille.map((g, i) => (g === cible ? i : -1)).filter((i) => i >= 0);
}

/**
 * Mots à toucher dans un « repérer » : `reponse` du livret (rangs à partir de 1) s'il existe, sinon les mots
 * qui contiennent une des cibles (règle de qc-check.ps1).
 */
export function repererExpected(
  item: { ar?: string; reponse?: unknown; cible?: string },
  cible: string,
): number[] {
  if (Array.isArray(item.reponse)) return (item.reponse as number[]).map((n) => n - 1);
  const cc = targets(item.cible ?? cible);
  return qcWords(item.ar ?? '')
    .map((w, i) => (cc.some((c) => w.includes(c)) ? i : -1))
    .filter((i) => i >= 0);
}

/** Ensemble touché = ensemble attendu. */
export function sameSet(a: readonly number[], b: readonly number[]): boolean {
  const A = new Set(a);
  return A.size === new Set(b).size && b.every((x) => A.has(x));
}

/** « ordre » : syllabes (ou mots) touchées dans l'ordre = le mot du livret. */
export function ordreOk(
  item: { mots?: string[]; phrase?: string },
  order: readonly number[],
): boolean {
  const mots = item.mots ?? [];
  if (order.length !== mots.length || !item.phrase) return false;
  const parts = order.map((i) => mots[i] ?? '');
  return parts.join('') === item.phrase || parts.join(' ') === item.phrase;
}
