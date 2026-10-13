# Guide du client — ouvrir la bêta fermée d’Awzid

*Pas à pas, en français simple. À chaque étape : **ce que vous faites** et **ce que je fais** (Claude). Règle générale : **vous**
faites les connexions à vos comptes et les paiements ; **moi**, je n’exécute les commandes qu’une fois la connexion faite, et je ne
crée aucune ressource payante et n’ouvre pas le site au public sans votre accord écrit dans la conversation.*

## Où on en est (déjà fait, rien à refaire)

- Compte Google Cloud, facturation (crédit ≈ 264 €, alerte à 10 € par mois) et domaine **awzid.com** : faits.
- Serveur `awzid-beta` à **Paris** (e2-standard-2, 8 Go, `europe-west9-b`), adresse fixe **34.163.24.96**, réseau à part `awzid-net`.
  Il est **privé** : le web (HTTP/HTTPS) est **fermé**, on n’y entre que par un tunnel sécurisé.
- **Sauvegardes** chiffrées chaque nuit dans le bucket `awzid-sauvegardes-b7e41c` (30 jours), **restauration testée**
  (`EXPLOITATION.md` § 15) ; alerte e-mail si le serveur tombe.
- Dans l’application (cette bêta) : accès **par invitation**, trois modes commutables, plafond d’inscriptions, liste d’attente, vérification
  de l’adresse, anti-robots, tableau de bord, bandeau « Version bêta », site invisible des moteurs de recherche, alertes par e-mail.

## Ce qui reste avant l’ouverture

| # | Étape | Vous | Moi (Claude) |
|---|---|---|---|
| 1 | Connecter `gcloud` | une connexion (2 minutes) | tout ce qui suit |
| 2 | Enregistrement DNS `app.awzid.com` | 1 ligne chez le registraire | je la donne exacte et je vérifie |
| 3 | E-mail (SMTP, SPF, DKIM, DMARC) | compte du service d’e-mail, 3-4 lignes DNS, mot de passe collé sur le serveur | je branche et j’essaie |
| 4 | Comptes du personnel avec second facteur | choisir les mots de passe, scanner le code | je guide, je ne vois aucun mot de passe |
| 5 | Clé privée de sauvegarde : 2 copies hors ligne | 2 clés USB rangées | test de restauration avec la vraie clé |
| 6 | Audio Wavenet et Coran (13 Go) | accord pour la dépense | envoi par le bucket, import, contrôle |
| 7 | Scan de sécurité (ZAP) et test de charge | rien | je les lance, je rapporte |
| 8 | **Ouverture du web** | dire « ouvre » | `ouvrir-web.sh --oui` (réversible : `--fermer`) |
| 9 | Inviter un premier relecteur | 1 formulaire | je vérifie que tout arrive |

---

## Étape 1 — Connecter `gcloud` (vous)

**Pourquoi** : mes commandes Google Cloud passent par **votre** compte, que vous seul connectez. Je ne vois jamais votre mot de passe.

**Ce que vous faites** : dans le terminal de la machine de développement, tapez `gcloud auth login --no-launch-browser`. Il affiche un lien :
ouvrez-le sur votre PC, choisissez votre compte Google, autorisez, copiez le code affiché et collez-le dans le terminal.
Vous pouvez retirer l’accès à tout moment : `gcloud auth revoke`.

**Ce que je fais ensuite** : `infra/gcp/serveur.sh ssh` (accès au serveur par le tunnel), contrôles `infra/gcp/verifier.sh`, déploiement
des versions. Je ne crée aucune ressource payante sans vous le dire d’abord.

## Étape 2 — L’enregistrement DNS (vous, 5 minutes)

**Ce que vous faites** : chez le registraire de `awzid.com`, zone DNS → **Ajouter un enregistrement** :

| Type | Nom (hôte) | Valeur | Durée (TTL) |
|---|---|---|---|
| `A` | `app` | `34.163.24.96` | 300 |

*Capture à voir : un tableau d’enregistrements, un bouton « Ajouter », trois champs (type, nom, valeur).* Ne créez rien pour `awzid.com` seul
ni pour `www` : le site doit rester invisible tant que la vitrine n’existe pas.

