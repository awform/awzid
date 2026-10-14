# Guide du client — ouvrir la bêta fermée d’Awzid

*Pas à pas, en français simple. À chaque étape : **ce que vous faites** et **ce que je fais** (Claude). Règle générale : **vous**
faites les connexions à vos comptes et les paiements ; **moi**, je n’exécute les commandes qu’une fois la connexion faite, et je ne
crée aucune ressource payante et n’ouvre pas le site au public sans votre accord écrit dans la conversation.*

## Où on en est (déjà fait, rien à refaire)

- Compte Google Cloud, facturation (crédit ≈ 264 €, alerte unique à 80 € par mois) et domaine **awzid.com** : faits.
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
| 2 | Enregistrements DNS chez OVH (`awzid.com`, `www`, `app`) | 3 entrées dans la zone DNS | je vérifie noms, certificats, redirections |
| 3 | E-mail d’envoi (boîte OVH, SMTP) | créer la boîte, coller le mot de passe sur le serveur | je branche et j’essaie |
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

## Étape 2 — Les enregistrements DNS chez OVH (vous, 10 minutes)

**Le nom de la bêta est `awzid.com`** (la racine). `www.awzid.com` et `app.awzid.com` mènent au même serveur mais **redirigent
automatiquement (301) vers `awzid.com`** : un seul nom pour les cookies, les e-mails et les liens. L’adresse du serveur
(**34.163.24.96**) est une **adresse IP statique déjà réservée** chez Google (`awzid-beta-ip`) : elle ne change pas, rien à réserver.

**Ce que vous faites** : dans l’espace OVH, `awzid.com` → **Zone DNS** → **Ajouter une entrée** (trois fois) :

| Type | Sous-domaine | Cible | TTL |
|---|---|---|---|
| `A` | *(vide, c’est-à-dire `@`)* | `34.163.24.96` | 300 |
| `CNAME` | `www` | `awzid.com.` (avec le point final) | 300 |
| `CNAME` | `app` | `awzid.com.` (avec le point final) | 300 |

*Capture à voir : la liste des entrées de la zone, le bouton « Ajouter une entrée », puis un formulaire avec le type, le sous-domaine
et la cible.* **Ne touchez à rien d’autre** : les entrées `MX` (courrier), le `SPF` (`TXT` qui commence par `v=spf1`) et le `TXT`
`1|www.awzid.com` restent tels quels, car votre courrier est chez OVH. Si OVH propose de supprimer l’ancienne entrée `A` ou `CNAME`
de `www` qui pointe vers l’hébergement OVH, remplacez-la (une seule entrée par nom).

**Ce que je fais** : quand c’est fait, je vérifie que les trois noms pointent vers le serveur (`nslookup`), puis, à l’ouverture (étape 8),
je contrôle le certificat de **chaque** nom (Let’s Encrypt, un certificat par nom), la redirection (`https://www.awzid.com/x?y=1` →
`https://awzid.com/x?y=1`), les cookies, les liens des e-mails (`https://awzid.com/…`) et l’en-tête HSTS **court** (5 minutes au début ; je
l’allonge à 1 jour puis à 1 an seulement quand tout est vérifié, sans `preload`). Tant que le web est fermé, rien ne répond : c’est voulu.

### Plus tard, facultatif : les noms courts par section (désactivés pendant la bêta)

Six noms courts peuvent mener à une section (redirection 301, le site reste sur `awzid.com`) : `arabe` → l’accueil, `quran` → Coran,
`fiqh` et `fikh` → Madjaliss, `adab` et `akhlaq` → Vivre (comportement, douas). **Rien à faire maintenant** : ils sont éteints. Le jour où
vous en voulez un, vous ajoutez chez OVH un `CNAME` `<nom>` → `awzid.com.` (un par nom), puis je l’active sans redéployer
(`infra/prod/alias-sections.sh activer quran`) ; Caddy demande alors un certificat pour ce seul nom. Désactiver = `desactiver quran`.

## Étape 3 — Le service d’e-mail : le plus simple est celui d’OVH (vous crée la boîte ; moi je branche)

**Pourquoi** : invitations, vérification d’adresse, « mot de passe oublié », alertes. Sans lui, tout marche sauf ces envois (je vous donne
alors les liens à transmettre à la main), et la vérification de l’adresse reste facultative.

**Pourquoi OVH** : votre courrier est déjà chez OVH et vos entrées `MX`, `SPF` et DKIM sont déjà là : **aucun changement DNS** n’est
nécessaire, et le SPF existant n’est pas modifié. Un autre service (Brevo, Scaleway TEM, Postmark) demanderait de modifier le SPF : à éviter.

**Ce que vous faites**
1. Dans l’espace OVH, créez (ou choisissez) une **boîte e-mail** pour l’envoi, par exemple `no-reply@awzid.com`, et activez **DKIM** pour
   le domaine si OVH le propose (une case à cocher, il ajoute lui-même ses entrées).
2. Notez le serveur d’envoi (`ssl0.ovh.net` pour les boîtes OVH « MX Plan », port **465**, connexion chiffrée), l’identifiant (l’adresse complète)
   et le **mot de passe de la boîte** : **ne me les envoyez pas**. Je vous donne la seule commande à taper sur le serveur pour les coller
   dans son fichier secret (`~/.config/awform/prod.env`, droits réservés).
3. Dites-moi quelle adresse reçoit les alertes (`AWFORM_ALERTE_A`).

**Ce que je fais** : je branche (`AWFORM_MAIL=smtp`, expéditeur `Awzid <no-reply@awzid.com>`), j’envoie un e-mail d’essai
(`infra/prod/alerte.sh --essai`) et je contrôle qu’il n’arrive pas en courrier indésirable. Ensuite le serveur vous écrit seul si quelque chose
cloche (au plus une fois par 6 heures pour le même problème, puis « rétabli »).

