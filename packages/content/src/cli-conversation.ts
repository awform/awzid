#!/usr/bin/env node
/**
 * A26b, phase 1 — génère les scénarios guidés (sans IA) depuis les dialogues des livres :
 *   node dist/cli-conversation.js [--dir ~/awform-content] [--out ../../apps/web/static/conversation]
 *                                 [--levels en1,en2,ad1] [--check]
 * Écrit `<out>/<niveau>/<lecon>.json` et la liste des leçons disponibles
 * (`apps/web/src/lib/conversation/disponibles.ts`). Avec --check : rien n'est écrit, code de sortie 1 si les
 * fichiers du dépôt diffèrent de ce que donnent les livres. Code de sortie 1 au moindre écart de contrôle
 * (phrase hors livre, distracteur d'une leçon non vue).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDataFile } from './parse.js';
import {
  CONV_LEVEL,
  genererScenario,
  scenarioJson,
  verifierScenario,
  type LeconSource,
  type Scenario,
} from './conversation.js';

const here = dirname(fileURLToPath(import.meta.url));
const WEB = join(here, '..', '..', '..', 'apps', 'web');

/** Leçons d'un niveau lues dans les livres (`data/<niveau>/lNN.js`), dans l'ordre. */
export function lireNiveau(dataDir: string, level: string): LeconSource[] {
  const dir = join(dataDir, level);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^l\d{2}\.js$/.test(f))
    .sort()
    .map((f) => {
      const v = parseDataFile(readFileSync(join(dir, f), 'utf8'), `${level}/${f}`).value;
      return { id: `${level}.${f.slice(0, 3)}`, lesson: v as LeconSource['lesson'] };
    });
}

export function niveauxDisponibles(dataDir: string): string[] {
  const order = (l: string) => {
    const m = /^([a-z]+)(\d+)$/.exec(l)!;
    return [['en', 'ado', 'ad'].indexOf(m[1]!), Number(m[2])] as const;
  };
  return readdirSync(dataDir)
    .filter((l) => CONV_LEVEL.test(l))
    .sort((a, b) => {
      const [x, y] = [order(a), order(b)];
      return x[0] - y[0] || x[1] - y[1];
    });
}

export function genererNiveau(dataDir: string, level: string) {
  const lecons = lireNiveau(dataDir, level);
  const out: Scenario[] = [];
  const errs: string[] = [];
  for (const l of lecons) {
    const s = genererScenario(l, lecons);
    if (!s) continue;
    errs.push(...verifierScenario(s, lecons));
    out.push(s);
  }
  return { scenarios: out, errs, lecons: lecons.length };
}

export function disponiblesTs(map: Record<string, string[]>): string {
  const lignes = Object.entries(map).map(
    ([l, ls]) => `  ${l}: '${ls.map((x) => x.slice(1)).join(',')}',`,
  );
  return `// Généré par packages/content (cli-conversation) : NE PAS MODIFIER À LA MAIN.
/** A26b : leçons qui ont un scénario « Je parle » (numéros, par niveau). */
export const DISPONIBLES: Record<string, string> = {
${lignes.join('\n')}
};
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  let dir = process.env.AWFORM_CONTENT_DIR ?? join(homedir(), 'awform-content');
  let out = join(WEB, 'static', 'conversation');
  let levels: string[] | null = null;
  let check = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir') dir = args[++i] ?? dir;
    else if (args[i] === '--out') out = args[++i] ?? out;
    else if (args[i] === '--levels') levels = (args[++i] ?? '').split(',').filter(Boolean);
    else if (args[i] === '--check') check = true;
  }
  const data = join(dir, 'data');
  const list = levels ?? niveauxDisponibles(data);
  const map: Record<string, string[]> = {};
  let diff = 0;
  let bad = 0;
  let total = 0;
  for (const lv of list) {
    const { scenarios, errs, lecons } = genererNiveau(data, lv);
    for (const e of errs) console.error(`  ✗ ${e}`);
    bad += errs.length;
    map[lv] = scenarios.map((s) => s.lecon);
    total += scenarios.length;
    console.log(`${lv} : ${scenarios.length} scénario(s) / ${lecons} leçon(s)`);
    if (!check) mkdirSync(join(out, lv), { recursive: true });
    for (const s of scenarios) {
      const file = join(out, lv, `${s.lecon}.json`);
      const body = scenarioJson(s);
      if (check) {
        if (!existsSync(file) || readFileSync(file, 'utf8') !== body) {
          console.error(`  ≠ ${lv}/${s.lecon}.json`);
          diff++;
        }
      } else writeFileSync(file, body);
    }
  }
  const ts = join(WEB, 'src', 'lib', 'conversation', 'disponibles.ts');
  const tsBody = disponiblesTs(map);
  if (check) {
    if (!existsSync(ts) || readFileSync(ts, 'utf8') !== tsBody) {
      console.error('  ≠ disponibles.ts');
      diff++;
    }
  } else if (!levels) writeFileSync(ts, tsBody);
  console.log(
    `${total} scénario(s) ; ${bad} écart(s) de contrôle ; ${diff} fichier(s) différent(s)`,
  );
  if (bad || diff) process.exit(1);
}
