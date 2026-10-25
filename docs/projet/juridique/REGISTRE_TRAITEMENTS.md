# Registre des activités de traitement — bêta fermée (RGPD, article 30)

> **Provisoire — avant signature d'un juriste ; en attente d'une seconde lecture juridique.** Mise à jour du
> 13/10/2026 du registre `docs/juridique/REGISTRE_TRAITEMENTS.md` (30/09 et 06/10), d'après le code de `main`
> (`packages/db/src/schema.ts`, `purge.ts`, `apps/worker/src/tasks.ts`, `apps/api/src/*`). Les bases légales sont
> **proposées**. Crochets : ce que seul le client peut fournir.
> Références de loi **lues à la source** (13/10/2026) : RGPD art. 8, 9, 33, 35 (gdpr-info.eu) ; loi sénégalaise
> n° 2008-12, texte consolidé (senlii.org) : art. 4, 17, 18, 20, 40, 41, 49, 51, 52, 58 à 71.

## Responsable et rôles

- **Responsable du traitement** : [raison sociale, adresse, immatriculation — client]. Contact : [adresse à créer].
- **Écoles** : responsables de ce qu'elles saisissent (classe papier, résultats, certificats) ; Awzid est **sous-traitant**
  (RGPD art. 28 ; loi 2008-12 art. 39 et 52 : contrat écrit) — [contrat type à rédiger].
- **DPO** : non désigné. Le traitement de données de mineurs et de données révélant une conviction religieuse est
  visé par l'art. 35(3)(b) **« à grande échelle »** : la bêta fermée (quelques dizaines de personnes) n'y est pas ;
  la désignation sera revue avant l'ouverture publique.

## Données révélant une conviction religieuse (catégorie particulière)

S'inscrire à une application du Coran peut révéler une conviction religieuse. Fondement retenu : **consentement
explicite** (RGPD art. 9(2)(a)), recueilli séparément (case non cochée d'avance, daté, version du texte
`TEXT_VERSION = 2026-10-13`, preuve), par profil d'enfant (donné par le parent, code parent). Loi 2008-12 : données
sensibles (art. 4), traitement interdit sauf exceptions dont le **consentement exprès écrit** (art. 40-41). Retrait =
compte ou profil mis en pause ; export et suppression disponibles. Détail : `AIPD_MINEURS_DONNEES_RELIGIEUSES.md`.

## Traitements

Durées : voir `DUREES_CONSERVATION.md` (décisions D9, D11 en attente de validation).

