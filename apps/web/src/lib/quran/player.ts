/**
 * Lot 27 — logique de lecture de l'espace Coran (fonctions pures, testées dans player.test.ts) :
 * file d'écoute (répétition du verset, de la plage, nombre de fois), méthode « écouter, répéter, enchaîner »
 * du mode Mémoriser, masquage progressif du texte (le texte Tanzil n'est JAMAIS modifié : seul l'affichage
 * de chaque mot est voilé), règles de riwāya.
 */

export interface ListenOptions {
  from: number;
  to: number;
  /** nombre d'écoutes de chaque verset (1 à 20) */
  repeatVerse: number;
  /** nombre de passages sur toute la plage (1 à 20) */
  repeatRange: number;
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Math.round(Number.isFinite(n) ? n : lo)));

/** Suite des versets à jouer en mode Écouter. */
export function listenQueue(o: ListenOptions): number[] {
  const from = Math.max(1, Math.round(o.from));
  const to = Math.max(from, Math.round(o.to));
  const rv = clamp(o.repeatVerse, 1, 20);
  const rr = clamp(o.repeatRange, 1, 20);
  const out: number[] = [];
  for (let r = 0; r < rr; r++)
    for (let a = from; a <= to; a++) for (let k = 0; k < rv; k++) out.push(a);
  return out;
}

export interface ChainStep {
  aya: number;
  /** « nouveau » : le verset qu'on apprend ; « enchainer » : reprise depuis le début de la plage */
  kind: 'nouveau' | 'enchainer';
  /** verset en cours d'apprentissage (pour l'affichage « verset 3 sur 7 ») */
  learning: number;
}

/**
 * Mémoriser (méthode « écouter, répéter, enchaîner ») : chaque nouveau verset est écouté `repeatNew` fois,
 * puis toute la plage apprise jusqu'ici est enchaînée `repeatChain` fois.
 */
export function chainQueue(o: {
  from: number;
  to: number;
  repeatNew: number;
  repeatChain: number;
}): ChainStep[] {
  const from = Math.max(1, Math.round(o.from));
  const to = Math.max(from, Math.round(o.to));
  const rn = clamp(o.repeatNew, 1, 20);
  const rc = clamp(o.repeatChain, 0, 10);
  const out: ChainStep[] = [];
  for (let i = from; i <= to; i++) {
    for (let k = 0; k < rn; k++) out.push({ aya: i, kind: 'nouveau', learning: i });
    if (i > from)
      for (let k = 0; k < rc; k++)
        for (let a = from; a <= i; a++) out.push({ aya: a, kind: 'enchainer', learning: i });
  }
  return out;
}

/**
 * Masquage progressif (0 à 3) des mots d'un verset : 0 tout visible ; 1 la première moitié ; 2 le premier
 * mot (amorce) ; 3 rien. Renvoie, pour chaque mot, s'il reste visible.
 */
export function visibleWords(count: number, level: number): boolean[] {
  const l = clamp(level, 0, 3);
  const keep = l === 0 ? count : l === 1 ? Math.ceil(count / 2) : l === 2 ? Math.min(1, count) : 0;
  return Array.from({ length: count }, (_, i) => i < keep);
}

/** Riwāya de référence des carnets et du texte affiché (Tanzil). */
export const HAFS = 'hafs';
export const isHafs = (riwaya: string | null | undefined) => riwaya === HAFS;

/**
 * Le surlignage verset par verset n'est permis que si la récitation suit la numérotation du texte affiché
 * (Ḥafṣ) : une autre riwāya a une autre numérotation, son verset n ne correspond pas au verset n de Ḥafṣ.
 */
export function canHighlight(r: { riwaya: string; surlignage?: string }): boolean {
  return isHafs(r.riwaya) && r.surlignage !== 'sans_surlignage';
}

/** Mémoriser un carnet de Ḥafṣ : seulement avec une récitation en Ḥafṣ. */
export function canMemorize(r: { riwaya: string }): boolean {
  return isHafs(r.riwaya);
}

/** Vitesse de lecture permise (0,5 à 1,5 ; la hauteur de la voix est conservée par le lecteur). */
export function clampRate(r: number): number {
  return Math.max(0.5, Math.min(1.5, Math.round((Number.isFinite(r) ? r : 1) * 4) / 4));
}

/** Minuterie d'arrêt : minutes proposées (0 : sans minuterie). */
export const SLEEP_CHOICES = [0, 5, 10, 15, 30, 45, 60] as const;

/** Libellé « 1:23 » d'une durée en millisecondes. */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

/** Plage d'une portion du carnet (« 2:1-5, 2:6-10 ») → sourate et versets, si elle tient dans une sourate. */
export function portionRange(label: string | null): { s: number; from: number; to: number } | null {
  if (!label) return null;
  const parts = [...label.matchAll(/(\d+):(\d+)-(\d+)/g)].map((m) => ({
    s: Number(m[1]),
    from: Number(m[2]),
    to: Number(m[3]),
  }));
  if (!parts.length || parts.some((p) => p.s !== parts[0]!.s)) return parts[0] ?? null;
  return {
    s: parts[0]!.s,
    from: Math.min(...parts.map((p) => p.from)),
    to: Math.max(...parts.map((p) => p.to)),
  };
}
