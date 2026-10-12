// Madjaliss (P3-1) : construit les données de l'élève et du mode enseignant d'un texte (matn) À PARTIR DES SEULES
// SOURCES du dépôt — rien n'est rédigé ici :
//  - packages/content/madjaliss-source/<texte>/{texte_ar,traduction_fr,seances}.json (référent, 12/10/2026) ;
//  - texte coranique cité par l'auteur : Tanzil (packages/content/tajwid-source, octet par octet, jamais retapé),
//    sens du verset : traduction de référence de l'application (static/traductions/french_rashid).
// Écrit static/mutun/<texte>.json (élève, chargé à la demande et gardé au premier usage) et
// static/mutun/<texte>-enseignant.json (variantes, vocalisations « à vérifier », mots au sens non établi).
// Règles du référent appliquées (DECISIONS_REFERENT_TRADUCTION.md, T5 et T7) :
//  - AKH-0052 ne part JAMAIS sans son explication : tant qu'elle n'est pas rédigée, ni son arabe ni sa traduction
//    ne sont dans les fichiers (la page affiche « présenté avec son explication par l'enseignant — bientôt ») ;
//  - les mots du Coran cités (AKH-0015 : 9:62 ; AKH-0132 : 29:45) sont des sous-chaînes EXACTES de Tanzil, livrées
//    comme segments à part (jamais dans le texte mémorisé, questionné ni lu par une voix de synthèse) ;
//  - les notes d'explication du référent (`note_explication`) vont à l'élève, sous la phrase ; les notes de
//    traduction (`note_traduction` et leurs `citations_ar`) au mode enseignant seulement ;
//  - le brouillon « non publiable » de la traduction n'est jamais repris.
// Usage : node scripts/madjaliss.mjs (contrôlé par src/lib/madjaliss/donnees.test.ts : fichiers à jour).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(web, '..', '..');
export const SOURCES = join(repo, 'packages', 'content', 'madjaliss-source');
export const SORTIE = join(web, 'static', 'mutun');
export const STATUT = 'VALIDATION_HUMAINE_REQUISE';

/** Phrases jamais montrées sans leur explication (T7) : retirées des fichiers tant qu'elle manque. */
export const AVEC_EXPLICATION = new Set(['AKH-0052']);

/**
 * Mots du Coran cités par l'auteur : mots (indices de mots, bornes comprises) du verset Tanzil, déjà copiés
 * (par script, octet par octet) dans la phrase de l'auteur, entre ﴿﴾, avec un champ `coran` (T7, 12/10 :
 * AKH-0132, puis AKH-0015) : le script vérifie qu'ils sont IDENTIQUES à Tanzil et que la source les exclut de la
 * voix de synthèse (`voix_de_synthese: false`).
 *  - `sens` : la phrase n'est que la citation ; le sens du verset entier (traduction de référence) est joint.
 */
export const CITATIONS = {
  'AKH-0015': { s: 9, a: 62, mots: [4, 11], sens: true },
  'AKH-0132': { s: 29, a: 45, mots: [10, 13] },
};

/**
 * Note d'explication du référent (`note_explication` : avis retenu, règle pour les familles), montrée à l'élève sous
 * la phrase, avec ses sources et les citations arabes des commentaires (chacune sur sa ligne).
 */
const noteEleve = (n) => {
  if (!n) return {};
  if (typeof n.texte !== 'string' || !n.texte) throw new Error('note_explication sans texte');
  return {
    note: {
      texte: n.texte,
      ...(n.sources?.length ? { sources: n.sources } : {}),
      ...(n.citations_ar?.length ? { ar: n.citations_ar } : {}),
    },
  };
};

/** Sections réservées aux ados et aux adultes (pudeur, PLAN_DIRECTEUR « Adapté à l'âge »). */
export const SECTIONS_PUDEUR = new Set(['hayd', 'nifas']);
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

