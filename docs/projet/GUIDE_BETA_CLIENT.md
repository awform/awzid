# Guide du client — ouvrir la bêta fermée d’Awzid

*Pas à pas, en français simple. À chaque étape : **ce que vous faites** et **ce que je fais** (Claude). Rien n’est mis
en ligne, aucun compte n’est créé, aucune dépense n’est lancée sans que vous l’ayez décidé ici.*

## En bref

- **La bêta est fermée** : personne ne peut s’inscrire sans un **code d’invitation** (usage unique ou limité,
  avec date de fin, annulable). Le site est **invisible** (ni Google, ni aperçu sur les réseaux sociaux).
- **Le serveur** sera chez Google Cloud, à **Paris**, avec le nom `beta.awzid.com`, en HTTPS.
- **Les sauvegardes** sont chiffrées chaque nuit et copiées hors de la machine. **La clé qui les ouvre est à vous** : sans
  elle, elles sont illisibles (étape 6).
- **Un bouton « Fermer le site »** (espace administrateur) met une page de maintenance pour tout le monde sauf vous.
- Temps pour vous : environ **2 heures** réparties sur quelques jours (le domaine peut prendre quelques heures à
  « se propager »).

### Le tableau des tâches

| # | Étape | Vous | Moi (Claude) |
|---|---|---|---|
| 1 | Acheter le domaine `awzid.com` | achat, 2 réglages de sécurité | rien (je ne touche jamais au domaine) |
| 2 | Google Cloud : projet, facturation, alerte à 10 € | 4 clics dans la console, connecter `gcloud` | scripts prêts (relus à blanc) |
| 3 | Décider du coût et du plafond | choisir | je règle le plafond et l’alerte |
| 4 | Créer le serveur | dire « feu vert » | je lance les scripts |
| 5 | Ajouter l’enregistrement DNS | copier 1 ligne chez le registraire | je donne la ligne exacte et je vérifie |
| 6 | Garder la clé de sauvegarde | copie sur clé USB, test mensuel | je prépare le test |
| 7 | Service d’e-mail (invitations) | créer le compte, coller 1 mot de passe sur le serveur | je guide, sans voir le mot de passe |
| 8 | Inviter un relecteur | 1 formulaire | je regarde que tout arrive |

---

## Étape 1 — Acheter le nom de domaine `awzid.com`

**Pourquoi** : c’est l’adresse du site (`beta.awzid.com`) et l’adresse d’où partiront les e-mails.

**Ce que vous faites**
1. Choisissez un **registraire** (le magasin de noms de domaine). Un européen est conseillé : Gandi, OVHcloud ou Scaleway.
   Prix : environ **10 à 15 € par an** pour un `.com`.
2. Cherchez `awzid.com`, ajoutez-le au panier. *Capture à voir : un champ de recherche, un résultat « disponible », un bouton
   « Ajouter au panier ».*
3. **Refusez** les options inutiles : hébergement web, boîtes e-mail, « protection premium », site tout fait. Gardez
   seulement : *la protection des données personnelles du titulaire (WHOIS)*, souvent gratuite.
4. Après l’achat, dans les réglages du domaine, activez **trois choses** :
   - le **renouvellement automatique** (sinon le site disparaît un jour sans prévenir) ;
   - le **verrouillage du transfert** (empêche qu’on vous vole le domaine) ;
   - la **double authentification** sur votre compte chez le registraire (code sur le téléphone).
5. Notez dans votre gestionnaire de mots de passe : l’adresse du registraire, votre identifiant, la date de renouvellement.

**Ce que je fais** : rien. Je ne me connecte jamais à votre registraire et je ne vous demande jamais votre mot de passe.

**Vérifier** : en cherchant `awzid.com` sur le site du registraire, il apparaît dans « Mes domaines ».

---

## Étape 2 — Google Cloud : le projet, la facturation, l’alerte à 10 €

Vous avez déjà un compte Google Cloud avec environ **264 € de crédit** (il expire début janvier 2027) et un budget de
10 € par mois configuré. On va préparer le projet du serveur.

**Ce que vous faites** (dans `console.cloud.google.com`, connecté avec votre compte Google)
1. En haut de la page, cliquez sur le **sélecteur de projet** → **Nouveau projet**. Nom : `awzid-beta`. Cliquez **Créer**.
   *Capture à voir : une fenêtre « Nouveau projet » avec le nom et un identifiant gris en dessous, du genre
   `awzid-beta-123456`. **Notez cet identifiant** : c’est le `PROJECT_ID`.*
