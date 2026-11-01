/**
 * V2-5 : l'enseignant crée les comptes de ses élèves en liste.
 *  - POST /ecole/classes/:id/eleves/lot : prénom + année de naissance, une ligne par élève. Identifiants `prénom-NNN`
 *    uniques, mots de passe de 8 caractères générés (renvoyés UNE SEULE FOIS, jamais gardés en clair). La case
 *    « Les parents de ces élèves ont donné leur accord à l'école » est obligatoire ; elle est enregistrée sur chaque
 *    profil comme preuve (école, date, enseignant).
 *  - POST /ecole/classes/:id/fiche.pdf : fiche de la classe (une étiquette par élève). POST et non GET : les mots de
 *    passe viennent du corps de la requête (jamais dans une adresse), le serveur ne les a plus.
 *  - POST /ecole/pupils/:pid/mot-de-passe : l'enseignant recrée un mot de passe (ou débloque).
 *  - GET /ecole/classes/:id/eleves/acces : identifiants des élèves (jamais de mot de passe) et lien WhatsApp.
 * Les élèves ont EXACTEMENT les protections de ceux d'un parent : `profile_login`, session limitée à leur profil
 * (liste fermée de routes, `enfant-login.ts`), verrou à la connexion. Gardes : second facteur de l'enseignant,
 * ressaisie de son mot de passe, plafond de créations par heure, plafond d'élèves par classe.
 */
import { randomInt } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, asc, eq, inArray, isNull, like, sql } from 'drizzle-orm';
import {
  creerElevesEnLot,
  PLAFOND_CLASSE,
  RefusCreation,
  verifierPlafondsLot,
  loginsPris,
  schema as t,
  schoolById,
  setProfileLevel,
  teacherClass,
  type Db,
} from '@awform/db';
import {
  genererMotDePasseEleve,
  LANGUES_MESSAGE,
  LOT_MAX,
  lienWhatsappParents,
  prenomValide,
  premierMot,
} from '@awform/school/eleves-lot';
import { hashSecret, verifySecret } from './auth/crypto.js';
import { emailKey } from './auth/common.js';
import { baseIdentifiant, LOGIN_ENFANT } from './auth/enfant-login.js';
import { checkPassword } from './auth/passwords.js';
import { ageFromYear, closedForAge } from './auth/policy.js';
import {
  audit,
  cleGlobaleIdentifiant,
  clearFailures,
  failAttempt,
  isTeacher,
  reserveAttempt,
} from './auth/service.js';
import { err, UUID } from './guards.js';
import { CaractereNonImprimable, ficheClassePdf, type Etiquette } from './pdf-fiche.js';

/** créations en liste par enseignant et par heure */
export const LOTS_PAR_HEURE = 10;

const LANGUE = { enum: [...LANGUES_MESSAGE] } as const;

/** Plus aucun identifiant libre pour ces prénoms (jamais une erreur 500 : l'API répond 409). */
export class IdentifiantsEpuises extends Error {
  constructor() {
    super('identifiants_epuises');
    this.name = 'IdentifiantsEpuises';
  }
}

/**
 * identifiants `prénom-NNN` distincts entre eux et libres en base : 3 chiffres, puis 4 si la place manque, puis 5
 * (la base du prénom est raccourcie pour rester à 24 caractères). Épuisés : `IdentifiantsEpuises`.
 */
export async function tirerIdentifiants(
  db: Db,
  prenoms: readonly string[],
  tirer: (min: number, max: number) => number = randomInt,
): Promise<string[]> {
  const choisis: string[] = new Array(prenoms.length).fill('');
  const pris = new Set<string>();
  for (let tour = 0; tour < 9; tour++) {
    const chiffres = tour < 3 ? 3 : tour < 6 ? 4 : 5;
    const candidats: string[] = [];
    prenoms.forEach((p, i) => {
      if (choisis[i]) return;
      const base = baseIdentifiant(p)
        .slice(0, 24 - 1 - chiffres)
        .replace(/-+$/g, '');
      for (let k = 0; k < 40; k++) {
        const c = `${base}-${tirer(10 ** (chiffres - 1), 10 ** chiffres)}`;
        if (!pris.has(c) && LOGIN_ENFANT.test(c)) {
          pris.add(c);
          candidats.push(c);
          choisis[i] = c;
          return;
        }
      }
    });
    const dejaPris = await loginsPris(db, candidats);
    if (!dejaPris.size && choisis.every((c) => c)) return choisis;
    // ceux qui existent déjà en base sont retirés et tirés de nouveau au tour suivant
    choisis.forEach((c, i) => {
      if (dejaPris.has(c)) choisis[i] = '';
    });
  }
  throw new IdentifiantsEpuises();
}

