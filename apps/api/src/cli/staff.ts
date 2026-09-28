#!/usr/bin/env node
/**
 * Création d'un compte enseignant ou administrateur (pas d'inscription publique pour ces rôles) :
 *   node dist/cli/staff.js --kind enseignant --email prenom@ecole.example [--test]
 * Le mot de passe est lu dans la variable d'environnement AWFORM_STAFF_PASSWORD (jamais en argument,
 * jamais affiché). Le second facteur (TOTP) sera configuré à la première connexion, obligatoirement.
 */
import { eq } from 'drizzle-orm';
import { connect, loadRootEnv, runMigrations, schema as t } from '@awform/db';
import { hashSecret } from '../auth/crypto.js';
import { checkPassword } from '../auth/passwords.js';

loadRootEnv();
const args = process.argv.slice(2);
const opt = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const kind = opt('--kind');
const email = (opt('--email') ?? '').trim().toLowerCase();
const password = process.env.AWFORM_STAFF_PASSWORD ?? '';
if (kind !== 'enseignant' && kind !== 'admin') throw new Error('--kind enseignant|admin');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('--email invalide');
const pb = checkPassword(password, email);
if (pb) throw new Error(`AWFORM_STAFF_PASSWORD refusé : ${pb}`);

const h = connect(
  args.includes('--test') ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL,
  2,
);
try {
  await runMigrations(h.db);
  const exists = await h.db
    .select({ id: t.account.id })
    .from(t.account)
    .where(eq(t.account.email, email));
  if (exists[0]) {
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
} finally {
  await h.close();
}
