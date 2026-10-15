// Douas (phases 1 à 3) — construit `static/douas/douas.json`, les données de l'onglet « Douas » de « Vivre l'islam »,
// chargées À LA DEMANDE par l'application (jamais dans le code) et gardées sur l'appareil au premier usage.
//
// Sources (docs/projet/douas/) : `douas_phase1.json` (dossier du chercheur, 12/10), `douas_phase2.json` (dossier du
// référent, 15/10 : chaque texte lu sur sunnah.com ou dorar.net, empreinte SHA-256 notée et contrôlée ici),
// `traductions_fr.json` (sens en français) et `DECISIONS_REFERENT_DOUAS.md` (fait loi), plus la présentation française
// `scripts/douas-presentation.json` (titres, moments, rubriques, groupes, renvois, fiche « Comment invoquer », liste
// de l'enfant, notes décidées par le référent).
//  - Texte arabe d'un hadith : la chaîne EXACTE du dossier (ni retapée, ni normalisée : pas de NFC).
//  - Douas du Coran : texte Tanzil (`infra/ci/contenu/coran/tanzil-uthmani.tsv`, copie verbatim), sous-chaîne
//    EXACTE du verset à partir de la référence (« s:v », « s:v-w », « à partir de « … » », « fin du verset »).
//    Le repère du chercheur sert seulement à TROUVER le début (comparaison des lettres, sans voyelles) ; le texte
//    copié est toujours celui de Tanzil, octet par octet. JAMAIS de voix de synthèse.
//  - Audio : voix de synthèse PROVISOIRE pour les hadiths seulement (`static/douas/audio/index.json`, produit par
//    l'outillage audio Windows avec la garde Coran V3) ; un fichier n'est servi que si l'empreinte SHA-1 du texte
//    affiché est celle du texte synthétisé. Jamais pour un verset, ni pour un hadith qui cite un verset.
//  - Les douas écartées et celles « en attente » (texte pas encore copié) ne sont jamais écrites.
// Usage : node scripts/douas.mjs   (échoue si une doua ne peut pas être copiée exactement)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(web, '..', '..');
export const SOURCE = join(repo, 'docs', 'projet', 'douas', 'douas_phase1.json');
export const SOURCE2 = join(repo, 'docs', 'projet', 'douas', 'douas_phase2.json');
/** phase 3 (15/10) : même méthode que la phase 2 (texte copié par script, empreinte contrôlée) */
export const SOURCE3 = join(repo, 'docs', 'projet', 'douas', 'douas_phase3.json');
export const TRADUCTIONS = join(repo, 'docs', 'projet', 'douas', 'traductions_fr.json');
export const PRESENTATION = join(web, 'scripts', 'douas-presentation.json');
export const OUT = join(web, 'static', 'douas', 'douas.json');
export const AUDIO_DIR = join(web, 'static', 'douas', 'audio');
/** Copie Tanzil du dépôt (infra/ci/contenu, verbatim, identique à celle de l'édition), sinon celle de l'édition. */
export const tanzilPath = () =>
  [
    join(repo, 'infra', 'ci', 'contenu', 'coran', 'tanzil-uthmani.tsv'),
    join(
      process.env.AWFORM_CONTENT_DIR ?? join(homedir(), 'awform-content'),
      'coran',
      'tanzil-uthmani.tsv',
    ),
  ].find((p) => existsSync(p)) ?? '';

/** Versets Tanzil « s:a » → texte, lus comme `loadTanzil` (@awform/content) : fin de ligne CRLF ôtée, rien d'autre. */
export function readTanzil(path = tanzilPath()) {
  if (!existsSync(path)) return null;
  const out = new Map();
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const tab = line.indexOf('\t');
    if (tab > 0)
      out.set(
        line
          .slice(0, tab)
          .replace(/^\uFEFF/, '')
          .trim(),
        line.slice(tab + 1).replace(/^\uFEFF/, ''),
      );
  }
  return out;
}

/**
 * Lettres seules d'un mot (sans voyelles ni signes ; alif waṣla et alif madda comptés comme alif) : sert
 * seulement à TROUVER un repère du chercheur dans le verset (son écriture peut différer de Tanzil).
 */