**Ce que je fais** : je vérifie que `app.awzid.com` pointe vers le serveur. Tant que le web est fermé (étape 8), l’adresse ne répond pas ;
le certificat HTTPS (Let’s Encrypt) s’obtient seul à l’ouverture.

## Étape 3 — Le service d’e-mail (vous crée le compte ; moi je branche)

**Pourquoi** : invitations, vérification d’adresse, « mot de passe oublié », alertes. Sans lui, tout marche sauf ces envois (je vous donne
alors les liens à transmettre à la main), et la vérification de l’adresse reste facultative.

**Ce que vous faites**
1. Créez un compte chez un service d’envoi (Brevo, Scaleway TEM ou Postmark) et **ajoutez le domaine `awzid.com`**.
2. Il vous donne 3 ou 4 lignes DNS (**SPF, DKIM, DMARC**) : collez-les chez le registraire, au même endroit qu’à l’étape 2.
3. Il vous donne un identifiant et un **mot de passe SMTP** : **ne me les envoyez pas**. Je vous donne la seule commande à taper sur le
   serveur pour les coller dans son fichier secret (`~/.config/awform/prod.env`, droits réservés).
4. Dites-moi quelle adresse reçoit les alertes (`AWFORM_ALERTE_A`).

**Ce que je fais** : je branche (`AWFORM_MAIL=smtp`), j’envoie un e-mail d’essai (`infra/prod/alerte.sh --essai`) et je vérifie SPF/DKIM/DMARC.
Ensuite le serveur vous écrit seul si quelque chose cloche (au plus une fois par 6 heures pour le même problème, puis « rétabli »).

## Étape 4 — Les comptes du personnel avec second facteur (vous choisissez, je guide)

Administrateur, enseignants, référent : leur compte exige un **second facteur** (code à 6 chiffres sur le téléphone).

**Ce que vous faites** : pour chaque personne, vous tapez vous-même le mot de passe dans le terminal du serveur quand je vous y invite
(il n’apparaît pas à l’écran), puis à la première connexion vous scannez le code (application d’authentification) et gardez les codes de secours.
**Ce que je fais** : je lance l’outil de création des comptes (`staff`) avec ce que vous avez saisi, sans jamais l’afficher ni le garder.

## Étape 5 — La clé privée des sauvegardes : deux copies hors ligne (vous)

Chaque nuit, la base est chiffrée avec une **clé publique** (elle reste sur le serveur : elle ferme, elle n’ouvre pas) puis copiée dans le
bucket. Pour la **rouvrir** après une catastrophe, il faut la **clé privée** : **elle est à vous**.

> **Sans la clé privée, toutes les sauvegardes sont illisibles : personne, pas même moi, ne peut les rouvrir.**
> Avec elle, quiconque a aussi les fichiers peut lire les données : gardez-la hors ligne, ne la montrez à personne.

**Ce que vous faites**
1. La clé a déjà été sortie du serveur (voir `EXPLOITATION.md` § 15, point « Clé privée ») ; vérifiez qu’elle est dans le dossier prévu de votre PC.
2. **Copiez-la sur deux clés USB** étiquetées « Awzid — clé de sauvegarde », rangées dans deux endroits différents. Jamais par e-mail,
   messagerie ni stockage en ligne non chiffré.
3. **Une fois par mois**, lancez `infra\pc\test-restauration.ps1` : il prouve que votre clé ouvre bien la dernière sauvegarde (restauration
   dans une base temporaire, comparaison, effacement). Le serveur vous alerte si le dernier test a plus de 35 jours.

**Ce que je fais** : `infra/prod/backup-selftest.sh` — test de restauration **complet et rejouable** avec une clé jetable (fait le 13/10/2026 :
sauvegarde réelle, déchiffrement, restauration dans une base jetable, comparaison table par table : OK, 28 minutes) — et le test mensuel avec
votre vraie clé quand vous me le demandez (la clé passe par votre terminal, je ne la vois pas).

## Étape 6 — L’audio Wavenet et le Coran (13 Go) par le bucket

