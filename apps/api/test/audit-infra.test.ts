/**
 * Audit — exploitation : INF-7 (sauvegarde partielle), INF-8 (état des sauvegardes et de la copie hors site),
 * INF-9 (déploiement après une démonstration). Scripts réels, faux `docker`, `HOME` temporaire.
 */
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const PROD = join(ROOT, 'infra', 'prod');
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** HOME jetable avec la clé publique des sauvegardes, et un faux docker (sortie, code) */
function home(dockerOut: string, dockerCode: number) {
  const h = mkdtempSync(join(tmpdir(), 'infra-'));
  dirs.push(h);
  const bin = join(h, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'docker'), `#!/bin/sh\nprintf '%s' '${dockerOut}'\nexit ${dockerCode}\n`);
  chmodSync(join(bin, 'docker'), 0o755);
  const env = { PATH: `${bin}:${process.env.PATH}`, HOME: h, GNUPGHOME: join(h, 'gnupg') };
  const k = spawnSync('bash', [join(PROD, 'backup-keygen.sh')], { env, encoding: 'utf8' });
  expect(k.status, k.stderr).toBe(0);
  return { h, env, dest: join(h, 'awform-backups') };
}
const run = (script: string, env: NodeJS.ProcessEnv, ...args: string[]) =>
  spawnSync('bash', [join(PROD, script), ...args], { env, encoding: 'utf8' });

const hasGpg = spawnSync('gpg', ['--version']).status === 0;

describe.skipIf(process.platform === 'win32' || !hasGpg)('audit INF-7 — sauvegarde', () => {
  it('pg_dump en échec : aucun fichier gardé, « ÉCHEC » au journal, code d’erreur', () => {
    const { env, dest } = home('x'.repeat(50), 1);
    const r = run('backup.sh', env);
    expect(r.status).not.toBe(0);
    expect(readdirSync(dest).filter((f) => f.includes('.dump.gpg'))).toEqual([]);
    expect(readFileSync(join(dest, 'backup.log'), 'utf8')).toMatch(/ÉCHEC/);
    // l'état des sauvegardes le signale
    const s = run('backup-status.sh', env, dest);
    expect(s.status).not.toBe(0);
    expect(s.stdout).toMatch(/ALERTE/);
  });

  it('pg_dump réussi : fichier, empreinte, « ok » au journal', () => {
    const { env, dest } = home('PGDMP-faux-contenu', 0);
    const r = run('backup.sh', env);
    expect(r.status, r.stderr).toBe(0);
    const files = readdirSync(dest);
    expect(files.filter((f) => f.endsWith('.dump.gpg'))).toHaveLength(1);
    expect(files.filter((f) => f.endsWith('.part'))).toEqual([]);
    expect(readFileSync(join(dest, 'backup.log'), 'utf8')).toMatch(/ ok awform-/);
  });
});

describe.skipIf(process.platform === 'win32' || !hasGpg)(
  'audit INF-8 — copie hors site et état',
  () => {
    it('copie hors site quand elle est configurée ; état : alerte si la dernière restauration a plus de 35 jours', () => {
      const { env, dest, h } = home('PGDMP-faux-contenu', 0);
      const hs = join(h, 'hors-site');
      mkdirSync(hs);
      const r = run('backup.sh', { ...env, AWFORM_BACKUP_HORS_SITE: hs });
      expect(r.status, r.stderr).toBe(0);
      expect(readdirSync(hs).filter((f) => f.endsWith('.dump.gpg'))).toHaveLength(1);
      const log = readFileSync(join(dest, 'backup.log'), 'utf8');
      expect(log).toMatch(/hors-site ok/);
      // aucune restauration testée : alerte ; une restauration récente : plus d'alerte
      expect(run('backup-status.sh', env, dest).stdout).toMatch(/ALERTE.*restauration/);
      writeFileSync(
        join(dest, 'backup.log'),
        `${log}${new Date().toISOString()} restauration testée ok x.dump.gpg\n`,
      );
      const s = run('backup-status.sh', env, dest);
      expect(s.status, s.stdout).toBe(0);
      const old = new Date(Date.now() - 40 * 86400_000).toISOString();
      writeFileSync(join(dest, 'backup.log'), `${log}${old} restauration testée ok x.dump.gpg\n`);
      expect(run('backup-status.sh', env, dest).stdout).toMatch(/ALERTE.*restauration/);
      expect(existsSync(join(dest, 'backup.log'))).toBe(true);
    });
  },
);

describe.skipIf(process.platform === 'win32')('audit INF-9 — démonstration puis production', () => {
  it('sans --demo, les réglages simulés sont retirés ; un réglage réel reste', () => {
    const d = mkdtempSync(join(tmpdir(), 'demo-env-'));
    dirs.push(d);
    const f = join(d, 'prod.env');
    writeFileSync(f, 'SITE=x\n');
    const env = { PATH: process.env.PATH };
    expect(run('demo-env.sh', env, f, '1').status).toBe(0);
    expect(readFileSync(f, 'utf8')).toMatch(/^AWFORM_PAIEMENT=simule$/m);
    expect(readFileSync(f, 'utf8')).toMatch(/^AWFORM_TUTEUR=simule$/m);
    expect(run('demo-env.sh', env, f, '0').status).toBe(0);
    const after = readFileSync(f, 'utf8');
    expect(after).not.toMatch(/simule|AWFORM_LANGUES_PREPARATION/);
    expect(after).toMatch(/^SITE=x$/m);
    writeFileSync(f, 'AWFORM_PAIEMENT=stripe\n');
    run('demo-env.sh', env, f, '0');
    expect(readFileSync(f, 'utf8')).toBe('AWFORM_PAIEMENT=stripe\n');
    // deploy.sh passe bien par ce script, et n'ajoute plus lui-même de réglage simulé
    const deploy = readFileSync(join(PROD, 'deploy.sh'), 'utf8');
    expect(deploy).toContain('"$PROD/demo-env.sh" "$ENVF" "$DEMO"');
    expect(deploy).not.toMatch(/=simule/);
  });
});
