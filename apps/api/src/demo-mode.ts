/**
 * Connexion SIMPLIFIÉE de la démonstration (réseau local seulement, demande du client) :
 *  - identifiants courts `parent`, `enfant`, `ado`, `adulte`, `enseignant`, `admin`, même mot de passe court,
 *    sans code à 6 chiffres pour l'enseignant et l'administrateur ;
 *  - n'existe QUE si l'API démarre avec AWFORM_DEMO=1 (posé par `deploy.sh --demo`, retiré sans --demo :
 *    infra/prod/demo-env.sh) ET si la configuration est celle d'un réseau local (garde-fou ci-dessous) ;
 *  - ne vise que les comptes FICTIFS créés par `cli/demo.ts` (adresses `<rôle>-<tag>@demo.awform.test`) ;
 *  - en production (option absente), la connexion reste : e-mail + mot de passe + second facteur.
 */
import { timingSafeEqual } from 'node:crypto';
import { and, eq, isNull, like } from 'drizzle-orm';
import { schema as t, type Db } from '@awform/db';

export const DEMO_PASSWORD = 'awzid';
export const DEMO_DOMAIN = 'demo.awform.test';

type Kind = 'parent' | 'adulte' | 'enseignant' | 'admin';
/** identifiant court → compte fictif (rôle dans l'adresse, type de compte) et profil ouvert d'emblée */
const DEMO_IDS: Record<string, { role: string; kind: Kind; profile?: string }> = {
  parent: { role: 'parent', kind: 'parent' },
  enfant: { role: 'parent', kind: 'parent', profile: 'Lina' },
  ado: { role: 'parent', kind: 'parent', profile: 'Yanis' },
  adulte: { role: 'adulte', kind: 'adulte' },
  enseignant: { role: 'enseignant', kind: 'enseignant' },
  admin: { role: 'admin', kind: 'admin' },
};

const PRIVATE_HOST =
  /^(localhost|127(\.\d{1,3}){3}|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}|[a-z0-9-]+(\.[a-z0-9-]+)*\.(localhost|test|local|lan|home\.arpa))$/;

/**
 * Garde-fou au démarrage (AWFORM_DEMO=1) : renvoie la raison du refus, ou null.
 * Démonstration acceptée seulement si TOUTES les adresses servies (SITE, SITE_LAN) sont locales (IP privée,
 * localhost, .test, .local, .lan, .home.arpa), sans domaine de relais public, et hors mode production
 * (COOKIE_SECURE=1, posé par deploy.sh --production). L'API n'a par ailleurs aucun port publié
 * (compose.yml) : elle n'est joignable que par le Caddy de la démonstration.
 */
export function demoGuard(env: NodeJS.ProcessEnv): string | null {
  if (env.AWFORM_DEMO !== '1') return null;
  const sites = [env.SITE ?? '', env.SITE_LAN ?? ''].map((s) => s.trim().toLowerCase());
  if (!sites[0]) return 'SITE absent : impossible de vérifier que la démonstration reste locale';
  for (const s of sites.filter(Boolean))
    if (!PRIVATE_HOST.test(s)) return `adresse publique (${s}) : démonstration refusée`;
  if ((env.RELAIS_DOMAINE ?? '').trim()) return 'domaine de relais public configuré';
  if (env.COOKIE_SECURE === undefined || env.COOKIE_SECURE === '1')
    return 'mode production (COOKIE_SECURE=1) : démonstration refusée';
  return null;
}

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Compte fictif (et profil) visé par un identifiant court de démonstration, ou null. */
export async function demoLogin(
  db: Db,
  identifier: string,
  password: string,
): Promise<{ accountId: string; kind: Kind; profileId: string | null } | null> {
  const d = DEMO_IDS[identifier];
  if (!d || !sameText(password, DEMO_PASSWORD)) return null;
  const rows = await db
    .select({ id: t.account.id })
    .from(t.account)
    .where(
      and(
        like(t.account.email, `${d.role}-%@${DEMO_DOMAIN}`),
        eq(t.account.kind, d.kind),
        isNull(t.account.deletedAt),
      ),
    );
  if (rows.length !== 1) return null;
  const accountId = rows[0]!.id;
  let profileId: string | null = null;
  if (d.profile) {
    const [p] = await db
      .select({ id: t.profile.id })
      .from(t.profile)
      .where(and(eq(t.profile.ownerAccountId, accountId), eq(t.profile.pseudonym, d.profile)));
    if (!p) return null;
    profileId = p.id;
  }
  return { accountId, kind: d.kind, profileId };
}