**Ce que vous faites** : donner votre accord pour la dépense de la voix Wavenet (Text-to-Speech, facturée à l’usage : je vous donne le
nombre de caractères et le prix estimé avant de lancer quoi que ce soit) et pour l’espace disque (le disque actuel de 50 Go suffit pour 13 Go
de Coran + 1 Go de leçons ; au-delà je vous préviens).
**Ce que je fais** : j’envoie les fichiers par un bucket (débit de votre connexion ≈ 200 Ko/s : prévoir plusieurs heures, en tâche de fond),
je les importe avec les outils existants (`coran-audio`, `lecons-audio`, avec contrôle des fichiers) et je vérifie par un essai de lecture.

## Étape 7 — Scan de sécurité et test de charge (moi)

Je lance le scan OWASP ZAP (`docs/projet/ZAP.md`) et le test de charge (`infra/charge/`) sur le serveur **par le tunnel privé**, avant l’ouverture,
et je vous rapporte les résultats en clair (quoi corriger, quoi accepter). Aucun coût : le trafic de test reste dans le serveur.

## Étape 8 — Ouvrir le web (sur votre accord seulement)

Quand les étapes 2 à 7 sont faites, vous me dites « ouvre ». Je lance `infra/gcp/ouvrir-web.sh --oui` (règle de pare-feu 80/443), je contrôle
`https://app.awzid.com/healthz` et `infra/prod/entetes-check.sh`, et la bêta est **fermée sur invitation** (personne n’entre sans code).
**Retour arrière immédiat** : `ouvrir-web.sh --fermer`, ou le bouton « Fermé » dans l’application.

## Étape 9 — Inviter un relecteur

1. Ouvrez `https://app.awzid.com/connexion` et connectez-vous avec le **compte administrateur** (second facteur).
2. Menu → **Administration** → bloc **« Accès à la bêta »** → **Invitations** :
   - *Nom ou note* : « Relecteur — Dr X » ; *Adresse e-mail* : celle du relecteur (**invitation personnelle** : seule cette adresse peut
     l’utiliser) ; *Valable* : 30 jours ; case **« Envoyer par e-mail »** cochée → **Créer l’invitation**.
   *Capture à voir : un encadré avec un code du genre `AWZ-7K3QM-4TXPD` et un lien. **Ils ne seront plus affichés** : copiez-les si l’e-mail
   n’est pas parti.*
3. Le relecteur ouvre le lien, voit « Invitation reconnue », crée son compte (et vérifie son adresse). Il voit en haut le bandeau
   « Version bêta — le contenu religieux est tranché par le référent selon l’école mālikite, sources citées, en attente d’une seconde
   lecture savante » (il peut le fermer). Pour **annuler** une invitation : bouton **Révoquer**.

Autres cas : un **code partagé** pour une classe (laisser l’adresse vide, « Inscriptions permises » à 20, durée 14 jours) ; la **liste
d’attente** (les personnes sans code demandent une invitation ; vous cliquez **Accepter et inviter** ou **Refuser**).

### Les trois modes d’accès, en un clic

Bloc « Accès à la bêta » → « Mode d’accès » (effet en quelques secondes, sans rien redéployer) :

| Mode | Ce que voient les visiteurs |
|---|---|
| **Fermé** | une page de maintenance sobre ; seuls les administrateurs entrent (une confirmation est demandée) |
| **Sur invitation** | il faut un code d’invitation pour créer un compte ; sinon, demande d’invitation (liste d’attente) |
| **Ouvert (avec plafond)** | inscription libre jusqu’au **plafond de comptes** que vous fixez (200 au départ) ; une fois atteint, les nouvelles personnes passent **toutes seules en liste d’attente** |

**Retour arrière** : cliquez sur le mode d’avant. Rien n’est perdu (comptes, invitations, liste d’attente). Pour ouvrir plus de places,
**relevez le plafond** (« Enregistrer le plafond ») : l’inscription libre rouvre aussitôt.

**Tableau de bord** (en haut du même bloc) : comptes sur le plafond, nouveaux comptes (24 h, 7 jours), adresses non vérifiées, demandes en
attente, **coût estimé du jour**, plafonds par utilisateur et **alertes** en clair.

