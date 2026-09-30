/**
 * Certificats de niveau et attestations de hifẓ (QUA-3, découpé de school.ts sans changement de comportement) :
 * aperçu, délivrance (registre numéroté, signé et vérifiable — lots 13 et 20), liste, lecture, annulation.
 * Jamais une ijāza. Chaque certificat délivré ou annulé est journalisé.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  revokeCertificate,
  type CertificateRow,
  classCertificates,
  evalDocs,
  hifzEventsOf,
  issueCertificate,
  paperResults,
  teacherCertificate,
  teacherClass,
  teacherPupil,
  type ClassRow,
  type Db,
} from '@awform/db';
import { type Note } from '@awform/hifz';
import {
  HIFZ_MENTIONS,
  HIFZ_MODEL,
  hifzCertFields,
  levelCertFields,
  levelModelKey,
  renderDoc,
  type CertModels,
  type Gender,
  type LevelResult,
  type RenderedDoc,
  type RefLevel,
} from '@awform/school';
import { audit } from './auth/service.js';

import { err, PART, partLabel, today, type Edition } from './school-common.js';

/** Aides de registerSchool utilisées par les routes des certificats. */
export interface SchoolKit {
  db: Db;
  edition: Edition;
  pre: { preHandler: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown> };
  idParams: (...keys: string[]) => object;
  me: (req: FastifyRequest) => string;
  seal: (c: CertificateRow) => Promise<CertificateRow>;
  tableau: (cls: ClassRow) => Promise<{
    rows: Array<{ pupil: { id: string }; result: LevelResult | null }>;
    level: { track: string; rank: number; titleFr: string | null; titleAr: string | null } | null;
  }>;
}

