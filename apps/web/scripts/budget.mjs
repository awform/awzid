// Budget de poids (CDC § 4.3, ARCHITECTURE_V2 § 3.3 ; décisions D4, D-A27 ; lot F5 : mesure REPENSÉE par le chef de
// projet, 06/10/2026). Mesure après `vite build`, compression Brotli (qualité 11), trois indicateurs utiles :
//  (a) APPAREIL D'UN ÉLÈVE : tout ce que le service worker précharge — JS + CSS de la coquille ET catalogues de
//      textes préchargés (fr-quotidien, fr-vivre…) — sans les pages du personnel, les pages rares, les modules
//      « en ligne » ni les leçons vivantes (gardés au premier usage) : ≤ 350 Ko, BLOQUANT ;
//  (b) PREMIÈRE OUVERTURE : JS + CSS initiaux de la page d'accueil de l'élève (`/`, « Mon arabe ») : ≤ 150 Ko,
//      BLOQUANT ; et toujours la page la plus lourde au premier chargement ≤ 150 Ko (CDC § 4.3), BLOQUANT ;
//  (c) OUVERTURE EN 3G SIMULÉE (téléphone moyen : CPU ×4, 150 ms, 1,6 Mbit/s) < 3 s : mesurée par Playwright
//      (e2e/perf.spec.ts, bloquant dans la suite e2e) ; la dernière mesure (reports/perf-3g.json) est recopiée ici.
// Le TOTAL de toutes les pages reste MESURÉ et affiché, mais n'est plus bloquant (il compte des pages que l'élève
// ne charge jamais). Autres gardes inchangées : leçons vivantes ≤ 20 Ko, polices ≤ 600 Ko, police d'une
// riwāya ≤ 1 Mo (hors coquille).
// Écrit reports/budget-web.md à la racine du dépôt ; code de sortie 1 si un budget bloquant est dépassé.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants } from 'node:zlib';
import { groupFiles, readRoutes } from './groupes.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '..', '..');
const client = join(root, '.svelte-kit', 'output', 'client');
const walk = (d) =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const brBuf = (b) =>
  brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
const br = (p) => brBuf(readFileSync(p));
const ko = (n) => `${(n / 1024).toFixed(1)} Ko`;
const sum = (list, f) => list.reduce((s, p) => s + f(p), 0);

const BUDGET_ELEVE = 350 * 1024;
const BUDGET_PREMIERE = 150 * 1024;
const BUDGET_INITIAL = 150 * 1024;
const BUDGET_3G_MS = 3000;
const BUDGET_VIVANTE = 20 * 1024;
const BUDGET_FONTS = 600 * 1024;
const BUDGET_RIWAYA_FONT = 1024 * 1024;
/** page d'accueil de l'élève (« Mon arabe », onglet Arabe ; la première qu'il ouvre) */
const ACCUEIL = '/';

const files = walk(client);
const js = files.filter((p) => p.endsWith('.js') && !p.endsWith('service-worker.js'));
const css = files.filter((p) => p.endsWith('.css'));
const fonts = files.filter((p) => p.endsWith('.woff2'));
const rwFonts = files.filter((p) => /[\\/]riwayat[\\/]/.test(p) && p.endsWith('.ttf'));
const rwWorst = rwFonts.reduce((m, p) => Math.max(m, statSync(p).size), 0);
const swSrc = readFileSync(join(root, 'src', 'service-worker.ts'), 'utf8');
const rwExcluded = /startsWith\('\/riwayat\/'\)/.test(swSrc);
const swBr = sum(
  files.filter((p) => p.endsWith('service-worker.js')),
  br,
);
const jsBr = sum(js, br);
const cssBr = sum(css, br);
const fontsSize = sum(fonts, (p) => statSync(p).size);

