#!/usr/bin/env node
/**
 * Démarrage du relais d'école (lot 17). Variables (fichier relais.env écrit par l'installation) :
 *   AWFORM_RELAIS_AMONT    serveur central (https://…)
 *   AWFORM_RELAIS_JETON    jeton du relais (donné par l'équipe AWFORM)
 *   AWFORM_RELAIS_CLE      clé de chiffrement locale (64 caractères hexadécimaux, générée à l'installation)
 *   AWFORM_RELAIS_DONNEES  dossier des données (défaut /data)
 *   AWFORM_RELAIS_CERTS    dossier où déposer le certificat de l'école pour Caddy (facultatif)
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRelay } from './relay.js';
import { RelayStore } from './store.js';
import { AudioCache } from './audio.js';

const env = process.env;
const upstream = (env.AWFORM_RELAIS_AMONT ?? '').replace(/\/$/, '');
const key = env.AWFORM_RELAIS_CLE ?? '';
if (!/^https?:\/\//.test(upstream)) throw new Error('AWFORM_RELAIS_AMONT absent ou invalide');
if (!/^[0-9a-f]{64}$/i.test(key))
  throw new Error('AWFORM_RELAIS_CLE absente (64 caractères hexadécimaux)');
const dataDir = env.AWFORM_RELAIS_DONNEES ?? '/data';
const store = new RelayStore(dataDir, Buffer.from(key, 'hex'));
// audio du Coran (lot 27) : récitateurs choisis par l'école, préchargés
const audio = new AudioCache(join(dataDir, 'audio'));
const certDir = env.AWFORM_RELAIS_CERTS ?? null;

const relay = buildRelay({
  upstream,
  token: env.AWFORM_RELAIS_JETON || null,
  store,
  version: env.AWFORM_VERSION ?? 'dev',
  audio,
  onCertificate: certDir
    ? ({ cert, key: k }) => {
        mkdirSync(certDir, { recursive: true });
        const crt = join(certDir, 'ecole.crt');
        if (existsSync(crt) && readFileSync(crt, 'utf8') === cert) return;
        // écriture atomique (fichier temporaire puis renommage) : Caddy ne lit jamais un fichier à moitié écrit ;
        // la clé d'abord, le certificat ensuite : le changement du certificat déclenche le rechargement de Caddy
        // (awform-relais-certificat.path, installé par install.sh)
        const put = (name: string, data: string) => {
          const tmp = join(certDir, `.${name}.tmp`);
          writeFileSync(tmp, data, { mode: 0o600 });
          renameSync(tmp, join(certDir, name));
        };
        put('ecole.key', k);
        put('ecole.crt', cert);
        console.log(
          JSON.stringify({ relais: 'certificat_mis_a_jour', at: new Date().toISOString() }),
        );
      }
    : undefined,
});

await relay.app.listen({ host: env.HOST ?? '0.0.0.0', port: Number(env.PORT ?? 3000) });
console.log(JSON.stringify({ relais: 'demarre', amont: upstream, at: new Date().toISOString() }));

// relais de la file toutes les 15 s ; battement et certificat toutes les 10 min
// audit OFF-6 : une erreur de la boucle est journalisée, jamais laissée non rattrapée (arrêt du processus)
const fail = (what: string) => (e: unknown) =>
  console.error(JSON.stringify({ relais: what, erreur: String((e as Error)?.message ?? e) }));
setInterval(() => {
  relay
    .syncOnce()
    .then((r) => {
      if (r.envoyes || r.refuses)
        console.log(JSON.stringify({ relais: 'envois', ...r, at: new Date().toISOString() }));
    })
    .catch(fail('erreur_envois'));
}, 15_000);
const beat = () =>
  void relay
    .checkOnline()
    .then(() => relay.heartbeat())
    .catch(fail('erreur_battement'));
beat();
setInterval(beat, 600_000);

// audio du Coran : alignement sur le choix de l'école au démarrage puis toutes les heures (téléchargement
// des fichiers manquants, effacement des récitateurs retirés)
const audioSync = () =>
  void relay
    .checkOnline()
    .then(() => relay.syncAudio())
    .then((r) => {
      if (r && (r.telecharges || r.effaces || r.erreurs))
        console.log(JSON.stringify({ relais: 'audio', ...r, at: new Date().toISOString() }));
    })
    .catch(fail('erreur_audio'));
setTimeout(audioSync, 30_000);
setInterval(audioSync, 3_600_000);

const stop = async () => {
  await relay.app.close();
  store.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
