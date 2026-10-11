/**
 * Comptes de DÉMONSTRATION « un par niveau » (demande du client, 11/10/2026) : le client teste chaque niveau
 * des livres depuis le début du niveau, avec l'identifiant court et le mot de passe de démonstration (demo-mode.ts).
 *
 *  - adulte1 … adulte10 : filière Adultes (ad1–ad10), un compte adulte autonome chacun, mode serein ;
 *  - ado1 … ado4 : filière Ados (ado1–ado4), profils du compte parent « parent-niveaux » ;
 *  - enfant1 … enfant5 : filière Enfants (en1–en5), profils du même compte « parent-niveaux » (vérification
 *    « douce », décidée par le parent) ; connexion directe sur le profil, comme `enfant` (Lina) ;
 *  - religion (sciences) : re<N> pour un enfant, ra suivant TABLE_ADOS pour un ado, ra suivant TABLE_ADULTES pour un adulte
 *    (les livres de religion adultes n'ont que 4 niveaux pour 10 niveaux d'arabe). TABLE MODIFIABLE ICI SEULE ;
 *  - Coran (qc) : non posé, l'appli propose qc1 comme à tout élève ; le parcours Coran personnel et « Vivre
 *    l'islam » restent ouverts comme pour tout élève ;
 *  - début de niveau : niveau d'arabe et de religion posés (source « inscription ») ; les niveaux précédents sont
 *    « en révision » par la règle du parcours (accessFor), la leçon 1 est la prochaine leçon (aucune progression) ;
 *  - canal bêta : tous les comptes de démonstration (adresses *@demo.awform.test) sont inscrits au canal bêta
 *    (`inscrireDemoBeta`, table beta_member), pour voir les fonctions en bêta (« Je parle ») ; jamais un autre compte ;
 *  - une classe par filière (Adultes, Ados, Enfants) chez l'enseignant de démonstration, pour voir le suivi.
 *
 * N'existe QUE dans la démonstration : tout passe par `assertDemo` (AWFORM_DEMO=1, posé par `deploy.sh --demo`).
 * Idempotent : un compte existant n'est JAMAIS modifié (la progression du client est gardée) ; la remise au début
 * d'un niveau est une commande à part (cli/demo-reset-niveau.ts, infra/prod/demo-reset-niveau.sh).
 */
import { and, eq, isNull, like } from 'drizzle-orm';
import {
  createClass,
  currentLevels,
  schema as t,
  setProfileEvalMode,
  setBeta,
  setProfileLevel,
  type Db,
} from '@awform/db';
/** même domaine que demo-mode.ts (vérifié par test) ; pas d'import : demo-mode.ts lit ce module */
const DOMAIN = 'demo.awform.test';

export type Filiere = 'adultes' | 'ados' | 'enfants';

export interface DemoNiveau {
  /** identifiant court de connexion (mot de passe de démonstration) */
  id: string;
  filiere: Filiere;
  /** numéro du niveau dans la filière */
  n: number;
  /** niveau d'arabe (code du livre) */
  arabe: string;
  /** niveau de religion (sciences islamiques) */
  sciences: string;
  /** pseudonyme du profil (adulte : profil du compte ; ado, enfant : profil du compte parent-niveaux) */
  pseudonym: string;
  /** vrai : simple alias de connexion d'un profil du compte `parent` existant (ni compte ni profil créés) */
  alias?: boolean;
}

/** Source : programme/religion_ra_architecture.md l.68 : ra1 avec ad1-ad2 ou ado1, ra2 avec ad3-ad5 ou ado2-ado4, ra3 avec ad6-ad7, ra4 avec ad8-ad10. */
export const TABLE_ADOS: readonly number[] = [1, 2, 2, 2];

/** Religion ra des adultes N1-N10 (même source que TABLE_ADOS). */
export const TABLE_ADULTES: readonly number[] = [1, 1, 2, 2, 2, 3, 3, 4, 4, 4];

/**
 * Alias de connexion (demande du client) : `adulte1`, `ado1` et `enfant1` sont le niveau 1 des comptes de
 * démonstration EXISTANTS (Samir = ad1, compte `adulte` ; Yanis = ado1 et Lina = en1, compte `parent`) : même
 * compte, même progression, aucun doublon. Le semis ne leur pose un niveau QUE si la matière en est vide
 * (Samir n'en a pas à l'origine) et ne touche jamais à une progression.
 */
