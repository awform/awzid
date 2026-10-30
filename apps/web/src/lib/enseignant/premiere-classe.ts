/**
 * V2-2 : un enseignant SANS ÉCOLE et sans aucune classe (second facteur déjà vérifié) voit d'abord « Créer ma
 * classe ». Rattaché à une école, c'est l'école qui lui attribue sa classe : l'écran n'est pas proposé.
 */
export function doitCreerMaClasse(etat: {
  charge: boolean;
  enseignant: boolean;
  bloque: boolean;
  classes: number;
  /** écoles du compte (`personal` : l'espace personnel créé pour un enseignant indépendant) */
  ecoles?: ReadonlyArray<{ personal: boolean }>;
}): boolean {
  const rattache = (etat.ecoles ?? []).some((e) => !e.personal);
  return etat.charge && etat.enseignant && !etat.bloque && etat.classes === 0 && !rattache;
}
