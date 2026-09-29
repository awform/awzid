/**
 * Lot 17 — installation du relais et certificats de l'école :
 *  - relais-certs.sh (serveur central) : seuls les certificats des sous-domaines de relais sont copiés pour
 *    l'API, jamais celui du site principal ; droits 600 ; copie retirée quand Caddy n'a plus le certificat ;
 *  - install.sh : jeton jamais en argument, fichiers 600, clé locale gardée à la relance, certificat provisoire ;
 *  - compose.yml et Caddyfile du relais : chaque service reçoit SON fichier, HTTPS avec le certificat de l'école.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const RELAIS = join(ROOT, 'infra', 'relais');
const PROD = join(ROOT, 'infra', 'prod');
const unix = process.platform !== 'win32';
const hasOpenssl = unix && spawnSync('openssl', ['version']).status === 0;
const mode = (f: string) => (statSync(f).mode & 0o777).toString(8);

describe.skipIf(!unix)('relais-certs.sh (serveur central)', () => {
  it('copie les seuls certificats des relais, droits 600 ; retire ceux que Caddy n’a plus', () => {
    const src = mkdtempSync(join(tmpdir(), 'caddy-'));
    const out = mkdtempSync(join(tmpdir(), 'relais-certs-'));
    const ISS = 'acme-v02.api.letsencrypt.org-directory';
    const put = (host: string) => {
      const d = join(src, 'certificates', ISS, host);
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, `${host}.crt`), `CERT ${host}`);
      writeFileSync(join(d, `${host}.key`), `KEY ${host}`);
    };
    put('app.awzid.org'); // site principal : jamais copié
    put('ecole-dakar-01.relais.awzid.org');
    put('a.b.relais.awzid.org'); // deux niveaux : refusé
    put('relais.awzid.org.exemple.com'); // suffixe trompeur : refusé
    const run = () =>
      execFileSync('sh', [join(PROD, 'relais-certs.sh')], {
        env: {
          PATH: process.env.PATH,
          SRC: src,
          OUT: out,
          UNE_FOIS: '1',
          RELAIS_DOMAINE: 'relais.awzid.org',
        },
      });
    run();
    const base = join(out, 'certificates', ISS);
    const got = existsSync(base)
      ? execFileSync('ls', [base], { encoding: 'utf8' }).split('\n')
      : [];
    expect(got.filter(Boolean)).toEqual(['ecole-dakar-01.relais.awzid.org']);
    const key = join(
      base,
      'ecole-dakar-01.relais.awzid.org',
      'ecole-dakar-01.relais.awzid.org.key',
    );
    expect(readFileSync(key, 'utf8')).toBe('KEY ecole-dakar-01.relais.awzid.org');
    expect(mode(key)).toBe('600');
    rmSync(join(src, 'certificates', ISS, 'ecole-dakar-01.relais.awzid.org'), { recursive: true });
    run();
    expect(existsSync(join(base, 'ecole-dakar-01.relais.awzid.org'))).toBe(false);
  });

  it('sans domaine des relais : rien n’est copié', () => {
    const out = mkdtempSync(join(tmpdir(), 'relais-certs-'));
    execFileSync('sh', [join(PROD, 'relais-certs.sh')], {
      env: { PATH: process.env.PATH, SRC: '/nulle-part', OUT: out, UNE_FOIS: '1' },
    });
    expect(existsSync(join(out, 'certificates'))).toBe(false);
  });
});

describe.skipIf(!hasOpenssl)('install.sh (relais)', () => {
  const JETON = `rel_${'a'.repeat(43)}`;
  const run = (args: string[], env: Record<string, string>) =>
    spawnSync('bash', [join(RELAIS, 'install.sh'), ...args], {
      encoding: 'utf8',
      input: '',
      env: { PATH: process.env.PATH, AWFORM_RELAIS_SANS_SYSTEME: '1', ...env },
    });

  it('refuse le jeton en argument, un nom ou un serveur central invalide', () => {
    const d = mkdtempSync(join(tmpdir(), 'relais-inst-'));
    const env = { AWFORM_RELAIS_CONF: join(d, 'etc'), AWFORM_RELAIS_VAR: join(d, 'var') };
    const ok = ['--hote', 'ecole-1.relais.exemple.org', '--amont', 'https://app.exemple.org'];
    expect(run([...ok, '--jeton', JETON], env).status).toBe(2);
    expect(run(['--hote', 'pas un nom', '--amont', 'https://app.exemple.org'], env).status).toBe(2);
    expect(
      run(['--hote', 'ecole-1.relais.exemple.org', '--amont', 'http://app.exemple.org'], {
        ...env,
        AWFORM_RELAIS_JETON: JETON,
      }).status,
    ).toBe(2);
    expect(run(ok, { ...env, AWFORM_RELAIS_JETON: 'faux' }).status).toBe(2);
    expect(existsSync(join(d, 'etc', 'relais.env'))).toBe(false);
  });

  it('fichiers 600, chaque secret à sa place, clé locale gardée à la relance, certificat provisoire', () => {
    const d = mkdtempSync(join(tmpdir(), 'relais-inst-'));
    const env = {
      AWFORM_RELAIS_CONF: join(d, 'etc'),
      AWFORM_RELAIS_VAR: join(d, 'var'),
      AWFORM_RELAIS_JETON: JETON,
    };
    const args = ['--hote', 'ecole-1.relais.exemple.org', '--amont', 'https://app.exemple.org'];
    const r = run(args, env);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout + r.stderr).not.toContain(JETON);
    const rel = readFileSync(join(d, 'etc', 'relais.env'), 'utf8');
    expect(rel).toContain(`AWFORM_RELAIS_JETON=${JETON}`);
    expect(rel).toContain('AWFORM_RELAIS_AMONT=https://app.exemple.org');
    const cle = /AWFORM_RELAIS_CLE=([0-9a-f]{64})/.exec(rel)?.[1];
    expect(cle).toBeDefined();
    const caddy = readFileSync(join(d, 'etc', 'caddy.env'), 'utf8');
    expect(caddy.trim()).toBe('RELAIS_HOST=ecole-1.relais.exemple.org');
    for (const f of ['relais.env', 'caddy.env']) expect(mode(join(d, 'etc', f))).toBe('600');
    expect(mode(join(d, 'var', 'certs', 'ecole.key'))).toBe('600');
    const crt = readFileSync(join(d, 'var', 'certs', 'ecole.crt'), 'utf8');
    expect(crt).toContain('BEGIN CERTIFICATE');
    // relance sans jeton ni options : valeurs gardées, clé inchangée, certificat non remplacé
    const r2 = run([], {
      AWFORM_RELAIS_CONF: env.AWFORM_RELAIS_CONF,
      AWFORM_RELAIS_VAR: env.AWFORM_RELAIS_VAR,
    });
    expect(r2.status, r2.stderr).toBe(0);
    const rel2 = readFileSync(join(d, 'etc', 'relais.env'), 'utf8');
    expect(rel2).toContain(`AWFORM_RELAIS_CLE=${cle}`);
    expect(rel2).toContain(`AWFORM_RELAIS_JETON=${JETON}`);
    expect(readFileSync(join(d, 'var', 'certs', 'ecole.crt'), 'utf8')).toBe(crt);
  });
});

describe('compose.yml et Caddyfile du relais', () => {
  const y = readFileSync(join(RELAIS, 'compose.yml'), 'utf8');
  const block = (name: string) => {
    const i = y.indexOf(`\n  ${name}:\n`);
    const rest = y.slice(i + 1);
    const end = rest.slice(3).search(/\n {2}[a-z]+:\n|\nvolumes:/);
    return end < 0 ? rest : rest.slice(0, end + 3);
  };
  it('chaque service reçoit SON fichier ; web aucun ; certificat en lecture seule pour Caddy', () => {
    expect(block('relay')).toMatch(/env_file: '[^']*\/relais\.env'/);
    expect(block('caddy')).toMatch(/env_file: '[^']*\/caddy\.env'/);
    expect(block('caddy')).not.toContain('relais.env');
    expect(block('web')).not.toContain('env_file');
    expect(block('web')).toContain("API_URL: 'http://relay:3000'");
    expect(block('caddy')).toMatch(/certs:\/certs:ro'/);
  });
  it('Caddyfile : HTTPS avec le certificat de l’école, aucune demande ACME depuis l’école', () => {
    const c = readFileSync(join(RELAIS, 'Caddyfile'), 'utf8');
    expect(c).toContain('tls /certs/ecole.crt /certs/ecole.key');
    expect(c).toContain('auto_https disable_certs');
    expect(c).toMatch(/@relais path \/api\/\* \/relais\/\*/);
  });
  it('serveur central : certificat à la demande seulement pour un relais enregistré', () => {
    const c = readFileSync(join(PROD, 'Caddyfile'), 'utf8');
    expect(c).toContain('ask http://api:3000/api/v1/relais/tls-autorise');
    expect(c).toContain('https://*.{$RELAIS_DOMAINE:relais.invalid}');
    const p = readFileSync(join(PROD, 'compose.yml'), 'utf8');
    expect(p).toContain("volumes: ['relais_certs:/relais-certs:ro']");
    expect(p).toContain('- caddy_data:/data:ro');
  });
});
