/**
 * API REST v1 : santé, contenu (niveaux, leçons en projection élève, paquets hors ligne), comptes et profils
 * (lot 4, module auth/), tentatives et progression RÉSERVÉES aux profils du compte connecté.
 * Protection CSRF : toute requête qui modifie quelque chose doit porter l'en-tête « x-awform: 1 » (un site
 * tiers ne peut pas l'envoyer sans autorisation CORS, que l'API ne donne jamais) ; cookie SameSite=Lax.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import type { TutorSetup } from '@awform/tutor';
import type { BillingSetup } from '@awform/billing';
import { neededIllustrations } from './needed.js';
import { registerAuth } from './auth/routes.js';

export { neededIllustrations };
import { currentEdition, ping, setVerseSuraNames, type Db } from '@awform/db';
import { suraName } from '@awform/hifz';
import { registerHifz } from './hifz.js';
import { registerLibrary } from './library.js';
import { registerTutor } from './tutor.js';
import { registerBilling } from './billing.js';
import { registerAdmin } from './admin.js';
import { registerToday } from './today.js';
import { registerSchool } from './school.js';
import { registerActivities } from './activities.js';
import { recitationKeyFromEnv, registerRecitations } from './recitations.js';
import { messageKeyFromEnv, registerMessagerie } from './messagerie.js';
import { registerPush } from './push.js';
import { registerRelais } from './relais.js';
import { registerCorrections } from './corrections.js';
import { registerActivation } from './activation.js';
import { registerCarnet } from './carnet.js';
import { registerPratiqueAdulte } from './pratique-adulte.js';
import { registerRecital } from './recital.js';
import { registerEcoleSynthese } from './ecole-synthese.js';
import { registerCoranAudio } from './coran-audio.js';
import { essaiFetch, QfAudioClient, qfConfigFromEnv } from './coran-qf.js';
import { registerLeconsAudio } from './lecons-audio.js';
import { registerMushafExact } from './mushaf-exact.js';
import { registerContent } from './contenu.js';
import { registerQuotidien } from './quotidien.js';
import { notFound } from './routes-common.js';
import { registerProgress } from './progression.js';
import { registerEpreuves } from './epreuves.js';
import { registerSignalements } from './signalements.js';
import { registerEcoleF2 } from './ecole-f2.js';
import { registerParcoursA27 } from './parcours-a27.js';
import { registerVerification } from './verification.js';
import { certSignerFromEnv, type CertSigner } from './certsign.js';
import type { RecitationKey } from '@awform/db';

export interface AppOptions {
  db: Db;
  /** code d'édition imposé (sinon : l'édition publiée) */
  editionCode?: string;
  logger?: boolean;
  version?: string;
  /** cookie de session « Secure » (défaut : vrai) */
  cookieSecure?: boolean | 'auto';
  /** clé de chiffrement des secrets de second facteur (32 octets) ; absente → 2FA indisponible */
  secretKey?: Buffer | null;
  /** tuteur (tests) ; sinon AWFORM_TUTEUR */
  tutor?: TutorSetup;
  /** clé de chiffrement des récitations envoyées (tests) ; sinon AWFORM_RECITATION_KEY ; null : envoi fermé */
  recitationKey?: RecitationKey | null;
  /** clé de chiffrement des messages (tests) ; sinon AWFORM_MESSAGE_KEY ; null : messagerie fermée */
  messageKey?: RecitationKey | null;
  /** stockage des certificats de Caddy, en lecture (relais d'école) ; sinon AWFORM_RELAIS_CERTS */
  relaisCertsDir?: string | null;
  /** clé de signature des certificats (tests) ; sinon AWFORM_CERT_SIGN_KEY ; null : certificats non signés */
  certSigner?: CertSigner | null;
  /** paiements (tests) ; sinon AWFORM_PAIEMENT */
  billing?: BillingSetup;
  /** stockage des fichiers audio du Coran (tests) ; sinon AWFORM_AUDIO_DIR ; null : fichiers non servis */
  audioDir?: string | null;
  /** A2 : client de l'audio en ligne de Quran Foundation (tests) ; sinon QF_* ; null : inactif */
  qf?: QfAudioClient | null;
  /** A34 : dossier de synchronisation QF (publie/…) ; null = mise en page exacte indisponible */
  mushafExactDir?: string | null;
  /** A34 : dossier des polices QCF du Complexe (installer-polices.sh) */
  qcfFontsDir?: string | null;
  /** audio des leçons (A3, tests) ; sinon AWFORM_LECONS_AUDIO_DIR ; null : non servi */
  leconsAudioDir?: string | null;
  /** DÉMONSTRATION seulement (server.ts : AWFORM_DEMO=1 et garde-fou) : connexion simplifiée */
  demoLogin?: boolean;
}

