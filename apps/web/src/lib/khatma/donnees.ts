/**
 * Khatma et wird (26/10/2026) — échanges avec le serveur et copie locale (hors ligne). L'avancement écrit hors ligne est
 * gardé sur l'appareil et envoyé au retour du réseau ; le serveur garde toujours le plus avancé (deux appareils ne
 * s'écrasent jamais).
 */
import { loadMeta, localIso } from '$lib/hifz';
import { kvGet, kvSet } from '$lib/idb';
import { call } from '$lib/session';
import type { PartVue, PlanVue } from './plan';

export interface Groupe {
  parts: number;
  terminees: number;
  pagesLues: number;
  pagesTotal: number;
}
export interface PlanApi extends PlanVue {
  id: string;
  title: string | null;
  reminderHour: number | null;
  doneAt: string | null;
  /** je suis le responsable du plan (créateur) */
  responsable: boolean;
  classId: string | null;
  part: PartVue & { sura: number | null; aya: number | null; finished: boolean };
  groupe: Groupe | null;
}
export interface Etat {
  plans: PlanApi[];
  serein: boolean;
  rappel: boolean;
  limites: { joursMax: number; pagesParJourMax: number };
}
export interface Attente {
  done: number;
  day: string;
  sura?: number | null;
  aya?: number | null;
  corrige?: boolean;
}

const CLE_PLANS = (p: string) => `khatma.plans:${p}`;
const CLE_ATTENTE = (p: string) => `khatma.attente:${p}`;

/** Avancement en attente d'envoi (par plan), le dernier écrit l'emporte ; vide hors usage. */
async function attente(profileId: string): Promise<Record<string, Attente>> {
  return (
    (await kvGet<Record<string, Attente>>(CLE_ATTENTE(profileId)).catch(() => undefined)) ?? {}
  );
}

/** Envoie ce qui attend (au retour du réseau) ; renvoie ce qui reste. */
export async function envoyerAttente(profileId: string): Promise<number> {
  const file = await attente(profileId);
  for (const [id, a] of Object.entries(file)) {
    const r = await call('PUT', `/profiles/${profileId}/khatma/${id}/progression`, a);
    // réseau coupé : on garde ; refus définitif (plan archivé, jour invalide…) : on abandonne cette entrée
    if (r.status === 0) continue;
    delete file[id];
  }
  await kvSet(CLE_ATTENTE(profileId), file).catch(() => {});
  return Object.keys(file).length;
}

/** Plans du profil : serveur d'abord, sinon la dernière copie (marquée `hors`). */
export async function charger(
  profileId: string,
): Promise<{ etat: Etat | null; hors: boolean; code: string | null }> {
  await envoyerAttente(profileId).catch(() => 0);
  const r = await call<Etat>('GET', `/profiles/${profileId}/khatma`);
  if (r.ok && r.data) {
    await kvSet(CLE_PLANS(profileId), r.data).catch(() => {});
    return { etat: r.data, hors: false, code: null };
  }
  if (r.status === 0) {
    const copie = await kvGet<Etat>(CLE_PLANS(profileId)).catch(() => undefined);
    // l'avancement écrit hors ligne est déjà dans la copie (voir `enregistrer`)
    return { etat: copie ?? null, hors: true, code: 'reseau' };
  }
  return { etat: null, hors: false, code: r.code };
}

/**
 * Enregistre l'avancement d'une part. Hors ligne : gardé en attente ET appliqué à la copie locale (l'écran montre le
 * résultat tout de suite). Renvoie le plan mis à jour (serveur) ou null (en attente).
 */
