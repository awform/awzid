# Registre des activités de traitement (RGPD, article 30)

> **BROUILLON — à valider par un juriste.** Rédigé le 30/09/2026 à partir du code de la branche `suite-v1-b`
> (tables de `packages/db/src/schema.ts`, durées de `packages/db/src/purge.ts`, périmètres des secrets
> `infra/prod/env-scopes.conf`). Les bases légales sont **proposées**, non décidées. Entre crochets : ce que seul
> le client peut fournir.

## Responsable du traitement

[Raison sociale d'AWFORM / Awzid, adresse, immatriculation — à compléter]. Contact « données personnelles » :
[adresse à créer]. Délégué à la protection des données : [à désigner si nécessaire — probable : traitement à
grande échelle de données de mineurs et, sans doute, de données révélant une conviction religieuse].

Pour l'**espace école** (classe papier, résultats, certificats, récital), l'école est **responsable** des données
qu'elle saisit ; Awzid est **sous-traitant** (article 28) : [contrat de sous-traitance type à rédiger].

## Point préalable : données « sensibles »

S'inscrire à une application d'apprentissage du **Coran** (hifẓ, lecteur coranique, sciences islamiques)
**peut révéler une conviction religieuse** : catégorie particulière (RGPD art. 9 ; loi sénégalaise 2008-12,
données sensibles). Le code ne recueille aujourd'hui **aucun consentement explicite à ce titre** (seulement
`cgu`, `compte_suivi`, `transfert_hors_pays`, `coppa_parent` et les accords facultatifs). **Décision du juriste
nécessaire (D18)** : consentement explicite (art. 9.2.a) au moment de l'inscription, ou autre fondement.

## Traitements

