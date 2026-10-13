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
const GCP = join(ROOT, 'infra', 'gcp');
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
  it('copie la sauvegarde et son empreinte vers gs:// (gcloud storage cp, version testée sur le bucket réel) et journalise « hors-site ok »', () => {
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
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(
      /^storage cp --quiet .*awform-\d{8}-\d{6}\.dump\.gpg .*\.dump\.gpg\.sha256 gs:\/\/mon-compartiment\/$/,
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
    expect(ign).toMatch(/^\.env$/m);
    for (const f of ['backup.sh', 'backup-selftest.sh', '../gcp/creer-ressources.sh']) {
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
  'serveur Google Cloud (infra/gcp, fusionné) : plafond de dépense en mode à blanc, web fermé par défaut',
  () => {
    // PATH sans gcloud : si un script tentait de le lancer, le test échouerait
    const env = { PATH: '/usr/bin:/bin', HOME: tmpdir(), GCLOUD: '/inexistant/gcloud' };
    it('plafond-budget.sh : à blanc par défaut, affiche budget, sujet, rôle minimal et fonction ; rien n’est lancé', () => {
      expect(spawnSync('bash', ['-n', join(GCP, 'plafond-budget.sh')]).status).toBe(0);
      const r = sh(join(GCP, 'plafond-budget.sh'), env);
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toContain('MODE À BLANC');
      expect(r.stdout).not.toMatch(/command not found|MODE RÉEL/);
      for (const m of [
        'billing budgets create',
        '45EUR',
        'percent=0.9',
        'percent=1.0',
        '--credit-types-treatment exclude-all-credits',
        'pubsub topics create awzid-budget',
        'compute.instances.stop',
        'functions deploy awzid-disjoncteur',
        'instances start awzid-beta',
      ])
        expect(r.stdout, m).toContain(m);
      // le rôle de la fonction ne permet ni de supprimer ni de créer une machine
      expect(r.stdout).not.toMatch(/instances\.(delete|create)|roles\/(owner|editor)/);
    });
    it('--executer exige le compte de facturation (rien n’est lancé sans lui)', () => {
      const r = sh(join(GCP, 'plafond-budget.sh'), env, '--executer');
      expect(r.status).toBe(2);
      expect(r.stdout).toContain('BILLING_ACCOUNT à renseigner');
    });
    it('le web reste fermé par défaut et l’ouverture exige un accord explicite (--oui)', () => {
      const r = sh(join(GCP, 'ouvrir-web.sh'), env);
      expect(r.status).toBe(2);
      expect(r.stdout).toContain("rien n'a été changé");
      const c = readFileSync(join(GCP, 'creer-ressources.sh'), 'utf8');
      expect(c).toMatch(/awzid-allow-web[\s\S]*--disabled/);
      expect(readFileSync(join(GCP, 'config.sh'), 'utf8')).not.toMatch(
        /BEGIN PRIVATE|password|secret\s*=|api[_-]?key/i,
      );
    });
    it('disjoncteur : arrête la machine seulement quand le coût réel atteint le budget', () => {
      const code = `
import importlib.util
spec=importlib.util.spec_from_file_location('m','${join(GCP, 'disjoncteur', 'main.py')}')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
print(m.doit_arreter({'costAmount':4.9,'budgetAmount':10}), m.doit_arreter({'costAmount':10,'budgetAmount':10}), m.doit_arreter({'costAmount':12,'budgetAmount':10}), m.doit_arreter({'costAmount':3}))`;
      const r = spawnSync('python3', ['-c', code], { encoding: 'utf8' });
      if (r.error) return; // python3 absent : test ignoré
      expect(r.stdout.trim()).toBe('False True True False');
    });
    it('le guide du client ne demande plus d’acheter le domaine, d’activer la facturation ni de créer un compte Google Cloud', () => {
      const g = readFileSync(join(ROOT, 'docs', 'projet', 'GUIDE_BETA_CLIENT.md'), 'utf8');
      expect(g).not.toMatch(
        /Acheter le nom de domaine|Créer un nouveau projet|Associer un compte de facturation/,
      );
      expect(g).toContain('app.awzid.com');
      expect(g).toContain('34.163.24.96');
      expect(g).toContain('ouvrir-web.sh');
    });
  },
);

describe.skipIf(!posix)(
  'nom canonique awzid.com : alias en 301, certificats par nom, HSTS prudent',
  () => {
    it('Caddyfile : alias → nom canonique, HSTS réglable (court au début), jamais includeSubDomains ni preload', () => {
      const c = readFileSync(join(PROD, 'Caddyfile'), 'utf8');
      expect(c).toContain('https://{$SITE_ALIAS_1:127.0.0.4}, https://{$SITE_ALIAS_2:127.0.0.5}');
      expect(c).toContain('redir https://{$SITE}{uri} 301');
      expect(c).toContain('max-age={$AWFORM_HSTS_SECONDES:31536000}');
      // (hors commentaires)
      expect(
        c
          .split('\n')
          .filter((l) => !l.trim().startsWith('#'))
          .join('\n'),
      ).not.toMatch(/includeSubDomains|preload/i);
      const scopes = readFileSync(join(PROD, 'env-scopes.conf'), 'utf8');
      expect(scopes).toMatch(
        /^caddy:.*SITE_ALIAS_1.*SITE_ALIAS_2.*AWFORM_HSTS_SECONDES|^caddy:.*AWFORM_HSTS_SECONDES.*SITE_ALIAS_1/m,
      );
    });
    it('production : HSTS de 300 s au départ, adresse publique sur le nom canonique, déjà réglé = conservé', () => {
      const d = tmp();
      const f = join(d, 'prod.env');
      writeFileSync(f, 'SITE=awzid.com\nCOOKIE_SECURE=auto\n');
      const env = { PATH: process.env.PATH };
      expect(sh(join(PROD, 'mode-env.sh'), env, f, '1').status).toBe(0);
      let e = readFileSync(f, 'utf8');
      expect(e).toMatch(/^AWFORM_HSTS_SECONDES=300$/m);
      expect(e).toMatch(/^AWFORM_PUBLIC_URL=https:\/\/awzid\.com$/m);
      // le client allonge la durée plus tard : le déploiement suivant ne la ramène pas à 300
      e = e.replace('AWFORM_HSTS_SECONDES=300', 'AWFORM_HSTS_SECONDES=86400');
      writeFileSync(f, e);
      sh(join(PROD, 'mode-env.sh'), env, f, '1');
      expect(readFileSync(f, 'utf8')).toMatch(/^AWFORM_HSTS_SECONDES=86400$/m);
    });
    it('deploy.sh accepte --alias (deux noms au plus) et le serveur de bêta utilise awzid.com + www + app', () => {
      const dep = readFileSync(join(PROD, 'deploy.sh'), 'utf8');
      expect(dep).toContain('--alias)');
      expect(dep).toContain('SITE_ALIAS_1');
      const gcp = readFileSync(join(GCP, 'deployer-beta.sh'), 'utf8');
      expect(gcp).toContain('DOMAINE="${AWZID_DOMAINE:-awzid.com}"');
      expect(gcp).toContain('--alias "www.$DOMAINE" --alias "app.$DOMAINE"');
    });
    const docker = spawnSync('docker', ['version'], { encoding: 'utf8' }).status === 0;
    it.skipIf(!docker)(
      'essai LOCAL de Caddy avec des noms de test (caddy-essai.sh) : alias 301, HSTS 300 s, noindex',
      () => {
        const r = sh(join(PROD, 'caddy-essai.sh'), process.env);
        expect(r.stdout, r.stderr).toContain('Caddyfile : essai local OK');
        expect(r.status).toBe(0);
      },
      90_000,
    );
  },
);

describe.skipIf(!posix)(
  'alias de sections (arabe, quran, fiqh, fikh, adab, akhlaq) : désactivés par défaut, un certificat par nom',
  () => {
    const run = (d: string, ...a: string[]) =>
      sh(
        join(PROD, 'alias-sections.sh'),
        { PATH: process.env.PATH, AWFORM_ENV_DIR: d, AWFORM_ALIAS_SANS_RECHARGE: '1' },
        ...a,
      );
    const dossier = () => {
      const d = tmp();
      writeFileSync(join(d, 'caddy.env'), 'SITE=awzid.com\n');
      return d;
    };
    it('par défaut tout est désactivé ; activer / désactiver écrit seulement les noms choisis', () => {
      const d = dossier();
      const l0 = run(d, 'liste').stdout;
      expect(l0.match(/désactivé/g)).toHaveLength(6);
      expect(l0).not.toContain('ACTIF');
      expect(run(d, 'activer', 'quran', 'adab').status).toBe(0);
      const c = readFileSync(join(d, 'alias', 'sections.caddy'), 'utf8');
      expect(c).toContain('https://quran.awzid.com {');
      expect(c).toContain('redir https://{$SITE}/coran 301');
      expect(c).toContain('https://adab.awzid.com {');
      expect(c).toContain('redir https://{$SITE}/vivre 301');
      expect(c).not.toMatch(/islam\.|vivre\.awzid/);
      expect(c).not.toContain('fiqh.awzid.com');
      // un seul nom par bloc, jamais de joker, jamais de cookie sur le domaine parent
      expect(c).not.toMatch(/\*\.|Domain|Set-Cookie/i);
      expect(run(d, 'activer', 'tous').status).toBe(0);
      const t = readFileSync(join(d, 'alias', 'sections.caddy'), 'utf8');
      for (const [n, ch] of [
        ['arabe', '/'],
        ['quran', '/coran'],
        ['fiqh', '/madjaliss'],
        ['fikh', '/madjaliss'],
        ['adab', '/vivre'],
        ['akhlaq', '/vivre'],
      ])
        (expect(t).toContain(`https://${n}.awzid.com {`),
          expect(t).toContain(`redir https://{$SITE}${ch} 301`));
      // retour arrière
      expect(run(d, 'desactiver', 'fiqh', 'fikh').status).toBe(0);
      expect(readFileSync(join(d, 'alias', 'sections.caddy'), 'utf8')).not.toContain(
        'fiqh.awzid.com',
      );
      expect(run(d, 'desactiver', 'tous').status).toBe(0);
      expect(readFileSync(join(d, 'alias', 'sections.caddy'), 'utf8')).not.toContain('https://');
      expect(run(d, 'liste').stdout).not.toContain('ACTIF');
    });
    it('alias inconnu ou domaine invalide : refusé, rien n’est écrit', () => {
      const d = dossier();
      const r = run(d, 'activer', 'inconnu');
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('alias inconnu');
      writeFileSync(join(d, 'caddy.env'), 'SITE=evil.com; rm\n');
      expect(run(d, 'liste').status).toBe(2);
    });
    it('les chemins visés existent dans l’application et le Caddyfile importe le dossier des alias', () => {
      for (const r of ['coran', 'madjaliss', 'vivre'])
        expect(existsSync(join(ROOT, 'apps', 'web', 'src', 'routes', r)), r).toBe(true);
      expect(readFileSync(join(PROD, 'Caddyfile'), 'utf8')).toContain(
        'import /etc/caddy/alias/*.caddy',
      );
      expect(readFileSync(join(PROD, 'compose.yml'), 'utf8')).toContain(
        '/alias:/etc/caddy/alias:ro',
      );
      expect(readFileSync(join(PROD, 'deploy.sh'), 'utf8')).toContain('mkdir -p "$CONF/alias"');
    });
  },
);
