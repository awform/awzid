// Madjaliss (P3-1) : construit les données de l'élève et du mode enseignant d'un texte (matn) À PARTIR DES SEULES
// SOURCES du dépôt — rien n'est rédigé ici :
//  - packages/content/madjaliss-source/<texte>/{texte_ar,traduction_fr,seances}.json (référent, 12 et 13/10/2026),
//    plus pour l'Ājurrūmiyya `explications_kafrawi.json` et `code_visuel_grammaire.json`, et pour la Jazariyya la note
//    destinée à l'élève de `alignement_tuhfa.json` ;
//  - texte coranique cité : `coran/tanzil-uthmani.tsv` (copie figée de Tanzil, octet par octet, jamais retapé), sens du
//    verset : traduction de référence de l'application (static/traductions/french_rashid).
// Écrit static/mutun/<texte>.json (élève, chargé à la demande et gardé au premier usage) et
// static/mutun/<texte>-enseignant.json (variantes, vocalisations « à vérifier », choix de traduction, passages à relire).
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
// Usage : node scripts/madjaliss.mjs (contrôlé par src/lib/madjaliss/*.test.ts : fichiers à jour).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(web, '..', '..');
export const SOURCES = join(repo, 'packages', 'content', 'madjaliss-source');
export const SORTIE = join(web, 'static', 'mutun');
export const STATUT = 'EN_ATTENTE_SECONDE_LECTURE';
/** Libellés acceptés en entrée (migration : l'ancien libellé est encore dans al-Akhḍarī, al-ʿAshmāwiyya, Ibn ʿĀshir, al-ʿIzziyya). */
export const STATUTS_ACCEPTES = new Set([STATUT, 'VALIDATION_HUMAINE_REQUISE']);

/** Textes intégrés, dans l'ordre de la rubrique (cycle 1 à 3 du plan directeur). */
export const TEXTES = [
  'akhdari',
  'ashmawiyya',
  'tuhfa',
  'ibn-ashir',
  'izziyya',
  'ajurrumiyya',
  'jazariyya',
];
const PREFIXE_TEXTE = {
  AKH: 'akhdari',
  ASH: 'ashmawiyya',
  AJR: 'ajurrumiyya',
  IBA: 'ibn-ashir',
  IZZ: 'izziyya',
  TUH: 'tuhfa',
  JAZ: 'jazariyya',
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
    '\\b(?:IBA|IZZ|ASH|AKH|AJR|TUH|JAZ|RIS)-\\d{4}\\b',
    'madjlis de la Risāla',
    'saisie numérique|lot ASH',
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
];

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

/** Phrases d'un texte_ar.json : `phrases` (prose) ou `vers` (poème). */
const unitesAr = (ar) => ar.phrases ?? ar.vers;
const idsSeance = (s) => s.phrases ?? s.vers;

/** Numéros des séances d'un texte : ordre de publication si le référent en fixe un, sinon l'ordre du fichier. */
const ordres = new Map();
export function ordreSeances(texte) {
  if (!ordres.has(texte)) {
    const se = lire(join(SOURCES, texte, 'seances.json'));
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
  const segs = coran.segments ?? [
    { sourate: coran.sourate, verset: coran.verset, texte: coran.texte },
  ];
  if (coran.voix_de_synthese !== false)
    throw new Error(`coran ${id} : voix de synthèse non exclue`);
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
  s.replace(/\s*\([^)]*(?:\bR-[A-Z0-9]+|RAPPORT)[^)]*\)/g, '').trim();

/** Retire d'une note les phrases internes (comité, référent, codes de décision…) ; '' si rien ne reste. */
export function nettoyerNote(texte) {
  const phrases = texte.split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ«(‹])/);
  return phrases
    .filter((p) => !PHRASE_INTERNE.test(p))
    .join(' ')
    .trim();
}
const sourceEleve = (s) =>
  SOURCE_INTERNE.test(s)
    ? null
    : s.replace(/,? copie par programme/, '').replace(/\s+\(\s*\)/g, '');

/** Notes d'explication (`note_explication` : objet ou liste) destinées à l'élève, et ce qui reste au mode enseignant. */
function notesEleve(n) {
  if (!n) return { notes: [], interne: [] };
  const notes = [];
  const interne = [];
  for (const x of Array.isArray(n) ? n : [n]) {
    if (typeof x.texte !== 'string' || !x.texte) throw new Error('note_explication sans texte');
    const texte = nettoyerNote(x.texte);
    if (texte !== x.texte) interne.push(x.texte);
    const src = [...(x.sources ?? []), ...(x.citations ?? []).map((c) => c.source).filter(Boolean)];
    const sources = [...new Set(src.map(sourceEleve).filter(Boolean))];
    // remarques d'éditeur entre crochets (français) dans une citation arabe : retirées de l'élève
    const ar = [
      ...(x.citations_ar ?? []),
      ...(x.citations ?? []).map((c) => c.ar).filter(Boolean),
    ].map((c) => c.replace(/\s*\[[^\]]*[A-Za-z][^\]]*\]/g, ''));
    if (!texte) continue;
    notes.push({
      texte,
      ...(sources.length ? { sources } : {}),
      ...(ar.length ? { ar } : {}),
    });
  }
  return { notes, interne };
}

