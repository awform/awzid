/** V2-2 : un enseignant sans aucune classe (second facteur déjà vérifié) voit d'abord « Créer ma classe ». */
export function doitCreerMaClasse(etat: {
  charge: boolean;
  enseignant: boolean;
  bloque: boolean;
  classes: number;
}): boolean {
  return etat.charge && etat.enseignant && !etat.bloque && etat.classes === 0;
}
