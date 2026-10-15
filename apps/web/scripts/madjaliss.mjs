// Madjaliss (P3-1) : construit les données de l'élève et du mode enseignant d'un texte (matn) À PARTIR DES SEULES
// SOURCES du dépôt — rien n'est rédigé ici :
//  - packages/content/madjaliss-source/<texte>/{texte_ar,traduction_fr,seances}.json (référent, 12 et 13/10/2026),
//    plus pour l'Ājurrūmiyya `explications_kafrawi.json` et `code_visuel_grammaire.json`, et pour la Jazariyya la note
//    destinée à l'élève de `alignement_tuhfa.json` ;
//  - texte coranique cité : `coran/tanzil-uthmani.tsv` (copie figée de Tanzil, octet par octet, jamais retapé), sens du
//    verset : traduction de référence de l'application (static/traductions/french_rashid).
// Écrit static/mutun/<texte>.json (élève, PUBLIC, chargé à la demande et gardé au premier usage) et, depuis le lot 5,
// dans src/lib/server/mutun/ (fichiers GARDÉS, servis par la route /mutun/[fichier] seulement après authentification avec
// le droit adapté — jamais dans static/) : <texte>-enseignant.json (variantes, vocalisations « à vérifier », choix de
// traduction, passages à relire, consigne du référent), <texte>-differe.json (séances en publication différée : Ibn ʿĀshir
// IBA-S02 à S10) et risala-p<k>.json (phrases de la Risāla). Les vers masqués à l'élève (Lāmiyya 0045, 0068, 0096) n'ont
// ni arabe ni traduction dans aucun fichier public.
// FORMAT COMMUN d'une séance (prose : phrases ; poème : vers à deux hémistiches `h`) :
//  phrases[] : { id, t, ar | h | (ar en segments), fr, sens[], notes[], liste[], exemples[], titre, incertain, adulte,
//                explication }, séances[] : { n, id, titre, duree, phrases[], mots[], pudeur, adulte, facultatif, renvois[] }.
// Règles du référent appliquées (DECISIONS_REFERENT_TRADUCTION.md, T5 et T7 ; décisions du 13/10) :
//  - un passage « présenté par le maître » ne part JAMAIS sans son explication (AKH-0052 ; séances sensibles d'al-ʿIzziyya
//    marquées `relecture_comite` dont la note le dit) : ni son arabe ni sa traduction ne sont dans les fichiers ;
//  - les mots du Coran cités sont des sous-chaînes EXACTES de Tanzil (la construction échoue sinon), livrés comme segments
//    à part (jamais dans le texte mémorisé, questionné ni lu par une voix de synthèse : `voix_de_synthese` doit être false) ;
//  - les notes d'explication (`note_explication`) vont à l'élève, sous la phrase, SANS les décisions, codes et phrases
//    internes (comité, référent, seconde lecture…) ni les sources internes (rapports, décisions) ; les notes de
//    traduction, décisions, vocalisations à confirmer, collations et relectures vont au mode enseignant seulement ;
//  - le brouillon « non publiable » de la traduction n'est jamais repris ; liste BLANCHE de champs : tout champ non
//    prévu (translit_interne, fr_translit_interne, matn_ar_base_numerique, collation*, decision_referent*, relecture_*…)
//    est ignoré.
// Statut : EN_ATTENTE_SECONDE_LECTURE (l'ancien libellé est accepté en entrée pendant la migration).
// AUDIO (lot 9, décision du client des 13 et 14/10/2026 : voix de synthèse autorisée pour les textes de fiqh des cycles
// 1 et 2, JAMAIS pour le Coran) : une phrase reçoit `audio` (« <texte>/<id>.mp3 ») seulement si l'index de la génération
// (`madjaliss-source/audio_index.json`) a son fichier ET que le SHA-1 du texte lu (`ar`, ou les deux hémistiches joints
// par « * ») est celui du texte SERVI (sinon l'audio est périmé : pas de bouton) ; jamais pour un passage réservé, un
// vers masqué ou non confirmé, une lecture incertaine ni une phrase qui cite le Coran. Les fichiers sont servis par la
// route gardée `/mutun/audio/<texte>/<id>.mp3` d'après le manifeste `src/lib/server/madjaliss-audio.json` écrit ici
// (droit « public » : toute session ; « differe » : mêmes droits que les séances différées).
// Usage : node scripts/madjaliss.mjs (contrôlé par src/lib/madjaliss/*.test.ts : fichiers à jour).
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(web, '..', '..');
export const SOURCES = join(repo, 'packages', 'content', 'madjaliss-source');
export const SORTIE = join(web, 'static', 'mutun');
export const STATUT = 'EN_ATTENTE_SECONDE_LECTURE';
/** Seul libellé accepté en entrée : l'ancien libellé a été remplacé dans toutes les sources (13/10/2026) et n'existe plus nulle part. */
export const STATUTS_ACCEPTES = new Set([STATUT]);

/** Lot 9 : index compact de l'audio de synthèse (voir `scripts/madjaliss-audio-index.mjs`). */
export const AUDIO_INDEX = join(SOURCES, 'audio_index.json');
/** Manifeste des MP3 servis (route gardée `/mutun/audio/[texte]/[fichier]`), jamais dans `static/`. */
export const AUDIO_MANIFESTE = join(web, 'src', 'lib', 'server', 'madjaliss-audio.json');
let indexAudioCache = null;
/** Index de l'audio (vide si le fichier manque : aucune phrase n'a alors d'audio). */
export function indexAudio() {
  if (!indexAudioCache) {
    try {
      indexAudioCache = JSON.parse(readFileSync(AUDIO_INDEX, 'utf8'));
    } catch {
      indexAudioCache = { textes: {} };
    }
  }
  return indexAudioCache;
}
const sha1 = (s) => createHash('sha1').update(s, 'utf8').digest('hex');
/** Texte que lit l'audio d'une phrase servie : `ar` (chaîne), ou les deux hémistiches d'un vers joints par « * ». */
export const texteLu = (x) =>
  typeof x.ar === 'string' ? x.ar : Array.isArray(x.h) ? x.h.join(' * ') : null;
/**
 * Chemin de l'audio d'une phrase servie (« <texte>/<id>.mp3 »), ou null : pas de fichier, phrase exclue (passage
 * réservé, vers masqué ou non confirmé, lecture incertaine, Coran) ou texte changé depuis la génération (SHA-1).
 */
export function audioDe(texte, x, ix = indexAudio()) {
  const e = ix.textes?.[texte]?.[x.id];
  if (!e) return null;
  if (x.explication || x.masque || x.nc || x.incertain || x.q?.length || x.t === 'citation_coran')
    return null;
  const s = texteLu(x);
  if (s === null || /[\uFD3E\uFD3F]/.test(s)) return null;
  return sha1(s) === e.t ? `${texte}/${x.id}.mp3` : null;
}
/** Manifeste des MP3 servis : chemin → taille, empreinte (ETag), droit (« public » ou « differe »). */
export function manifesteAudio(entrees, ix = indexAudio()) {
  const fichiers = {};
  for (const { chemin, droit } of [...entrees].sort((a, b) => (a.chemin < b.chemin ? -1 : 1))) {
    const [texte, nom] = chemin.split('/');
    const e = ix.textes[texte][nom.replace(/\.mp3$/, '')];
    // une phrase à la fois publique et différée (jamais aujourd'hui) : le droit le plus strict l'emporte
    if (fichiers[chemin]?.d === 'differe') continue;
    fichiers[chemin] = { o: e.o, e: e.s.slice(0, 32), d: droit };
  }
  return { v: 1, voix: ix.voix ?? null, fichiers };
}
const avecAudio = (phrases, droit) =>
  phrases.filter((p) => p.audio).map((p) => ({ chemin: p.audio, droit }));

/** Textes intégrés (lots 2 et 3 : dix textes ; l'ordre d'affichage est celui des cycles, voir `cycles.ts`). */
export const TEXTES = [
  'akhdari',
  'ashmawiyya',
  'tuhfa',
  'ibn-ashir',
  'izziyya',
  'ajurrumiyya',
  'jazariyya',
  'bayquniyya',
  'nawawi',
  'waraqat',
  // lot 5 : Lāmiyyat al-afʿāl d'Ibn Mālik (114 vers, 23 séances, cycle 3 ; trois vers masqués à l'élève)
  'lamiyya',
];
/**
 * Lot 4 : ar-Risāla (1 769 phrases, 164 séances). Source assemblée par `risala-assembler.mjs` ; construite à part des dix
 * autres textes (les tests des dix textes ne bougent pas) ; servie en PLUSIEURS fichiers chargés à la demande
 * (`static/mutun/risala.json` = sommaire, `risala-<partie>.json` = phrases d'un groupe de chapitres).
 */
export const TEXTES_LOT4 = ['risala'];
export const TOUS_LES_TEXTES = [...TEXTES, ...TEXTES_LOT4];
/**
 * PUBLICATION DIFFÉRÉE PAR CYCLE (décision du pilote, 13/10/2026) : les séances dont le cycle est au moins `cycle_min`
 * sont masquées aux invités de la bêta (visibles en mode enseignant et en démonstration). La Risāla est au cycle 3 du
 * plan directeur : toutes ses séances. La consigne est contrôlée contre le `point_referent` de la source.
 */
export const DIFFERE_CYCLE = {
  risala: { cycle_min: 3, consigne: /Publication différée de toute la Risāla/ },
};
/** Dossier des sources quand il diffère de l'identifiant du texte (« Les Quarante hadiths » : `nawawi40`). */
const DOSSIER = { nawawi: 'nawawi40' };
export const dossier = (texte) => join(SOURCES, DOSSIER[texte] ?? texte);
const PREFIXE_TEXTE = {
  AKH: 'akhdari',
  ASH: 'ashmawiyya',
  AJR: 'ajurrumiyya',
  IBA: 'ibn-ashir',
  IZZ: 'izziyya',
  TUH: 'tuhfa',
  JAZ: 'jazariyya',
  BAY: 'bayquniyya',
  NAW: 'nawawi',
  WRQ: 'waraqat',
  RIS: 'risala',
  LAM: 'lamiyya',
};
/**
 * PUBLICATION DIFFÉRÉE (décision du pilote, 13/10/2026) : séances que les invités de la bêta (ni personnel ni démo)
 * ne voient pas encore ; visibles en mode enseignant et en démonstration. Ibn ʿĀshir : l'introduction et la
 * croyance (IBA-S02 à S10) attendent la fin et le croisement de l'introduction et de la croyance de la Risāla.
 * Contrôlé contre le `point_referent` de la source (la construction échoue si le référent change de consigne).
 */
