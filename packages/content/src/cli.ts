#!/usr/bin/env node
/**
 * Contrôle du contenu sans base de données :
 *   node dist/cli.js [--dir ~/awform-content] [--json rapport.json] en1 ad1
 * Code de sortie 1 s'il existe une erreur bloquante (verset ≠ Tanzil, corrigé impossible, fichier illisible…).
 */
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { blockingIssues, loadEdition } from './importer.js';
import { importReportMarkdown } from './report.js';

const args = process.argv.slice(2);
let dir = process.env.AWFORM_CONTENT_DIR ?? join(homedir(), 'awform-content');
let jsonOut: string | null = null;
let mdOut: string | null = null;
const levels: string[] = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i] ?? '';
  if (a === '--dir') dir = args[++i] ?? dir;
  else if (a === '--json') jsonOut = args[++i] ?? null;
  else if (a === '--rapport') mdOut = args[++i] ?? null;
  else levels.push(a);
}
if (levels.length === 0) levels.push('en1', 'ad1');

const load = loadEdition({ contentDir: dir, levels });
if (mdOut) writeFileSync(mdOut, importReportMarkdown(load));
const errors = blockingIssues(load);
const warnings = load.issues.filter((i) => i.severity === 'avertissement');

const lines: string[] = [];
lines.push(`Contenu : ${dir}  (empreinte source ${load.sourceSha256.slice(0, 16)}…)`);
for (const l of load.levels) {
  const ex = l.units.reduce((s, u) => s + u.exercises.length, 0);
  lines.push(`  ${l.code} : ${l.units.length} unités, ${ex} exercices`);
}
lines.push(`  carnets de hifẓ : ${load.hifz.map((h) => h.code).join(', ') || 'aucun'}`);
if (load.registry)
  lines.push(
    `  registre : ${Object.keys(load.registry.coran).length} versets, ${Object.keys(load.registry.hadiths).length} hadiths, ${Object.keys(load.registry.fiqh).length} règles de fiqh`,
  );
const v = load.verseStats;
lines.push(
  `  versets contrôlés octet par octet : ${v.total} (identiques ${v.identique}, extraits exacts ${v.extrait}, écarts voulus ${v.voulu}, ERREURS ${v.erreurs})`,
);
lines.push(`Erreurs bloquantes : ${errors.length} ; avertissements : ${warnings.length}`);
for (const i of [...errors, ...warnings])
  lines.push(`  [${i.severity}] ${i.code} ${i.unit ?? i.file ?? ''} — ${i.message}`);
console.log(lines.join('\n'));

if (jsonOut) {
  writeFileSync(
    jsonOut,
    JSON.stringify(
      {
        contentDir: dir,
        sourceSha256: load.sourceSha256,
        levels: load.levels.map((l) => ({ code: l.code, units: l.units.length })),
        verseStats: v,
        issues: load.issues,
      },
      null,
      2,
    ),
  );
}
process.exit(errors.length ? 1 : 0);