/** Nom du style de soulignement (code visuel de la grammaire) d'après sa description. */
const STYLE = [
  [/plein/i, 'plein'],
  [/double/i, 'double'],
  [/ondul/i, 'ondule'],
  [/tiret|coup/i, 'tirete'],
];
function codeVisuel(texte) {
  const c = lire(join(SOURCES, texte, 'code_visuel_grammaire.json'));
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
  const e = lire(join(SOURCES, texte, 'explications_kafrawi.json'));
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

export function construire(texte = 'akhdari', lignes = tanzil()) {
  const dir = join(SOURCES, texte);
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
  const unites = unitesAr(ar);
  const frDe = new Map(fr.phrases.map((p) => [p.id, p]));
  const variantes = new Map((ar.variantes ?? []).map((v) => [v.id, v]));
  const seancesSrc = ordreSeances(texte);
  const dansSeance = new Set(seancesSrc.flatMap(idsSeance));
  const arDe = new Map(unites.map((p) => [p.id, p]));
  for (const id of dansSeance) if (!arDe.has(id)) throw new Error(`séance : ${id} absent du texte`);

  // intertitres d'éditeur (poèmes) : avant le vers qui les suit
  const titres = new Map();
  for (const t of ar.titres ?? []) {
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
  for (const p of unites) {
    if (!dansSeance.has(p.id)) {
      if (!p.hors_matn) throw new Error(`phrase hors séance : ${p.id}`);
      continue;
    }
    const f = frDe.get(p.id);
    if (!f) throw new Error(`traduction manquante ${p.id}`);
    if (!STATUTS_ACCEPTES.has(f.statut)) throw new Error(`statut ${p.id} : ${f.statut}`);
    const verset = p.hemistiches !== undefined;
    const t = p.type;
    const comite = [];
    // champs internes : mode enseignant seulement
    const aVerifier = [
      ...(p.a_verifier ?? []),
      ...(p.voyelle_a_confirmer ?? []).map((v) =>
        typeof v === 'string'
          ? v
          : `${v.mot} : ${v.motif ?? v.raison} (lecture retenue : ${v.lecture_retenue ?? v.retenu})`,
      ),
      ...(voyelleJaz.get(p.id) ?? []).map(
        (v) => `${v.mot} : ${v.raison} (lecture retenue : ${v.retenu})`,
      ),
    ];
    const incertain = aVerifier.length > 0;
    if (retenus.has(p.id)) {
      phrases.push({ id: p.id, t, explication: true, ...(adulte(p.id) ? { adulte: true } : {}) });
      noterEns(p.id, { a_verifier: aVerifier });
      continue;
    }
    const { notes: notesN, interne } = notesEleve(f.note_explication);
    const notes = [...notesN, ...(explications.get(p.id) ?? []), ...(noteJaz.get(p.id) ?? [])];
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
    const frEleve = sansNote.replace(EMPLACEMENT_SENS, '[…]');
    if (EMPLACEMENT_RESTANT.test(frEleve))
      throw new Error(`emplacement non rempli ${p.id} (traduction)`);

    let corps;
    if (verset) corps = { h: [...p.hemistiches], fr: frEleve };
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
    phrases.push({ ...base, ...corps, ...ajout, ...(notes.length ? { notes } : {}) });

    // mode enseignant
    const trad = [f.note_traduction, f.note_khafd_jarr, typeof f.note === 'string' ? f.note : null]
      .filter(Boolean)
      .join(' / ');
    const nv = (p.variantes ?? []).map((v) => variantes.get(v) ?? { id: v });
    const note = (f.fr.match(NOTE_A_VERIFIER) ?? []).map((x) => x.trim());
    const dec = f.decision_referent ?? null;
    if (aVerifier.length || note.length || nv.length || trad || dec || comite.length)
      noterEns(p.id, {
        a_verifier: [...aVerifier, ...note],
        variantes: nv,
        ...(trad ? { traduction: trad } : {}),
        ...(dec ? { decision: dec } : {}),
        ...(comite.length ? { notes_internes: comite } : {}),
        ...(f.citations_ar?.length && trad ? { ar: f.citations_ar } : {}),
      });
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
      if (!cible || cible === texte || !TEXTES.includes(cible)) continue;
      const n = ordreSeances(cible).findIndex((x) => x.id === r) + 1;
      if (!n) throw new Error(`renvoi inconnu : ${r}`);
      out.push({ texte: cible, n });
    }
    return out;
  };
  const seances = seancesSrc.map((s) => {
    const ids = idsSeance(s);
    const mots = s.mots_difficiles.filter((m) => !reserve(s, m));
    const renvois = renvoisDe(s);
    const toutAdulte =
      s.niveau_min === 'adulte' || (ids.length > 0 && ids.every((id) => adulte(id)));
    return {
      n: numeroDe.get(s.id),
      id: s.id,
      titre: s.titre,
      duree: s.duree_min,
      phrases: ids,
      mots: mots.map((m) => ({ ar: m.ar, fr: sensMotEleve(m.sens) })),
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
    comite: seancesSrc
      .filter((s) => s.relecture_comite === true)
      .map((s) => ({ n: numeroDe.get(s.id), id: s.id, motif: s.motif_relecture ?? '' })),
    phrases: [...enseignantPhrases.values()].filter(
      (x) =>
        x.a_verifier.length || x.variantes.length || x.traduction || x.decision || x.notes_internes,
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
  return { eleve, enseignant };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(SORTIE, { recursive: true });
  const lignes = tanzil();
  for (const texte of TEXTES) {
    const { eleve, enseignant } = construire(texte, lignes);
    const a = `${JSON.stringify(eleve)}\n`;
    writeFileSync(join(SORTIE, `${texte}.json`), a);
    writeFileSync(join(SORTIE, `${texte}-enseignant.json`), `${JSON.stringify(enseignant)}\n`);
    console.log(
      `${texte} : ${eleve.phrases.length} phrases, ${eleve.seances.length} séances, ${Buffer.byteLength(a)} octets, version ${eleve.version}`,
    );
  }
}
