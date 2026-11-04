/**
 * Mukhtaṣar Khalīl (4/11/2026, interrupteur `khalil`) : fabrique les fichiers COMPACTS servis à la demande par l'API
 * (`GET /api/v1/khalil/index` et `/chapitres/:k`) depuis la source du référent (`madjaliss/khalil/` : traduction_fr_*.json,
 * texte_ar_*.json, annexes/).
 *  - LE CHAPITRE DU JIHĀD N'EST JAMAIS ÉCRIT : fichiers `*_jihad_*`, unités KHL-1793 à KHL-1983 (marquées `restriction` dans la
 *    source : « jamais montrée aux élèves »). Le script échoue si ces trois repères ne coïncident pas exactement.
 *  - Aucun identifiant de la source n'est servi : les unités sont renumérotées de 1 à N sans trou ; les renvois « KHL-nnnn »
 *    des notes deviennent « n° x ».
 *  - Arabe recopié tel quel (aucune normalisation) ; mentions internes ⟦interne : …⟧ retirées ; notes de contexte gardées telles
 *    quelles (« relève du seul juge »).
 * Usage : node packages/content/scripts/khalil-compact.mjs <dossier source khalil>
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = process.argv[2];
if (!SRC) throw new Error('usage : khalil-compact.mjs <dossier source khalil>');
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'khalil');

const TITRES = {
  muqaddima: "Introduction de l'auteur",
  tahara: 'La purification (ṭahāra)',
  salat: 'La prière (ṣalāt)',
  zakat: "L'aumône légale (zakāt)",
  siyam: 'Le jeûne (ṣiyām)',
  itikaf: 'La retraite pieuse (iʿtikāf)',
  hajj: 'Le pèlerinage (ḥajj)',
  dhakat: "L'immolation rituelle (dhakāt)",
  mubah: 'Les aliments permis (mubāḥ)',
  udhiya: 'Le sacrifice (uḍḥiya) et la ʿaqīqa',
  aymane: 'Les serments (aymān)',
  nudhur: 'Les vœux (nudhūr)',
  musabaqa: 'La course (musābaqa)',
  khasais: 'Les particularités du Prophète ﷺ (khaṣāʾiṣ)',
  nikah: 'Le mariage (nikāḥ)',
  khul: 'Le divorce par compensation (khulʿ)',
  talaq: 'La répudiation (ṭalāq)',
  rajaa: "Le retour de l'épouse répudiée (rajʿa)",
  ila: 'Le serment de continence (īlāʾ)',
  zihar: "L'assimilation injurieuse (ẓihār)",
  lian: "Le serment d'anathème (liʿān)",
  idda: 'La retraite de viduité (ʿidda)',
  istibra: 'La purification de la matrice (istibrāʾ)',
  rida: "L'allaitement (raḍāʿ)",
  nafaqa: 'La pension (nafaqa)',
  hadana: "La garde de l'enfant (ḥaḍāna)",
  bay: 'La vente (bayʿ)',
  salam: 'La vente à livrer (salam), le prêt et la compensation',
  rahn: 'Le gage (rahn)',
  falas: 'La faillite (falas)',
  hajr: "L'interdiction (ḥajr)",
  sulh: 'La transaction (ṣulḥ)',
  hawala: 'La délégation de créance (ḥawāla)',
  daman: 'La garantie et le cautionnement (ḍamān)',
  sharika: 'La société (sharika)',
  wakala: 'Le mandat (wakāla)',
  iqrar: "L'aveu (iqrār)",
  wadia: 'Le dépôt (wadīʿa)',
  ariya: 'Le prêt à usage (ʿāriyya)',
  ghasb: "L'usurpation (ghaṣb)",
  shufa: 'La préemption (shufʿa)',
  qisma: 'Le partage (qisma)',
  qirad: 'La commandite (qirāḍ)',
  musaqat: "L'entretien des arbres contre une part du fruit (musāqāt)",
  ijara: 'La location (ijāra)',
  waqf: 'Les biens de mainmorte (waqf)',
  hiba: 'La donation (hiba)',
  luqata: "L'objet trouvé (luqaṭa)",
  qada: 'Le jugement (qaḍāʾ)',
  shahada: 'Les témoignages (shahāda)',
  dima: 'Le sang (dimāʾ)',
  bughat: 'La rébellion (baghy)',
  ridda: "L'apostasie (ridda)",
  zina: 'La fornication (zinā)',
  qadhf: "L'accusation calomnieuse (qadhf)",
  sariqa: 'Le vol (sariqa)',
  hiraba: 'Le brigandage (ḥirāba)',
  shurb: 'La boisson (shurb)',
  itq: "L'affranchissement (ʿitq)",
  tadbir: "L'affranchissement posthume (tadbīr)",
  kitaba: "L'affranchissement contractuel (kitāba)",
  ummwalad: "La mère d'enfant (umm walad)",
  wala: 'Le patronage (walāʾ)',
  wasaya: 'Les testaments (waṣāyā)',
  faraid: 'Les successions (farāʾiḍ)',
  mugharasa: "Annexe : le complant (mughārasa), propre à l'édition de 1923",
};
const EXCLU = 'jihad';
const J1 = 1793;
const J2 = 1983;

const lireJ = (p) => JSON.parse(readFileSync(p, 'utf8'));
/** fichiers [chemin trad, chemin arabe] */
const lots = [];
for (const f of readdirSync(SRC).filter((x) => /^traduction_fr_.+\.json$/.test(x)))
  lots.push([join(SRC, f), join(SRC, f.replace('traduction_fr_', 'texte_ar_'))]);