/** mot de passe de 8 caractères que la règle des familles accepte (jamais un mot de passe courant ni l'identifiant) */
export function motDePasseEleve(login: string, prenom: string): string {
  for (let i = 0; i < 50; i++) {
    const p = genererMotDePasseEleve((n) => randomInt(n));
    if (!checkPassword(p, '', { identifiants: [login, prenom] })) return p;
  }
  throw new Error('mot_de_passe_impossible');
}

/** au plus N tâches à la fois (file d'attente) : Argon2id est coûteux en mémoire et en temps */
export class Semaphore {
  private libres: number;
  private file: Array<() => void> = [];
  constructor(n: number) {
    this.libres = n;
  }
  async run<T>(tache: () => Promise<T>): Promise<T> {
    if (this.libres > 0) this.libres--;
    else await new Promise<void>((ok) => this.file.push(ok));
    try {
      return await tache();
    } finally {
      const suivant = this.file.shift();
      if (suivant) suivant();
      else this.libres++;
    }
  }
}
/** empreintes de TOUS les lots en cours : 2 à la fois au plus, quel que soit le nombre d'enseignants qui créent */
export const argonGlobal = new Semaphore(2);

async function empreintes(mdps: readonly string[]): Promise<string[]> {
  return Promise.all(mdps.map((m) => argonGlobal.run(() => hashSecret(m))));
}

/** code PostgreSQL d'une erreur (drizzle l'enveloppe : le code est dans `cause`) */
export const codePg = (e: unknown): string | undefined =>
  (e as { cause?: { code?: string }; code?: string })?.cause?.code ??
  (e as { code?: string })?.code;

function refus(reply: FastifyReply, e: unknown, classId: string) {
  if (!(e instanceof RefusCreation)) throw e;
  void classId;
  if (e.code === 'trop_de_demandes') return err(reply, 429, e.code);
  if (e.code === 'lot_deja_cree') return err(reply, 409, e.code);
  return err(reply, 400, e.code, { max: PLAFOND_CLASSE });
}

