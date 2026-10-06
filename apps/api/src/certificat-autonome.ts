/**
 * A39 (décision D-A39 4) — certificat INDIVIDUEL de l'adulte autonome : délivré seulement après une ÉPREUVE DE
 * PASSAGE RÉUSSIE (mode serein compris : l'épreuve y est facultative, elle sert à cela), avec le MÊME modèle que
 * les certificats d'école (modèle « niveau » des livres) et la MÊME vérification publique (registre numéroté,
 * signature Ed25519, QR à code aléatoire). Établissement : « Awzid — parcours autonome ». Les champs qu'aucune
 * école n'a saisis (degrés, naissance non donnée…) sont imprimés « — », jamais inventés ; la note est celle de
 * l'épreuve (sur 100) et la mention suit les règles des livres (`regles`). Jamais une ijāza.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  evalDocs,
  levelInfo,
  schema as t,
  issueCertificate,
  sealCertificate,
  type CertificateRow,
  type Db,
} from '@awform/db';
import {
  levelCertFields,
  levelModelKey,
  MENTIONS,
  renderDoc,
  rulesFrom,
  type CertModels,
  type Gender,
  type LevelResult,
  type RefLevel,
} from '@awform/school';
import { audit } from './auth/service.js';
import { newVerifCode, signCert, type CertSigner } from './certsign.js';
import { err, familyProfile, UUID } from './guards.js';
import { certQr, ORIGIN } from './qr.js';
import { today, type Edition } from './school-common.js';

export const AUTONOME_FR = 'Awzid — parcours autonome';

/** Profil d'un adulte AUTONOME (titulaire de son propre compte adulte), sinon null. */
async function autonomous(db: Db, req: FastifyRequest, id: string) {
  const [r] = await db
    .select({ id: t.profile.id, kind: t.profile.kind, pseudonym: t.profile.pseudonym })
    .from(t.profile)
    .innerJoin(t.account, eq(t.account.id, t.profile.ownerAccountId))
    .where(
      and(
        eq(t.profile.id, id),
        eq(t.profile.ownerAccountId, req.auth!.accountId),
        eq(t.account.kind, 'adulte'),
        eq(t.profile.kind, 'adulte'),
      ),
    );
  return r ?? null;
}

