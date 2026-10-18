/**
 * Identités (18/10/2026) — réglages lus dans l'environnement, jamais de secret dans le dépôt. Trois façons d'entrer,
 * chacune derrière son interrupteur (toutes ÉTEINTES par défaut, sauf l'e-mail qui reste toujours possible) :
 *
 *  1. « Continuer avec Google » (OpenID Connect, flux « code » côté serveur, PKCE, state, nonce) :
 *     AWFORM_GOOGLE=on + AWFORM_GOOGLE_CLIENT_ID + AWFORM_GOOGLE_CLIENT_SECRET + adresse publique du site
 *     (AWFORM_PUBLIC_URL ou SITE) + clé du serveur (AWFORM_SECRET_KEY : cookies chiffrés de la connexion).
 *     URI de redirection à déclarer chez Google : <adresse publique>/api/v1/auth/google/callback.
 *     Essais seulement (jamais en production, NODE_ENV=production le refuse) : AWFORM_GOOGLE_ESSAI_URL = adresse d'un
 *     FAUX fournisseur local (apps/web/e2e/oidc-essai.mjs) qui remplace accounts.google.com.
 *
 *  2. « Avec mon numéro WhatsApp » : AWFORM_TELEPHONE=on + clé du serveur + AWFORM_WHATSAPP_NUMERO (numéro Awzid au
 *     format E.164, destinataire des messages pré-remplis) + réception des messages :
 *       - AWFORM_WHATSAPP=cloud : webhook de WhatsApp Cloud API (Meta) signé — AWFORM_WHATSAPP_APP_SECRET (signature
 *         X-Hub-Signature-256) et AWFORM_WHATSAPP_VERIFY_TOKEN (poignée de main du webhook) ;
 *       - AWFORM_WHATSAPP=simule : aucun appel à Meta ; un SIMULATEUR local remplace le webhook et les messages sortants
 *         sont écrits dans la boîte de démonstration (AWFORM_WHATSAPP_JOURNAL_DIR) — refusé en production
 *         (NODE_ENV=production sans AWFORM_DEMO=1).
 *       - AWFORM_TELEPHONE_MANUEL=on (bêta, gratuit, possible sans Meta) : l'administrateur voit les numéros en attente
 *         (numéro masqué sauf les 4 derniers chiffres, code attendu) et valide à la main après avoir lu le message reçu
 *         sur le WhatsApp Business d'Awzid ; chaque vérification vit alors 48 h.
 *     Secours PAYANT (éteint par défaut) : AWFORM_TELEPHONE_ENVOI=on — un code à 6 chiffres envoyé par un modèle
 *     WhatsApp (AWFORM_WHATSAPP_TOKEN, AWFORM_WHATSAPP_PHONE_ID, AWFORM_WHATSAPP_MODELE, AWFORM_WHATSAPP_MODELE_LANGUE),
 *     sous un plafond quotidien AWFORM_TELEPHONE_PLAFOND_JOUR (défaut 50) avec alerte au tableau de bord.
 *     Limites : AWFORM_TELEPHONE_PAR_HEURE (vérifications par heure, tous numéros : 200), AWFORM_TELEPHONE_PAR_IP (par heure et par adresse IP : 10) ; revérification du numéro
 *     après AWFORM_TELEPHONE_REVERIF_JOURS jours sans connexion (180 ; numéros recyclés).
 *
 *  3. « Avec mon adresse e-mail » : parcours existant (lot F3), toujours offert.
 */
import { E164 } from '@awform/school/telephone';

export interface ConfigTelephone {
  /** interrupteur général (et clé du serveur présente) */
  actif: boolean;
  /** numéro WhatsApp d'Awzid (E.164) : destinataire des messages pré-remplis */
  numeroAwzid: string | null;
  /** réception des messages : webhook signé de Meta, simulateur local, ou rien */
  mode: 'cloud' | 'simule' | null;
  appSecret: string | null;
  verifyToken: string | null;
  /**
   * VALIDATION MANUELLE (bêta, gratuite, sans Meta) : l'administrateur compare le code reçu sur le WhatsApp Business
   * d'Awzid et valide à la main (48 h) — AWFORM_TELEPHONE_MANUEL=on, possible sans webhook
   */
  manuel: boolean;
  /** durée d'une vérification « entrante » (10 min ; 48 h en validation manuelle) */
  dureeEntrantMs: number;
  /** secours payant : envoi d'un code par modèle WhatsApp (éteint par défaut) */
  envoi: boolean;
  cloud: { token: string; phoneId: string; modele: string; langue: string } | null;
  journalDir: string | null;
  plafondJour: number;
  parHeure: number;
  /** vérifications par heure et par adresse IP (défaut 10) */
  parIp: number;
  reverifJours: number;
}

export interface ConfigGoogle {
  actif: boolean;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authUrl: string;
  tokenUrl: string;
  jwksUrl: string;
  issuers: string[];
  /** faux fournisseur local (essais seulement) */
  essai: boolean;
}

