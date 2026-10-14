/**
 * Lot 8 (g) : branchement de l'envoi d'e-mails sur le SMTP d'OVH (smtp.mail.ovh.net, port 587, STARTTLS, expéditeur
 * no-reply@awzid.com). AUCUN envoi réel : nodemailer est simulé ; le script du client (smtp-ovh.sh) est essayé dans un
 * HOME temporaire avec un mot de passe FACTICE (« essai »), sans jamais toucher un secret réel.
 */
import { spawnSync } from 'node:child_process';
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
import { afterEach, describe, expect, it, vi } from 'vitest';

const crees: Array<Record<string, unknown>> = [];
const envoyes: Array<Record<string, unknown>> = [];
vi.mock('nodemailer', () => ({
  default: {
    createTransport: (o: Record<string, unknown>) => {
      crees.push(o);
      return {
        sendMail: async (m: Record<string, unknown>) => {
          envoyes.push(m);
          return {};
        },
      };
    },
  },
}));

const { mailerFromEnv } = await import('../src/mail/envoi.js');

const ROOT = join(import.meta.dirname, '..', '..', '..');
const PROD = join(ROOT, 'infra', 'prod');
const posix = process.platform !== 'win32';
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  crees.length = 0;
  envoyes.length = 0;
});

const OVH = {
  AWFORM_MAIL: 'smtp',
  AWFORM_SMTP_HOST: 'smtp.mail.ovh.net',
  AWFORM_SMTP_PORT: '587',
  AWFORM_SMTP_TLS: 'starttls',
  AWFORM_SMTP_USER: 'no-reply@awzid.com',
  AWFORM_SMTP_PASSWORD: 'mot-de-passe-factice-essai',
};

describe('SMTP OVH : envoi simulé', () => {
  it('serveur, port 587, STARTTLS exigé, identifiant et expéditeur no-reply@awzid.com', async () => {
    const m = mailerFromEnv(OVH);
    expect(m.mode).toBe('smtp');
    await m.send({
      to: 'eleve@example.test',
      subject: 'Essai',
      text: 'texte',
      html: '<p>texte</p>',
      kind: 'essai',
    });
    expect(crees).toHaveLength(1);
    expect(crees[0]).toMatchObject({
      host: 'smtp.mail.ovh.net',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'no-reply@awzid.com', pass: 'mot-de-passe-factice-essai' },
    });
    expect(envoyes).toHaveLength(1);
    expect(envoyes[0]).toMatchObject({
      from: 'Awzid <no-reply@awzid.com>',
      to: 'eleve@example.test',
      subject: 'Essai',
    });
  });

  it('la démonstration n’envoie jamais vers OVH : boîte de démonstration à la place', async () => {
    const avis: string[] = [];
    const m = mailerFromEnv({ ...OVH, AWFORM_DEMO: '1' }, (w) => avis.push(w));
    expect(m.mode).toBe('journal');
    expect(avis[0]).toMatch(/refusé/);
    expect(crees).toHaveLength(0);
  });

  it('sans mot de passe réglé, ni plantage ni secret en clair dans les périmètres des services', () => {
    const scopes = readFileSync(join(PROD, 'env-scopes.conf'), 'utf8');
    for (const svc of ['api:', 'alerte:']) {
      const l = scopes.split('\n').find((x) => x.startsWith(svc))!;
      for (const v of [
        'AWFORM_MAIL',
        'AWFORM_SMTP_HOST',
        'AWFORM_SMTP_PORT',
        'AWFORM_SMTP_TLS',
        'AWFORM_SMTP_USER',
        'AWFORM_SMTP_PASSWORD',
      ])
        expect(l.split(/\s+/)).toContain(v);
    }
    const worker = scopes.split('\n').find((x) => x.startsWith('worker:'))!;
    expect(worker).not.toContain('SMTP');
  });
});