// groupes non préchargés (scripts/groupes.mjs) et leçons vivantes (vite.config.ts)
const groups = groupFiles(root);
const swGroups = /groupes\.json/.test(swSrc);
const vivList = (() => {
  try {
    return JSON.parse(readFileSync(join(client, '_app', 'vivante.json'), 'utf8')).map((f) =>
      f.slice(1),
    );
  } catch {
    return [];
  }
})();
const swViv = /vivante\.json/.test(swSrc);
const grpBr = (list) => sum(list, (f) => br(join(client, f)));
const staffBr = grpBr(groups.personnel);
const raresBr = grpBr(groups.rares);
const enLigneBr = grpBr(groups.enLigne);
const vivBr = grpBr(vivList);
// catalogues de textes PRÉCHARGÉS par le service worker (liste STUDENT_TEXTS) : comptés pour l'élève
const studentTexts = [
  ...(/STUDENT_TEXTS\s*=\s*\[([^\]]*)\]/.exec(swSrc)?.[1] ?? '').matchAll(/'([^']+)'/g),
].map((m) => m[1]);
const textsBr = sum(studentTexts, (p) => br(join(root, 'static', p)));
const eleveCode = jsBr + cssBr - staffBr - raresBr - enLigneBr - vivBr;
const eleveBr = eleveCode + textsBr;

// JavaScript + CSS INITIAUX par page : fermeture des imports STATIQUES depuis l'entrée, l'application, les mises
// en page de la route et sa page (les imports dynamiques, chargés à la demande, ne comptent pas)
const manifest = JSON.parse(readFileSync(join(client, '.vite', 'manifest.json'), 'utf8'));
const brCache = new Map();
const brOf = (file) => {
  if (!brCache.has(file)) brCache.set(file, br(join(client, file)));
  return brCache.get(file);
};
function closure(keys) {
  const seen = new Set();
  const out = new Set();
  const visit = (k) => {
    if (seen.has(k) || !manifest[k]) return;
    seen.add(k);
    const e = manifest[k];
    out.add(e.file);
    for (const c of e.css ?? []) out.add(c);
    for (const i of e.imports ?? []) visit(i);
  };
  keys.forEach(visit);
  return [...out];
}
const keyOf = (suffix) => Object.keys(manifest).find((k) => k.endsWith(suffix));
const base = [
  keyOf('/@sveltejs/kit/src/runtime/client/entry.js'),
  keyOf('client-optimized/app.js'),
];
if (base.some((k) => !k)) throw new Error('manifeste illisible');
const initial = readRoutes(root)
  .map(({ route, nodes }) => ({
    route,
    br: closure([...base, ...nodes.map((n) => keyOf(`client-optimized/nodes/${n}.js`))]).reduce(
      (s, f) => s + brOf(f),
      0,
    ),
  }))
  .sort((a, b) => b.br - a.br);
const worst = initial[0];
const accueil = initial.find((x) => x.route === ACCUEIL);

