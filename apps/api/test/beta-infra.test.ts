/**
 * Bêta fermée — exploitation : alertes par e-mail (alerte.sh), sauvegarde hors machine vers Google Cloud Storage
 * (faux gcloud), mode de production (invitation, certificat public), Caddyfile (noindex, robots, sonde, TLS),
 * scripts Google Cloud (mode à blanc : rien n'est lancé sans --executer), disjoncteur du budget.
 * Scripts réels, faux `docker`/`gcloud`/`status.sh`, HOME temporaire.
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
const GCP = join(PROD, 'gcp');
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'beta-infra-'));
  dirs.push(d);
  return d;
};
const sh = (file: string, env: NodeJS.ProcessEnv, ...args: string[]) =>
  spawnSync('bash', [file, ...args], { env, encoding: 'utf8' });
const fake = (bin: string, name: string, body: string) => {
  writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
  chmodSync(join(bin, name), 0o755);
};
const posix = process.platform !== 'win32';
const hasGpg = spawnSync('gpg', ['--version']).status === 0;

describe.skipIf(!posix)('alertes par e-mail (alerte.sh)', () => {
  function setup(statusOut: string) {
    const h = tmp();
    const bin = join(h, 'bin');
    mkdirSync(bin);
    const mails = join(h, 'mails');
    // faux docker : enregistre l'objet et le corps de chaque e-mail « envoyé »
    fake(
      bin,
      'docker',
      `echo "OBJET: $(for a in "$@"; do last="$a"; done; echo "$last")" >> "${mails}"; cat >> "${mails}"; echo "---" >> "${mails}"`,
    );
    const statut = join(h, 'status.sh');
    writeFileSync(statut, `#!/bin/sh\ncat "${join(h, 'sortie.txt')}"\n`);
    chmodSync(statut, 0o755);
    writeFileSync(join(h, 'sortie.txt'), statusOut);
    const env = {
      PATH: `${bin}:${process.env.PATH}`,
      HOME: h,
      AWFORM_STATUS_CMD: statut,
      AWFORM_ALERTE_DIR: join(h, 'etat'),
    };
    const lu = () => (existsSync(mails) ? readFileSync(mails, 'utf8') : '');
    return { h, env, mails, lu, sortie: (s: string) => writeFileSync(join(h, 'sortie.txt'), s) };
  }
  const run = (env: NodeJS.ProcessEnv, ...a: string[]) => sh(join(PROD, 'alerte.sh'), env, ...a);

  it('tout va bien : aucun e-mail', () => {
    const t = setup('== conteneurs\nok\n');
    expect(run(t.env).status).toBe(0);
    expect(t.lu()).toBe('');
  });
  it('une alerte : un e-mail, pas de répétition, rappel après 6 h, e-mail « rétabli » au retour à la normale', () => {
    const t = setup('== disque\nALERTE : disque plein à 91 %\n');
    expect(run(t.env).status).toBe(0);
    const un = t.lu();
    expect(un.match(/OBJET:/g)).toHaveLength(1);
    expect(un).toContain('OBJET: ALERTE — disque plein à 91 %');
    expect(un).toContain('ALERTE : disque plein à 91 %');
    // même alerte 15 minutes plus tard : rien de plus
    run(t.env);
    expect(t.lu().match(/OBJET:/g)).toHaveLength(1);
    // rappel au-delà du délai (réglé à 0 s pour l'essai)
    run({ ...t.env, AWFORM_ALERTE_RAPPEL_S: '0' });
    expect(t.lu().match(/OBJET:/g)).toHaveLength(2);
    // une alerte différente part tout de suite
    t.sortie('ALERTE : dernière sauvegarde réussie de plus de 26 h\n');
    run(t.env);
    expect(t.lu().match(/OBJET:/g)).toHaveLength(3);
    // retour à la normale : un e-mail « rétabli », puis plus rien
    t.sortie('== tout va bien\n');
    run(t.env);
    expect(t.lu()).toContain('OBJET: rétabli');
    const n = t.lu().match(/OBJET:/g)!.length;
    run(t.env);
    expect(t.lu().match(/OBJET:/g)).toHaveLength(n);
  });
  it('--essai envoie un e-mail d’essai ; échec d’envoi : journalisé, jamais bloquant', () => {
    const t = setup('rien\n');
    expect(run(t.env, '--essai').status).toBe(0);
    expect(t.lu()).toContain("OBJET: essai d'alerte");
    // faux docker en échec (service d'e-mail non réglé : code 2)
    const bin = join(t.h, 'bin');
    fake(bin, 'docker', 'cat >/dev/null; exit 2');
    t.sortie('ALERTE : x\n');
    expect(run(t.env).status).toBe(0);
    expect(readFileSync(join(t.h, 'etat', 'alerte.log'), 'utf8')).toMatch(
      /e-mail non envoyé \(code 2\)/,
    );
  });
  it('le service « alerte » a son propre périmètre de secrets (ni base ni clés)', () => {
    const scopes = readFileSync(join(PROD, 'env-scopes.conf'), 'utf8');
    const l = scopes.split('\n').find((x) => x.startsWith('alerte:'))!;
    expect(l).toContain('AWFORM_ALERTE_A');
    expect(l).toContain('AWFORM_SMTP_PASSWORD');
    expect(l).not.toMatch(/DATABASE|SECRET_KEY|RECITATION|MESSAGE_KEY/);
    const compose = readFileSync(join(PROD, 'compose.yml'), 'utf8');
    expect(compose).toMatch(/alerte:[\s\S]*?alerte\.env[\s\S]*?profiles: \[outils\]/);
    expect(readFileSync(join(PROD, 'deploy.sh'), 'utf8')).toContain('awform-alerte.timer');
  });
});

describe.skipIf(!posix || !hasGpg)('sauvegarde hors machine vers Google Cloud Storage', () => {
  it('copie chaque fichier vers gs:// avec un nom explicite (gcloud storage cp) et journalise « hors-site ok »', () => {
    const h = tmp();
    const bin = join(h, 'bin');
    mkdirSync(bin);
    fake(bin, 'docker', "printf 'PGDMP-faux'");
    const trace = join(h, 'gcloud.log');
    fake(bin, 'gcloud', `echo "$@" >> "${trace}"`);
    const env = { PATH: `${bin}:${process.env.PATH}`, HOME: h, GNUPGHOME: join(h, 'gnupg') };
    expect(sh(join(PROD, 'backup-keygen.sh'), env).status).toBe(0);
    const r = sh(join(PROD, 'backup.sh'), {
      ...env,
      AWFORM_BACKUP_HORS_SITE: 'gs://mon-compartiment',
    });
    expect(r.status, r.stderr).toBe(0);
    const calls = readFileSync(trace, 'utf8').trim().split('\n');
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatch(
      /^storage cp --quiet .*awform-\d{8}-\d{6}\.dump\.gpg gs:\/\/mon-compartiment\/awform-\d{8}-\d{6}\.dump\.gpg$/,
    );
    expect(calls[1]).toMatch(
      /\.dump\.gpg\.sha256 gs:\/\/mon-compartiment\/awform-.*\.dump\.gpg\.sha256$/,
    );
    expect(readFileSync(join(h, 'awform-backups', 'backup.log'), 'utf8')).toMatch(/hors-site ok/);
    // gcloud en échec : « hors-site ÉCHEC » au journal, la sauvegarde locale reste bonne, l'état alerte
    fake(bin, 'gcloud', 'exit 1');
    const r2 = sh(join(PROD, 'backup.sh'), {
      ...env,
      AWFORM_BACKUP_HORS_SITE: 'gs://mon-compartiment',
    });
    expect(r2.status).toBe(0);
    expect(readFileSync(join(h, 'awform-backups', 'backup.log'), 'utf8')).toMatch(
      /hors-site ÉCHEC/,
    );
    const st = sh(join(PROD, 'backup-status.sh'), env, join(h, 'awform-backups'));
    expect(st.stdout).toMatch(/ALERTE.*copie hors site en échec/);
  });
  it('rotation locale : seules les 14 dernières sont gardées (AWFORM_BACKUP_KEEP)', () => {
    const h = tmp();
    const bin = join(h, 'bin');
    mkdirSync(bin);
    fake(bin, 'docker', "printf 'PGDMP-faux'");
    const env = {
      PATH: `${bin}:${process.env.PATH}`,
      HOME: h,
      GNUPGHOME: join(h, 'gnupg'),
      AWFORM_BACKUP_KEEP: '2',
    };
    sh(join(PROD, 'backup-keygen.sh'), env);
    for (let i = 0; i < 4; i++) {
      expect(sh(join(PROD, 'backup.sh'), env).status).toBe(0);
      // les noms portent la seconde : on les sépare
      spawnSync('sleep', ['1.1']);
    }
    const left = readdirSync(join(h, 'awform-backups')).filter((f) => f.endsWith('.dump.gpg'));
    expect(left).toHaveLength(2);
  });
  it('la clé de chiffrement ne quitte jamais le dépôt : aucun fichier de clé versionné, scripts sans clé en dur', () => {
    const ign = readFileSync(join(ROOT, '.gitignore'), 'utf8');
    expect(ign).toMatch(/config\.env/);
    for (const f of ['backup.sh', 'backup-selftest.sh', 'gcp/sauvegardes.sh']) {
      const s = readFileSync(join(PROD, f), 'utf8');
      expect(s).not.toMatch(/BEGIN PGP PRIVATE KEY|passphrase +['"][^'"]+['"]/);
    }
  });
});

describe.skipIf(!posix)('production : invitation, certificat public, invisibilité (Caddy)', () => {
  it('mode-env.sh --production : bêta sur invitation une seule fois, certificat public, adresse publique', () => {
    const d = tmp();
    const f = join(d, 'prod.env');
    writeFileSync(f, 'SITE=beta.awzid.com\nCOOKIE_SECURE=auto\n');
    const env = { PATH: process.env.PATH };
    expect(sh(join(PROD, 'mode-env.sh'), env, f, '1').status).toBe(0);
    let e = readFileSync(f, 'utf8');
    expect(e).toMatch(/^AWFORM_TLS=tls_public$/m);
    expect(e).toMatch(/^AWFORM_ACCES=invitation$/m);
    expect(e).toMatch(/^AWFORM_PUBLIC_URL=https:\/\/beta\.awzid\.com$/m);
    // l'administrateur a choisi « ferme » depuis l'environnement : le déploiement suivant ne le défait pas
    e = e.replace('AWFORM_ACCES=invitation', 'AWFORM_ACCES=ferme');
    writeFileSync(f, e);
    sh(join(PROD, 'mode-env.sh'), env, f, '1');
    expect(readFileSync(f, 'utf8')).toMatch(/^AWFORM_ACCES=ferme$/m);
    expect(readFileSync(f, 'utf8').match(/AWFORM_TLS/g)).toHaveLength(1);
    // réseau local : autorité interne, jamais le certificat public
    sh(join(PROD, 'mode-env.sh'), env, f, '0');
    expect(readFileSync(f, 'utf8')).not.toMatch(/AWFORM_TLS/);
  });
  it('Caddyfile : noindex partout, robots.txt strict, pas de sitemap, sonde, page d’état, TLS au choix', () => {
    const c = readFileSync(join(PROD, 'Caddyfile'), 'utf8');
    expect(c).toMatch(/X-Robots-Tag "noindex, nofollow, noarchive, nosnippet, noimageindex"/);
    expect(c).toMatch(/handle \/robots\.txt[\s\S]*Disallow: \//);
    expect(c).toMatch(/@sitemap path \/sitemap\.xml/);
    expect(c).toMatch(/handle \/healthz[\s\S]*reverse_proxy api:3000/);
    expect(c).toMatch(/handle \/etat[\s\S]*etat\.html/);
    expect(c).toContain('import {$AWFORM_TLS:tls_interne}');
    expect(c).toMatch(/\(tls_interne\) \{\s*tls internal/);
    expect(c).toMatch(/Strict-Transport-Security/);
    expect(c).toMatch(/X-Frame-Options DENY/);
    expect(readFileSync(join(PROD, 'env-scopes.conf'), 'utf8')).toMatch(/^caddy:.*AWFORM_TLS/m);
  });
  it('smoke.sh et entetes-check.sh contrôlent l’invisibilité et les en-têtes', () => {
    const s = readFileSync(join(PROD, 'smoke.sh'), 'utf8');
    for (const m of ['robots.txt strict', 'X-Robots-Tag', 'sitemap', '/healthz', '/etat'])
      expect(s).toContain(m);
    const e = readFileSync(join(PROD, 'entetes-check.sh'), 'utf8');
    for (const m of ['Content-Security-Policy', 'X-Robots-Tag', 'HSTS', 'robots.txt', 'og:'])
      expect(e).toContain(m);
    expect(spawnSync('bash', ['-n', join(PROD, 'entetes-check.sh')]).status).toBe(0);
  });
});

describe.skipIf(!posix)(
  'scripts Google Cloud : mode à blanc par défaut, rien n’est lancé sans --executer',
  () => {
    const scripts = [
      'creer-serveur.sh',
      'pare-feu.sh',
      'sauvegardes.sh',
      'budget.sh',
      'dns.sh',
      'envoyer.sh',
    ];
    // PATH sans gcloud : si un script tentait de le lancer, le test échouerait
    const env = {
      PATH: '/usr/bin:/bin',
      HOME: tmpdir(),
      AWZID_GCP_CONFIG: join(GCP, 'config.env.exemple'),
    };
    it('chaque script est valide (bash -n) et affiche ses commandes sans les lancer', () => {
      for (const s of scripts) {
        expect(spawnSync('bash', ['-n', join(GCP, s)]).status, s).toBe(0);
        const r = sh(join(GCP, s), env);
        expect(r.status, `${s} : ${r.stderr}`).toBe(0);
        if (s !== 'dns.sh') expect(r.stdout, s).toContain('MODE À BLANC');
        expect(r.stdout + r.stderr, s).not.toMatch(/command not found/);
      }
      for (const f of ['startup.sh', 'lib.sh'])
        expect(spawnSync('bash', ['-n', join(GCP, f)]).status, f).toBe(0);
    });
    it('le serveur est à Paris, avec adresse fixe, compte sans droit, SSH par IAP, disque et démarrage sécurisés', () => {
      const c = sh(join(GCP, 'creer-serveur.sh'), env).stdout;
      expect(c).toContain('--zone europe-west9-a');
      expect(c).toContain('addresses create awzid-beta-ip');
      expect(c).toMatch(/--shielded-secure-boot/);
      expect(c).toMatch(/enable-oslogin=TRUE,block-project-ssh-keys=TRUE/);
      expect(c).toMatch(/--deletion-protection/);
      const p = sh(join(GCP, 'pare-feu.sh'), env).stdout;
      expect(p).toContain('tcp:80,tcp:443');
      expect(p).toContain('35.235.240.0/20');
      expect(p).toContain('default-allow-ssh');
      const b = sh(join(GCP, 'sauvegardes.sh'), env).stdout;
      expect(b).toContain('--public-access-prevention');
      expect(b).toContain('roles/storage.objectCreator');
      expect(b).toContain('"age": 35');
      expect(b).not.toContain('objectAdmin');
    });
    it('budget : alertes 50/90/100 %, prévision, disjoncteur ; DNS : A seulement pour la bêta', () => {
      const b = sh(join(GCP, 'budget.sh'), env).stdout;
      for (const m of [
        'percent=0.5',
        'percent=0.9',
        'percent=1.0',
        'forecasted-spend',
        '10EUR',
        '45EUR',
        'functions deploy',
      ])
        expect(b).toContain(m);
      const d = sh(join(GCP, 'dns.sh'), env).stdout;
      expect(d).toMatch(/A +beta +ADRESSE-IP-DU-SERVEUR/);
      expect(d).toContain('NE PAS créer');
    });
    it('--executer exige une vraie configuration (config.env absent : refus, rien de lancé)', () => {
      const r = sh(
        join(GCP, 'creer-serveur.sh'),
        { PATH: '/usr/bin:/bin', HOME: tmpdir(), AWZID_GCP_CONFIG: '/inexistant/config.env' },
        '--executer',
      );
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('config.env absent');
      const x = sh(join(GCP, 'creer-serveur.sh'), env, '--executer');
      expect(x.status).toBe(2);
      expect(x.stderr).toMatch(/PROJECT_ID non rempli|gcloud/);
    });
    it('le script de démarrage installe mises à jour automatiques, échange et pare-feu, sans aucun secret', () => {
      const s = readFileSync(join(GCP, 'startup.sh'), 'utf8');
      for (const m of [
        'unattended-upgrades',
        'Automatic-Reboot',
        'swapfile',
        'ufw --force enable',
        'fail2ban',
      ])
        expect(s).toContain(m);
      expect(s).not.toMatch(/(password|token|secret)\s*=|PRIVATE KEY/i);
    });
    it('disjoncteur : arrête la machine seulement quand le coût réel atteint le budget', () => {
      const code = `
import importlib.util,sys
spec=importlib.util.spec_from_file_location('m','${join(GCP, 'disjoncteur', 'main.py')}')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
print(m.doit_arreter({'costAmount':4.9,'budgetAmount':10}), m.doit_arreter({'costAmount':10,'budgetAmount':10}), m.doit_arreter({'costAmount':12,'budgetAmount':10}), m.doit_arreter({'costAmount':3}))`;
      const r = spawnSync('python3', ['-c', code], { encoding: 'utf8' });
      if (r.error) return; // python3 absent : test ignoré
      expect(r.stdout.trim()).toBe('False True True False');
    });
  },
);