Légende des durées : **D9** (journal 12 mois, tuteur 12/24 mois, sessions 30 jours, paiements abandonnés 30
jours, verrous 24 h — provisoires) et **D11** (messages : 12 mois après la fin de l'année scolaire) sont des
décisions en attente (`docs/projet/DECISIONS_EN_ATTENTE.md`). Toutes les durées sont appliquées chaque nuit par
le travailleur (`apps/worker/src/tasks.ts`).

| # | Traitement | Finalité | Base légale proposée | Personnes et données | Durée | Destinataires | Transferts |
|---|---|---|---|---|---|---|---|
| 1 | Comptes et connexion | ouvrir un compte, se connecter, protéger l'accès | exécution du contrat (art. 6.1.b) | parent, adulte, enseignant, administrateur : e-mail, empreinte argon2id du mot de passe, pays, langue, année de naissance (adulte), second facteur chiffré (enseignant, admin), code parent (empreinte) ; sessions (cookie HttpOnly) ; verrous anti-essais (empreinte de l'e-mail, adresse IP) | compte : jusqu'à suppression, puis **effacement sous 30 jours** ; sessions : 30 jours après expiration ; verrous : 24 h (D9) | Awzid (hébergeur) | hébergement UE : transfert hors du pays pour les titulaires sénégalais, avec leur accord (`transfert_hors_pays`) |
| 2 | Profils d'enfants et consentements | créer le profil d'un enfant par son parent, prouver les accords | consentement du parent (art. 6.1.a, 8) ; obligation de preuve (art. 7.1) | enfant : pseudonyme, année de naissance (jamais la date), niveau, avatar — aucun nom réel, aucune photo ; accords datés, versionnés, avec leur preuve (méthode, pays, loi) | profil : comme le compte ; preuves d'accord : [durée à fixer — proposition : durée du compte + 5 ans (prescription)] | Awzid | idem 1 |
| 3 | Suivi pédagogique | exercices corrigés, progression, révisions espacées, hifẓ, carnet de pratique, sourates, réponses libres, épreuves | exécution du contrat ; pour l'enfant : consentement du parent (`compte_suivi`) | réponses et scores, progression, journal du hifẓ, tracés et cartes de mots, cases et signatures du carnet, étapes des sourates, réponses libres corrigées, copies d'épreuves | comme le compte | le titulaire ; l'enseignant de la classe **seulement si** la famille a inscrit l'enfant (`partage_enseignant`, retirable) | idem 1 |
| 4 | Enregistrement et envoi de la voix | écouter sa récitation ; l'envoyer à l'enseignant de la classe | consentement (`envoi_recitation`, code parent pour un enfant) | voix de l'élève (audio chiffré AES-256-GCM en base), passage, note de l'enseignant | appareil : **7 jours** ; envoyé : durée réglée par la classe (**1 à 30 jours, 14 par défaut**), ou dès que la famille le supprime | l'enseignant de la classe seulement | idem 1 |
| 5 | Espace école | classe, devoirs, classe papier, résultats, certificats et attestations, **récital de hifẓ**, tableau de bord de l'enseignant | école : mission éducative / contrat avec l'école ; Awzid sous-traitant | élèves : prénom et initiale (classe papier), nom arabe facultatif, genre facultatif (formules des documents), notes, présences ; nom complet seulement au moment d'un certificat ; récital : passages tirés au sort, compteurs du barème, note | élève parti : document du certificat **réduit 30 jours après** ; **registre des certificats durable** (numéro, nom affiché, niveau, date, mention : preuve d'un diplôme) [à confirmer] ; autres données : durée de la classe [à fixer par l'école] | l'enseignant de la classe ; la famille pour son enfant | idem 1 |
| 6 | Vérification publique d'un certificat | permettre à un tiers de vérifier un certificat (QR) | intérêt légitime (art. 6.1.f) [à valider, D8] | numéro, nom affiché (prénom + initiale), niveau, mention, date — **seulement avec le code du QR** ; essais limités | comme le registre (5) | toute personne qui détient le QR | — |
| 7 | Messagerie école ↔ famille et visio | annonces, fil privé enseignant ↔ famille, signalement, séances de visio planifiées | exécution du contrat (école) ; protection des mineurs (intérêt légitime) | textes et pièces jointes **chiffrés** (AES-256-GCM), lectures, signalements, séances (lien externe), présences | **12 mois après la fin de l'année scolaire** (D11) ; signalements gardés avec le message | enseignant, famille ; administrateur **seulement** pour un message signalé (journalisé) | idem 1 ; visio : **service externe** choisi par l'enseignant (ex. Jitsi) — Awzid ne transmet rien, l'utilisateur ouvre le lien |
| 8 | Tuteur (intelligence artificielle) | aide à la langue arabe ; questions religieuses transmises à l'enseignant | consentement (`tuteur_ia`, du parent pour un enfant, retirable) | questions, réponses, alertes (mots de détresse), pseudonyme | journal du tuteur **12 mois** ; questions et alertes : **12 mois une fois traitées, 24 mois au plus** (D9) | fournisseur **simulé** aujourd'hui (aucun envoi) ; plus tard, sur décision du client : fournisseur d'IA (Anthropic), sans nom ni adresse | plus tard : **États-Unis** (fournisseur d'IA) — clauses contractuelles types, [à prévoir] |
| 9 | Offres, paiement, codes d'activation | vendre les formules, activer un livre acheté | exécution du contrat ; obligation légale (comptabilité, art. 6.1.c) | formule, statut, référence du prestataire (jamais de numéro de carte) ; code d'activation : **empreinte seule**, date d'utilisation, titulaire | paiements réussis : [durée comptable — 10 ans en France, à vérifier au Sénégal] ; paiements abandonnés : **30 jours** (D9) ; accès par code : 12 mois | prestataire de paiement (**simulé** aujourd'hui : Stripe / mobile money plus tard) | selon le prestataire [à vérifier] |
| 10 | Notifications | rappels (désactivés par défaut ; code parent pour un enfant) | consentement (`rappels`) | abonnement du navigateur (adresse du service de notification, clés), préférences, heures calmes | jusqu'au retrait ; abonnement supprimé dès que le service le déclare expiré | service de notification du navigateur (Google, Apple, Mozilla…) : contenu chiffré, **sans nom** | **États-Unis** probable (services des navigateurs) |
| 11 | Sécurité et journal d'audit | tracer les actions sensibles, prévenir les abus | intérêt légitime ; obligation de sécurité (art. 32) | auteur, action, cible (identifiants), date ; à l'effacement d'un compte, cibles **pseudonymisées** | **12 mois** (D9) | Awzid ; autorités sur réquisition | — |
| 12 | Relais d'école (hors Internet) | faire travailler une école sans Internet | exécution du contrat avec l'école | file des envois des élèves **chiffrée** (AES-256-GCM, clé propre au relais), copie des contenus publics | envois : **effacés dès réception par le central** ; refusés : purgés | le serveur central seulement | — (dans l'école) |
| 13 | Sauvegardes | reprendre le service après un incident | intérêt légitime ; obligation de sécurité | copie chiffrée de la base (clé publique sur le serveur, clé privée hors du serveur) | **14 dernières** (≈ 14 jours glissants) | [stockage hors site à choisir, D10] | selon le stockage choisi |

## Mesures de sécurité (article 32) — résumé

Mots de passe argon2id ; second facteur obligatoire (enseignant, admin) ; comptes PostgreSQL séparés à droits
minimaux (API, travailleur, outils) ; secrets découpés par service ; chiffrement AES-256-GCM des voix, messages
et files du relais ; en-têtes de sécurité et CSP stricte ; scan OWASP ZAP sans échec (`docs/projet/ZAP.md`) ;
sauvegardes chiffrées à clé publique, **restauration testée automatiquement** ; journal d'audit ; aucun traceur.
Détail et preuves : `docs/juridique/AIPD_BROUILLON.md`.

## À compléter par le client ou le juriste

Identité du responsable ; DPO ; hébergeur et service d'e-mail ; contrat de sous-traitance avec les écoles ;
durée de conservation des preuves d'accord et des paiements ; **fondement pour la donnée religieuse (D18)** ;
formalités CDP (`docs/juridique/CDP_SENEGAL.md`).
