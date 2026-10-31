/**
 * V2-3 : profil « Moi » du parent (choix « Moi et mes enfants », ou « Mon espace » ajouté plus tard).
 * Un seul par compte (index unique partiel `profile_one_owner`) ; toujours un profil d'adulte, qui apprend comme
 * un adulte. Les profils d'enfants et le refus `adulte_compte_personnel` de `POST /profiles` sont inchangés : ce
 * refus n'est levé que par ici.
 */
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { schema as t, type Db } from '@awform/db';
import { ageFromYear } from './policy.js';
import { audit } from './service.js';
import { err, YEAR, type AuthKit } from './common.js';

export type ResultatMoi = { ok: true; id: string } | { ok: false; code: string };

export async function creerProfilMoi(
  db: Db,
  accountId: string,
  b: { birthYear: number; pseudonym?: string },
): Promise<ResultatMoi> {
  if (ageFromYear(b.birthYear) < 18) return { ok: false, code: 'majorite_requise' };
  const [deja] = await db
    .select({ id: t.profile.id })
    .from(t.profile)
    .where(and(eq(t.profile.ownerAccountId, accountId), eq(t.profile.isOwner, true)));
  if (deja) return { ok: false, code: 'profil_moi_existe' };
  try {
    const [p] = await db
      .insert(t.profile)
      .values({
        ownerAccountId: accountId,
        kind: 'adulte',
        isOwner: true,
        pseudonym: (b.pseudonym ?? '').trim() || 'Moi',
        birthYear: b.birthYear,
        avatar: 'lune',
      })
      .returning({ id: t.profile.id });
    if (!p) throw new Error('création du profil impossible');
    return { ok: true, id: p.id };
  } catch (e) {
    // deux demandes simultanées : l'index unique partiel tranche
    if ((e as { code?: string }).code === '23505' || /profile_one_owner/.test(String(e)))
      return { ok: false, code: 'profil_moi_existe' };
    throw e;
  }
}

export function registerProfilMoi(app: FastifyInstance, kit: AuthKit): void {
  const { db, needParent } = kit;
  app.post<{ Body: { birthYear: number; pseudonym?: string } }>(
    '/api/v1/profiles/moi',
    {
      preHandler: needParent,
      schema: {
        body: {
          type: 'object',
          required: ['birthYear'],
          additionalProperties: false,
          properties: {
            birthYear: YEAR,
            pseudonym: { type: 'string', minLength: 1, maxLength: 40 },
          },
        },
      },
    },
    async (req, reply) => {
      const r = await creerProfilMoi(db, req.auth!.accountId, req.body);
      if (!r.ok) return err(reply, r.code === 'profil_moi_existe' ? 409 : 400, r.code);
      await audit(db, req.auth!.accountId, 'profil.moi', r.id);
      return reply.code(201).send({ id: r.id });
    },
  );
}
