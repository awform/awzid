/**
 * Vidéos vivantes du CAHIER DE LECTURE (25/10/2026, demande du client : voir et entendre en même temps la lettre, puis
 * la syllabe, puis le mot). Mode « cahier » du générateur de vidéos vivantes V2 (interrupteurs `cahier_lecture` ET
 * `video_v2`) : à partir d'UNE page du cahier (lettres, syllabes, tableaux, grilles, mots, groupes, phrases, textes
 * suivis, récitations), il produit la liste des SCÈNES (une par bloc de la page), faites de LIGNES ; le lecteur
 * (`apps/web/src/lib/video/lecteur-cahier.ts`) joue chaque ligne ainsi : chaque élément s'affiche en grand et s'allume
 * AU MOMENT où sa voix le dit (de droite à gauche, une flèche avance avec la voix), puis une pause laisse l'élève
 * RÉPÉTER (1,5 fois la durée écoutée), puis la ligne suivante.
 *
 * Générique (rien d'Adultes 1) : les lignes viennent de la STRUCTURE des blocs (rangs d'une grille ou d'un tableau :
 * une ligne par rang ; paires : une ligne par paire ; « lettres séparées puis mot lié » : une ligne de lettres, puis
 * une ligne du mot ; listes plates : découpées en lignes selon la taille des éléments — lettres, syllabes, mots,
 * phrases), jamais du niveau ni du numéro de page. Même format de données pour les cahiers des enfants et des
 * adolescents. Aucun caractère arabe dans ce module (codes seulement).
 *
 * Règles (vérifiées par `apps/web/src/lib/video/video-cahier.test.ts`) :
 *  - FIDÉLITÉ : le texte arabe et le texte français affichés sont ceux du cahier, octet pour octet (jamais normalisés,
 *    pas de NFC) ; les éléments sont ceux de la lecture guidée du cahier, dans le même ordre (seule la lettre
 *    d'étiquette d'un rang de tableau s'y ajoute, marquée `etiquette`) ; aucune phonétique latine ; aucun visage ;
 *  - VOIX : seulement le fichier audio EXISTANT du texte (`hasAudio`, clé du moteur des livres) — syllabes et mots du
 *    niveau — ou, pour un élément `q`, la RÉCITATION stockée (référence de verset) ; jamais une synthèse faite ici ;
 *    GARDE CORANIQUE : un élément `q` n'est jamais confié à un fichier de synthèse, et un texte de la garde coranique
 *    des vidéos (`VIDEO_GARDE`, 4 mots consécutifs du Coran) n'a jamais de voix ; aucune scène muette quand un audio
 *    existe (un texte dont le fichier existe est dit) ;
 *  - l'arabe est toujours sur sa propre ligne (lecteur).
 */
import { audioFileId, sha1Hex } from './audio-cle.js';
import { CAHIER_SANS_VIDEO } from './video-cahier-types.js';
import { VIDEO_GARDE } from './video-garde.js';

import {
  FACTEUR_REPETE,
  REPETE_MIN_MS,
  SANS_VOIX_MS,
  SOUFFLE_MS,
  UNITE_MS,
} from './video-cahier-types.js';

export { CAHIER_SANS_VIDEO, FACTEUR_REPETE, REPETE_MIN_MS, SANS_VOIX_MS, SOUFFLE_MS, UNITE_MS };

// ———————————————————————————— données d'entrée (format 1 du cahier) ————————————————————————————
/** nature de l'audio : s syllabe (lettre), t mot ou phrase, k contrôle renforcé, q récitation */
export type NatureAudio = 's' | 't' | 'k' | 'q';
export interface ElIn {
  ar: string;
  a: NatureAudio;
  /** mise en couleur : [début, longueur, classe] */
  c?: Array<[number, number, string]>;
  /** étiquette française (position, difficulté) */
  d?: string;
  ref?: string;
  /** lettres séparées (« je lis séparé, puis lié ») */
  sep?: string[];
  lecon?: string;
}
export interface RangIn {
  titre?: string;
  note?: string;
  lettre?: string;
  lecon?: string;
  el: ElIn[];
}
export interface BlocIn {
  type: string;
  titre: string;
  note?: string;
  basmala?: string;
  el: unknown[];
}
export interface PageIn {
  id: string;
  num?: number;
  titre: string;
  type: string;
  blocs: BlocIn[];
  texte?: {
    titre?: string;
    lignes: string[];
    a: NatureAudio;
    recite?: Record<string, string>;
  };
}

