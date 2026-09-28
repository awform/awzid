/**
 * Projections (cahier des charges §5.4) — première version : projection « élève — entraînement ».
 * Retire tout ce qui ne doit jamais atteindre un appareil d'élève :
 *  - `tr` (translittération latine, jamais affichée : REGLES §4) ;
 *  - `guide` et tous les champs `*guide_fr` (guide de l'enseignant) ;
 *  - `sources_fr` (sources du guide) ;
 *  - `parents_fr`, `travail_perso_fr` (espace parent / adulte).
 * Les réponses des exercices d'ENTRAÎNEMENT restent (correction hors ligne, comme le corrigé du guide papier).
 * Les projections « épreuve », « parent », « enseignant » et « publique » viendront avec leurs lots.
 */

const STUDENT_DROP_KEYS = new Set(['tr', 'guide', 'sources_fr', 'parents_fr', 'travail_perso_fr']);

function isDropped(key: string): boolean {
  return STUDENT_DROP_KEYS.has(key) || key === 'guide_fr' || key.endsWith('_guide_fr');
}

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!isDropped(k)) out[k] = strip(v);
    }
    return out;
  }
  return value;
}

/**
 * Projection élève (entraînement) d'une leçon : copie profonde sans les champs réservés.
 * Bilan ou examen : la traduction des versets n'est jamais envoyée (CDC §3.1, moteur `lectureBilan`).
 */
export function studentProjection<T>(lesson: T): T {
  const out = strip(lesson) as T;
  const L = out as { type?: unknown; coran?: { versets?: Array<Record<string, unknown>> } };
  if ((L.type === 'bilan' || L.type === 'examen') && Array.isArray(L.coran?.versets)) {
    for (const v of L.coran.versets) delete v.fr;
  }
  return out;
}

/** Liste des chemins interdits encore présents (test de non-fuite). */
export function forbiddenPaths(value: unknown, path = '$'): string[] {
  const found: string[] = [];
  if (Array.isArray(value))
    value.forEach((v, i) => found.push(...forbiddenPaths(v, `${path}[${i}]`)));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isDropped(k)) found.push(`${path}.${k}`);
      found.push(...forbiddenPaths(v, `${path}.${k}`));
    }
  }
  return found;
}
