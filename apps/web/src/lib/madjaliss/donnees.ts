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

/**
 * Texte français avec ses mots arabes isolés : chaque marqueur `{ar:K}` est remplacé, à l'affichage, par le mot arabe
 * n° K de `ma` (vocalisé, avec la police arabe : voir `avecArabe`). Jamais de phonétique latine côté élève.
 */
export interface Texte {
  texte: string;
  ma?: string[];
}

export interface NoteExplication {
  texte: string;
  /** mots arabes des marqueurs `{ar:K}` de `texte` */
  ma?: string[];
  /** nature de la note : écart avec un commentateur, note de l'école mālikite, degré d'un hadith cité */
  k?: 'ecart' | 'malikite' | 'degre';
  sources?: string[];
  /** citations arabes des commentaires, chacune affichée sur sa propre ligne */
  ar?: string[];
  /** versets cités par le commentateur (Tanzil), chacun sur sa ligne */
  q?: Array<{ q: string; ref: string }>;
}

/** Version du recueil d'un hadith, montrée SOUS le texte d'an-Nawawī (jamais à sa place), avec ses différences. */
export interface VersionRecueil {
  /** recueil, numéro du texte montré, tome et page de l'imprimé */
  r: string;
  ar: string;
  d?: Texte[];
}

/** Hadith d'an-Nawawī : mention de takhrīj, degré (« authenticité discutée : … », juge nommé), versions du recueil. */
export interface Hadith {
  tk?: { ar: string; fr: Texte };
  deg: Texte;
  v?: VersionRecueil[];
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
  /** mots arabes des marqueurs `{ar:K}` de `fr` */
  ma?: string[];
  /** versets cités dans le matn d'un hadith (Tanzil), chacun sur sa ligne : jamais lus par une voix de synthèse */
  q?: Array<{ q: string; ref: string }>;
  /** hadith d'an-Nawawī : takhrīj, degré, versions du recueil */
  hadith?: Hadith;
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
  /** mots arabes des marqueurs `{ar:K}` de `titre` */
  tma?: string[];
  duree: number;
  phrases: string[];
  mots: Mot[];
  /** PUBLICATION DIFFÉRÉE : masquée aux invités de la bêta (hors personnel et démonstration), voir `matnPour` */
  differe?: true;
  /** règles et lochies : proposées aux ados et aux adultes seulement */
  pudeur?: true;
  /** réservée au niveau adulte */
  adulte?: true;
  /** ne compte pas pour l'attestation d'étude */
  facultatif?: true;
  /** même sujet dans un autre texte (renvois du référent) */
  renvois?: Renvoi[];
  /** grand texte (ar-Risāla) : n° du fichier de phrases `/mutun/<texte>-p<k>.json` où sont les phrases de cette séance */
  p?: number;
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
  /** grand texte (ar-Risāla) : le fichier du texte ne porte que le sommaire ; les phrases sont par parties, à la demande */
  parts?: Array<{ n: number; version: string }>;
}

/** Fichier de phrases d'une partie d'un grand texte. */
export interface PartieMatn {
  v: number;
  id: string;
  part: number;
  version: string;
  phrases: Phrase[];
}

