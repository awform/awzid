/**
 * Audit QUA-1 : le garde-fou « aucune normalisation Unicode ni secret » échoue VRAIMENT (script
 * infra/ci/garde-fous.sh, lancé par la CI même si une étape précédente a échoué), et ESLint refuse toutes
 * les formes d'appel de la normalisation, pas seulement la forme directe (méthode appelée sur la chaîne).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const SCRIPT = join(ROOT, 'infra', 'ci', 'garde-fous.sh');
const env = { PATH: process.env.PATH, HOME: tmpdir(), GIT_CONFIG_NOSYSTEM: '1' };

function repo(files: Record<string, string>) {
  const d = mkdtempSync(join(tmpdir(), 'garde-fous-'));
  execFileSync('git', ['init', '-q'], { cwd: d, env });
  for (const [f, s] of Object.entries(files)) writeFileSync(join(d, f), s);
  execFileSync('git', ['add', '.'], { cwd: d, env });
  return d;
}
// le mot est assemblé ici pour que ce fichier ne déclenche pas lui-même le garde-fou
const N = 'normal' + 'ize';
const run = (cwd: string) => spawnSync('bash', ['-e', SCRIPT], { cwd, env, encoding: 'utf8' });

describe.skipIf(process.platform === 'win32')('audit QUA-1 — garde-fous de la CI', () => {
  it('dépôt propre : succès', () => {
    const d = repo({ 'a.ts': 'export const x = 1;\n' });
    expect(run(d).status).toBe(0);
    rmSync(d, { recursive: true, force: true });
  });

  it.each([
    ['a.ts', `x.${N}("NFC");\n`],
    ['b.svelte', `<script>s.${N}("NFD")</script>\n`],
    ['.env', 'SECRET=1\n'],
  ])('%s interdit : échec', (f, s) => {
    const d = repo({ 'ok.ts': 'export {};\n', [f]: s });
    expect(run(d).status).not.toBe(0);
    rmSync(d, { recursive: true, force: true });
  });

  it('ESLint refuse toutes les formes d’appel de normalize', async () => {
    const eslint = new ESLint({ cwd: ROOT });
    for (const code of [
      `export const a = (s: string) => s.${N}('NFC');`,
      `export const b = (s: string) => s['${N}']('NFC');`,
      `export const c = (s: string) => String.prototype.${N}.call(s, 'NFC');`,
      `export const d = (s: string, k: '${N}') => s[k]('NFKC');`,
    ]) {
      const [r] = await eslint.lintText(code, {
        filePath: join(ROOT, 'packages/content/src/x.ts'),
      });
      const msgs = r!.messages.filter((m) => m.ruleId === 'no-restricted-syntax');
      expect(msgs.length, code).toBeGreaterThan(0);
    }
  });
});