describe.skipIf(!posix)('smtp-ovh.sh (script exécuté par le client sur le serveur)', () => {
  function monde(avecDemo = false) {
    const h = mkdtempSync(join(tmpdir(), 'smtp-ovh-'));
    dirs.push(h);
    const conf = join(h, 'conf');
    mkdirSync(conf);
    writeFileSync(
      join(conf, 'prod.env'),
      `SITE=awzid.com\nAWFORM_SMTP_PASSWORD=ancien\nAWFORM_ALERTE_A=moi@example.test\n${avecDemo ? 'AWFORM_DEMO=1\n' : ''}`,
      { mode: 0o600 },
    );
    return { h, conf };
  }
  const lance = (conf: string, h: string, entree: string) =>
    spawnSync('bash', [join(PROD, 'smtp-ovh.sh')], {
      env: { PATH: process.env.PATH, HOME: h, AWFORM_ENV_DIR: conf, AWFORM_SMTP_REDEMARRER: '0' },
      input: entree,
      encoding: 'utf8',
    });

  it('écrit les 6 réglages dans prod.env (droits 600), découpe les périmètres, n’affiche jamais le mot de passe', () => {
    const { h, conf } = monde();
    const r = lance(conf, h, '\nMotDePasse-Factice_42\nMotDePasse-Factice_42\n');
    expect(r.status).toBe(0);
    const env = readFileSync(join(conf, 'prod.env'), 'utf8');
    expect(env).toContain('AWFORM_MAIL=smtp\n');
    expect(env).toContain('AWFORM_SMTP_HOST=smtp.mail.ovh.net\n');
    expect(env).toContain('AWFORM_SMTP_PORT=587\n');
    expect(env).toContain('AWFORM_SMTP_TLS=starttls\n');
    expect(env).toContain('AWFORM_SMTP_USER=no-reply@awzid.com\n');
    expect(env.match(/^AWFORM_SMTP_PASSWORD=/gm)).toHaveLength(1);
    expect(env).toContain('AWFORM_SMTP_PASSWORD=MotDePasse-Factice_42\n');
    expect(env).toContain('SITE=awzid.com');
    expect(env).not.toContain('ancien');
    expect(statSync(join(conf, 'prod.env')).mode & 0o777).toBe(0o600);
    // périmètres : api et alerte reçoivent le réglage, avec droits 600
    for (const svc of ['api', 'alerte']) {
      const f = join(conf, `${svc}.env`);
      expect(readFileSync(f, 'utf8')).toContain('AWFORM_SMTP_PASSWORD=MotDePasse-Factice_42');
      expect(statSync(f).mode & 0o777).toBe(0o600);
    }
    expect(readFileSync(join(conf, 'worker.env'), 'utf8')).not.toContain('SMTP');
    // jamais affiché, ni dans la sortie ni dans l'erreur, ni dans un historique
    expect(r.stdout + r.stderr).not.toContain('MotDePasse-Factice_42');
    expect(existsSync(join(h, '.bash_history'))).toBe(false);
  });

  it('refuse deux saisies différentes, un mot de passe trop court ou illisible par Docker : rien n’est modifié', () => {
    const { h, conf } = monde();
    const avant = readFileSync(join(conf, 'prod.env'), 'utf8');
    for (const e of [
      '\nAbcdefgh1234\nAutreChose5678\n',
      '\ncourt\ncourt\n',
      '\nAbc$defgh123\nAbc$defgh123\n',
      '\nAbc defgh123\nAbc defgh123\n',
      "\nAbc'defgh123\nAbc'defgh123\n",
    ]) {
      const r = lance(conf, h, e);
      expect(r.status).toBe(1);
      expect(readFileSync(join(conf, 'prod.env'), 'utf8')).toBe(avant);
    }
  });

  it('refuse de tourner sur la démonstration', () => {
    const { h, conf } = monde(true);
    const r = lance(conf, h, '\nMotDePasse-Factice_42\nMotDePasse-Factice_42\n');
    expect(r.status).toBe(2);
    expect(readFileSync(join(conf, 'prod.env'), 'utf8')).not.toContain('smtp.mail.ovh.net');
  });

  it('le script ne lit le mot de passe ni dans ses arguments ni dans l’environnement', () => {
    const s = readFileSync(join(PROD, 'smtp-ovh.sh'), 'utf8');
    expect(s).toMatch(/read -rs/);
    expect(s).not.toMatch(/PW=.\$\{?[0-9@]|\$@|AWFORM_SMTP_PASSWORD:-/);
  });
});