| # | Traitement | Finalité | Base légale proposée | Personnes et données | Durée | Destinataires | Transferts |
|---|---|---|---|---|---|---|---|
| 1 | Comptes et connexion | ouvrir un compte, s'authentifier | contrat (art. 6.1.b) | parent, adulte, enseignant, admin : e-mail, empreinte argon2id, pays, langue, fuseau, année de naissance (adulte), second facteur chiffré (staff) ; sessions (cookie HttpOnly) ; verrous anti-essais (empreinte d'e-mail, IP) | compte jusqu'à suppression, puis 30 jours ; sessions 30 j après expiration ; verrous 24 h | Awzid, hébergeur | UE (Paris) ; titulaires sénégalais : avec leur accord (`transfert_hors_pays`) |
| 2 | Profils d'enfants et accords | profil créé par le parent, preuve des accords | consentement du parent (art. 6.1.a, 8) ; preuve (art. 7.1) | pseudonyme, année de naissance, niveau, avatar ; accords datés, versionnés, méthode, pays | profil : comme le compte ; preuves : compte + 5 ans [à valider] | Awzid | idem 1 |
| 3 | Données révélant une conviction religieuse (accord art. 9) | rendre possible l'apprentissage du Coran | consentement explicite (art. 9(2)(a)) | accord `donnee_religieuse_art9`, date, version, preuve (mot de passe ressaisi) ; le suivi pédagogique (4) est la donnée qui peut révéler la conviction | comme le compte | Awzid | idem 1 |
| 4 | Suivi pédagogique | exercices, progression, révisions, hifẓ, carnet, réponses libres, épreuves | contrat ; enfant : consentement du parent (`compte_suivi`) | réponses, scores, journal du hifẓ, tracés, cartes de mots, étapes des sourates | comme le compte | titulaire ; enseignant **seulement si** la famille a inscrit l'enfant (retirable) | idem 1 |
| 5 | Voix : enregistrement local et envoi à l'enseignant | écouter sa récitation ; l'envoyer à l'enseignant | consentement (`envoi_recitation`) | audio chiffré AES-256-GCM, passage, note | appareil 7 jours ; envoyé : 1 à 30 jours (14 par défaut) ou suppression par la famille | enseignant de la classe | idem 1 |
| 5 bis | Hifẓ en classe (interrupteur `hifz_classe`, canal bêta) | le maître écoute l'élève, coche ses erreurs mot par mot, valide la portion ; les parents voient le suivi | mission de l'école ; **mode enregistrement : consentement** (`envoi_recitation`) réservé aux **adultes** ; mode direct : aucune voix | séance (portion, mode, issue, remarque 300 car.), erreurs cochées (verset, rang du mot, type) ; mode enregistrement seulement : audio chiffré AES-256-GCM (comme 5) | direct : comme le suivi pédagogique (4) ; enregistrement : **30 jours au plus** puis suppression automatique chaque nuit, ou suppression par l'élève | maître de la classe ; parents : suivi sans audio | idem 1 |
| 6 | Analyse de la voix par IA (« Réciter et vérifier », canal bêta) | comparer la récitation au texte, mot par mot | consentement séparé (`analyse_vocale_ia`), code parent pour un enfant | voix traitée **en mémoire** par un modèle auto-hébergé (NVIDIA FastConformer, CC BY 4.0) ; aucun enregistrement | aucune | service d'écoute d'Awzid (même hébergeur) | aucun |
| 6 bis | Indication des madd (interrupteur `tajwid_madd`, **bêta fermée, adultes seulement**) | indiquer à l'adulte qu'un madd long de son verset semble trop court (« indication automatique, en cours de validation par des maîtres ») | même consentement séparé (`analyse_vocale_ia`) que 6 | voix d'UN verset traitée **en mémoire** par un modèle auto-hébergé (Wav2Vec2-BERT « Muaalem », **licence à confirmer avant activation**), comparée à la récitation d'Ayyūb ; aucun enregistrement ; journal d'audit : verset, type de madd, décision | aucune (voix) ; journal d'audit 12 mois (D9) | service d'écoute d'Awzid, conteneur à part (même hébergeur) | aucun |
| 7 | Espace école | classe, devoirs, classe papier, certificats, récital | mission de l'école ; Awzid sous-traitant | prénom + initiale, notes, présences ; nom complet seulement pour un certificat | élève parti : document réduit après 30 jours ; registre des certificats durable [à valider] | enseignant, famille | idem 1 |
| 8 | Vérification publique d'un certificat (QR) | permettre à un tiers de vérifier | intérêt légitime (D8) | numéro, nom affiché, niveau, mention, date — avec le code du QR seulement | comme le registre (7) | détenteur du QR | — |
| 9 | Messagerie école ↔ famille, visio | annonces, fil privé, signalement | contrat (école) ; protection des mineurs | textes et pièces jointes chiffrés, lectures, signalements | 12 mois après la fin de l'année scolaire (D11) | enseignant, famille ; admin seulement pour un message signalé | idem 1 ; visio : lien externe choisi par l'enseignant |
| 10 | Tuteur d'IA | aide à la langue arabe ; questions religieuses transmises à l'enseignant | consentement (`tuteur_ia`) | questions, réponses, alertes, pseudonyme | journal 12 mois ; alertes 12 à 24 mois (D9) | **fournisseur simulé : rien n'est envoyé en bêta**. Prévu : Gemini via Vertex AI (Google), sans nom ni adresse | prévu : région UE de Vertex AI [à confirmer] ; le code actuel prévoit un autre fournisseur (`ANTHROPIC_API_KEY`) : à adapter avant activation, et **AIPD à réviser** |
| 11 | Signalements « Signaler un problème » et avis | corriger les erreurs, améliorer le service | intérêt légitime ; contenu religieux : mission d'exactitude du contenu | catégorie, texte (500 car.), page (chemin), version, rôle, tranche d'âge, profil ; capture d'écran **facultative** (masquée sur l'appareil) ; enfant : catégorie seulement | capture 90 jours ; signalement réglé 12 mois ; avis 12 mois | équipe Awzid (administrateur, support) | idem 1 |
| 12 | Signalements d'erreur dans un texte (verset, hadith, règle) et errata | corriger les textes religieux | intérêt légitime ; transparence | compte auteur (interne), motif, commentaire (500 car.), extrait ; **errata publics sans auteur ni commentaire** | signalement : durée du compte ; erratum : durable (correction publique) | référent, administrateur ; public pour l'erratum | — |
| 13 | Usage sans traceur | savoir quels espaces servent | intérêt légitime | clés d'espaces (liste fermée), 1 fois par jour ; totaux par jour ; seuil d'anonymat ≥ 10 | empreintes 2 jours ; totaux sans personne | administrateur | — |
| 14 | Récupération du compte et e-mails de service | vérifier, réinitialiser | contrat ; sécurité | e-mail ; liens à usage unique (empreinte, usage, dates) | 30 min ou 24 h ; effacés avec le compte | prestataire d'e-mail [à désigner, UE] | selon prestataire |
| 15 | Invitation à la bêta (accès par code) | limiter l'accès aux invités | intérêt légitime ; contrat | code (empreinte), date d'utilisation, titulaire — **à compléter avec le lot « invitation »** (branche `beta-wip`) | [à fixer avec ce lot] | Awzid | — |
| 15 bis | Liste d'attente de la bêta (page d'accueil publique) | gérer les demandes d'invitation | consentement (case non cochée d'avance, confirmé par un lien envoyé à l'adresse : double consentement) | e-mail, langue de la page ; prénom et mot facultatifs (écran de l'application seulement) ; statut de la demande | 12 mois si confirmée, 7 jours sinon (`purgeListeAttente`) ; désinscription par lien ; effacement sur demande écrite | Awzid | — (hébergement UE, Paris) |
| 16 | Notifications | rappels (désactivés par défaut) | consentement (`rappels`) | abonnement du navigateur, préférences | jusqu'au retrait | service du navigateur (Google, Apple, Mozilla) : contenu chiffré, sans nom | États-Unis probable |
| 17 | Offres, paiement | vendre les formules (**désactivé en bêta**) | contrat ; obligation légale | formule, statut, référence prestataire, jamais de carte | [durée comptable à fixer] ; abandonnés 30 jours | prestataire de paiement (simulé) | selon prestataire |
| 18 | Sécurité, audit | tracer les actions sensibles | intérêt légitime ; art. 32 | auteur, action, cible, date | 12 mois (D9) | Awzid ; autorités sur réquisition | — |
| 19 | Sauvegardes | reprise après incident | intérêt légitime ; art. 32 | copie chiffrée de la base | 14 dernières (~14 jours) | [stockage hors site à choisir, D10] | selon stockage |
| 20 | Relais d'école hors Internet | école sans Internet | contrat avec l'école | file chiffrée des envois | effacés à réception | serveur central | — |

