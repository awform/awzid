/**
 * Madjaliss — progression d'un profil dans un texte : séances faites et séance en cours, gardées sur l'appareil
 * (IndexedDB) et envoyées au serveur par la file hors ligne commune (événement « madjlis » du journal de
 * l'entraînement, `practice_event`, migration 0047). Au retour en ligne, les séances faites sur un autre appareil
 * sont relues (`GET /api/v1/profiles/:id/madjaliss`) et ajoutées : rien n'est jamais retiré.
 */
import { enqueue } from '$lib/attempts';
import { kvGet, kvSet } from '$lib/idb';
import { call } from '$lib/session';

export interface Progres {
  faites: number[];
  /** dernière séance ouverte (null : aucune) */
  ouverte: number | null;
  /** jour où la dernière séance a été faite (attestation) */
  fini?: string;
}

const VIDE: Progres = { faites: [], ouverte: null };
const cle = (pid: string | null, texte: string) => `madjaliss:${pid ?? 'appareil'}:${texte}`;

export function jourLocal(d = new Date()): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export async function lireProgres(pid: string | null, texte: string): Promise<Progres> {
  const p = await kvGet<Progres>(cle(pid, texte)).catch(() => undefined);
  return p ? { ...VIDE, ...p } : { ...VIDE };
}

async function ecrire(pid: string | null, texte: string, p: Progres): Promise<Progres> {
  await kvSet(cle(pid, texte), p).catch(() => {});
  return p;
}

/** Séance en cours : la dernière ouverte si elle n'est pas faite, sinon la première pas encore faite. */
export function seanceEnCours(p: Progres, numeros: readonly number[]): number | null {
  const faites = new Set(p.faites);
  if (p.ouverte !== null && numeros.includes(p.ouverte) && !faites.has(p.ouverte)) return p.ouverte;
  return numeros.find((n) => !faites.has(n)) ?? null;
}

export const toutFait = (p: Progres, numeros: readonly number[]) =>
  numeros.length > 0 && numeros.every((n) => p.faites.includes(n));

export async function ouvrir(pid: string | null, texte: string, n: number): Promise<Progres> {
  const p = await lireProgres(pid, texte);
  return p.ouverte === n ? p : ecrire(pid, texte, { ...p, ouverte: n });
}

/** « Séance faite » : gardée sur l'appareil, puis envoyée (profil connu seulement). */
export async function marquerFaite(
  pid: string | null,
  texte: string,
  n: number,
  details: { quiz: number; sur: number },
): Promise<Progres> {
  const p = await lireProgres(pid, texte);
  const day = jourLocal();
  const faites = p.faites.includes(n) ? p.faites : [...p.faites, n].sort((a, b) => a - b);
  const next = await ecrire(pid, texte, { ...p, faites, fini: day });
  if (pid)
    await enqueue({
      profileId: pid,
      unitId: 'madjaliss',
      eventType: 'madjlis',
      response: { item: `${texte}:${n}`, ok: true, day, details },
    });
  return next;
}

/** Ajoute les séances faites connues du serveur (autre appareil) ; sans réseau, rien ne change. */
export async function fusionnerServeur(pid: string | null, texte: string): Promise<Progres> {
  const p = await lireProgres(pid, texte);
  if (!pid) return p;
  const r = await call<{ faites: string[] }>('GET', `/profiles/${pid}/madjaliss`);
  if (!r.ok || !r.data) return p;
  const serveur = r.data.faites
    .map((x) => /^([a-z0-9-]+):(\d{1,3})$/.exec(x))
    .filter((m): m is RegExpExecArray => !!m && m[1] === texte)
    .map((m) => Number(m[2]));
  const faites = [...new Set([...p.faites, ...serveur])].sort((a, b) => a - b);
  return faites.length === p.faites.length ? p : ecrire(pid, texte, { ...p, faites });
}