/**
 * Journaux (audit MIN-13) : chemin sans chaîne de requête, identifiants remplacés par « :id », adresse IP
 * tronquée (IPv4 : dernier octet à 0 ; IPv6 : trois premiers groupes). Aucun e-mail, aucun identifiant d'élève.
 */
const UUID_ANY = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
export function logSafeUrl(url: string): string {
  return (url.split('?')[0] ?? '').replace(UUID_ANY, ':id');
}
export function truncIp(ip: string | undefined): string {
  if (!ip) return '';
  const v4 = /^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.\d+$/.exec(ip);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0`;
  return `${ip.split(':').slice(0, 3).join(':')}::`;
}
export const logSerializers = {
  req: (req: { method?: string; url?: string; ip?: string }) => ({
    method: req.method,
    url: logSafeUrl(req.url ?? ''),
    remoteAddress: truncIp(req.ip),
  }),
};

/** A2 : audio en ligne de Quran Foundation d'après l'environnement (inactif sans identifiants). */
function qfFromEnv(db: Db): QfAudioClient | null {
  const essai = process.env.AWFORM_AUDIO_ESSAI === 'on';
  const cfg = qfConfigFromEnv(process.env, essai);
  if (!cfg) return null;
  return new QfAudioClient(cfg, cfg.env === 'essai' ? essaiFetch(db) : undefined);
}

export function buildApp(opts: AppOptions): FastifyInstance {
  // versets cités dans les leçons : nom de la sourate de la référence affichée (métadonnées Tanzil)
  setVerseSuraNames(suraName);
  const hops = /^[1-9]$/.test(process.env.TRUST_PROXY ?? '') ? Number(process.env.TRUST_PROXY) : 0;
  // fonction de confiance : seuls les `hops` sauts les plus proches (Caddy) sont crus
  const proxyOpts = hops ? { trustProxy: (_addr: string, hop: number) => hop < hops } : {};
  const app = Fastify({
    logger: opts.logger
      ? {
          level: 'info',
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          serializers: logSerializers,
        }
      : false,
    bodyLimit: 1_048_576,
    // audit INF-6 : UN seul mandataire de confiance (Caddy) — l'adresse du client est la dernière qu'il
    // ajoute ; jamais `true` (Fastify prendrait l'adresse la plus à gauche, forgée par le client)
    ...proxyOpts,
  });
  const { db } = opts;

  // CSRF : en-tête obligatoire sur toute requête qui modifie
  app.addHook('onRequest', async (req, reply) => {
    // exception : webhooks signés des prestataires de paiement (signature vérifiée, aucun cookie)
    if (req.url.startsWith('/api/v1/billing/webhook/')) return;
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers['x-awform'] !== '1')
      return reply.code(403).send({ error: { code: 'csrf' } });
  });
  registerAuth(app, {
    db,
    cookieSecure: opts.cookieSecure ?? true,
    secretKey: opts.secretKey ?? null,
    demoLogin: opts.demoLogin === true,
  });

  // en-têtes de sécurité de base (la CSP stricte est posée par SvelteKit / Caddy)
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    if (!reply.hasHeader('Cache-Control')) reply.header('Cache-Control', 'no-store');
    return payload;
  });

  app.setNotFoundHandler((req, reply) => {
    void reply.code(404).send(notFound(`route inconnue : ${req.method} ${req.url}`));
  });

  app.setErrorHandler(
    (err: { statusCode?: number; validation?: unknown; message: string }, req, reply) => {
      if (err.validation)
        return reply.code(400).send({ error: { code: 'requete_invalide', message: err.message } });
      if (err.statusCode && err.statusCode < 500)
        return reply
          .code(err.statusCode)
          .send({ error: { code: 'requete_invalide', message: err.message } });
      req.log.error(err);
      return reply.code(500).send({ error: { code: 'erreur_interne', message: 'erreur interne' } });
    },
  );

  const edition = async () => currentEdition(db, opts.editionCode);
  const signer = opts.certSigner === undefined ? certSignerFromEnv() : opts.certSigner;
  registerHifz(app, db, edition);
  registerLibrary(app, db, edition);
  registerTutor(app, db, edition, opts.tutor);
  registerMessagerie(
    app,
    db,
    opts.messageKey === undefined ? messageKeyFromEnv() : opts.messageKey,
  );
  const rights = registerBilling(app, db, opts.billing);
  registerAdmin(app, db);
  registerToday(app, db, edition);
  registerSchool(app, db, edition, signer);
  registerActivities(app, db, edition, opts.demoLogin === true);
  registerRecitations(
    app,
    db,
    opts.recitationKey === undefined ? recitationKeyFromEnv() : opts.recitationKey,
  );
  registerPush(app, db);
  registerCorrections(app, db, edition);
  registerEpreuves(app, db, edition);
  registerCarnet(app, db, edition);
  registerPratiqueAdulte(app, db, edition);
  registerRecital(app, db, edition);
  registerEcoleSynthese(app, db);
  registerActivation(app, db);
  registerCoranAudio(
    app,
    db,
    opts.audioDir === undefined ? (process.env.AWFORM_AUDIO_DIR ?? null) : opts.audioDir,
    opts.qf === undefined ? qfFromEnv(db) : opts.qf,
  );
  registerLeconsAudio(
    app,
    opts.leconsAudioDir === undefined
      ? (process.env.AWFORM_LECONS_AUDIO_DIR ?? null)
      : opts.leconsAudioDir,
  );
  // A34 : Muṣḥaf « à l'identique » (copie Content Sync de Quran Foundation + polices du Complexe)
  registerMushafExact(
    app,
    opts.mushafExactDir === undefined
      ? (process.env.AWFORM_QF_MUSHAF_DIR ?? null)
      : opts.mushafExactDir,
    opts.qcfFontsDir === undefined ? (process.env.AWFORM_QCF_DIR ?? null) : opts.qcfFontsDir,
  );
  registerVerification(app, db, signer);
  registerRelais(
    app,
    db,
    opts.relaisCertsDir === undefined
      ? (process.env.AWFORM_RELAIS_CERTS ?? null)
      : opts.relaisCertsDir,
  );

  app.get('/api/v1/health', async () => {
    const dbOk = await ping(db).catch(() => false);
    const ed = dbOk ? await edition() : null;
    return {
      status: dbOk ? 'ok' : 'degrade',
      db: dbOk,
      edition: ed?.code ?? null,
      version: opts.version ?? '0.2.0',
    };
  });

  registerContent(app, db, edition, rights);
  // A12 : adhkār des livres (espace « Au quotidien »), public et sans donnée de l'utilisateur
  registerQuotidien(app, db, edition);
  registerProgress(app, db, edition);
  registerSignalements(app, db, edition);
  // lot F2 : école, personnel, responsables, niveaux par matière, parcours
  const cookieSecure = opts.cookieSecure ?? true;
  registerEcoleF2(app, db, edition, {
    secureFor: (req) => (cookieSecure === 'auto' ? req.protocol === 'https' : cookieSecure),
  });
  // A27 : parcours par niveau (espace, accueil, écriture, mots du Coran, positionnement, passage)
  registerParcoursA27(app, db, edition);
  return app;
}