const entier = (s: string | undefined, def: number, min = 1, max = 1_000_000) => {
  const n = Number(s);
  return Number.isInteger(n) && n >= min && n <= max ? n : def;
};
const txt = (s: string | undefined) => (s ?? '').trim() || null;

/** Production réelle (image Docker) : NODE_ENV=production sans démonstration. */
export const enProduction = (env: NodeJS.ProcessEnv) =>
  env.NODE_ENV === 'production' && env.AWFORM_DEMO !== '1';

export function telephoneFromEnv(
  env: NodeJS.ProcessEnv,
  secretKey: Buffer | null,
  warn: (m: string) => void = () => {},
): ConfigTelephone {
  let mode: ConfigTelephone['mode'] =
    env.AWFORM_WHATSAPP === 'cloud' ? 'cloud' : env.AWFORM_WHATSAPP === 'simule' ? 'simule' : null;
  if (mode === 'simule' && enProduction(env)) {
    warn('AWFORM_WHATSAPP=simule refusé en production : vérification par numéro inactive');
    mode = null;
  }
  const numero = txt(env.AWFORM_WHATSAPP_NUMERO);
  const numeroAwzid = numero && E164.test(numero) ? numero : null;
  const appSecret = txt(env.AWFORM_WHATSAPP_APP_SECRET);
  const manuel = env.AWFORM_TELEPHONE_MANUEL === 'on';
  const reception = mode === 'simule' || (mode === 'cloud' && !!appSecret) || manuel;
  const voulu = env.AWFORM_TELEPHONE === 'on';
  const actif = voulu && !!secretKey && !!numeroAwzid && reception;
  if (voulu && !actif)
    warn(
      'AWFORM_TELEPHONE=on mais clé du serveur, AWFORM_WHATSAPP_NUMERO ou réception (AWFORM_WHATSAPP, AWFORM_TELEPHONE_MANUEL) manquants : inactif',
    );
  const token = txt(env.AWFORM_WHATSAPP_TOKEN);
  const phoneId = txt(env.AWFORM_WHATSAPP_PHONE_ID);
  const modele = txt(env.AWFORM_WHATSAPP_MODELE);
  return {
    actif,
    numeroAwzid,
    mode,
    appSecret,
    verifyToken: txt(env.AWFORM_WHATSAPP_VERIFY_TOKEN),
    manuel: actif && manuel,
    dureeEntrantMs: actif && manuel ? 48 * 3600_000 : 10 * 60_000,
    envoi:
      actif &&
      env.AWFORM_TELEPHONE_ENVOI === 'on' &&
      (mode === 'simule' || (!!token && !!phoneId && !!modele)),
    cloud:
      token && phoneId && modele
        ? { token, phoneId, modele, langue: txt(env.AWFORM_WHATSAPP_MODELE_LANGUE) ?? 'fr' }
        : null,
    journalDir: txt(env.AWFORM_WHATSAPP_JOURNAL_DIR),
    plafondJour: entier(env.AWFORM_TELEPHONE_PLAFOND_JOUR, 50, 0),
    parHeure: entier(env.AWFORM_TELEPHONE_PAR_HEURE, 200),
    parIp: entier(env.AWFORM_TELEPHONE_PAR_IP, 10),
    reverifJours: entier(env.AWFORM_TELEPHONE_REVERIF_JOURS, 180),
  };
}

export const GOOGLE = {
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
  issuers: ['https://accounts.google.com', 'accounts.google.com'],
};

export function googleFromEnv(
  env: NodeJS.ProcessEnv,
  publicUrl: string | null,
  secretKey: Buffer | null,
  warn: (m: string) => void = () => {},
): ConfigGoogle {
  const clientId = txt(env.AWFORM_GOOGLE_CLIENT_ID) ?? '';
  const clientSecret = txt(env.AWFORM_GOOGLE_CLIENT_SECRET) ?? '';
  const voulu = env.AWFORM_GOOGLE === 'on';
  let essaiUrl = txt(env.AWFORM_GOOGLE_ESSAI_URL);
  if (essaiUrl && enProduction(env)) {
    warn('AWFORM_GOOGLE_ESSAI_URL ignorée en production');
    essaiUrl = null;
  }
  const base = essaiUrl?.replace(/\/+$/, '') ?? null;
  const actif = voulu && !!clientId && !!clientSecret && !!publicUrl && !!secretKey;
  if (voulu && !actif)
    warn(
      'AWFORM_GOOGLE=on mais identifiants, adresse publique ou clé du serveur manquants : inactif',
    );
  return {
    actif,
    clientId,
    clientSecret,
    redirectUri: `${publicUrl ?? ''}/api/v1/auth/google/callback`,
    authUrl: base ? `${base}/auth` : GOOGLE.authUrl,
    tokenUrl: base ? `${base}/token` : GOOGLE.tokenUrl,
    jwksUrl: base ? `${base}/certs` : GOOGLE.jwksUrl,
    issuers: base ? [base] : GOOGLE.issuers,
    essai: !!base,
  };
}