## Sous-traitants et destinataires (état à la bêta)

| Fournisseur | Rôle | Données | Pays / région | Contrat et lien | État |
|---|---|---|---|---|---|
| Google Cloud Platform | hébergement, base, sauvegardes | toutes les données du service | Paris (europe-west9) | contrat Google Cloud, avenant de traitement [à vérifier dans la console]. Lien : [à ajouter] | compte créé, serveur public prévu |
| Prestataire d'e-mail | e-mails de service | adresse du destinataire, contenu du message de service | UE [à choisir] | [à signer] | à désigner (`AWFORM_MAIL=smtp`) |
| Quran Foundation | contenus (récitations en ligne, lignes du Muṣḥaf) | **aucune donnée de l'utilisateur** ; l'appareil qui joue un récitateur « en ligne » charge le fichier chez QF (IP visible) | États-Unis [à confirmer] | Developer Terms ; pas un sous-traitant au sens strict, mais **destinataire technique** de l'IP : décrit dans la politique | actif si la fonction est activée |
| Google (Vertex AI / Gemini) | tuteur d'IA | pseudonyme, questions | UE [à confirmer] | [à signer] | **désactivé en bêta** |
| Google Cloud Text-to-Speech | voix des leçons | **aucune donnée d'utilisateur** : fichiers générés à l'avance depuis les textes des livres | — | conditions Google Cloud TTS (D31) | actif (fichiers statiques) |
| Services de notification des navigateurs | rappels | abonnement, contenu chiffré | États-Unis probable | — | seulement si l'utilisateur active |
| Prestataires de paiement | paiement | — | — | — | désactivé en bêta |

## Mesures de sécurité (art. 32 ; loi 2008-12 art. 70-71)

Mots de passe argon2id ; second facteur obligatoire (enseignant, admin) ; comptes PostgreSQL séparés à droits minimaux ;
secrets découpés par service (`infra/prod/env-scopes.conf`) ; chiffrement AES-256-GCM des voix, messages et files du
relais ; CSP stricte, aucun script tiers ; scan ZAP (`docs/projet/ZAP.md`) ; sauvegardes chiffrées à clé publique,
restauration testée ; journal d'audit ; aucun traceur. Détail : `AIPD_MINEURS_DONNEES_RELIGIEUSES.md` § 5.
