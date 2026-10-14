/**
 * Madjaliss — accès aux FICHIERS GARDÉS de `/mutun/` (lot 5, écart n° 3 du contrôle pré-bêta du 13/10/2026), sans
 * dépendance à SvelteKit (testé seul). Ces fichiers ne sont plus dans `static/` (servi sans authentification) :
 *  - `<texte>-enseignant.json` : notes de l'enseignant (décisions du référent, vocalisations à vérifier…) → PERSONNEL ;
 *  - `<texte>-differe.json` : séances en publication différée (Ibn ʿĀshir, séances de croyance) → PERSONNEL et DÉMONSTRATION ;
 *  - `risala-p<k>.json` : phrases de la Risāla (publication différée, cycle 3) → PERSONNEL et DÉMONSTRATION.
 * Un invité de la bêta (ni personnel ni compte de démonstration) et un visiteur sans session n'en reçoivent AUCUN, même
 * par adresse directe. MÊMES règles que l'interface (`isStaff` de session.ts, `voitDiffere` de madjaliss/donnees.ts).
 */

/** Ce que la route lit du compte (réponse de `GET /api/v1/auth/me`). */
export interface CompteMutun {
  account?: { kind?: string; email?: string | null };
  roles?: string[];
  mfaRequired?: boolean;
  mfaVerified?: boolean;
}

/** Comptes de démonstration (`<rôle>-<tag>@demo.awform.test`, créés par `deploy.sh --demo` seulement). */
export const COMPTE_DEMO = /@demo\.awform\.test$/i;
/** Nom d'un fichier gardé : jamais autre chose (la route ne sert que ces noms, pas de chemin). */
export const NOM_GARDE = /^([a-z][a-z-]*)-(enseignant|differe|p\d+)\.json$/;

export type Droit = 'personnel' | 'differe';

/** Droit exigé pour un nom de fichier ; null : ce n'est pas un fichier gardé. */
export function droitExige(nom: string): Droit | null {
  const m = NOM_GARDE.exec(nom);
  if (!m) return null;
  return m[2] === 'enseignant' ? 'personnel' : 'differe';
}

/** Personnel : compte enseignant ou administrateur, ou rôle d'enseignant, de direction ou de secrétariat. */
export function estPersonnel(me: CompteMutun | null): boolean {
  if (!me?.account) return false;
  // session à moitié ouverte (second facteur exigé et pas encore validé) : aucun droit
  if (me.mfaRequired && !me.mfaVerified) return false;
  if (me.account.kind === 'enseignant' || me.account.kind === 'admin') return true;
  return (me.roles ?? []).some(
    (r) => r === 'enseignant' || r === 'direction' || r === 'secretariat',
  );
}

/** Voit la publication différée : le personnel et les comptes de démonstration. */
export function voitDiffere(me: CompteMutun | null): boolean {
  return estPersonnel(me) || (!!me?.account && COMPTE_DEMO.test(me.account.email ?? ''));
}

/**
 * Décision pour un fichier : 401 sans session, 403 sans le droit adapté, 404 pour un nom qui n'est pas un fichier gardé,
 * 200 sinon (l'existence du fichier est vérifiée ensuite : le droit passe avant, pour ne rien révéler à un visiteur).
 */
export function decider(nom: string, me: CompteMutun | null): 200 | 401 | 403 | 404 {
  const droit = droitExige(nom);
  if (!droit) return 404;
  if (!me?.account) return 401;
  return (droit === 'personnel' ? estPersonnel(me) : voitDiffere(me)) ? 200 : 403;
}