const lettres = (w) =>
  [...w]
    .filter((c) => /[ء-غف-ي\u0671]/.test(c))
    .map((c) => (c === 'ٱ' || c === 'آ' ? 'ا' : c))
    .join('');

/**
 * Passage coranique d'une référence du dossier : liste de { s, a, text } où `text` est une sous-chaîne EXACTE
 * du verset Tanzil (le verset entier, ou la fin du verset à partir du repère, toujours au début d'un mot).
 */
export function passage(ref, tanzil) {
  const m = /^(\d+):(\d+)(?:-(\d+))?/.exec(ref);
  if (!m) throw new Error(`référence coranique illisible : ${ref}`);
  const s = Number(m[1]);
  const from = Number(m[2]);
  const to = Number(m[3] ?? m[2]);
  const repere = /«\s*([^»]+?)\s*»/.exec(ref)?.[1] ?? null;
  const out = [];
  for (let a = from; a <= to; a++) {
    const verse = tanzil.get(`${s}:${a}`);
    if (verse === undefined) throw new Error(`verset absent de Tanzil : ${s}:${a}`);
    out.push({ s, a, text: verse });
  }
  if (!repere) return out;
  if (from !== to) throw new Error(`repère sur plusieurs versets : ${ref}`);
  const verse = out[0].text;
  // mots du verset avec leur position (les signes de pause seuls ne sont pas des mots)
  const mots = [...verse.matchAll(/\S+/g)]
    .map((x) => ({ at: x.index, l: lettres(x[0]) }))
    .filter((x) => x.l);
  const cherche = repere.split(/\s+/).map(lettres).filter(Boolean);
  const debuts = mots.map((_, i) => i).filter((i) => cherche.every((l, j) => mots[i + j]?.l === l));
  if (debuts.length !== 1)
    throw new Error(`repère « ${repere} » trouvé ${debuts.length} fois dans ${s}:${from}`);
  const i = debuts[0];
  // « fin du verset » / passage entier : le repère doit aller jusqu'au dernier mot
  if (!/partir de/.test(ref) && i + cherche.length !== mots.length)
    throw new Error(`le repère « ${repere} » ne finit pas le verset ${s}:${from}`);
  return [{ s, a: from, text: verse.slice(mots[i].at) }];
}

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const sha1 = (s) => createHash('sha1').update(s, 'utf8').digest('hex');

/**
 * Marques du chercheur (décision du référent, ajout du 12/10) — SEULES exceptions à « chaîne exacte », listées
 * par doua dans la présentation (`nettoyage`) : U+200F retirés ; « ... » → « … » (extrait d'un hadith plus long) ;
 * « (×3) », « (×7) » retirés (le nombre est dit en français dans le moment). Phase 2 : espace isolée avant une
 * virgule arabe retirée (mise en page de la source). Rien d'autre n'est touché.
 */
export const NETTOYAGES = {
  rlm: (t) => t.replace(/\u200F/g, ''),
  points: (t) => t.replace(/\.\.\./g, '…'),
  fois: (t) => t.replace(/ \(×\d+\)/g, ''),
  // deux formules (MOS-01) ou deux versets (VOY-01) : le séparateur du chercheur devient un saut de ligne
  ligne_point: (t) => t.replace(/ \. /g, '\n'),
  ligne_etoile: (t) => t.replace(/ \* /g, '\n'),
  espace_virgule: (t) => t.replace(/ ،/g, '،'),
};
function nettoyer(texte, ops, id) {
  let t = texte;
  for (const op of ops) {
    const u = NETTOYAGES[op](t);
    if (u === t) throw new Error(`nettoyage « ${op} » sans effet : ${id}`);
    t = u;
  }
  if (/[\u200F×*]|\.\.\.| \. | ،/.test(t))
    throw new Error(`marque du chercheur restée dans le texte : ${id}`);
  return t;
}

/** Liens permis pour une source citée en français (hadith lu, jugement lu, ouvrage de fiqh lu). */
const LIEN_SOURCE =
  /^https:\/\/(sunnah\.com\/[a-z]+:\d+[a-z]?|dorar\.net\/h\/[A-Za-z0-9]+|app\.turath\.io\/book\/\d+\?page=\d+)$/;