2. Menu ☰ → **Facturation** → vérifiez que le projet `awzid-beta` est **lié à votre compte de facturation** (sinon : « Associer
   un compte de facturation »). Le crédit s’applique tout seul.
3. Toujours dans **Facturation** → **Budgets et alertes** → **Créer un budget** :
   - Nom : `Alerte 10 EUR` ; Projets : `awzid-beta` ; Montant : **10 €** par mois ;
   - Seuils : **50 %, 90 %, 100 %** ; cochez « E-mail aux administrateurs de la facturation ».
   *C’est une alerte : elle prévient, elle n’arrête rien.* (Le plafond qui arrête vraiment la machine est mis en place à
   l’étape 4 par mes scripts.)
   Notez aussi l’**identifiant du compte de facturation** (forme `012345-6789AB-CDEF01`, en haut de la page Facturation).
4. **Connecter l’outil `gcloud` pour moi** : sur la machine de développement (le terminal où je travaille), tapez
   `gcloud auth login --no-launch-browser`. Il affiche un lien : ouvrez-le sur votre PC, choisissez votre compte Google,
   autorisez, copiez le code affiché et collez-le dans le terminal. *Je ne vois jamais votre mot de passe Google ; seul le
   droit d’agir sur le projet reste sur la machine, et vous pouvez le retirer à tout moment avec
   `gcloud auth revoke`.*

**Ce que je fais** : vous donne un fichier `config.env` à relire (projet, région Paris, nom de la machine, adresse
d’alerte). Je lance d’abord chaque script **« à blanc »** (il affiche ce qu’il ferait sans rien créer) et vous montre le
résultat.

**Vérifier** : la console affiche le projet `awzid-beta` avec « Facturation : activée ».

---

## Étape 3 — Le coût (estimation, à confirmer avec le calculateur de Google)

Prix approximatifs **par mois**, région Paris, en euros, hors taxes (estimation du 13/10/2026 ; la vraie valeur est donnée
par `cloud.google.com/products/calculator` — à vérifier avant de dire « feu vert ») :

| Poste | Réglage proposé | Coût mensuel estimé |
|---|---|---|
| Machine virtuelle | `e2-small` (2 Go) — suffit pour une vingtaine d’invités | 14 à 16 € |
| Même, plus confortable | `e2-medium` (4 Go) | 28 à 32 € |
| Disque | 60 Go « équilibré » | 7 à 8 € |
| Adresse IP fixe | 1 | 3 à 4 € |
| Sauvegardes (Cloud Storage, 35 jours) | quelques Go | moins de 1 € |
| Trafic sortant | quelques invités | 0 à 2 € |
| **Total avec `e2-small`** | | **environ 26 à 31 €** |
| **Total avec `e2-medium`** | | **environ 40 à 47 €** |
| Domaine `awzid.com` | une fois par an | 10 à 15 € par **an** |

À savoir, franchement :
- **L’alerte à 10 € sonnera** dès les premiers jours du mois : un serveur seul coûte plus de 10 €. Le crédit de 264 €
  couvre ces dépenses jusqu’à son expiration (début janvier 2027), soit environ 2,5 mois ≈ 70 à 80 € dépensés sur le crédit.
  Après cela, c’est votre carte qui paie : à décider avant janvier.
- Le **disque** de 60 Go suppose de ne mettre sur le serveur ni les 27 Go d’enregistrements du Coran de la machine de
  développement, ni… tout le reste : pour la bêta, les récitateurs en ligne (déjà prévus) suffisent. Si vous voulez l’audio
  complet sur le serveur, il faudra un disque de 100 à 150 Go (+ 6 à 12 € par mois).
- Le **plafond** que je règle est un **filet de sécurité** : à 45 € de dépense réelle dans le mois (réglable), la machine
  est **arrêtée** (pas supprimée, les données restent). Google met les coûts à jour avec quelques heures de retard : ce
  n’est pas un arrêt à l’euro près.

**Ce que vous faites** : choisissez (a) `e2-small` ou `e2-medium` ; (b) le montant du plafond (45 € par défaut) ; (c) si vous
acceptez que l’alerte à 10 € sonne.
**Ce que je fais** : j’écris ces choix dans `config.env` et je règle les budgets (`infra/prod/gcp/budget.sh`).

