/**
 * Bêta fermée sur invitation — données (API et tests) :
 *  - RÉGLAGES du site (`site_setting`) : « inscription » = ouverte | invitation ; « site » = ouvert | ferme
 *    (mode fermé : page de maintenance sobre, retour arrière en une action). Sans réglage posé, la valeur par défaut
 *    vient de l'environnement (AWFORM_ACCES = ouvert | invitation | ferme ; défaut : ouvert, comme avant la bêta ;
 *    le déploiement --production pose « invitation »). Cache court (5 s) : un réglage s'applique en quelques secondes.
 *  - INVITATIONS : code `AWZ-XXXXX-XXXXX` (alphabet sans caractères ambigus, 50 bits), JAMAIS gardé en clair
 *    (empreinte SHA-256), usage unique ou limité, expiration, révocation, adresse facultative (invitation
 *    personnelle). Consommation ATOMIQUE (une seule requête SQL conditionnelle) : deux inscriptions simultanées ne
 *    peuvent pas dépasser le nombre d'usages.
 *  - LISTE D'ATTENTE validée à la main : demande (adresse, nom facultatif, mot court, langue) → acceptée (une
 *    invitation personnelle est créée) ou refusée ; effacée après 12 mois.
 */
import { createHash, randomInt } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import * as t from './schema.js';
import type { Db } from './client.js';

// ------------------------------------------------------------------ réglages du site

export const INSCRIPTION_MODES = ['ouverte', 'invitation'] as const;
export const SITE_MODES = ['ouvert', 'ferme'] as const;
export const BANDEAU_MODES = ['on', 'off'] as const;
export const VERIFICATION_MODES = ['requise', 'souple'] as const;
export const ANTIBOT_MODES = ['on', 'off'] as const;
/** TROIS modes commutables depuis l'espace administrateur : fermé, sur invitation, ouvert (avec plafond d'inscriptions). */
export const MODES_ACCES = ['ferme', 'invitation', 'ouvert'] as const;
export type InscriptionMode = (typeof INSCRIPTION_MODES)[number];
export type SiteMode = (typeof SITE_MODES)[number];
export type BandeauMode = (typeof BANDEAU_MODES)[number];
export type VerificationMode = (typeof VERIFICATION_MODES)[number];
export type AntibotMode = (typeof ANTIBOT_MODES)[number];
export type ModeAcces = (typeof MODES_ACCES)[number];
export interface AccesStatut {
  inscription: InscriptionMode;
  site: SiteMode;
  /** bandeau « Version bêta » affiché (fermable par chaque personne) */
  bandeau: BandeauMode;
  /**
   * PLAFOND d'inscriptions du mode ouvert : nombre maximum de comptes (familles et adultes, non supprimés). Atteint,
   * l'inscription libre passe seule en LISTE D'ATTENTE (une invitation reste valable). Jamais « sans limite ».
   */
  plafond: number;
  /** adresse e-mail à vérifier avant d'utiliser le compte (appliqué seulement si l'envoi d'e-mails est réglé) */
  verification: VerificationMode;
  /** protection anti-robots de l'inscription : jeton signé + délai minimal + champ piège (aucun service tiers) */
  antibot: AntibotMode;
}

/** Mode vu par l'administrateur : le site fermé l'emporte, puis l'inscription. */
export function modeDe(a: Pick<AccesStatut, 'site' | 'inscription'>): ModeAcces {
  if (a.site === 'ferme') return 'ferme';
  return a.inscription === 'invitation' ? 'invitation' : 'ouvert';
}
/** Réglages à poser pour passer à un mode (la fermeture ne touche pas à l'inscription : retour arrière fidèle). */
export function reglagesDuMode(mode: ModeAcces): Partial<AccesStatut> {
  if (mode === 'ferme') return { site: 'ferme' };
  return { site: 'ouvert', inscription: mode === 'invitation' ? 'invitation' : 'ouverte' };
}
/** Inscription réellement offerte : « attente » quand le plafond du mode ouvert est atteint. */
export function inscriptionEffective(
  a: Pick<AccesStatut, 'inscription' | 'plafond'>,
  comptes: number,
): 'ouverte' | 'invitation' | 'attente' {
  if (a.inscription === 'invitation') return 'invitation';
  return comptes >= a.plafond ? 'attente' : 'ouverte';
}