export const DIFFERE = {
  'ibn-ashir': {
    seances: [
      'IBA-S02',
      'IBA-S03',
      'IBA-S04',
      'IBA-S05',
      'IBA-S06',
      'IBA-S07',
      'IBA-S08',
      'IBA-S09',
      'IBA-S10',
    ],
    consigne: /croyance \(IBA-S02 à S10\)/,
  },
};

/** Mots arabes isolés dans le français : marqueurs `{ar:K}` remplacés, à l'affichage, par le mot arabe n° K de `mots_ar`. */
export const MARQUEUR = /\{ar:(\d+)\}/g;
/** Lettres de translittération latine (ʿ ʾ ḥ ṣ ḍ ṭ ẓ ā ī ū…) : jamais dans l'arabe ni dans une phonétique côté élève. */
export const TRANSLIT = /[ʿʾḥṣḍṭẓāīūṯḏġšḤṢḌṬẒĀĪŪ]/;

/** Types de phrase de l'application ; les sources des Waraqāt disent « phrase », « basmala », « phrase_variante ». */
const TYPES = new Set([
  'texte',
  'titre',
  'formule',
  'citation_coran',
  'citation_hadith',
  'vers',
  'vers_titre',
]);
const TYPE_PHRASE = {
  phrase: 'texte',
  phrase_variante: 'texte',
  basmala: 'formule',
  contenu_hadith: 'texte',
};

/** Phrases jamais montrées sans leur explication (T7) : retirées des fichiers tant qu'elle manque. */
export const AVEC_EXPLICATION = new Set(['AKH-0052']);
/**
 * Une note qui dit que le maître présente le passage, ou que l'explication reste à rédiger, retient TOUT le passage
 * (la séance détachée `relecture_comite` du niveau adulte) : « il ne s'affiche pas en lecture libre » (al-ʿIzziyya, 13/10).
 */
export const NOTE_RETIENT =
  /ma[iî]tre présente|présenté par le maître|ne s'affiche pas|avant tout affichage|à rédiger par le comité|rédigée par le comité/i;

/** Sections réservées aux ados et aux adultes (pudeur, PLAN_DIRECTEUR « Adapté à l'âge »). */
export const SECTIONS_PUDEUR = new Set(['hayd', 'tuhr', 'nifas']);
/** Sens de mot difficile pas encore établi : réservé au mode enseignant. */
export const SENS_A_VERIFIER = /à vérifier|NON ÉTABLI|comité/i;
/** Note du traducteur entre crochets sur un sens à vérifier : retirée de la traduction de l'élève (enseignant). */
export const NOTE_A_VERIFIER = /\s*\[[^\]]*(?:à vérifier|NON ÉTABLI|comité)[^\]]*\]/g;
/**
 * Mots seulement translittérés dont la note de sens est retirée : jamais une translittération sans explication
 * chez l'élève (décision du référent, 12/10) ; le mot et sa note restent au mode enseignant.
 */
export const TRANSLIT_A_PRECISER = ['wadhaḥ', 'khazz'];
export const MOT_A_PRECISER = "[mot au sens à préciser par l'enseignant]";
const avecNote = (mot) => new RegExp(`${mot}${NOTE_A_VERIFIER.source}`, 'g');

