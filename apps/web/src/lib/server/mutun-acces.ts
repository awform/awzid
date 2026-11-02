/**
 * Madjaliss — accès aux FICHIERS GARDÉS de `/mutun/` (lot 5, écart n° 3 du contrôle pré-bêta du 13/10/2026), sans
 * dépendance à SvelteKit (testé seul). Ces fichiers ne sont plus dans `static/` (servi sans authentification) :
 *  - `<texte>-enseignant.json` : notes de l'enseignant (décisions du référent, vocalisations à vérifier…) → PERSONNEL ;
 *  - `<texte>-differe.json` : séances en publication différée (Ibn ʿĀshir, séances de croyance ; vers non confirmés de la
 *    Lāmiyya) → PERSONNEL, DÉMONSTRATION et GROUPE « BÊTA FERMÉE » (lot 6) ;
 *  - `risala-p<k>.json` : phrases des séances différées de la Risāla → mêmes droits ;
 *  - `risala-tout.json` (2/11/2026) : séances SENSIBLES de la Risāla (chapitre du jihād) → le compte du CLIENT
 *    seul (mode « tout voir » : ni les autres administrateurs, ni le personnel, ni la démonstration, ni la bêta fermée).
 * Un compte ordinaire (ni personnel, ni démonstration, ni membre du groupe « bêta fermée » quand l'interrupteur
 * `beta_contenu_differe_visible` est allumé) et un visiteur sans session n'en reçoivent AUCUN, même par adresse
 * directe. Le droit est lu à CHAQUE requête dans la session (retrait du groupe = perte immédiate) et contrôlé avant
 * l'existence du fichier. Les notes `*-enseignant.json` restent au personnel SEUL (le groupe n'y a pas droit).
 * MÊMES règles que l'interface (`isStaff` de session.ts, `voitDiffere` de madjaliss/donnees.ts).
 */

import { voitTout } from '@awform/school/tout-voir';

/** Ce que la route lit du compte (réponse de `GET /api/v1/auth/me`). */
export interface CompteMutun {
  account?: { id?: string; kind?: string; email?: string | null; totpEnabled?: boolean };
  /** session de tablette de classe, ou d'un enfant / élève (session limitée) : jamais « tout voir » */
  tablette?: unknown;
  enfantSession?: boolean;
  /** mode « tout voir » calculé par l'API (relu ici ET revérifié : les deux doivent s'accorder) */
  toutVoir?: boolean;
  roles?: string[];
  mfaRequired?: boolean;
  mfaVerified?: boolean;
  /**
   * lot 6 : l'API dit que ce compte voit le contenu différé de la bêta fermée (membre du groupe `beta_fermee` ET
   * interrupteur `beta_contenu_differe_visible` allumé). Contrôlé AVEC le rôle : l'un sans l'autre ne donne rien.
   */
  betaDiffere?: boolean;
}

/** Rôle du groupe « bêta fermée » (créé par invitation, géré par l'administration). */
export const ROLE_BETA = 'beta_fermee';

/** Comptes de démonstration (`<rôle>-<tag>@demo.awform.test`, créés par `deploy.sh --demo` seulement). */
export const COMPTE_DEMO = /@demo\.awform\.test$/i;
/** Nom d'un fichier gardé : jamais autre chose (la route ne sert que ces noms, pas de chemin). */
export const NOM_GARDE = /^([a-z][a-z-]*)-(enseignant|differe|tout|p\d+)\.json$/;

/** `tout` : fichier du mode « tout voir » (séances sensibles), réservé à l'administrateur avec second facteur (`estToutVoir`). */
export type Droit = 'personnel' | 'differe' | 'tout';

/** Droit exigé pour un nom de fichier ; null : ce n'est pas un fichier gardé. */
export function droitExige(nom: string): Droit | null {
  const m = NOM_GARDE.exec(nom);
  if (!m) return null;
  return m[2] === 'enseignant' ? 'personnel' : m[2] === 'tout' ? 'tout' : 'differe';
}