// ———————————————————————————— sortie ————————————————————————————
/**
 * Voix d'un élément : `oui` (fichier de synthèse du niveau), `recitation` (récitation stockée, référence valide),
 * `absent` (aucun fichier : l'élève le lit avec son enseignant), `garde` (garde coranique : jamais de voix),
 * `aucune` (récitation sans référence).
 */
export type Voix = 'oui' | 'recitation' | 'absent' | 'garde' | 'aucune';
/** taille de l'élément : sert à la mise en page (lettre, syllabe, mot, phrase) */
export type Genre = 'lettre' | 'syllabe' | 'mot' | 'phrase';
export interface Unite {
  /** clé d'affichage du cahier (`0.3`, `1.2.0`, `0.4.s1`, `t.2`…) */
  cle: string;
  ar: string;
  a: NatureAudio;
  genre: Genre;
  voix: Voix;
  c?: Array<[number, number, string]>;
  d?: string;
  ref?: string;
  /** lettre étiquette d'un rang de tableau (absente de la lecture guidée du cahier) */
  etiquette?: true;
}
export interface Ligne {
  unites: Unite[];
  /** libellé français du rang (grille) */
  titre?: string;
  /** rang (1, 2, 3…) dans une grille */
  rang?: number;
  note?: string;
}
export interface Scene {
  id: string;
  /** type du bloc du cahier (classe de mise en page, jamais une règle) */
  bloc: string;
  titre: string;
  note?: string;
  lignes: Ligne[];
}
export interface VideoCahier {
  page: string;
  titre: string;
  /** empreinte de la page reçue (cache du lecteur) */
  source: string;
  scenes: Scene[];
  /** éléments à dire (hors étiquettes) */
  nUnites: number;
  /** éléments sans voix, avec la raison (audit) */
  sansVoix: Array<{ ar: string; voix: Voix }>;
}
export interface OptionsCahier {
  /** le texte a-t-il un fichier audio dans le niveau ? (ex. `audioIdFor(texte, audio) !== null`) */
  hasAudio?: (texte: string) => boolean;
  /** garde coranique de la vidéo (tests) ; par défaut `video-garde.ts` */
  garde?: ReadonlySet<string>;
  /** types de pages sans vidéo ; par défaut `CAHIER_SANS_VIDEO` */
  sansVideo?: readonly string[];
}

// caractères désignés par leur code (le module ne contient aucun caractère arabe)
const ch = String.fromCharCode;
const LETTRE = new RegExp(`[${ch(0x621)}-${ch(0x64a)}${ch(0x671)}]`, 'g');
const SIGNES = new RegExp(`[${ch(0x64b)}-${ch(0x652)}${ch(0x670)}]`);
const GARDE = new Set(VIDEO_GARDE.split(' ').filter(Boolean));
const REF = /^\d{1,3}:\d{1,3}$/;

const mots = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const gardeCle = (s: string) => (audioFileId(s) ?? '').slice(0, 8);

/** genre d'un élément, d'après sa nature et son écriture (jamais le niveau) */
export function genreDe(ar: string, a: NatureAudio): Genre {
  if (a === 's') {
    const lettres = (ar.match(LETTRE) ?? []).length;
    return lettres <= 1 && !SIGNES.test(ar) ? 'lettre' : 'syllabe';
  }
  return mots(ar) > 1 ? 'phrase' : 'mot';
}
const RANG_GENRE: Record<Genre, number> = { lettre: 0, syllabe: 1, mot: 2, phrase: 3 };

/** nombre d'éléments par ligne d'une liste plate, selon la plus grande taille de la liste */
export function parLigne(us: readonly { ar: string; genre: Genre }[]): number {
  const g = us.reduce<Genre>(
    (m, u) => (RANG_GENRE[u.genre] > RANG_GENRE[m] ? u.genre : m),
    'lettre',
  );
  if (g === 'lettre') return 4;
  if (g === 'syllabe') return 3;
  if (g === 'mot') {
    const long = Math.max(...us.map((u) => u.ar.length));
    return long <= 8 ? 3 : long <= 14 ? 2 : 1;
  }
  return 1;
}

