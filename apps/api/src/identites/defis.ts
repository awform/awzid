/**
 * Vérification d'un NUMÉRO (18/10/2026) — service (sans routes), testé à part.
 *
 * Canal « entrant » (défaut, GRATUIT) : la page montre un code « AWZID 4F7K2Q » et ouvre WhatsApp sur un message
 * pré-rempli adressé au numéro d'Awzid ; la personne l'envoie. La preuve est l'EXPÉDITEUR du message (WhatsApp
 * authentifie le numéro) : le webhook ne valide que si le numéro de l'expéditeur est celui de la vérification ET si le
 * code correspond. Le code sert seulement à relier le message à la page (il est montré à la personne). Validation
 * MANUELLE possible (bêta) : l'administrateur lit le message reçu et valide.
 * Canal « sortant » (secours PAYANT, éteint par défaut) : code à 6 chiffres envoyé, 3 essais.
 *
 * Commun : 10 minutes (48 h en validation manuelle), usage unique, page reliée par un jeton (empreinte seule), un
 * renvoi après 60 s au plus tôt, 4 vérifications par numéro et par heure (une + 3 renvois), un plafond horaire tous
 * numéros, un plafond QUOTIDIEN d'envois payants (alerte au tableau de bord).
 */
import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, gte, isNotNull, isNull, sql } from 'drizzle-orm';
import { schema as t, type Db } from '@awform/db';
import { lireCodeDefi, masquerTelephone } from '@awform/school/telephone';
import type { ConfigTelephone } from './config.js';
import type { Expediteur } from './expediteur.js';
import { chiffrer, dechiffrer, hmac, phoneHashOf, tirer } from './cles.js';

export const OBJETS_DEFI = t.PHONE_CHALLENGE_PURPOSES;
export type ObjetDefi = (typeof OBJETS_DEFI)[number];

export interface CtxTel {
  db: Db;
  key: Buffer;
  cfg: ConfigTelephone;
  expediteur: Expediteur;
}

export const RENVOI_MS = 60_000;
export const PAR_NUMERO_HEURE = 4;
export const ESSAIS_SORTANT = 3;
/** délai pour utiliser une vérification réussie (inscription, nouveau mot de passe) */
export const UTILISATION_MS = 30 * 60_000;

const codeHashEntrant = (key: Buffer, code: string) => hmac(key, `awzid-defi:${code}`);
const codeHashSortant = (key: Buffer, id: string, code: string) =>
  hmac(key, `awzid-defi-sortant:${id}:${code}`);
const pollHashOf = (key: Buffer, jeton: string) => hmac(key, `awzid-poll:${jeton}`);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const debutDuJour = (now: Date) => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Envois payants du jour (canal sortant). */
export async function envoisDuJour(db: Db, now = new Date()): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`coalesce(sum(${t.phoneChallenge.sends}), 0)::int` })
    .from(t.phoneChallenge)
    .where(
      and(
        eq(t.phoneChallenge.channel, 'sortant'),
        gte(t.phoneChallenge.createdAt, debutDuJour(now)),
      ),
    );
  return r?.n ?? 0;
}

export type RefusDefi =
  | { code: 'renvoi_trop_tot'; secondes: number }
  | { code: 'trop_de_demandes' }
  | { code: 'envoi_plafond' }
  | { code: 'envoi_indisponible' }
  | { code: 'envoi_echec' };

export interface DefiCree {
  id: string;
  jeton: string;
  canal: 'entrant' | 'sortant';
  /** canal entrant : code à mettre dans le message (montré à la personne) */
  code?: string;
  expireLe: string;
}