/** Personnel : compte enseignant ou administrateur, ou rôle d'enseignant, de direction ou de secrétariat. */
export function estPersonnel(me: CompteMutun | null): boolean {
  if (!me?.account) return false;
  // session à moitié ouverte (second facteur exigé et pas encore validé) : aucun droit
  if (me.mfaRequired && !me.mfaVerified) return false;
  // 2/11/2026 : l'administrateur n'a jamais de droit sans second facteur VALIDÉ, même si la réponse n'annonçait pas l'exigence
  if (me.account.kind === 'admin') return me.mfaVerified === true;
  if (me.account.kind === 'enseignant') return true;
  return (me.roles ?? []).some(
    (r) => r === 'enseignant' || r === 'direction' || r === 'secretariat',
  );
}

/**
 * Membre du groupe « bêta fermée » AVEC le droit : rôle `beta_fermee` du compte ET `betaDiffere` calculé par l'API
 * (interrupteur `beta_contenu_differe_visible`). Une session à moitié ouverte (second facteur exigé et non validé) : rien.
 */
export function estMembreBeta(me: CompteMutun | null): boolean {
  if (!me?.account) return false;
  if (me.mfaRequired && !me.mfaVerified) return false;
  return me.betaDiffere === true && (me.roles ?? []).includes(ROLE_BETA);
}

/**
 * Mode « tout voir » (2/11/2026) : le compte du CLIENT seul (identifiant, voir `@awform/school/tout-voir`), de type `admin`, second
 * facteur activé et VALIDÉ dans la session, hors démonstration, tablette et session limitée. Décidé ICI, par le serveur, à partir de ce que l'API dit
 * du compte de la session : le drapeau `toutVoir` calculé par l'API (serveur à serveur) doit s'accorder avec ce contrôle ; celui que le navigateur
 * pourrait envoyer n'est jamais relu et n'ouvre rien.
 */
export function estToutVoir(me: CompteMutun | null): boolean {
  if (!me?.account || me.toutVoir !== true) return false;
  return voitTout({
    id: me.account.id,
    kind: me.account.kind,
    email: me.account.email,
    mfaVerified: me.mfaVerified,
    totpEnabled: me.account.totpEnabled,
    limitee: !!me.tablette || me.enfantSession === true,
  });
}

/** Voit la publication différée : le personnel, le mode « tout voir », les comptes de démonstration et le groupe « bêta fermée ». */
export function voitDiffere(me: CompteMutun | null): boolean {
  return (
    estPersonnel(me) ||
    estToutVoir(me) ||
    (!!me?.account && COMPTE_DEMO.test(me.account.email ?? '')) ||
    estMembreBeta(me)
  );
}

/**
 * Décision pour un fichier : 401 sans session, 403 sans le droit adapté, 404 pour un nom qui n'est pas un fichier gardé,
 * 200 sinon (l'existence du fichier est vérifiée ensuite : le droit passe avant, pour ne rien révéler à un visiteur).
 */
export function decider(nom: string, me: CompteMutun | null): 200 | 401 | 403 | 404 {
  const droit = droitExige(nom);
  if (!droit) return 404;
  if (!me?.account) return 401;
  const ok =
    droit === 'personnel' ? estPersonnel(me) : droit === 'tout' ? estToutVoir(me) : voitDiffere(me);
  return ok ? 200 : 403;
}

/**
 * Lot 9 : AUDIO des Madjaliss (`/mutun/audio/<texte>/<id>.mp3`). Droit du manifeste : « public » = toute session ouverte
 * (jamais un visiteur sans compte : 401), « differe » = mêmes droits que les séances différées (`voitDiffere`), 403 sinon ;
 * une session à moitié ouverte (second facteur exigé et non validé) est traitée comme sans session ; droit inconnu : 403.
 */
export function deciderAudio(droit: string, me: CompteMutun | null): 200 | 401 | 403 {
  if (!me?.account || (me.mfaRequired && !me.mfaVerified)) return 401;
  if (droit === 'public') return 200;
  if (droit === 'tout') return estToutVoir(me) ? 200 : 403;
  return droit === 'differe' && voitDiffere(me) ? 200 : 403;
}