/**
 * Points en français (fiches, « À savoir », « Ce que nous n'ajoutons pas ») : aucun mot arabe sur la ligne, chaque
 * source avec un recueil et un lien lu. Un point sans source n'est permis que s'il dit ce que nous N'ajoutons PAS,
 * ou qu'une question est encore en cours de vérification.
 */
function verifierPoints(points, ou, sansSourcePermis) {
  if (!Array.isArray(points) || !points.length) throw new Error(`points absents : ${ou}`);
  for (const p of points) {
    if (!p.texte || /[؀-ۿ]/.test(p.texte))
      throw new Error(`point invalide (arabe ou vide) : ${ou}`);
    if (!p.sources.length && !sansSourcePermis) throw new Error(`point sans source : ${ou}`);
    for (const s of p.sources)
      if (!s.recueil || !LIEN_SOURCE.test(s.lien ?? '') || /[؀-ۿ]/.test(s.recueil))
        throw new Error(`source invalide : ${ou} (${s.recueil})`);
  }
}

/** Garde Coran du générateur (la garde complète V3 est rejouée par l'outillage audio avant toute synthèse). */
// eslint-disable-next-line no-misleading-character-class -- marques coraniques isolées cherchées une à une
const graphieCoranique = (t) => /[\uFD3E\uFD3F\u0671\u06D6-\u06ED]/.test(t);

/** Index de l'audio de synthèse provisoire (id → fichier, empreinte SHA-1 du texte synthétisé). */
export function lireAudio(dir = AUDIO_DIR) {
  const f = join(dir, 'index.json');
  if (!existsSync(f)) return { index: null, fichiers: {} };
  const index = JSON.parse(readFileSync(f, 'utf8'));
  return { index, fichiers: index.fichiers ?? {} };
}

