/**
 * Cahier de lecture (20/10/2026) — données d'un cahier (`/cahier-data/<niveau>.json`, généré par
 * scripts/cahier-donnees.mjs depuis la source unique packages/content/data/cahier/<niveau>.json). Hors ligne d'abord :
 * la copie de l'appareil (IndexedDB) est lue tout de suite ; le réseau la remplace quand il répond (nouvelle version).
 * L'arabe n'est jamais modifié ici : il est affiché tel quel.
 */
import { kvGet, kvSet } from '$lib/idb';

/** nature de l'audio : s syllabe, t mot ou phrase, k contrôle renforcé (nom d'Allah, hā' du pronom), q récitation */
export type Audio = 's' | 't' | 'k' | 'q';
export interface El {
  ar: string;
  a: Audio;
  /** mise en couleur : [début, longueur, classe] (classe « cible » ou « muet ») */
  c?: Array<[number, number, string]>;
  /** étiquette française (position, difficulté contrôlée) */
  d?: string;
  /** page de rattrapage d'un mot de bilan */
  r?: string;
  /** référence coranique d'un élément récité (sourate:verset) */
  ref?: string;
  /** lettres séparées (« je lis séparé, puis lié ») */
  sep?: string[];
  /** leçon d'apprentissage d'une lettre (alphabet) */
  lecon?: string;
}
export interface Rang {
  titre?: string;
  note?: string;
  lettre?: string;
  lecon?: string;
  el: El[];
}
export interface AtelierMot {
  lettres: string[];
  cases: Array<{ lettre: string; signe: string; choix: boolean }>;
  squelette: string;
  solution: string;
  syllabes: string[];
}
export interface Bloc {
  type: string;
  titre: string;
  note?: string;
  consigne?: string;
  basmala?: string;
  el: Array<El | Rang | { p: [El, El] } | AtelierMot>;
}
export interface Page {
  id: string;
  num: number;
  titre: string;
  partie: string;
  type: string;
  apres: string;
  /** numéro du fichier de leçon après lequel la page se lit (0 : avant la leçon 1) */
  n: number;
  lecon: string | null;
  consigne: string;
  cases: number;
  hors?: boolean;
  guide?: string[];
  notes?: string[];
  critere?: { reussite: string; seuil: number; echec: string };
  seuil?: { unite: string; minimum: number; objectif: number };
  renvoi?: string;
  blocs: Bloc[];
  /** `recite` : lignes qui citent le Coran (garde du générateur) → récitation (référence) ou sans son (« ») */
  texte?: {
    titre?: string;
    lignes: string[];
    nb: number;
    a: Audio;
    recite?: Record<string, string>;
  };
}
export interface Cahier {
  format: 1;
  niveau: string;
  titre: string;
  version: string;
  genere: string;
  rattrapage: Record<string, string>;
  pages: Page[];
}

export const urlDonnees = (niveau: string) => `/cahier-data/${encodeURIComponent(niveau)}.json`;
export const cleDonnees = (niveau: string) => `cahier-data:${niveau}`;

/** Télécharge le cahier et le garde sur l'appareil (téléchargement du niveau, première ouverture). */
export async function garderCahier(
  niveau: string,
  fetchFn: typeof fetch = fetch,
): Promise<Cahier | null> {
  try {
    const r = await fetchFn(urlDonnees(niveau), { cache: 'no-cache' });
    if (!r.ok) return null;
    const c = (await r.json()) as Cahier;
    if (c.format !== 1 || !Array.isArray(c.pages)) return null;
    await kvSet(cleDonnees(niveau), c).catch(() => {});
    return c;
  } catch {
    return null;
  }
}

/**
 * Cahier d'un niveau : copie de l'appareil d'abord (hors ligne), sinon le réseau. `nouveau` reçoit la version du
 * réseau si elle diffère de la copie (mise à jour silencieuse).
 */
export async function chargerCahier(
  niveau: string,
  nouveau?: (c: Cahier) => void,
  fetchFn: typeof fetch = fetch,
): Promise<Cahier | null> {
  const local = await kvGet<Cahier>(cleDonnees(niveau)).catch(() => undefined);
  if (local?.format === 1) {
    void garderCahier(niveau, fetchFn).then((c) => {
      if (c && (c.version !== local.version || c.genere !== local.genere)) nouveau?.(c);
    });
    return local;
  }
  return garderCahier(niveau, fetchFn);
}

export const estRang = (x: unknown): x is Rang => !!x && Array.isArray((x as Rang).el);
export const estPaire = (x: unknown): x is { p: [El, El] } =>
  !!x && Array.isArray((x as { p?: unknown }).p);
export const estAtelier = (x: unknown): x is AtelierMot =>
  !!x && Array.isArray((x as AtelierMot).cases);

/** Éléments lus d'un bloc, dans l'ordre de lecture, avec leur clé d'affichage (`b.i`, `b.r.i`, `b.i.0`…). */
export function elementsDuBloc(b: Bloc, bi: number): Array<{ cle: string; el: El }> {
  const out: Array<{ cle: string; el: El }> = [];
  if (b.type === 'atelier_mot') return out;
  b.el.forEach((x, i) => {
    if (estRang(x)) x.el.forEach((e, j) => out.push({ cle: `${bi}.${i}.${j}`, el: e }));
    else if (estPaire(x)) x.p.forEach((e, j) => out.push({ cle: `${bi}.${i}.${j}`, el: e }));
    else {
      const e = x as El;
      e.sep?.forEach((s, j) => out.push({ cle: `${bi}.${i}.s${j}`, el: { ar: s, a: 's' } }));
      out.push({ cle: `${bi}.${i}`, el: e });
    }
  });
  if (b.basmala) out.unshift({ cle: `${bi}.b`, el: { ar: b.basmala, a: 'q', ref: basmalaRef(b) } });
  return out;
}

/** Basmala affichée au-dessus d'une sourate : récitée avec le premier verset de la sourate (1:1). */
function basmalaRef(b: Bloc): string | undefined {
  const v = b.el[0] as El | undefined;
  return v?.ref ? '1:1' : undefined;
}

/** Ligne d'un texte suivi : synthèse, sauf une citation du Coran (récitée, ou sans son). */
export function ligneTexte(t: NonNullable<Page['texte']>, i: number): El {
  const r = t.recite?.[String(i)];
  if (r === undefined) return { ar: t.lignes[i]!, a: t.a };
  return { ar: t.lignes[i]!, a: 'q', ...(r ? { ref: r } : {}) };
}

/** Tous les éléments lus d'une page (lecture guidée), texte suivi compris (titre, puis chaque ligne). */
export function elementsDeLaPage(p: Page): Array<{ cle: string; el: El }> {
  const out = p.blocs.flatMap((b, i) => elementsDuBloc(b, i));
  if (p.texte) {
    if (p.texte.titre) out.push({ cle: 't.t', el: { ar: p.texte.titre, a: p.texte.a } });
    p.texte.lignes.forEach((_, i) => out.push({ cle: `t.${i}`, el: ligneTexte(p.texte!, i) }));
  }
  return out;
}

/** Leçon atteinte : la plus avancée des unités terminées ou maîtrisées (`ad1.l05` → 5) ; null si inconnue. */
export function leconAtteinte(statuts: Record<string, string> | null): number | null {
  if (!statuts) return null;
  let n = 0;
  for (const [id, s] of Object.entries(statuts)) {
    const m = /\.l(\d+)$/.exec(id);
    if (m && (s === 'terminee' || s === 'maitrisee')) n = Math.max(n, Number(m[1]));
  }
  return n;
}
