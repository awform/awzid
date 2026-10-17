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
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import * as t from './schema.js';
import type { Db } from './client.js';

// ------------------------------------------------------------------ réglages du site

export const INSCRIPTION_MODES = ['ouverte', 'invitation'] as const;
export const SITE_MODES = ['ouvert', 'ferme'] as const;
export const BANDEAU_MODES = ['on', 'off'] as const;
export const VERIFICATION_MODES = ['requise', 'souple'] as const;
export const ANTIBOT_MODES = ['on', 'off'] as const;
export const QF_ENFANTS_MODES = ['on', 'off'] as const;
/** lot 11 : groupe donné par l'acceptation d'une demande de liste d'attente (« aucun » à l'ouverture publique) */
export const ATTENTE_GROUPE_MODES = ['beta_fermee', 'aucun'] as const;
/** TROIS modes commutables depuis l'espace administrateur : fermé, sur invitation, ouvert (avec plafond d'inscriptions). */
export const MODES_ACCES = ['ferme', 'invitation', 'ouvert'] as const;
export type InscriptionMode = (typeof INSCRIPTION_MODES)[number];
export type SiteMode = (typeof SITE_MODES)[number];
export type BandeauMode = (typeof BANDEAU_MODES)[number];
export type VerificationMode = (typeof VERIFICATION_MODES)[number];
export type AntibotMode = (typeof ANTIBOT_MODES)[number];
export type QfEnfantsMode = (typeof QF_ENFANTS_MODES)[number];
export type AttenteGroupeMode = (typeof ATTENTE_GROUPE_MODES)[number];
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
  /**
   * Quran Foundation et PROFILS D'ENFANTS : tant que la valeur est « off » (défaut), les profils d'enfants n'utilisent pas les
   * fonctions qui dépendent de la Quran Foundation (récitateurs en ligne, Muṣḥaf exact) ; ados et adultes ne changent pas.
   * À passer à « on » seulement après l'accord écrit de la Quran Foundation (docs/projet/juridique/LICENCES_PRODUCTION.md § 1.3).
   */
  qf_profils_enfants: QfEnfantsMode;
  /**
   * lot 11 : une demande de liste d'attente ACCEPTÉE pendant la bêta (inscription sur invitation) crée une invitation du
   * groupe « bêta fermée » (`beta_fermee`, défaut) ; « aucun » la crée sans groupe (à poser à l'ouverture publique).
   * En inscription ouverte, l'invitation acceptée n'a jamais de groupe.
   */
  attente_groupe: AttenteGroupeMode;
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
/**
 * lot 11 : groupe de l'invitation créée en ACCEPTANT une demande de liste d'attente — « bêta fermée » tant que
 * l'inscription est sur invitation et que le réglage `attente_groupe` le demande (défaut) ; sinon aucun groupe.
 */
export function groupeAcceptation(
  a: Pick<AccesStatut, 'inscription' | 'attente_groupe'>,
): 'beta_fermee' | null {
  return a.inscription === 'invitation' && a.attente_groupe === 'beta_fermee'
    ? 'beta_fermee'
    : null;
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
  qfEnfants?: string;
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
  const qf_profils_enfants: QfEnfantsMode =
    (src.qfEnfants ?? '').trim().toLowerCase() === 'on' ? 'on' : 'off';
  const attente_groupe: AttenteGroupeMode = 'beta_fermee';
  const base = { bandeau, plafond, verification, antibot, qf_profils_enfants, attente_groupe };
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
      if (
        r.key === 'qf_profils_enfants' &&
        (QF_ENFANTS_MODES as readonly string[]).includes(r.value)
      )
        v.qf_profils_enfants = r.value as QfEnfantsMode;
      if (
        r.key === 'attente_groupe' &&
        (ATTENTE_GROUPE_MODES as readonly string[]).includes(r.value)
      )
        v.attente_groupe = r.value as AttenteGroupeMode;
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
  /** lot 6 : groupe attribué au compte qui s'inscrit avec cette invitation (« beta_fermee ») */
  groupe?: GroupeInvitation | null;
}