export interface AccesDefaut {
  acces?: string;
  bandeau?: string;
  plafond?: string;
  verification?: string;
  antibot?: string;
}
/** Plafond par défaut du mode ouvert (jamais absent : 200 comptes). */
export const PLAFOND_DEFAUT = 200;
const nombre = (s: string | undefined, def: number) => {
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 && n <= 1_000_000 && (s ?? '').trim() !== '' ? n : def;
};
/**
 * Défaut venu de l'environnement (lu par l'API, qui le donne ici) : `acces` = ouvert (défaut) | invitation | ferme ;
 * `bandeau` = on (défaut) | off ; `plafond` = nombre de comptes (défaut 200) ; `verification` = souple (défaut) | requise ;
 * `antibot` = off (défaut) | on. `deploy.sh --production` pose invitation, requise et on.
 */
export function accesParDefaut(src: AccesDefaut = {}): AccesStatut {
  const v = (src.acces ?? '').trim().toLowerCase();
  const bandeau: BandeauMode = (src.bandeau ?? '').trim().toLowerCase() === 'off' ? 'off' : 'on';
  const verification: VerificationMode =
    (src.verification ?? '').trim().toLowerCase() === 'requise' ? 'requise' : 'souple';
  const antibot: AntibotMode = (src.antibot ?? '').trim().toLowerCase() === 'on' ? 'on' : 'off';
  const plafond = nombre(src.plafond, PLAFOND_DEFAUT);
  const base = { bandeau, plafond, verification, antibot };
  if (v === 'ferme') return { inscription: 'invitation', site: 'ferme', ...base };
  if (v === 'invitation') return { inscription: 'invitation', site: 'ouvert', ...base };
  return { inscription: 'ouverte', site: 'ouvert', ...base };
}
let defaut: AccesStatut = accesParDefaut();
/** Pose le défaut de l'environnement (au démarrage de l'API) et vide le cache. */
export function setAccesDefaut(src: AccesDefaut): void {
  defaut = accesParDefaut(src);
  accesCache = null;
}
export const ACCES_TTL_MS = 5_000;
let accesCache: { at: number; v: AccesStatut } | null = null;
export function invalidateAcces(): void {
  accesCache = null;
}

/**
 * État d'accès courant (réglage en base, sinon défaut de l'environnement). Cache de 5 s (`fresh` : relecture
 * immédiate). Jamais d'exception : en cas de panne de la base, le défaut de l'environnement s'applique (le site
 * ne s'ouvre pas tout seul s'il est configuré fermé).
 */
export async function readAcces(
  db: Db,
  opts: { fresh?: boolean; now?: number } = {},
): Promise<AccesStatut> {
  const now = opts.now ?? Date.now();
  if (!opts.fresh && accesCache && now - accesCache.at < ACCES_TTL_MS) return accesCache.v;
  const v: AccesStatut = { ...defaut };
  try {
    for (const r of await db.select().from(t.siteSetting)) {
      if (r.key === 'inscription' && (INSCRIPTION_MODES as readonly string[]).includes(r.value))
        v.inscription = r.value as InscriptionMode;
      if (r.key === 'site' && (SITE_MODES as readonly string[]).includes(r.value))
        v.site = r.value as SiteMode;
      if (r.key === 'bandeau' && (BANDEAU_MODES as readonly string[]).includes(r.value))
        v.bandeau = r.value as BandeauMode;
      if (r.key === 'verification' && (VERIFICATION_MODES as readonly string[]).includes(r.value))
        v.verification = r.value as VerificationMode;
      if (r.key === 'antibot' && (ANTIBOT_MODES as readonly string[]).includes(r.value))
        v.antibot = r.value as AntibotMode;
      if (r.key === 'plafond') v.plafond = nombre(r.value, v.plafond);
    }
    accesCache = { at: now, v };
  } catch {
    /* repli sur le défaut, sans le garder en cache */
  }
  return v;
}

