/** Tableau de bord « école » (suite V1-b) : synthèse des classes de l'enseignant, calculée par le serveur. */
import { call } from './session';

export interface ClassSummary {
  id: string;
  nom: string;
  niveau: string | null;
  ecole: string | null;
  eleves: number;
  elevesApplication: number;
  elevesPapier: number;
  actifs7j: number;
  tauxActivite: number | null;
  devoirsEnCours: number;
  copiesACorriger: number;
  certificats: number;
  recitalsPublies: number;
}
export type Totaux = Omit<ClassSummary, 'id' | 'nom' | 'niveau' | 'ecole' | 'tauxActivite'> & {
  classes: number;
};

export const loadSynthese = () =>
  call<{ classes: ClassSummary[]; totaux: Totaux }>('GET', '/ecole/synthese');
