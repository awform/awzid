#!/usr/bin/env node
/**
 * Génère `data/` (les données compactes servies par l'API) à partir de `source/` (les fichiers complets produits par
 * l'étude « Mots du Coran », 25/10/2026). Reproductible : mêmes sources, mêmes octets.
 *
 *   node scripts/generer.mjs [--source <dossier>] [--tanzil <tanzil-uthmani.tsv>] [--sortie <dossier>]
 *
 * Sans `--source`, lit `source/*.json.gz` (livrés avec ce paquet). Avec `--tanzil`, vérifie en plus que les formes
 * recollent le texte de Tanzil OCTET POUR OCTET (jetons hors signes de pause isolés, basmala de tête exclue).
 *
 * Données dérivées du Quranic Arabic Corpus 0.4 (Kais Dukes, université de Leeds ; http://corpus.quran.com) et du texte
 * de Tanzil (http://tanzil.net) : licence GNU GPL v3, voir ../LICENSE et ../NOTICE.md. Aucun texte coranique n'est
 * recopié à la main ni normalisé ici : les formes sont les jetons de Tanzil.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const ici = dirname(fileURLToPath(import.meta.url));
const paquet = join(ici, '..');
const arg = (nom) => {
  const i = process.argv.indexOf(nom);
  return i >= 0 ? process.argv[i + 1] : null;
};
const dossierSource = arg('--source');
const tanzilTsv = arg('--tanzil');
/** dossier d'écriture (par défaut data/ du paquet) : permet de vérifier que la régénération redonne les mêmes octets */
const dossierSortie = arg('--sortie');

/** Lit une source : `<nom>.json` dans le dossier donné, sinon `source/<nom>.json.gz` du paquet. */
function lire(nom) {
  if (dossierSource && existsSync(join(dossierSource, `${nom}.json`)))
    return JSON.parse(readFileSync(join(dossierSource, `${nom}.json`), 'utf8'));
  const gz = join(paquet, 'source', `${nom}.json.gz`);
  return JSON.parse(gunzipSync(readFileSync(gz)).toString('utf8'));
}

// fusions de la liste des 1 000 (clé du corpus → rang), comme `couverture.ps1` de l'étude
const FUSIONS = {
  24: ['<i*aA2'],
  56: ['m~u&omina`t'],
  73: ['kaAfir'],
  84: ['bunaY~'],
  106: ['>abN'],
  207: ['rijaAl'],
  271: ['kalima`t'],
  460: ['ladaY'],
  602: ["'aAmin"],
  686: ['Sadaqap'],
  730: ['SaY`Hib'],
  843: ['risaAlap'],
  855: ['xaTiy^_#a`t'],
};
const PLEIN = new Set(['N', 'PN', 'ADJ', 'V']);
/** signes de pause et ornements isolés : ne sont pas des mots (U+06D6 à U+06DC, U+06DE, U+06E9) */
const PAUSE = /^[ۖ-ۜ۞۩]+$/;

const liste = lire('mots_coran_1000').lemmes;
const liens = lire('liens_livres');
// le fichier de Tanzil de l'application porte un BOM (U+FEFF) en tête du verset 1:1 : retiré, comme le fait loadTanzil
const mots = lire('mots_coran').mots.map((m) => ({ ...m, forme: m.forme.replace(/^\uFEFF/, '') }));
const racinesSrc = lire('racines');

// groupe d'une clé de lemme : « R<rang> » pour les mots de la liste, sinon aucun
const groupe = new Map();
const arabeRang = new Map();
for (const e of liste) {
  for (const c of [e.lemme_corpus_buckwalter, ...(FUSIONS[e.n] ?? [])]) groupe.set(c, e.n);
  arabeRang.set(e.n, e.lemme_corpus_ar || e.arabe);
}
const rangDe = (bw) => groupe.get(bw) ?? 0;

// leçon qui enseigne le rang pour la première fois : « ad1/l07 » → « ad1.l07 » (identifiant d'unité de l'application)
const unites = new Map();
for (const [r, u] of Object.entries(liens.premiere_lecon_par_rang)) unites.set(Number(r), u.replace('/', '.'));

// ------------------------------------------------------------------ sourates (couverture)
const parSourate = new Map(); // s → Map(v → entrées)
const comptes = { mots: 0, versets: 0 };
for (const m of mots) {
  if (m.basmala) continue; // jetons de basmala que Tanzil place en tête du verset 1 : hors décompte
  const [s, v] = m.ref.split(':').map(Number);
  let entree;
  if (m.nature === 'INL' || !m.lemme_bw || /b$/.test(m.ref)) entree = -1; // lettres isolées, 2e jeton de 37:130
  else {
    const p = PLEIN.has(m.nature) ? 1 : 0;
    const gs = [m.lemme_bw, ...(m.autres_lemmes_bw ?? [])].filter(Boolean).map((b) => rangDe(b) * 2 + p);
    entree = gs.length === 1 ? gs[0] : gs;
    if (!/b$/.test(m.ref)) comptes.mots++;
  }
  const sv = parSourate.get(s) ?? new Map();
  const l = sv.get(v) ?? [];
  l.push(entree);
  sv.set(v, l);
  parSourate.set(s, sv);
}

const sortie = dossierSortie ?? join(paquet, 'data');
rmSync(sortie, { recursive: true, force: true });
mkdirSync(join(sortie, 'sourates'), { recursive: true });
const ecrire = (nom, texte) => writeFileSync(join(sortie, nom), texte, 'utf8');
const empreintes = {};
const sha = (t) => createHash('sha256').update(t).digest('hex');

