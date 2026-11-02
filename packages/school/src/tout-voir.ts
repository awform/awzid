/**
 * Mode « tout voir » (2/11/2026) : SEUL le compte du client le reçoit. Critère unique, partagé par l'API (`/auth/me`) et
 * le serveur web (`estToutVoir`, fichiers gardés de `/mutun/`) : l'identifiant du compte du client (ce n'est pas un
 * secret), de type `admin`, second facteur activé et VALIDÉ dans la session, hors démonstration, hors tablette de classe
 * et hors session limitée d'un enfant ou d'un élève. Aucune variable d'environnement.
 */
export const COMPTE_TOUT_VOIR = '01a14091-7673-776c-9993-d46fd1265aa7';

/** Comptes de démonstration (`<rôle>-<tag>@demo.awform.test`) : jamais « tout voir », même administrateur. */
export const EMAIL_DEMO = /@demo\.awform\.test$/i;

export interface CritereToutVoir {
  id: string | null | undefined;
  kind: string | null | undefined;
  email: string | null | undefined;
  mfaVerified: boolean | null | undefined;
  totpEnabled: boolean | null | undefined;
  /** tablette de classe ou session limitée (enfant, élève) */
  limitee: boolean;
}

export function voitTout(c: CritereToutVoir): boolean {
  return (
    c.id === COMPTE_TOUT_VOIR &&
    c.kind === 'admin' &&
    c.totpEnabled === true &&
    c.mfaVerified === true &&
    !c.limitee &&
    !EMAIL_DEMO.test(c.email ?? '')
  );
}
