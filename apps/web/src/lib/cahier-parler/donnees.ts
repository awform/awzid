/**
 * Cahier « Je parle » (24/10/2026) — données d'un cahier (`/cahier-data/parler-<niveau>.json`, généré par
 * scripts/cahier-parler-donnees.mjs depuis la source unique packages/content/data/cahier-parler/<niveau>.json) et
 * progression gardée SUR L'APPAREIL (IndexedDB, par profil). Hors ligne d'abord : la copie de l'appareil est lue tout
 * de suite ; le réseau la remplace quand il répond (nouvelle version). L'arabe n'est jamais modifié ici.
 */
import { kvGet, kvSet } from '$lib/idb';

/** une forme dite : arabe, traduction, étiquette « à qui je parle » (à un homme, à une femme, à un groupe…) */
export interface Forme {
  ar: string;
  fr: string;
  u?: string;
}
export interface Phrase extends Forme {
  theme: string;
  /** la forme pour un homme, puis pour une femme (phrases adressées ou dites par un homme ou une femme) */
  f?: Forme[];
}
export interface Replique {
  q: 'A' | 'B';
  ar: string;
  fr: string;
}
export interface Conversation {
  titre: string;
  theme: string;
  A: string;
  B: string;
  r: Replique[];
  /** consigne de jeu de rôle du tuteur (français, avec des formes arabes entre guillemets) */
  consigne: string;
}
export type TypePage = 'cartes' | 'conversation' | 'tuteur' | 'revision' | 'bilan';
export interface PageParler {
  id: string;
  type: TypePage;
  titre: string;
  refs: string[];
}
export interface Etape {
  id: string;
  partie: number;
  /** leçon du livre après laquelle l'étape se travaille (0 : avant la leçon 1) */
  n: number;
  pages: PageParler[];
  picto: string;
  /** fin de partie (révisions, situation libre, bilan) ou grille finale */
  fin?: boolean;
  num?: number;
  theme?: string;
  titre?: string;
  accroche?: string;
  jour?: Forme;
  /** antisèche : [arabe, français], 8 à 16 lignes */
  antiseche?: Array<[string, string]>;
}
export interface Partie {
  n: number;
  nom: string;
  lecons: string;
}
export interface CahierParler {
  format: 1;
  niveau: string;
  titre: string;
  version: string;
  genere: string;
  antiseche_ar: string;
  themes: Record<string, string>;
  parties: Partie[];
  etapes: Etape[];
  phrases: Record<string, Phrase>;
  conversations: Record<string, Conversation>;
}

export const urlParler = (niveau: string) =>
  `/cahier-data/parler-${encodeURIComponent(niveau)}.json`;
export const cleParler = (niveau: string) => `cahier-data:parler-${niveau}`;

const valide = (c: unknown): c is CahierParler =>
  !!c &&
  (c as CahierParler).format === 1 &&
  Array.isArray((c as CahierParler).etapes) &&
  !!(c as CahierParler).phrases;

/** Télécharge le cahier et le garde sur l'appareil (première ouverture). */
export async function garderParler(
  niveau: string,
  fetchFn: typeof fetch = fetch,
): Promise<CahierParler | null> {
  try {
    const r = await fetchFn(urlParler(niveau), { cache: 'no-cache' });
    if (!r.ok) return null;
    const c: unknown = await r.json();
    if (!valide(c)) return null;
    await kvSet(cleParler(niveau), c).catch(() => {});
    return c;
  } catch {
    return null;
  }
}

/** Cahier d'un niveau : copie de l'appareil d'abord (hors ligne), sinon le réseau ; `nouveau` reçoit une version plus récente. */
export async function chargerParler(
  niveau: string,
  nouveau?: (c: CahierParler) => void,
  fetchFn: typeof fetch = fetch,
): Promise<CahierParler | null> {
  const local = await kvGet<CahierParler>(cleParler(niveau)).catch(() => undefined);
  if (valide(local)) {
    void garderParler(niveau, fetchFn).then((c) => {
      if (c && (c.version !== local.version || c.genere !== local.genere)) nouveau?.(c);
    });
    return local;
  }
  return garderParler(niveau, fetchFn);
}

