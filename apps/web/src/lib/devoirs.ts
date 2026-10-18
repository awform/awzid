/**
 * Devoirs de la classe côté élève : libellé HUMAIN (titre de la leçon ou du petit livre donné par l'API, jamais un
 * identifiant brut comme « en1.l03 ») et filtre de cohérence : un profil adulte ne voit pas les leçons des filières
 * enfants, ados ou religion des enfants ; un enfant ne voit pas celles des adultes.
 */
import { t } from './i18n';
import { levelParts } from './levels';

export interface DevoirBrut {
  kind: string;
  target: string;
  label: string;
  titleFr?: string | null;
}

/** Faux si la leçon donnée en devoir appartient à une filière qui ne convient pas à ce profil. */
export function devoirConvient(profileKind: string | null | undefined, d: DevoirBrut): boolean {
  const piste = d.kind === 'lecon' ? levelParts(d.target.split('.')[0]!)?.track : null;
  if (!piste) return true;
  return profileKind === 'adulte'
    ? !['enfants', 'ados', 'religion'].includes(piste)
    : profileKind !== 'enfant' || !['adultes', 'religion_ra'].includes(piste);
}

/** Texte à afficher pour un devoir de leçon, de petit livre ou de hifẓ. */
export function libelleDevoir(d: DevoirBrut): string {
  if (d.kind === 'hifz') return t('auj.devoir_hifz', { passage: d.label });
  const k = d.kind === 'lecon' ? 'auj.devoir_lecon' : 'auj.devoir_lecture';
  return d.titleFr ? t(k, { titre: d.titleFr }) : t(`${k}_seule`);
}
