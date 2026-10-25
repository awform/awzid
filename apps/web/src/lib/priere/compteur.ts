/**
 * « La prière de A à Z » — logique PURE du compteur d'après la prière (33 · 33 · 33, plus la phrase qui fait cent) : un
 * toucher compte une fois ; la série finie, on passe à la suivante ; on peut annuler un toucher ou recommencer. Les nombres
 * viennent du livre (« 33 fois »), jamais d'ici.
 */
export interface EtatCompteur {
  /** série en cours */
  et: number;
  /** touchers de la série en cours */
  n: number;
  /** touchers faits par série */
  faits: number[];
}

export const etatInitial = (series: number): EtatCompteur => ({
  et: 0,
  n: 0,
  faits: Array.from({ length: series }, () => 0),
});

/** Un toucher : rien de plus quand la série est finie ; `fin` dit que ce toucher la termine. */
export function toucher(
  s: EtatCompteur,
  fois: readonly number[],
): { etat: EtatCompteur; fin: boolean } {
  const max = fois[s.et] ?? 1;
  if (s.n >= max) return { etat: s, fin: false };
  const n = s.n + 1;
  const faits = s.faits.slice();
  faits[s.et] = n;
  return { etat: { et: s.et, n, faits }, fin: n === max };
}

/** Après la rosette : la série suivante, au point où elle en était (ou à zéro si elle était finie). */
export function suivante(s: EtatCompteur, fois: readonly number[]): EtatCompteur {
  if (s.et >= fois.length - 1) return s;
  return aller(s, s.et + 1, fois);
}

/** Annule le dernier toucher de la série en cours. */
export function annuler(s: EtatCompteur): EtatCompteur {
  if (s.n <= 0) return s;
  const faits = s.faits.slice();
  faits[s.et] = s.n - 1;
  return { et: s.et, n: s.n - 1, faits };
}

/** Va à une série : reprend où elle en était, ou repart de zéro si elle était finie. */
export function aller(s: EtatCompteur, k: number, fois: readonly number[]): EtatCompteur {
  const fait = s.faits[k] ?? 0;
  return { et: k, n: fait >= (fois[k] ?? 1) ? 0 : fait, faits: s.faits };
}

/** Touchers faits sur les séries qui comptent pour la centaine. */
export const totalFait = (s: EtatCompteur, dansCentaine: readonly boolean[]): number =>
  s.faits.reduce((a, f, k) => a + (dansCentaine[k] ? f : 0), 0);
