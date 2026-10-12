/**
 * Madjaliss (P3-1) — données d'un texte (matn) : fichier statique `/mutun/<texte>.json` construit par
 * `scripts/madjaliss.mjs` depuis les seules sources du référent (rien n'est rédigé dans l'application). Chargé À LA
 * DEMANDE (jamais préchargé par le service worker), puis gardé sur l'appareil (IndexedDB) au premier usage : le
 * texte s'étudie ensuite hors ligne. Les notes du mode enseignant (`/mutun/<texte>-enseignant.json` : variantes,
 * vocalisations « à vérifier », mots au sens non établi) ne sont chargées qu'en mode enseignant, en ligne.
 */
import { kvGet, kvSet } from '$lib/idb';

/** Morceau du texte arabe : texte de l'auteur, ou mots du Coran cités (sous-chaîne exacte de Tanzil). */
export type Segment = string | { q: string; ref: string };

export interface Phrase {
  id: string;
  t: 'texte' | 'titre' | 'formule' | 'citation_coran' | 'citation_hadith';
  /** toujours « VALIDATION_HUMAINE_REQUISE » avant la relecture savante */
  statut: string;
  ar?: string | Segment[];
  fr?: string;
  /** sens du verset cité, dans la traduction de référence de l'application */
  sens?: { ref: string; texte: string; source: string };
  /** passage montré seulement avec son explication (T7) : ni arabe ni traduction tant qu'elle manque */
  explication?: true;
  /** vocalisation ou lecture à vérifier (détail en mode enseignant) : jamais une question « compléter » */
  incertain?: true;
  /** note d'explication du référent (avis retenu, règle pour les familles), montrée sous la phrase */
  note?: NoteExplication;
}

export interface NoteExplication {
  texte: string;
  sources?: string[];
  /** citations arabes des commentaires, chacune affichée sur sa propre ligne */
  ar?: string[];
}

export interface Mot {
  ar: string;
  fr: string;
}

export interface Seance {
  n: number;
  id: string;
  titre: string;
  duree: number;
  phrases: string[];
  mots: Mot[];
  /** règles et lochies : proposées aux ados et aux adultes seulement */
  pudeur?: true;
}

export interface Matn {
  v: number;
  id: string;
  version: string;
  statut: string;
  oeuvre: string;
  traduction: string;
  phrases: Phrase[];
  seances: Seance[];
}

export interface NotesEnseignant {
  version: string;
  decoupage: string;
  phrases: Array<{
    id: string;
    a_verifier: string[];
    variantes: Array<Record<string, string>>;
    /** choix de traduction du référent (précision pédagogique pour l'enseignant) */
    traduction?: string;
    /** citations arabes qui fondent ce choix */
    ar?: string[];
  }>;
  mots: Array<{ n: number; ar: string; fr: string; motif: 'sens' | 'explication' }>;
}

export const segments = (p: Phrase): Segment[] =>
  p.ar === undefined ? [] : typeof p.ar === 'string' ? [p.ar] : p.ar;

/** Texte arabe d'une phrase sans citation coranique (null sinon) : seul texte qui se masque ou se complète. */
export const arSimple = (p: Phrase): string | null => (typeof p.ar === 'string' ? p.ar : null);

/**
 * GARDE de la voix de synthèse (T7) : seul texte qu'une voix de synthèse pourrait un jour lire. Jamais une phrase qui
 * cite le Coran (segment Tanzil : le Coran n'est jamais lu par une machine), jamais un passage réservé à
 * l'explication de l'enseignant ; null sinon. Aujourd'hui la rubrique n'a aucune voix de synthèse (enregistrements
 * humains attendus) : tout futur branchement DOIT passer par ici.
 */
export const texteVoixSynthese = (p: Phrase): string | null =>
  p.explication || /[﴿﴾]/.test(arSimple(p) ?? '﴿') ? null : arSimple(p);

type Fetcher = (url: string) => Promise<Response>;
const enCours = new Map<string, Promise<Matn | null>>();

/**
 * Texte d'un matn : copie de l'appareil si elle existe (affichage immédiat, hors ligne), mise à jour en arrière-plan
 * depuis le réseau ; sinon le réseau, gardé ensuite. null : jamais ouvert et pas de réseau.
 */
export function chargerMatn(id: string, f: Fetcher = (u) => fetch(u)): Promise<Matn | null> {
  let p = enCours.get(id);
  if (!p) {
    p = charger(id, f).finally(() => enCours.delete(id));
    enCours.set(id, p);
  }
  return p;
}

async function charger(id: string, f: Fetcher): Promise<Matn | null> {
  const cle = `mutun:${id}`;
  const garde = await kvGet<Matn>(cle).catch(() => undefined);
  const reseau = f(`/mutun/${encodeURIComponent(id)}.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Matn>) : null))
    .catch(() => null)
    .then(async (m) => {
      if (m && m.version !== garde?.version) await kvSet(cle, m).catch(() => {});
      return m;
    });
  if (garde) {
    void reseau;
    return garde;
  }
  return reseau;
}

/** Notes du mode enseignant (en ligne seulement, jamais gardées sur l'appareil d'un élève). */
export async function chargerNotes(
  id: string,
  f: Fetcher = (u) => fetch(u),
): Promise<NotesEnseignant | null> {
  return f(`/mutun/${encodeURIComponent(id)}-enseignant.json`)
    .then((r) => (r.ok ? (r.json() as Promise<NotesEnseignant>) : null))
    .catch(() => null);
}

export const phraseDe = (m: Matn) => new Map(m.phrases.map((p) => [p.id, p]));

/** Séances proposées à un profil : sans les chapitres réservés aux ados et adultes pour un enfant. */
export const seancesPour = (m: Matn, enfant: boolean): Seance[] =>
  enfant ? m.seances.filter((s) => !s.pudeur) : m.seances;
