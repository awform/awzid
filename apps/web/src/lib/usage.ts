/**
 * F5 — tableau d'USAGE SANS TRACEUR, côté appareil : seules des CLÉS d'espaces ou de fonctions (liste fermée)
 * sont envoyées, au plus une fois par jour et par clé, pour la personne connectée ; ni adresse de page, ni
 * heure, ni identifiant d'appareil. Le serveur ne garde que des totaux par jour. Aucun service tiers.
 */
import { USAGE_CLES, type UsageCle } from '@awform/school';

const KEY = 'awzid.usage';
const known = new Set<string>(USAGE_CLES);

interface Etat {
  jour: string;
  /** clés déjà envoyées aujourd'hui, par personne (profil ou compte) */
  envoyees: Record<string, string[]>;
  file: Record<string, string[]>;
}

const today = () => new Date().toISOString().slice(0, 10);

function lire(): Etat {
  try {
    const e = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Etat | null;
    if (e && e.jour === today()) return e;
  } catch {
    /* illisible : on repart de zéro */
  }
  return { jour: today(), envoyees: {}, file: {} };
}
function ecrire(e: Etat) {
  try {
    localStorage.setItem(KEY, JSON.stringify(e));
  } catch {
    /* stockage plein ou indisponible : rien n'est compté */
  }
}

/** Clé d'usage d'un chemin de l'application (null : rien à compter). */
export function cleDeChemin(path: string): UsageCle | null {
  const rules: Array<[RegExp, UsageCle]> = [
    [/^\/$/, 'arabe'],
    [/^\/aujourdhui/, 'accueil'],
    [/^\/lecons\//, 'lecon'],
    [/^\/niveaux\//, 'arabe'],
    [/^\/revisions/, 'revisions'],
    [/^\/lectures/, 'lectures'],
    [/^\/ecriture/, 'ecriture'],
    [/^\/coran\/lecteur/, 'coran_lecteur'],
    [/^\/coran\/ecouter/, 'coran_ecouter'],
    [/^\/coran/, 'coran'],
    [/^\/hifz/, 'hifz'],
    [/^\/sciences/, 'sciences'],
    [/^\/quotidien\/verset/, 'quotidien_verset'],
    [/^\/quotidien/, 'quotidien'],
    [/^\/vivre/, 'vivre'],
    [/^\/(profils|famille|suivi)/, 'famille'],
    [/^\/ma-classe/, 'ma_classe'],
    [/^\/messages/, 'messages'],
    [/^\/hors-ligne/, 'hors_ligne'],
    [/^\/compte/, 'compte'],
    [/^\/certificats/, 'certificats'],
  ];
  for (const [re, k] of rules) if (re.test(path)) return k;
  return null;
}

/** Personne courante (profil actif, sinon « compte » ; null : personne de connecté), posée par la mise en page. */
let courant: string | null = null;
export function usagePour(qui: string | null): void {
  courant = qui;
}
/** Note l'usage d'une FONCTION par la personne courante (tuteur ouvert, animation jouée…). */
export function noter(cle: UsageCle): void {
  noterUsage(cle, courant);
}

/** Note l'usage d'une clé pour une personne (envoi groupé plus tard). */
export function noterUsage(cle: string | null, qui: string | null): void {
  if (!cle || !qui || !known.has(cle) || typeof localStorage === 'undefined') return;
  const e = lire();
  if (e.envoyees[qui]?.includes(cle) || e.file[qui]?.includes(cle)) return;
  (e.file[qui] ??= []).push(cle);
  ecrire(e);
  planifier();
}

let timer: ReturnType<typeof setTimeout> | null = null;
function planifier() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void envoyer();
  }, 20_000);
}

/** Envoie la file (au retour du réseau ou après 20 s) ; une erreur garde la file pour plus tard (même jour). */
export async function envoyer(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const e = lire();
  for (const [qui, cles] of Object.entries(e.file)) {
    if (!cles.length) continue;
    try {
      const r = await fetch('/api/v1/usage', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-awform': '1' },
        credentials: 'same-origin',
        keepalive: true,
        body: JSON.stringify({ ...(qui === 'compte' ? {} : { profil: qui }), cles }),
      });
      if (!r.ok && r.status !== 204) continue;
    } catch {
      continue;
    }
    const now = lire();
    now.envoyees[qui] = [...(now.envoyees[qui] ?? []), ...cles];
    now.file[qui] = (now.file[qui] ?? []).filter((k) => !cles.includes(k));
    ecrire(now);
  }
}