for (const f of readdirSync(join(SRC, 'annexes')).filter((x) => /^traduction_fr_.+\.json$/.test(x)))
  lots.push([
    join(SRC, 'annexes', f),
    join(SRC, 'annexes', f.replace('traduction_fr_', 'texte_ar_')),
  ]);

const parChap = new Map();
let exclusFichiers = 0;
const exclusIds = new Set();
for (const [pt, pa] of lots) {
  const k = pt
    .split(/[\\/]/)
    .pop()
    .replace('traduction_fr_', '')
    .replace(/\.json$/, '')
    .split('_')[0];
  const t = lireJ(pt);
  const a = lireJ(pa);
  const ar = new Map(a.phrases.map((p) => [p.id, p]));
  if (k === EXCLU) {
    exclusFichiers++;
    for (const p of t.phrases) exclusIds.add(p.id);
    continue;
  }
  if (!TITRES[k]) throw new Error(`chapitre inconnu : ${k}`);
  const sous = (t.oeuvre.split(' : ').slice(1).join(' : ') || '').replace(
    /\s*\((KHL|MGH)-[^)]*\)\s*$/,
    '',
  );
  for (const p of t.phrases) {
    if (p.restriction) throw new Error(`unité restreinte hors du chapitre exclu : ${p.id}`);
    const n = /^KHL-(\d{4})$/.exec(p.id);
    if (n && +n[1] >= J1 && +n[1] <= J2)
      throw new Error(`unité du jihād hors de ses fichiers : ${p.id}`);
    const x = ar.get(p.id);
    if (!x || typeof x.ar !== 'string') throw new Error(`arabe manquant : ${p.id}`);
    if (!parChap.has(k)) parChap.set(k, []);
    parChap.get(k).push({ p, ar: x.ar, titre: x.type === 'titre', sous, o: p.ordre_livre ?? 1e6 });
  }
}
// contrôle : le chapitre exclu = exactement KHL-1793..KHL-1983
const attendu = [];
for (let i = J1; i <= J2; i++) attendu.push(`KHL-${String(i).padStart(4, '0')}`);
if (
  exclusFichiers === 0 ||
  exclusIds.size !== attendu.length ||
  attendu.some((x) => !exclusIds.has(x))
)
  throw new Error(`chapitre du jihād : repères incohérents (${exclusIds.size} unités)`);

// ordre du livre (l'annexe à la fin)
const chapitres = [...parChap.entries()]
  .map(([k, u]) => [k, u.sort((a, b) => a.o - b.o || a.p.id.localeCompare(b.p.id))])
  .sort((a, b) => (a[0] === 'mugharasa') - (b[0] === 'mugharasa') || a[1][0].o - b[1][0].o);

// renumérotation sans trou
const numero = new Map();
let n = 0;
for (const [, u] of chapitres) for (const x of u) numero.set(x.p.id, ++n);

const INTERNE = /\s*⟦interne[^⟧]*⟧/g;
const nettoie = (s) =>
  typeof s === 'string'
    ? s
        .replace(INTERNE, '')
        .replace(/\b(KHL|MGH)-(\d{2,4})\b/g, (m) => {
          const v = numero.get(m);
          if (!v) throw new Error(`renvoi vers une unité non publiée : ${m}`);
          return `n° ${v}`;
        })
        .replace(/\s{2,}/g, ' ')
        .trim()
    : undefined;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const index = { total: n, c: [] };
for (const [k, u] of chapitres) {
  const ctx = [];
  const sections = [];
  const unites = u.map((x) => {
    if (!sections.length || sections[sections.length - 1].t !== x.sous)
      sections.push({ t: x.sous, n: numero.get(x.p.id) });
    const o = { n: numero.get(x.p.id), ar: x.ar, fr: nettoie(x.p.fr) };
    if (x.titre) o.ti = 1;
    const e = x.p.note_explication;
    if (e && e.texte) {
      o.e = { tx: nettoie(e.texte) };
      if (e.titre) o.e.ti = nettoie(e.titre);
    }
    if (x.p.note_contexte) {
      let i = ctx.indexOf(x.p.note_contexte);
      if (i < 0) i = ctx.push(x.p.note_contexte) - 1;
      o.c = i;
    }
    return o;
  });
  const contextes = ctx.map(nettoie);
  writeFileSync(
    join(OUT, `${k}.json`),
    JSON.stringify({ k, t: TITRES[k], s: sections, ctx: contextes, u: unites }),
  );
  index.c.push({
    k,
    t: TITRES[k],
    d: unites[0].n,
    f: unites[unites.length - 1].n,
    s: sections.length,
  });
}
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));
console.log(
  `khalil : ${n} unités, ${index.c.length} chapitres ; exclu : jihād ${attendu[0]} à ${attendu[attendu.length - 1]} (${attendu.length})`,
);
