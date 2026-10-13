# Licences et attributions en production — Quran Foundation, polices, audio, Tanzil, traductions

> **Provisoire — avant signature d'un juriste ; en attente d'une seconde lecture juridique.** 13/10/2026.
> Complète `docs/projet/LICENCES.md` (relevés du 04-06/10/2026, qui restent la référence détaillée : empreintes,
> versions, générateurs) et `docs/projet/SOURCES_MUSHAF.md` §§ 7-8. Aucun fichier de secrets n'a été lu.
> Rappel : le texte coranique n'est jamais modifié ; aucune source n'entre dans le dépôt sans licence consignée.

## 1. Quran Foundation (QF) en production

**Documents lus le 13/10/2026** : Developer Terms, **« dernière mise à jour : 11 octobre 2026 »**
(https://api-docs.quran.foundation/legal/developer-terms/) ; modèle de politique de confidentialité exigée des
développeurs, « Developer Privacy Policy Packet » (https://api-docs.quran.foundation/legal/developer-privacy/, sans date de
mise à jour). Nos relevés précédents portaient sur la version du **04/10/2026** : les conditions ont été mises à jour
depuis ; **les points de contenu relevés ci-dessous sont cohérents avec nos notes du 06/10**, mais un
rapprochement ligne à ligne avec l'ancienne version n'a pas été possible (pas de copie datée) — à refaire en
archivant désormais le texte à chaque lecture (empreinte et date).

Usage actuel d'Awzid : (a) **récitateurs en ligne** (adresses audio par l'API de contenu, lecture en continu depuis les
serveurs de QF, A2) ; (b) **mise en page du Muṣḥaf de Médine** (lignes et glyphes `code_v1` par **Content Sync**,
copie sur le serveur, A34). Pas de compte Quran.com des utilisateurs, pas d'OAuth utilisateur, pas d'API « utilisateur ».

### 1.1 Obligations de production (Developer Terms)

| § | Obligation | Awzid aujourd'hui | Statut |
|---|---|---|---|
| 2 | Ne jamais modifier le texte coranique ; extraits dans leur contexte ; ni vente, ni sous-licence, ni redistribution | texte Tanzil inchangé ; contenu QF affiché seulement dans l'application, route réservée aux comptes connectés | **conforme** |
| 3 | **Créditer QF** de façon accessible (polices et images de Muṣḥaf en cache) ; créditer QF dans les **vidéos de réseaux sociaux** ; ne pas tromper sur la source | crédit sur chaque récitateur « en ligne », sous la page exacte, page « Nos garanties » ; mentions légales (ajout du 13/10) | **conforme** ; à retenir pour la communication : citer QF dans toute vidéo qui montre ses contenus |
| 4 | **Politique de confidentialité et conditions d'utilisation publiques**, intégrant les principes de QF | pages `/legal/confidentialite` et `/legal/cgu`, accessibles sans compte (mises à jour le 13/10) | **fait, provisoire** |
| 5 | Respecter les quotas publiés ; ne pas contourner ; **les valeurs sont confidentielles** | cache 24 h en mémoire du serveur, une requête à la fois par récitateur | **conforme** ; ne jamais publier les valeurs |
| 6 | Protéger jetons et secrets ; TLS ≥ 1.2, chiffrement au repos, moindre privilège, **rotation** ; compte actif dans la Developer Console | secrets `QF_CLIENT_ID`/`QF_CLIENT_SECRET` limités au service API (`env-scopes.conf`), hors dépôt | **à faire** : fixer une cadence de rotation (mention entre crochets dans la politique) ; compte du client à garder actif ; `QF_ENV=production` pour la mise en ligne |
| 7 | Ne pas garder du contenu QF plus d'**1 semaine**, sauf par Content Sync ; pas de base pré-emballée | réponses audio : 24 h en mémoire ; lignes : copie serveur par Content Sync, appareil : pages consultées revalidées au-delà de 7 jours ; rien dans le dépôt | **conforme** |
| 8 | **Content Sync au moins tous les 7 jours** quand la connexion le permet | minuteur hebdomadaire côté serveur, API `enRetard` au-delà de 7 jours (`apps/api/src/mushaf-exact.ts`) | **à vérifier en production** : planification réellement active (le Muṣḥaf exact n'est branché qu'après validation de la 1re synchronisation) |
| 9 | Données utilisateur de QF : minimum de scopes, révocation, suppression ; **alerter developers@quran.com sous 24 h** en cas d'accès non autorisé ou d'exposition liés aux API ; pas de profils publicitaires ni d'apprentissage automatique sur le contenu QF ou des données utilisateur sans accord écrit | aucune donnée utilisateur QF ; procédure de violation (`PROCEDURE_VIOLATION_DONNEES.md`) prévoit les 24 h ; le modèle d'écoute n'a jamais été entraîné avec du contenu QF | **conforme** ; ne jamais fournir du contenu QF à un fournisseur d'IA pour l'entraîner (Gemini inclus) |
| 10 | Mineurs | **aucune disposition dans les Terms** ; mais le modèle de politique (§ 1.2) en contient | voir § 1.3 |
| 11 | Usage commercial : application payante, abonnements, publicité, dons, freemium **permis sans licence séparée** si le contenu reste dans l'expérience ; licence écrite pour toute vente ou redistribution des données | modèle économique d'Awzid compatible ; aucune API ouverte | **conforme** |
| 12 | Interdits : extraction, contenus dénigrant l'islam, extrémisme | — | **conforme** |
| 13 | Audit : fournir sur demande journaux, schémas d'architecture | journaux d'audit et documents du dépôt (`docs/adr`, `EXPLOITATION.md`) | **prêt** ; garder les journaux d'accès QF |
| 14 | Évolution des API : préavis habituel 30 jours | aucune veille | **à faire** : surveiller les annonces (adresse du compte développeur) |
| 15 | Fin : supprimer le contenu QF et les données ; laisser les utilisateurs exporter | `AWFORM_QF_MUSHAF_DIR` à supprimer ; identifiants à retirer ; cache mémoire vidé au redémarrage | **procédure existante** |
| 17-18 | **Indemnisation** de QF pour les réclamations de tiers ; droit de **New York**, tribunaux exclusifs de New York County | accepté par le titulaire du compte développeur (le client, à titre personnel ?) | **à faire** : savoir *qui* a accepté (personne ou société) ; faire lire ces deux clauses au juriste ; transférer le compte à la société quand elle existe |

