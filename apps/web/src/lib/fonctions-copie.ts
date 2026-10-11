/**
 * F5 — copie des décisions d'interrupteurs gardée sur l'appareil (par personne : profil actif ou « compte »),
 * pour le hors ligne ; logique pure, testée (`fonctions.test.ts`), utilisée par `fonctions.svelte.ts`.
 */
import { fonctionsParDefaut, type Canal, type FonctionCle } from '@awform/school';

export const COPIE_KEY = 'awzid.fonctions';
/** copie COURTE : redemandée au serveur au plus toutes les 5 minutes */
export const COPIE_TTL_MS = 5 * 60_000;
const MAX_PERSONNES = 12;

export interface Copie {
  at: number;
  fonctions: Record<string, boolean>;
  canal: Canal;
}

function toutes(): Record<string, Copie> {
  try {
    return JSON.parse(localStorage.getItem(COPIE_KEY) ?? '{}') as Record<string, Copie>;
  } catch {
    return {};
  }
}

export function lireCopie(qui: string): Copie | null {
  return toutes()[qui] ?? null;
}

export function ecrireCopie(qui: string, c: Copie): void {
  try {
    const all = toutes();
    all[qui] = c;
    // au plus 12 personnes gardées (appareil partagé, tablette de classe) : les plus récentes
    const keys = Object.keys(all).sort((a, b) => all[b]!.at - all[a]!.at);
    for (const k of keys.slice(MAX_PERSONNES)) delete all[k];
    localStorage.setItem(COPIE_KEY, JSON.stringify(all));
  } catch {
    /* stockage indisponible : la décision reste en mémoire */
  }
}

/** Décision complète : copie du serveur, sinon valeurs sûres du registre (clé inconnue de la copie : défaut). */
export function decisionDe(c: Copie | null): Record<FonctionCle, boolean> {
  const v = fonctionsParDefaut(c?.canal ?? 'production');
  if (c)
    for (const k of Object.keys(v) as FonctionCle[])
      if (typeof c.fonctions[k] === 'boolean') v[k] = c.fonctions[k];
  return v;
}

export const copieFraiche = (c: Copie | null, now = Date.now()) => !!c && now - c.at < COPIE_TTL_MS;
