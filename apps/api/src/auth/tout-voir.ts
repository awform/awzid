/**
 * Mode « tout voir » du client (2/11/2026) : sur son compte administrateur, tout le contenu de l'application est visible
 * (niveaux, livres, Madjaliss dont le chapitre du jihād, contenu « adulte », « pudeur » et différé, contenu en attente de
 * relecture). Ce contenu reste invisible pour tous les autres comptes.
 *
 * CRITÈRE UNIQUE, sans variable d'environnement : compte de type `admin` ET second facteur VALIDÉ dans la session en
 * cours (`mfaVerified`), le second facteur étant activé sur le compte. Jamais pour une session de tablette de classe ni
 * pour la session limitée d'un enfant ou d'un élève d'école, même si elle appartient à un compte `admin`.
 *
 * Ce module ne fait que DÉCIDER. Le drapeau `toutVoir` de `GET /auth/me` sert à l'affichage ; chaque route qui garde du
 * contenu revérifie le critère à partir de la session (voir `apps/web/src/lib/server/mutun-acces.ts`, `estToutVoir`).
 * Le mode ne renvoie QUE du contenu : aucune donnée personnelle d'utilisateur (RGPD), aucune progression écrite.
 */
export function voitTout(c: {
  kind: string;
  mfaVerified: boolean;
  totpEnabled: boolean;
  limitee: boolean;
}): boolean {
  return c.kind === 'admin' && c.totpEnabled && c.mfaVerified === true && !c.limitee;
}