export function registerCertificates(app: FastifyInstance, kit: SchoolKit): void {
  const { db, edition, pre, idParams, me, seal, tableau } = kit;
  // ---------------------------------------------------------------- certificats et attestations

  app.post<{
    Params: { pid: string };
    Body: {
      kind: 'niveau' | 'hifz';
      part?: string;
      gender?: Gender;
      fields?: Record<string, string>;
      apercu?: boolean;
      /** audit MET-2 : l'enseignant confirme la délivrance malgré un contrôle continu partiel */
      confirmerCcPartiel?: boolean;
    };
  }>(
    '/api/v1/ecole/pupils/:pid/certificats',
    {
      ...pre,
      schema: {
        ...idParams('pid'),
        body: {
          type: 'object',
          required: ['kind'],
          additionalProperties: false,
          properties: {
            kind: { type: 'string', enum: ['niveau', 'hifz'] },
            part: { type: 'string', maxLength: 20 },
            gender: { type: ['string', 'null'], enum: ['m', 'f', null] },
            fields: {
              type: 'object',
              maxProperties: 30,
              additionalProperties: { type: 'string', maxLength: 200 },
            },
            apercu: { type: 'boolean' },
            confirmerCcPartiel: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const r = await teacherPupil(db, me(req), req.params.pid);
      if (!r) return err(reply, 404, 'introuvable');
      const ed = await edition();
      if (!ed) return err(reply, 404, 'aucune_edition');
      const { cls, pupil } = r;
      const docs = await evalDocs(db, ed.id);
      const models = docs.certificats as CertModels | undefined;
      const gender: Gender = req.body.gender ?? (pupil.gender as Gender) ?? null;
      const extra = req.body.fields ?? {};
      const school = {
        schoolName: cls.schoolName,
        schoolNameAr: cls.schoolNameAr,
        place: cls.place,
        placeAr: cls.placeAr,
      };
      const day = today();
      let key: string;
      let doc: RenderedDoc;
      let holder: string;
      let mention: string | null;
      let subject: string;
      let prefix: string;
      let eligible: { ok: boolean; raison?: string; aConfirmer?: 'cc_partiel' };
      if (req.body.kind === 'niveau') {
        if (!cls.levelCode) return err(reply, 400, 'niveau_de_la_classe');
        const tb = await tableau(cls);
        const row = tb.rows.find((x) => x.pupil.id === pupil.id)!;
        const lvl = tb.level;
        key = levelModelKey(lvl?.track ?? '') ?? '';
        const model = models?.modeles?.[key];
        if (!lvl || !model) return err(reply, 409, 'modele_absent');
        const ref =
          ((docs.referentiel as { niveaux?: RefLevel[] } | undefined)?.niveaux ?? []).find(
            (n) => n.code === cls.levelCode,
          ) ?? null;
        const result = row.result!;
        // audit MET-2 : contrôle continu partiel → délivrance seulement sur confirmation explicite
        const confirmed =
          result.aConfirmer === 'cc_partiel' && req.body.confirmerCcPartiel === true;
        eligible =
          result.certificat || confirmed
            ? { ok: true }
            : result.aConfirmer === 'cc_partiel'
              ? {
                  ok: false,
                  aConfirmer: 'cc_partiel',
                  raison:
                    'contrôle continu partiel (récitations ou productions non saisies) : confirmation de l’enseignant requise',
                }
              : {
                  ok: false,
                  raison:
                    result.status === 'incomplet'
                      ? `résultats incomplets : ${result.missing.join(', ')}`
                      : `décision : ${result.decision?.fr ?? '—'}`,
                };
        const fields = levelCertFields(
          {
            school,
            rank: lvl.rank,
            bookTitleFr: lvl.titleFr,
            bookTitleAr: lvl.titleAr,
            ref,
            result,
            day,
            pupilName: pupil.displayName,
            pupilNameAr: pupil.nameAr,
            extra,
          },
          models!,
        );
        doc = renderDoc(key, model, fields, gender);
        holder = fields.prenom_nom ?? pupil.displayName;
        mention = result.mention?.fr ?? null;
        subject = cls.levelCode;
        prefix = cls.levelCode;
      } else {
        const part = req.body.part ?? '';
        if (!PART.test(part)) return err(reply, 400, 'passage_invalide');
        key = 'fin_partie_hifz';
        // récitation validée « oui » (≥ 14/20, aucune règle d'oubli) : application ou classe papier
        let best: { day: string; n: Note } | null = null;
        if (pupil.profileId) {
          for (const e of await hifzEventsOf(db, [pupil.profileId]))
            if (e.source === 'enseignant' && e.part === part) {
              const n = (e.details as { note?: Note } | null)?.note;
              if (n?.validation === 'oui') best = { day: e.day, n };
            }
        } else {
          const [p] = (await paperResults(db, [pupil.id], 'hifz')).filter(
            (x) => x.item === `hifz:${part}`,
          );
          const n = (p?.details as { note?: Note } | null)?.note;
          if (p && n?.validation === 'oui') best = { day: p.day, n };
        }
        eligible = best
          ? { ok: true }
          : { ok: false, raison: 'aucune récitation validée pour ce passage' };
        const fields = hifzCertFields({
          school,
          pupilName: pupil.displayName,
          partie: partLabel(part),
          validationDay: best?.day ?? day,
          note: best?.n.total ?? 0,
          mention: HIFZ_MENTIONS[best?.n.mention ?? ''] ?? '',
          day,
          extra,
          part,
          pupilNameAr: pupil.nameAr,
          moisAr: models?.mois_ar,
        });
        doc = renderDoc(key, HIFZ_MODEL, fields, gender);
        holder = fields.prenom_nom ?? pupil.displayName;
        mention = HIFZ_MENTIONS[best?.n.mention ?? ''] ?? null;
        subject = part;
        prefix = 'HZ';
      }
      if (req.body.apercu) return { apercu: true, eligible, document: doc };
      if (!eligible.ok) return err(reply, 409, 'non_eligible', { raison: eligible.raison });
      if (doc.missing.length) return err(reply, 400, 'champs_manquants', { champs: doc.missing });
      const cert = await issueCertificate(db, {
        prefix,
        year: Number(day.slice(0, 4)),
        kind: req.body.kind,
        classId: cls.id,
        pupilId: pupil.id,
        issuedBy: me(req),
        subject,
        holderName: holder,
        mention,
        document: (number) => ({ ...doc, number, issuedOn: day }),
      });
      const sealed = await seal(cert);
      await audit(db, me(req), 'ecole.certificat', cert.id, {
        numero: cert.number,
        kind: cert.kind,
      });
      return reply.code(201).send({ certificate: sealed });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/ecole/classes/:id/certificats',
    { ...pre, schema: idParams('id') },
    async (req, reply) => {
      const cls = await teacherClass(db, me(req), req.params.id);
      if (!cls) return err(reply, 404, 'introuvable');
      return { certificates: await classCertificates(db, cls.id) };
    },
  );

  app.get<{ Params: { cid: string } }>(
    '/api/v1/ecole/certificats/:cid',
    { ...pre, schema: idParams('cid') },
    async (req, reply) => {
      const c = await teacherCertificate(db, me(req), req.params.cid);
      if (!c) return err(reply, 404, 'introuvable');
      return { certificate: await seal(c) };
    },
  );

  // annulation (erreur de saisie, fraude) : le registre garde le certificat, la vérification publique
  // affiche « annulé » avec le motif (lot 20)
  app.post<{ Params: { cid: string }; Body: { motif: string } }>(
    '/api/v1/ecole/certificats/:cid/annuler',
    {
      ...pre,
      schema: {
        ...idParams('cid'),
        body: {
          type: 'object',
          required: ['motif'],
          additionalProperties: false,
          properties: { motif: { type: 'string', minLength: 3, maxLength: 200 } },
        },
      },
    },
    async (req, reply) => {
      const c = await teacherCertificate(db, me(req), req.params.cid);
      if (!c) return err(reply, 404, 'introuvable');
      if (!(await revokeCertificate(db, c.id, req.body.motif.trim())))
        return err(reply, 409, 'deja_annule');
      await audit(db, me(req), 'ecole.certificat.annulation', c.id, { numero: c.number });
      return { ok: true };
    },
  );
}
