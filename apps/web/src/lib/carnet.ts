/**
 * Carnet de pratique et suivi des sourates (lot 22) : appels à l'API. Les lignes du carnet et la liste des
 * sourates viennent des livres, par le serveur ; la signature du parent est vérifiée par le serveur.
 */
import { localIso } from './hifz';
import { call } from './session';

export interface CarnetState {
  id: string;
  jours: number;
  lignes: Array<{ ar: string; fr: string }>;
  cases: Array<[number, number]>;
  signe: string | null;
}
export interface SuraRow {
  sura: number;
  niveau: string;
  etape: 'ecoute' | 'repete' | 'recite' | 'valide' | null;
}

/** Lundi (AAAA-MM-JJ) de la semaine d'un jour local, décalé de `back` semaines. */
export function mondayLocal(d = new Date(), back = 0): string {
  const day = (d.getDay() + 6) % 7;
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day - 7 * back, 12);
  return localIso(m);
}

export const unitOfExercise = (exerciseId: string) => exerciseId.replace(/\.ex\d+$/, '');

export const loadCarnets = (profileId: string, unit: string, week: string) =>
  call<{ semaine: string; carnets: CarnetState[] }>(
    'GET',
    `/profiles/${profileId}/carnet?unit=${encodeURIComponent(unit)}&week=${week}`,
  );
export const checkBox = (
  profileId: string,
  exerciseId: string,
  b: { week: string; line: number; day: number; checked: boolean },
) =>
  call<Pick<CarnetState, 'cases' | 'signe'>>(
    'PUT',
    `/profiles/${profileId}/carnet/${exerciseId}`,
    b,
  );
export const signWeek = (profileId: string, exerciseId: string, week: string, pin: string) =>
  call<Pick<CarnetState, 'cases' | 'signe'>>(
    'POST',
    `/profiles/${profileId}/carnet/${exerciseId}/signer`,
    { week },
    { 'x-parent-pin': pin },
  );
export const loadSuras = (profileId: string) =>
  call<{ sourates: SuraRow[] }>('GET', `/profiles/${profileId}/sourates`);
export const setSuraStep = (
  profileId: string,
  sura: number,
  etape: 'ecoute' | 'repete' | 'recite',
) => call('PUT', `/profiles/${profileId}/sourates/${sura}`, { etape });
export const classSuras = (classId: string) =>
  call<{
    sourates: Array<{ sura: number; niveau: string }>;
    eleves: Array<{ profileId: string; pseudonym: string; suivi: SuraRow[] }>;
  }>('GET', `/ecole/classes/${classId}/sourates`);
export const validateSura = (classId: string, profileId: string, sura: number) =>
  call('POST', `/ecole/classes/${classId}/eleves/${profileId}/sourates/${sura}/valider`, {});