const lire = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** Texte Tanzil (sourate|verset|texte) : lignes exactes, jamais normalisées. */
export function tanzil() {
  const raw = gunzipSync(
    readFileSync(
      join(
        repo,
        'packages',
        'content',
        'tajwid-source',
        'tanzil-quran-uthmani-1.0.2-2017-04.txt.gz',
      ),
    ),
  ).toString('utf8');
  const m = new Map();
  for (const l of raw.split('\n')) {
    const x = /^(\d+)\|(\d+)\|(.*)$/.exec(l.replace(/\r$/, ''));
    if (x) m.set(`${x[1]}:${x[2]}`, x[3]);
  }
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

/** Portion d'un verset Tanzil (mots `de` à `a`) : sous-chaîne exacte de la ligne. */
export function portion(lignes, s, a, [de, fin]) {
  const ligne = lignes.get(`${s}:${a}`);
  if (!ligne) throw new Error(`verset introuvable ${s}:${a}`);
  const mots = ligne.split(' ');
  const p = mots.slice(de, fin + 1).join(' ');
  if (!ligne.includes(p) || !p) throw new Error(`portion invalide ${s}:${a}`);
  return p;
}

export function construire(texte = 'akhdari', lignes = tanzil()) {
  const dir = join(SOURCES, texte);
  const ar = lire(join(dir, 'texte_ar.json'));
  const fr = lire(join(dir, 'traduction_fr.json'));
  const se = lire(join(dir, 'seances.json'));
  const frDe = new Map(fr.phrases.map((p) => [p.id, p]));
  const variantes = new Map((ar.variantes ?? []).map((v) => [v.id, v]));
  const section = new Map(ar.phrases.map((p) => [p.id, p.section]));

  const phrases = ar.phrases.map((p) => {
    const f = frDe.get(p.id);
    if (!f) throw new Error(`traduction manquante ${p.id}`);
    if (AVEC_EXPLICATION.has(p.id))
      return { id: p.id, t: p.type, statut: STATUT, explication: true };
    const c = CITATIONS[p.id];
    const base = {
      id: p.id,
      t: p.type,
      statut: STATUT,
      // détail réservé au mode enseignant ; l'élève voit le texte de base, jamais une question qui en dépend
      ...(p.a_verifier?.length ? { incertain: true } : {}),
      ...noteEleve(f.note_explication),
    };
    if (/\[TANZIL|À INSÉRER/.test(p.ar) || /\[TRADUCTION/.test(f.fr))
      throw new Error(`emplacement non rempli ${p.id}`);
    if (!c) {
      // mots du Coran hors de CITATIONS : jamais livrés comme texte de l'auteur (mémorisation, quiz, voix)
      if (/[﴿﴾]/.test(p.ar) || p.coran) throw new Error(`citation coranique non déclarée ${p.id}`);
      const fr = TRANSLIT_A_PRECISER.reduce(
        (x, mot) => x.replace(avecNote(mot), MOT_A_PRECISER),
        f.fr,
      ).replace(NOTE_A_VERIFIER, '');
      return { ...base, ...(fr !== f.fr ? { incertain: true } : {}), ar: p.ar, fr };
    }
    const q = { q: portion(lignes, c.s, c.a, c.mots), ref: `${c.s}:${c.a}` };
    // citation intégrée (T7) : le champ `coran` de la source doit désigner exactement ces mots de Tanzil
    const k = p.coran;
    if (!k || k.sourate !== c.s || k.verset !== c.a || k.texte !== q.q)
      throw new Error(`coran ${p.id} : différent de Tanzil ${q.ref}`);
    if (k.voix_de_synthese !== false)
      throw new Error(`coran ${p.id} : voix de synthèse non exclue`);
    const balise = `﴿${q.q}﴾`;
    const i = p.ar.indexOf(balise);
    if (i < 0 || p.ar.indexOf(balise, i + 1) >= 0 || /[﴿﴾]/.test(p.ar.replace(balise, '')))
      throw new Error(`citation ${p.id}`);
    const sens = c.sens ? sensVerset(c.s, c.a) : null;
    return {
      ...base,
      // segment vide (citation en fin de phrase) omis
      ar: [p.ar.slice(0, i), q, p.ar.slice(i + balise.length)].filter((x) => x !== ''),
      fr: f.fr,
      ...(sens ? { sens: { ref: q.ref, texte: sens.texte, source: sens.cle } } : {}),
    };
  });

  const arDe = new Map(ar.phrases.map((p) => [p.id, p.ar]));
  /** mot difficile propre à une phrase retirée (AKH-0052) : il partirait sans elle, donc enseignant seulement */
  const lieAuRetrait = (s, m) => {
    const out = s.phrases.filter((id) => AVEC_EXPLICATION.has(id)).map((id) => arDe.get(id));
    const vus = s.phrases.filter((id) => !AVEC_EXPLICATION.has(id)).map((id) => arDe.get(id));
    return m.ar
      .split(' / ')
      .some((w) => out.some((a) => a.includes(w)) && !vus.some((a) => a.includes(w)));
  };
  const reserve = (s, m) => SENS_A_VERIFIER.test(m.sens) || lieAuRetrait(s, m);
  const seances = se.seances.map((s, i) => {
    const mots = s.mots_difficiles.filter((m) => !reserve(s, m));
    return {
      n: i + 1,
      id: s.id,
      titre: s.titre,
      duree: s.duree_min,
      phrases: s.phrases,
      mots: mots.map((m) => ({ ar: m.ar, fr: m.sens })),
      ...(s.phrases.some((id) => SECTIONS_PUDEUR.has(section.get(id))) ? { pudeur: true } : {}),
    };
  });
  const corps = { phrases, seances };
  const version = createHash('sha256').update(JSON.stringify(corps)).digest('hex').slice(0, 12);
  const eleve = {
    v: 1,
    id: texte,
    version,
    statut: STATUT,
    oeuvre: ar.oeuvre,
    traduction: fr.traduction,
    ...corps,
  };
  const enseignant = {
    v: 1,
    id: texte,
    version,
    statut: STATUT,
    decoupage: se.a_confirmer,
    phrases: ar.phrases
      .map((p) => ({
        p,
        f: frDe.get(p.id),
        note: (frDe.get(p.id)?.fr.match(NOTE_A_VERIFIER) ?? []).map((x) => x.trim()),
      }))
      .filter(
        ({ p, f, note }) =>
          p.a_verifier?.length || p.variantes?.length || note.length || f?.note_traduction,
      )
      .map(({ p, f, note }) => ({
        id: p.id,
        a_verifier: [...(p.a_verifier ?? []), ...note],
        variantes: (p.variantes ?? []).map((v) => variantes.get(v) ?? { id: v }),
        // choix de traduction du référent (R-05, R-06) : précision pédagogique pour l'enseignant seulement
        ...(f?.note_traduction ? { traduction: f.note_traduction } : {}),
        ...(f?.note_traduction && f.citations_ar?.length ? { ar: f.citations_ar } : {}),
      })),
    mots: se.seances.flatMap((s, i) =>
      s.mots_difficiles
        .filter((m) => reserve(s, m))
        .map((m) => ({
          n: i + 1,
          ar: m.ar,
          fr: m.sens,
          motif: SENS_A_VERIFIER.test(m.sens) ? 'sens' : 'explication',
        })),
    ),
  };
  return { eleve, enseignant };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { eleve, enseignant } = construire('akhdari');
  mkdirSync(SORTIE, { recursive: true });
  writeFileSync(join(SORTIE, 'akhdari.json'), `${JSON.stringify(eleve)}\n`);
  writeFileSync(join(SORTIE, 'akhdari-enseignant.json'), `${JSON.stringify(enseignant)}\n`);
  console.log(
    `akhdari : ${eleve.phrases.length} phrases, ${eleve.seances.length} séances, version ${eleve.version}`,
  );
}