export async function creerDefi(
  ctx: CtxTel,
  v: {
    objet: ObjetDefi;
    e164: string;
    canal: 'entrant' | 'sortant';
    accountId?: string | null;
    locale?: string;
  },
  now = new Date(),
): Promise<{ ok: true; defi: DefiCree } | ({ ok: false } & RefusDefi)> {
  const { db, key, cfg } = ctx;
  const ph = phoneHashOf(key, v.e164);
  const [dernier] = await db
    .select({ at: t.phoneChallenge.createdAt })
    .from(t.phoneChallenge)
    .where(eq(t.phoneChallenge.phoneHash, ph))
    .orderBy(sql`${t.phoneChallenge.createdAt} desc`)
    .limit(1);
  if (dernier && now.getTime() - dernier.at.getTime() < RENVOI_MS)
    return {
      ok: false,
      code: 'renvoi_trop_tot',
      secondes: Math.ceil((RENVOI_MS - (now.getTime() - dernier.at.getTime())) / 1000),
    };
  const heure = new Date(now.getTime() - 3_600_000);
  const [parNumero] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.phoneChallenge)
    .where(and(eq(t.phoneChallenge.phoneHash, ph), gte(t.phoneChallenge.createdAt, heure)));
  if ((parNumero?.n ?? 0) >= PAR_NUMERO_HEURE) return { ok: false, code: 'trop_de_demandes' };
  const [tous] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.phoneChallenge)
    .where(gte(t.phoneChallenge.createdAt, heure));
  if ((tous?.n ?? 0) >= cfg.parHeure) return { ok: false, code: 'trop_de_demandes' };
  if (v.canal === 'sortant') {
    if (!cfg.envoi || ctx.expediteur.mode === 'inactif')
      return { ok: false, code: 'envoi_indisponible' };
    if ((await envoisDuJour(db, now)) >= cfg.plafondJour)
      return { ok: false, code: 'envoi_plafond' };
  }
  // une seule vérification active par numéro et par objet : les précédentes ne valent plus
  await db
    .update(t.phoneChallenge)
    .set({ expiresAt: now })
    .where(
      and(
        eq(t.phoneChallenge.phoneHash, ph),
        eq(t.phoneChallenge.purpose, v.objet),
        isNull(t.phoneChallenge.consumedAt),
        gt(t.phoneChallenge.expiresAt, now),
      ),
    );
  const id = randomUUID();
  const jeton = randomBytes(32).toString('base64url');
  const code = v.canal === 'entrant' ? tirer(6) : String(randomInt(0, 1_000_000)).padStart(6, '0');
  const duree = v.canal === 'entrant' ? cfg.dureeEntrantMs : 10 * 60_000;
  const expiresAt = new Date(now.getTime() + duree);
  await db.insert(t.phoneChallenge).values({
    id,
    purpose: v.objet,
    channel: v.canal,
    phoneHash: ph,
    phoneEnc: chiffrer(key, v.e164),
    accountId: v.accountId ?? null,
    codeHash: v.canal === 'entrant' ? codeHashEntrant(key, code) : codeHashSortant(key, id, code),
    // validation manuelle : code relisible par l'administrateur seulement (chiffré)
    codeEnc: v.canal === 'entrant' && cfg.manuel ? chiffrer(key, code) : null,
    pollHash: pollHashOf(key, jeton),
    sends: v.canal === 'sortant' ? 1 : 0,
    lastSentAt: v.canal === 'sortant' ? now : null,
    expiresAt,
    createdAt: now,
  });
  if (v.canal === 'sortant') {
    try {
      await ctx.expediteur.send({ to: v.e164, kind: 'code', code, locale: v.locale ?? 'fr' });
    } catch {
      await db.update(t.phoneChallenge).set({ expiresAt: now }).where(eq(t.phoneChallenge.id, id));
      return { ok: false, code: 'envoi_echec' };
    }
  }
  return {
    ok: true,
    defi: {
      id,
      jeton,
      canal: v.canal,
      ...(v.canal === 'entrant' ? { code } : {}),
      expireLe: expiresAt.toISOString(),
    },
  };
}

async function parJeton(ctx: CtxTel, id: string, jeton: string) {
  if (!UUID.test(id) || !/^[A-Za-z0-9_-]{20,100}$/.test(jeton)) return null;
  const [r] = await ctx.db.select().from(t.phoneChallenge).where(eq(t.phoneChallenge.id, id));
  if (!r) return null;
  const a = Buffer.from(r.pollHash);
  const b = Buffer.from(pollHashOf(ctx.key, jeton));
  return a.length === b.length && timingSafeEqual(a, b) ? r : null;
}

export type EtatDefi = 'en_attente' | 'validee' | 'expiree' | 'utilisee';
export async function etatDefi(
  ctx: CtxTel,
  id: string,
  jeton: string,
  now = new Date(),
): Promise<EtatDefi | null> {
  const r = await parJeton(ctx, id, jeton);
  if (!r) return null;
  if (r.consumedAt) return 'utilisee';
  if (r.validatedAt) return now.getTime() < limiteUtilisation(r).getTime() ? 'validee' : 'expiree';
  return r.expiresAt > now ? 'en_attente' : 'expiree';
}

const limiteUtilisation = (r: { validatedAt: Date | null; expiresAt: Date }) =>
  new Date(Math.max(r.expiresAt.getTime(), (r.validatedAt?.getTime() ?? 0) + UTILISATION_MS));

/**
 * Message REÇU sur le WhatsApp d'Awzid (webhook ou simulateur) : valide la vérification dont le code est dans le
 * texte ET dont le numéro est celui de l'expéditeur. Renvoie « validee » ou « ignore » (jamais d'autre détail).
 */
export async function recevoirMessage(
  ctx: CtxTel,
  de: string,
  texte: string,
  now = new Date(),
): Promise<'validee' | 'ignore'> {
  const code = lireCodeDefi(texte);
  if (!code) return 'ignore';
  const e164 = de.startsWith('+') ? de : `+${de.replace(/\D/g, '')}`;
  const r = await ctx.db
    .update(t.phoneChallenge)
    .set({ validatedAt: now })
    .where(
      and(
        eq(t.phoneChallenge.codeHash, codeHashEntrant(ctx.key, code)),
        eq(t.phoneChallenge.phoneHash, phoneHashOf(ctx.key, e164)),
        eq(t.phoneChallenge.channel, 'entrant'),
        isNull(t.phoneChallenge.validatedAt),
        isNull(t.phoneChallenge.consumedAt),
        gt(t.phoneChallenge.expiresAt, now),
      ),
    )
    .returning({ id: t.phoneChallenge.id });
  return r.length ? 'validee' : 'ignore';
}

