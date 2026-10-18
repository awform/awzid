/**
 * Numéro WhatsApp (18/10/2026) — routes :
 *  - PUBLIC : `POST /api/v1/tel/defis` (anti-robots AVANT tout, limites par adresse IP, par numéro, par heure ;
 *    canal « entrant » gratuit, « sortant » payant éteint par défaut), `POST /api/v1/tel/defis/etat` (la page attend),
 *    `POST /api/v1/tel/defis/code` (canal sortant), webhook signé de WhatsApp Cloud API (`GET|POST /api/v1/tel/webhook`,
 *    NON branché sans AWFORM_WHATSAPP=cloud et son secret), SIMULATEUR (`POST /api/v1/tel/simulateur`, mode « simule »
 *    seulement, jamais en production) ;
 *  - NOUVEAU MOT DE PASSE : par une vérification du numéro (`/auth/password-reset/telephone`) ou par un CODE DE
 *    RÉCUPÉRATION (`/auth/password-reset/secours`, sans aucun envoi) ;
 *  - COMPTE : numéro (ajout ou changement vérifié, retrait si une adresse reste), codes de récupération (régénérés) ;
 *  - ADMINISTRATEUR (second facteur) : numéros en attente de VALIDATION MANUELLE (bêta), valider ou refuser.
 * Jamais de numéro en clair dans les réponses publiques ni dans les journaux ; journal d'audit sans numéro.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { readAcces, schema as t, type Db } from '@awform/db';
import {
  masquerTelephone,
  normaliserTelephone,
  ressembleTelephone,
} from '@awform/school/telephone';
import { verifierJeton } from '../antibot.js';
import { hashSecret } from '../auth/crypto.js';
import { checkPassword, estPersonnel, MAX_LENGTH } from '../auth/passwords.js';
import {
  audit,
  clearFailures,
  hasRole,
  lockedUntil,
  recordFailure,
  reserveAttempt,
  revokeAll,
} from '../auth/service.js';
import { emailKey, err, type AuthKit } from '../auth/common.js';
import { dechiffrer, phoneHashOf } from './cles.js';
import {
  consommerDefi,
  creerDefi,
  deciderManuellement,
  enAttenteManuelle,
  etatDefi,
  OBJETS_DEFI,
  recevoirMessage,
  verifierCode,
  type CtxTel,
  type ObjetDefi,
} from './defis.js';
import { codesSecoursRestants, genererCodesSecours, utiliserCodeSecours } from './secours.js';

const DEFI = {
  type: 'object',
  required: ['id', 'jeton'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', maxLength: 40 },
    jeton: { type: 'string', maxLength: 100 },
  },
} as const;
export const DEFI_SCHEMA = DEFI;
const MDP = { type: 'string', maxLength: MAX_LENGTH * 4 } as const;
const MDP_SEUL = {
  type: 'object',
  required: ['password'],
  additionalProperties: false,
  properties: { password: { type: 'string', maxLength: 512 } },
} as const;

/** Compte famille (non supprimé) par son numéro. */
export async function compteParNumero(db: Db, key: Buffer, e164: string) {
  const [a] = await db
    .select()
    .from(t.account)
    .where(and(eq(t.account.phoneHash, phoneHashOf(key, e164)), isNull(t.account.deletedAt)));
  return a ?? null;
}

/** Signature X-Hub-Signature-256 de Meta (HMAC-SHA-256 du corps BRUT avec le secret de l'application). */
export function signatureMetaValide(secret: string, corps: string, entete: unknown): boolean {
  if (typeof entete !== 'string' || !entete.startsWith('sha256=')) return false;
  const attendu = Buffer.from(
    `sha256=${createHmac('sha256', secret).update(corps, 'utf8').digest('hex')}`,
  );
  const recu = Buffer.from(entete);
  return attendu.length === recu.length && timingSafeEqual(attendu, recu);
}