/** Emplacement du sens d'un verset dans la traduction : remplacé par […] (le sens du verset suit, tiré de la référence). */
const EMPLACEMENT_SENS = /\[(?:TRADUCTION[^\]]*|[^\]]*traduction coranique de référence[^\]]*)\]/g;
/** Waraqāt : le verset est remplacé dans le français par « ﴿ … ﴾ [sens du verset entier : voir « sens_verset »] ». */
const CITATION_ELLIPSE = /﴿ … ﴾(?: \[sens du verset entier[^\]]*\])?/g;
const EMPLACEMENT_RESTANT = /\[TANZIL|TRADUCTION DU|À INSÉRER|à insérer|À REPRENDRE/;

/** Phrases de notes réservées au comité et au référent : jamais montrées à l'élève. */
export const PHRASE_INTERNE = new RegExp(
  [
    'comité',
    'référent',
    'seconde lecture',
    '\\bR-[A-Z0-9]+(?:-\\d+)?\\b',
    '\\((?:T|E|S|K)\\d+\\)',
    ', E\\d+\\)',
    '\\bK\\d+\\b',
    'RAPPORT',
    'DECISIONS?_',
    '\\.md\\b',
    '\\.json\\b',
    '\\bVC-\\d+',
    '\\b[Tt]raduit(?:e)? (?:tel quel|en entier)',
    '[Nn]ote sobre',
    '[Tt]raduction fidèle',
    'La traduction (?:garde|suit)',
    'Texte de l.auteur gardé',
    'Le texte de l.auteur est gardé',
    // consignes à l'auteur de l'explication, décisions et vocabulaire de travail
    'l.explication (?:doit|cite|donne|le précise|à rédiger)',
    '(?:[ÀàA] (?:dire|présenter|signaler|préciser)[^.]*dans l.explication|voir l.explication)',
    'Aucune explication n.est rédigée',
    'Notre (?:décision|texte)\\b',
    '\\bad[4-7]\\b',
    'dossier des sources',
    '\\bvariante V-\\d+|\\bobservation O-\\d+',
    '\\((?:\\d{1,2}/\\d{1,2})(?:[^)]*)\\)',
    'dans (?:toute )?l.application|fixées? pour toute',
    '\\b(?:IBA|IZZ|ASH|AKH|AJR|TUH|JAZ|RIS|LAM)-\\d{4}\\b',
    'madjlis de la Risāla',
    'saisie numérique|lot ASH',
    // noms de champs des sources (« voir `hadiths_cites_dans_les_commentaires` »)
    '\\b[a-z]+_[a-z_]+\\b|`[^`]+`',
    'est (?:traduit|rendu)e? (?:littéralement|«)|[Tt]raduction (?:corrigée|rendue)|Crochet corrigé|abandonnée?\\b',
  ].join('|'),
);
/** Sources de notes réservées au dossier interne. */
export const SOURCE_INTERNE =
  /Décision du référent|DECISIONS?_|RAPPORT|\.(?:md|json)\b|passe de vérification/i;
/** Champs que l'élève ne reçoit JAMAIS (contrôlé par les tests sur les fichiers construits). */
export const CHAMPS_INTERNES = [
  'translit_interne',
  'fr_translit_interne',
  'brouillon_non_publiable',
  'a_verifier',
  'voyelle_a_confirmer',
  'matn_ar_base_numerique',
  'collation',
  'decision',
  'decision_referent',
  'relecture_comite',
  'relecture_comite_obligatoire',
  'motif_relecture',
  'consulte_interne',
  'point_referent',
  'verification_12_10',
  'verification_13_10',
  'niveau_min',
  'a_enseigner',
  'note_traduction',
  'note_khafd_jarr',
  // lot 3 : champs de travail des sources, jamais chez l'élève
  'texte_avec_arabe_interne',
  'mots_ar_note',
  'partie_translit_interne',
  'partie_mots_ar',
  'titre_translit_interne',
  'sens_translit_interne',
  'intro_ar_base_numerique',
  'takhrij_nawawi_ar_base_numerique',
  'collation_voyelles',
  'collation_1903',
  'collation_ancienne_13_10',
  'statut_vocalisation',
  'decision_referent_13_10',
  'rattachement_mashhur',
  'point_referent',
  'points_referent',
  'note_sensible',
  'passage_sensible',
  'dans_nos_livres',
  'sources_recueil',
  'jugements',
  'jugements_verifies_13_10',
  'confirmations_turath_13_10',
  'degre_affiche',
  'degre_affiche_fr',
];

/** Lettres arabes (hors ﷺ et ornements ﴿﴾) : une suite arabe dans un texte français devient un mot isolé `{ar:K}`. */
const LETTRE_AR =
  '\\u0600-\\u06FF\\u0750-\\u077F\\uFB50-\\uFD3D\\uFD40-\\uFDF9\\uFDFB-\\uFDFF\\uFE70-\\uFEFF';
export const ARABE_LIGNE = new RegExp(`[${LETTRE_AR}]`);
const SUITE_ARABE = new RegExp(`[${LETTRE_AR}]+(?:[ \\u00A0][${LETTRE_AR}]+)*`, 'g');
/** Mots arabes isolés : toute suite arabe d'un texte français est remplacée par un marqueur (mots à la suite de ceux déjà là). */
export function isoler(texte, mots = []) {
  const out = [...mots];
  const t = texte.replace(SUITE_ARABE, (m) => {
    out.push(m);
    return `{ar:${out.length - 1}}`;
  });
  return { texte: t, mots: out };
}
const lire = (p) => JSON.parse(readFileSync(p, 'utf8'));
const LATIN = /[A-Za-zʿʾḥṣḍṭẓāīūṯḏġš]/;

/** Texte Tanzil (sourate:verset TAB texte) : lignes exactes, jamais normalisées. */
export function tanzil() {
  const raw = readFileSync(join(SOURCES, 'coran', 'tanzil-uthmani.tsv'), 'utf8');
  const m = new Map();
  for (const l of raw.split('\n')) {
    const x = /^(\d+:\d+)\t(.*)$/.exec(l.replace(/\r$/, ''));
    if (x) m.set(x[1], x[2]);
  }
  if (m.size !== 6236) throw new Error(`Tanzil : ${m.size} versets au lieu de 6236`);
  return m;
}

/** Sens d'un verset dans la traduction de référence de l'application (Rachid Maach, QuranEnc). */
export function sensVerset(s, a) {
  const j = lire(
    join(web, 'static', 'traductions', 'french_rashid', `${String(s).padStart(3, '0')}.json`),
  );
  const row = j.t.find((r) => r[0] === a);
  if (!row) throw new Error(`sens introuvable ${s}:${a}`);
  return { texte: row[1], cle: j.key, version: j.version };
}

/**
 * Vers MASQUÉS à l'élève (lot 5, Lāmiyya : 0045, 0068, 0096) d'après les champs de données du référent :
 * `levee_reserves_13_10.affichage_eleve === 'masque'` dans `texte_ar.json` ET `vers_a_masquer_a_l_eleve` de
 * `seances.json` (vers et séance) ; les deux listes doivent concorder, sinon la construction échoue. Le texte d'un vers
 * masqué (arabe et traduction) n'est dans AUCUN fichier public : l'élève ne reçoit que son identifiant.
 * Retourne Map(id → fiche de levée) ; vide pour un texte sans levée de réserves.
 */
export function versMasques(ar, se, seancesSrc) {
  const parAr = new Map();
  for (const v of ar.vers ?? []) {
    const l = v.levee_reserves_13_10;
    if (!l) continue;
    if (l.affichage_eleve !== 'masque' && l.affichage_eleve !== 'affichable')
      throw new Error(`${v.id} : affichage_eleve inconnu « ${l.affichage_eleve} »`);
    if (l.affichage_eleve === 'masque') parAr.set(v.id, l);
  }
  const liste = se.levee_reserves_13_10?.vers_a_masquer_a_l_eleve ?? [];
  const ids = liste.map((x) => x.vers).sort();
  if (JSON.stringify([...parAr.keys()].sort()) !== JSON.stringify(ids))
    throw new Error('vers masqués : texte_ar.json et seances.json ne concordent pas');
  for (const x of liste) {
    const s = seancesSrc.find((q) => q.id === x.seance);
    if (!s || !idsSeance(s).includes(x.vers))
      throw new Error(`${x.vers} : séance ${x.seance} incohérente`);
  }
  return parAr;
}

/** Phrases d'un texte_ar.json : `phrases` (prose) ou `vers` (poème). */
const unitesAr = (ar) => ar.phrases ?? ar.vers ?? ar.hadiths;
const idsSeance = (s) => s.phrases ?? s.vers ?? s.hadith;

/**
 * Les Quarante hadiths : un hadith est une « phrase » dont l'arabe est le texte d'an-Nawawī (Būlāq 1321) :
 * l'introduction (nom du Compagnon) puis le matn, tels que la source les coupe (`texte_complet_ar` dit s'il y a une
 * espace entre les deux). La mention de takhrīj (recueil, degré) vient en dessous, jamais dans le texte appris.
 */
function uniteHadith(h) {
  const complet = h.texte_complet_ar ?? '';
  const colle = complet.startsWith(h.intro_ar) && complet[h.intro_ar.length] !== ' ';
  const v = h.collation_1903?.voyelles_13_10_ter?.voyelle_a_confirmer ?? [];
  return {
    id: h.id,
    type: h.coran?.length ? 'citation_hadith' : 'texte',
    ar: h.intro_ar + (colle ? '' : ' ') + h.matn_ar,
    a_verifier: v.map((x) => `${x.mot} : ${x.note} (lecture retenue : ${x.lecture_retenue})`),
    hadith: h,
  };
}
const frHadith = (f) => ({ ...f, fr: `${f.intro_fr} ${f.matn_fr}`.replace(/\s+/g, ' ').trim() });
/** `voyelle_a_confirmer` : liste (Ājurrūmiyya, Jazariyya…) ou objet (Waraqāt : raison, lecture retenue). */
const voyellesAConfirmer = (v) =>
  !v
    ? []
    : Array.isArray(v)
      ? v.map((x) =>
          typeof x === 'string'
            ? x
            : `${x.mot} : ${x.motif ?? x.raison} (lecture retenue : ${x.lecture_retenue ?? x.retenu})`,
        )
      : [`${v.raison} (lecture retenue : ${v.lecture_retenue})`];

/** Numéros des séances d'un texte : ordre de publication si le référent en fixe un, sinon l'ordre du fichier. */
const ordres = new Map();
export function ordreSeances(texte) {
  if (!ordres.has(texte)) {
    const se = lire(join(dossier(texte), 'seances.json'));
    const liste = se.seances.map((s, i) => ({ s, i }));
    liste.sort(
      (a, b) =>
        (a.s.ordre_publication ?? a.i + 1) - (b.s.ordre_publication ?? b.i + 1) || a.i - b.i,
    );
    ordres.set(
      texte,
      liste.map((x) => x.s),
    );
  }
  return ordres.get(texte);
}

const ref = (cites) => {
  const [a, ...r] = cites;
  const memeSourate = r.every((c) => c.sourate === a.sourate);
  const dernier = cites[cites.length - 1];
  return memeSourate && cites.length > 1 && dernier.verset !== a.verset
    ? `${a.sourate}:${a.verset}-${dernier.verset}`
    : `${a.sourate}:${a.verset}`;
};

/**
 * Citations coraniques d'une chaîne arabe : chaque bloc ﴿…﴾ est la concaténation (séparée par un espace) de segments
 * consécutifs de `coran.segments`, tous sous-chaînes EXACTES de Tanzil ; sinon la construction échoue.
 */
export function decouperCoran(id, arabe, coran, lignes) {
  // `coran` : un objet (un segment, ou `segments`) ou, pour les Waraqāt, la liste des segments cités
  const segs = Array.isArray(coran)
    ? coran
    : (coran.segments ?? [{ sourate: coran.sourate, verset: coran.verset, texte: coran.texte }]);
  const sansVoix = Array.isArray(coran)
    ? coran.every((s) => s.voix_de_synthese === false)
    : coran.voix_de_synthese === false;
  if (!sansVoix) throw new Error(`coran ${id} : voix de synthèse non exclue`);
  // lot 10 (décision du référent du 15/10, RIS-0183 = 2:201) : invocation coranique citée EN ENTIER, sans ﴿﴾ ni
  // `texte` dans la source : le verset s'affiche depuis Tanzil octet par octet (la ligne entière) ; la saisie `ar` du
  // témoin n'est JAMAIS livrée (ni comme Coran, ni comme texte de l'auteur, ni à la voix de synthèse)
  if (
    !Array.isArray(coran) &&
    !coran.segments &&
    coran.texte === undefined &&
    coran.portion === 'verset entier'
  ) {
    const ligne = lignes.get(`${coran.sourate}:${coran.verset}`);
    if (!ligne)
      throw new Error(`coran ${id} : verset ${coran.sourate}:${coran.verset} absent de Tanzil`);
    if (/[﴿﴾]/.test(arabe)) throw new Error(`citation ${id} : verset entier et bloc ﴿﴾ à la fois`);
    return {
      morceaux: [{ q: ligne, ref: `${coran.sourate}:${coran.verset}` }],
      versets: [{ sourate: coran.sourate, verset: coran.verset, texte: ligne }],
    };
  }
  for (const s of segs) {
    const ligne = lignes.get(`${s.sourate}:${s.verset}`);
    if (!ligne || !s.texte || !ligne.includes(s.texte))
      throw new Error(`coran ${id} : différent de Tanzil ${s.sourate}:${s.verset}`);
  }
  const morceaux = [];
  let reste = 0;
  let k = 0;
  const re = /﴿([^﴾]*)﴾/g;
  let m;
  while ((m = re.exec(arabe))) {
    const interieur = m[1];
    const pris = [];
    let acc = '';
    while (k < segs.length && acc !== interieur) {
      acc = pris.length ? `${acc} ${segs[k].texte}` : segs[k].texte;
      pris.push(segs[k++]);
    }
    if (acc !== interieur || !pris.length)
      throw new Error(`citation ${id} : bloc ﴿﴾ différent de Tanzil`);
    if (m.index > reste) morceaux.push(arabe.slice(reste, m.index));
    morceaux.push({ q: interieur, ref: ref(pris) });
    reste = m.index + m[0].length;
  }
  if (k !== segs.length) throw new Error(`citation ${id} : segments non retrouvés`);
  if (reste < arabe.length) morceaux.push(arabe.slice(reste));
  if (/[﴿﴾]/.test(morceaux.filter((x) => typeof x === 'string').join('')))
    throw new Error(`citation ${id} : ornements restants`);
  return {
    morceaux,
    versets: [...new Map(segs.map((s) => [`${s.sourate}:${s.verset}`, s])).values()],
  };
}

/** Apostrophes perdues à la saisie de `note_eleve_fr` (« s applique », « n a à juger ») : seule réparation faite au texte. */
export const reparerApostrophes = (t) =>
  t.replace(/\b(d|l|n|s|m|t|c|j|qu|quelqu|lorsqu|puisqu) (?=[aeiouhàâéèêîôû])/g, "$1'");
/** Sens d'un mot difficile sans renvoi au dossier interne (« (R-04) », « voir RAPPORT… »). */
export const sensMotEleve = (s) =>
  s
    .replace(/\s*\([^)]*(?:\bR-[A-Z0-9]+|RAPPORT)[^)]*\)/g, '')
    // phonétique latine du mot arabe entre parenthèses (« l'excellence (iḥsān) ») : jamais côté élève, le mot est en arabe
    .replace(/\s*\(\s*[a-zʿʾ'’\- ]*[ḥṣḍṭẓāīūʿʾ][a-zḥṣḍṭẓāīūʿʾ'’\- ]*\)/g, '')
    .trim();

