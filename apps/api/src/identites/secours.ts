/**
 * Codes de RÉCUPÉRATION (gratuits, sans aucun envoi) : 8 codes à usage unique de 10 signes (~49 bits chacun),
 * montrés UNE fois (inscription par numéro, ou régénération depuis le compte) « à recopier sur papier » ; seule
 * l'empreinte HMAC est gardée. Un code permet de choisir un nouveau mot de passe sans e-mail ni message.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { schema as t, type Db } from '@awform/db';
import { formaterCodeSecours, normaliserCodeSecours } from '@awform/school/telephone';
import { hmac, tirer } from './cles.js';

export const NB_CODES_SECOURS = 8;
const empreinte = (key: Buffer, norm: string) => hmac(key, `awzid-secours:${norm}`);

/** Remplace les codes du compte par 8 nouveaux ; renvoie leur forme lisible (« 4F7K2-Q9XRT »). */
export async function genererCodesSecours(
  db: Db,
  key: Buffer,
  accountId: string,
): Promise<string[]> {
  const codes = Array.from({ length: NB_CODES_SECOURS }, () => tirer(10));
  await db.delete(t.recoveryCode).where(eq(t.recoveryCode.accountId, accountId));
  await db
    .insert(t.recoveryCode)
    .values(codes.map((c) => ({ accountId, codeHash: empreinte(key, c) })));
  return codes.map(formaterCodeSecours);
}

/** Consomme un code (atomique : deux essais simultanés, un seul gagne) ; vrai s'il était valable. */
export async function utiliserCodeSecours(
  db: Db,
  key: Buffer,
  accountId: string,
  saisie: string,
): Promise<boolean> {
  const norm = normaliserCodeSecours(saisie);
  if (!norm) return false;
  const r = await db
    .update(t.recoveryCode)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(t.recoveryCode.accountId, accountId),
        eq(t.recoveryCode.codeHash, empreinte(key, norm)),
        isNull(t.recoveryCode.usedAt),
      ),
    )
    .returning({ id: t.recoveryCode.id });
  return r.length > 0;
}

export async function codesSecoursRestants(db: Db, accountId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.recoveryCode)
    .where(and(eq(t.recoveryCode.accountId, accountId), isNull(t.recoveryCode.usedAt)));
  return r?.n ?? 0;
}