### 1.2 Politique de confidentialité exigée par QF (« Developer Privacy Policy Packet »)

| Exigence QF (résumé) | Où dans nos textes | Statut |
|---|---|---|
| Nommer l'app, dire qu'elle utilise les API QF ; mentionner Quran.com et QuranReflect | confidentialité § « Responsable… » (13/10) | fait |
| Date d'effet ; liste des données ; texte public sans donnée personnelle ; minimisation ; finalités + base légale par fonction | confidentialité §§ « Données collectées », « Finalités » | fait |
| Pas de profils publicitaires ; pas de revente ; **pas d'entraînement d'IA sur du contenu utilisateur sans accord** | « Aucune publicité… », « jamais utilisé pour entraîner une IA » | fait |
| Donnée religieuse = sensible ; **consentement explicite, séparé des CGU, par action délibérée** | § « Données révélant une conviction religieuse » (case non cochée, séparée) | fait |
| Nommer **tous** les sous-traitants avec **lien** vers leur politique ; contrats de traitement ; exiger le respect du contenu islamique | § « Destinataires et sous-traitants » | **partiel** : liens à ajouter par le client (champ entre crochets) |
| Sécurité (TLS, chiffrement au repos, moindre privilège, **cadence de rotation**) ; **réponse aux incidents sous 24 h** ; « Security Rule 6.9 » | § « Sécurité et violation » (24 h ajouté ; cadence entre crochets) | **partiel** ; « Security Rule 6.9 » : référence introuvable dans les documents publics lus, à demander à QF |
| Révocation OAuth (lien) | sans objet : aucun OAuth QF | sans objet |
| Écran « Supprimer mes données », accès et rectification | « Mon compte » (export, suppression) | fait |
| Conservation : seulement tant que le compte est actif ; suppression définitive sous **30 jours** ; sauvegardes purgées sous **90 jours** | 30 jours ; sauvegardes 14 jours | fait |
| **Mineurs : app « non destinée aux moins de 13 ans (ou 18 ans) », bloquer les inscriptions de mineurs détectés** ; option : guide pour les parents | — | **écart majeur : voir § 1.3** |
| Transferts : divulgation + clauses types ; conformité locale | § « Destinataires » | fait (à vérifier) |
| Notification des changements ; contact **e-mail et adresse postale** ; réponse sous **30 jours** | §§ « Modifications », « Responsable » (30 jours) | fait ; adresses à fournir par le client |

### 1.3 Écarts entre les conditions de QF et notre usage