## Ce que voit un visiteur de `awzid.com`

Tant que la bêta est **sur invitation**, quelqu’un qui n’est pas connecté voit **une page d’accueil courte** : une phrase de présentation, la
mention **« Bêta sur invitation »**, les boutons « J’ai un code d’invitation » et « Demander une invitation » (liste d’attente) et « Me connecter ».
**Aucun livre, aucune leçon, aucun verset** n’est montré ni servi à un visiteur anonyme (le serveur le refuse aussi). Toutes les pages restent
invisibles des moteurs de recherche pendant la bêta (`noindex`, `robots.txt` « tout interdit », pas de sitemap, pas d’aperçu sur les réseaux sociaux).

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
`https://awzid.com/healthz` et `infra/prod/entetes-check.sh`, et la bêta est **fermée sur invitation** (personne n’entre sans code).
**Retour arrière immédiat** : `ouvrir-web.sh --fermer`, ou le bouton « Fermé » dans l’application.

## Étape 9 — Inviter un relecteur

1. Ouvrez `https://awzid.com/connexion` et connectez-vous avec le **compte administrateur** (second facteur).
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

**Quran Foundation et enfants** : l’interrupteur « Profils d’enfants et fonctions de la Quran Foundation » est **désactivé** : les enfants n’ont ni
récitateurs en ligne ni Muṣḥaf exact (les ados et adultes les gardent). Ne l’activez qu’après la réponse écrite de la Quran Foundation (modèle de
message dans `docs/projet/juridique/LICENCES_PRODUCTION.md` § 1.3, à envoyer par vous).

**Plafonds par utilisateur** (tout ce qui coûte a une limite par personne) : tuteur IA (1 $ par mois pour un enfant, 3 $ pour un adolescent
ou adulte), écoute IA (60 par heure), stockage des récitations (30 Mo par élève), avis et signalements (5 par jour). La synthèse vocale est
préparée à l’avance : aucun coût par utilisateur.

---

## Le coût (estimation à vérifier avec le calculateur de Google)

Prix approximatifs **par mois**, Paris, euros, hors taxes (estimation du 13/10/2026) :

| Poste | Réglage actuel | Coût mensuel estimé |
|---|---|---|
| Machine virtuelle | `e2-standard-2` (2 vCPU, 8 Go) | ≈ 51 € |
| Disque | 50 Go équilibré | ≈ 5 € |
| Adresse IP fixe | 1 | ≈ 3,4 € |
| Sauvegardes (bucket, 30 jours) | quelques Go | moins de 1 € |
| Trafic sortant | quelques invités | 0 à 2 € |
| **Total** | | **environ 60 €** (≈ 2 € par jour) |
| Domaine `awzid.com` | une fois par an | déjà payé |

À savoir, franchement :
- **Une seule alerte de budget : 80 € par mois** (réglée dans la console) ; le coût normal est d’environ 60 €, elle ne sonne donc qu’en cas de dérive. Le crédit de ≈ 264 € (expire début janvier 2027, soit ≈ 2,5 mois) couvre environ 180 à 200 € de dépenses :
  après le 02/01/2027, c’est votre carte qui paie. Une machine plus petite (`e2-medium`, ≈ 30 €) est possible **sans l’écoute IA de la récitation**
  (elle demande ≈ 3 Go de mémoire).
- **Disjoncteur** : à l’alerte de 80 €, je coupe seulement les fonctions coûteuses (écoute IA, voix à la demande) avec le réglage
  `AWFORM_COUTS_COUPES=1` ; **la machine n’est jamais arrêtée** et rien n’est supprimé. Google met les coûts à jour avec quelques heures de
  retard : c’est un avertissement, pas un arrêt à l’euro près. `infra/gcp/plafond-budget.sh` (mode à blanc) ne sert qu’à recréer cette alerte unique.

## Ce qui peut mal tourner (et quoi faire)

| Situation | Que faire |
|---|---|
| Un e-mail d’alerte arrive | Ne rien faire tout de suite : envoyez-moi l’objet du message. |
| `awzid.com` ne répond pas | Ouvrez `https://awzid.com/etat` ; sinon dites-le moi. Console Google → Compute Engine : la machine est-elle « arrêtée » ? (Le budget n’arrête jamais la machine.) |
| Alerte de budget à 80 € | La machine continue de tourner. Regardez la facture (Facturation → Rapports) et envoyez-moi l’objet du message : je coupe les fonctions coûteuses si la dérive est réelle. |
| Vous avez perdu la clé de sauvegarde | Dites-le **tout de suite** : une nouvelle paire est créée, la prochaine sauvegarde est lisible ; les anciennes sont perdues. |
| Un invité a transmis son code | Révoquez l’invitation (bouton) : les personnes déjà inscrites restent. |
| Vous voulez tout arrêter d’un coup | Mode **Fermé** (bouton), ou `ouvrir-web.sh --fermer`. Pour arrêter aussi les frais : arrêter la machine dans la console (le disque coûte encore ≈ 7 €/mois). |

## Décisions que j’attends de vous

1. Taille de la machine (garder `e2-standard-2` avec l’écoute IA, ou réduire) et **montant du plafond** de dépense.
2. Quelle boîte OVH sert à l’envoi (`no-reply@awzid.com` ?) et quelle adresse reçoit les alertes.
3. Accord pour la voix Wavenet (après mon estimation chiffrée) et l’import de l’audio du Coran.
4. Le jour où vous me dites « ouvre ».
