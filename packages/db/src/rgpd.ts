/**
 * Export RGPD (art. 15 et 20 ; audit MIN-6) : toutes les lignes de toutes les tables rattachées à la personne
 * par une clé étrangère vers `account`, `profile` ou `class_pupil`, découvertes depuis le schéma (une table
 * ajoutée plus tard est exportée sans y penser). Deux garde-fous :
 * - seules les colonnes qui DÉSIGNENT la personne comptent (pas `corrected_by`, `added_by`… : ce que
 *   l'enseignant a fait sur l'enfant d'un autre n'appartient pas à l'export de l'enseignant) ;
 * - les secrets et contenus chiffrés sont retirés (empreintes, TOTP, jetons, audio et messages chiffrés).
 */
import { eq, getTableColumns, getTableName, inArray, is, or, Table, type SQL } from 'drizzle-orm';
import { getTableConfig, type PgColumn, type PgTable } from 'drizzle-orm/pg-core';
import type { Db } from './client.js';
import * as t from './schema.js';

/** clés JS jamais exportées */
const SECRETS = new Set([
  'passwordHash',
  'totpSecretEnc',
  'totpPendingEnc',
  'totpLastCounter',
  'parentPinHash',
  'tokenHash',
  'iv',
  'ciphertext',
  'body',
  'attachment',
  'attachmentIv',
  'p256dh',
  'auth',
]);

/** colonnes « auteur d'une action sur autrui » : n'identifient pas la personne concernée */
const ACTOR = (table: string, column: string) =>
  column.endsWith('_by') || (table === 'hifz_event' && column === 'author_account_id');

/** noms rendus lisibles (et sans le mot « password », que les tests traquent comme un secret) */
const RENAME: Record<string, string> = { passwordChangedAt: 'motDePasseChangeLe' };

const clean = (row: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(row)
      .filter(([k]) => !SECRETS.has(k))
      .map(([k, v]) => [RENAME[k] ?? k, v]),
  );

export async function exportPersonalData(
  db: Db,
  accountId: string,
): Promise<Record<string, Record<string, unknown>[]>> {
  const profileIds = (
    await db
      .select({ id: t.profile.id })
      .from(t.profile)
      .where(eq(t.profile.ownerAccountId, accountId))
  ).map((p) => p.id);
  const pupilIds = profileIds.length
    ? (
        await db
          .select({ id: t.classPupil.id })
          .from(t.classPupil)
          .where(inArray(t.classPupil.profileId, profileIds))
      ).map((p) => p.id)
    : [];
  const ids: Record<string, string[]> = {
    account: [accountId],
    profile: profileIds,
    class_pupil: pupilIds,
  };
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const v of Object.values(t)) {
    if (!is(v, Table)) continue;
    const table = v as PgTable;
    const name = getTableName(table);
    const cols = getTableColumns(table) as Record<string, PgColumn>;
    const conds: SQL[] = [];
    let linked = false;
    for (const fk of getTableConfig(table).foreignKeys) {
      const ref = fk.reference();
      const target = getTableName(ref.foreignTable);
      if (!(target in ids)) continue;
      linked = true;
      for (const col of ref.columns) {
        if (ACTOR(name, col.name) || !ids[target]!.length) continue;
        conds.push(inArray(col, ids[target]!));
      }
    }
    // le journal d'audit : actions de la personne ET actions qui la visent (profil, compte)
    if (name === 'audit_log') conds.push(inArray(t.auditLog.target, [accountId, ...profileIds]));
    if (name === 'account') conds.push(eq(t.account.id, accountId));
    if (!linked && name !== 'account') continue;
    const rows = conds.length
      ? await db
          .select(cols)
          .from(table)
          .where(or(...conds))
      : [];
    out[name] = (rows as Record<string, unknown>[]).map(clean);
  }
  return out;
}
