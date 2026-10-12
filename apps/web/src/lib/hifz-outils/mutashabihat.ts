/**
 * Hifẓ complet — MUTASHĀBIHĀT (versets proches, que l'on confond en récitant) : STRUCTURE SEULEMENT.
 *
 * AUCUNE donnée n'est écrite ici par l'équipe ni générée : la liste viendra d'une SOURCE SAVANTE VÉRIFIÉE (ouvrage
 * de référence nommé, validé par le référent religieux), importée comme les autres contenus gelés. Tant qu'elle
 * est vide, aucune alerte « verset proche de… » n'est montrée.
 */

export interface RefVerset {
  s: number;
  a: number;
}

/** Une paire de versets proches, avec la référence savante qui l'atteste (obligatoire). */
export interface Mutashabih {
  a: RefVerset;
  b: RefVerset;
  /** ouvrage de référence (titre, auteur, édition, page) — jamais vide */
  source: string;
}

/** Liste VIDE à dessein (voir l'en-tête) ; elle sera remplie par l'import de la source vérifiée. */
export const MUTASHABIHAT: readonly Mutashabih[] = [];

/** Versets proches d'un verset (dans les deux sens de chaque paire), seulement pour des paires sourcées. */
export function prochesDe(
  s: number,
  a: number,
  liste: readonly Mutashabih[] = MUTASHABIHAT,
): RefVerset[] {
  const out: RefVerset[] = [];
  for (const m of liste) {
    if (!m.source.trim()) continue;
    if (m.a.s === s && m.a.a === a) out.push(m.b);
    else if (m.b.s === s && m.b.a === a) out.push(m.a);
  }
  return out;
}