export async function setAcces(
  db: Db,
  patch: Partial<AccesStatut>,
  by: string | null,
): Promise<void> {
  for (const [key, raw] of Object.entries(patch)) {
    if (raw === undefined) continue;
    const value = String(raw);
    await db
      .insert(t.siteSetting)
      .values({ key, value, updatedBy: by })
      .onConflictDoUpdate({
        target: t.siteSetting.key,
        set: { value, updatedBy: by, updatedAt: new Date() },
      });
  }
  invalidateAcces();
}

/** Comptes qui comptent pour le plafond : familles et adultes non supprimés (ni personnel, ni école). */
export async function countComptes(db: Db): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.account)
    .where(and(isNull(t.account.deletedAt), inArray(t.account.kind, ['parent', 'adulte'])));
  return r?.n ?? 0;
}

// ------------------------------------------------------------------ codes d'invitation

/** Sans 0 O 1 I L U (lisibles à la voix et sur une photo) : 31 signes. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_RE = /^AWZ-[2-9A-HJKMNP-TV-Z]{5}-[2-9A-HJKMNP-TV-Z]{5}$/;

export function generateCode(): string {
  const pick = () => Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `AWZ-${pick()}-${pick()}`;
}

/** Forme normalisée d'un code saisi à la main (majuscules, sans espaces ni tirets, « AWZ » facultatif), ou null. */
export function normalizeCode(input: string): string | null {
  let s = input.toUpperCase().replace(/[\s‎‏-]/g, '');
  // 0, O, 1, I, L, U ne figurent pas dans l'alphabet : une saisie qui en contient ne correspond à rien
  if (s.startsWith('AWZ')) s = s.slice(3);
  if (!/^[2-9A-HJKMNP-TV-Z]{10}$/.test(s)) return null;
  return s;
}

export const invitationHash = (norm: string): string =>
  createHash('sha256').update(`awzid-invitation:${norm}`).digest('hex');

export function formatCode(norm: string): string {
  return `AWZ-${norm.slice(0, 5)}-${norm.slice(5)}`;
}

export type InvitationEtat = 'active' | 'expiree' | 'revoquee' | 'epuisee';
export function invitationEtat(
  r: { expiresAt: Date | null; revokedAt: Date | null; uses: number; maxUses: number },
  now = new Date(),
): InvitationEtat {
  if (r.revokedAt) return 'revoquee';
  if (r.expiresAt && r.expiresAt.getTime() <= now.getTime()) return 'expiree';
  if (r.uses >= r.maxUses) return 'epuisee';
  return 'active';
}

export interface NewInvitation {
  label?: string | null;
  email?: string | null;
  maxUses?: number;
  /** durée de validité en jours (défaut 30 ; 0 = sans expiration) */
  days?: number;
  by: string | null;
  waitlistId?: string | null;
}

/** Crée une invitation ; renvoie le code EN CLAIR (à montrer une seule fois). */
export async function createInvitation(
  db: Db,
  v: NewInvitation,
  now = new Date(),
): Promise<{ id: string; code: string; expiresAt: Date | null }> {
  const days = v.days === undefined ? 30 : v.days;
  const expiresAt = days > 0 ? new Date(now.getTime() + days * 86_400_000) : null;
  for (let i = 0; i < 5; i++) {
    const code = generateCode();
    const norm = normalizeCode(code)!;
    try {
      const [r] = await db
        .insert(t.invitation)
        .values({
          codeHash: invitationHash(norm),
          codeEnd: norm.slice(-4),
          label: v.label?.trim() || null,
          email: v.email?.trim().toLowerCase() || null,
          maxUses: v.maxUses ?? 1,
          expiresAt,
          createdBy: v.by,
          waitlistId: v.waitlistId ?? null,
        })
        .returning({ id: t.invitation.id });
      return { id: r!.id, code, expiresAt };
    } catch (e) {
      // collision d'empreinte (quasi impossible) : nouveau tirage
      if (!/duplicate key|unique/i.test(String((e as Error).message))) throw e;
    }
  }
  throw new Error("création de l'invitation impossible");
}

