/**
 * A39 « mode serein » — façon d'avancer d'un élève, gardée sur l'appareil (aucune dépendance : lue aussi par la
 * page de leçon, la plus lourde). Une note chiffrée ne s'affiche qu'« avec vérification » ; jamais en défi doux
 * (défaut des enfants et ados) ni en mode serein.
 */
export type Mode = 'verification' | 'douce' | 'serein';
const KEY = 'awz-mode:';

/** Dernier mode connu d'un profil ; à défaut, celui de son type (adulte : vérification ; mineur : douce). */
export function modeLocal(pid: string, kind?: string): Mode {
  try {
    const m = localStorage.getItem(KEY + pid);
    if (m === 'verification' || m === 'douce' || m === 'serein') return m;
  } catch {
    /* stockage indisponible */
  }
  return kind === 'adulte' ? 'verification' : 'douce';
}

export function setModeLocal(pid: string, m: Mode | undefined) {
  try {
    if (m) localStorage.setItem(KEY + pid, m);
  } catch {
    /* stockage indisponible */
  }
}

export const showsScore = (pid: string, kind: string) => modeLocal(pid, kind) === 'verification';