/** Canal sortant : code ressaisi (3 essais, comptés AVANT la comparaison). */
export async function verifierCode(
  ctx: CtxTel,
  id: string,
  jeton: string,
  code: string,
  now = new Date(),
): Promise<
  { ok: true } | { ok: false; code: 'code_incorrect' | 'code_expire'; restants?: number }
> {
  const r = await parJeton(ctx, id, jeton);
  if (!r || r.channel !== 'sortant' || r.validatedAt || r.consumedAt || r.expiresAt <= now)
    return { ok: false, code: 'code_expire' };
  const [inc] = await ctx.db
    .update(t.phoneChallenge)
    .set({ attempts: sql`${t.phoneChallenge.attempts} + 1` })
    .where(and(eq(t.phoneChallenge.id, id), sql`${t.phoneChallenge.attempts} < ${ESSAIS_SORTANT}`))
    .returning({ attempts: t.phoneChallenge.attempts });
  if (!inc) return { ok: false, code: 'code_expire' };
  const attendu = Buffer.from(r.codeHash);
  const recu = Buffer.from(codeHashSortant(ctx.key, id, /^\d{6}$/.test(code) ? code : 'x'));
  if (attendu.length !== recu.length || !timingSafeEqual(attendu, recu))
    return { ok: false, code: 'code_incorrect', restants: ESSAIS_SORTANT - inc.attempts };
  await ctx.db
    .update(t.phoneChallenge)
    .set({ validatedAt: now })
    .where(and(eq(t.phoneChallenge.id, id), isNull(t.phoneChallenge.validatedAt)));
  return { ok: true };
}

/**
 * UTILISE une vérification réussie (inscription, nouveau mot de passe, ajout du numéro…) : bon objet, bon jeton,
 * validée, pas encore utilisée, dans les délais ; consommation ATOMIQUE. Renvoie le numéro vérifié, ou null.
 */
export async function consommerDefi(
  ctx: CtxTel,
  d: { id: string; jeton: string },
  objet: ObjetDefi,
  accountId: string | null = null,
  now = new Date(),
): Promise<{ e164: string; phoneHash: string; phoneEnc: string } | null> {
  const r = await parJeton(ctx, d.id, d.jeton);
  if (!r || r.purpose !== objet || !r.validatedAt || r.consumedAt) return null;
  if (now.getTime() >= limiteUtilisation(r).getTime()) return null;
  if (r.accountId && r.accountId !== accountId) return null;
  const won = await ctx.db
    .update(t.phoneChallenge)
    .set({ consumedAt: now })
    .where(and(eq(t.phoneChallenge.id, r.id), isNull(t.phoneChallenge.consumedAt)))
    .returning({ id: t.phoneChallenge.id });
  if (!won.length) return null;
  const e164 = dechiffrer(ctx.key, r.phoneEnc);
  return e164 ? { e164, phoneHash: r.phoneHash, phoneEnc: r.phoneEnc } : null;
}

// ------------------------------------------------------------------ validation manuelle (bêta)

/** Numéros en attente de validation manuelle : numéro masqué sauf les 4 derniers chiffres, code attendu, dates. */
export async function enAttenteManuelle(ctx: CtxTel, now = new Date()) {
  const rows = await ctx.db
    .select()
    .from(t.phoneChallenge)
    .where(
      and(
        eq(t.phoneChallenge.channel, 'entrant'),
        isNull(t.phoneChallenge.validatedAt),
        isNull(t.phoneChallenge.consumedAt),
        isNotNull(t.phoneChallenge.codeEnc),
        gt(t.phoneChallenge.expiresAt, now),
      ),
    )
    .orderBy(t.phoneChallenge.createdAt)
    .limit(200);
  return rows.map((r) => ({
    id: r.id,
    numero: masquerTelephone(dechiffrer(ctx.key, r.phoneEnc), 4),
    code: dechiffrer(ctx.key, r.codeEnc),
    objet: r.purpose,
    creeLe: r.createdAt,
    expireLe: r.expiresAt,
  }));
}

export async function deciderManuellement(
  ctx: CtxTel,
  id: string,
  decision: 'valider' | 'refuser',
  adminId: string,
  now = new Date(),
): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const r = await ctx.db
    .update(t.phoneChallenge)
    .set(decision === 'valider' ? { validatedAt: now, validatedBy: adminId } : { expiresAt: now })
    .where(
      and(
        eq(t.phoneChallenge.id, id),
        eq(t.phoneChallenge.channel, 'entrant'),
        isNull(t.phoneChallenge.validatedAt),
        isNull(t.phoneChallenge.consumedAt),
        isNotNull(t.phoneChallenge.codeEnc),
        gt(t.phoneChallenge.expiresAt, now),
      ),
    )
    .returning({ id: t.phoneChallenge.id });
  return r.length > 0;
}