**Protections** : *adresse e-mail à vérifier avant d’utiliser le compte* (si le service d’e-mail est branché) et *protection anti-robots de
l’inscription* (sans service extérieur : jeton invisible, délai de 3 secondes, champ piège). Si des robots passent malgré tout, deux options sont
prêtes à étudier avec vous, **sans rien créer à votre place** : ALTCHA (auto-hébergé, respecte la vie privée) ou Cloudflare Turnstile (plus
efficace, service tiers, un compte à créer par vous).

**Plafonds par utilisateur** (tout ce qui coûte a une limite par personne) : tuteur IA (1 $ par mois pour un enfant, 3 $ pour un adolescent
ou adulte), écoute IA (60 par heure), stockage des récitations (30 Mo par élève), avis et signalements (5 par jour). La synthèse vocale est
préparée à l’avance : aucun coût par utilisateur.

---

## Le coût (estimation à vérifier avec le calculateur de Google)

Prix approximatifs **par mois**, Paris, euros, hors taxes (estimation du 13/10/2026) :

| Poste | Réglage actuel | Coût mensuel estimé |
|---|---|---|
| Machine virtuelle | `e2-standard-2` (2 vCPU, 8 Go) | 55 à 65 € |
| Disque | 50 Go équilibré | 6 à 7 € |
| Adresse IP fixe | 1 | 3 à 4 € |
| Sauvegardes (bucket, 30 jours) | quelques Go | moins de 1 € |
| Trafic sortant | quelques invités | 0 à 2 € |
| **Total** | | **environ 65 à 80 €** |
| Domaine `awzid.com` | une fois par an | déjà payé |

À savoir, franchement :
- **L’alerte à 10 € sonne déjà**, et le crédit de ≈ 264 € (expire début janvier 2027, soit ≈ 2,5 mois) couvre environ 180 à 200 € de dépenses :
  après le 02/01/2027, c’est votre carte qui paie. Une machine plus petite (`e2-medium`, ≈ 30 €) est possible **sans l’écoute IA de la récitation**
  (elle demande ≈ 3 Go de mémoire).
- **Plafond (disjoncteur)** : `infra/gcp/plafond-budget.sh` (mode à blanc ; je ne l’exécute qu’avec votre accord) ajoute un plafond de
  45 € qui **arrête la machine** (sans rien supprimer) quand le coût réel du mois l’atteint ; Google met les coûts à jour avec quelques heures
  de retard : c’est un filet de sécurité, pas un arrêt à l’euro près. **À décider** : le montant du plafond, vu le coût normal ci-dessus.

## Ce qui peut mal tourner (et quoi faire)

| Situation | Que faire |
|---|---|
| Un e-mail d’alerte arrive | Ne rien faire tout de suite : envoyez-moi l’objet du message. |
| `app.awzid.com` ne répond pas | Ouvrez `/etat` ; sinon dites-le moi. Console Google → Compute Engine : la machine est-elle « arrêtée » (plafond atteint) ? |
| La machine a été arrêtée par le plafond | Regardez la facture (Facturation → Rapports). Si c’est normal, dites-le moi : je relance la machine. |
| Vous avez perdu la clé de sauvegarde | Dites-le **tout de suite** : une nouvelle paire est créée, la prochaine sauvegarde est lisible ; les anciennes sont perdues. |
| Un invité a transmis son code | Révoquez l’invitation (bouton) : les personnes déjà inscrites restent. |
| Vous voulez tout arrêter d’un coup | Mode **Fermé** (bouton), ou `ouvrir-web.sh --fermer`. Pour arrêter aussi les frais : arrêter la machine dans la console (le disque coûte encore ≈ 7 €/mois). |

## Décisions que j’attends de vous

1. Taille de la machine (garder `e2-standard-2` avec l’écoute IA, ou réduire) et **montant du plafond** de dépense.
2. Quel service d’e-mail (Brevo, Scaleway TEM, Postmark) et quelle adresse reçoit les alertes.
3. Accord pour la voix Wavenet (après mon estimation chiffrée) et l’import de l’audio du Coran.
4. Le jour où vous me dites « ouvre ».
