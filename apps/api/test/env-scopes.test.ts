/**
 * Lot 13 — moindre privilège des secrets : chaque service ne reçoit que ce dont il a besoin.
 * Vérifie, sans aucun secret réel : (1) les variables lues par le code de l'API et du travailleur sont dans
 * leur périmètre (env-scopes.conf) ; (2) aucun secret hors périmètre (travailleur, outils, Caddy, base) ;
 * (3) compose.yml donne à chaque service SON fichier et ne monte jamais prod.env ; (4) env-split.sh produit
 * des fichiers qui ne contiennent que les variables permises, en droits 600.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const PROD = join(ROOT, 'infra', 'prod');

const scopeSources: Record<string, string[]> = {};
function scopes(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const line of readFileSync(join(PROD, 'env-scopes.conf'), 'utf8').split('\n')) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const [svc, ...vars] = l.split(/\s+/);
    // « VAR=SOURCE » : le service voit VAR (valeur de SOURCE)
    out[svc!.replace(/:$/, '')] = vars.map((v) => v.split('=')[0]!);
    scopeSources[svc!.replace(/:$/, '')] = vars.map((v) => v.split('=').at(-1)!);
  }
  return out;
}

/** Fichiers .ts exécutés en service (ni tests, ni outils en ligne de commande). */
function sources(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) {
        if (n !== 'cli' && n !== 'node_modules' && n !== 'test') walk(p);
      } else if (n.endsWith('.ts') && !n.endsWith('.test.ts') && !n.endsWith('.d.ts')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

function envReads(files: string[]): Map<string, string> {
  const vars = new Map<string, string>();
  for (const f of files)
    for (const m of readFileSync(f, 'utf8').matchAll(/env(?:\.|\[')([A-Z][A-Z0-9_]{2,})/g))
      vars.set(m[1]!, relative(ROOT, f));
  return vars;
}

/** Variables sans secret, fixées par l'image ou compose.yml (ou valeurs par défaut de développement). */
const FIXED = new Set([
  'API_HOST',
  'API_PORT',
  'TRUST_PROXY',
  'AWFORM_CONTENT_DIR',
  'TEST_DATABASE_URL',
  'NODE_ENV',
  // relais d'école : dossier des certificats copiés, fixé par compose.yml (lot 17)
  'AWFORM_RELAIS_CERTS',
  // audio du Coran (lot 27) : stockage fixé par compose.yml ; chemin de ffmpeg (outil d'import, facultatif)
  'AWFORM_AUDIO_DIR',
  'AWFORM_FFMPEG',
]);
const isSecret = (v: string) => /SECRET|KEY|PASSWORD|TOKEN|DATABASE_URL/.test(v);
const pkg = (n: string) => join(ROOT, 'packages', n, 'src');

describe('secrets : un périmètre par service (env-scopes.conf)', () => {
  const s = scopes();

  it('périmètres déclarés pour api, worker, outils, db, caddy', () => {
    expect(Object.keys(s).sort()).toEqual(['api', 'caddy', 'db', 'outils', 'worker']);
  });

  it('API : tout ce que lit le code est dans son périmètre', () => {
    const files = [
      ...sources(join(ROOT, 'apps', 'api', 'src')),
      ...['billing', 'content', 'db', 'grading', 'hifz', 'tutor', 'school'].flatMap((p) => {
        try {
          return sources(pkg(p));
        } catch {
          return [];
        }
      }),
    ];
    const missing = [...envReads(files)].filter(([v]) => !FIXED.has(v) && !s.api!.includes(v));
    expect(missing).toEqual([]);
  });

  it('travailleur : ne lit que la base (et le fuseau)', () => {
    const files = [...sources(join(ROOT, 'apps', 'worker', 'src')), ...sources(pkg('db'))];
    const missing = [...envReads(files)].filter(([v]) => !FIXED.has(v) && !s.worker!.includes(v));
    expect(missing).toEqual([]);
  });

  it('aucun secret hors de son besoin', () => {
    expect(s.worker!.filter(isSecret)).toEqual(['DATABASE_URL']);
    expect(s.outils!.filter(isSecret)).toEqual([
      'DATABASE_URL',
      'AWFORM_DB_API_PASSWORD',
      'AWFORM_DB_WORKER_PASSWORD',
    ]);
    // chaque service a SON compte PostgreSQL (lot 14) : l'API et le travailleur ne reçoivent jamais celui du
    // propriétaire (migrations, import)
    expect(scopeSources.api).toContain('DATABASE_URL_API');
    expect(scopeSources.worker).toContain('DATABASE_URL_WORKER');
    expect(scopeSources.api).not.toContain('DATABASE_URL');
    expect(scopeSources.worker).not.toContain('DATABASE_URL');
    expect(s.db).toEqual(['POSTGRES_PASSWORD']);
    expect(s.caddy!.filter(isSecret)).toEqual([]);
    // l'API n'a pas besoin du mot de passe PostgreSQL seul (il est dans DATABASE_URL)
    expect(s.api).not.toContain('POSTGRES_PASSWORD');
  });

  it('compose.yml : chaque service reçoit SON fichier, jamais prod.env', () => {
    const y = readFileSync(join(PROD, 'compose.yml'), 'utf8');
    expect(y).not.toMatch(/AWFORM_ENV_FILE|AWFORM_DB_ENV_FILE|AWFORM_CADDY_ENV_FILE|prod\.env'/);
    const want: Record<string, string> = {
      db: 'db',
      migrate: 'outils',
      import: 'outils',
      roles: 'outils',
      demo: 'outils',
      relais: 'outils',
      api: 'api',
      worker: 'worker',
      caddy: 'caddy',
    };
    // découpe grossière par service (clés à deux espaces d'indentation sous « services: »)
    const body = y.slice(y.indexOf('services:'), y.indexOf('\nvolumes:'));
    const blocks = body.split(/\n {2}(?=[a-z]+:\n)/).slice(1);
    const seen: Record<string, string | null> = {};
    for (const b of blocks) {
      const name = b.slice(0, b.indexOf(':'));
      const m = /env_file: '\$\{AWFORM_ENV_DIR:\?[^}]*\}\/([a-z]+)\.env'/.exec(b);
      seen[name] = m ? m[1]! : /env_file/.test(b) ? 'AUTRE' : null;
    }
    for (const [svc, file] of Object.entries(want)) expect(seen[svc], svc).toBe(file);
    expect(seen.web, 'web ne reçoit aucun fichier').toBeNull();
    // relais d'école : la copie des certificats ne reçoit que les adresses
    expect(seen.certsrelais).toBe('caddy');
  });

  it.skipIf(process.platform === 'win32')(
    'env-split.sh : fichiers limités au périmètre, droits 600',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'awform-env-'));
      const src = join(dir, 'prod.env');
      writeFileSync(
        src,
        [
          'POSTGRES_PASSWORD=pg-factice',
          'DATABASE_URL=postgres://awform:pg-factice@db:5432/awform',
          'DATABASE_URL_API=postgres://awform_api:api-factice@db:5432/awform',
          'DATABASE_URL_WORKER=postgres://awform_worker:worker-factice@db:5432/awform',
          'AWFORM_DB_API_PASSWORD=api-factice',
          'AWFORM_DB_WORKER_PASSWORD=worker-factice',
          'AWFORM_SECRET_KEY=cle-factice',
          'ANTHROPIC_API_KEY=cle-factice',
          'STRIPE_SECRET_KEY=cle-factice',
          'COOKIE_SECURE=auto',
          'SITE=192.0.2.10',
          'DEFAULT_SNI=192.0.2.10',
          'TZ=Europe/Paris',
          'AWFORM_TUTEUR=simule',
          'VARIABLE_INCONNUE=x',
          '',
        ].join('\n'),
      );
      execFileSync('bash', [join(PROD, 'env-split.sh'), src, dir]);
      const keys = (f: string) =>
        readFileSync(join(dir, f), 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((l) => l.split('=')[0]);
      expect(keys('worker.env').sort()).toEqual(['DATABASE_URL', 'TZ']);
      expect(keys('outils.env').sort()).toEqual([
        'AWFORM_DB_API_PASSWORD',
        'AWFORM_DB_WORKER_PASSWORD',
        'DATABASE_URL',
        'TZ',
      ]);
      // valeurs : chaque service a son compte
      const val = (f: string, k: string) =>
        readFileSync(join(dir, f), 'utf8')
          .split('\n')
          .find((l) => l.startsWith(`${k}=`))
          ?.slice(k.length + 1);
      expect(val('api.env', 'DATABASE_URL')).toContain('awform_api:');
      expect(val('worker.env', 'DATABASE_URL')).toContain('awform_worker:');
      expect(val('outils.env', 'DATABASE_URL')).toContain('awform:pg-factice');
      expect(readFileSync(join(dir, 'api.env'), 'utf8')).not.toContain('pg-factice');
      expect(readFileSync(join(dir, 'worker.env'), 'utf8')).not.toContain('api-factice');
      expect(keys('db.env')).toEqual(['POSTGRES_PASSWORD']);
      expect(keys('caddy.env').sort()).toEqual(['DEFAULT_SNI', 'SITE']);
      expect(keys('api.env').sort()).toEqual([
        'ANTHROPIC_API_KEY',
        'AWFORM_SECRET_KEY',
        'AWFORM_TUTEUR',
        'COOKIE_SECURE',
        'DATABASE_URL',
        // adresse servie : garde-fou de la démonstration (apps/api/src/demo-mode.ts), sans secret
        'SITE',
        'STRIPE_SECRET_KEY',
        'TZ',
      ]);
      for (const f of ['api', 'worker', 'outils', 'db', 'caddy'])
        expect(statSync(join(dir, `${f}.env`)).mode & 0o777).toBe(0o600);
      // une variable inconnue n'est transmise à personne
      for (const f of ['api', 'worker', 'outils', 'db', 'caddy'])
        expect(readFileSync(join(dir, `${f}.env`), 'utf8')).not.toContain('VARIABLE_INCONNUE');
    },
  );
});