---

## Étape 4 — Créer le serveur à Paris

**Ce que vous faites** : relisez le résultat « à blanc » que je vous montre, puis dites **« feu vert serveur »** dans la
conversation. Je n’agis pas avant ce mot.

**Ce que je fais** (scripts dans `infra/prod/gcp/`, chacun relancable sans danger) :
1. `budget.sh` — alerte à 10 €, plafond, arrêt automatique de la machine au plafond ;
2. `sauvegardes.sh` — compartiment de sauvegardes en Belgique (autre région que Paris), accès interdit au public, la machine ne
   peut qu’**ajouter** des fichiers, effacement automatique après 35 jours ;
3. `pare-feu.sh` — ouvre seulement le web (80 et 443) ; la porte d’administration (SSH) n’est joignable que par le tunnel
   sécurisé de Google ;
4. `creer-serveur.sh` — la machine à Paris, disque chiffré, démarrage sécurisé, mises à jour de sécurité automatiques,
   redémarrage de nuit à 4 h 30 si nécessaire ;
5. `dns.sh` — vous donne l’adresse IP à mettre dans le DNS (étape 5) ;
6. `envoyer.sh` — envoie l’application, les livres, et lance le déploiement en production.

**Vérifier** : dans la console, **Compute Engine → Instances** : `awzid-beta`, zone `europe-west9-a`, coche verte.

---

## Étape 5 — Ajouter l’enregistrement DNS

**Pourquoi** : pour que `beta.awzid.com` mène à votre serveur.

**Ce que vous faites** : chez le registraire, ouvrez **« Zone DNS »** (ou « DNS » → « Enregistrements ») de `awzid.com` →
**Ajouter un enregistrement** :

| Type | Nom (hôte) | Valeur | Durée (TTL) |
|---|---|---|---|
| `A` | `beta` | l’adresse IP que je vous donne (forme `34.xx.xx.xx`) | 300 |

*Capture à voir : un tableau d’enregistrements, un bouton « Ajouter », trois champs (type, nom, valeur).*
**Ne créez rien d’autre** (pas de `www`, pas d’enregistrement pour `awzid.com` seul) : le site de la bêta doit rester
invisible. Les enregistrements pour l’e-mail viennent à l’étape 7.

**Ce que je fais** : je vous donne la ligne exacte (`infra/prod/gcp/dns.sh`) et je vérifie que `beta.awzid.com` répond.
Le certificat HTTPS est obtenu tout seul par le serveur dès que l’adresse répond (quelques minutes).

**Vérifier** : sur votre PC, ouvrez `https://beta.awzid.com/etat` : une page « État du service Awzid » avec un point vert.

---

## Étape 6 — Garder la clé de sauvegarde (la plus importante de toutes)

**Ce que c’est** : chaque nuit, la base (comptes, progression) est chiffrée avec une **clé publique** (elle reste sur le
serveur : elle sait fermer, pas ouvrir) puis copiée hors de la machine. Pour la **rouvrir** en cas de catastrophe, il faut
la **clé privée**. Elle est créée à l’installation, sortie du serveur, et **elle est à vous**.

> **Sans la clé privée, toutes les sauvegardes sont du sable : personne, pas même moi, ne peut les rouvrir.**
> Avec elle, quelqu’un qui a aussi accès aux fichiers de sauvegarde peut lire toutes les données. Il faut donc la garder
> **en deux exemplaires, hors ligne, et la montrer à personne**.