/** Groupes attribuables par une invitation (lot 6) : le groupe « bêta fermée » (rôle `beta_fermee`). */
export const GROUPES_INVITATION = ['beta_fermee'] as const;
export type GroupeInvitation = (typeof GROUPES_INVITATION)[number];

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
          groupe: v.groupe ?? null,
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
  // lot 11 : comptes créés avec chaque invitation (date d'usage, appartenance au groupe), sans aucune adresse
  const ids = rows.map((r) => r.id);
  const usages = ids.length
    ? await db
        .select({
          invitationId: t.invitationUse.invitationId,
          usedAt: t.invitationUse.usedAt,
          groupe: sql<boolean>`EXISTS (SELECT 1 FROM account_role ar WHERE ar.account_id = invitation_use.account_id AND ar.role = ${ROLE_BETA_FERMEE})`,
        })
        .from(t.invitationUse)
        .where(inArray(t.invitationUse.invitationId, ids))
    : [];
  const parInvitation = new Map<string, { n: number; dernier: Date; groupe: number }>();
  for (const u of usages) {
    const p = parInvitation.get(u.invitationId) ?? { n: 0, dernier: u.usedAt, groupe: 0 };
    p.n++;
    if (u.usedAt > p.dernier) p.dernier = u.usedAt;
    if (u.groupe) p.groupe++;
    parInvitation.set(u.invitationId, p);
  }
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
    groupe: r.groupe,
    /** nombre de comptes créés avec l'invitation, date du dernier, et combien sont dans le groupe « bêta fermée » */
    comptes: parInvitation.get(r.id)?.n ?? 0,
    compteCreeLe: parInvitation.get(r.id)?.dernier ?? null,
    comptesGroupe: parInvitation.get(r.id)?.groupe ?? 0,
  }));
}

/** Groupe attribué par une invitation (lot 6), ou null. */
export async function invitationGroupe(db: Db, id: string): Promise<GroupeInvitation | null> {
  const [r] = await db
    .select({ groupe: t.invitation.groupe })
    .from(t.invitation)
    .where(eq(t.invitation.id, id));
  return (GROUPES_INVITATION as readonly string[]).includes(r?.groupe ?? '')
    ? (r!.groupe as GroupeInvitation)
    : null;
}

// ------------------------------------------------------------------ groupe « bêta fermée » (lot 6)

/** Rôle du groupe « bêta fermée » : voit le contenu différé de Madjaliss pendant la bêta fermée. */
export const ROLE_BETA_FERMEE = 'beta_fermee' as const;

/** Membres du groupe (adresse complète : écran de l'administrateur seulement), les plus récents d'abord. */
export async function listGroupeBeta(db: Db, limit = 500) {
  return db
    .select({
      id: t.account.id,
      adresse: t.account.email,
      depuis: t.accountRole.grantedAt,
      par: t.accountRole.grantedBy,
    })
    .from(t.accountRole)
    .innerJoin(t.account, eq(t.account.id, t.accountRole.accountId))
    .where(and(eq(t.accountRole.role, ROLE_BETA_FERMEE), isNull(t.account.deletedAt)))
    .orderBy(desc(t.accountRole.grantedAt))
    .limit(limit);
}

/** Ajoute un compte au groupe par son adresse ; renvoie son identifiant, ou null si aucun compte n'a cette adresse. */
export async function ajouterAuGroupeBeta(
  db: Db,
  email: string,
  by: string | null,
): Promise<{ id: string; dejaMembre: boolean } | null> {
  const [a] = await db
    .select({ id: t.account.id })
    .from(t.account)
    .where(and(eq(t.account.email, email.trim().toLowerCase()), isNull(t.account.deletedAt)));
  if (!a) return null;
  const r = await db
    .insert(t.accountRole)
    .values({ accountId: a.id, role: ROLE_BETA_FERMEE, grantedBy: by })
    .onConflictDoNothing()
    .returning({ id: t.accountRole.id });
  return { id: a.id, dejaMembre: r.length === 0 };
}

/** Attribue le groupe à un compte (inscription avec une invitation de groupe). */
export async function attribuerGroupeBeta(
  db: Db,
  accountId: string,
  by: string | null = null,
): Promise<void> {
  await db
    .insert(t.accountRole)
    .values({ accountId, role: ROLE_BETA_FERMEE, grantedBy: by })
    .onConflictDoNothing();
}

/** Retire un compte du groupe : le droit est perdu à la requête suivante (rôle lu dans la session à chaque appel). */
export async function retirerDuGroupeBeta(db: Db, accountId: string): Promise<boolean> {
  const r = await db
    .delete(t.accountRole)
    .where(and(eq(t.accountRole.accountId, accountId), eq(t.accountRole.role, ROLE_BETA_FERMEE)))
    .returning({ id: t.accountRole.id });
  return r.length > 0;
}