export async function enregistrer(
  profileId: string,
  plan: PlanApi,
  a: Attente,
): Promise<{ plan: PlanApi | null; code: string | null }> {
  const r = await call<{ plan: PlanApi }>(
    'PUT',
    `/profiles/${profileId}/khatma/${plan.id}/progression`,
    a,
  );
  if (r.ok && r.data) return { plan: r.data.plan, code: null };
  if (r.status !== 0) return { plan: null, code: r.code };
  const file = await attente(profileId);
  file[plan.id] = a;
  await kvSet(CLE_ATTENTE(profileId), file).catch(() => {});
  const copie = await kvGet<Etat>(CLE_PLANS(profileId)).catch(() => undefined);
  if (copie) {
    const p = copie.plans.find((x) => x.id === plan.id);
    if (p) {
      if (p.part.dayMark !== a.day) {
        p.part.dayMark = a.day;
        p.part.doneDayStart = p.part.done;
      }
      p.part.done = a.corrige ? a.done : Math.max(p.part.done, a.done);
      p.part.sura = a.sura ?? p.part.sura;
      p.part.aya = a.aya ?? p.part.aya;
      await kvSet(CLE_PLANS(profileId), copie).catch(() => {});
    }
  }
  return { plan: null, code: 'reseau' };
}

/** Début (sourate, verset) d'une page du Muṣḥaf de Médine, d'après les métadonnées gardées sur l'appareil. */
export async function debutDePage(page: number): Promise<[number, number] | null> {
  const m = await loadMeta().catch(() => null);
  return m?.divisions?.pages[page - 1]
    ? ([...m.divisions.pages[page - 1]!] as [number, number])
    : null;
}

/** Page d'un verset (dernier début de page qui ne dépasse pas le verset), ou null. */
export async function pageDeVerset(s: number, a: number): Promise<number | null> {
  const m = await loadMeta().catch(() => null);
  const pages = m?.divisions?.pages;
  if (!pages) return null;
  let p = 0;
  for (let i = 0; i < pages.length; i++) {
    const [ps, pa] = pages[i]!;
    if (ps < s || (ps === s && pa <= a)) p = i + 1;
    else break;
  }
  return p || null;
}

export const aujourdhui = () => localIso();

export async function creerPersonnel(profileId: string, body: object) {
  return call<{ plan: PlanApi }>('POST', `/profiles/${profileId}/khatma`, body);
}
export async function modifier(profileId: string, planId: string, body: object) {
  return call<{ plan: PlanApi }>('PATCH', `/profiles/${profileId}/khatma/${planId}`, body);
}
export async function creerFamille(body: object) {
  return call<{ id: string; parts: number }>('POST', '/khatma/famille', body);
}
/**
 * Rappel quotidien du compte. L'activer exige l'accord donné sur l'écran de consentement (`accord: true`) ; pour un
 * enfant, le code parent (s'il existe) part dans l'en-tête, comme pour les autres accords de la famille.
 * L'arrêter ne demande rien.
 */
export async function rappelCompte(
  actif: boolean,
  opts: { accord?: boolean; profileId?: string; pin?: string } = {},
) {
  return call<{ ok: boolean }>(
    'PUT',
    '/khatma/rappel',
    actif ? { actif, accord: opts.accord === true, profileId: opts.profileId } : { actif },
    opts.pin ? { 'x-parent-pin': opts.pin } : undefined,
  );
}
export interface Suivi {
  id: string;
  title: string | null;
  status: string;
  endDate: string | null;
  groupe: Groupe;
  /** profils du groupe sans part (une part peut leur être confiée) */
  disponibles: Array<{ profileId: string; pseudonym: string }>;
  serein: boolean;
  membres: Array<{
    profileId: string;
    pseudonym: string;
    firstPage: number;
    lastPage: number;
    terminee: boolean;
    done?: number;
  }>;
}
export async function suivi(planId: string) {
  return call<Suivi>('GET', `/khatma/${planId}/suivi`);
}
export async function confier(planId: string, de: string, vers: string) {
  return call<{ ok: boolean }>('POST', `/khatma/${planId}/confier`, { de, vers });
}
export async function archiver(planId: string) {
  return call<{ ok: boolean }>('DELETE', `/khatma/${planId}`);
}

export interface ClasseEtat {
  khatmas: Array<{
    id: string;
    title: string | null;
    startDate: string;
    endDate: string | null;
    status: string;
    groupe: Groupe;
  }>;
  serein: boolean;
  eleves: number;
}
export async function khatmasDeClasse(classId: string) {
  return call<ClasseEtat>('GET', `/ecole/classes/${classId}/khatma`);
}
export async function creerClasse(classId: string, body: object) {
  return call<{ id: string; parts: number }>('POST', `/ecole/classes/${classId}/khatma`, body);
}
