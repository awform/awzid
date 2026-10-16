/**
 * Politique des mots de passe (OWASP ASVS 5.0 V6.2, décision du client du 16/10/2026). La règle elle-même est dans
 * `@awform/school` (`mot-de-passe.ts`), partagée avec l'indicateur de l'application :
 *  - familles et adultes : 12 caractères ou plus (une phrase), OU 8 caractères ou plus avec 3 types sur 4
 *    (minuscule, majuscule, chiffre, symbole) ;
 *  - personnel (admin, enseignant, rôles de plateforme) : 12 caractères au moins, et second facteur ;
 *  - toujours : 128 caractères au plus, ni mot de passe courant, ni adresse e-mail dedans.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { schema as t, type Db } from '@awform/db';
import { MDP_MAX, MDP_MIN_PHRASE } from '@awform/school/mot-de-passe';
import { requiresMfa } from './policy.js';
import { STAFF_ROLES } from './service.js';

export {
  checkPassword,
  type ProblemeMotDePasse as PasswordProblem,
  type OptionsMotDePasse,
} from '@awform/school/mot-de-passe';

/** Longueur minimale du PERSONNEL (et de la voie « phrase » des familles). */
export const MIN_LENGTH = MDP_MIN_PHRASE;
export const MAX_LENGTH = MDP_MAX;

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