/** Les pages sans vidéo (types exclus, ou aucun élément à lire). */
export function pageAVideo(p: { type: string }, sansVideo: readonly string[] = CAHIER_SANS_VIDEO) {
  return !sansVideo.includes(p.type);
}

const estRang = (x: unknown): x is RangIn => !!x && Array.isArray((x as RangIn).el);
const estPaire = (x: unknown): x is { p: [ElIn, ElIn] } =>
  !!x && Array.isArray((x as { p?: unknown }).p);
const estAtelier = (x: unknown): boolean => !!x && Array.isArray((x as { cases?: unknown }).cases);

/**
 * Construit la vidéo d'une page du cahier. Une page sans élément à lire (ou d'un type sans vidéo) donne une vidéo
 * sans scène : le bouton n'est pas proposé.
 */
export function buildVideoCahier(page: PageIn, opts: OptionsCahier = {}): VideoCahier {
  const hasAudio = opts.hasAudio ?? (() => false);
  const garde = opts.garde ?? GARDE;
  const sansVoix: VideoCahier['sansVoix'] = [];
  let nUnites = 0;

  const voixDe = (e: ElIn): Voix => {
    if (e.a === 'q') return REF.test(e.ref ?? '') ? 'recitation' : 'aucune';
    if (garde.has(gardeCle(e.ar))) return 'garde';
    return hasAudio(e.ar) ? 'oui' : 'absent';
  };
  const unite = (cle: string, e: ElIn, etiquette = false): Unite => {
    const u: Unite = {
      cle,
      ar: e.ar,
      a: e.a,
      genre: genreDe(e.ar, e.a),
      voix: voixDe(e),
    };
    if (e.c?.length) u.c = e.c;
    if (e.d) u.d = e.d;
    if (e.ref && e.a === 'q') u.ref = e.ref;
    if (etiquette) u.etiquette = true;
    else {
      nUnites++;
      if (u.voix !== 'oui' && u.voix !== 'recitation') sansVoix.push({ ar: u.ar, voix: u.voix });
    }
    return u;
  };
  const plat = (us: Unite[]): Ligne[] => {
    const n = parLigne(us);
    const out: Ligne[] = [];
    for (let i = 0; i < us.length; i += n) out.push({ unites: us.slice(i, i + n) });
    return out;
  };

  const scenes: Scene[] = [];
  if (pageAVideo(page, opts.sansVideo)) {
    page.blocs.forEach((b, bi) => {
      if (b.type === 'atelier_mot' || b.el.some(estAtelier)) return;
      const lignes: Ligne[] = [];
      // Basmala d'une tête de sourate : récitée avec le premier verset (1:1), comme dans le cahier
      if (b.basmala) {
        const v = b.el[0] as ElIn | undefined;
        const e: ElIn = { ar: b.basmala, a: 'q', ...(v?.ref ? { ref: '1:1' } : {}) };
        lignes.push({ unites: [unite(`${bi}.b`, e)] });
      }
      const flat: Unite[] = [];
      const vider = () => {
        if (flat.length) lignes.push(...plat(flat.splice(0)));
      };
      b.el.forEach((x, i) => {
        if (estRang(x)) {
          vider();
          const us: Unite[] = [];
          if (x.lettre) us.push(unite(`${bi}.${i}.l`, { ar: x.lettre, a: 's' }, true));
          x.el.forEach((e, j) => us.push(unite(`${bi}.${i}.${j}`, e)));
          const l: Ligne = { unites: us, rang: i + 1 };
          if (x.titre) l.titre = x.titre;
          if (x.note) l.note = x.note;
          if (us.length) lignes.push(l);
          else if (x.note)
            lignes.push({
              unites: [],
              rang: i + 1,
              note: x.note,
              ...(x.titre ? { titre: x.titre } : {}),
            });
        } else if (estPaire(x)) {
          vider();
          lignes.push({ unites: x.p.map((e, j) => unite(`${bi}.${i}.${j}`, e)) });
        } else {
          const e = x as ElIn;
          if (e.sep?.length) {
            // lettres séparées d'abord (une ligne), puis le mot lié (sur sa ligne)
            vider();
            lignes.push({
              unites: e.sep.map((s, j) => unite(`${bi}.${i}.s${j}`, { ar: s, a: 's' })),
            });
            lignes.push({ unites: [unite(`${bi}.${i}`, e)] });
          } else flat.push(unite(`${bi}.${i}`, e));
        }
      });
      vider();
      if (!lignes.length) return;
      const s: Scene = { id: `${page.id}.${bi}`, bloc: b.type, titre: b.titre, lignes };
      if (b.note) s.note = b.note;
      scenes.push(s);
    });
    const tx = page.texte;
    if (tx) {
      const us: Unite[] = [];
      if (tx.titre) us.push(unite('t.t', { ar: tx.titre, a: tx.a }));
      tx.lignes.forEach((ar, i) => {
        // ligne qui cite le Coran : récitation (référence) ou sans voix ; jamais de synthèse
        const r = tx.recite?.[String(i)];
        us.push(
          unite(
            `t.${i}`,
            r === undefined ? { ar, a: tx.a } : { ar, a: 'q', ...(r ? { ref: r } : {}) },
          ),
        );
      });
      if (us.length)
        scenes.push({
          id: `${page.id}.t`,
          bloc: 'texte',
          titre: page.titre,
          lignes: us.map((u) => ({ unites: [u] })),
        });
    }
  }
  return {
    page: page.id,
    titre: page.titre,
    source: sha1Hex(JSON.stringify(page)),
    scenes,
    nUnites,
    sansVoix,
  };
}