export interface NotesEnseignant {
  version: string;
  statut?: string;
  decoupage: string;
  /** décision du référent sur la publication (séances à retenir) */
  publication?: string;
  /** numéros des séances en publication différée, et la consigne affichée en mode enseignant */
  differe?: number[];
  consigne_differe?: string;
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

/** Le texte français avec ses mots arabes à la place des marqueurs `{ar:K}` (le composant `Bidi` les isole en arabe). */
export const avecArabe = (texte: string, ma?: readonly string[]): string =>
  ma?.length ? texte.replace(/\{ar:(\d+)\}/g, (m, k: string) => ma[Number(k)] ?? m) : texte;

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
 * cite le Coran (segment Tanzil, ou verset cité dans le matn d'un hadith : le Coran n'est jamais lu par une machine),
 * jamais un passage réservé à l'explication de l'enseignant ; null sinon. Aujourd'hui la rubrique n'a aucune voix de
 * synthèse (enregistrements humains attendus) : tout futur branchement DOIT passer par ici.
 */
export const texteVoixSynthese = (p: Phrase): string | null =>
  p.explication ||
  p.q?.length ||
  p.t === 'citation_coran' ||
  /[﴿﴾]/.test(arSimple(p) ?? '﴿') ||
  typeof p.ar === 'object'
    ? null
    : arSimple(p);

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

/**
 * Grand texte (ar-Risāla) : ajoute au texte les phrases de la PARTIE qui porte la séance `n` (un seul fichier de
 * quelques dizaines de Ko, jamais le texte entier). Copie de l'appareil si elle est à jour (hors ligne), sinon le
 * réseau, gardé ensuite ; une copie périmée sert de repli sans réseau. Texte sans parties : rendu tel quel.
 */
export async function chargerPartie(
  m: Matn,
  n: number,
  f: Fetcher = (u) => fetch(u),
): Promise<Matn | null> {
  const part = m.seances.find((s) => s.n === n)?.p;
  const info = m.parts?.find((x) => x.n === part);
  if (!m.parts || !part || !info) return m;
  const cle = `mutun:${m.id}:p${part}`;
  const garde = await kvGet<PartieMatn>(cle).catch(() => undefined);
  let p: PartieMatn | null | undefined = garde?.version === info.version ? garde : null;
  if (!p) {
    p = await f(`/mutun/${encodeURIComponent(m.id)}-p${part}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<PartieMatn>) : null))
      .catch(() => null);
    if (p) await kvSet(cle, p).catch(() => {});
    else p = garde; // pas de réseau : la copie de l'appareil, même ancienne
  }
  if (!p) return null;
  const connues = new Set(m.phrases.map((x) => x.id));
  return { ...m, phrases: [...m.phrases, ...p.phrases.filter((x) => !connues.has(x.id))] };
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
 * Qui voit les séances en PUBLICATION DIFFÉRÉE : le personnel (mode enseignant) et la démonstration. Les invités de la
 * bêta (ni personnel ni compte de démonstration) ne les voient pas, ni dans le sommaire ni par leur adresse directe.
 * Les comptes de démonstration (`<rôle>-<tag>@demo.awform.test`, créés par `deploy.sh --demo` seulement) n'existent
 * que sur une instance de démonstration. Sans compte connu : masqué.
 */
export const COMPTE_DEMO = /@demo\.awform\.test$/i;
export const voitDiffere = (
  me: { account: { email: string | null } } | null | undefined,
  staff: boolean,
): boolean => staff || COMPTE_DEMO.test(me?.account.email ?? '');

/**
 * Le texte tel que le voit un profil (mécanisme des profils : `kind` enfant / ado / adulte) :
 *  - les chapitres des règles et des lochies (`pudeur`) : ados et adultes seulement ;
 *  - les séances et phrases `adulte` (niveau_min « adulte ») : adultes seulement, jamais aux enfants ni aux ados ;
 *  - les séances en publication différée (`differe`) : seulement si `differe` est vrai (personnel, démonstration).
 * Un profil inconnu (null) est traité comme un ado : jamais de contenu réservé aux adultes sans profil adulte.
 */
export function matnPour(m: Matn, kind: Public | null, differe = false): Matn {
  const adulte = kind === 'adulte';
  const enfant = kind === 'enfant';
  const cache = new Set(adulte ? [] : m.phrases.filter((p) => p.adulte).map((p) => p.id));
  const seances = m.seances
    .filter((s) => (adulte || !s.adulte) && (!enfant || !s.pudeur) && (differe || !s.differe))
    .map((s) => (adulte ? s : { ...s, phrases: s.phrases.filter((id) => !cache.has(id)) }));
  const vues = new Set(seances.flatMap((s) => s.phrases));
  return { ...m, phrases: m.phrases.filter((p) => vues.has(p.id)), seances };
}

/** Séances proposées à un profil (voir `matnPour`). */
export const seancesPour = (m: Matn, kind: Public | null, differe = false): Seance[] =>
  matnPour(m, kind, differe).seances;
