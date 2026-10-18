/**
 * Consignes des livres, adaptées à l'APPLICATION (le livre papier est conçu pour une classe : « L'enseignant(e) dit… »).
 * Dans l'appli, c'est le fichier audio qui dit ou lit. Seul le sujet de la phrase change ; le reste de la consigne
 * est affiché tel quel. Les livres gelés ne sont jamais modifiés.
 */
const ENSEIGNANT_DIT =
  /\b(?:[Ll]'|[Mm]on )enseignant(?:\(e\))?(?: \((?:ou l'audio|ou l’audio)\))? (dit|lit)\b/g;

export function consigneAppli(fr: string): string {
  return fr.replace(ENSEIGNANT_DIT, (_m, verbe: string) => `L'audio ${verbe}`);
}
