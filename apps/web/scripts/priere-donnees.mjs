// « La prière de A à Z » (25/10/2026) — données de l'APPLICATION tirées de la source unique du parcours
// (packages/content/data/priere/priere.json et sourates.json : copies EXACTES des fichiers du référent,
// application/priere/contenu/ ; animation.json : chorégraphie, sans aucun texte) :
//  - static/priere-data/plan.json : titres, statut, sections, citation de l'accueil, chorégraphie ;
//  - static/priere-data/s1.json … s8.json : une section par fichier (chargée seulement par l'écran qui la montre) ;
//  - static/priere-data/sourate-<n>.json : une sourate (mot à mot) par fichier ;
// chargés À LA DEMANDE par le parcours (jamais préchargés : `/priere-data/` est hors de la coquille du service worker)
// et gardés sur l'appareil à la première ouverture. Projection : on retire seulement ce que l'élève ne voit jamais
// (références internes de fichiers `ar_source`, états techniques, adresses de dossiers entre parenthèses dans les
// sources) ; AUCUN texte n'est modifié, l'arabe est recopié octet pour octet (contrôle : src/lib/priere/priere.test.ts).
// Usage : node scripts/priere-donnees.mjs   (relancer après chaque mise à jour des fichiers du référent)
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const depot = join(racine, '..', '..');
export const SOURCE = join(depot, 'packages', 'content', 'data', 'priere');
export const SORTIE = join(racine, 'static', 'priere-data');

/** clés internes jamais montrées à l'élève */
const RETIRE = new Set([
  'ar_source',
  'statut_technique',
  'illustration',
  'nom_ar_source',
  'transformations',
  'motif_squelette',
]);
/** parenthèses qui citent un dossier du dépôt : « (application/madjaliss/khalil) » */
const DOSSIER = /\s*\([^()]*(?:application\/|awform\/|coran\/|contenu\/)[^()]*\)/g;
export const nettoyerSource = (s) => String(s).replace(DOSSIER, '').trim();

/** copie profonde sans les clés internes ; sources nettoyées ; `mot_a_mot` qui n'est qu'un renvoi (texte) retiré */
export function projeter(o) {
  if (Array.isArray(o)) return o.map(projeter);
  if (!o || typeof o !== 'object') return o;
  const r = {};
  for (const [k, v] of Object.entries(o)) {
    if (RETIRE.has(k)) continue;
    if (k === 'mot_a_mot' && typeof v === 'string') continue;
    if (k === 'sources' && Array.isArray(v)) r[k] = v.map(nettoyerSource);
    else r[k] = projeter(v);
  }
  return r;
}

const lire = (n) => JSON.parse(readFileSync(join(SOURCE, n), 'utf8'));
const sha10 = (s) => createHash('sha1').update(s).digest('hex').slice(0, 10);

/** tous les éléments (récursivement) : pour retrouver une parole ou une règle par identifiant */
export function parcourir(o, f) {
  if (Array.isArray(o)) return o.forEach((x) => parcourir(x, f));
  if (o && typeof o === 'object') {
    f(o);
    for (const v of Object.values(o)) parcourir(v, f);
  }
}
export function trouver(racineObj, id) {
  let r = null;
  parcourir(racineObj, (o) => {
    if (!r && o.id === id) r = o;
  });
  return r;
}

/** Fichiers à écrire : { nom: objet } (même fonction pour le script et pour le test de synchronisation). */
export function fabriquer(priere, sourates, animation) {
  const sections = priere.sections.map(projeter);
  const version = sha10(JSON.stringify([priere, sourates, animation]));
  const citation = trouver(sections, animation.accueil.citation);
  // unités à parcourir par section (identifiants) : l'accueil en tire l'avancement sans charger les sections
  const etapes = (id) => (trouver(sections, id)?.etapes ?? []).map((e) => e.id);
  const unites = Object.fromEntries(sections.map((s) => [s.id, [s.id]]));
  unites.S2 = etapes('S2A.etapes');
  unites.S5 = etapes('S5.subh');
  unites.S6 = animation.apres.compteur;
  unites.S7 = (sections.find((s) => s.id === 'S7')?.sous_sections ?? []).map((x) => x.id);
  unites.S8 = sourates.sourates.map((x) => `S8.${x.numero}`);
  const out = {
    'plan.json': {
      format: 1,
      v: version,
      genere: priere.meta.genere_le,
      meta: projeter({
        titre: priere.meta.titre,
        public: priere.meta.public,
        ecole: priere.meta.ecole,
        statut: priere.meta.statut,
        niveaux: priere.meta.niveaux,
      }),
      sections: sections.map((s) => ({
        id: s.id,
        titre: s.titre,
        statut: s.statut,
        intro: s.intro,
      })),
      unites,
      citation,
      animation,
    },
  };
  for (const s of sections)
    out[`${s.id.toLowerCase()}.json`] = { format: 1, v: version, section: s };
  for (const so of sourates.sourates)
    out[`sourate-${so.numero}.json`] = {
      format: 1,
      v: version,
      basmala: projeter(sourates.basmala),
      sourate: projeter(so),
    };
  return out;
}

/** Texte JSON écrit (indentation nulle : fichiers petits) */
export const serialiser = (o) => `${JSON.stringify(o)}\n`;

export function ecrire() {
  const priere = lire('priere.json');
  const sourates = lire('sourates.json');
  const animation = lire('animation.json');
  const fichiers = fabriquer(priere, sourates, animation);
  mkdirSync(SORTIE, { recursive: true });
  let octets = 0;
  for (const [nom, o] of Object.entries(fichiers)) {
    const t = serialiser(o);
    octets += Buffer.byteLength(t);
    writeFileSync(join(SORTIE, nom), t);
  }
  return { fichiers: Object.keys(fichiers).length, octets };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = ecrire();
  console.log(
    `priere-data : ${r.fichiers} fichiers, ${(r.octets / 1024).toFixed(1)} Ko avant compression`,
  );
}