export function registerEcoleEleves(app: FastifyInstance, db: Db): void {
  const me = (req: FastifyRequest) => req.auth!.accountId;
  const idParams = (...keys: string[]) => ({
    params: {
      type: 'object',
      required: keys,
      properties: Object.fromEntries(keys.map((k) => [k, UUID])),
    },
  });

  /** enseignant ou direction (pas le secrétariat : il ne crée pas de comptes), second facteur vérifié */
  const needTeacher = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return err(reply, 401, 'non_connecte');
    if (!isTeacher(req.auth)) return err(reply, 403, 'reserve_aux_enseignants');
    if (!req.auth.mfaVerified)
      return err(reply, 403, req.auth.totpEnabled ? 'totp_requis' : 'mfa_a_configurer');
  };
  const pre = { preHandler: needTeacher };

  /** ressaisie du mot de passe de l'enseignant (essais réservés, verrou) ; false si le refus est envoyé */
  const ressaisie = async (req: FastifyRequest, reply: FastifyReply, donne?: string) => {
    if (!donne) {
      void err(reply, 400, 'mot_de_passe_requis');
      return false;
    }
    const [a] = await db
      .select()
      .from(t.account)
      .where(eq(t.account.id, me(req)));
    const key = `mdp:${me(req)}`;
    if (!a || !(await reserveAttempt(db, key, 10))) {
      void err(reply, 429, 'verrouille');
      return false;
    }
    if (!(await verifySecret(donne, a.passwordHash))) {
      await failAttempt(db, key, 10);
      void err(reply, 401, 'mot_de_passe_incorrect');
      return false;
    }
    await clearFailures(db, key);
    return true;
  };

  /**
   * Comptes qui peuvent avoir créé un identifiant au nom de l'école : son personnel (membres, enseignants de ses classes).
   * Un identifiant créé par un parent (enfant venu de la famille, rattaché à la classe) n'est JAMAIS vu ni modifié
   * par l'école.
   */
  const personnelEcole = async (schoolId: string, moi: string) => {
    const r = await db.execute<{ a: string }>(sql`
      SELECT account_id AS a FROM school_member WHERE school_id = ${schoolId}::uuid
      UNION SELECT ct.account_id FROM class_teacher ct JOIN class_group cg ON cg.id = ct.class_id
        WHERE cg.school_id = ${schoolId}::uuid`);
    return new Set<string>([moi, ...r.rows.map((x) => x.a)]);
  };
  /** L'école gère-t-elle cet identifiant ? Profil dont le compte technique de l'école est titulaire ET identifiant créé par son personnel. */
  const geree = (
    ligne: { owner: string | null; creePar: string | null },
    compteEcole: string | null,
    personnel: Set<string>,
  ) =>
    !!compteEcole && ligne.owner === compteEcole && !!ligne.creePar && personnel.has(ligne.creePar);

  const nomEcole = async (cls: { schoolId: string; schoolName: string | null }) =>
    cls.schoolName || (await schoolById(db, cls.schoolId))?.name || null;

  // ---------------------------------------------------------------- création en lot

  app.post<{
    Params: { id: string };
    Body: {
      eleves: Array<{ prenom: string; annee: number }>;
      accordParents: boolean;
      password: string;
      langue?: string;
      cle?: string;
    };
  }>(
    '/api/v1/ecole/classes/:id/eleves/lot',
    {
      ...pre,
      schema: {
        ...idParams('id'),
        body: {
          type: 'object',
          required: ['eleves', 'accordParents', 'password'],
          additionalProperties: false,
          properties: {
            eleves: {
              type: 'array',
              minItems: 1,
              maxItems: LOT_MAX,
              items: {
                type: 'object',
                required: ['prenom', 'annee'],
                additionalProperties: false,
                properties: {
                  prenom: { type: 'string', minLength: 1, maxLength: 60 },
                  annee: { type: 'integer', minimum: 1900, maximum: 2200 },
                },
              },
            },
            accordParents: { type: 'boolean' },
            password: { type: 'string', maxLength: 512 },
            langue: LANGUE,
            cle: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (req, reply) => {
      // un enseignant d'une AUTRE classe n'apprend même pas qu'elle existe
      const cls = await teacherClass(db, me(req), req.params.id);
      if (!cls || cls.status !== 'active') return err(reply, 404, 'introuvable');
      if (req.body.accordParents !== true) return err(reply, 400, 'accord_ecole_requis');
      if (!(await ressaisie(req, reply, req.body.password))) return reply;

      const ecole = await schoolById(db, cls.schoolId);
      const lignes: Array<{ ligne: number; code: string }> = [];
      // seul le PREMIER MOT est gardé (identifiant, pseudonyme, registre) : jamais de nom de famille
      const eleves = req.body.eleves.map((e) => ({ prenom: premierMot(e.prenom), annee: e.annee }));
      eleves.forEach((e, i) => {
        const age = ageFromYear(e.annee);
        if (!prenomValide(e.prenom)) lignes.push({ ligne: i + 1, code: 'prenom_invalide' });
        else if (age < 3) lignes.push({ ligne: i + 1, code: 'annee_naissance_invalide' });
        // un élève de l'école est un mineur (un adulte ouvre son propre compte)
        else if (age >= 18) lignes.push({ ligne: i + 1, code: 'adulte_compte_personnel' });
        else if (closedForAge(ecole?.country, age))
          lignes.push({ ligne: i + 1, code: 'ferme_moins_13' });
      });
      if (lignes.length) return err(reply, 400, 'lignes_invalides', { lignes });
      // pré-contrôle (lecture) avant le calcul des empreintes ; refait sous verrou dans la transaction
      try {
        await verifierPlafondsLot(db, {
          teacherAccountId: me(req),
          classId: cls.id,
          nombre: eleves.length,
          cle: req.body.cle,
        });
      } catch (e) {
        return refus(reply, e, cls.id);
      }

      let res: Awaited<ReturnType<typeof creerElevesEnLot>> | null = null;
      let mdps: string[] = [];
      let logins: string[] = [];
      for (let essai = 0; essai < 3 && !res; essai++) {
        try {
          logins = await tirerIdentifiants(
            db,
            eleves.map((e) => e.prenom),
          );
        } catch (e) {
          if (e instanceof IdentifiantsEpuises) return err(reply, 409, 'identifiant_indisponible');
          throw e;
        }
        mdps = eleves.map((e, i) => motDePasseEleve(logins[i]!, e.prenom));
        const hashes = await empreintes(mdps);
        try {
          res = await creerElevesEnLot(db, {
            classId: cls.id,
            schoolId: cls.schoolId,
            schoolName: ecole?.name ?? null,
            levelCode: cls.levelCode ?? null,
            teacherAccountId: me(req),
            cle: req.body.cle,
            eleves: eleves.map((e, i) => ({
              prenom: e.prenom,
              annee: e.annee,
              login: logins[i]!,
              passwordHash: hashes[i]!,
            })),
            // niveau des profils et journal : dans la même transaction (tout ou rien)
            apres: async (d, creation) => {
              if (cls.levelCode)
                for (const e of creation.eleves)
                  await setProfileLevel(d, e.profileId, cls.levelCode, 'inscription', me(req));
              await audit(d, me(req), 'ecole.eleves.lot', cls.id, {
                nombre: creation.eleves.length,
                lot: creation.lot,
              });
            },
          });
        } catch (e) {
          if (e instanceof RefusCreation) return refus(reply, e, cls.id);
          // deux créations simultanées du même identifiant : la contrainte d'unicité tranche, on recommence.
          // Toute autre erreur est remplacée par une erreur SANS paramètres (empreinte, prénom, année) : jamais journalisés.
          if (codePg(e) !== '23505')
            // eslint-disable-next-line preserve-caught-error -- la cause porte les paramètres de la requête (empreinte, prénom, année) : jamais journalisés
            throw new Error(`creation_lot_echouee:${codePg(e) ?? 'inconnue'}`);
        }
      }
      if (!res) return err(reply, 409, 'identifiant_indisponible');
      const nom = await nomEcole(cls);
      const langue = req.body.langue ?? 'fr';
      reply.header('cache-control', 'no-store');
      return reply.code(201).send({
        lot: res.lot,
        classe: { id: cls.id, name: cls.name },
        eleves: res.eleves.map((e, i) => ({
          profileId: e.profileId,
          pupilId: e.pupilId,
          prenom: e.prenom,
          annee: e.annee,
          identifiant: e.login,
          motDePasse: mdps[i],
          whatsapp: lienWhatsappParents(langue, { prenom: e.prenom, login: e.login, ecole: nom }),
        })),
      });
    },
  );

  // ---------------------------------------------------------------- fiche de la classe (PDF)

  app.post<{
    Params: { id: string };
    Body: { eleves: Array<{ pupilId: string; motDePasse: string }> };
  }>(
    '/api/v1/ecole/classes/:id/fiche.pdf',
    {
      ...pre,
      schema: {
        ...idParams('id'),
        body: {
          type: 'object',
          required: ['eleves'],
          additionalProperties: false,
          properties: {
            eleves: {
              type: 'array',
              minItems: 1,
              maxItems: LOT_MAX,
              items: {
                type: 'object',
                required: ['pupilId', 'motDePasse'],
                additionalProperties: false,
                properties: {
                  pupilId: UUID,
                  motDePasse: { type: 'string', minLength: 8, maxLength: 128 },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const cls = await teacherClass(db, me(req), req.params.id);
      if (!cls) return err(reply, 404, 'introuvable');
      const demandes = req.body.eleves;
      const rows = await db
        .select({
          pupilId: t.classPupil.id,
          prenom: t.classPupil.displayName,
          login: t.profileLogin.login,
          annee: t.profile.birthYear,
          owner: t.profile.ownerAccountId,
          creePar: t.profileLogin.createdByAccountId,
        })
        .from(t.classPupil)
        .innerJoin(t.profileLogin, eq(t.profileLogin.profileId, t.classPupil.profileId))
        .innerJoin(t.profile, eq(t.profile.id, t.classPupil.profileId))
        .where(
          and(
            eq(t.classPupil.classId, cls.id),
            isNull(t.classPupil.leftAt),
            inArray(
              t.classPupil.id,
              demandes.map((d) => d.pupilId),
            ),
          ),
        );
      const compteEcole = (await schoolById(db, cls.schoolId))?.accountId ?? null;
      const personnel = await personnelEcole(cls.schoolId, me(req));
      // seuls les identifiants créés par l'école pour ses élèves s'impriment (jamais ceux d'un parent)
      const parId = new Map(
        rows.filter((r) => geree(r, compteEcole, personnel)).map((r) => [r.pupilId, r]),
      );
      // un seul élève étranger à la classe (ou sans identifiant, ou géré par un parent) : rien n'est fabriqué
      if (demandes.some((d) => !parId.has(d.pupilId))) return err(reply, 404, 'introuvable');
      const etiquettes: Etiquette[] = demandes.map((d) => ({
        prenom: parId.get(d.pupilId)!.prenom,
        annee: parId.get(d.pupilId)!.annee,
        login: parId.get(d.pupilId)!.login,
        motDePasse: d.motDePasse,
      }));
      await audit(db, me(req), 'ecole.fiche.pdf', cls.id, { nombre: etiquettes.length });
      let pdf: Buffer;
      try {
        pdf = ficheClassePdf({
          ecole: await nomEcole(cls),
          classe: cls.name,
          date: new Date().toISOString().slice(0, 10),
          etiquettes,
        });
      } catch (e) {
        // un caractère sans forme dans la police : aucune fiche (jamais un « ? » imprimé à la place d'un prénom)
        if (e instanceof CaractereNonImprimable) return err(reply, 422, 'fiche_non_imprimable');
        throw e;
      }
      return reply
        .header('content-type', 'application/pdf')
        .header('cache-control', 'no-store')
        .header('content-disposition', 'attachment; filename="fiche-classe.pdf"')
        .send(pdf);
    },
  );

  // ---------------------------------------------------------------- identifiants de la classe

  app.get<{ Params: { id: string }; Querystring: { langue?: string } }>(
    '/api/v1/ecole/classes/:id/eleves/acces',
    {
      ...pre,
      schema: {
        ...idParams('id'),
        querystring: { type: 'object', properties: { langue: LANGUE } },
      },
    },
    async (req, reply) => {
      const cls = await teacherClass(db, me(req), req.params.id);
      if (!cls) return err(reply, 404, 'introuvable');
      const rows = await db
        .select({
          pupilId: t.classPupil.id,
          prenom: t.classPupil.displayName,
          profileId: t.classPupil.profileId,
          login: t.profileLogin.login,
          owner: t.profile.ownerAccountId,
          creePar: t.profileLogin.createdByAccountId,
        })
        .from(t.classPupil)
        .leftJoin(t.profileLogin, eq(t.profileLogin.profileId, t.classPupil.profileId))
        .leftJoin(t.profile, eq(t.profile.id, t.classPupil.profileId))
        .where(and(eq(t.classPupil.classId, cls.id), isNull(t.classPupil.leftAt)))
        .orderBy(asc(t.classPupil.displayName), asc(t.classPupil.id));
      const nom = await nomEcole(cls);
      const langue = req.query.langue ?? 'fr';
      const compteEcole = (await schoolById(db, cls.schoolId))?.accountId ?? null;
      const personnel = await personnelEcole(cls.schoolId, me(req));
      reply.header('cache-control', 'no-store');
      return {
        eleves: rows.map((r) => {
          // l'identifiant d'un enfant venu d'un parent n'est pas montré à l'école
          const login = r.login && geree(r, compteEcole, personnel) ? r.login : null;
          return {
            pupilId: r.pupilId,
            prenom: r.prenom,
            identifiant: login,
            whatsapp: login
              ? lienWhatsappParents(langue, { prenom: r.prenom, login, ecole: nom })
              : null,
          };
        }),
      };
    },
  );

  // ---------------------------------------------------------------- nouveau mot de passe, déblocage

  app.post<{
    Params: { pid: string };
    Body: { password: string; debloquer?: boolean };
  }>(
    '/api/v1/ecole/pupils/:pid/mot-de-passe',
    {
      ...pre,
      schema: {
        ...idParams('pid'),
        body: {
          type: 'object',
          required: ['password'],
          additionalProperties: false,
          properties: {
            password: { type: 'string', maxLength: 512 },
            debloquer: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const [pu] = await db.select().from(t.classPupil).where(eq(t.classPupil.id, req.params.pid));
      const cls = pu ? await teacherClass(db, me(req), pu.classId) : null;
      if (!pu || !cls || pu.leftAt || !pu.profileId) return err(reply, 404, 'introuvable');
      // seulement un élève dont l'école reste responsable (sinon, c'est le parent qui donne l'accès)
      const [gere] = await db
        .select({ id: t.profileCustodian.id })
        .from(t.profileCustodian)
        .where(
          and(
            eq(t.profileCustodian.profileId, pu.profileId),
            eq(t.profileCustodian.schoolId, cls.schoolId),
            eq(t.profileCustodian.nature, 'ecole'),
            eq(t.profileCustodian.status, 'actif'),
          ),
        );
      if (!gere) return err(reply, 409, 'profil_non_gere_par_l_ecole');
      const [lg] = await db
        .select()
        .from(t.profileLogin)
        .where(eq(t.profileLogin.profileId, pu.profileId));
      if (!lg) return err(reply, 404, 'introuvable');
      if (!(await ressaisie(req, reply, req.body.password))) return reply;
      const ek = emailKey(lg.login);
      reply.header('cache-control', 'no-store');
      // La recréation n'est permise que pour un profil dont le compte technique de l'école est TOUJOURS titulaire et
      // dont l'identifiant a été créé par son personnel. Rattaché à un parent, l'enfant est le sien : 409. Le
      // déblocage (levée de la pause) reste permis tant que l'école est responsable.
      if (!req.body.debloquer) {
        const [prof] = await db
          .select({ owner: t.profile.ownerAccountId })
          .from(t.profile)
          .where(eq(t.profile.id, pu.profileId));
        const compteEcole = (await schoolById(db, cls.schoolId))?.accountId ?? null;
        if (!prof || prof.owner !== compteEcole)
          return err(reply, 409, 'profil_rattache_a_un_parent');
        const personnel = await personnelEcole(cls.schoolId, me(req));
        if (!geree({ owner: prof.owner, creePar: lg.createdByAccountId }, compteEcole, personnel))
          return err(reply, 409, 'acces_non_gere_par_l_ecole');
      }
      if (req.body.debloquer) {
        await db
          .update(t.profileLogin)
          .set({ passwordChangedAt: new Date() })
          .where(eq(t.profileLogin.profileId, lg.profileId));
        await clearFailures(db, cleGlobaleIdentifiant(ek));
        await db.delete(t.authThrottle).where(like(t.authThrottle.key, `login:${ek}|%`));
        await audit(db, me(req), 'ecole.eleve.debloque', lg.profileId);
        return { ok: true, identifiant: lg.login };
      }
      const mdp = motDePasseEleve(lg.login, pu.displayName);
      await db
        .update(t.profileLogin)
        .set({ passwordHash: await hashSecret(mdp), passwordChangedAt: new Date() })
        .where(eq(t.profileLogin.profileId, lg.profileId));
      await clearFailures(db, cleGlobaleIdentifiant(ek));
      await db.delete(t.authThrottle).where(like(t.authThrottle.key, `login:${ek}|%`));
      // les sessions ouvertes de l'élève sont fermées
      await db
        .update(t.session)
        .set({ revokedAt: new Date() })
        .where(and(eq(t.session.profileId, lg.profileId), isNull(t.session.revokedAt)));
      await audit(db, me(req), 'ecole.eleve.mot_de_passe', lg.profileId);
      return {
        ok: true,
        pupilId: pu.id,
        prenom: pu.displayName,
        identifiant: lg.login,
        motDePasse: mdp,
      };
    },
  );
}
