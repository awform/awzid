/**
 * Politique des mots de passe (OWASP ASVS 5.0 V6.2, décision du client du 16/10/2026). La règle elle-même est dans
 * `@awform/school` (`mot-de-passe.ts`), partagée avec l'indicateur de l'application :
 *  - familles, adultes, ados, enfants (V2-1, 29/10/2026) : 8 caractères au moins, aucune exigence de complexité ;
 *    refus seulement des mots de passe courants (liste locale) et de ceux égaux à l'identifiant, à l'adresse ou au
 *    prénom ; les mots de passe existants restent valables ;
 *  - personnel (admin, enseignant, rôles de plateforme) : 12 caractères au moins, et second facteur (inchangé) ;
 *  - toujours : 128 caractères au plus.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { schema as t, type Db } from '@awform/db';
import {
  checkPassword as verifierMotDePasse,
  MDP_MAX,
  MDP_MIN_PHRASE,
  type OptionsMotDePasse,
  type ProblemeMotDePasse as PasswordProblem,
} from '@awform/school/mot-de-passe';
import { estMotDePasseCommun } from '@awform/school/liste-communs';
import { requiresMfa } from './policy.js';
import { STAFF_ROLES } from './service.js';

export type {
  ProblemeMotDePasse as PasswordProblem,
  OptionsMotDePasse,
} from '@awform/school/mot-de-passe';

/**
 * Contrôle du serveur : la règle partagée + la liste LOCALE des mots de passe courants (familles, adultes, ados,
 * enfants ; V2-1). Le personnel garde sa règle inchangée (12 caractères, second facteur).
 */
export function checkPassword(
  pw: string,
  email = '',
  opts: OptionsMotDePasse = {},
): PasswordProblem | null {
  return verifierMotDePasse(pw, email, {
    ...opts,
    estCommun: opts.personnel ? undefined : estMotDePasseCommun,
  });
}

/** Longueur minimale du PERSONNEL (et de la voie « phrase » des familles). */
export const MIN_LENGTH = MDP_MIN_PHRASE;
export const MAX_LENGTH = MDP_MAX;

/**
 * V2-1 : prénoms / pseudonymes des profils du compte, qu'un mot de passe ne doit pas égaler (avec l'adresse, que
 * `checkPassword` reçoit à part).
 */
export async function identifiantsDuCompte(
  db: Db,
  accountId: string | null | undefined,
): Promise<string[]> {
  if (!accountId) return [];
  const r = await db
    .select({ p: t.profile.pseudonym })
    .from(t.profile)
    .where(eq(t.profile.ownerAccountId, accountId));
  return r.map((x) => x.p).filter((x): x is string => !!x);
}

/** Compte du personnel : type enseignant ou admin, ou un rôle de personnel (règle de 12 caractères). */
export async function estPersonnel(db: Db, accountId: string | null | undefined): Promise<boolean> {
  if (!accountId) return false;
  const [a] = await db
    .select({ kind: t.account.kind })
    .from(t.account)
    .where(eq(t.account.id, accountId));
  if (a && requiresMfa(a.kind)) return true;
  const r = await db
    .select({ role: t.accountRole.role })
    .from(t.accountRole)
    .where(
      and(eq(t.accountRole.accountId, accountId), inArray(t.accountRole.role, [...STAFF_ROLES])),
    )
    .limit(1);
  return r.length > 0;
}
