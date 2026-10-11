/**
 * D1 — « Ma séance du jour » enchaîne leçon → mots → hifẓ. Le plan de la séance est gardé pour l'onglet en
 * cours seulement (sessionStorage) : chaque étape propose la suivante (« Continuer ma séance »).
 */
export type EtapeSeance = { k: 'lecon' | 'mots' | 'hifz'; href: string };
const KEY = 'awzid.seance';

export function demarrerSeance(plan: EtapeSeance[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(plan));
  } catch {
    /* stockage indisponible : la séance reste faisable étape par étape depuis l'accueil */
  }
}

export function planSeance(): EtapeSeance[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? (v as EtapeSeance[]) : [];
  } catch {
    return [];
  }
}

/** Étape qui suit `ici` dans la séance en cours (null : pas de séance, ou dernière étape). */
export function etapeSuivante(ici: EtapeSeance['k']): EtapeSeance | null {
  const p = planSeance();
  const i = p.findIndex((e) => e.k === ici);
  return i >= 0 ? (p[i + 1] ?? null) : null;
}
