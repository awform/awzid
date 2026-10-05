#!/usr/bin/env node
/**
 * Création d'un compte enseignant ou administrateur (pas d'inscription publique pour ces rôles) :
 *   node dist/cli/staff.js --kind enseignant --email prenom@ecole.example [--test]
 * Le mot de passe est lu dans la variable d'environnement AWFORM_STAFF_PASSWORD (jamais en argument,
 * jamais affiché). Le second facteur (TOTP) sera configuré à la première connexion, obligatoirement.
 *
 * Lot F1 : rôle « référent religieux » donné à un compte EXISTANT (file des signalements de contenu) :
 *   node dist/cli/staff.js --role referent --email referent@exemple.org [--retirer] [--test]
 * (second facteur exigé à l'usage ; aucun mot de passe demandé ici).
 *
 * Lot F2 (revue E2) : rôles de PLATEFORME portés en plus du type de compte — referent, moderateur, support,
 * admin — sur un compte existant (un parent peut ainsi être aussi modérateur). Les rôles d'école (direction,
 * enseignant, secrétariat) se donnent dans l'application, par la direction de l'école.
 */
import { and, eq } from 'drizzle-orm';
import { connect, grantRole, loadRootEnv, runMigrations, schema as t } from '@awform/db';
import { hashSecret } from '../auth/crypto.js';
import { checkPassword } from '../auth/passwords.js';

loadRootEnv();
const args = process.argv.slice(2);
const opt = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const kind = opt('--kind');
const role = opt('--role');
const email = (opt('--email') ?? '').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('--email invalide');

const h = connect(
  args.includes('--test') ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL,
  2,
);
try {
  await runMigrations(h.db);
  const [acc] = await h.db
    .select({ id: t.account.id })
    .from(t.account)
    .where(eq(t.account.email, email));
  if (role !== undefined) {
    const PLATFORM = ['referent', 'moderateur', 'support', 'admin'];
    if (!PLATFORM.includes(role)) throw new Error(`--role ${PLATFORM.join('|')}`);
    if (!acc) throw new Error('aucun compte avec cet e-mail');
    const retirer = args.includes('--retirer');
    if (retirer)
      await h.db
        .delete(t.accountRole)
        .where(and(eq(t.accountRole.accountId, acc.id), eq(t.accountRole.role, role)));
    else await grantRole(h.db, acc.id, role as 'referent' | 'moderateur' | 'support' | 'admin');
    await h.db.insert(t.auditLog).values({
      action: retirer ? 'compte.role_retire' : 'compte.role_attribue',
      target: acc.id,
      after: { role },
    });
    console.log(
      retirer
        ? `Rôle « ${role} » retiré.`
        : `Rôle « ${role} » attribué ; second facteur exigé pour les espaces de ce rôle.`,
    );
  } else {
    const password = process.env.AWFORM_STAFF_PASSWORD ?? '';
    if (kind !== 'enseignant' && kind !== 'admin') throw new Error('--kind enseignant|admin');
    const pb = checkPassword(password, email);
    if (pb) throw new Error(`AWFORM_STAFF_PASSWORD refusé : ${pb}`);
    if (acc) {
      console.log('Compte déjà existant (inchangé).');
    } else {
      await h.db.insert(t.account).values({
        kind,
        email,
        passwordHash: await hashSecret(password),
        passwordChangedAt: new Date(),
        country: 'FR',
      });
      await h.db
        .insert(t.auditLog)
        .values({ action: 'compte.creation_personnel', target: email, after: { kind } });
      console.log(`Compte ${kind} créé ; second facteur à configurer à la première connexion.`);
    }
  }
} finally {
  await h.close();
}