export function registerCertificatAutonome(
  app: FastifyInstance,
  db: Db,
  edition: Edition,
  signer: CertSigner | null,
): void {
  const seal = async (c: CertificateRow) =>
    c.verifCode
      ? c
      : ((await sealCertificate(db, c.id, {
          verifCode: newVerifCode(),
          signature: signer ? signCert(signer, c) : null,
          keyId: signer?.keyId ?? null,
        })) ?? c);
  const pid = { type: 'object', required: ['id'], properties: { id: UUID } } as const;
  const mine = (profileId: string) =>
    db
      .select()
      .from(t.certificate)
      .where(eq(t.certificate.profileId, profileId))
      .orderBy(desc(t.certificate.issuedAt));

  /** Certificats de l'adulte et niveaux dont il a réussi l'épreuve (certificat possible). */
  app.get<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/certificats',
    { schema: { params: pid } },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      const auto = await autonomous(db, req, p.id);
      const passed = await db
        .selectDistinct({ levelCode: t.placementAttempt.levelCode })
        .from(t.placementAttempt)
        .where(
          and(
            eq(t.placementAttempt.profileId, p.id),
            eq(t.placementAttempt.kind, 'epreuve'),
            eq(t.placementAttempt.passed, true),
          ),
        );
      const list = await mine(p.id);
      return {
        autonome: !!auto,
        certificats: list.map((c) => ({
          id: c.id,
          numero: c.number,
          niveau: c.subject,
          le: c.issuedAt,
          annule: !!c.revokedAt,
        })),
        possibles: auto ? passed.map((x) => x.levelCode) : [],
      };
    },
  );

  app.get<{ Params: { id: string; cid: string }; Querystring: { origin?: string } }>(
    '/api/v1/profiles/:id/certificats/:cid',
    {
      schema: {
        params: { type: 'object', required: ['id', 'cid'], properties: { id: UUID, cid: UUID } },
        querystring: {
          type: 'object',
          properties: { origin: { type: 'string', maxLength: 200, pattern: ORIGIN } },
        },
      },
    },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      const c = (await mine(p.id)).find((x) => x.id === req.params.cid);
      if (!c) return err(reply, 404, 'introuvable');
      const sealed = await seal(c);
      return { certificate: { ...sealed, qr: certQr(req.query.origin, sealed) } };
    },
  );

  /**
   * Délivrance (ou aperçu) : niveau dont l'épreuve est réussie ; nom complet et civilité donnés par l'adulte
   * (naissance facultative). Un certificat valide par niveau : redemander renvoie le même.
   */
  app.post<{
    Params: { id: string };
    Body: {
      niveau: string;
      nom: string;
      civilite?: 'M.' | 'Mme';
      naissance?: string;
      nomAr?: string;
      apercu?: boolean;
    };
  }>(
    '/api/v1/profiles/:id/certificats',
    {
      schema: {
        params: pid,
        body: {
          type: 'object',
          required: ['niveau', 'nom'],
          additionalProperties: false,
          properties: {
            niveau: { type: 'string', pattern: '^[a-z]{2,3}[0-9]{1,2}$' },
            nom: { type: 'string', minLength: 2, maxLength: 80 },
            civilite: { enum: ['M.', 'Mme'] },
            naissance: { type: 'string', maxLength: 40 },
            nomAr: { type: 'string', maxLength: 80 },
            apercu: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      if (req.auth?.tablet) return err(reply, 403, 'reserve_adulte_autonome');
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      const auto = await autonomous(db, req, p.id);
      if (!auto) return err(reply, 403, 'reserve_adulte_autonome');
      const b = req.body;
      const [best] = await db
        .select()
        .from(t.placementAttempt)
        .where(
          and(
            eq(t.placementAttempt.profileId, p.id),
            eq(t.placementAttempt.kind, 'epreuve'),
            eq(t.placementAttempt.passed, true),
            eq(t.placementAttempt.levelCode, b.niveau),
          ),
        )
        .orderBy(desc(t.placementAttempt.points));
      // certificat SEULEMENT après une épreuve réussie (tous les modes)
      if (!best) return err(reply, 409, 'epreuve_requise');
      const [already] = await db
        .select()
        .from(t.certificate)
        .where(
          and(
            eq(t.certificate.profileId, p.id),
            eq(t.certificate.subject, b.niveau),
            isNull(t.certificate.revokedAt),
          ),
        );
      if (already && !b.apercu) return { certificate: await seal(already) };
      const ed = await edition();
      if (!ed) return err(reply, 503, 'aucune_edition');
      const docs = await evalDocs(db, ed.id);
      const models = docs.certificats as CertModels | undefined;
      const lvl = await levelInfo(db, ed.id, b.niveau);
      const key = levelModelKey(lvl?.track ?? '') ?? '';
      const model = models?.modeles?.[key];
      if (!lvl || !model) return err(reply, 409, 'modele_absent');
      const nf = Math.round((100 * best.points) / Math.max(1, best.max));
      // mention : décisions des livres (seuils de la note finale)
      const d = [...rulesFrom(docs.regles).decisions]
        .sort((x, y) => y.min - x.min)
        .find((x) => nf >= x.min);
      const mention = d ? (MENTIONS[d.code] ?? null) : null;
      const result: LevelResult = {
        status: 'complet',
        missing: [],
        bilansPct: null,
        cc: null,
        ccPartiel: false,
        examenPct: nf,
        nf,
        decision: d ? { code: d.code, fr: d.fr, document: d.document } : null,
        conditionManquante: null,
        certificat: true,
        aConfirmer: null,
        mention,
      };
      const ref =
        ((docs.referentiel as { niveaux?: RefLevel[] } | undefined)?.niveaux ?? []).find(
          (n) => n.code === b.niveau,
        ) ?? null;
      const day = today();
      const fields: Record<string, string> = levelCertFields(
        {
          school: {
            schoolName: AUTONOME_FR,
            schoolNameAr: AUTONOME_FR,
            place: 'en ligne',
            placeAr: 'عَبْرَ الْإِنْتَرْنِتِ',
          },
          rank: lvl.rank,
          bookTitleFr: lvl.titleFr,
          bookTitleAr: lvl.titleAr,
          ref,
          result,
          day,
          pupilName: b.nom.trim(),
          pupilNameAr: b.nomAr?.trim() || null,
          extra: {
            ...(b.civilite ? { civilite: b.civilite } : {}),
            ...(b.naissance?.trim() ? { naissance: b.naissance.trim() } : {}),
          },
        },
        models!,
      );
      const gender: Gender = b.civilite === 'Mme' ? 'f' : b.civilite === 'M.' ? 'm' : null;
      // champs qu'aucune école n'a saisis (degrés, naissance…) : « — », jamais inventés
      const first = renderDoc(key, model, fields, gender);
      for (const k of first.missing) fields[k] = '—';
      const doc = renderDoc(key, model, fields, gender);
      if (b.apercu) return { apercu: true, document: doc };
      const cert = await issueCertificate(db, {
        prefix: b.niveau,
        year: Number(day.slice(0, 4)),
        kind: 'niveau',
        classId: null,
        pupilId: null,
        profileId: p.id,
        issuedBy: req.auth!.accountId,
        subject: b.niveau,
        holderName: b.nom.trim(),
        mention: mention?.fr ?? null,
        document: (number) => ({ ...doc, number, issuedOn: day, autonome: true }),
      });
      const sealed = await seal(cert);
      await audit(db, req.auth!.accountId, 'parcours.certificat', cert.id, { numero: cert.number });
      return reply.code(201).send({ certificate: sealed });
    },
  );
}
