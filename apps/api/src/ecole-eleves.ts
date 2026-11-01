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
import { and, asc, eq, inArray, isNull, like } from 'drizzle-orm';
import {
  creerElevesEnLot,
  elevesAvecIdentifiant,
  loginsPris,
  schema as t,
  schoolById,
  setProfileLevel,
  teacherClass,
  type Db,
} from '@awform/db';
import {
  CLASSE_MAX,
  genererMotDePasseEleve,
  LANGUES_MESSAGE,
  LOT_MAX,
  lienWhatsappParents,
  prenomValide,
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
import { ficheClassePdf, type Etiquette } from './pdf-fiche.js';

/** créations en liste par enseignant et par heure */
export const LOTS_PAR_HEURE = 10;

const LANGUE = { enum: [...LANGUES_MESSAGE] } as const;

/** identifiants `prénom-NNN` distincts entre eux et libres en base (3 chiffres, puis 4 si la place manque) */
export async function tirerIdentifiants(
  db: Db,
  prenoms: readonly string[],
  tirer: (min: number, max: number) => number = randomInt,
): Promise<string[]> {
  const choisis: string[] = new Array(prenoms.length).fill('');
  const pris = new Set<string>();
  for (let tour = 0; tour < 8; tour++) {
    const quatre = tour >= 3;
    const candidats: string[] = [];
    prenoms.forEach((p, i) => {
      if (choisis[i]) return;
      const base = baseIdentifiant(p)
        .slice(0, quatre ? 19 : 20)
        .replace(/-+$/g, '');
      for (let k = 0; k < 40; k++) {
        const c = quatre ? `${base}-${tirer(1000, 10_000)}` : `${base}-${tirer(100, 1000)}`;
        if (!pris.has(c) && LOGIN_ENFANT.test(c)) {
          pris.add(c);
          candidats.push(c);
          choisis[i] = c;
          return;
        }
      }
    });
    const dejaPris = await loginsPris(db, candidats);
    if (!dejaPris.size) break;
    // ceux qui existent déjà en base sont retirés et retirés au sort au tour suivant
    choisis.forEach((c, i) => {
      if (dejaPris.has(c)) choisis[i] = '';
    });
  }
  if (choisis.some((c) => !c)) throw new Error('identifiants_epuises');
  return choisis;
}

/** mot de passe de 8 caractères que la règle des familles accepte (jamais un mot de passe courant ni l'identifiant) */
export function motDePasseEleve(login: string, prenom: string): string {
  for (let i = 0; i < 50; i++) {
    const p = genererMotDePasseEleve((n) => randomInt(n));
    if (!checkPassword(p, '', { identifiants: [login, prenom] })) return p;
  }
  throw new Error('mot_de_passe_impossible');
}

/** empreintes calculées par petits groupes (Argon2id est coûteux) */
async function empreintes(mdps: readonly string[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < mdps.length; i += 8)
    out.push(...(await Promise.all(mdps.slice(i, i + 8).map((m) => hashSecret(m)))));
  return out;
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
          },
        },
      },
    },
    async (req, reply) => {
      // un enseignant d'une AUTRE classe n'apprend même pas qu'elle existe
      const cls = await teacherClass(db, me(req), req.params.id);
      if (!cls || cls.status !== 'active') return err(reply, 404, 'introuvable');
      if (req.body.accordParents !== true) return err(reply, 400, 'accord_ecole_requis');
      if (!(await reserveAttempt(db, `lot:${me(req)}`, LOTS_PAR_HEURE, 60))) {
        await audit(db, me(req), 'ecole.eleves.lot_limite', cls.id);
        return err(reply, 429, 'trop_de_demandes');
      }
      if (!(await ressaisie(req, reply, req.body.password))) return reply;

      const ecole = await schoolById(db, cls.schoolId);
      const lignes: Array<{ ligne: number; code: string }> = [];
      const eleves = req.body.eleves.map((e) => ({ prenom: e.prenom.trim(), annee: e.annee }));
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
      if ((await elevesAvecIdentifiant(db, cls.id)) + eleves.length > CLASSE_MAX)
        return err(reply, 400, 'classe_pleine', { max: CLASSE_MAX });

      let res: Awaited<ReturnType<typeof creerElevesEnLot>> | null = null;
      let mdps: string[] = [];
      let logins: string[] = [];
      for (let essai = 0; essai < 3 && !res; essai++) {
        logins = await tirerIdentifiants(
          db,
          eleves.map((e) => e.prenom),
        );
        mdps = eleves.map((e, i) => motDePasseEleve(logins[i]!, e.prenom));
        const hashes = await empreintes(mdps);
        try {
          res = await creerElevesEnLot(db, {
            classId: cls.id,
            schoolId: cls.schoolId,
            schoolName: ecole?.name ?? null,
            levelCode: cls.levelCode ?? null,
            teacherAccountId: me(req),
            eleves: eleves.map((e, i) => ({
              prenom: e.prenom,
              annee: e.annee,
              login: logins[i]!,
              passwordHash: hashes[i]!,
            })),
          });
        } catch (e) {
          // deux créations simultanées du même identifiant : la contrainte d'unicité tranche, on recommence
          if (
            (e as { code?: string }).code !== '23505' &&
            !/profile_login_login_unique/.test(String(e))
          )
            throw e;
        }
      }
      if (!res) return err(reply, 409, 'identifiant_indisponible');
      if (cls.levelCode)
        for (const e of res.eleves)
          await setProfileLevel(db, e.profileId, cls.levelCode, 'inscription', me(req));
      await audit(db, me(req), 'ecole.eleves.lot', cls.id, {
        nombre: res.eleves.length,
        lot: res.lot,
      });
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
        })
        .from(t.classPupil)
        .innerJoin(t.profileLogin, eq(t.profileLogin.profileId, t.classPupil.profileId))
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
      const parId = new Map(rows.map((r) => [r.pupilId, r]));
      // un seul élève étranger à la classe (ou sans identifiant) : rien n'est fabriqué
      if (demandes.some((d) => !parId.has(d.pupilId))) return err(reply, 404, 'introuvable');
      const etiquettes: Etiquette[] = demandes.map((d) => ({
        prenom: parId.get(d.pupilId)!.prenom,
        login: parId.get(d.pupilId)!.login,
        motDePasse: d.motDePasse,
      }));
      await audit(db, me(req), 'ecole.fiche.pdf', cls.id, { nombre: etiquettes.length });
      const pdf = ficheClassePdf({
        ecole: await nomEcole(cls),
        classe: cls.name,
        date: new Date().toISOString().slice(0, 10),
        etiquettes,
      });
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
        })
        .from(t.classPupil)
        .leftJoin(t.profileLogin, eq(t.profileLogin.profileId, t.classPupil.profileId))
        .where(and(eq(t.classPupil.classId, cls.id), isNull(t.classPupil.leftAt)))
        .orderBy(asc(t.classPupil.displayName), asc(t.classPupil.id));
      const nom = await nomEcole(cls);
      const langue = req.query.langue ?? 'fr';
      reply.header('cache-control', 'no-store');
      return {
        eleves: rows.map((r) => ({
          pupilId: r.pupilId,
          prenom: r.prenom,
          identifiant: r.login ?? null,
          whatsapp: r.login
            ? lienWhatsappParents(langue, { prenom: r.prenom, login: r.login, ecole: nom })
            : null,
        })),
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
