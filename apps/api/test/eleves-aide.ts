/** Outils communs aux tests de création d'élèves en lot (V2-5). */
import { cookieOf, PW, type Ctx } from './helpers.js';

export async function creerLot(
  c: Ctx,
  T: Record<string, string>,
  classId: string,
  eleves: Array<{ prenom: string; annee: number }>,
  extra: Record<string, unknown> = {},
) {
  return c.req('POST', `/api/v1/ecole/classes/${classId}/eleves/lot`, T, {
    eleves,
    accordParents: true,
    password: PW,
    ...extra,
  });
}

export async function connexion(c: Ctx, identifiant: string, motDePasse: string) {
  const r = await c.req(
    'POST',
    '/api/v1/auth/login',
    {},
    { email: identifiant, password: motDePasse },
  );
  return { r, E: { cookie: cookieOf(r) } };
}

/** nombre de requêtes SQL passées pendant `f` */
export async function compterRequetes(c: Ctx, f: () => Promise<unknown>): Promise<number> {
  const pool = c.h.pool as unknown as { query: (...a: unknown[]) => unknown };
  const orig = pool.query.bind(pool);
  let n = 0;
  pool.query = (...a: unknown[]) => {
    n++;
    return orig(...a);
  };
  try {
    await f();
  } finally {
    pool.query = orig;
  }
  return n;
}