for (let s = 1; s <= 114; s++) {
  const sv = parSourate.get(s);
  const versets = [];
  for (let v = 1; sv.has(v); v++) versets.push(sv.get(v));
  comptes.versets += versets.length;
  const t = `${JSON.stringify({ s, v: versets })}\n`;
  const nom = `sourates/${String(s).padStart(3, '0')}.json`;
  ecrire(nom, t);
  empreintes[nom] = sha(t);
}

// ------------------------------------------------------------------ rangs : arabe et leçon de chaque rang
const rangs = [null];
for (let n = 1; n <= 1000; n++) rangs.push(arabeRang.has(n) ? [arabeRang.get(n), unites.get(n) ?? null] : null);
{
  const t = `${JSON.stringify(rangs)}\n`;
  ecrire('rangs.json', t);
  empreintes['rangs.json'] = sha(t);
}

// ------------------------------------------------------------------ mots.tsv (recherche) et lemmes.tsv
const nettoie = (x) => String(x ?? '').replace(/[\t\r\n]/g, ' ');
const lignes = [];
const lemmes = new Map(); // bw → { ar, racine, natures{} }
for (const m of mots) {
  if (m.basmala) continue;
  lignes.push(
    [m.ref, m.forme, m.racine, m.lemme_bw, (m.autres_lemmes_bw ?? []).join(',')].map(nettoie).join('\t'),
  );
  for (const [bw, ar] of [[m.lemme_bw, m.lemme], ...(m.autres_lemmes_bw ?? []).map((b, i) => [b, m.autres_lemmes?.[i]])]) {
    if (!bw) continue;
    const l = lemmes.get(bw) ?? { ar: ar ?? '', racine: '', natures: {} };
    // la racine et la nature sont celles du radical principal du mot ; un lemme secondaire (pronom, particule) n'en prend pas
    if (bw === m.lemme_bw) {
      l.natures[m.nature_fr] = (l.natures[m.nature_fr] ?? 0) + 1;
      l.racine = m.racine;
    }
    if (!l.ar && ar) l.ar = ar;
    lemmes.set(bw, l);
  }
}
{
  const t = `${lignes.join('\n')}\n`;
  ecrire('mots.tsv', t);
  empreintes['mots.tsv'] = sha(t);
}
{
  const ls = [...lemmes.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const out = ls.map(([bw, l]) => {
    const nat = Object.entries(l.natures).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? '';
    return [bw, l.ar, l.racine, nat, rangDe(bw)].map(nettoie).join('\t');
  });
  const t = `${out.join('\n')}\n`;
  ecrire('lemmes.tsv', t);
  empreintes['lemmes.tsv'] = sha(t);
}

// ------------------------------------------------------------------ sens des racines (rédigés par Awzid, à valider)
{
  const out = {};
  for (const r of racinesSrc.racines)
    out[r.racine] = {
      sens: r.sens_de_base_fr ?? '',
      sources: r.sources ?? [],
      statut: r.statut ?? 'a_rediger',
      a_verifier: r.a_verifier !== false,
      ...(r.note ? { note: r.note } : {}),
    };
  const t = `${JSON.stringify(out)}\n`;
  ecrire('racines-sens.json', t);
  empreintes['racines-sens.json'] = sha(t);
}

// ------------------------------------------------------------------ vérification contre Tanzil (option)
if (tanzilTsv) {
  const tz = new Map(
    readFileSync(tanzilTsv, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [ref, ...t] = l.replace(/\r$/, '').split('\t');
        return [ref.replace(/^\uFEFF/, ''), t.join('\t').replace(/^\uFEFF/, '')];
      }),
  );
  const formes = new Map();
  for (const m of mots) {
    if (m.basmala) continue;
    const k = m.ref.split(':').slice(0, 2).join(':');
    formes.set(k, [...(formes.get(k) ?? []), m.forme]);
  }
  let ecarts = 0;
  for (const [ref, texte] of tz) {
    const [s, v] = ref.split(':').map(Number);
    const jetons = texte.split(' ').filter((x) => !PAUSE.test(x)).slice(v === 1 && s !== 1 && s !== 9 ? 4 : 0);
    const f = formes.get(ref) ?? [];
    if (jetons.length !== f.length || jetons.some((x, i) => x !== f[i])) ecarts++;
  }
  if (ecarts || tz.size !== 6236) throw new Error(`écart avec Tanzil : ${ecarts} versets sur ${tz.size}`);
  console.log(`Tanzil : 6236 versets, formes identiques octet pour octet`);
}

// ------------------------------------------------------------------ méta
{
  const t = `${JSON.stringify(
    {
      format: 1,
      source: racinesSrc.meta?.genere_le ?? '2026-10-25',
      mots: comptes.mots,
      versets: comptes.versets,
      attribution:
        'Analyse morphologique : Quranic Arabic Corpus 0.4 (Kais Dukes, université de Leeds), http://corpus.quran.com, licence GNU GPL v3 ; données modifiées par Awzid le 25/10/2026. Texte : Tanzil, http://tanzil.net, CC BY 3.0.',
      licence: 'GPL-3.0-only',
      empreintes,
    },
    null,
    1,
  )}\n`;
  ecrire('meta.json', t);
}
console.log(`données écrites : ${comptes.versets} versets, ${comptes.mots} mots comptés, ${lemmes.size} lemmes`);