export const ALIAS_EXISTANTS: Readonly<Record<string, { role: string; pseudonym: string }>> = {
  adulte1: { role: 'adulte', pseudonym: 'Samir' },
  ado1: { role: 'parent', pseudonym: 'Yanis' },
  enfant1: { role: 'parent', pseudonym: 'Lina' },
};

const BRUT: readonly DemoNiveau[] = [
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `adulte${i + 1}`,
    filiere: 'adultes' as const,
    n: i + 1,
    arabe: `ad${i + 1}`,
    sciences: `ra${TABLE_ADULTES[i]}`,
    pseudonym: `Adulte ${i + 1}`,
  })),
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `ado${i + 1}`,
    filiere: 'ados' as const,
    n: i + 1,
    arabe: `ado${i + 1}`,
    sciences: `ra${TABLE_ADOS[i]}`,
    pseudonym: `Ado ${i + 1}`,
  })),
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `enfant${i + 1}`,
    filiere: 'enfants' as const,
    n: i + 1,
    arabe: `en${i + 1}`,
    sciences: `re${i + 1}`,
    pseudonym: `Enfant ${i + 1}`,
  })),
];

export const DEMO_NIVEAUX: readonly DemoNiveau[] = BRUT.map((n) =>
  ALIAS_EXISTANTS[n.id] ? { ...n, pseudonym: ALIAS_EXISTANTS[n.id]!.pseudonym, alias: true } : n,
);

/** Compte parent portant les profils ados et enfants (identifiant court et rôle dans l'adresse). */
export const PARENT_NIVEAUX_ID = 'parent-niveaux';
export const PARENT_NIVEAUX_ROLE = 'niveaux-parent';

/** Rôle (partie de l'adresse e-mail fictive) du compte d'un niveau. */
export const roleOf = (n: DemoNiveau): string =>
  ALIAS_EXISTANTS[n.id]
    ? ALIAS_EXISTANTS[n.id]!.role
    : n.filiere === 'adultes'
      ? `niveau-${n.id}`
      : PARENT_NIVEAUX_ROLE;

export const emailOf = (role: string, tag: string): string => `${role}-${tag}@${DOMAIN}`;

export const CLASSES: Record<Filiere, string> = {
  adultes: 'Démonstration — Adultes (N1 à N10)',
  ados: 'Démonstration — Ados (1 à 4)',
  enfants: 'Démonstration — Enfants (E1 à E5)',
};

/** Réglage par défaut selon l'âge : adulte « serein » (qu'il décide), mineurs « douce » (décidée par le parent). */
export const evalModeOf = (f: Filiere) =>
  f === 'adultes'
    ? ({ mode: 'serein', decider: 'soi' } as const)
    : ({ mode: 'douce', decider: 'parent' } as const);

/** Garde-fou : refusé hors instance de démonstration (jamais sur une base de production). */
export function assertDemo(env: NodeJS.ProcessEnv): void {
  if (env.AWFORM_DEMO !== '1') throw new Error('AWFORM_DEMO=1 requis (instance de démonstration)');
}

/** Appel d'une route de l'API (réponse JSON), fourni par le script appelant. */
export type Call = (
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  cookie?: string,
  payload?: object,
) => Promise<{ json(): unknown; headers: Record<string, unknown> }>;

export interface SeedDeps {
  db: Db;
  call: Call;
  cookieOf: (r: { headers: Record<string, unknown> }) => string;
  env: NodeJS.ProcessEnv;
  /** mot de passe long de la machine (e-mail + mot de passe) et code parent de la démonstration */
  password: string;
  pin: string;
  tag: string;
  teacherEmail: string;
}

interface Me {
  profiles: Array<{ id: string; pseudonym: string }>;
  accordsManquants?: Array<{ type: string; profileId: string | null }>;
}

/** Remet un profil au DÉBUT de son niveau (niveaux d'arabe et de religion, réglage d'évaluation). */
export async function placeAtStart(db: Db, profileId: string, n: DemoNiveau, by: string | null) {
  await setProfileLevel(db, profileId, n.arabe, 'inscription', by);
  await setProfileLevel(db, profileId, n.sciences, 'inscription', by);
  const e = evalModeOf(n.filiere);
  await setProfileEvalMode(db, profileId, e.mode, e.decider, by);
}

/**
 * Crée (si absents) les comptes de niveau, leurs profils et les trois classes de l'enseignant de
 * démonstration. Renvoie la liste des identifiants créés pendant CETTE exécution.
 */