// ------------------------------------------------------------------ liste d'attente

/**
 * Provenance d'une demande ou d'une inscription : code court de l'adresse des affiches (`?src=affiche`,
 * `?src=mosquee-xxx`). Validation stricte, sans transformation ; toute autre valeur est IGNORÉE (null).
 */
export const SOURCE_RE = /^[a-z0-9-]{1,40}$/;
export function normSource(v: unknown): string | null {
  return typeof v === 'string' && SOURCE_RE.test(v) ? v : null;
}

/** Provenance de la demande de liste d'attente qui a donné cette invitation (compte venu par le lien de l'e-mail). */
export async function sourceDeLInvitation(db: Db, invitationId: string): Promise<string | null> {
  const [r] = await db
    .select({ s: t.waitlist.source })
    .from(t.waitlist)
    .innerJoin(t.invitation, eq(t.invitation.waitlistId, t.waitlist.id))
    .where(eq(t.invitation.id, invitationId))
    .limit(1);
  return r?.s ?? null;
}

export interface OrigineLigne {
  /** null : arrivée sans code de provenance */
  source: string | null;
  demandes30j: number;
  demandes: number;
  inscriptions30j: number;
  inscriptions: number;
}

/**
 * « Origine des demandes » (espace administrateur) : nombre de demandes CONFIRMÉES de la liste d'attente et de
 * comptes créés, par provenance, sur 30 jours et au total (dans la durée de conservation). Agrégats seuls, sans adresse.
 */
export async function originesDemandes(db: Db, now = new Date()): Promise<OrigineLigne[]> {
  const depuis = new Date(now.getTime() - 30 * 86_400_000);
  const [att, cpt] = await Promise.all([
    db
      .select({
        s: t.waitlist.source,
        n: sql<number>`count(*)::int`,
        n30: sql<number>`(count(*) FILTER (WHERE ${t.waitlist.createdAt} >= ${depuis}))::int`,
      })
      .from(t.waitlist)
      .where(isNotNull(t.waitlist.confirmedAt))
      .groupBy(t.waitlist.source),
    db
      .select({
        s: t.account.source,
        n: sql<number>`count(*)::int`,
        n30: sql<number>`(count(*) FILTER (WHERE ${t.account.createdAt} >= ${depuis}))::int`,
      })
      .from(t.account)
      .where(and(isNull(t.account.deletedAt), inArray(t.account.kind, ['parent', 'adulte'])))
      .groupBy(t.account.source),
  ]);
  const m = new Map<string | null, OrigineLigne>();
  const ligne = (s: string | null) => {
    let l = m.get(s);
    if (!l) {
      l = { source: s, demandes30j: 0, demandes: 0, inscriptions30j: 0, inscriptions: 0 };
      m.set(s, l);
    }
    return l;
  };
  for (const r of att) Object.assign(ligne(r.s), { demandes: r.n, demandes30j: r.n30 });
  for (const r of cpt) Object.assign(ligne(r.s), { inscriptions: r.n, inscriptions30j: r.n30 });
  // les provenances nommées d'abord (les plus fréquentes en tête), « sans provenance » à la fin
  return [...m.values()].sort(
    (a, b) =>
      Number(a.source === null) - Number(b.source === null) ||
      b.demandes + b.inscriptions - (a.demandes + a.inscriptions) ||
      String(a.source).localeCompare(String(b.source)),
  );
}

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

/** Durée de validité du lien de confirmation, et délai d'effacement d'une adresse non confirmée. */
export const WAITLIST_CONFIRM_DAYS = 7;
export const waitlistTokenHash = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/**
 * Demande avec double consentement : la ligne est créée NON confirmée, avec l'empreinte du jeton envoyé par e-mail.
 * « cree » : nouvelle demande ; « renvoi » : adresse déjà demandée mais jamais confirmée (nouveau jeton, mêmes
 * 7 jours depuis la première demande) ; « existe » : adresse déjà confirmée (rien n'est envoyé). La réponse publique
 * reste la même dans les trois cas.
 */
