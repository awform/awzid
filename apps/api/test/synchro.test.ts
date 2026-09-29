/**
 * Lot 17 — synchronisation sûre entre les machines : git seule source, jamais d'écrasement.
 *  - infra/synchro.sh : refus si des modifications ne sont pas enregistrées, refus en cas de divergence,
 *    avance « fast-forward » quand seul le distant a avancé, envoi sans --force ;
 *  - infra/verifier-copie.sh : une copie du contenu modifiée depuis la dernière synchronisation n'est pas
 *    remplacée (MANIFEST.sha256).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const SYNCHRO = join(ROOT, 'infra', 'synchro.sh');
const VERIF = join(ROOT, 'infra', 'verifier-copie.sh');
const unix = process.platform !== 'win32';

const env = {
  PATH: process.env.PATH,
  HOME: tmpdir(),
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@exemple.invalid',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@exemple.invalid',
  GIT_CONFIG_NOSYSTEM: '1',
};
const git = (cwd: string, ...a: string[]) =>
  execFileSync('git', ['-c', 'init.defaultBranch=main', ...a], { cwd, env, encoding: 'utf8' });
const synchro = (cwd: string, ...a: string[]) =>
  spawnSync('bash', [SYNCHRO, ...a], { cwd, env, encoding: 'utf8' });
const commit = (cwd: string, file: string, text: string) => {
  writeFileSync(join(cwd, file), text);
  git(cwd, 'add', file);
  git(cwd, 'commit', '-q', '-m', `${file}: ${text}`);
};

/** un dépôt distant nu et deux copies de travail (le PC et la VM) */
function setup() {
  const d = mkdtempSync(join(tmpdir(), 'synchro-'));
  const remote = join(d, 'distant.git');
  git(d, 'init', '-q', '--bare', remote);
  const pc = join(d, 'pc');
  const vm = join(d, 'vm');
  git(d, 'clone', '-q', remote, pc);
  commit(pc, 'a.txt', 'v1');
  git(pc, 'push', '-q', '-u', 'origin', 'main');
  git(d, 'clone', '-q', remote, vm);
  return { pc, vm };
}

describe.skipIf(!unix)('synchro.sh : git seule source, jamais d’écrasement', () => {
  it('modification non enregistrée : refus, le fichier reste intact', () => {
    const { pc, vm } = setup();
    commit(vm, 'a.txt', 'v2');
    git(vm, 'push', '-q');
    writeFileSync(join(pc, 'a.txt'), 'travail non enregistré');
    const r = synchro(pc);
    expect(r.status).toBe(3);
    expect(r.stderr).toMatch(/REFUS/);
    expect(readFileSync(join(pc, 'a.txt'), 'utf8')).toBe('travail non enregistré');
    // un nouveau fichier non suivi bloque aussi (il pourrait être écrasé par une arrivée du même nom)
    git(pc, 'checkout', '--', 'a.txt');
    writeFileSync(join(pc, 'nouveau.txt'), 'x');
    expect(synchro(pc).status).toBe(3);
  });

  it('distant plus récent : avance sans risque ; local plus récent : envoyé seulement avec --envoyer', () => {
    const { pc, vm } = setup();
    commit(vm, 'a.txt', 'v2');
    expect(synchro(vm).stdout).toMatch(/non envoyé/);
    expect(git(pc, 'ls-remote', 'origin', 'main')).not.toContain(
      git(vm, 'rev-parse', 'HEAD').trim(),
    );
    expect(synchro(vm, '--envoyer').status).toBe(0);
    const r = synchro(pc);
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(join(pc, 'a.txt'), 'utf8')).toBe('v2');
    expect(synchro(pc).stdout).toMatch(/déjà à jour/);
  });

  it('divergence : refus des deux côtés, aucun commit perdu, jamais de --force', () => {
    const { pc, vm } = setup();
    commit(vm, 'a.txt', 'version VM');
    git(vm, 'push', '-q');
    commit(pc, 'b.txt', 'version PC');
    const head = git(pc, 'rev-parse', 'HEAD');
    const r = synchro(pc, '--envoyer');
    expect(r.status).toBe(4);
    expect(r.stderr).toMatch(/divergé/);
    expect(git(pc, 'rev-parse', 'HEAD')).toBe(head);
    expect(readFileSync(join(pc, 'b.txt'), 'utf8')).toBe('version PC');
    const code = readFileSync(SYNCHRO, 'utf8')
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('#'))
      .join('\n');
    expect(code).not.toMatch(/--force|reset --hard|checkout -- /);
  });
});

describe.skipIf(!unix)('verifier-copie.sh : pas de remplacement d’une copie modifiée', () => {
  const copie = () => {
    const d = mkdtempSync(join(tmpdir(), 'contenu-'));
    mkdirSync(join(d, 'data', 'en1'), { recursive: true });
    writeFileSync(join(d, 'data', 'en1', 'l01.js'), 'leçon 1');
    writeFileSync(join(d, 'data', 'index-lecons.js'), 'index');
    writeFileSync(join(d, 'COPIE.txt'), '2026-09-29T12:00:00+02:00');
    execFileSync(
      'bash',
      [
        '-c',
        'find . -type f ! -name MANIFEST.sha256 ! -name COPIE.txt -print0 | sort -z | xargs -0 sha256sum > MANIFEST.sha256',
      ],
      { cwd: d },
    );
    return d;
  };
  const verif = (d: string) => spawnSync('bash', [VERIF, d], { encoding: 'utf8' });

  it('copie intacte ou absente : remplaçable', () => {
    expect(verif(copie()).status).toBe(0);
    expect(verif(join(tmpdir(), 'n-existe-pas-17')).status).toBe(0);
  });
  it('fichier modifié, ajouté ou supprimé : refus', () => {
    const a = copie();
    writeFileSync(join(a, 'data', 'en1', 'l01.js'), 'leçon 1 corrigée sur la VM');
    const r = verif(a);
    expect(r.status).toBe(3);
    expect(r.stderr).toMatch(/l01\.js/);
    const b = copie();
    writeFileSync(join(b, 'data', 'en1', 'l02.js'), 'ajout');
    expect(verif(b).stderr).toMatch(/l02\.js/);
    const c = copie();
    rmSync(join(c, 'data', 'index-lecons.js'));
    expect(verif(c).status).toBe(3);
    const e = copie();
    rmSync(join(e, 'MANIFEST.sha256'));
    expect(verif(e).status).toBe(3);
  });
});
