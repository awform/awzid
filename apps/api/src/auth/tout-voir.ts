/**
 * Mode « tout voir » du client (2/11/2026) : tout le contenu de l'application est visible sur son compte seul. Le critère
 * (identifiant du compte du client + type `admin` + second facteur validé, hors démonstration, tablette et session
 * limitée) vit dans `@awform/school/tout-voir`, partagé avec le serveur web, qui le revérifie à chaque fichier gardé :
 * le drapeau `toutVoir` de `GET /auth/me` sert à l'affichage et n'ouvre rien. Le mode ne renvoie QUE du contenu.
 */
export { COMPTE_TOUT_VOIR, EMAIL_DEMO, voitTout } from '@awform/school/tout-voir';