1. **Profils d'enfants (écart majeur, à trancher avec QF avant de montrer ses contenus à des enfants en production).**
   Le modèle de politique de QF demande de déclarer l'application non destinée aux moins de 13 ans et de bloquer les
   inscriptions de mineurs. Awzid est conçue pour les enfants dès 5 ans, par leur parent. Les Developer Terms eux-mêmes
   n'ont pas de clause sur les mineurs, et ce modèle vise surtout les applications qui lisent des **données d'utilisateurs
   de Quran.com** (OAuth) ; nous n'en lisons aucune. Mais le texte est explicite et l'accord n'est pas écrit.
   **Action** : écrire à developers@quran.com (modèle ci-dessous) ; en attendant, la bêta peut désactiver les interrupteurs
   `recitateurs_en_ligne` et `mushaf_exact` pour les profils d'enfants (le registre des fonctions permet une règle par âge) ;
   les adultes et adolescents peuvent les garder.
2. **Version des conditions** : nos documents citent la mise à jour du 04/10 ; la version en vigueur date du 11/10 : mettre à jour `LICENCES.md` et `SOURCES_MUSHAF.md` (date et lien), archiver le texte.
3. **Content Sync ≤ 7 jours** : à vérifier en production (voir § 1.1, ligne 8).
4. **Liens vers les politiques des sous-traitants** : à ajouter par le client.
5. **Rotation des secrets** : cadence à fixer.
6. **Clauses 17-18** (indemnisation, New York) : à faire relire.

*Projet de message à QF (à envoyer par le client)* : « Notre application Awzid, destinée à l'apprentissage de l'arabe et du
Coran, est utilisée par des enfants à partir de 5 ans via un compte parent. Nous n'utilisons ni OAuth ni données
d'utilisateurs Quran.com : seulement vos contenus (récitations en streaming, mise en page par Content Sync). Votre modèle de
politique demande de déclarer l'application non destinée aux moins de 13 ans. Pouvez-vous confirmer par écrit que
l'affichage de vos contenus aux profils d'enfants créés par un parent est autorisé ? »

## 2. Tableau de licences et attributions