/** Formes affichées d'une phrase : la forme pour un homme puis pour une femme, sinon la phrase seule. */
export const formes = (p: Phrase): Forme[] =>
  p.f ?? [{ ar: p.ar, fr: p.fr, ...(p.u ? { u: p.u } : {}) }];

/** Phrases utiles d'un scénario du tuteur : les premières répliques de la conversation (4 au plus). */
export const phrasesUtiles = (c: Conversation): Replique[] => c.r.slice(0, 4);

/** marqueurs des formes arabes retirées d'une consigne française : ①, ②… */
const MARQUE = (i: number) => String.fromCharCode(0x2460 + i);
const AR = /[؀-ۿ]/;
/** une suite arabe : lettres, signes, espaces et ponctuation (…، ؟ ! .) entre deux lettres arabes */
const SUITE = /[؀-ۿ](?:[؀-ۿ\s…!.]*[؀-ۿ…])?/g;

/**
 * Consigne de jeu de rôle sur deux plans (règle de l'application : jamais d'arabe sur la ligne du français) : le
 * français, où chaque forme arabe est remplacée par un marqueur (①, ②…), puis les formes arabes, chacune sur sa ligne.
 * L'arabe est recopié tel quel.
 */
export function decouperConsigne(s: string): { fr: string; ar: Array<{ m: string; ar: string }> } {
  const ar: Array<{ m: string; ar: string }> = [];
  const marquer = (x: string) => {
    const m = MARQUE(ar.length);
    ar.push({ m, ar: x.trim() });
    return m;
  };
  const fr = s
    .replace(/«\s*([^»]*?)\s*»/g, (tout, x: string) => (AR.test(x) ? marquer(x) : tout))
    .replace(SUITE, (x) => marquer(x))
    .replace(/\(\s*([①-⑳])\s*\)/g, '$1');
  return { fr, ar };
}

// ------------------------------------------------------------------ progression (appareil)

export type Avis = 'oui' | 'presque' | 'non';
export interface ProgresParler {
  /** 6 cases des cartes de phrases : 0-2 avec le modèle, 3-5 seul */
  cases: Record<string, boolean[]>;
  /** auto-évaluation des bilans : page → référence → avis */
  bilans: Record<string, Record<string, Avis>>;
}
export const progresVide = (): ProgresParler => ({ cases: {}, bilans: {} });
export const cleProgres = (niveau: string, profil: string | null | undefined) =>
  `parler:${niveau}:${profil || 'appareil'}`;

export async function lireProgres(
  niveau: string,
  profil: string | null | undefined,
): Promise<ProgresParler> {
  const p = await kvGet<ProgresParler>(cleProgres(niveau, profil)).catch(() => undefined);
  return { ...progresVide(), ...(p ?? {}) };
}
export async function ecrireProgres(
  niveau: string,
  profil: string | null | undefined,
  p: ProgresParler,
): Promise<void> {
  // copie simple : les objets réactifs de Svelte ne se rangent pas tels quels dans IndexedDB
  await kvSet(cleProgres(niveau, profil), JSON.parse(JSON.stringify(p)) as ProgresParler).catch(
    () => {},
  );
}

/** Étape franchie : toutes ses cartes de phrases ont leurs 6 cases cochées. */
export function etapeFranchie(e: Etape, p: ProgresParler): boolean {
  const cartes = e.pages.filter((x) => x.type === 'cartes');
  return (
    cartes.length > 0 && cartes.every((x) => (p.cases[x.id] ?? []).filter(Boolean).length === 6)
  );
}

/** Thèmes d'un bilan et thèmes réussis (toutes leurs lignes à « oui ») : une étoile par thème. */
export function etoiles(
  c: CahierParler,
  page: PageParler,
  p: ProgresParler,
): Array<{ theme: string; reussi: boolean }> {
  const avis = p.bilans[page.id] ?? {};
  const parTheme = new Map<string, boolean>();
  for (const r of page.refs) {
    const th = c.phrases[r]?.theme ?? c.conversations[r]?.theme;
    if (!th) continue;
    parTheme.set(th, (parTheme.get(th) ?? true) && avis[r] === 'oui');
  }
  return [...parTheme].map(([theme, reussi]) => ({ theme, reussi }));
}
