# Procédure en cas de violation de données personnelles

> **Provisoire — avant signature d'un juriste ; en attente d'une seconde lecture juridique.** 13/10/2026.
> Bases lues à la source : RGPD art. 33 (notification à l'autorité sous 72 h « si possible », contenu minimal,
> notification par étapes, documentation de toute violation) ; Quran Foundation, Developer Terms § 9 (signaler à
> developers@quran.com sous 24 h tout accès non autorisé ou exposition de données lié à leurs API) ; loi sénégalaise
> 2008-12 art. 70-71 (sécurité, confidentialité). *Nous n'avons pas trouvé dans la loi 2008-12 d'obligation de notification
> à 72 h : demander à la CDP si elle attend une notification (voir le guide CDP).*

Une **violation** = destruction, perte, altération, divulgation ou accès non autorisé à des données personnelles
(compte piraté en masse, base exposée, sauvegarde volée, mauvais envoi d'e-mails, capture d'écran de signalement visible
d'un tiers…). En cas de doute, c'est une violation jusqu'à preuve du contraire.

## Rôles (bêta)

| Rôle | Qui | Mission |
|---|---|---|
| Responsable du traitement | le client (Awzid) | décide, signe les notifications, parle aux autorités |
| Cellule technique | Claude (provisoire) | détecter, confiner, enquêter, documenter, proposer le texte des notifications |
| Contact utilisateurs | [adresse de contact : à créer par le client] | reçoit les alertes des utilisateurs |

Aucun message n'est envoyé aux autorités ou aux utilisateurs sans l'accord du client.

## Étapes et délais

| Quand | Quoi |
|---|---|
| **T0** (prise de connaissance) | Noter l'heure exacte. Ouvrir une fiche dans le registre des violations (modèle ci-dessous). Prévenir le client. |
| **T0 à 24 h** | **Confiner** : couper l'accès fautif (désactiver le compte ou la route, interrupteur de fonction `fonctions` si c'est une fonction), révoquer les sessions, faire tourner les secrets concernés (voir `docs/projet/EXPLOITATION.md`, rotation des clés), isoler le serveur si nécessaire. Conserver les journaux (audit, accès) avant tout nettoyage. **Si des identifiants ou des données liés à Quran Foundation sont concernés : écrire à developers@quran.com dans les 24 h** (clé `QF_CLIENT_ID`/`QF_CLIENT_SECRET` compromise : la révoquer dans la Developer Console). |
| **T0 à 48 h** | **Qualifier** : nature (confidentialité, intégrité, disponibilité), nombre approximatif de personnes et d'enregistrements, catégories (enfants ? donnée religieuse ? voix ? e-mails ?), conséquences probables, mesures. Décider : risque nul / risque / risque élevé. |
| **≤ 72 h après T0** | Si la violation est susceptible d'engendrer un risque pour les personnes : **notifier l'autorité compétente** (CNIL pour la France ; autorité du pays de l'utilisateur concerné ; CDP au Sénégal si elle l'exige). Contenu minimal (art. 33(3)) : nature de la violation, nombre approximatif de personnes et d'enregistrements, nom et contact de la personne référente, conséquences probables, mesures prises ou proposées. Si tout n'est pas connu, notifier par étapes (art. 33(4)). Au-delà de 72 h : indiquer les motifs du retard. |
| **Sans délai excessif** | Si le risque est **élevé** (ex. base de profils d'enfants et d'accords « conviction religieuse » exposée) : **informer les personnes concernées** (le parent pour un enfant), en termes simples : ce qui s'est passé, ce qui est touché, ce que nous faisons, ce qu'elles peuvent faire (changer le mot de passe, vigilance), le contact. Via l'e-mail du compte et un bandeau dans l'application. |
| **Ensuite** | Corriger la cause, ajouter un test, mettre à jour l'AIPD et le registre, relire cette procédure. Clore la fiche. |

## Registre des violations (art. 33(5) : toute violation est documentée, notifiée ou non)

Un fichier par violation dans `docs/projet/juridique/violations/AAAA-MM-JJ-titre.md` (dossier à créer au premier incident) :

```
Date et heure de prise de connaissance :
Découverte par (qui, comment) :
Nature (confidentialité / intégrité / disponibilité) :
Données et catégories (enfants ? religieuse ? voix ? e-mails ? mots de passe) :
Nombre approximatif de personnes / d'enregistrements :
Cause :
Conséquences probables :
Mesures de confinement (heure) :
Notification à l'autorité : oui / non — pourquoi — date et heure — référence
Information des personnes : oui / non — pourquoi — date
Notification à Quran Foundation (si concerné, 24 h) :
Mesures correctives et tests ajoutés :
Décision du responsable :
```

## Scénarios fréquents

| Scénario | Premier geste |
|---|---|
| Mot de passe d'un compte trouvé dans une fuite externe | forcer la réinitialisation, révoquer les sessions de ce compte ; pas de notification si une seule personne et pas de fuite chez nous |
| E-mail de service envoyé au mauvais destinataire | couper l'envoi, vérifier le journal du prestataire, informer la personne concernée |
| Sauvegarde ou disque emporté | les sauvegardes sont chiffrées à clé publique (la clé privée n'est pas sur le serveur) : vérifier que la clé privée est intacte ; notification à évaluer (chiffrement = risque réduit) |
| Secret de production publié (dépôt, capture) | considérer comme compromis : rotation immédiate, journaux d'accès, évaluer |
| Enseignant voyant des élèves d'une autre classe | suspendre la route, corriger, tester, enquêter via le journal d'audit |
| Capture d'écran d'un signalement montrant un tiers | supprimer la capture (champ `capture`), vérifier la zone `data-prive` en cause |

## À faire avant l'ouverture publique

- Exercice à blanc (une fiche remplie sur un incident fictif) ; liste de contacts de crise du client ; adresse de contact de l'autorité de chaque pays d'ouverture ; test de rotation d'un secret en préproduction.