export async function seedNiveaux(d: SeedDeps): Promise<{ crees: string[]; absents: string[] }> {
  assertDemo(d.env);
  const { db, call, tag } = d;
  const year = new Date().getFullYear();
  const crees: string[] = [];
  // livres pas encore importés sur cette machine : le compte du niveau est créé à une exécution ulterieure
  const known = new Set((await db.select({ c: t.level.code }).from(t.level)).map((l) => l.c));
  const absents = DEMO_NIVEAUX.filter((n) => !n.alias && !known.has(n.arabe)).map((n) => n.id);
  const niveaux = DEMO_NIVEAUX.filter((n) => n.alias || known.has(n.arabe));
  const accountByEmail = async (email: string) =>
    (
      await db
        .select({ id: t.account.id })
        .from(t.account)
        .where(and(eq(t.account.email, email), isNull(t.account.deletedAt)))
    )[0] ?? null;
  const login = async (email: string) =>
    d.cookieOf(await call('POST', '/api/v1/auth/login', '', { email, password: d.password }));
  const meOf = async (cookie: string) =>
    (await call('GET', '/api/v1/auth/me', cookie)).json() as Me;

  // ---- compte parent des profils ados et enfants
  const parentEmail = emailOf(PARENT_NIVEAUX_ROLE, tag);
  let parentCookie: string;
  if (!(await accountByEmail(parentEmail))) {
    parentCookie = d.cookieOf(
      await call('POST', '/api/v1/auth/signup', '', {
        kind: 'parent',
        birthYear: 1985,
        email: parentEmail,
        password: d.password,
        country: 'FR',
        consents: ['cgu', 'donnee_religieuse_art9'],
      }),
    );
    await call('POST', '/api/v1/account/pin', parentCookie, { pin: d.pin, password: d.password });
    crees.push(PARENT_NIVEAUX_ID);
  } else parentCookie = await login(parentEmail);
  const parentMe = await meOf(parentCookie);
  const profileIds = new Map<string, string>();
  // alias : adulte1 = Samir, ado1 = Yanis, enfant1 = Lina (comptes existants) ; ni compte ni profil créés, et un
  // niveau n'est posé QUE si la matière n'en a pas (jamais de changement de niveau ni de progression)
  const aliasCookies = new Map<string, string>();
  for (const n of DEMO_NIVEAUX.filter((x) => x.alias)) {
    const role = ALIAS_EXISTANTS[n.id]!.role;
    const email = emailOf(role, tag);
    if (!(await accountByEmail(email))) continue;
    if (!aliasCookies.has(role)) aliasCookies.set(role, await login(email));
    const p = (await meOf(aliasCookies.get(role)!)).profiles.find(
      (x) => x.pseudonym === n.pseudonym,
    );
    if (!p) continue;
    profileIds.set(n.id, p.id);
    const cur = await currentLevels(db, p.id);
    for (const [subject, code] of [
      ['arabe', n.arabe],
      ['sciences', n.sciences],
    ] as const)
      if (known.has(code) && !cur.some((c) => c.subject === subject))
        await setProfileLevel(db, p.id, code, 'inscription');
  }
  for (const n of niveaux.filter((x) => x.filiere !== 'adultes' && !x.alias)) {
    let p = parentMe.profiles.find((x) => x.pseudonym === n.pseudonym);
    if (!p) {
      const age = n.filiere === 'enfants' ? 6 + n.n : 12 + n.n;
      const r = await call('POST', '/api/v1/profiles', parentCookie, {
        pseudonym: n.pseudonym,
        avatar: ['etoile', 'soleil', 'lune'][n.n % 3],
        birthYear: year - 1 - age,
        levelCode: n.arabe,
        password: d.password,
        consents: ['compte_suivi', 'donnee_religieuse_art9'],
      });
      p = { id: (r.json() as { id: string }).id, pseudonym: n.pseudonym };
      const [owner] = await db
        .select({ id: t.account.id })
        .from(t.account)
        .where(eq(t.account.email, parentEmail));
      await placeAtStart(db, p.id, n, owner?.id ?? null);
      crees.push(n.id);
    }
    profileIds.set(n.id, p.id);
  }

  // ---- adultes autonomes (un compte par niveau)
  const cookies = new Map<string, string>();
  for (const n of niveaux.filter((x) => x.filiere === 'adultes' && !x.alias)) {
    const email = emailOf(roleOf(n), tag);
    if (!(await accountByEmail(email))) {
      const r = await call('POST', '/api/v1/auth/signup', '', {
        kind: 'adulte',
        email,
        password: d.password,
        country: 'FR',
        birthYear: 1990,
        pseudonym: n.pseudonym,
        evalMode: 'serein',
        consents: ['cgu', 'donnee_religieuse_art9'],
      });
      const me = r.json() as Me;
      const [owner] = await db
        .select({ id: t.account.id })
        .from(t.account)
        .where(eq(t.account.email, email));
      await placeAtStart(db, me.profiles[0]!.id, n, owner?.id ?? null);
      cookies.set(n.id, d.cookieOf(r));
      profileIds.set(n.id, me.profiles[0]!.id);
      crees.push(n.id);
    } else {
      const c = await login(email);
      cookies.set(n.id, c);
      profileIds.set(n.id, (await meOf(c)).profiles[0]!.id);
    }
  }

  // ---- accord « article 9 » des comptes de niveau (idempotent : seulement ce qui manque)
  const accords = async (cookie: string) => {
    const m = await meOf(cookie);
    if (m.accordsManquants?.length)
      await call('POST', '/api/v1/account/accords', cookie, {
        password: d.password,
        accords: m.accordsManquants.map((x) => ({ type: x.type, profileId: x.profileId })),
      });
  };
  await accords(parentCookie);
  for (const c of cookies.values()) await accords(c);

  // ---- une classe par filière chez l'enseignant de démonstration (suivi par niveau)
  const [teacher] = await db
    .select({ id: t.account.id })
    .from(t.account)
    .where(eq(t.account.email, d.teacherEmail));
  if (teacher) {
    for (const f of Object.keys(CLASSES) as Filiere[]) {
      const name = CLASSES[f];
      let [cls] = await db
        .select({ id: t.classGroup.id, joinCode: t.classGroup.joinCode })
        .from(t.classGroup)
        .where(and(eq(t.classGroup.teacherAccountId, teacher.id), eq(t.classGroup.name, name)));
      if (!cls) {
        const c = await createClass(db, teacher.id, name);
        cls = { id: c.id, joinCode: c.joinCode };
      }
      for (const n of niveaux.filter((x) => x.filiere === f)) {
        const pid = profileIds.get(n.id);
        if (!pid) continue;
        const [m] = await db
          .select({ p: t.classMember.profileId })
          .from(t.classMember)
          .where(and(eq(t.classMember.classId, cls.id), eq(t.classMember.profileId, pid)));
        if (m) continue;
        const cookie = n.alias
          ? aliasCookies.get(ALIAS_EXISTANTS[n.id]!.role)!
          : f === 'adultes'
            ? cookies.get(n.id)!
            : parentCookie;
        await call('POST', `/api/v1/profiles/${pid}/classes`, cookie, {
          code: cls.joinCode,
          consent: true,
        });
      }
    }
  }
  return { crees, absents };
}

