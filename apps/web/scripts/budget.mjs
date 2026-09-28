// Budget de poids de la coquille (CDC §4.3, ARCHITECTURE_V2 §3.3) : mesure après `vite build`.
// JavaScript + CSS de l'application compressés (Brotli) ≤ 150 Ko ; polices une seule fois ≤ 600 Ko.
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
const sw = files.filter((p) => p.endsWith('service-worker.js'));
const r = {
  jsBr: sum(js, br),
  cssBr: sum(css, br),
  swBr: sum(sw, br),
  fonts: sum(fonts, (p) => statSync(p).size),
};
const ko = (n) => `${(n / 1024).toFixed(1)} Ko`;
const BUDGET_JS = 150 * 1024;
const BUDGET_FONTS = 600 * 1024;
const lines = [
  '# Budget de poids de la coquille (mesuré après construction)',
  '',
  '| Élément | Poids transféré | Budget |',
  '|---|---|---|',
  `| JavaScript (toutes les pages, Brotli) | ${ko(r.jsBr)} | ≤ ${ko(BUDGET_JS)} |`,
  `| CSS (Brotli) | ${ko(r.cssBr)} | — |`,
  `| Service worker (Brotli) | ${ko(r.swBr)} | — |`,
  `| Polices WOFF2 (une seule fois, déjà compressées) | ${ko(r.fonts)} | ≤ ${ko(BUDGET_FONTS)} |`,
];
mkdirSync(join(root, '..', '..', 'reports'), { recursive: true });
writeFileSync(join(root, '..', '..', 'reports', 'budget-web.md'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
if (r.jsBr + r.cssBr > BUDGET_JS || r.fonts > BUDGET_FONTS) {
  console.error('Budget dépassé');
  process.exit(1);
}