**Ce que vous faites**
1. Après l’installation, lancez sur votre PC `infra\pc\recuperer-cle-sauvegarde.ps1` (je vous montre comment) : le fichier
   `awform-sauvegardes-cle-privee-….asc` arrive dans `Documents\khadija\AWFORM-production\cles-sauvegarde\`, et la copie est
   **effacée du serveur**. Le serveur le signale en alerte tant que ce n’est pas fait.
2. **Copiez ce fichier sur une clé USB** (rangée à la maison, étiquetée « Awzid — clé de sauvegarde »). Une **deuxième** clé
   USB chez une personne de confiance, ou dans un coffre. Ne l’envoyez **jamais** par e-mail, messagerie ou stockage en ligne
   non chiffré.
3. **Une fois par mois**, lancez `infra\pc\test-restauration.ps1` : il prouve que la clé ouvre bien la dernière sauvegarde (il
   restaure dans une base temporaire, compare, efface). Le serveur vous alerte si le dernier test a plus de 35 jours.

**Ce que je fais**
- `infra/prod/backup.sh` : sauvegarde chiffrée chaque nuit à 2 h 30 (14 conservées sur la machine, 35 jours dans le
  compartiment), journal, alerte si une nuit manque.
- `infra/prod/backup-selftest.sh` : **test de restauration complet rejouable** (fait le 13/10/2026 sur la machine de
  développement : voir le journal), sans toucher à votre clé.
- Je ne lis, n’affiche ni ne copie jamais la clé privée.

**Vérifier** : `test-restauration.ps1` se termine par « restauration : ok ».

---

## Étape 7 — Le service d’e-mail (pour envoyer les invitations)

**Pourquoi** : une invitation personnelle peut partir par e-mail depuis `no-reply@awzid.com`. Sans ce service, tout marche
quand même : je vous donne le lien de chaque invitation et vous l’envoyez vous-même.

**Ce que vous faites**
1. Créez un compte chez un service d’envoi d’e-mails (Brevo, Scaleway TEM ou Postmark) et **ajoutez le domaine `awzid.com`**.
2. Il vous donne 3 ou 4 lignes DNS (SPF, DKIM, DMARC) : collez-les chez le registraire, au même endroit qu’à l’étape 5.
3. Il vous donne un **identifiant SMTP** et un **mot de passe SMTP** : **ne me les envoyez pas**. Je vous indiquerai la seule commande
   à taper sur le serveur pour les coller dans son fichier secret (`~/.config/awform/prod.env`), droits réservés.
4. Indiquez-moi l’**adresse e-mail qui recevra les alertes** (`AWFORM_ALERTE_A`) : la vôtre.

**Ce que je fais** : je branche le service (`AWFORM_MAIL=smtp`) et j’envoie un e-mail d’essai
(`infra/prod/alerte.sh --essai`). Ensuite, le serveur vous écrit seul si quelque chose cloche (service arrêté, sauvegarde
manquante, disque presque plein…), au plus une fois toutes les 6 heures pour le même problème, et vous écrit « rétabli »
quand tout va mieux.

**Vérifier** : l’e-mail d’essai arrive (regardez aussi les courriers indésirables).

---

## Étape 8 — Inviter un relecteur

**Ce que vous faites**
1. Ouvrez `https://beta.awzid.com/connexion` et connectez-vous avec le **compte administrateur** (je le crée avec vous au
   terminal, mot de passe saisi par vous, sans que je le voie ; il demande un code à 6 chiffres sur le téléphone).
2. Menu → **Administration** → bloc **« Accès à la bêta »** → **Invitations** :
   - *Nom ou note* : « Relecteur — Dr X » ;
   - *Adresse e-mail* : celle du relecteur (**invitation personnelle** : seule cette adresse peut l’utiliser) ;
   - *Valable* : 30 jours ; case **« Envoyer par e-mail »** cochée → **Créer l’invitation**.
   *Capture à voir : un encadré avec un code du genre `AWZ-7K3QM-4TXPD` et un lien. **Ils ne seront plus affichés** : copiez-les
   si l’e-mail n’est pas parti.*
3. Le relecteur ouvre le lien, voit « Invitation reconnue », crée son compte. Il voit en haut le bandeau
   « Version bêta — le contenu religieux est tranché par le référent selon l’école mālikite, sources citées, en attente
   d’une seconde lecture savante » (il peut le fermer).
4. Pour **annuler** une invitation : même bloc, bouton **Révoquer**.

Autres cas : un **code partagé** pour une classe (laisser l’adresse vide, mettre « Inscriptions permises » à 20, durée 14 jours) ;
la **liste d’attente** (les personnes sans code demandent une invitation depuis la page d’inscription ; vous les voyez dans
« Liste d’attente » et cliquez **Accepter et inviter** ou **Refuser**).

**Les trois modes d’accès, en un clic** (bloc « Accès à la bêta » → « Mode d’accès »), effet en quelques secondes, sans rien
redéployer :