export type RefusInvitation =
  | 'code_invalide'
  | 'invitation_inconnue'
  | 'invitation_expiree'
  | 'invitation_revoquee'
  | 'invitation_epuisee'
  | 'invitation_autre_adresse';

/** Contrôle SANS consommer (page d'inscription : « invitation reconnue »). */
export async function checkInvitation(
  db: Db,
  code: string,
  email: string | null,
  now = new Date(),
): Promise<
  | { ok: true; id: string; personnelle: boolean; restant: number }
  | { ok: false; raison: RefusInvitation }
> {
  const norm = normalizeCode(code);
  if (!norm) return { ok: false, raison: 'code_invalide' };
  const [r] = await db
    .select()
    .from(t.invitation)
    .where(eq(t.invitation.codeHash, invitationHash(norm)));
  if (!r) return { ok: false, raison: 'invitation_inconnue' };
  const etat = invitationEtat(r, now);
  if (etat === 'revoquee') return { ok: false, raison: 'invitation_revoquee' };
  if (etat === 'expiree') return { ok: false, raison: 'invitation_expiree' };
  if (etat === 'epuisee') return { ok: false, raison: 'invitation_epuisee' };
  if (r.email && email !== null && r.email !== email.trim().toLowerCase())
    return { ok: false, raison: 'invitation_autre_adresse' };
  return { ok: true, id: r.id, personnelle: !!r.email, restant: r.maxUses - r.uses };
}

/**
 * Réserve UN usage de l'invitation (une seule requête conditionnelle : valide, non révoquée, non expirée, usages
 * restants, adresse conforme). Renvoie l'identifiant, ou la raison du refus.
 */
export async function reserveInvitation(
  db: Db,
  code: string,
  email: string,
  now = new Date(),
): Promise<{ ok: true; id: string } | { ok: false; raison: RefusInvitation }> {
  const norm = normalizeCode(code);
  if (!norm) return { ok: false, raison: 'code_invalide' };
  const mail = email.trim().toLowerCase();
  const won = await db
    .update(t.invitation)
    .set({ uses: sql`${t.invitation.uses} + 1` })
    .where(
      and(
        eq(t.invitation.codeHash, invitationHash(norm)),
        isNull(t.invitation.revokedAt),
        sql`(${t.invitation.expiresAt} IS NULL OR ${t.invitation.expiresAt} > ${now})`,
        sql`${t.invitation.uses} < ${t.invitation.maxUses}`,
        sql`(${t.invitation.email} IS NULL OR ${t.invitation.email} = ${mail})`,
      ),
    )
    .returning({ id: t.invitation.id });
  if (won[0]) return { ok: true, id: won[0].id };
  // refus : on dit pourquoi (aucune information sensible, le code a déjà été saisi par l'appelant)
  const c = await checkInvitation(db, code, mail, now);
  return { ok: false, raison: c.ok ? 'invitation_inconnue' : c.raison };
}

/** Rend l'usage réservé (création du compte échouée après la réservation). */
export async function releaseInvitation(db: Db, id: string): Promise<void> {
  await db
    .update(t.invitation)
    .set({ uses: sql`GREATEST(${t.invitation.uses} - 1, 0)` })
    .where(eq(t.invitation.id, id));
}

export async function attachInvitation(db: Db, id: string, accountId: string): Promise<void> {
  await db.insert(t.invitationUse).values({ invitationId: id, accountId }).onConflictDoNothing();
}

