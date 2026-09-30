/**
 * Récital de hifẓ (suite V1-b, CDC §2.6-6) : appels à l'API. Le tirage au sort et la note sont faits par le
 * serveur (barème du carnet) ; ici, rien n'est calculé qui compte.
 */
import { call } from './session';

export type Parcours = 'socle' | 'renforce';
export interface Passage {
  passage: string;
  libelle: string;
}
export interface Compteurs {
  aides: number;
  hesitations: number;
  sauts: number;
  oublis: number;
  claires: number;
  discretes: number;
  fluidite: number;
}
export interface RecitalNote {
  memorisation: number;
  tajwid: number;
  fluidite: number;
  total: number;
  mention: string;
  validation: 'oui' | 'provisoire' | 'non';
  coran15: number;
}
export interface RecitalEntry {
  id: string;
  pupilId: string;
  parcours: Parcours;
  tires: Passage[];
  choix: Passage | null;
  compteurs: Compteurs | null;
  note: RecitalNote | null;
  secondJury: boolean;
}
export interface ClassRecital {
  id: string;
  titre: string;
  jour: string;
  carnet: string;
  publie: string | null;
  annule: string | null;
  choixPossibles: Passage[];
  passages: RecitalEntry[];
}
export interface FamilyRecital {
  id: string;
  titre: string;
  jour: string;
  classe: string;
  publie: boolean;
  passages: Passage[];
  resultat: Pick<RecitalNote, 'total' | 'mention' | 'validation' | 'coran15'> | null;
}

export const COMPTEURS = [
  'aides',
  'hesitations',
  'sauts',
  'oublis',
  'claires',
  'discretes',
  'fluidite',
] as const;

export const emptyCounters = (): Compteurs => ({
  aides: 0,
  hesitations: 0,
  sauts: 0,
  oublis: 0,
  claires: 0,
  discretes: 0,
  fluidite: 4,
});

/** Passages que l'élève peut encore choisir : ceux du carnet qui n'ont pas été tirés. */
export function choicesLeft(all: Passage[], e: Pick<RecitalEntry, 'tires'>): Passage[] {
  const drawn = new Set(e.tires.map((x) => x.passage));
  return all.filter((x) => !drawn.has(x.passage));
}

export const classRecitals = (classId: string) =>
  call<{ eleves: Array<{ id: string; nom: string }>; recitals: ClassRecital[] }>(
    'GET',
    `/ecole/classes/${classId}/recitals`,
  );
export const planRecital = (classId: string, b: { titre: string; jour: string }) =>
  call<{ recital: { id: string } }>('POST', `/ecole/classes/${classId}/recitals`, b);
export const drawFor = (recitalId: string, pupilId: string, parcours: Parcours) =>
  call<{ passage: RecitalEntry }>('POST', `/ecole/recitals/${recitalId}/tirages`, {
    pupilId,
    parcours,
  });
export const scoreEntry = (
  recitalId: string,
  entryId: string,
  b: { choix: string | null; compteurs: Compteurs; secondJury: boolean },
) => call<{ passage: RecitalEntry }>('PUT', `/ecole/recitals/${recitalId}/tirages/${entryId}`, b);
export const publishRecital = (recitalId: string) =>
  call<{ publie: string; validations: number }>('POST', `/ecole/recitals/${recitalId}/publier`, {});
export const cancelRecital = (recitalId: string) =>
  call('POST', `/ecole/recitals/${recitalId}/annuler`, {});
export const familyRecitals = (profileId: string) =>
  call<{ recitals: FamilyRecital[] }>('GET', `/profiles/${profileId}/recitals`);