/** Messages texte d'un envoi du webhook de WhatsApp Cloud API : [{ de, texte }]. */
export function messagesDuWebhook(corps: unknown): Array<{ de: string; texte: string }> {
  const out: Array<{ de: string; texte: string }> = [];
  const entries = (corps as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return out;
  for (const e of entries.slice(0, 20))
    for (const ch of ((e as { changes?: unknown[] }).changes ?? []).slice(0, 20)) {
      const msgs = (ch as { value?: { messages?: unknown[] } }).value?.messages ?? [];
      for (const m of msgs.slice(0, 50)) {
        const mm = m as { from?: unknown; type?: unknown; text?: { body?: unknown } };
        if (typeof mm.from === 'string' && mm.type === 'text' && typeof mm.text?.body === 'string')
          out.push({ de: mm.from, texte: mm.text.body.slice(0, 1000) });
      }
    }
  return out;
}

export function registerTelephone(
  app: FastifyInstance,
  kit: AuthKit,
  ctx: CtxTel | null,
  opts: { key: Buffer | null; notifierMdp?: (to: string, locale: string) => void },
): void {
  const { db, needAuth, passwordOk } = kit;
  const actif = () => !!ctx && ctx.cfg.actif;
  const needAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return err(reply, 401, 'non_connecte');
    if (!hasRole(req.auth, 'admin')) return err(reply, 403, 'reserve_admin');
    if (!req.auth.mfaVerified)
      return err(reply, 403, req.auth.totpEnabled ? 'totp_requis' : 'mfa_a_configurer');
  };

  // ---------------------------------------------------------------- vérification d'un numéro
  app.post<{
    Body: {
      numero: string;
      pays?: string;
      objet: ObjetDefi;
      canal?: 'entrant' | 'sortant';
      locale?: string;
      jeton?: string;
      site_web?: string;
    };
  }>(
    '/api/v1/tel/defis',
    {
      schema: {
        body: {
          type: 'object',
          required: ['numero', 'objet'],
          additionalProperties: false,
          properties: {
            numero: { type: 'string', maxLength: 32 },
            pays: { type: 'string', pattern: '^[A-Z]{2}$' },
            objet: { enum: [...OBJETS_DEFI] },
            canal: { enum: ['entrant', 'sortant'] },
            locale: { type: 'string', maxLength: 10 },
            jeton: { type: 'string', maxLength: 100 },
            site_web: { type: 'string', maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      if (!actif()) return err(reply, 404, 'telephone_inactif');
      const b = req.body;
      const canal = b.canal ?? 'entrant';
      // anti-robots AVANT tout : champ piège, jeton signé (exigé pour un ENVOI payant même si le réglage est éteint)
      const acces = await readAcces(db);
      if (acces.antibot === 'on' || canal === 'sortant') {
        const verdict = b.site_web ? 'piege' : verifierJeton(opts.key, b.jeton);
        if (verdict !== 'ok') return err(reply, 400, 'antibot_echec', { raison: verdict });
      }
      const ipKey = `tel-ip:${req.ip}`;
      if (await lockedUntil(db, ipKey)) return err(reply, 429, 'trop_de_demandes');
      await recordFailure(db, ipKey, ctx!.cfg.parIp); // vérifications par heure et par adresse IP (défaut 10)
      const n = normaliserTelephone(b.numero, b.pays ?? null);
      if (!n.ok) return err(reply, 400, `numero_${n.raison}`);
      let accountId: string | null = null;
      if (b.objet === 'ajout_numero') {
        if (!req.auth || req.auth.tablet) return err(reply, 401, 'non_connecte');
        if (req.auth.kind !== 'parent' && req.auth.kind !== 'adulte')
          return err(reply, 403, 'reserve_aux_familles');
        accountId = req.auth.accountId;
      }
      const r = await creerDefi(ctx!, {
        objet: b.objet,
        e164: n.e164,
        canal,
        accountId,
        locale: b.locale,
      });
      if (!r.ok) {
        const status = r.code === 'envoi_echec' ? 502 : r.code === 'envoi_indisponible' ? 404 : 429;
        return err(reply, status, r.code, 'secondes' in r ? { secondes: r.secondes } : {});
      }
      return reply.code(201).send({
        ...r.defi,
        numeroAwzid: ctx!.cfg.numeroAwzid,
        manuel: ctx!.cfg.manuel,
      });
    },
  );

  app.post<{ Body: { id: string; jeton: string } }>(
    '/api/v1/tel/defis/etat',
    { schema: { body: DEFI } },
    async (req, reply) => {
      if (!actif()) return err(reply, 404, 'telephone_inactif');
      // la page attend en interrogeant (jeton de 256 bits : rien à deviner) ; fenêtre d'une heure par adresse IP
      const heure = Math.floor(Date.now() / 3_600_000);
      if (!(await reserveAttempt(db, `tel-etat:${req.ip}:${heure}`, 2000)))
        return err(reply, 429, 'trop_de_demandes');
      const e = await etatDefi(ctx!, req.body.id, req.body.jeton);
      if (!e) return err(reply, 404, 'introuvable');
      return { etat: e };
    },
  );

  app.post<{ Body: { id: string; jeton: string; code: string } }>(
    '/api/v1/tel/defis/code',
    {
      schema: {
        body: {
          type: 'object',
          required: ['id', 'jeton', 'code'],
          additionalProperties: false,
          properties: { ...DEFI.properties, code: { type: 'string', maxLength: 10 } },
        },
      },
    },
    async (req, reply) => {
      if (!actif()) return err(reply, 404, 'telephone_inactif');
      const r = await verifierCode(ctx!, req.body.id, req.body.jeton, req.body.code.trim());
      if (!r.ok)
        return err(reply, 400, r.code, r.restants !== undefined ? { restants: r.restants } : {});
      return { etat: 'validee' };
    },
  );

  // ---------------------------------------------------------------- réception des messages (Meta, simulateur)
  // poignée de main du webhook (Meta envoie hub.verify_token, on renvoie hub.challenge)
  app.get<{ Querystring: Record<string, string> }>('/api/v1/tel/webhook', async (req, reply) => {
    const c = ctx?.cfg;
    if (!c || c.mode !== 'cloud' || !c.verifyToken) return err(reply, 404, 'introuvable');
    const q = req.query;
    if (q['hub.mode'] !== 'subscribe' || q['hub.verify_token'] !== c.verifyToken)
      return err(reply, 403, 'interdit');
    return reply.type('text/plain').send(String(q['hub.challenge'] ?? '').slice(0, 200));
  });
  app.register(async (w) => {
    w.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) =>
      done(null, body),
    );
    w.post('/api/v1/tel/webhook', async (req, reply) => {
      const c = ctx?.cfg;
      if (!ctx || !c || c.mode !== 'cloud' || !c.appSecret) return err(reply, 404, 'introuvable');
      const corps = String(req.body ?? '');
      if (!signatureMetaValide(c.appSecret, corps, req.headers['x-hub-signature-256']))
        return err(reply, 401, 'signature_invalide');
      let json: unknown;
      try {
        json = JSON.parse(corps);
      } catch {
        return err(reply, 400, 'format');
      }
      for (const m of messagesDuWebhook(json)) {
        const k = `wa-in:${phoneHashOf(ctx.key, `+${m.de.replace(/\D/g, '')}`)}`;
        if (await lockedUntil(db, k)) continue;
        await recordFailure(db, k, 30); // au plus 30 messages traités par heure et par expéditeur
        await recevoirMessage(ctx, m.de, m.texte);
      }
      return { ok: true };
    });
  });
  if (ctx?.cfg.mode === 'simule')
    app.post<{ Body: { de: string; texte: string } }>(
      '/api/v1/tel/simulateur',
      {
        schema: {
          body: {
            type: 'object',
            required: ['de', 'texte'],
            additionalProperties: false,
            properties: {
              de: { type: 'string', maxLength: 20 },
              texte: { type: 'string', maxLength: 1000 },
            },
          },
        },
      },
      async (req) => ({ resultat: await recevoirMessage(ctx, req.body.de, req.body.texte) }),
    );

  // ---------------------------------------------------------------- validation manuelle (bêta)
  app.get('/api/v1/admin/telephone/attente', { preHandler: needAdmin }, async () => {
    if (!actif() || !ctx!.cfg.manuel) return { manuel: false, numeros: [] };
    return { manuel: true, numeros: await enAttenteManuelle(ctx!) };
  });
  for (const decision of ['valider', 'refuser'] as const)
    app.post<{ Params: { id: string } }>(
      `/api/v1/admin/telephone/attente/:id/${decision}`,
      { preHandler: needAdmin },
      async (req, reply) => {
        if (!actif() || !ctx!.cfg.manuel) return err(reply, 404, 'introuvable');
        if (!(await deciderManuellement(ctx!, req.params.id, decision, req.auth!.accountId)))
          return err(reply, 404, 'introuvable');
        await audit(
          db,
          req.auth!.accountId,
          decision === 'valider' ? 'telephone.validation_manuelle' : 'telephone.refus_manuel',
          req.params.id,
        );
        return { ok: true };
      },
    );

  // ---------------------------------------------------------------- nouveau mot de passe
  const nouveauMotDePasse = async (
    reply: FastifyReply,
    a: typeof t.account.$inferSelect,
    password: string,
    action: string,
  ) => {
    const pb = checkPassword(password, a.email ?? '', { personnel: await estPersonnel(db, a.id) });
    if (pb) return err(reply, 400, `mot_de_passe_${pb}`);
    await db
      .update(t.account)
      .set({ passwordHash: await hashSecret(password), passwordChangedAt: new Date() })
      .where(eq(t.account.id, a.id));
    await revokeAll(db, a.id);
    await clearFailures(db, `mdp:${a.id}`);
    await audit(db, a.id, action, a.id);
    if (a.email) opts.notifierMdp?.(a.email, a.locale);
    return reply.send({ ok: true });
  };

  app.post<{ Body: { defi: { id: string; jeton: string }; password: string } }>(
    '/api/v1/auth/password-reset/telephone',
    {
      schema: {
        body: {
          type: 'object',
          required: ['defi', 'password'],
          additionalProperties: false,
          properties: { defi: DEFI, password: MDP },
        },
      },
    },
    async (req, reply) => {
      if (!actif()) return err(reply, 404, 'telephone_inactif');
      if (!(await reserveAttempt(db, `reset-tel:${req.ip}`, 20)))
        return err(reply, 429, 'trop_de_demandes');
      // règle du mot de passe contrôlée AVANT de consommer la vérification (une faute de saisie ne la brûle pas)
      const pb = checkPassword(req.body.password, '');
      if (pb) return err(reply, 400, `mot_de_passe_${pb}`);
      const v = await consommerDefi(ctx!, req.body.defi, 'reinitialisation');
      if (!v) return err(reply, 400, 'verification_invalide');
      const a = await compteParNumero(db, ctx!.key, v.e164);
      // le numéro vient d'être prouvé : dire qu'aucun compte ne l'utilise n'apprend rien à un tiers
      if (!a || a.kind === 'ecole') return err(reply, 404, 'aucun_compte_numero');
      return nouveauMotDePasse(
        reply,
        a,
        req.body.password,
        'mot_de_passe.reinitialisation_telephone',
      );
    },
  );

  app.post<{ Body: { identifiant: string; pays?: string; code: string; password: string } }>(
    '/api/v1/auth/password-reset/secours',
    {
      schema: {
        body: {
          type: 'object',
          required: ['identifiant', 'code', 'password'],
          additionalProperties: false,
          properties: {
            identifiant: { type: 'string', maxLength: 254 },
            pays: { type: 'string', pattern: '^[A-Z]{2}$' },
            code: { type: 'string', maxLength: 20 },
            password: MDP,
          },
        },
      },
    },
    async (req, reply) => {
      if (!opts.key) return err(reply, 404, 'indisponible');
      if (!(await reserveAttempt(db, `secours-ip:${req.ip}`, 10)))
        return err(reply, 429, 'trop_de_demandes');
      const id = req.body.identifiant.trim().toLowerCase();
      const n = ressembleTelephone(id) ? normaliserTelephone(id, req.body.pays ?? 'SN') : null;
      const cle = `secours:${emailKey(n?.ok ? n.e164 : id)}`;
      if (!(await reserveAttempt(db, cle, 5))) return err(reply, 429, 'trop_de_demandes');
      const pb = checkPassword(req.body.password, id.includes('@') ? id : '');
      if (pb) return err(reply, 400, `mot_de_passe_${pb}`);
      const [a] = n?.ok
        ? [await compteParNumero(db, opts.key, n.e164)]
        : await db
            .select()
            .from(t.account)
            .where(and(eq(t.account.email, id), isNull(t.account.deletedAt)));
      // même réponse que le compte existe ou non, ou que le code soit faux
      if (
        !a ||
        a.kind === 'ecole' ||
        !(await utiliserCodeSecours(db, opts.key, a.id, req.body.code))
      )
        return err(reply, 400, 'code_secours_invalide');
      await clearFailures(db, cle);
      return nouveauMotDePasse(
        reply,
        a,
        req.body.password,
        'mot_de_passe.reinitialisation_secours',
      );
    },
  );

  // ---------------------------------------------------------------- compte : numéro et codes de récupération
  app.get('/api/v1/account/telephone', { preHandler: needAuth }, async (req) => {
    const [a] = await db.select().from(t.account).where(eq(t.account.id, req.auth!.accountId));
    return {
      numero: masquerTelephone(dechiffrer(opts.key, a?.phoneEnc)),
      verifieLe: a?.phoneVerifiedAt ?? null,
      codesRestants: await codesSecoursRestants(db, req.auth!.accountId),
      disponible: actif(),
    };
  });

  app.post<{ Body: { password: string; defi: { id: string; jeton: string } } }>(
    '/api/v1/account/telephone',
    {
      preHandler: needAuth,
      schema: {
        body: {
          type: 'object',
          required: ['password', 'defi'],
          additionalProperties: false,
          properties: { password: { type: 'string', maxLength: 512 }, defi: DEFI },
        },
      },
    },
    async (req, reply) => {
      if (!actif()) return err(reply, 404, 'telephone_inactif');
      const au = req.auth!;
      if (au.tablet || (au.kind !== 'parent' && au.kind !== 'adulte'))
        return err(reply, 403, 'reserve_aux_familles');
      const [a] = await db.select().from(t.account).where(eq(t.account.id, au.accountId));
      if (!a) return err(reply, 401, 'non_connecte');
      if (!(await passwordOk(reply, a, req.body.password))) return reply;
      const v = await consommerDefi(ctx!, req.body.defi, 'ajout_numero', a.id);
      if (!v) return err(reply, 400, 'verification_invalide');
      const [pris] = await db
        .select({ id: t.account.id })
        .from(t.account)
        .where(and(eq(t.account.phoneHash, v.phoneHash), ne(t.account.id, a.id)));
      if (pris) return err(reply, 409, 'telephone_indisponible');
      await db
        .update(t.account)
        .set({ phoneEnc: v.phoneEnc, phoneHash: v.phoneHash, phoneVerifiedAt: new Date() })
        .where(eq(t.account.id, a.id));
      await audit(db, a.id, a.phoneHash ? 'telephone.changement' : 'telephone.ajout', a.id);
      return { ok: true, numero: masquerTelephone(v.e164) };
    },
  );

  app.post<{ Body: { password: string } }>(
    '/api/v1/account/telephone/retirer',
    { preHandler: needAuth, schema: { body: MDP_SEUL } },
    async (req, reply) => {
      const [a] = await db.select().from(t.account).where(eq(t.account.id, req.auth!.accountId));
      if (!a?.phoneHash) return err(reply, 404, 'introuvable');
      // le numéro est le seul identifiant : il reste (sinon le compte deviendrait inaccessible)
      if (!a.email) return err(reply, 409, 'identifiant_unique');
      if (!(await passwordOk(reply, a, req.body.password))) return reply;
      await db
        .update(t.account)
        .set({ phoneEnc: null, phoneHash: null, phoneVerifiedAt: null })
        .where(eq(t.account.id, a.id));
      await audit(db, a.id, 'telephone.retrait', a.id);
      return { ok: true };
    },
  );

  app.post<{ Body: { password: string } }>(
    '/api/v1/account/codes-secours',
    { preHandler: needAuth, schema: { body: MDP_SEUL } },
    async (req, reply) => {
      if (!opts.key) return err(reply, 404, 'indisponible');
      const au = req.auth!;
      if (au.tablet || (au.kind !== 'parent' && au.kind !== 'adulte'))
        return err(reply, 403, 'reserve_aux_familles');
      const [a] = await db.select().from(t.account).where(eq(t.account.id, au.accountId));
      if (!a) return err(reply, 401, 'non_connecte');
      if (!(await passwordOk(reply, a, req.body.password))) return reply;
      const codes = await genererCodesSecours(db, opts.key, a.id);
      await audit(db, a.id, 'codes_secours.generation', a.id);
      return { codes };
    },
  );
}
