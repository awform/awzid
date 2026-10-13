# Support de la bêta fermée — contact, FAQ, signalements, errata

> **Provisoire — avant signature d'un juriste ; en attente d'une seconde lecture juridique** (pour les textes publiés).
> 13/10/2026. Décrit ce qui est dans l'application et comment Claude traite ce qui arrive.

## 1. Contact

- **Adresse de contact : [à créer par le client]** (par exemple `contact@awzid.com`). Une seule adresse sert au support, aux
  demandes sur les données personnelles et aux réclamations pendant la bêta. Elle apparaît dans les mentions légales,
  la politique de confidentialité, les conditions des invités, la page « La bêta d'Awzid » et la FAQ (toujours entre
  crochets tant qu'elle n'existe pas : `apps/web/static/i18n/legal/fr.json` et `en.json`, à remplacer d'un coup).
- Les e-mails de service partent de `no-reply@awzid.com` et ne reçoivent pas de réponse.
- Engagement affiché : réponse à toute demande sur les données **sous 30 jours** (exigé aussi par le modèle de
  politique de Quran Foundation). Cible interne : lecture des signalements sous 48 h ; point religieux jugé grave :
  suspension du bloc sous 24 h.

## 2. Ce que voit l'utilisateur

| Où | Quoi |
|---|---|
| Page **Aide** (`/aide`) | **25 questions** en 7 blocs (Commencer ; Compte et mot de passe ; Mise à jour et hors ligne ; Enfants et famille ; Contenus religieux ; École ; Signaler un problème et nous contacter) ; boutons « Signaler un problème » et « Signaler une erreur dans un texte religieux » ; liste des documents, « La bêta d'Awzid », « Errata », « Nous contacter » |
| Page **La bêta d'Awzid** (`/beta`, publique) | ce qu'est la bêta, ce qui est testé, limites connues, comment signaler |
| Menu **Plus** | « Signaler un problème » (déjà présent, bêta-support) |
| Sous un verset, un hadith, une règle, un exercice | « Signaler une erreur » (motif + commentaire facultatif) |
| Page **Errata** (`/errata`, publique, sans compte) | corrections religieuses **datées**, avec leur **source** et l'édition qui les porte ; bouton de signalement |
| Pages légales (`/legal/...`, publiques) | mentions, CGU, confidentialité, cookies, conditions de la bêta, conditions pour les invités |

Les questions de la FAQ sont celles que posent réellement les familles : mot de passe oublié (30 minutes, une seule fois),
e-mail de vérification non reçu, changement d'adresse, export/suppression, mise à jour (bandeau « Nouvelle version »),
mode avion, consommation de données, âge de l'enfant, accord « conviction religieuse », IA, États-Unis, origine du texte du
Coran, « en cours de relecture savante », signaler une erreur religieuse, errata, validation d'une récitation,
inscription à une classe, ijāza, bug, contact.

## 3. « Signaler un problème » (formulaire sobre)

Existant (`bêta-support`) et conservé ; ajout du 13/10 : **catégorie préchoisie** pour le parcours religieux.

- Catégories : « Quelque chose ne marche pas », « Un contenu à corriger », « Un point religieux à vérifier », « Autre chose ».
- Envoyé : catégorie, texte (500 caractères, « n'écrivez ni nom, ni adresse, ni téléphone »), **chemin** de la page
  (jamais de paramètres), **version** de l'application (ajoutée par le serveur), rôle et tranche d'âge, profil actif.
  Rien d'autre : ni nom, ni e-mail, ni IP dans le signalement.
- **Contexte non personnel** : capture d'écran **facultative**, faite sur l'appareil, zones `data-prive` et champs de saisie
  masqués, jamais sur les pages qui montrent d'autres personnes (classe, famille, messages, personnel) ; aperçu avant envoi.
- Un **enfant** n'envoie que la catégorie (ni texte libre, ni image).
- Limites : 5 par compte et par jour, 200 par heure pour la plateforme ; purge : image 90 jours, signalement réglé 12 mois.
- Interrupteur `signaler` (registre des fonctions) : on par défaut ; peut être coupé sans redéploiement.

## 4. Parcours « signaler une erreur dans un texte religieux »

Deux entrées, un même journal côté équipe :

1. **Sous le texte** : « Signaler une erreur » → motif (texte arabe, sens, référence, règle…) + commentaire ; le serveur enregistre
   le bloc exact (empreinte), l'extrait et la référence → **file des signalements de contenu** (`/api/v1/admin/signalements`,
   écran Admin).