export async function demanderAttente(
  db: Db,
  v: {
    email: string;
    name?: string | null;
    note?: string | null;
    locale?: string;
    tokenHash: string;
    /** provenance (?src=) ; gardée seulement à la PREMIÈRE demande, jamais réécrite par un renvoi */
    source?: string | null;
  },
): Promise<'cree' | 'renvoi' | 'existe'> {
  const email = v.email.trim().toLowerCase();
  const r = await db
    .insert(t.waitlist)
    .values({
      email,
      name: v.name?.trim() || null,
      note: v.note?.trim() || null,
      locale: v.locale ?? 'fr',
      tokenHash: v.tokenHash,
      source: normSource(v.source),
    })
    .onConflictDoNothing()
    .returning({ id: t.waitlist.id });
  if (r.length) return 'cree';
  const u = await db
    .update(t.waitlist)
    .set({ tokenHash: v.tokenHash, locale: v.locale ?? 'fr' })
    .where(and(eq(t.waitlist.email, email), isNull(t.waitlist.confirmedAt)))
    .returning({ id: t.waitlist.id });
  return u.length ? 'renvoi' : 'existe';
}

/** Clic sur le lien de confirmation : « confirmee », « deja » (déjà confirmée) ou « invalide » (inconnu ou expiré). */
export async function confirmerAttente(
  db: Db,
  token: string,
  now = new Date(),
): Promise<'confirmee' | 'deja' | 'invalide'> {
  const h = waitlistTokenHash(token);
  const u = await db
    .update(t.waitlist)
    .set({ confirmedAt: now })
    .where(
      and(
        eq(t.waitlist.tokenHash, h),
        isNull(t.waitlist.confirmedAt),
        sql`${t.waitlist.createdAt} > ${new Date(now.getTime() - WAITLIST_CONFIRM_DAYS * 86_400_000)}`,
      ),
    )
    .returning({ id: t.waitlist.id });
  if (u.length) return 'confirmee';
  const [d] = await db
    .select({ id: t.waitlist.id })
    .from(t.waitlist)
    .where(and(eq(t.waitlist.tokenHash, h), isNotNull(t.waitlist.confirmedAt)));
  return d ? 'deja' : 'invalide';
}

/** Désinscription par le lien de l'e-mail : la demande est effacée (vrai si elle existait). */
export async function desinscrireAttente(db: Db, token: string): Promise<boolean> {
  const r = await db
    .delete(t.waitlist)
    .where(eq(t.waitlist.tokenHash, waitlistTokenHash(token)))
    .returning({ id: t.waitlist.id });
  return r.length > 0;
}

export async function waitlistLastHour(db: Db, now = new Date()): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.waitlist)
    .where(sql`${t.waitlist.createdAt} >= ${new Date(now.getTime() - 3_600_000)}`);
  return r?.n ?? 0;
}

export async function listWaitlist(db: Db, status: string | null, limit = 200) {
  return (
    db
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
      // seules les adresses CONFIRMÉES par e-mail (double consentement) sont montrées à l'administrateur
      .where(
        and(isNotNull(t.waitlist.confirmedAt), status ? eq(t.waitlist.status, status) : undefined),
      )
      .orderBy(
        status === 'en_attente' || !status ? asc(t.waitlist.createdAt) : desc(t.waitlist.createdAt),
      )
      .limit(limit)
  );
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

/** Effacement d'une demande (droit à l'effacement / désinscription demandée par écrit) : vrai si elle existait. */
export async function deleteWaitlist(db: Db, id: string): Promise<boolean> {
  const r = await db
    .delete(t.waitlist)
    .where(eq(t.waitlist.id, id))
    .returning({ id: t.waitlist.id });
  return r.length > 0;
}

export async function countWaitlist(db: Db): Promise<Record<string, number>> {
  const rows = await db
    .select({ s: t.waitlist.status, n: sql<number>`count(*)::int` })
    .from(t.waitlist)
    .where(and(isNotNull(t.waitlist.confirmedAt), inArray(t.waitlist.status, [...WAITLIST_STATUS])))
    .groupBy(t.waitlist.status);
  return Object.fromEntries(rows.map((r) => [r.s, r.n]));
}

/** Demandes de plus de 12 mois effacées, et adresses jamais confirmées après 7 jours. */
export async function purgeListeAttente(db: Db, now = new Date()): Promise<number> {
  const r = await db
    .delete(t.waitlist)
    .where(
      sql`${t.waitlist.createdAt} < ${new Date(now.getTime() - 365 * 86_400_000)} OR (${t.waitlist.confirmedAt} IS NULL AND ${t.waitlist.createdAt} < ${new Date(now.getTime() - WAITLIST_CONFIRM_DAYS * 86_400_000)})`,
    );
  return r.rowCount ?? 0;
}
