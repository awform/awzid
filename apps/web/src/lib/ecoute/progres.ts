/**
 * Justesse par page et progression de mémorisation par sourate (tarteel-egal-wip, 29/10/2026) — gardées sur l'APPAREIL
 * (IndexedDB), jamais envoyées au serveur. Des NOMBRES par verset seulement (mots reconnus, mots récités, erreurs, jour) :
 * ni audio, ni mot entendu. Module chargé à la demande avec le panneau « Réciter et vérifier » et la carte de khatma
 * (hors de la coquille de l'élève).
 *
 * Définitions (une mesure de MOTS, jamais une note de récitation ni de tajwīd) :
 *  - verset RÉCITÉ SANS ÉCART : tous ses mots récités et reconnus, aucun oublié, changé, ajouté ni dans le désordre, et
 *    aucun mot dans le doute (conservateur : un doute n'est pas compté comme reconnu) ;
 *  - justesse d'une PAGE : mots reconnus / mots récités, sur les versets de la page déjà récités (dernière séance de
 *    chaque verset) ; le nombre de versets récités sur le total de la page est dit à côté ;
 *  - progression d'une SOURATE : versets récités sans écart / versets de la sourate.
 */
import { kvGet, kvSet } from '$lib/idb';
import type { MotAttendu, QuranMeta, ResultatEcoute } from '@awform/hifz';

/** [mots reconnus, mots récités, erreurs, verset entier récité (0|1), jour AAAA-MM-JJ] */
export type Entree = [number, number, number, 0 | 1, string];
/** clé « sourate:verset » */
export type Registre = Record<string, Entree>;

const CLE = (profileId: string) => `ecoute.progres:${profileId}`;

export async function lire(profileId: string): Promise<Registre> {
  return (await kvGet<Registre>(CLE(profileId)).catch(() => undefined)) ?? {};
}

/** Un verset est « récité sans écart » : entier, tout reconnu, aucune erreur. */
export const propre = (e: Entree | undefined): boolean =>
  !!e && e[3] === 1 && e[2] === 0 && e[0] === e[1] && e[1] > 0;

/**
 * Résumé d'une séance (fonction PURE) : une entrée par verset récité. `null` si la machine n'a pas assez bien entendu
 * (rien n'est enregistré). Les mots du début et de la fin non récités ne comptent pas ; un verset sauté compte comme
 * récité avec toutes ses erreurs.
 */
export function resumerSeance(
  att: readonly MotAttendu[],
  r: ResultatEcoute,
  jour: string,
): Registre | null {
  if (r.statut !== 'resultat' || r.debut < 0 || r.finRecitee < r.debut) return null;
  const comptables = att.filter((m) => !m.facultatif && !m.lettres);
  const nbVerset = new Map<string, number>();
  for (const m of comptables)
    nbVerset.set(`${m.s}:${m.a}`, (nbVerset.get(`${m.s}:${m.a}`) ?? 0) + 1);
  const sautes = new Set(
    r.ecarts.filter((e) => e.type === 'verset_saute').map((e) => `${e.s}:${e.a}`),
  );
  const acc = new Map<string, { ok: number; total: number; err: number }>();
  const de = (k: string) => {
    let x = acc.get(k);
    if (!x) acc.set(k, (x = { ok: 0, total: 0, err: 0 }));
    return x;
  };
  for (let i = r.debut; i <= r.finRecitee; i++) {
    const m = att[i];
    if (!m || m.facultatif || m.lettres) continue;
    const k = `${m.s}:${m.a}`;
    const etat = r.mots[i];
    const x = de(k);
    if (etat === 'non_recite' && !sautes.has(k)) continue;
    x.total++;
    if (etat === 'ok') x.ok++;
    else if (etat === 'oublie' || etat === 'remplace' || etat === 'ordre' || etat === 'non_recite')
      x.err++;
  }
  for (const e of r.ecarts) {
    if (e.type !== 'ajoute') continue;
    const m = att[Math.max(0, e.i)];
    if (m) de(`${m.s}:${m.a}`).err++;
  }
  const out: Registre = {};
  for (const [k, x] of acc) {
    if (!x.total) continue;
    const entier = sautes.has(k) || x.total === nbVerset.get(k) ? 1 : 0;
    out[k] = [x.ok, x.total, x.err, entier, jour];
  }
  return Object.keys(out).length ? out : null;
}

/** Fusion : la dernière séance l'emporte, sauf un verset PARTIEL qui ne remplace jamais un verset entier déjà récité. */
export function fusionner(reg: Registre, nouv: Registre): Registre {
  const out: Registre = { ...reg };
  for (const [k, e] of Object.entries(nouv)) {
    const avant = out[k];
    if (avant && avant[3] === 1 && e[3] === 0) continue;
    out[k] = e;
  }
  return out;
}

/** Enregistre une séance sur l'appareil ; renvoie le registre à jour (et les entrées de la séance). */
export async function garderSeance(
  profileId: string,
  att: readonly MotAttendu[],
  r: ResultatEcoute,
  jour: string,
): Promise<{ registre: Registre; seance: Registre } | null> {
  const seance = resumerSeance(att, r, jour);
  if (!seance) return null;
  const registre = fusionner(await lire(profileId), seance);
  await kvSet(CLE(profileId), registre).catch(() => {});
  return { registre, seance };
}