// (c) dernière mesure de l'ouverture en 3G simulée (e2e/perf.spec.ts)
const perf = (() => {
  const p = join(repo, 'reports', 'perf-3g.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
})();
const perfLine = perf
  ? `${(perf.ouvertureMs / 1000).toFixed(2)} s (élève, premier lancement ; relance ${(perf.relanceMs / 1000).toFixed(2)} s ; mesuré le ${perf.date})`
  : 'pas encore mesurée (suite e2e)';

const ok = (v, b) => (v <= b ? 'oui' : '**NON**');
const lines = [
  '# Budget de poids et d’ouverture (mesuré après construction)',
  '',
  'Indicateurs du lot F5 (décision du chef de projet) : ce que garde l’appareil d’un ÉLÈVE, ce que télécharge sa',
  'PREMIÈRE OUVERTURE, et le temps d’ouverture en 3G simulée. Le total de toutes les pages reste affiché, sans être',
  'bloquant. Compression Brotli (qualité 11).',
  '',
  '| Indicateur | Mesure | Budget | Tenu |',
  '|---|---|---|---|',
  `| **(a) Appareil d'un élève** : JS + CSS préchargés et textes préchargés | ${ko(eleveBr)} | ≤ ${ko(BUDGET_ELEVE)} | ${ok(eleveBr, BUDGET_ELEVE)} |`,
  `| **(b) Première ouverture** : JS + CSS initiaux de l'accueil de l'élève (\`${ACCUEIL}\`) | ${ko(accueil?.br ?? 0)} | ≤ ${ko(BUDGET_PREMIERE)} | ${ok(accueil?.br ?? Infinity, BUDGET_PREMIERE)} |`,
  `| **(c) Ouverture en 3G simulée** (CPU ×4, 150 ms, 1,6 Mbit/s ; e2e/perf.spec.ts) | ${perfLine} | < ${BUDGET_3G_MS / 1000} s | ${perf ? (perf.ouvertureMs < BUDGET_3G_MS ? 'oui' : '**NON**') : '—'} |`,
  `| Page la plus lourde au premier chargement (\`${worst.route}\`) | ${ko(worst.br)} | ≤ ${ko(BUDGET_INITIAL)} | ${ok(worst.br, BUDGET_INITIAL)} |`,
  '',
  '## Détail',
  '',
  '| Élément | Poids transféré |',
  '|---|---|',
  `| (a) dont JS + CSS de la coquille de l'élève | ${ko(eleveCode)} |`,
  `| (a) dont textes préchargés (${studentTexts.map((p) => `\`${p}\``).join(', ') || 'aucun'}) | ${ko(textsBr)} |`,
  `| Pages du personnel, NON préchargées (${groups.personnel.length} fichiers${swGroups ? '' : ' — service worker NE LES EXCLUT PAS'}) | ${ko(staffBr)} |`,
  `| Pages rares, en ligne seulement, NON préchargées (${groups.rares.length} fichiers) | ${ko(raresBr)} |`,
  `| Modules à la demande qui ont besoin du réseau, NON préchargés (${groups.enLigne.length} fichiers) | ${ko(enLigneBr)} |`,
  `| Leçons vivantes, à la demande (${vivList.length} fichiers${swViv ? '' : ' — service worker NE LES EXCLUT PAS'}) | ${ko(vivBr)} (≤ ${ko(BUDGET_VIVANTE)}) |`,
  `| Total JS + CSS de toutes les pages (mesuré, non bloquant) | ${ko(jsBr + cssBr)} |`,
  `| dont CSS | ${ko(cssBr)} |`,
  `| Service worker | ${ko(swBr)} |`,
  `| Polices WOFF2 (une seule fois, déjà compressées) | ${ko(fontsSize)} (≤ ${ko(BUDGET_FONTS)}) |`,
  `| Police d'une riwāya, la plus lourde (${rwFonts.length} polices, à la demande, hors coquille${rwExcluded ? '' : ' — NON EXCLUE du service worker'}) | ${ko(rwWorst)} (≤ ${ko(BUDGET_RIWAYA_FONT)}) |`,
  '',
  '## Pages les plus lourdes au premier chargement',
  '',
  '| Page | JavaScript + CSS initiaux (Brotli) |',
  '|---|---|',
  ...initial.slice(0, 8).map((x) => `| \`${x.route}\` | ${ko(x.br)} |`),
];
mkdirSync(join(repo, 'reports'), { recursive: true });
writeFileSync(join(repo, 'reports', 'budget-web.md'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
const fails = [
  [eleveBr > BUDGET_ELEVE, "appareil d'un élève"],
  [!accueil || accueil.br > BUDGET_PREMIERE, 'première ouverture'],
  [worst.br > BUDGET_INITIAL, 'page la plus lourde'],
  [fontsSize > BUDGET_FONTS, 'polices'],
  [rwWorst > BUDGET_RIWAYA_FONT || !rwExcluded, 'police de riwāya'],
  [!swGroups || !swViv, 'service worker : groupes non exclus'],
  [!vivList.length || vivBr > BUDGET_VIVANTE, 'leçons vivantes'],
].filter(([bad]) => bad);
if (fails.length) {
  console.error(`Budget dépassé : ${fails.map(([, w]) => w).join(', ')}`);
  process.exit(1);
}