/** Retire d'une note les phrases internes (comité, référent, codes de décision…) ; '' si rien ne reste. */
export function nettoyerNote(texte) {
  // ar-Risāla : renvois de travail à d'autres phrases (« (même passage que RIS-INT-0041) ») retirés avant le tri
  const t = risala
    ? texte
        .replace(/\s*\((?:même passage que|voir|cf\.)\s*RIS-(?:INT-)?\d{4}[^)]*\)/g, '')
        .replace(/\s*\([^()]*\bpar script\b[^()]*\)/g, '')
    : texte;
  const phrases = t.split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ«(‹{])/);
  return phrases
    .filter((p) => !PHRASE_INTERNE.test(p) && !(risala && PHRASE_INTERNE_RISALA.test(p)))
    .join(' ')
    .trim();
}
/**
 * ar-Risāla (construction en cours) : phrases de notes qui parlent du travail du projet (« le projet n'y ajoute aucun
 * résumé »), renvoient à une autre phrase par son identifiant (RIS-INT-0041, RIS-0714) ou aux témoins du manuscrit.
 */
export const PHRASE_INTERNE_RISALA =
  /\bprojet\b|\bVariante V-\d+|\bpar script\b|\bRIS-(?:INT-)?\d{4}\b|\bSuite \d+|\btémoins? [A-C]\b|\bscan\b|à documenter|\bnon (?:établi|retrouvé) par/i;
/** Intitulé d'ouvrage de la Risāla sans lien de numérisation ni date de lecture : « (turath.io, livre 21589) ». */
export const LIEN_NUMERISATION =
  /\s*\((?:[^()]*(?:turath\.io|shamela|archive\.org|QNL|ediscovery|unicef\.org|consulté le|lu le)[^()]*)\)/gi;
let risala = false;
const sourceEleve = (s) =>
  SOURCE_INTERNE.test(s) ||
  (risala &&
    (PHRASE_INTERNE_RISALA.test(s) ||
      /\bchamp\b|\bimage \d+|\blue? sur l.image|\b[a-z]+_[A-Za-z]+\b/.test(s)))
    ? null
    : (risala ? s.replace(LIEN_NUMERISATION, '').replace(/,?\s*lu le \d+\/\d+\/\d{4}/g, '') : s)
        .replace(/,? copie par programme/, '')
        .replace(/\s+\(\s*\)/g, '');

/**
 * Mots arabes isolés dans un texte français (schéma `{ar:K}` + `mots_ar`, 13/10/2026) : chaque marqueur renvoie à un
 * mot arabe vocalisé de la liste ; l'élève reçoit le texte avec ses marqueurs et la liste (`ma`), affichés en arabe.
 * La construction échoue si un marqueur n'a pas de mot, si un mot porte une lettre latine, ou si l'ancien texte
 * (`texte_avec_arabe_interne`, relecteur seulement) n'est pas retrouvé exactement en remplaçant les marqueurs.
 * Retourne la liste des mots à livrer ([] si le texte n'a aucun marqueur).
 */
export function motsArabes(id, texte, mots, ancien) {
  const ks = [...texte.matchAll(MARQUEUR)].map((m) => Number(m[1]));
  if (!ks.length) return [];
  if (!Array.isArray(mots) || ks.some((k) => !mots[k]))
    throw new Error(`${id} : marqueur {ar:K} sans mot arabe`);
  for (const w of mots)
    if (typeof w !== 'string' || !w || LATIN.test(w))
      throw new Error(`${id} : mot arabe invalide « ${w} »`);
  if (ancien !== undefined && expanser(texte, mots) !== ancien)
    throw new Error(`${id} : le texte rétabli depuis mots_ar n'est pas l'ancien texte`);
  return [...mots];
}
/** Texte avec ses marqueurs remplacés par les mots arabes (mode enseignant, contrôles). */
export const expanser = (texte, mots) => texte.replace(MARQUEUR, (_, k) => mots?.[Number(k)] ?? '');

/** Notes d'explication (`note_explication` : objet ou liste) destinées à l'élève, et ce qui reste au mode enseignant. */
function notesEleve(n, id = '?') {
  if (!n) return { notes: [], interne: [] };
  const notes = [];
  const interne = [];
  for (const x of Array.isArray(n) ? n : [n]) {
    if (typeof x.texte !== 'string' || !x.texte) throw new Error('note_explication sans texte');
    const texte = nettoyerNote(x.texte);
    if (texte !== x.texte) interne.push(expanser(x.texte, x.mots_ar));
    const ma = motsArabes(`${id} (note)`, texte, x.mots_ar, undefined);
    if (x.texte_avec_arabe_interne !== undefined)
      motsArabes(`${id} (note)`, x.texte, x.mots_ar, x.texte_avec_arabe_interne);
    const src = [...(x.sources ?? []), ...(x.citations ?? []).map((c) => c.source).filter(Boolean)];
    const sources = [...new Set(src.map(sourceEleve).filter(Boolean))];
    // remarques d'éditeur entre crochets (français) dans une citation arabe : retirées de l'élève
    const ar = [
      ...(x.citations_ar ?? []),
      ...(x.citations ?? []).map((c) => c.ar).filter(Boolean),
    ].map((c) =>
      // remarques d'éditeur en français, entre crochets ou entre parenthèses (« (complète l'extrait de ١/٢٥) »)
      c.replace(/\s*\[[^\]]*[A-Za-z][^\]]*\]/g, '').replace(/\s*\([^)]*[A-Za-z][^)]*\)/g, ''),
    );
    if (!texte) continue;
    notes.push({
      texte,
      ...(ma.length ? { ma } : {}),
      ...(sources.length ? { sources } : {}),
      ...(ar.length ? { ar } : {}),
    });
  }
  return { notes, interne };
}

/** Intitulé d'ouvrage sans l'identifiant de numérisation entre parenthèses (archive.org, turath, pagination du scan). */
const ouvrageEleve = (s) => s.replace(/\s*\([^)]*\)\s*$/, '').trim();
const sansCrochetsLatins = (c) => c.replace(/\s*\[[^\]]*[A-Za-z][^\]]*\]/g, '');

/** Al-Bayqūniyya : définitions d'Ibn Ḥajar et d'Ibn aṣ-Ṣalāḥ, écart du poème (page de l'imprimé), les deux enseignés avec leur auteur. */
function notesBayquniyya(f, ouvrageSalah) {
  const notes = [];
  for (const x of f.note_selon_ibn_hajar ?? []) {
    const morceaux = [];
    const sources = [];
    for (const [nom, k] of [
      ['Ibn Ḥajar', 'ibn_hajar'],
      ['Ibn aṣ-Ṣalāḥ', 'ibn_as_salah'],
    ]) {
      const d = x[k];
      if (!d?.definition_fr) continue;
      // la définition commence parfois par le nom de l'auteur (« Ibn aṣ-Ṣalāḥ cite… ») : pas de répétition
      const def = d.definition_fr.startsWith(`${nom} `)
        ? d.definition_fr.replace(new RegExp(`^${nom}\\s*:?\\s*`), '')
        : d.definition_fr;
      morceaux.push(`Selon ${nom} : ${def.charAt(0).toUpperCase()}${def.slice(1)}`);
      // dans la source, le champ `source` répète parfois la définition : l'ouvrage est alors celui des séances
      const ouvrage =
        d.source && d.source !== d.definition_fr ? ouvrageEleve(d.source) : ouvrageSalah;
      if (ouvrage && d.page) sources.push(`${ouvrage}, p. ${d.page}`);
    }
    if (x.ecart_du_poeme) morceaux.push(`Écart du poème : ${x.ecart_du_poeme}`);
    if (x.az_zurqani) morceaux.push(`az-Zurqānī : ${x.az_zurqani}`);
    const t = nettoyerNote(morceaux.join(' '));
    if (t) notes.push({ texte: t, ...(sources.length ? { sources } : {}), k: 'ecart' });
  }
  const m = f.munkar_deux_sens;
  if (m) {
    const t = nettoyerNote(
      `Deux sens du même mot. Dans le poème : ${m.sens_du_poeme}. Selon Ibn Ḥajar : ${m.sens_d_ibn_hajar}. Chez les anciens : ${m.sens_des_anciens}.`,
    );
    if (t) notes.push({ texte: t, k: 'ecart' });
  }
  return notes;
}

