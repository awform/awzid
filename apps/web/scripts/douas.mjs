// Douas (phase 1) — construit `static/douas/douas.json`, les données de l'onglet « Douas » de « Vivre l'islam »,
// chargées À LA DEMANDE par l'application (jamais dans le code) et gardées sur l'appareil au premier usage.
//
// Sources (docs/projet/douas/) : `douas_phase1.json` (dossier du chercheur) et `DECISIONS_REFERENT_DOUAS.md`
// (fait loi), plus la présentation française `scripts/douas-presentation.json` (titres, moments, rubriques,
// liste de l'enfant, notes décidées par le référent).
//  - Texte arabe d'un hadith : la chaîne EXACTE du dossier (ni retapée, ni normalisée : pas de NFC).
//  - Douas du Coran : texte Tanzil (`infra/ci/contenu/coran/tanzil-uthmani.tsv`, copie verbatim), sous-chaîne
//    EXACTE du verset à partir de la référence (« s:v », « s:v-w », « à partir de « … » », « fin du verset »).
//    Le repère du chercheur sert seulement à TROUVER le début (comparaison des lettres, sans voyelles) ; le texte
//    copié est toujours celui de Tanzil, octet par octet. Aucune voix de synthèse (aucun audio pour l'instant).
//  - Les douas écartées et celles « en attente » (texte pas encore copié) ne sont jamais écrites.
// Usage : node scripts/douas.mjs   (échoue si une doua ne peut pas être copiée exactement)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(web, '..', '..');
export const SOURCE = join(repo, 'docs', 'projet', 'douas', 'douas_phase1.json');
export const PRESENTATION = join(web, 'scripts', 'douas-presentation.json');
export const OUT = join(web, 'static', 'douas', 'douas.json');
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
    .filter((c) => /[ء-غف-يٱ]/.test(c))
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

/**
 * Marques du chercheur (décision du référent, ajout du 12/10) — SEULES exceptions à « chaîne exacte », listées
 * par doua dans la présentation (`nettoyage`) : U+200F retirés ; « ... » → « … » (extrait d'un hadith plus long) ;
 * « (×3) », « (×7) » retirés (le nombre est dit en français dans le moment). Rien d'autre n'est touché.
 */
export const NETTOYAGES = {
  rlm: (t) => t.replace(/‏/g, ''),
  points: (t) => t.replace(/\.\.\./g, '…'),
  fois: (t) => t.replace(/ \(×\d+\)/g, ''),
};
function nettoyer(texte, ops, id) {
  let t = texte;
  for (const op of ops) {
    const u = NETTOYAGES[op](t);
    if (u === t) throw new Error(`nettoyage « ${op} » sans effet : ${id}`);
    t = u;
  }
  if (/[‏×]|\.\.\./.test(t)) throw new Error(`marque du chercheur restée dans le texte : ${id}`);
  return t;
}

export function construire({ tanzil = readTanzil() } = {}) {
  if (!tanzil) throw new Error(`Tanzil introuvable (${tanzilPath()}) : AWFORM_CONTENT_DIR ?`);
  const raw = readFileSync(SOURCE);
  const src = JSON.parse(raw.toString('utf8'));
  const pres = JSON.parse(readFileSync(PRESENTATION, 'utf8'));
  const attente = new Set(pres.en_attente);
  const ecartes = new Set(src.ecartees.map((e) => e.id));
  const douas = {};
  const rubriqueDe = new Map(pres.rubriques.flatMap((r) => r.de.map((d) => [d, r.id])));
  const parRubrique = Object.fromEntries(pres.rubriques.map((r) => [r.id, []]));
  for (const x of src.douas) {
    if (attente.has(x.id) || ecartes.has(x.id)) continue;
    const p = pres.douas[x.id];
    if (!p) throw new Error(`présentation absente : ${x.id}`);
    const r = rubriqueDe.get(x.rubrique);
    if (!r) throw new Error(`rubrique inconnue : ${x.rubrique} (${x.id})`);
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
    }
    const d = {
      rubrique: r,
      titre: p.titre,
      moment: p.moment,
      source,
      // traduction : vide tant qu'aucune source publiée n'est retenue (« Traduction en préparation »)
      traduction: x.traduction_fr ?? '',
      // emplacement de l'audio HUMAIN futur (récitant, jamais de voix de synthèse) : rien pour l'instant
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
    // verset cité dans un hadith : formulation du narrateur gardée, signalée (jamais de voix de synthèse)
    if (p.coran_cite) d.coran_cite = true;
    douas[x.id] = d;
    parRubrique[r].push(x.id);
  }
  for (const id of Object.keys(pres.douas))
    if (!douas[id]) throw new Error(`présentation sans doua retenue : ${id}`);
  for (const id of pres.enfant) if (!douas[id]) throw new Error(`doua d'enfant inconnue : ${id}`);
  return {
    v: 1,
    edition: pres.edition,
    source_sha256: sha256(raw),
    rubriques: pres.rubriques.map((r) => ({ id: r.id, douas: parRubrique[r.id] })),
    enfant: pres.enfant,
    douas,
  };
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
  console.log(
    `douas : ${Object.keys(data.douas).length} retenues, ${data.rubriques.length} rubriques, ${data.enfant.length} pour l'enfant → ${OUT}`,
  );
}
