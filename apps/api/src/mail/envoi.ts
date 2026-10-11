/**
 * Envoi des e-mails (lot F3, revue M7) — prestataire SMTP CONFIGURABLE par variables d'environnement, jamais
 * de secret dans le dépôt :
 *  - AWFORM_MAIL=smtp : AWFORM_SMTP_HOST, AWFORM_SMTP_PORT (587), AWFORM_SMTP_TLS (« starttls » par défaut, ou
 *    « implicite » pour le port 465), AWFORM_SMTP_USER, AWFORM_SMTP_PASSWORD ; expéditeur AWFORM_MAIL_FROM
 *    (défaut « Awzid <no-reply@awzid.com> ») ;
 *  - AWFORM_MAIL=journal : AUCUN envoi — chaque message est écrit dans un fichier JSON (droits 600) du dossier
 *    AWFORM_MAIL_JOURNAL_DIR : c'est la « boîte de démonstration » (démo, tests de bout en bout) ;
 *  - absent : e-mails désactivés (les demandes répondent pareil, rien n'est envoyé ; signalé au démarrage).
 * Garde-fou : en DÉMONSTRATION (AWFORM_DEMO=1), un serveur SMTP qui n'est pas local (maildev, réseau privé) est
 * REFUSÉ et remplacé par le journal — la démonstration n'envoie jamais de vrai e-mail.
 * Les journaux de l'API ne contiennent jamais ni l'adresse ni le lien (seulement le type de message).
 */
import { randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PRIVATE_HOST } from '../demo-mode.js';

export const DEFAULT_FROM = 'Awzid <no-reply@awzid.com>';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** type du message (journal, tests) : verification, reinitialisation… */
  kind: string;
}

export interface Mailer {
  mode: 'smtp' | 'journal' | 'memoire' | 'inactif';
  /** dossier de la boîte de démonstration (mode journal) */
  dir?: string;
  send(m: MailMessage): Promise<void>;
}

/** Boîte de démonstration : un fichier JSON par message, lisible par l'équipe (et les tests de bout en bout). */
export function journalMailer(dir: string, from = DEFAULT_FROM): Mailer {
  return {
    mode: 'journal',
    dir,
    async send(m) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const date = new Date().toISOString();
      const file = join(dir, `${date.replace(/[:.]/g, '-')}-${randomUUID()}.json`);
      writeFileSync(file, JSON.stringify({ date, from, ...m }, null, 2), { mode: 0o600 });
      chmodSync(file, 0o600);
    },
  };
}

/** Tests : messages gardés en mémoire. */
export function memoryMailer(): Mailer & { sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return {
    mode: 'memoire',
    sent,
    async send(m) {
      sent.push(m);
    },
  };
}

export const inactiveMailer: Mailer = { mode: 'inactif', send: async () => {} };

export interface SmtpConfig {
  host: string;
  port: number;
  tls: 'starttls' | 'implicite';
  user?: string;
  password?: string;
  from: string;
}

/** Prestataire SMTP (nodemailer chargé au premier envoi ; TLS exigé hors serveur local). */
export function smtpMailer(cfg: SmtpConfig): Mailer {
  let transport: { sendMail: (o: object) => Promise<unknown> } | null = null;
  return {
    mode: 'smtp',
    async send(m) {
      if (!transport) {
        const nodemailer = (await import('nodemailer')).default;
        const local = PRIVATE_HOST.test(cfg.host);
        transport = nodemailer.createTransport({
          host: cfg.host,
          port: cfg.port,
          secure: cfg.tls === 'implicite',
          // STARTTLS obligatoire vers un prestataire (jamais d'identifiants en clair) ; maildev local : libre
          requireTLS: cfg.tls === 'starttls' && !local,
          ...(cfg.user ? { auth: { user: cfg.user, pass: cfg.password ?? '' } } : {}),
        });
      }
      await transport.sendMail({
        from: cfg.from,
        to: m.to,
        subject: m.subject,
        text: m.text,
        html: m.html,
        headers: { 'Auto-Submitted': 'auto-generated' },
      });
    },
  };
}

export interface MailEnv {
  AWFORM_MAIL?: string;
  AWFORM_MAIL_FROM?: string;
  AWFORM_MAIL_JOURNAL_DIR?: string;
  AWFORM_SMTP_HOST?: string;
  AWFORM_SMTP_PORT?: string;
  AWFORM_SMTP_TLS?: string;
  AWFORM_SMTP_USER?: string;
  AWFORM_SMTP_PASSWORD?: string;
  AWFORM_DEMO?: string;
}

/** Choix du mode d'envoi depuis l'environnement ; `warn` reçoit les avertissements de démarrage. */
export function mailerFromEnv(env: MailEnv, warn: (msg: string) => void = () => {}): Mailer {
  const from = env.AWFORM_MAIL_FROM?.trim() || DEFAULT_FROM;
  const journalDir = env.AWFORM_MAIL_JOURNAL_DIR?.trim() || join(tmpdir(), 'awzid-boite-demo');
  const mode = (env.AWFORM_MAIL ?? '').trim();
  if (mode === 'journal') return journalMailer(journalDir, from);
  if (mode === 'smtp') {
    const host = (env.AWFORM_SMTP_HOST ?? '').trim().toLowerCase();
    if (!host) {
      warn('AWFORM_MAIL=smtp sans AWFORM_SMTP_HOST : e-mails désactivés');
      return inactiveMailer;
    }
    if (env.AWFORM_DEMO === '1' && !PRIVATE_HOST.test(host)) {
      warn(
        'démonstration : serveur SMTP public refusé, e-mails écrits dans la boîte de démonstration',
      );
      return journalMailer(journalDir, from);
    }
    const tls = env.AWFORM_SMTP_TLS === 'implicite' ? 'implicite' : 'starttls';
    const port = Number(env.AWFORM_SMTP_PORT) || (tls === 'implicite' ? 465 : 587);
    return smtpMailer({
      host,
      port,
      tls,
      user: env.AWFORM_SMTP_USER?.trim() || undefined,
      password: env.AWFORM_SMTP_PASSWORD,
      from,
    });
  }
  if (mode) warn(`AWFORM_MAIL=${mode} inconnu : e-mails désactivés`);
  else warn('AWFORM_MAIL absent : e-mails désactivés (vérification, mot de passe oublié)');
  return inactiveMailer;
}

/**
 * Adresse PUBLIQUE du site pour les liens des e-mails : AWFORM_PUBLIC_URL, sinon https://SITE. Jamais l'en-tête
 * Host de la requête (un lien de réinitialisation forgé vers un autre site serait un piège).
 */
export function publicUrlFromEnv(env: {
  AWFORM_PUBLIC_URL?: string;
  SITE?: string;
}): string | null {
  const u = (env.AWFORM_PUBLIC_URL ?? '').trim().replace(/\/+$/, '');
  if (/^https?:\/\/[^\s/]+$/.test(u)) return u;
  const site = (env.SITE ?? '').trim().toLowerCase();
  return /^[a-z0-9.-]+(:\d+)?$/.test(site) ? `https://${site}` : null;
}