/**
 * Inscrit au canal bêta (table `beta_member`, par le compte) TOUS les comptes de démonstration existants :
 * adresses `*@demo.awform.test` seulement (comptes d'origine et comptes par niveau), jamais un autre compte.
 * Idempotent : un compte déjà inscrit n'est pas touché (aucun doublon). `added_by` = le compte admin de
 * démonstration s'il existe. Refusé hors instance de démonstration (assertDemo, avant tout accès).
 */
export async function inscrireDemoBeta(
  db: Db,
  env: NodeJS.ProcessEnv,
  adminEmail: string,
): Promise<{ inscrits: number; total: number }> {
  assertDemo(env);
  const suffix = `@${DOMAIN}`;
  const comptes = (
    await db
      .select({ id: t.account.id, email: t.account.email })
      .from(t.account)
      .where(and(isNull(t.account.deletedAt), like(t.account.email, `%${suffix}`)))
  ).filter((a) => a.email?.toLowerCase().endsWith(suffix));
  const admin = comptes.find((a) => a.email === adminEmail);
  const deja = new Set(
    (await db.select({ a: t.betaMember.accountId }).from(t.betaMember)).map((m) => m.a),
  );
  let inscrits = 0;
  for (const a of comptes) {
    if (deja.has(a.id)) continue;
    await setBeta(db, { type: 'compte', id: a.id }, true, admin?.id ?? null);
    inscrits++;
  }
  return { inscrits, total: comptes.length };
}
