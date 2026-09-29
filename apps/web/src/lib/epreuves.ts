/** Épreuves notées (lot 19) : types partagés par la carte « Épreuves » et la page de passage. */
export interface EpreuveFamille {
  id: string;
  unitId: string;
  titleFr: string | null;
  bareme: number;
  opensAt: string;
  closesAt: string;
  etat: 'a_venir' | 'ouverte' | 'envoyee' | 'notee' | 'fermee';
  score: number | null;
  remediation: boolean;
  aRevoir: Array<{ id: string; numLecon: number | null; titleFr: string }>;
}

/** Réponses d'une copie : exercice → item → réponse (même forme que l'entraînement). */
export type ExamAnswers = Record<string, Record<string, unknown>>;