export function construire({ tanzil = readTanzil(), audioDir = AUDIO_DIR } = {}) {
  if (!tanzil) throw new Error(`Tanzil introuvable (${tanzilPath()}) : AWFORM_CONTENT_DIR ?`);
  const raw = readFileSync(SOURCE);
  const raw2 = readFileSync(SOURCE2);
  const raw3 = readFileSync(SOURCE3);
  const src = JSON.parse(raw.toString('utf8'));
  // phases 2 et 3 : même format (rubrique de l'application, empreinte de la source)
  const src2 = JSON.parse(raw2.toString('utf8'));
  const src3 = JSON.parse(raw3.toString('utf8'));
  src2.douas = [...src2.douas, ...src3.douas];
  src2.ecartees = [...src2.ecartees, ...src3.ecartees];
  const trad = JSON.parse(readFileSync(TRADUCTIONS, 'utf8')).traductions;
  const pres = JSON.parse(readFileSync(PRESENTATION, 'utf8'));
  const audio = lireAudio(audioDir);
  const attente = new Set(pres.en_attente);
  const ecartes = new Set([...src.ecartees, ...src2.ecartees].map((e) => e.id));
  const rubriquesApp = new Set(pres.rubriques.map((r) => r.id));
  // phase 2 : texte copié depuis la source, empreinte contrôlée ; remplace l'entrée « en attente » de la phase 1
  const ids2 = new Set();
  for (const x of src2.douas) {
    if (ids2.has(x.id)) throw new Error(`doua en double dans la phase 2 : ${x.id}`);
    ids2.add(x.id);
    if (!rubriquesApp.has(x.rubrique))
      throw new Error(`rubrique inconnue : ${x.rubrique} (${x.id})`);
    if (x.texte_ar) {
      if (!x.sha256 || sha256(Buffer.from(x.texte_ar, 'utf8')) !== x.sha256)
        throw new Error(`empreinte du texte ≠ celle lue sur la source : ${x.id}`);
    } else if (!x.coran_ref) throw new Error(`ni texte ni verset : ${x.id}`);
  }
  const toutes = [
    ...src.douas.filter((x) => !ids2.has(x.id)).map((x) => ({ x, phase: 1 })),
    ...src2.douas.map((x) => ({ x, phase: 2 })),
  ];
  const douas = {};
  const rubriqueDe = new Map(pres.rubriques.flatMap((r) => r.de.map((d) => [d, r.id])));
  const parRubrique = Object.fromEntries(pres.rubriques.map((r) => [r.id, []]));
  for (const { x, phase } of toutes) {
    if (attente.has(x.id) || ecartes.has(x.id)) continue;
    const p = pres.douas[x.id];
    if (!p) throw new Error(`présentation absente : ${x.id}`);
    const r = pres.deplacer?.[x.id] ?? (phase === 2 ? x.rubrique : rubriqueDe.get(x.rubrique));
    if (!r || !rubriquesApp.has(r)) throw new Error(`rubrique inconnue : ${x.rubrique} (${x.id})`);
    // panneau « Source » de l'élève : table relue (recueil, degré en français, savant), jamais les notes internes
    const s = p.source;
    if (!s?.recueil) throw new Error(`source absente : ${x.id}`);
    const source = { recueil: s.recueil };
    if (s.degre) source.degre = s.degre;
    if (s.juge) source.juge = s.juge;
    if (/^https:\/\/sunnah\.com\//.test(x.url_reference ?? '')) {
      // le lien doit désigner le hadith du recueil affiché (même numéro)
      const n = /\d+/.exec(s.recueil)?.[0];
      if (!n || !new RegExp(`[:/]${n}[a-z]?$`).test(x.url_reference))
        throw new Error(`lien ${x.url_reference} ≠ recueil « ${s.recueil} » (${x.id})`);
      source.lien = x.url_reference;
    } else if (/^https:\/\/dorar\.net\/h\/[A-Za-z0-9]+$/.test(x.url_reference ?? '')) {
      // dorar.net : page du hadith dont le texte a été copié (jugement et ouvrage cités dans le dossier)
      source.lien = x.url_reference;
    }
    const t = trad[x.id];
    if (!t?.fr) throw new Error(`traduction absente : ${x.id}`);
    if (/[؀-ۿ]/.test(t.fr)) throw new Error(`mot arabe dans la traduction : ${x.id}`);
    const d = {
      rubrique: r,
      titre: p.titre,
      moment: p.moment,
      source,
      traduction: t.fr,
      // voix de synthèse PROVISOIRE (hadiths seulement), renseignée plus bas ; jamais pour le Coran
      audio: null,
    };
    if (typeof x.texte_ar === 'string' && x.texte_ar) {
      if (/[A-Za-z]{4}/.test(x.texte_ar)) throw new Error(`texte arabe non copié : ${x.id}`);
      d.ar = nettoyer(x.texte_ar, pres.nettoyage[x.id] ?? [], x.id);
    } else {
      if (!x.coran_ref) throw new Error(`ni texte ni verset : ${x.id}`);
      d.coran = passage(x.coran_ref, tanzil);
    }
    if (p.note) d.note = p.note;
    if (p.compagnon) d.compagnon = p.compagnon;
    if (p.facultatif) d.facultatif = true;
    // plusieurs formules dans une carte : moment de chaque ligne (autant que de lignes du texte)
    if (p.lignes) {
      if (!d.ar || d.ar.split('\n').length !== p.lignes.length)
        throw new Error(`lignes ≠ formules : ${x.id}`);
      d.lignes = p.lignes;
    }
    // verset cité dans un hadith : formulation du narrateur gardée, signalée (jamais de voix de synthèse)
    if (p.coran_cite) d.coran_cite = true;
    // audio de synthèse provisoire : hadith seulement, texte identique (SHA-1) à celui qui a été synthétisé
    const a = audio.fichiers[x.id];
    if (a) {
      if (d.coran || d.coran_cite || !d.ar || graphieCoranique(d.ar))
        throw new Error(`audio de synthèse interdit pour un verset : ${x.id}`);
      const f = join(audioDir, a.fichier);
      if (
        a.texte_sha1 === sha1(d.ar) &&
        /^[A-Za-z0-9-]+\.mp3$/.test(a.fichier) &&
        existsSync(f) &&
        statSync(f).size > 0
      )
        d.audio = `/douas/audio/${a.fichier}`;
    }
    douas[x.id] = d;
    parRubrique[r].push(x.id);
  }
  for (const id of Object.keys(pres.douas))
    if (!douas[id]) throw new Error(`présentation sans doua retenue : ${id}`);
  for (const id of pres.enfant) if (!douas[id]) throw new Error(`doua d'enfant inconnue : ${id}`);
  for (const id of Object.keys(audio.fichiers))
    if (!douas[id]) throw new Error(`audio d'une doua inconnue : ${id}`);
  // ordre explicite d'une rubrique (sinon l'ordre des dossiers) : exactement les mêmes douas
  for (const r of pres.rubriques) {
    if (!r.ordre) continue;
    if ([...r.ordre].sort().join() !== [...parRubrique[r.id]].sort().join())
      throw new Error(`ordre de la rubrique ${r.id} ≠ ses douas`);
    parRubrique[r.id] = [...r.ordre];
  }
  const rubriques = pres.rubriques.map((r) => {
    const o = { id: r.id, douas: parRubrique[r.id] };
    // phase 3 : une rubrique peut n'avoir que des points « À savoir » (Naissance : aucune formule fixe du Prophète)
    if (!o.douas.length && !r.a_savoir?.length) throw new Error(`rubrique vide : ${r.id}`);
    for (const k of ['a_savoir', 'non_ajoute']) {
      if (!r[k]) continue;
      verifierPoints(r[k], `${r.id}.${k}`, k === 'non_ajoute');
      o[k] = r[k];
    }
    if (r.voir_aussi) {
      for (const v of r.voir_aussi) {
        if (v.doua && (!douas[v.doua] || douas[v.doua].rubrique === r.id))
          throw new Error(`renvoi invalide dans ${r.id} : ${v.doua}`);
        if (!v.doua && !(v.adhkar && v.titre && /^\/quotidien\/adhkar/.test(v.lien ?? '')))
          throw new Error(`renvoi invalide dans ${r.id}`);
      }
      o.voir_aussi = r.voir_aussi;
    }
    return o;
  });
  // groupes (architecture du référent) : chaque rubrique dans un seul groupe, dans l'ordre des rubriques
  const groupes = pres.groupes ?? [];
  const dansGroupes = groupes.flatMap((g) => g.rubriques);
  if (groupes.length && dansGroupes.join() !== rubriques.map((r) => r.id).join())
    throw new Error('groupes ≠ rubriques (ordre ou contenu)');
  const out = {
    v: 2,
    edition: pres.edition,
    source_sha256: sha256(raw),
    source2_sha256: sha256(raw2),
    source3_sha256: sha256(raw3),
    groupes,
    rubriques,
    enfant: pres.enfant,
    douas,
  };
  if (pres.fiches) {
    for (const [id, f] of Object.entries(pres.fiches)) {
      if (!/^[a-z]+$/.test(id) || !f.titre || !f.intro) throw new Error(`fiche invalide : ${id}`);
      for (const s of f.sections) verifierPoints(s.points, `fiche ${id}`, true);
      // renvois internes seulement (leçons de fiqh des Madjaliss), jamais un texte recopié
      for (const v of f.renvois ?? [])
        if (!v.titre || !/^\/madjaliss\/[a-z-]+\/\d+$/.test(v.lien ?? ''))
          throw new Error(`renvoi de fiche invalide : ${id}`);
    }
    out.fiches = pres.fiches;
  }
  if (audio.index) out.audio = { mention: audio.index.mention, voix: audio.index.voix };
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = construire();
  const json = `${JSON.stringify(data)}\n`;
  // --verifier : le fichier publié est-il exactement celui que donnent le dossier, la présentation et Tanzil ?
  if (process.argv.includes('--verifier')) {
    const same = existsSync(OUT) && readFileSync(OUT, 'utf8') === json;
    console.log(same ? 'douas : fichier publié à jour' : 'douas : fichier publié PÉRIMÉ');
    process.exit(same ? 0 : 1);
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, json);
  const nAudio = Object.values(data.douas).filter((d) => d.audio).length;
  console.log(
    `douas : ${Object.keys(data.douas).length} retenues, ${data.rubriques.length} rubriques, ${data.enfant.length} pour l'enfant, ${nAudio} avec audio provisoire → ${OUT}`,
  );
}
