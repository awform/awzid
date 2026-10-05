/**
 * Constantes et outils partagés par les routes des comptes (QUA-3, découpé de auth/routes.ts sans changement
 * de comportement).
 */
import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '@awform/db';

export const err = (reply: FastifyReply, status: number, code: string, extra: object = {}) =>
  reply.code(status).send({ error: { code, ...extra } });

export const EMAIL = '^[^\\s@]{1,64}@[^\\s@]{1,190}\\.[^\\s@]{2,24}$';
export const COUNTRY = '^[A-Z]{2}$';
export const YEAR = { type: 'integer', minimum: 1900, maximum: 2100 } as const;
/** empreinte de l'adresse e-mail pour les clés de verrou (audit MIN-7) */
export const emailKey = (email: string) =>
  createHash('sha256').update(email).digest('hex').slice(0, 32);
/** consentements facultatifs (retirables) ; « partage_enseignant » : suivi du hifẓ par l'enseignant d'une classe */
export const OPTIONAL_CONSENTS: ReadonlySet<string> = new Set([
  'rappels',
  'partage_enseignant',
  // audit MIN-4 : l'accord au tuteur IA se retire aussi depuis « mes accords »
  'tuteur_ia',
  // lot 16 : envoi d'une récitation à l'enseignant de la classe (choix de la famille)
  'envoi_recitation',
]);
/** inscriptions par heure et par adresse IP (réglable pour les tests de bout en bout) */
export const SIGNUPS_PER_HOUR = Number(process.env.AWFORM_SIGNUP_PER_HOUR ?? 20) || 20;
export const AVATARS = ['etoile', 'lune', 'soleil', 'feuille', 'goutte', 'livre'];

/** Gardes et aides créées par registerAuth, passées aux modules de routes (profils, droits RGPD). */
export interface AuthKit {
  db: Db;
  needAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  needParent: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  passwordOk: (
    reply: FastifyReply,
    a: { id: string; passwordHash: string | null },
    given: string,
  ) => Promise<boolean>;
  insertConsents: (
    accountId: string,
    types: string[],
    country: string,
    profileId?: string | null,
    evidence?: unknown,
  ) => Promise<void>;
  secureFor: (req: FastifyRequest) => boolean;
  /** compte et profils de la session (réponse de /auth/me) */
  me: (
    accountId: string,
    mfaVerified: boolean,
    tablet?: { classId: string } | null,
  ) => Promise<{ profiles: Array<{ id: string }> } | null>;
  /** session de création d'un compte (connexion après l'inscription, reprise d'un profil) */
  setSession: (reply: FastifyReply, accountId: string, kind: string, mfa: boolean) => Promise<void>;
}
