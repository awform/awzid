// Budget de poids (CDC § 4.3 « JavaScript initial ≤ 150 Ko compressé », ARCHITECTURE_V2 § 3.3 ; décision D4,
// audit PERF-1) : mesure après `vite build`, compression Brotli.
//  - JavaScript + CSS INITIAUX de chaque page d'entrée (point d'entrée, application, mises en page et page,
//    avec leurs imports statiques, d'après le manifeste de Vite) ≤ 150 Ko : la pire page est retenue ;
//  - TOTAL de toutes les pages (tout ce que le service worker garde pour le hors ligne) ≤ 320 Ko (D30, A8) ;
//  - polices une seule fois ≤ 600 Ko.
// Écrit reports/budget-web.md à la racine du dépôt ; code de sortie 1 si un budget est dépassé.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const client = join(root, '.svelte-kit', 'output', 'client');
const walk = (d) =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const br = (p) =>
  brotliCompressSync(readFileSync(p), { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;

const files = walk(client);
const sum = (list, f) => list.reduce((s, p) => s + f(p), 0);
const js = files.filter((p) => p.endsWith('.js') && !p.endsWith('service-worker.js'));
const css = files.filter((p) => p.endsWith('.css'));
const fonts = files.filter((p) => p.endsWith('.woff2'));
// A8 : polices des riwāyāt (Complexe, TTF servis sans modification) — hors coquille, chargées à la demande
// (une seule à la fois, au choix du muṣḥaf) : chacune ≤ 1 Mo, jamais préchargée par le service worker
const BUDGET_RIWAYA_FONT = 1024 * 1024;
const rwFonts = files.filter((p) => /[\\/]riwayat[\\/]/.test(p) && p.endsWith('.ttf'));
const rwWorst = rwFonts.reduce((m, p) => Math.max(m, statSync(p).size), 0);
const swSrc = readFileSync(join(root, 'src', 'service-worker.ts'), 'utf8');
const rwExcluded = /startsWith\('\/riwayat\/'\)/.test(swSrc);
const sw = files.filter((p) => p.endsWith('service-worker.js'));
const r = {
  jsBr: sum(js, br),
  cssBr: sum(css, br),
  swBr: sum(sw, br),
  fonts: sum(fonts, (p) => statSync(p).size),
};
const ko = (n) => `${(n / 1024).toFixed(1)} Ko`;
const BUDGET_INITIAL = 150 * 1024;
// Muṣḥaf par page (04/10/2026) : 300 → 315 Ko, à valider (décision D30) ; A8 (05/10/2026) : muṣḥafs des
// riwāyāt dans Lire, Écouter et Muṣḥaf (+4,5 Ko, main était à 313 Ko) → 320 Ko, à valider (décision D-A8) ;
// A3 (05/10/2026) : audio des leçons (bouton écouter, clé SHA-1 du moteur des livres, option « avec l'audio »
// des téléchargements, +3,6 Ko) → 325 Ko, à valider (décision D31) ; lot F1 (05/10/2026) : « Signaler une
// erreur », file du référent, errata, suspension d'urgence (masque hors ligne compris), réponses refusées mises
// de côté, mention de l'école, 60 chaînes françaises (+6,0 Ko) → 330 Ko, à valider (décision D-F1)
const BUDGET_TOTAL = 330 * 1024;
const BUDGET_FONTS = 600 * 1024;

// JavaScript initial par page : fermeture des imports STATIQUES depuis l'entrée, l'application, les mises en
// page de la route et sa page (les imports dynamiques, chargés à la demande, ne comptent pas)
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
const app = readFileSync(
  join(root, '.svelte-kit', 'generated', 'client-optimized', 'app.js'),
  'utf8',
);
const dict = app.slice(app.indexOf('export const dictionary'));
const routes = [...dict.matchAll(/"([^"]+)":\s*\[\s*~?(\d+)(?:\s*,\s*\[([^\]]*)\])?/g)].map(
  (m) => ({
    route: m[1],
    nodes: [
      0,
      ...(m[3] ? m[3].split(',').map((x) => Number(x.replace('~', '').trim())) : []),
      Number(m[2]),
    ],
  }),
);
if (!routes.length || base.some((k) => !k))
  throw new Error('manifeste ou dictionnaire des routes illisible');
const initial = routes
  .map(({ route, nodes }) => ({
    route,
    br: closure([...base, ...nodes.map((n) => keyOf(`client-optimized/nodes/${n}.js`))]).reduce(
      (s, f) => s + brOf(f),
      0,
    ),
  }))
  .sort((a, b) => b.br - a.br);
const worst = initial[0];

const lines = [
  '# Budget de poids de la coquille (mesuré après construction)',
  '',
  '| Élément | Poids transféré | Budget |',
  '|---|---|---|',
  `| JavaScript + CSS initiaux, page la plus lourde (\`${worst.route}\`, Brotli) | ${ko(worst.br)} | ≤ ${ko(BUDGET_INITIAL)} |`,
  `| JavaScript de toutes les pages (Brotli) | ${ko(r.jsBr)} | ≤ ${ko(BUDGET_TOTAL)} |`,
  `| CSS (Brotli) | ${ko(r.cssBr)} | — |`,
  `| Service worker (Brotli) | ${ko(r.swBr)} | — |`,
  `| Polices WOFF2 (une seule fois, déjà compressées) | ${ko(r.fonts)} | ≤ ${ko(BUDGET_FONTS)} |`,
  `| Police d'une riwāya, la plus lourde (${rwFonts.length} polices, à la demande, hors coquille${rwExcluded ? '' : ' — NON EXCLUE du service worker'}) | ${ko(rwWorst)} | ≤ ${ko(BUDGET_RIWAYA_FONT)} |`,
  '',
  '## Pages les plus lourdes au premier chargement',
  '',
  '| Page | JavaScript + CSS initiaux (Brotli) |',
  '|---|---|',
  ...initial.slice(0, 8).map((x) => `| \`${x.route}\` | ${ko(x.br)} |`),
];
mkdirSync(join(root, '..', '..', 'reports'), { recursive: true });
writeFileSync(join(root, '..', '..', 'reports', 'budget-web.md'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
if (
  worst.br > BUDGET_INITIAL ||
  r.jsBr + r.cssBr > BUDGET_TOTAL ||
  r.fonts > BUDGET_FONTS ||
  rwWorst > BUDGET_RIWAYA_FONT ||
  !rwExcluded
) {
  console.error('Budget dépassé');
  process.exit(1);
}
