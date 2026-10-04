/**
 * Collection Religion ados/adultes (ra*) — décisions du chef de projet du 04/10/2026 (vérification sur les
 * vrais livres).
 *
 *  - Cas pratique NON résolu (`resolu: false`) : la réponse proposée par le livre (`reponse_fr`) reste retirée
 *    de la projection élève (CON-2, inchangée). Un ADULTE qui apprend SEUL (aucune classe) la voit seulement
 *    APRÈS avoir écrit sa propre réponse, par cette route dédiée ; l'élève d'une classe et l'ado la reçoivent
 *    de l'enseignant (refus `reponse_par_enseignant`). Numéros de hadith : même masquage que la leçon (CON-3).
 */
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { maskTree, unmaskedHadithRefs, verifiedHadiths } from '@awform/content';
import { schema as t, type Db } from '@awform/db';
import { err, familyProfile, UUID } from './guards.js';

type Edition = () => Promise<{ id: string; code: string } | null>;
type Obj = Record<string, unknown>;

const RA_UNIT = '^ra\\d+\\.l\\d{2,3}$';
const CAS = '^r\\d{1,2}c\\d{1,2}$';
/** réponse personnelle : assez longue pour être une vraie tentative, jamais notée */
export const MIN_TENTATIVE = 10;

/** « r6c1 » → cas 1 de la rubrique 6 d'une leçon, s'il est non résolu et porte une réponse proposée. */
export function unresolvedCase(lesson: unknown, ref: string): { reponse: string } | null {
  const m = /^r(\d+)c(\d+)$/.exec(ref);
  if (!m) return null;
  const rub = ((lesson as Obj | null)?.rubriques as Obj[] | undefined)?.[Number(m[1])];
  const cs = (rub?.cas as Obj[] | undefined)?.[Number(m[2])];
  if (!cs || cs.resolu !== false || typeof cs.reponse_fr !== 'string') return null;
  return { reponse: cs.reponse_fr };
}

export function registerPratiqueAdulte(app: FastifyInstance, db: Db, edition: Edition): void {
  const params = {
    type: 'object',
    required: ['id', 'unit', 'cas'],
    properties: {
      id: UUID,
      unit: { type: 'string', pattern: RA_UNIT },
      cas: { type: 'string', pattern: CAS },
    },
  } as const;

  /** profil adulte, autonome (aucune classe), et le cas du livre servi ; sinon le refus est envoyé */
  const resolve = async (
    req: Parameters<typeof familyProfile>[1],
    reply: Parameters<typeof familyProfile>[2],
    p: { id: string; unit: string; cas: string },
  ) => {
    const prof = await familyProfile(db, req, reply, p.id);
    if (!prof) return null;
    if (prof.kind !== 'adulte') return void err(reply, 403, 'reponse_par_enseignant');
    const [inClass] = await db
      .select({ c: t.classMember.classId })
      .from(t.classMember)
      .where(eq(t.classMember.profileId, prof.id))
      .limit(1);
    const [inPaper] = await db
      .select({ c: t.classPupil.id })
      .from(t.classPupil)
      .where(eq(t.classPupil.profileId, prof.id))
      .limit(1);
    if (inClass || inPaper) return void err(reply, 403, 'reponse_par_enseignant');
    const ed = await edition();
    if (!ed) return void err(reply, 503, 'aucune_edition');
    const [uv] = await db
      .select({ content: t.unitVersion.content })
      .from(t.unitVersion)
      .where(and(eq(t.unitVersion.editionId, ed.id), eq(t.unitVersion.unitId, p.unit)));
    const cs = uv ? unresolvedCase(uv.content, p.cas) : null;
    if (!cs) return void err(reply, 404, 'introuvable');
    // numéros de hadith : visibles seulement s'ils sont VERIFIE au registre de l'édition (CON-3)
    const reg = await db
      .select({
        id: t.registryEntry.id,
        statut: t.registryEntry.statut,
        data: t.registryEntry.data,
      })
      .from(t.registryEntry)
      .where(and(eq(t.registryEntry.editionId, ed.id), eq(t.registryEntry.kind, 'hadith')));
    const verified = verifiedHadiths(
      Object.fromEntries(reg.map((r) => [r.id, { ...(r.data as Obj), statut: r.statut }])),
    );
    const masked = maskTree({ reponse: cs.reponse }, verified).value;
    if (unmaskedHadithRefs(masked, verified).length) return void err(reply, 404, 'introuvable');
    return { profileId: prof.id, reponse: masked.reponse };
  };

  /** réponse déjà écrite (et réponse proposée) ; sans tentative : `tentative_requise` */
  app.get<{ Params: { id: string; unit: string; cas: string } }>(
    '/api/v1/profiles/:id/cas/:unit/:cas',
    { schema: { params } },
    async (req, reply) => {
      const c = await resolve(req, reply, req.params);
      if (!c) return reply;
      const [x] = await db
        .select({ texte: t.casTentative.texte })
        .from(t.casTentative)
        .where(
          and(
            eq(t.casTentative.profileId, c.profileId),
            eq(t.casTentative.unitId, req.params.unit),
            eq(t.casTentative.cas, req.params.cas),
          ),
        );
      if (!x) return err(reply, 403, 'tentative_requise');
      return { texte: x.texte, reponse: c.reponse };
    },
  );

  /** l'adulte écrit sa réponse ; en retour : la réponse proposée par le livre */
  app.post<{ Params: { id: string; unit: string; cas: string }; Body: { texte: string } }>(
    '/api/v1/profiles/:id/cas/:unit/:cas',
    {
      schema: {
        params,
        body: {
          type: 'object',
          required: ['texte'],
          additionalProperties: false,
          properties: { texte: { type: 'string', maxLength: 2000 } },
        },
      },
    },
    async (req, reply) => {
      const texte = req.body.texte.trim();
      if (texte.length < MIN_TENTATIVE) return err(reply, 400, 'reponse_trop_courte');
      const c = await resolve(req, reply, req.params);
      if (!c) return reply;
      await db
        .insert(t.casTentative)
        .values({ profileId: c.profileId, unitId: req.params.unit, cas: req.params.cas, texte })
        .onConflictDoUpdate({
          target: [t.casTentative.profileId, t.casTentative.unitId, t.casTentative.cas],
          set: { texte, updatedAt: new Date() },
        });
      return { texte, reponse: c.reponse };
    },
  );
}