2. **Depuis l'Aide ou les Errata** : « Signaler une erreur dans un texte religieux » → ouvre « Signaler un problème » **déjà sur
   « Un point religieux à vérifier »** → **file des problèmes** (`/api/v1/admin/problemes`, écran Admin).

Test e2e : `apps/web/e2e/beta-legal.spec.ts` (parcours complet jusqu'à la file de l'administrateur).

## 5. Le journal que Claude traite

Accès : comptes `admin`, `support` (problèmes) ou `referent` (contenu), **second facteur obligatoire**. Pour la bêta, le
client crée un compte de service avec l'outil `node apps/api/dist/cli/staff.js` (`--kind admin`, ou `--role referent` /
`--role support` sur un compte existant) ; le mot de passe est donné par la variable `AWFORM_STAFF_PASSWORD`, jamais en
argument. **Claude ne détient aucun secret** : le client ouvre la session ou lance l'export. *Jamais d'écriture directe dans la
base de la démonstration.*

**Traitement** (Claude, référent religieux provisoire, puis relecteurs par niveau — décision du client) :

| Étape | Action |
|---|---|
| 1. Lire | une fois par jour (et à chaque notification de l'infrastructure) ; trier : religieux d'abord |
| 2. Reproduire | ouvrir la leçon, la page et la version indiquées |
| 3. Vérifier à la source | verset : texte Tanzil octet par octet ; hadith : registre « vérifié » des livres ; règle de fiqh : mālikite, livres gelés ; **réfuter avant de trancher** ; ne rien écrire de religieux de mémoire |
| 4. Statut | `recu → en_examen` (signalement de contenu) ; `nouveau → en_cours` (problème) |
| 5. Si grave | **suspension d'urgence** du bloc (administrateur, `POST /api/v1/admin/suspensions`) ; message neutre côté élève |
| 6. Corriger | dans la source des livres (`packages/content`), nouvelle édition, test ; jamais dans la base de la démonstration |
| 7. Publier l'erratum | signalement de contenu : `PATCH /api/v1/admin/signalements/:id` avec `status: corrige`, `erratum` (≤ 600 car.), `source` (**obligatoire pour un verset, un hadith, une règle** : refus `source_requise` sinon), `fixedInEdition`. Point venu de « Signaler un problème » sans bloc : `POST /api/v1/admin/errata` (`targetKind`, `unitId?`, `source`, `erratum`, `fixedInEdition?`) |
| 8. Rejeter | `status: rejete` + motif obligatoire (jamais « tu as tort » : expliquer la source) |
| 9. Clore | problème → `regle` ; traduction QuranEnc fautive → **notifier QuranEnc.com** (condition 5 de sa licence) ; trace dans le journal d'audit (automatique) |

**Errata publics** : `GET /api/v1/contenu/errata` (sans compte) → page `/errata` : date de la décision, nature (verset, hadith, règle,
leçon, exercice), leçon, texte de la correction, **source**, édition. Ni l'auteur ni son commentaire ne sont jamais exposés
(tests `apps/api/test/beta-errata.test.ts`, `f1.test.ts`, e2e `beta-legal.spec.ts`).

## 6. Limites connues

- Un signalement venu de « Signaler un problème » n'a pas de lien automatique avec une ligne d'erratum : Claude passe par
  `POST /api/v1/admin/errata` puis passe le problème en `regle`.
- Pas d'accusé de réponse par e-mail à l'auteur (le signalement ne contient pas son adresse, volontairement).
- Champ « source » : il réutilise la colonne `ref` du signalement ; une colonne dédiée (avec lien) demanderait une migration — à décider avec
  l'agent de l'infrastructure pour éviter un conflit de numérotation.

## 7. Langues des textes juridiques

Français (source) et anglais faits. **Espagnol, allemand, arabe : non faits.** L'infrastructure de chargement
(`apps/web/src/lib/legal/pages.ts`) ne connaît aujourd'hui que `fr` et `en` ; un texte juridique traduit sans relecture par un
juriste du pays est plus risqué qu'utile. Pendant la bêta, un utilisateur dont l'interface est en espagnol, allemand ou arabe
voit les textes en **français**. À faire après la seconde lecture juridique du français : traductions, puis relecteurs de langues
(sauf allemand, décision du client), et `LegalTexts` étendu à `es`, `de`, `ar` (arabe : texte de droite à gauche, composant `Bidi`).
