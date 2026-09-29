/**
 * Vérification PUBLIQUE des certificats (lot 20, V1-e ; CDC §2.13 « vérifiables par QR ») :
 *  - GET /api/v1/public/certificats/:numero?c=<code> : le QR imprimé sur le certificat porte le numéro ET un
 *    code aléatoire ; sans le bon code, la réponse est la même que pour un numéro inconnu (aucune énumération
 *    du registre) ; les essais faux sont limités par adresse ;
 *  - ne montre que le REGISTRE (numéro, type, niveau ou passage, nom affiché, mention, date), l'état (valide ou
 *    annulé, avec le motif) et le contrôle de la signature Ed25519 ;
 *  - GET /api/v1/public/certificats/cle : clé publique (vérification hors ligne).
 */
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { certificateByNumberAndCode, schema as t, type Db } from '@awform/db';
import { lockedUntil, recordFailure } from './auth/service.js';
import { VERIF_CODE, verifyCert, type CertSigner } from './certsign.js';
import { err } from './guards.js';

const NUMBER = /^AWF-[A-Z0-9]{2,4}-\d{4}-\d{4,6}$/;

export function registerVerification(
  app: FastifyInstance,
  db: Db,
  signer: CertSigner | null,
): void {
  app.get('/api/v1/public/certificats/cle', async (_req, reply) => {
    if (!signer) return err(reply, 404, 'signature_indisponible');
    reply.header('Cache-Control', 'public, max-age=86400');
    return { algorithme: 'Ed25519', keyId: signer.keyId, publicKeyPem: signer.publicPem };
  });

  app.get<{ Params: { numero: string }; Querystring: { c?: string } }>(
    '/api/v1/public/certificats/:numero',
    async (req, reply) => {
      reply.header('Cache-Control', 'no-store');
      const key = `verif:${req.ip}`;
      if (await lockedUntil(db, key)) return err(reply, 429, 'trop_de_demandes');
      const code = String(req.query.c ?? '').toUpperCase();
      const c =
        NUMBER.test(req.params.numero) && VERIF_CODE.test(code)
          ? await certificateByNumberAndCode(db, req.params.numero, code)
          : null;
      if (!c) {
        // 20 essais faux par heure et par adresse, puis pause
        await recordFailure(db, key, 20);
        return err(reply, 404, 'certificat_introuvable');
      }
      let sujetTitre: string | null = null;
      if (c.kind === 'niveau') {
        const [l] = await db
          .select({ titleFr: t.level.titleFr })
          .from(t.level)
          .where(eq(t.level.code, c.subject));
        sujetTitre = l?.titleFr ?? null;
      }
      const signature = !c.signature
        ? 'absente'
        : signer && c.keyId === signer.keyId && verifyCert(signer.publicKey, c, c.signature)
          ? 'valide'
          : 'invalide';
      return {
        numero: c.number,
        type: c.kind,
        sujet: c.subject,
        sujetTitre,
        titulaire: c.holderName,
        mention: c.mention,
        delivreLe: c.issuedAt,
        statut: c.revokedAt ? 'annule' : 'valide',
        annulation: c.revokedAt ? { le: c.revokedAt, motif: c.revokeReason } : null,
        signature,
        keyId: c.keyId,
      };
    },
  );
}