const ENTITES = {
  '&quot;': '"',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&#39;': "'",
  '&nbsp;': ' ',
};
export const entitesHtml = (s) => s.replace(/&(?:quot|amp|lt|gt|#39|nbsp);/g, (e) => ENTITES[e]);

/** Libellé d'une version du recueil : recueil, numéro du texte montré, tome et page de l'imprimé. */
function libelleVersion(v) {
  const num = v.numero ?? v.numero_du_texte_le_plus_proche ?? v.numero_cite_par_nawawi;
  const lieu = v.volume && v.page_imprimee ? ` (t. ${v.volume}, p. ${v.page_imprimee})` : '';
  return `${v.recueil}${num != null ? ` n° ${num}` : ''}${lieu}`;
}

/**
 * Un hadith d'an-Nawawī, sous le texte d'an-Nawawī : la mention de takhrīj (recueil et numéro, avec les autres récits
 * qu'il ajoute), le degré (« authenticité discutée : … » avec le juge nommé quand il l'est), puis la version du recueil
 * quand elle diffère (jamais à la place du texte d'an-Nawawī), avec ses différences.
 */
function blocHadith(h, f) {
  /** texte français avec ses éventuels mots arabes isolés (`{ar:K}` + `ma`) */
  const txt = (s) => {
    const r = isoler(s);
    return { texte: r.texte, ...(r.mots.length ? { ma: r.mots } : {}) };
  };
  // renvois de la source à ses propres champs (« voir version_recueil_affichee dans texte_ar.json ») : jamais chez l'élève
  const sansChamps = (s) =>
    s.replace(/\s*\((?:voir|cf\.)?[^()]*(?:[a-z]+_[a-z_]+|\.json)[^()]*\)/g, '');
  const fr = sansChamps([f.takhrij_fr, f.autres_recits_fr].filter(Boolean).join(' '));
  if (/[a-z]+_[a-z_]+|\.json/.test(fr)) throw new Error(`${h.id} : nom de champ dans le takhrīj`);
  const out = {};
  if (h.takhrij_nawawi_ar || fr) out.tk = { ar: h.takhrij_nawawi_ar ?? '', fr: txt(fr) };
  const degre = f.degre_affiche_fr;
  if (typeof degre !== 'string' || !degre) throw new Error(`${h.id} : degré manquant`);
  // un hadith « discuté » dit « authenticité discutée » et nomme au moins un juge
  if (
    h.degre_affiche.discute !== /^authenticité discutée/.test(degre) ||
    !h.degre_affiche.juges?.length
  )
    throw new Error(`${h.id} : degré affiché incohérent`);
  out.deg = txt(degre);
  const v = (h.version_recueil_affichee ?? []).map((x) => {
    if (!x.texte_recueil_ar) throw new Error(`${h.id} : version du recueil sans texte`);
    return {
      r: libelleVersion(x),
      // le texte de turath.io porte des entités HTML (&quot;) : seule réparation faite au texte du recueil
      ar: entitesHtml(x.texte_recueil_ar),
      ...(x.differences_avec_nawawi_fr?.length ? { d: x.differences_avec_nawawi_fr.map(txt) } : {}),
    };
  });
  if (v.length) out.v = v;
  return out;
}

/** Hadith : contexte sobre (passages sensibles), prudence, glose d'an-Nawawī, ordre des récits (alerte d'al-Bukhārī). */
function notesHadith(h, f) {
  const notes = [];
  const ajouter = (texte, extra = {}) => {
    const t = texte ? nettoyerNote(texte) : '';
    if (t) notes.push({ texte: t, ...extra });
  };
  ajouter(f.note_contexte_fr);
  ajouter(f.note_prudence_fr);
  ajouter(f.glose_nawawi_fr, h.glose_nawawi_1903_ar ? { ar: [h.glose_nawawi_1903_ar] } : {});
  ajouter(h.alerte_bukhari);
  return notes;
}

/** Waraqāt : note obligatoire sur l'école mālikite (mashhūr) avec ses sources, contexte, jugements d'un hadith cité. */
function notesWaraqat(p, f, ecarts) {
  const notes = [];
  if (f.note_ecart_malikite_fr) {
    const e = ecarts.get(f.ecart_malikite);
    const sources = [];
    const ar = [];
    for (const s of [...(e?.sources ?? []), ...(e?.mashhur_etabli?.sources ?? [])]) {
      const ligne = `${ouvrageEleve(s.ouvrage)}, p. ${s.page}`;
      if (!SOURCE_INTERNE.test(ligne) && !sources.includes(ligne)) sources.push(ligne);
      if (s.extrait && !/\.\.\.|…/.test(s.extrait)) ar.push(sansCrochetsLatins(s.extrait));
    }
    const texte = nettoyerNote(f.note_ecart_malikite_fr);
    if (texte)
      notes.push({
        texte,
        ...(sources.length ? { sources } : {}),
        ...(ar.length ? { ar: [...new Set(ar)] } : {}),
        k: 'malikite',
      });
  }
  if (f.note_contexte_fr) {
    const texte = nettoyerNote(f.note_contexte_fr);
    if (texte) notes.push({ texte });
  }
  const jug = (p.hadith?.references ?? []).filter(
    (r) => r.jugement_explicite && !ARABE_LIGNE.test(r.jugement_explicite),
  );
  if (jug.length)
    notes.push({
      texte: `Degré : ${jug.map((r) => `${r.jugement_explicite} (${ouvrageEleve(r.ouvrage)}, ${r.numero})`).join(' ; ')}.`,
      k: 'degre',
    });
  return notes;
}

/**
 * ar-Risāla : contexte (esclavage, âge du mariage…), note légale, prudence.
 * Les écarts au mashhūr (`ecart_mashhur`) sont ajoutés par l'appelant (genre « note sur l'école mālikite »).
 */
function notesRisala(p, f) {
  const notes = [];
  const ajouter = (texte, extra = {}) => {
    const t = texte ? nettoyerNote(texte) : '';
    if (t) notes.push({ texte: t, ...extra });
  };
  if (f.note_contexte) notes.push(...notesEleve(f.note_contexte, p.id).notes);
  // note_legale : texte seul, ou note complète (texte et sources)
  if (typeof f.note_legale === 'string') ajouter(f.note_legale);
  else if (f.note_legale) notes.push(...notesEleve(f.note_legale, p.id).notes);
  // « Prudence (référent provisoire, 13/10/2026) : … » : la mention interne est retirée, la prudence reste
  ajouter(f.note_prudence?.replace(/\s*\(référent provisoire[^)]*\)/, ''));
  // référence et jugement du hadith cité : notes de travail du référent (mots du projet, suites), mode enseignant seulement
  return notes;
}

/** Nom du style de soulignement (code visuel de la grammaire) d'après sa description. */
const STYLE = [
  [/plein/i, 'plein'],
  [/double/i, 'double'],
  [/ondul/i, 'ondule'],
  [/tiret|coup/i, 'tirete'],
];
function codeVisuel(texte) {
  const c = lire(join(dossier(texte), 'code_visuel_grammaire.json'));
  if (!STATUTS_ACCEPTES.has(c.statut)) throw new Error('code visuel : statut');
  return {
    etats: c.etats.map((e) => {
      const style = STYLE.find(([re]) => re.test(e.soulignement))?.[1];
      if (!style) throw new Error(`code visuel : style ${e.soulignement}`);
      if (/rouge|vert|bleu|or\b/i.test(e.soulignement + e.signe))
        throw new Error('code visuel : couleur interdite');
      return { cas: e.cas, ar: e.ar, style, signe: e.signe, aide: e.mnemonique };
    }),
    regles: [
      c.marques_de_la_flexion.regle,
      ...c.regles_d_usage.filter((r) => !/tajw[iī]d|Accessibilit/.test(r)),
    ],
  };
}

/** Explications d'après al-Kafrāwī (Ājurrūmiyya) : une note sur la première phrase de chacune. */
function explicationsKafrawi(texte, ordreIds, lignes) {
  const e = lire(join(dossier(texte), 'explications_kafrawi.json'));
  if (!STATUTS_ACCEPTES.has(e.statut)) throw new Error('explications : statut');
  const parId = new Map();
  for (const x of e.explications) {
    const premiere = [...x.phrases].sort((a, b) => ordreIds.indexOf(a) - ordreIds.indexOf(b))[0];
    const temoins = [
      ...(x.kafrawi ?? []),
      ...(x.dahlan ?? []),
      ...(x.khalid ?? []),
      ...(x.alger_A2 ?? []),
    ];
    const sources = [
      ...new Set(
        temoins.map(
          (t) => `${t.edition.replace(/\s*\([^)]*scan[^)]*\)/g, '').trim()}, p. ${t.page_imprimee}`,
        ),
      ),
    ];
    const q = [];
    for (const c of x.coran ?? []) {
      if (c.ar !== `﴿${c.segments.map((s) => s.texte).join(' ')}﴾`)
        throw new Error(`${x.id} : bloc coranique`);
      const { morceaux } = decouperCoran(x.id, c.ar, c, lignes);
      q.push(...morceaux.filter((m) => typeof m !== 'string'));
    }
    const texteNote = nettoyerNote(x.explication_fr);
    if (!texteNote) throw new Error(`${x.id} : explication vide`);
    const note = {
      texte: texteNote,
      ...(sources.length ? { sources } : {}),
      ...(temoins.length ? { ar: temoins.map((t) => t.extrait_ar) } : {}),
      ...(q.length ? { q } : {}),
    };
    if (!parId.has(premiere)) parId.set(premiere, []);
    parId.get(premiere).push(note);
  }
  return parId;
}

function construireTexte(texte, lignes) {
  const dir = dossier(texte);
  const ar = lire(join(dir, 'texte_ar.json'));
  const fr = lire(join(dir, 'traduction_fr.json'));
  const se = lire(join(dir, 'seances.json'));
  for (const [nom, d] of [
    ['texte_ar', ar],
    ['traduction_fr', fr],
    ['seances', se],
  ]) {
    const s = d.statut_global ?? d.statut;
    if (!STATUTS_ACCEPTES.has(s)) throw new Error(`${texte}/${nom} : statut ${s}`);
  }
  const hadiths = ar.hadiths !== undefined;
  const unites = hadiths ? ar.hadiths.map(uniteHadith) : unitesAr(ar);
  const frDe = new Map(fr.phrases.map((p) => [p.id, hadiths ? frHadith(p) : p]));
  const ecartsMalikites = new Map((ar.ecarts_malikites ?? []).map((e) => [e.id, e]));
  // al-Bayqūniyya : ouvrage d'Ibn aṣ-Ṣalāḥ, tel que les séances le citent (« …, éd. …, 2002, p. 79 » → sans la page)
  const ouvrageSalah = (se.seances ?? [])
    .flatMap((s) => s.explications ?? [])
    .map((e) => e.source ?? '')
    .find((s) => /^Ibn aṣ-Ṣalāḥ, /.test(s))
    ?.replace(/,\s*p\.[^,]*$/, '');
  const variantes = new Map((ar.variantes ?? []).map((v) => [v.id, v]));
  const seancesSrc = ordreSeances(texte);
  const dansSeance = new Set(seancesSrc.flatMap(idsSeance));
  const arDe = new Map(unites.map((p) => [p.id, p]));
  for (const id of dansSeance) if (!arDe.has(id)) throw new Error(`séance : ${id} absent du texte`);

  // intertitres d'éditeur (poèmes) : avant le vers qui les suit
  const titres = new Map();
  for (const t of ar.titres ?? []) {
    if (typeof t.apres_numero_S === 'number') {
      // Lāmiyya : l'intertitre suit le vers n° S de l'édition S ; il se place avant le premier vers dont le n° S est supérieur
      // (deux intertitres de suite : l'un sous l'autre, séparés par un saut de ligne)
      const cible = unites.find(
        (u) => typeof u.numero_S === 'number' && u.numero_S > t.apres_numero_S,
      );
      if (!cible) throw new Error(`titre sans vers : ${t.ar}`);
      titres.set(cible.id, titres.has(cible.id) ? `${titres.get(cible.id)}\n${t.ar}` : t.ar);
      continue;
    }
    const i = t.avant
      ? unites.findIndex((u) => u.id === t.avant)
      : unites.findIndex((u) => u.id === t.apres) + 1;
    const cible = unites[i];
    if (!cible || (t.avant && cible.id !== t.avant)) throw new Error(`titre sans vers : ${t.ar}`);
    if (titres.has(cible.id)) throw new Error(`deux titres avant ${cible.id}`);
    titres.set(cible.id, t.ar);
  }
  const voyelleJaz = new Map();
  for (const v of ar.voyelle_a_confirmer ?? [])
    if (v.vers) voyelleJaz.set(v.vers, [...(voyelleJaz.get(v.vers) ?? []), v]);

  // passages retenus : AKH-0052 (T7) et les séances sensibles dont la note le dit
  const retenus = new Set(AVEC_EXPLICATION);
  for (const s of seancesSrc) {
    const ids = idsSeance(s);
    if (s.relecture_comite === true && s.niveau_min === 'adulte') {
      const notes = ids.flatMap((id) => {
        const n = frDe.get(id)?.note_explication;
        return n ? (Array.isArray(n) ? n : [n]).map((x) => x.texte) : [];
      });
      if (notes.some((t) => NOTE_RETIENT.test(t))) for (const id of ids) retenus.add(id);
    }
  }
  // vers masqués d'après les champs de données (lot 5) : retenus comme les passages « présentés par le maître »,
  // mais l'élève voit « vers en cours de vérification » (`masque`) et non « présenté par l'enseignant »
  const masques = versMasques(ar, se, seancesSrc);
  for (const id of masques.keys()) retenus.add(id);

  // niveau « adulte » : la phrase le dit, ou toutes les séances qui la portent le disent
  const seancesDe = new Map();
  for (const s of seancesSrc)
    for (const id of idsSeance(s)) seancesDe.set(id, [...(seancesDe.get(id) ?? []), s]);
  const adulte = (id) => {
    const f = frDe.get(id);
    const a = arDe.get(id);
    if (f?.niveau_min === 'adulte' || a?.niveau_min === 'adulte') return true;
    const ss = seancesDe.get(id) ?? [];
    return ss.length > 0 && ss.every((s) => s.niveau_min === 'adulte');
  };

  let explications = new Map();
  if (texte === 'ajurrumiyya')
    explications = explicationsKafrawi(
      texte,
      unites.map((u) => u.id),
      lignes,
    );
  let noteJaz = new Map();
  if (texte === 'jazariyya') {
    const al = lire(join(dir, 'alignement_tuhfa.json'));
    for (const n of al.notes_referent_13_10 ?? []) {
      const t = n.note_eleve_fr ? nettoyerNote(reparerApostrophes(n.note_eleve_fr)) : '';
      if (t && n.vers?.length) noteJaz.set(n.vers[0], [{ texte: t }]);
    }
  }

  const enseignantPhrases = new Map();
  const noterEns = (id, ajout) => {
    const x = enseignantPhrases.get(id) ?? { id, a_verifier: [], variantes: [] };
    for (const [k, v] of Object.entries(ajout)) {
      if (k === 'a_verifier') x.a_verifier.push(...v);
      else if (k === 'variantes') x.variantes.push(...v);
      else if (k === 'traduction') x.traduction = [x.traduction, v].filter(Boolean).join(' / ');
      else x[k] = v;
    }
    enseignantPhrases.set(id, x);
  };

  const phrases = [];
  /** versions complètes des vers masqués (marquées `nc`), pour le complément gardé */
  const versNonConfirmes = [];
  for (const p of unites) {
    if (!dansSeance.has(p.id)) {
      if (!p.hors_matn) throw new Error(`phrase hors séance : ${p.id}`);
      continue;
    }
    const f = frDe.get(p.id);
    if (!f) throw new Error(`traduction manquante ${p.id}`);
    if (!STATUTS_ACCEPTES.has(f.statut)) throw new Error(`statut ${p.id} : ${f.statut}`);
    const verset = p.hemistiches !== undefined;
    const t = TYPE_PHRASE[p.type] ?? p.type;
    if (!TYPES.has(t)) throw new Error(`${p.id} : type inconnu « ${p.type} »`);
    const comite = [];
    // champs internes : mode enseignant seulement
    const aVerifier = [
      ...(p.a_verifier ?? []),
      ...voyellesAConfirmer(p.voyelle_a_confirmer),
      ...(voyelleJaz.get(p.id) ?? []).map(
        (v) => `${v.mot} : ${v.raison} (lecture retenue : ${v.retenu})`,
      ),
    ];
    const incertain = aVerifier.length > 0;
    // lot 6 : un vers masqué reste un emplacement `{id, t, masque}` dans le fichier PUBLIC ; sa version complète (marquée
    // `nc`, « non confirmé ») est construite comme les autres vers mais va dans le complément GARDÉ, pour le groupe
    // « bêta fermée » et le personnel (voir `separerDiffere`)
    const masque = masques.get(p.id);
    if (masque) {
      noterEns(p.id, {
        a_verifier: [...aVerifier, `Lecture proposée : ${masque.lecture_proposee}`],
        decision: `Vers masqué à l'élève (${masque.decision}) : ${masque.raison_masquage}`,
      });
    }
    if (retenus.has(p.id) && !masque) {
      phrases.push({ id: p.id, t, explication: true, ...(adulte(p.id) ? { adulte: true } : {}) });
      noterEns(p.id, { a_verifier: aVerifier });
      continue;
    }
    const { notes: notesN, interne } = notesEleve(f.note_explication, p.id);
    // ar-Risāla : une note de la phrase qui porte un écart au mashhūr est une « note sur l'école mālikite »
    const notesBrutes =
      texte === 'risala' && f.ecart_mashhur ? notesN.map((n) => ({ ...n, k: 'malikite' })) : notesN;
    const notes = [
      ...notesBrutes,
      ...(texte === 'risala' ? notesRisala(p, f) : []),
      ...(explications.get(p.id) ?? []),
      ...(noteJaz.get(p.id) ?? []),
      ...(texte === 'bayquniyya' ? notesBayquniyya(f, ouvrageSalah) : []),
      ...(texte === 'waraqat' ? notesWaraqat(p, f, ecartsMalikites) : []),
      ...(hadiths ? notesHadith(p.hadith, f) : []),
    ];
    for (const x of interne) comite.push(x);
    const base = {
      id: p.id,
      t,
      ...(incertain ? { incertain: true } : {}),
      ...(adulte(p.id) ? { adulte: true } : {}),
      ...(titres.has(p.id) ? { titre: titres.get(p.id) } : {}),
    };
    if (verset) {
      const h = p.hemistiches;
      if (h.length !== 2 || h.some((x) => typeof x !== 'string' || !x) || p.ar !== h.join(' * '))
        throw new Error(`vers ${p.id} : hémistiches`);
      if (/[﴿﴾]/.test(p.ar) || p.coran)
        throw new Error(`vers ${p.id} : citation coranique non prévue`);
    }
    if (/\[TANZIL|À INSÉRER/.test(p.ar)) throw new Error(`emplacement non rempli ${p.id}`);

    // traduction de l'élève : sans note du traducteur « à vérifier » (alors la phrase reste « incertaine »), et sans
    // emplacement de verset (remplacé par […] : le sens du verset suit, tiré de la traduction de référence)
    const sansNote = TRANSLIT_A_PRECISER.reduce(
      (x, mot) => x.replace(avecNote(mot), MOT_A_PRECISER),
      f.fr,
    ).replace(NOTE_A_VERIFIER, '');
    if (sansNote !== f.fr) base.incertain = true;
    const aSens = new RegExp(EMPLACEMENT_SENS.source).test(sansNote) || !!f.sens_verset;
    const frEleve = sansNote.replace(EMPLACEMENT_SENS, '[…]').replace(CITATION_ELLIPSE, '[…]');
    if (EMPLACEMENT_RESTANT.test(frEleve))
      throw new Error(`emplacement non rempli ${p.id} (traduction)`);
    // mots arabes isolés du français (`{ar:K}` + `mots_ar`), vérifiés contre l'ancien texte quand il est fourni
    const ma = motsArabes(p.id, frEleve, f.mots_ar, undefined);

    let corps;
    if (hadiths) {
      const h = p.hadith;
      const q = (h.coran ?? []).map((c) => {
        const [s, a] = c.ref.split(':');
        const ligne = lignes.get(`${s}:${a}`);
        if (c.voix_de_synthese !== false || !ligne || !ligne.includes(c.texte_tanzil))
          throw new Error(`hadith ${p.id} : verset ${c.ref} différent de Tanzil`);
        if (c.affichage !== `﴿${c.texte_tanzil}﴾`) throw new Error(`hadith ${p.id} : affichage`);
        return { q: c.texte_tanzil, ref: c.ref };
      });
      corps = {
        ar: p.ar,
        fr: frEleve,
        ...(q.length ? { q } : {}),
        hadith: blocHadith(h, f),
      };
    } else if (verset) corps = { h: [...p.hemistiches], fr: frEleve };
    else if (p.coran) {
      const { morceaux, versets } = decouperCoran(p.id, p.ar, p.coran, lignes);
      corps = {
        ar: morceaux.filter((x) => x !== ''),
        fr: frEleve,
        ...(aSens
          ? {
              sens: versets.map((v) => {
                const s = sensVerset(v.sourate, v.verset);
                return { ref: `${v.sourate}:${v.verset}`, texte: s.texte, source: s.cle };
              }),
            }
          : {}),
      };
    } else {
      // mots du Coran hors `coran` : jamais livrés comme texte de l'auteur (mémorisation, quiz, voix)
      if (/[﴿﴾]/.test(p.ar)) throw new Error(`citation coranique non déclarée ${p.id}`);
      corps = { ar: p.ar, fr: frEleve };
    }
    const ajout = {};
    if (f.liste?.length) ajout.liste = f.liste.map((x) => ({ ar: x.ar, fr: x.fr }));
    if (f.exemples?.length) ajout.exemples = f.exemples.map((x) => ({ ar: x.ar, fr: x.fr }));
    const complete = {
      ...base,
      ...corps,
      ...(ma.length ? { ma } : {}),
      ...ajout,
      ...(notes.length ? { notes } : {}),
    };
    if (masque) {
      phrases.push({ id: p.id, t, masque: true, ...(adulte(p.id) ? { adulte: true } : {}) });
      versNonConfirmes.push({ ...complete, nc: true });
      continue; // notes de l'enseignant déjà posées plus haut
    }
    // lot 9 : audio de synthèse (fiqh des cycles 1 et 2), seulement pour le texte servi tel que généré
    const audio = audioDe(texte, complete);
    if (audio) complete.audio = audio;
    phrases.push(complete);

    // mode enseignant
    const trad = [
      f.note_traduction,
      f.note_khafd_jarr,
      typeof f.note === 'string' ? f.note : null,
      f.note_az_zurqani,
      f.renvoi_lexique,
      ...(texte === 'risala'
        ? [
            f.ecart_mashhur ? `Écart au mashhūr ${f.ecart_mashhur}` : null,
            typeof f.coherence === 'string' ? f.coherence : null,
            typeof f.point_surveille === 'string' ? f.point_surveille : null,
            typeof f.point_a_verifier === 'string' ? f.point_a_verifier : null,
            f.relecture_comite === true ? 'Relecture savante demandée' : null,
            typeof p.hadith?.jugement === 'string'
              ? `Jugement relevé : ${p.hadith.jugement}`
              : null,
          ]
        : []),
      ...(hadiths ? [...(p.hadith.points_referent ?? []), f.note_sensible] : []),
    ]
      .filter(Boolean)
      .join(' / ');
    const nv = (p.variantes ?? []).map((v) => variantes.get(v) ?? { id: v });
    const note = (f.fr.match(NOTE_A_VERIFIER) ?? []).map((x) => x.trim());
    const dec = f.decision_referent ?? f.decision_referent_13_10 ?? null;
    // lot 10 : `note_info` (second passage du référent, 15/10) = note d'INFORMATION pour l'enseignant et les relecteurs ;
    // elle ne rend jamais la phrase « incertaine » et ne bloque ni la publication ni l'audio
    const info = Array.isArray(p.note_info)
      ? p.note_info.filter((x) => typeof x === 'string' && x.trim())
      : [];
    if (aVerifier.length || note.length || nv.length || trad || dec || comite.length || info.length)
      noterEns(p.id, {
        a_verifier: [...aVerifier, ...note],
        ...(info.length ? { info } : {}),
        variantes: nv,
        ...(trad ? { traduction: trad } : {}),
        ...(dec ? { decision: dec } : {}),
        ...(comite.length ? { notes_internes: comite } : {}),
        ...(f.citations_ar?.length && trad ? { ar: f.citations_ar } : {}),
      });
  }

  // l'arabe est toujours sur sa ligne : toute suite arabe restée dans un texte français devient un mot isolé `{ar:K}`
  for (const p of phrases) {
    if (typeof p.fr === 'string') {
      const r = isoler(p.fr, p.ma);
      if (r.texte !== p.fr) {
        p.fr = r.texte;
        p.ma = r.mots;
      }
    }
    for (const n of p.notes ?? []) {
      const r = isoler(n.texte, n.ma);
      if (r.texte !== n.texte) {
        n.texte = r.texte;
        n.ma = r.mots;
      }
    }
  }

  // contrôles : l'arabe ne porte aucune lettre latine
  for (const p of phrases) {
    const arabes = [
      ...(p.h ?? []),
      ...(typeof p.ar === 'string'
        ? [p.ar]
        : (p.ar ?? []).map((s) => (typeof s === 'string' ? s : s.q))),
      ...(p.liste ?? []).map((x) => x.ar),
      ...(p.exemples ?? []).map((x) => x.ar),
      ...(p.notes ?? []).flatMap((n) => [...(n.ar ?? []), ...(n.q ?? []).map((q) => q.q)]),
      ...(p.titre ? [p.titre] : []),
      ...(p.ma ?? []),
      ...(p.notes ?? []).flatMap((n) => n.ma ?? []),
      ...(p.q ?? []).map((q) => q.q),
      ...(p.hadith?.tk?.ar ? [p.hadith.tk.ar] : []),
      ...(p.hadith?.v ?? []).map((v) => v.ar),
    ];
    for (const a of arabes)
      if (LATIN.test(a))
        throw new Error(`${p.id} : lettre latine dans l arabe : ${a.slice(0, 160)}`);
  }

  const idRetenus = (s) => idsSeance(s).filter((id) => retenus.has(id));
  const arabeDe = (id) => arDe.get(id)?.ar ?? '';
  /** mot difficile propre à une phrase retenue : il partirait sans elle, donc enseignant seulement */
  const lieAuRetrait = (s, m) => {
    const out = idRetenus(s).map(arabeDe);
    const vus = idsSeance(s)
      .filter((id) => !retenus.has(id))
      .map(arabeDe);
    // séance entièrement retenue : aucun de ses mots ne part sans elle
    if (out.length && !vus.length) return true;
    return m.ar
      .split(' / ')
      .some((w) => out.some((a) => a.includes(w)) && !vus.some((a) => a.includes(w)));
  };
  const reserve = (s, m) => SENS_A_VERIFIER.test(m.sens) || lieAuRetrait(s, m);
  const numeroDe = new Map(seancesSrc.map((s, i) => [s.id, i + 1]));
  const section = (id) => arDe.get(id)?.section;
  const renvoisDe = (s) => {
    const ids = [...(s.renvoi_akhdari ?? []), ...(Array.isArray(s.renvois) ? s.renvois : [])];
    const out = [];
    for (const r of ids) {
      const cible = PREFIXE_TEXTE[r.split('-')[0]];
      if (!cible || cible === texte || !TOUS_LES_TEXTES.includes(cible)) continue;
      const n = ordreSeances(cible).findIndex((x) => x.id === r) + 1;
      if (!n) throw new Error(`renvoi inconnu : ${r}`);
      out.push({ texte: cible, n });
    }
    return out;
  };
  // publication différée (voir DIFFERE) : les séances existent dans la source et la consigne y est toujours écrite
  const differe = new Set(DIFFERE[texte]?.seances ?? []);
  if (differe.size) {
    const d = DIFFERE[texte];
    if (!d.consigne.test(se.point_referent ?? ''))
      throw new Error(`${texte} : la consigne de publication différée a changé dans la source`);
    for (const id of differe)
      if (!seancesSrc.some((s) => s.id === id)) throw new Error(`${texte} : séance ${id} absente`);
  }
  // publication différée par cycle (ar-Risāla : cycle 3)
  const dc = DIFFERE_CYCLE[texte];
  if (dc) {
    if (!dc.consigne.test(se.point_referent ?? ''))
      throw new Error(`${texte} : la consigne de publication différée a changé dans la source`);
    // lot 6 : le découpage du référent (264 séances) porte `cycle`, `niveau_min` et `differe` PAR SÉANCE : une séance est
    // différée si son cycle est au moins `cycle_min` OU si elle le dit (`differe: true`, croyance, voyelles incertaines…)
    for (const s of seancesSrc)
      if ((typeof s.cycle === 'number' && s.cycle >= dc.cycle_min) || s.differe === true)
        differe.add(s.id);
  }
  // raison de la publication différée (`raison_differe` de la source) : montrée au groupe « bêta fermée » et au personnel
  // seulement, donc jamais dans le fichier public (voir `departager`)
  const raisons = new Map(
    seancesSrc
      .filter((s) => differe.has(s.id) && typeof s.raison_differe === 'string' && s.raison_differe)
      .map((s) => [numeroDe.get(s.id), s.raison_differe]),
  );
  const seances = seancesSrc.map((s) => {
    const ids = idsSeance(s);
    const mots = s.mots_difficiles.filter((m) => !reserve(s, m));
    const renvois = renvoisDe(s);
    const toutAdulte =
      s.niveau_min === 'adulte' || (ids.length > 0 && ids.every((id) => adulte(id)));
    // titre : mots arabes isolés (`{ar:K}` + `titre_mots_ar`), puis toute suite arabe restante devient un marqueur
    const t0 = motsArabes(s.id, s.titre, s.titre_mots_ar, undefined);
    const t1 = isoler(s.titre, t0);
    return {
      n: numeroDe.get(s.id),
      id: s.id,
      titre: t1.texte,
      ...(t1.mots.length ? { tma: t1.mots } : {}),
      duree: s.duree_min,
      // ar-Risāla : cycle de la séance (découpage du référent), pour le groupe et le personnel
      ...(texte === 'risala' && typeof s.cycle === 'number' ? { c: s.cycle } : {}),
      phrases: ids,
      mots: mots.map((m) => ({ ar: m.ar, fr: sensMotEleve(m.sens) })),
      ...(differe.has(s.id) ? { differe: true } : {}),
      ...(ids.some((id) => SECTIONS_PUDEUR.has(section(id))) ? { pudeur: true } : {}),
      ...(toutAdulte ? { adulte: true } : {}),
      ...(s.facultatif === true ? { facultatif: true } : {}),
      ...(renvois.length ? { renvois } : {}),
    };
  });
  const corps = {
    ...(texte === 'ajurrumiyya' ? { code: codeVisuel(texte) } : {}),
    phrases,
    seances,
  };
  const version = createHash('sha256').update(JSON.stringify(corps)).digest('hex').slice(0, 12);
  const eleve = { v: 2, id: texte, version, statut: STATUT, oeuvre: ar.oeuvre, ...corps };
  const enseignant = {
    v: 2,
    id: texte,
    version,
    statut: STATUT,
    decoupage: se.a_confirmer,
    ...(se.point_referent ? { publication: se.point_referent } : {}),
    ...(differe.size
      ? {
          differe: seances.filter((s) => s.differe).map((s) => s.n),
          consigne_differe:
            'Publication différée : ces séances sont masquées aux invités de la bêta (hors personnel et démonstration) tant que la consigne du référent ci-dessus n’est pas levée.',
        }
      : {}),
    comite: seancesSrc
      .filter((s) => s.relecture_comite === true)
      .map((s) => ({ n: numeroDe.get(s.id), id: s.id, motif: s.motif_relecture ?? '' })),
    phrases: [...enseignantPhrases.values()].filter(
      (x) =>
        x.a_verifier.length ||
        x.variantes.length ||
        x.traduction ||
        x.decision ||
        x.notes_internes ||
        x.info?.length,
    ),
    mots: seancesSrc.flatMap((s) =>
      s.mots_difficiles
        .filter((m) => reserve(s, m))
        .map((m) => ({
          n: numeroDe.get(s.id),
          ar: m.ar,
          fr: m.sens,
          motif: SENS_A_VERIFIER.test(m.sens) ? 'sens' : 'explication',
        })),
    ),
  };
  return { eleve, enseignant, raisons, versNonConfirmes };
}

/** Construit les données de l'élève et de l'enseignant d'un texte (les filtres propres à la Risāla ne vivent que pendant l'appel). */
export function construire(texte = 'akhdari', lignes = tanzil()) {
  risala = texte === 'risala';
  try {
    return construireTexte(texte, lignes);
  } finally {
    risala = false;
  }
}

/** Taille visée d'un fichier de phrases d'un grand texte (octets, avant compression) : une partie se charge en < 1 s en 3G. */
export const TAILLE_PARTIE = 280_000;

/**
 * Grand texte (ar-Risāla) : le fichier `<texte>.json` ne porte que le sommaire (séances, sans phrases : chaque séance dit
 * dans quelle partie `p` sont ses phrases) ; les phrases sont dans `<texte>-p<k>.json`, chacun chargé à la demande
 * à l'ouverture d'une séance. Les séances se suivent : une partie = des séances consécutives, jamais coupée au milieu
 * d'une séance. Le texte et le contenu des phrases sont ceux de `construire`, inchangés.
 */
export function departager(eleve, taille = TAILLE_PARTIE, raisons = new Map()) {
  const de = new Map(eleve.phrases.map((p) => [p.id, p]));
  // lot 6 : DEUX suites de parties. Les séances ouvertes (non différées) ont leurs phrases dans des parties PUBLIQUES
  // (`<texte>-o<k>.json`, dans `static/mutun`, lisibles par tous) ; les séances différées dans des parties GARDÉES
  // (`<texte>-p<k>.json`, droit « différé » : personnel, démonstration, groupe « bêta fermée »). Une partie réunit des
  // séances de même nature, dans l'ordre, jamais coupée au milieu d'une séance. Numéros uniques : gardées d'abord.
  const groupes = [];
  for (const pub of [false, true]) {
    let cur = null;
    for (const s of eleve.seances.filter((x) => !x.differe === pub)) {
      const o = Buffer.byteLength(
        JSON.stringify(s.phrases.map((id) => de.get(id)).filter(Boolean)),
      );
      if (!cur || (cur.seances.length && cur.octets + o > taille)) {
        cur = { pub, seances: [], octets: 0 };
        groupes.push(cur);
      }
      cur.seances.push(s.n);
      cur.octets += o;
    }
  }
  const partieDe = new Map(groupes.flatMap((g, i) => g.seances.map((n) => [n, i + 1])));
  const fichiers = groupes.map((g, i) => {
    const phrases = eleve.seances
      .filter((s) => g.seances.includes(s.n))
      .flatMap((s) => s.phrases.map((id) => de.get(id)).filter(Boolean));
    // raison de la publication différée : dans la partie GARDÉE seulement (jamais dans un fichier public)
    const rd = Object.fromEntries(
      g.seances.filter((n) => raisons.has(n)).map((n) => [n, raisons.get(n)]),
    );
    const corps = { phrases, ...(!g.pub && Object.keys(rd).length ? { raisons: rd } : {}) };
    const version = createHash('sha256').update(JSON.stringify(corps)).digest('hex').slice(0, 12);
    return { v: 2, id: eleve.id, part: i + 1, pub: g.pub, version, ...corps };
  });
  const index = {
    ...eleve,
    phrases: [],
    seances: eleve.seances.map((s) => ({ ...s, p: partieDe.get(s.n) })),
    parts: fichiers.map((f) => ({ n: f.part, version: f.version, ...(f.pub ? { o: true } : {}) })),
  };
  return { index, fichiers };
}

/**
 * Fichiers GARDÉS (lot 5, écart n° 3 du contrôle pré-bêta) : jamais dans `static/` (servi sans authentification par le
 * serveur de fichiers statiques), mais dans ce dossier lu par la route `/mutun/[fichier]` (`+server.ts`), qui exige une
 * session avec le droit adapté : notes de l'enseignant (`<texte>-enseignant.json` : personnel), séances en publication
 * différée (`<texte>-differe.json`) et parties de phrases d'un grand texte (`risala-p<k>.json`) : personnel et comptes de
 * démonstration. Rien de ce dossier n'est téléchargé pour un invité de la bêta, même par adresse directe.
 */
export const SORTIE_PROTEGEE = join(web, 'src', 'lib', 'server', 'mutun');
/** Noms de fichiers gardés (jamais dans `static/mutun`). */
export const NOM_PROTEGE = /^[a-z-]+-(?:enseignant|differe|p\d+)\.json$/;

const empreinte = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 12);

/**
 * Publication différée (Ibn ʿĀshir : séances IBA-S02 à S10) : sépare le texte de l'élève en un fichier PUBLIC (séances
 * ouvertes, phrases qui s'y trouvent) et un fichier DIFFÉRÉ (séances différées et phrases qui ne sont dans aucune séance
 * ouverte), servi seulement au personnel et à la démonstration. Le fichier public dit seulement qu'un complément existe
 * (`differe.version`). Texte sans séance différée : rien n'est séparé. Un grand texte (Risāla) garde son sommaire public
 * (titres seuls) et ses parties de phrases gardées : voir `departager`.
 */
export function separerDiffere(eleve, nonConfirmes = []) {
  const fermees = eleve.seances.filter((s) => s.differe);
  if (!fermees.length && !nonConfirmes.length) return { publique: eleve, differe: null };
  const ouvertes = eleve.seances.filter((s) => !s.differe);
  const vues = new Set(ouvertes.flatMap((s) => s.phrases));
  const phrases = eleve.phrases.filter((p) => vues.has(p.id));
  // lot 6 : les vers masqués (Lāmiyya) restent des emplacements dans le fichier public ; leur version complète, marquée
  // `nc` (« non confirmé »), est dans le complément gardé et REMPLACE l'emplacement à la fusion (donnees.ts)
  const complement = {
    seances: fermees,
    phrases: [...eleve.phrases.filter((p) => !vues.has(p.id)), ...nonConfirmes],
  };
  const differe = {
    v: 2,
    id: eleve.id,
    version: empreinte(complement),
    statut: STATUT,
    ...complement,
  };
  const base = { ...eleve, phrases, seances: ouvertes, differe: { version: differe.version } };
  const version = empreinte(Object.entries(base).filter(([k]) => k !== 'version'));
  // mêmes clés, dans le même ordre (v, id, version, statut, oeuvre…) ; seule la version change
  return { publique: { ...base, version }, differe };
}

/** Écrit tous les fichiers d'un texte : publics dans `static/mutun`, gardés dans `SORTIE_PROTEGEE` (voir plus haut). */
export function ecrireTexte(texte, lignes = tanzil(), sortie = SORTIE, protegee = SORTIE_PROTEGEE) {
  const { eleve, enseignant, raisons, versNonConfirmes } = construire(texte, lignes);
  const ecrire = (dir, nom, x) => writeFileSync(join(dir, nom), `${JSON.stringify(x)}\n`);
  let publique;
  const audio = [];
  if (TEXTES_LOT4.includes(texte)) {
    const { index, fichiers } = departager(eleve, TAILLE_PARTIE, raisons);
    publique = index;
    for (const { pub, ...f } of fichiers) {
      if (pub) ecrire(sortie, `${texte}-o${f.part}.json`, f);
      else ecrire(protegee, `${texte}-p${f.part}.json`, f);
      audio.push(...avecAudio(f.phrases, pub ? 'public' : 'differe'));
    }
  } else {
    const s = separerDiffere(eleve, versNonConfirmes);
    publique = s.publique;
    if (s.differe) ecrire(protegee, `${texte}-differe.json`, s.differe);
    audio.push(...avecAudio(publique.phrases, 'public'));
    if (s.differe) audio.push(...avecAudio(s.differe.phrases, 'differe'));
  }
  ecrire(sortie, `${texte}.json`, publique);
  ecrire(protegee, `${texte}-enseignant.json`, enseignant);
  return { eleve, publique, audio };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(SORTIE, { recursive: true });
  mkdirSync(SORTIE_PROTEGEE, { recursive: true });
  // fichiers gardés d'une construction précédente (ou d'avant le lot 5, quand ils étaient publics) : retirés
  // parties PUBLIQUES d'un grand texte (`risala-o<k>.json`) d'une construction précédente : retirées aussi
  for (const f of readdirSync(SORTIE))
    if (NOM_PROTEGE.test(f) || /^[a-z-]+-o\d+\.json$/.test(f)) rmSync(join(SORTIE, f));
  for (const f of readdirSync(SORTIE_PROTEGEE))
    if (f.endsWith('.json')) rmSync(join(SORTIE_PROTEGEE, f));
  const lignes = tanzil();
  const audio = [];
  for (const texte of TOUS_LES_TEXTES) {
    const { eleve, publique, audio: a } = ecrireTexte(texte, lignes);
    audio.push(...a);
    console.log(
      `${texte} : ${eleve.phrases.length} phrases, ${eleve.seances.length} séances, ${Buffer.byteLength(JSON.stringify(publique)) + 1} octets publics, version ${publique.version}`,
    );
  }
  const m = manifesteAudio(audio);
  writeFileSync(AUDIO_MANIFESTE, `${JSON.stringify(m)}\n`);
  console.log(`audio : ${Object.keys(m.fichiers).length} phrases avec un MP3 servi`);
}
