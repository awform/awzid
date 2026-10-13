/**
 * Madjaliss (P3-1) — données d'un texte (matn) : fichier statique `/mutun/<texte>.json` construit par
 * `scripts/madjaliss.mjs` depuis les seules sources du référent (rien n'est rédigé dans l'application). Chargé À LA
 * DEMANDE (jamais préchargé par le service worker : un texte à la fois, à son ouverture), puis gardé sur l'appareil
 * (IndexedDB) au premier usage : le texte s'étudie ensuite hors ligne. Les notes du mode enseignant
 * (`/mutun/<texte>-enseignant.json` : variantes, vocalisations « à vérifier », choix de traduction, passages à relire)
 * ne sont chargées qu'en mode enseignant, en ligne. Format commun aux textes en prose (phrases) et en vers
 * (deux hémistiches `h`).
 */
import { kvGet, kvSet } from '$lib/idb';

/** Morceau du texte arabe : texte de l'auteur, ou mots du Coran cités (sous-chaîne exacte de Tanzil). */
export type Segment = string | { q: string; ref: string };

export interface Sens {
  ref: string;
  texte: string;
  source: string;
}

export interface NoteExplication {
  texte: string;
  sources?: string[];
  /** citations arabes des commentaires, chacune affichée sur sa propre ligne */
  ar?: string[];
  /** versets cités par le commentateur (Tanzil), chacun sur sa ligne */
  q?: Array<{ q: string; ref: string }>;
}

export interface Ligne {
  ar: string;
  fr: string;
}

export interface Phrase {
  id: string;
  t: 'texte' | 'titre' | 'formule' | 'citation_coran' | 'citation_hadith' | 'vers' | 'vers_titre';
  ar?: string | Segment[];
  /** vers d'un poème : les deux hémistiches, chacun sur sa ligne */
  h?: [string, string];
  fr?: string;
  /** sens du ou des versets cités, dans la traduction de référence de l'application */
  sens?: Sens[];
  /** passage montré seulement avec son explication (T7) : ni arabe ni traduction tant qu'elle manque */
  explication?: true;
  /** vocalisation ou lecture à vérifier (détail en mode enseignant) : jamais une question « compléter » */
  incertain?: true;
  /** réservé au niveau adulte (ni enfants ni ados) */
  adulte?: true;
  /** intertitre arabe de l'éditeur, avant ce vers */
  titre?: string;
  /** listes et exemples du matn (Ājurrūmiyya), chacun sur sa ligne */
  liste?: Ligne[];
  exemples?: Ligne[];
  /** notes d'explication du référent (avis retenu, règle pour les familles), montrées sous la phrase */
  notes?: NoteExplication[];
}

export interface Mot {
  ar: string;
  fr: string;
}

export interface Renvoi {
  texte: string;
  n: number;
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
  /** réservée au niveau adulte */
  adulte?: true;
  /** ne compte pas pour l'attestation d'étude */
  facultatif?: true;
  /** même sujet dans un autre texte (renvois du référent) */
  renvois?: Renvoi[];
}

/** Code visuel de la grammaire (Ājurrūmiyya) : soulignements et formes, aucune couleur du tajwīd. */
export interface CodeVisuel {
  etats: Array<{
    cas: string;
    ar: string;
    style: 'plein' | 'double' | 'ondule' | 'tirete';
    signe: string;
    aide: string;
  }>;
  regles: string[];
}

export interface Matn {
  v: number;
  id: string;
  version: string;
  /** EN_ATTENTE_SECONDE_LECTURE (l'ancien libellé VALIDATION_HUMAINE_REQUISE est accepté pendant la migration) */
  statut: string;
  oeuvre: string;
  code?: CodeVisuel;
  phrases: Phrase[];
  seances: Seance[];
}

export interface NotesEnseignant {
  version: string;
  statut?: string;
  decoupage: string;
  /** décision du référent sur la publication (séances à retenir) */
  publication?: string;
  /** séances à relire par le comité */
  comite?: Array<{ n: number; id: string; motif: string }>;
  phrases: Array<{
    id: string;
    a_verifier: string[];
    variantes: Array<Record<string, string>>;
    /** choix de traduction du référent (précision pédagogique pour l'enseignant) */
    traduction?: string;
    decision?: string;
    notes_internes?: string[];
    /** citations arabes qui fondent ce choix */
    ar?: string[];
  }>;
  mots: Array<{ n: number; ar: string; fr: string; motif: 'sens' | 'explication' }>;
}

export const segments = (p: Phrase): Segment[] =>
  p.ar === undefined ? [] : typeof p.ar === 'string' ? [p.ar] : p.ar;

/**
 * Texte arabe d'une phrase sans citation coranique (null sinon) : seul texte qui se masque ou se complète. Un vers :
 * ses deux hémistiches à la suite.
 */
export const arSimple = (p: Phrase): string | null =>
  typeof p.ar === 'string' ? p.ar : p.h ? p.h.join(' ') : null;

/**
 * GARDE de la voix de synthèse (T7) : seul texte qu'une voix de synthèse pourrait un jour lire. Jamais une phrase qui
 * cite le Coran (segment Tanzil : le Coran n'est jamais lu par une machine), jamais un passage réservé à
 * l'explication de l'enseignant ; null sinon. Aujourd'hui la rubrique n'a aucune voix de synthèse (enregistrements
 * humains attendus) : tout futur branchement DOIT passer par ici.
 */
export const texteVoixSynthese = (p: Phrase): string | null =>
  p.explication || /[﴿﴾]/.test(arSimple(p) ?? '﴿') || typeof p.ar === 'object' ? null : arSimple(p);

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
  // une copie gardée avant ce format (v1) est ignorée : le réseau la remplace
  if (garde && garde.v >= 2) {
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

export type Public = 'enfant' | 'ado' | 'adulte';

/**
 * Le texte tel que le voit un profil (mécanisme des profils : `kind` enfant / ado / adulte) :
 *  - les chapitres des règles et des lochies (`pudeur`) : ados et adultes seulement ;
 *  - les séances et phrases `adulte` (niveau_min « adulte ») : adultes seulement, jamais aux enfants ni aux ados.
 * Un profil inconnu (null) est traité comme un ado : jamais de contenu réservé aux adultes sans profil adulte.
 */
export function matnPour(m: Matn, kind: Public | null): Matn {
  const adulte = kind === 'adulte';
  const enfant = kind === 'enfant';
  const cache = new Set(adulte ? [] : m.phrases.filter((p) => p.adulte).map((p) => p.id));
  const seances = m.seances
    .filter((s) => (adulte || !s.adulte) && (!enfant || !s.pudeur))
    .map((s) => (adulte ? s : { ...s, phrases: s.phrases.filter((id) => !cache.has(id)) }));
  const vues = new Set(seances.flatMap((s) => s.phrases));
  return { ...m, phrases: m.phrases.filter((p) => vues.has(p.id)), seances };
}

/** Séances proposées à un profil (voir `matnPour`). */
export const seancesPour = (m: Matn, kind: Public | null): Seance[] => matnPour(m, kind).seances;