| Élément | Source, version | Licence | Exigences | Crédit dans Awzid | Lien |
|---|---|---|---|---|---|
| Texte du Coran (Ḥafṣ) | Tanzil Quran Text (Uthmani) © Tanzil Project | CC BY 3.0 ; copie verbatim, **modification interdite** | source (Tanzil Project) indiquée, **lien vers tanzil.net**, **bloc de droits conservé** dans les copies et fichiers dérivés ; suivre les mises à jour | mentions légales ; `lecteur.credit` ; « Garanties » | https://tanzil.net/docs/text_license |
| Métadonnées du Coran (pages, ajzāʾ, aḥzāb) | Tanzil.info, Quran Metadata 1.0 | CC BY 3.0 | attribution | mentions légales | https://tanzil.net |
| Traduction française | Rachid Maach, `french_rashid` v1.0.3, par QuranEnc.com | conditions QuranEnc (7 points, `LICENCES.md` § 4) | pas de modification ; **éditeur et source (QuranEnc.com)** ; **numéro de version** ; conserver les informations de transcription ; **notifier la source de toute remarque** ; mettre à jour vers la dernière version ; pas de publicité inappropriée | sous le panneau de traduction (`mp.credit_traduction`) ; mentions légales | https://quranenc.com/fr/browse/french_rashid |
| Traduction anglaise | Rowwad Translation Center, `english_rwwad` v1.0.19 | idem | idem | idem | https://quranenc.com/en/browse/english_rwwad |
| Textes des riwāyāt (Warsh, Qālūn, Shuʿba, as-Sūsī, al-Bazzī, ad-Dūrī) et polices du Muṣḥaf (KFGQPC, QCF 1405) | Complexe du Roi Fahd (Médine), plateforme développeurs | texte : « utilisable dans le développement d'applications » ; **polices : gratuit, copie/distribution libres, ni vente, ni modification, ni conversion** | servir les TTF **tels quels** (pas de WOFF2, pas de sous-ensemble), ne jamais les vendre | `rw.credit` ; sous la page exacte ; mentions légales | https://qurancomplex.gov.sa (site injoignable depuis ce poste le 13/10 : conditions relevées les 04-05/10) |
| Audio du Coran (récitations par verset) | Complexe du Roi Fahd, fichiers « ayat » (lot 27) | licence archivée à l'import (`--licence-url`, `--licence-texte`) ; conditions du Complexe | fichiers jamais renommés ni modifiés ; **retrait immédiat** possible par récitateur | nom du récitateur et Complexe | idem |
| Récitations « en ligne » | Quran Foundation (API de contenu) | Developer Terms | § 1 ci-dessus : streaming seulement, aucune copie des enregistrements, crédit, compte actif | « écoute en ligne fournie par Quran Foundation » | https://api-docs.quran.foundation/legal/developer-terms/ |
| Lignes du Muṣḥaf de Médine | Quran Foundation, ressource `mushafs:<id>` (Content Sync) | Developer Terms | § 1 ci-dessus | sous la page, « Garanties » | idem |
| Tajwid en couleurs | Collin Fair, `quran-tajweed` (commit 496f71c) | CC BY 4.0 | attribution, **signaler les modifications** (recalage sur Tanzil), lien vers la licence | sous « Tajwid en couleurs » (`tj.credit`) ; mentions légales | https://github.com/cpfair/quran-tajweed ; https://creativecommons.org/licenses/by/4.0/ |
| Polices Amiri, Amiri Quran | The Amiri Project Authors v5.3.0 (@fontsource) | SIL Open Font License 1.1 | conserver copyright et texte de licence avec les copies ; ne pas vendre seule ; noms réservés si modifiée | `static/fonts/*.LICENSE.txt` ; mentions légales | https://github.com/aliftype/amiri ; https://openfontlicense.org |
| Police Noto Naskh Arabic | Noto Project Authors v5.3.0 | SIL OFL 1.1 | idem | idem | https://github.com/notofonts/arabic |
| Polices Nunito, Lexend | Nunito / Lexend Project Authors v5.3.0 | SIL OFL 1.1 | idem | idem | https://github.com/googlefonts/nunito ; https://github.com/googlefonts/lexend |
| Horaires de prière | adhan-js 4.4.6 (Batoul Apps) | MIT | conserver l'avis de copyright | mentions légales | https://github.com/batoulapps/adhan-js |
| Reconnaissance de la parole (canal bêta) | NVIDIA STT Arabic FastConformer Hybrid Large PCD v1.0 | CC BY 4.0 | attribution, indiquer les modifications (aucune : poids inchangés) | mentions légales | https://creativecommons.org/licenses/by/4.0/ |
| Voix de synthèse des leçons | Google Cloud Text-to-Speech | conditions Google Cloud (D31 : diffusion des fichiers générés dans l'application et hors ligne **à confirmer**) | mention « Voix : Google Cloud Text-to-Speech » | mentions légales ; leçons | https://cloud.google.com/text-to-speech |
| Tuteur d'IA (désactivé en bêta) | Gemini via Vertex AI (Google) | conditions Google Cloud | pas d'entraînement sur nos données ; contrat de traitement ; AIPD révisée | politique de confidentialité | https://cloud.google.com/vertex-ai |

## 3. Écarts et actions (hors QF)

| # | Écart ou point à vérifier | Action |
|---|---|---|
| L1 | **Tanzil : bloc de droits** « inclus dans tous les exemplaires verbatim et reproduit dans les fichiers dérivés ». Les fichiers servis par sourate ne semblent pas porter le bloc (non vérifié fichier par fichier) ; le crédit du lecteur nomme Tanzil sans lien cliquable (l'adresse tanzil.net est dans les mentions légales) | ajouter un fichier `static/licences/tanzil.txt` avec le bloc d'origine (copie archivée dans `tajwid-source/`) et un lien depuis les mentions légales ; ou faire confirmer par le juriste que la mention de source suffit |
| L2 | QuranEnc point 5 : **notifier la source** de toute remarque sur une traduction | procédure dans `SUPPORT_ET_ERRATA.md` § 6 : toute erreur de traduction confirmée est transmise à QuranEnc |
| L3 | QuranEnc point 6 : **mettre à jour** vers la dernière version | tâche trimestrielle : comparer la version publiée (`/api/v1/translations/list/fr`, `/en`) à celle du dépôt |
| L4 | Complexe : conditions des polices et de l'audio relevées les 04-05/10, site injoignable le 13/10 | relire quand le site répond et archiver la page (date, empreinte) |
| L5 | Google TTS (D31) | lire les conditions du service avant la mise en ligne publique |
| L6 | Boutiques d'applications (Android) | fiche de la boutique : lier la politique de confidentialité, déclarer les données et le public « enfants » (hors périmètre ici) |