export async function revokeInvitation(db: Db, id: string, now = new Date()): Promise<boolean> {
  const r = await db
    .update(t.invitation)
    .set({ revokedAt: now })
    .where(and(eq(t.invitation.id, id), isNull(t.invitation.revokedAt)))
    .returning({ id: t.invitation.id });
  return r.length > 0;
}

export async function listInvitations(db: Db, limit = 200, now = new Date()) {
  const rows = await db
    .select()
    .from(t.invitation)
    .orderBy(desc(t.invitation.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    fin: r.codeEnd,
    libelle: r.label,
    adresse: r.email,
    max: r.maxUses,
    usages: r.uses,
    expireLe: r.expiresAt,
    revoqueeLe: r.revokedAt,
    creeeLe: r.createdAt,
    etat: invitationEtat(r, now),
    demande: r.waitlistId,
  }));
}

// ------------------------------------------------------------------ liste d'attente

export const WAITLIST_STATUS = ['en_attente', 'acceptee', 'refusee'] as const;
export const WAITLIST_PER_HOUR_ALL = 200;

/** Ajoute une demande ; « existe » si l'adresse est déjà dans la liste (la réponse publique reste identique). */
export async function addWaitlist(
  db: Db,
  v: { email: string; name?: string | null; note?: string | null; locale?: string },
): Promise<'cree' | 'existe'> {
  const r = await db
    .insert(t.waitlist)
    .values({
      email: v.email.trim().toLowerCase(),
      name: v.name?.trim() || null,
      note: v.note?.trim() || null,
      locale: v.locale ?? 'fr',
    })
    .onConflictDoNothing()
    .returning({ id: t.waitlist.id });
  return r.length ? 'cree' : 'existe';
}

export async function waitlistLastHour(db: Db, now = new Date()): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.waitlist)
    .where(sql`${t.waitlist.createdAt} >= ${new Date(now.getTime() - 3_600_000)}`);
  return r?.n ?? 0;
}

export async function listWaitlist(db: Db, status: string | null, limit = 200) {
  return db
    .select({
      id: t.waitlist.id,
      adresse: t.waitlist.email,
      nom: t.waitlist.name,
      mot: t.waitlist.note,
      langue: t.waitlist.locale,
      statut: t.waitlist.status,
      invitation: t.waitlist.invitationId,
      creeeLe: t.waitlist.createdAt,
      decideeLe: t.waitlist.decidedAt,
    })
    .from(t.waitlist)
    .where(status ? eq(t.waitlist.status, status) : undefined)
    .orderBy(
      status === 'en_attente' || !status ? asc(t.waitlist.createdAt) : desc(t.waitlist.createdAt),
    )
    .limit(limit);
}

export async function getWaitlist(db: Db, id: string) {
  const [r] = await db.select().from(t.waitlist).where(eq(t.waitlist.id, id));
  return r ?? null;
}

export async function decideWaitlist(
  db: Db,
  id: string,
  status: 'acceptee' | 'refusee',
  by: string,
  invitationId: string | null,
): Promise<boolean> {
  const r = await db
    .update(t.waitlist)
    .set({ status, decidedAt: new Date(), decidedBy: by, invitationId })
    .where(and(eq(t.waitlist.id, id), eq(t.waitlist.status, 'en_attente')))
    .returning({ id: t.waitlist.id });
  return r.length > 0;
}

export async function countWaitlist(db: Db): Promise<Record<string, number>> {
  const rows = await db
    .select({ s: t.waitlist.status, n: sql<number>`count(*)::int` })
    .from(t.waitlist)
    .where(inArray(t.waitlist.status, [...WAITLIST_STATUS]))
    .groupBy(t.waitlist.status);
  return Object.fromEntries(rows.map((r) => [r.s, r.n]));
}

/** Demandes de plus de 12 mois effacées. */
export async function purgeListeAttente(db: Db, now = new Date()): Promise<number> {
  const r = await db
    .delete(t.waitlist)
    .where(lt(t.waitlist.createdAt, new Date(now.getTime() - 365 * 86_400_000)));
  return r.rowCount ?? 0;
}