| Mode | Ce que voient les visiteurs |
|---|---|
| **Fermé** | une page de maintenance sobre ; seuls les administrateurs entrent (une confirmation est demandée) |
| **Sur invitation** | il faut un code d’invitation pour créer un compte ; sinon, demande d’invitation (liste d’attente) |
| **Ouvert (avec plafond)** | inscription libre jusqu’au **plafond de comptes** que vous fixez (200 au départ) ; une fois atteint, les nouvelles personnes passent **toutes seules en liste d’attente** |

**Retour arrière** : cliquez simplement sur le mode d’avant. Rien n’est perdu (comptes, invitations, liste d’attente). Pour ouvrir
davantage de places, **relevez le plafond** (champ « Plafond d’inscriptions », bouton « Enregistrer le plafond ») : l’inscription
libre rouvre aussitôt. À utiliser « Fermé » si vous découvrez un problème grave pendant la bêta.

**Tableau de bord** (en haut du même bloc) : nombre de comptes sur le plafond, nouveaux comptes (24 h, 7 jours), adresses non
vérifiées, demandes en attente, **coût estimé du jour**, plafonds par utilisateur, et des **alertes** en clair (« plafond presque
atteint », « demandes en attente », « le coût du jour dépasse le seuil », « l’envoi d’e-mails n’est pas réglé »…).

**Protections** (deux interrupteurs dans le même bloc) :
- **Adresse e-mail à vérifier avant d’utiliser le compte** : la personne reçoit un lien ; tant qu’elle ne l’a pas ouvert, elle voit
  une page « Vérifiez votre adresse e-mail » (renvoi du lien possible). Ne fonctionne que si le service d’e-mail (étape 7) est branché.
- **Protection anti-robots de l’inscription** : sans service extérieur ni cookie (un jeton invisible, un délai de 3 secondes, un
  champ piège). Si des robots passent malgré tout, deux options sont prêtes à étudier avec vous, **sans rien créer à votre place** :
  ALTCHA (auto-hébergé, respecte la vie privée) ou Cloudflare Turnstile (plus efficace, mais service tiers : un compte à créer par vous).

**Plafonds par utilisateur** (tout ce qui coûte a une limite par personne) : tuteur IA (1 $ par mois pour un enfant, 3 $ pour un
adolescent ou adulte, ensuite il répond sans modèle), écoute IA de la récitation (60 par heure), stockage des récitations
(30 Mo par élève), avis et signalements (5 par jour). La synthèse vocale est préparée à l’avance : aucun coût par utilisateur.

**Ce que je fais** : je vérifie avec vous que l’invitation arrive, que l’inscription marche une seule fois avec ce code, que
la révocation et la fermeture fonctionnent.

---

## Ce qui peut mal tourner (et quoi faire)

| Situation | Que faire |
|---|---|
| Un e-mail d’alerte arrive | Ne rien faire tout de suite : écrivez-moi l’objet du message. |
| `beta.awzid.com` ne répond pas | Ouvrez `/etat` ; sinon dites-le moi. Console Google → Compute Engine : la machine est-elle « arrêtée » (plafond atteint) ? |
| La machine a été arrêtée par le plafond | Regardez la facture (Facturation → Rapports). Si c’est normal, dites-le moi : je relance la machine (`gcloud compute instances start`). |
| Vous avez perdu la clé de sauvegarde | Dites-le **tout de suite** : une nouvelle paire est créée et la prochaine sauvegarde est lisible ; les anciennes sont perdues. |
| Un invité a envoyé son code à quelqu’un d’autre | Révoquez l’invitation (bouton) : les personnes déjà inscrites restent. |
| Vous voulez tout arrêter d’un coup | **Fermer le site** (bouton). Pour arrêter aussi les frais : Google Cloud → Compute Engine → **Arrêter** la machine (le disque coûte encore ≈ 8 €/mois). |

## Décisions que j’attends de vous

1. `beta.awzid.com` convient-il comme adresse de la bêta ? (la vitrine `awzid.com` viendra plus tard)
2. `e2-small` ou `e2-medium` ? Plafond à 45 € ? Alerte à 10 € laissée telle quelle ?
3. Audio du Coran : récitateurs en ligne seulement (60 Go) ou copie complète (100 à 150 Go) ?
4. Qui reçoit les e-mails d’alerte ?
5. Quel service d’e-mail (Brevo, Scaleway TEM, Postmark) ?