// ———————————————————————————— durées (ms) ————————————————————————————
/** Pause de répétition après l'écoute d'une ligne : 1,5 fois la durée écoutée, au moins 2 s ; 0 sans aucune voix. */
export function pauseRepete(ecoute: number, avecVoix: boolean): number {
  return avecVoix ? Math.max(REPETE_MIN_MS, Math.round(ecoute * FACTEUR_REPETE)) : 0;
}

/** Un temps de la ligne : l'élément `i` est dit (ou guidé) de `de` à `a` (ms depuis le début de la ligne). */
export interface Etape {
  i: number;
  de: number;
  a: number;
}
/**
 * Calendrier d'une ligne à partir de la durée (ms) de la voix de chaque élément : ÉCOUTE (chaque élément s'allume à son
 * tour, un souffle entre deux), puis RÉPÉTITION (la flèche refait le chemin ; la pause totale est répartie entre les
 * éléments au prorata de leur durée). Fonction pure : le lecteur la suit avec les durées réelles des fichiers.
 */
export function calendrier(
  durees: readonly number[],
  avecVoix: boolean,
): { ecoute: Etape[]; repete: Etape[]; fin: number } {
  const ecoute: Etape[] = [];
  let t = 0;
  durees.forEach((d, i) => {
    ecoute.push({ i, de: t, a: t + d });
    t += d + SOUFFLE_MS;
  });
  const pause = pauseRepete(t, avecVoix);
  const repete: Etape[] = [];
  let u = t;
  durees.forEach((d, i) => {
    const part = Math.round((pause * (d + SOUFFLE_MS)) / Math.max(1, t));
    repete.push({ i, de: u, a: u + part });
    u += part;
  });
  return { ecoute, repete: pause > 0 ? repete : [], fin: t + pause };
}

/** Durée d'un élément (ms) : sa voix, ou le temps de le lire sans voix. */
export function dureeUnite(u: Unite, durees: ReadonlyMap<string, number> | null = null): number {
  if (u.voix !== 'oui' && u.voix !== 'recitation') return SANS_VOIX_MS;
  return durees?.get(u.cle) ?? UNITE_MS;
}

/** Durée d'une ligne (écoute + souffle entre éléments + pause de répétition). */
export function dureeLigne(l: Ligne, durees: ReadonlyMap<string, number> | null = null): number {
  const ecoute = l.unites.reduce((s, u) => s + dureeUnite(u, durees) + SOUFFLE_MS, 0);
  const voix = l.unites.some((u) => u.voix === 'oui' || u.voix === 'recitation');
  return ecoute + pauseRepete(ecoute, voix);
}

/** Durée prévue de toute la vidéo (ms). */
export function dureeVideo(v: VideoCahier, durees: ReadonlyMap<string, number> | null = null) {
  return v.scenes.reduce(
    (s, sc) => s + sc.lignes.reduce((t, l) => t + dureeLigne(l, durees), 0),
    0,
  );
}

/** Tous les éléments de la vidéo, dans l'ordre de lecture (étiquettes comprises). */
export const unitesDe = (v: VideoCahier): Unite[] =>
  v.scenes.flatMap((s) => s.lignes.flatMap((l) => l.unites));