// ------------------------------------------------------------------ pages et sourates (métadonnées du Muṣḥaf)

const nbVersets = (meta: QuranMeta, s: number) => meta.weights[s - 1]?.length ?? 0;

/** Versets (sourate, verset) qui COMMENCENT sur une page du Muṣḥaf de Médine (1 à 604). */
export function versetsDePage(meta: QuranMeta, page: number): Array<[number, number]> {
  const pages = meta.divisions?.pages;
  const debut = pages?.[page - 1];
  if (!pages || !debut) return [];
  const fin = pages[page]; // début de la page suivante (undefined : dernière page)
  const out: Array<[number, number]> = [];
  let [s, a] = debut as [number, number];
  while (s <= meta.weights.length) {
    if (fin && (s > fin[0] || (s === fin[0] && a >= fin[1]))) break;
    out.push([s, a]);
    a++;
    if (a > nbVersets(meta, s)) {
      s++;
      a = 1;
    }
  }
  return out;
}

/** Page d'un verset (dernier début de page qui ne dépasse pas le verset), ou null. */
export function pageDe(meta: QuranMeta, s: number, a: number): number | null {
  const pages = meta.divisions?.pages;
  if (!pages) return null;
  let p = 0;
  for (let i = 0; i < pages.length; i++) {
    const [ps, pa] = pages[i]!;
    if (ps < s || (ps === s && pa <= a)) p = i + 1;
    else break;
  }
  return p || null;
}

export interface LignePage {
  page: number;
  /** 0 à 100 : mots reconnus / mots récités */
  justesse: number;
  /** versets de la page déjà récités / versets de la page */
  recites: number;
  total: number;
}

/** Justesse des pages touchées par des versets du registre (ou seulement `pages`). */
export function lignesPages(
  reg: Registre,
  meta: QuranMeta,
  pages?: readonly number[],
): LignePage[] {
  const cibles =
    pages ??
    [
      ...new Set(
        Object.keys(reg)
          .map((k) => k.split(':').map(Number) as [number, number])
          .map(([s, a]) => pageDe(meta, s, a))
          .filter((p): p is number => p !== null),
      ),
    ].sort((x, y) => x - y);
  const out: LignePage[] = [];
  for (const page of cibles) {
    const vs = versetsDePage(meta, page);
    let ok = 0;
    let total = 0;
    let recites = 0;
    for (const [s, a] of vs) {
      const e = reg[`${s}:${a}`];
      if (!e) continue;
      recites++;
      ok += e[0];
      total += e[1];
    }
    if (!recites || !total) continue;
    out.push({ page, justesse: Math.round((100 * ok) / total), recites, total: vs.length });
  }
  return out;
}

export interface LigneSourate {
  s: number;
  /** versets récités sans écart */
  propres: number;
  /** versets de la sourate */
  total: number;
  /** 0 à 100 */
  pct: number;
}

/** Progression de mémorisation des sourates dont au moins un verset a été récité sans écart (ou `sourates`). */
export function lignesSourates(
  reg: Registre,
  meta: QuranMeta,
  sourates?: readonly number[],
): LigneSourate[] {
  const propres = new Map<number, number>();
  for (const [k, e] of Object.entries(reg))
    if (propre(e)) {
      const s = Number(k.split(':')[0]);
      propres.set(s, (propres.get(s) ?? 0) + 1);
    }
  const cibles = sourates ?? [...propres.keys()].sort((x, y) => x - y);
  return cibles
    .map((s) => {
      const total = nbVersets(meta, s);
      const n = propres.get(s) ?? 0;
      return { s, propres: n, total, pct: total ? Math.floor((100 * n) / total) : 0 };
    })
    .filter((l) => l.total > 0 && l.propres > 0);
}

/**
 * Synchronisation avec la khatma : à partir de `depuis` (première page pas encore lue du plan), première page qui n'a PAS
 * été entièrement récitée sans écart. Supérieur à `depuis` : les pages d'avant ont été récitées, la carte de khatma le
 * PROPOSE (jamais de force, comme pour la dernière lecture).
 */
export function pageApresRecitation(
  reg: Registre,
  meta: QuranMeta,
  depuis: number,
  jusqua: number,
): number {
  let p = depuis;
  while (p <= jusqua) {
    const vs = versetsDePage(meta, p);
    if (!vs.length || !vs.every(([s, a]) => propre(reg[`${s}:${a}`]))) break;
    p++;
  }
  return p;
}

/** Justesse des pages de la part du jour (lecture du jour de la khatma) déjà récitées, ou null. */
export function justessePartDuJour(
  reg: Registre,
  meta: QuranMeta,
  pages: readonly [number, number],
): { justesse: number; pages: number } | null {
  const l = lignesPages(
    reg,
    meta,
    Array.from({ length: pages[1] - pages[0] + 1 }, (_, i) => pages[0] + i),
  );
  if (!l.length) return null;
  return {
    justesse: Math.round(l.reduce((s, x) => s + x.justesse, 0) / l.length),
    pages: l.length,
  };
}

/** Réécoute de « ma récitation » : seulement un compte ADULTE (enfant et ado : jamais). */
export const reecoutePermise = (kind: string, enfant: boolean): boolean =>
  kind === 'adulte' && !enfant;
