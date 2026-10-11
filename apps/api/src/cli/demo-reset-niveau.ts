#!/usr/bin/env node
/**
 * DÉMONSTRATION seulement : remet un ou plusieurs comptes de niveau au DÉBUT de leur niveau, sans toucher aux
 * autres comptes.
 *   AWFORM_DEMO=1 AWFORM_DEMO_TAG=… node dist/cli/demo-reset-niveau.js adulte3 [enfant2 …]
 * (lancé par infra/prod/demo-reset-niveau.sh). Efface la progression du profil (leçons, essais, entraînement,
 * hifẓ, tuteur, épreuves, mots du Coran), remet les niveaux d'arabe et de religion et le réglage d'évaluation
 * par défaut. Refusé si AWFORM_DEMO n'est pas « 1 » ou si l'identifiant n'est pas un compte de niveau.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { connect, loadRootEnv, schema as t } from '@awform/db';
import { assertDemo, DEMO_NIVEAUX, emailOf, placeAtStart, roleOf } from '../demo-niveaux.js';

loadRootEnv();
assertDemo(process.env);
const TAG = process.env.AWFORM_DEMO_TAG ?? '';
if (!/^[a-z0-9]{4,12}$/.test(TAG)) throw new Error('AWFORM_DEMO_TAG requis (4 à 12 caractères)');
const ids = process.argv.slice(2);
const known = DEMO_NIVEAUX.map((n) => n.id);
const bad = ids.filter((i) => !known.includes(i));
if (!ids.length || bad.length)
  throw new Error(
    `identifiant(s) à remettre au début du niveau : ${known.join(', ')}${bad.length ? ` (inconnu : ${bad.join(', ')})` : ''}`,
  );

const h = connect(process.env.DATABASE_URL, 2);
try {
  for (const id of ids) {
    const n = DEMO_NIVEAUX.find((x) => x.id === id)!;
    const [acc] = await h.db
      .select({ id: t.account.id })
      .from(t.account)
      .where(and(eq(t.account.email, emailOf(roleOf(n), TAG)), isNull(t.account.deletedAt)));
    if (!acc) throw new Error(`compte de ${id} absent (lancer deploy.sh --demo)`);
    const [p] = await h.db
      .select({ id: t.profile.id })
      .from(t.profile)
      .where(
        and(
          eq(t.profile.ownerAccountId, acc.id),
          ...(n.filiere === 'adultes' ? [] : [eq(t.profile.pseudonym, n.pseudonym)]),
        ),
      );
    if (!p) throw new Error(`profil de ${id} absent`);
    // état d'apprentissage SEULEMENT (ni compte, ni accords, ni classes) ; ce profil seulement
    await h.db.transaction(async (tx) => {
      await tx.delete(t.tutorAlert).where(eq(t.tutorAlert.profileId, p.id));
      await tx.delete(t.tutorLog).where(eq(t.tutorLog.profileId, p.id));
      await tx.delete(t.tutorQuestion).where(eq(t.tutorQuestion.profileId, p.id));
      await tx.delete(t.attempt).where(eq(t.attempt.profileId, p.id));
      await tx.delete(t.progress).where(eq(t.progress.profileId, p.id));
      await tx.delete(t.practiceEvent).where(eq(t.practiceEvent.profileId, p.id));
      await tx.delete(t.practiceCheck).where(eq(t.practiceCheck.profileId, p.id));
      await tx.delete(t.hifzEvent).where(eq(t.hifzEvent.profileId, p.id));
      await tx.delete(t.hifzPlan).where(eq(t.hifzPlan.profileId, p.id));
      await tx.delete(t.placementAttempt).where(eq(t.placementAttempt.profileId, p.id));
      await tx.delete(t.examSubmission).where(eq(t.examSubmission.profileId, p.id));
      await tx.delete(t.freeAnswer).where(eq(t.freeAnswer.profileId, p.id));
      await tx.delete(t.profileLemma).where(eq(t.profileLemma.profileId, p.id));
      await tx.delete(t.suraProgress).where(eq(t.suraProgress.profileId, p.id));
      await tx.delete(t.carnetPerso).where(eq(t.carnetPerso.profileId, p.id));
    });
    await placeAtStart(h.db, p.id, n, acc.id);
    console.error(JSON.stringify({ remis: id, niveau: n.arabe, religion: n.sciences }));
  }
  console.log(JSON.stringify({ demo: 'niveaux_remis', comptes: ids }));
} finally {
  await h.close();
}
