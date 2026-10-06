# Classification d'âge et fiches « données » des boutiques d'applications

> **BROUILLON — à valider par un juriste** (lot F3, revue d'architecture F7, 06/10/2026). Rédigé d'après le
> fonctionnement RÉEL de l'application (branche `f3-comptes-wip`) et la politique de confidentialité
> (`apps/web/static/i18n/legal/fr.json`). La bêta du 20/10 est une application web : ces fiches ne servent qu'à
> la publication future dans l'App Store et Google Play. Toute réponse doit rester cohérente avec la politique.

## 1. Catégorie et public

- **Catégorie** : Éducation (Apple et Google). **Pas** la catégorie « Enfants » d'Apple (Kids Category : contrôle
  parental avant tout lien sortant ou achat, SDK tiers interdits) — l'application s'adresse aux familles et aux
  écoles, les profils d'enfants sont créés et gérés par un parent ou une école. [À confirmer : si Apple considère
  l'application comme « principalement pour les enfants », la catégorie Kids s'impose.]
- **Google Play — public cible** : inclut les enfants de moins de 13 ans → **programme Familles** applicable :
  pas de publicité, aucun SDK non certifié Familles, données des enfants minimisées, politique de confidentialité
  accessible, consentement parental. État actuel : aucun SDK tiers, aucune publicité, aucun traceur (conforme).
- **États-Unis** : moins de 13 ans fermés au lancement (aucun profil créé) ; à décrire tel quel dans les fiches.

## 2. Classification d'âge (questionnaires)

| Question (résumé) | Réponse | Justification dans l'application |
|---|---|---|
| Violence, horreur, contenu sexuel, nudité, grossièretés | Aucun | contenus des livres (arabe, Coran, sciences islamiques), illustrations sans visage |
| Thèmes matures ou suggestifs | Aucun | — |
| Thèmes religieux | Oui, éducatifs | apprentissage du Coran et des sciences islamiques (Google IARC : « contenu éducatif » ; à déclarer si la question est posée) |
| Médicaments, alcool, tabac, jeux d'argent, concours | Aucun | — |
| Accès Web non restreint | Non | aucun navigateur intégré ; liens externes seulement vers les sources (crédits) |
| Contenu généré par les utilisateurs / communication entre utilisateurs | Oui, limité | messagerie école ↔ famille (enseignant ↔ parent, jamais entre enfants), chiffrée, avec signalement et modération ; réponses libres lues par l'enseignant seulement |
| Partage de la position | Non | la qibla et les horaires de prière utilisent la position SUR l'appareil, jamais envoyée |
| Achats intégrés | Pas pendant la bêta | plus tard : abonnements, réservés à l'adulte (code parent) |

**Classification attendue** : Apple **4+** (ou 9+ selon le nouveau barème si la messagerie l'exige)
[à confirmer au questionnaire] ; Google Play / IARC : **PEGI 3 / Tout public** [à confirmer].

## 3. Apple — « Confidentialité de l'app » (étiquettes)

| Catégorie Apple | Donnée | Liée à l'utilisateur | Pistage | Finalité |
|---|---|---|---|---|
| Coordonnées | adresse e-mail (titulaire adulte) | oui | non | fonctionnalité de l'app (compte, récupération) |
| Identifiants | identifiant de compte | oui | non | fonctionnalité de l'app |
| Données d'utilisation | interactions (leçons faites, réponses, progression) | oui | non | fonctionnalité de l'app |
| Contenu utilisateur | réponses libres ; audio des récitations envoyées à l'enseignant (facultatif) | oui | non | fonctionnalité de l'app |
| Informations sensibles | **convictions religieuses** (révélées par l'usage, art. 9) | oui | non | fonctionnalité de l'app (consentement explicite) |
| Diagnostics | aucun (aucun outil de rapport d'incident) | — | — | — |
| Achats | plus tard : historique d'achats (référence du prestataire) | oui | non | fonctionnalité de l'app |

« Données utilisées pour vous pister » : **aucune**. Pas d'identifiant publicitaire.

## 4. Google Play — « Sécurité des données »

| Type de données Google | Collectée | Partagée | Facultative | Finalité |
|---|---|---|---|---|
| Informations personnelles → adresse e-mail | oui | non | non (titulaire) | gestion du compte |
| Informations personnelles → convictions religieuses ou politiques | oui (révélées par l'usage) | non | non (consentement explicite, retirable : compte en pause) | fonctionnalité de l'app |
| Activité dans l'app → interactions, autre contenu généré | oui | non | non | fonctionnalité de l'app |
| Audio → enregistrements vocaux | oui, seulement si la famille envoie une récitation | non | **oui** | fonctionnalité de l'app |
| Identifiants de l'appareil ou autres | non | — | — | — |
| Position | non (calcul sur l'appareil) | — | — | — |

Pratiques de sécurité : chiffrement en transit (HTTPS) : **oui** ; demande de suppression des données : **oui**
(dans l'application, « Mon compte » ; effacement définitif sous 30 jours) ; engagement Familles : **oui**.
Sous-traitants qui reçoivent des données : hébergeur (UE), prestataire d'e-mail [à désigner], fournisseur d'IA
seulement si le tuteur est activé (désactivé par défaut pour les enfants) — à aligner sur la politique.

## 5. Suppression du compte (exigence des deux boutiques)

- Dans l'application : « Mon compte » → « Supprimer mon compte » (mot de passe ressaisi) ; accès coupé aussitôt,
  effacement définitif sous 30 jours ; export des données proposé avant.
- **Abonnement d'une boutique** : la suppression ne l'arrête pas ; l'application le rappelle toujours et avertit
  nommément (« App Store » / « Google Play ») si un abonnement de boutique est encore actif
  (`GET /api/v1/account/suppression`). Lien de résiliation à ajouter quand les achats intégrés existeront.
- Google Play exige aussi une **page web** de demande de suppression (sans installer l'application) : [à créer,
  par exemple `https://awzid.com/supprimer-mon-compte`, renvoyant vers la connexion puis « Mon compte »].
