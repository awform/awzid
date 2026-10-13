# Guide pour le client — démarches auprès de la CDP du Sénégal

> **Provisoire — avant signature d'un juriste ; en attente d'une seconde lecture juridique.** 13/10/2026.
> Ce guide décrit ce que **vous** devez faire ; rien n'a été déposé, signé ni envoyé à votre place. Les articles cités
> sont ceux de la **loi n° 2008-12 du 25 janvier 2008** (texte consolidé lu sur senlii.org le 13/10/2026) ; le texte
> en vigueur doit être confirmé sur le site de la CDP, car une révision de la loi avait été annoncée (CIPESA, 2020) et
> nous n'avons pas pu vérifier si elle a eu lieu. Site de la CDP : https://www.cdp.sn (textes :
> https://www.cdp.sn/legislation/textes-reglementaires). Nous n'avons **pas pu ouvrir** les formulaires du site : leur
> nom exact, les frais et l'adresse de dépôt sont à lire sur cdp.sn ; une adresse (contact@cdp.sn, siège aux Almadies à
> Dakar) circule sur des sites tiers, sans confirmation de notre part.

## En deux phrases

Tant que le récépissé de la CDP n'est pas reçu, **n'ouvrez pas Awzid à des utilisateurs au Sénégal** : l'art. 18 dit
que « seule la réception du récépissé donne droit à la mise en œuvre d'un traitement ». La bêta fermée **hors du
Sénégal** (famille en France, relecteurs) n'attend pas la CDP, mais l'école pilote sénégalaise, si, elle attend.

## Ce que dit la loi (utile pour remplir les formulaires)

| Sujet | Article | Contenu |
|---|---|---|
| Déclaration | 18 | régime normal : déclaration à la CDP ; récépissé délivré dans un mois (prorogeable une fois) |
| Autorisation | 20 | requise notamment pour : données génétiques ou de santé pour la recherche, infractions et condamnations, interconnexions, numéros d'identification nationaux, **biométrie**. La donnée religieuse n'y figure pas expressément. |
| Données sensibles | 4, 40, 41 | les opinions ou activités religieuses sont des données sensibles ; traitement interdit sauf exceptions, dont le **consentement exprès écrit** (art. 41) : notre accord « conviction religieuse » est écrit, daté et conservé |
| Transfert hors du Sénégal | 49, 50, 51 | seulement vers un pays offrant une protection suffisante ; **le responsable informe la CDP avant tout transfert** (art. 49) ; autre pays : cas limités (art. 50) ou **autorisation de la CDP** (art. 51) |
| Information et droits | 58 à 69 | information à la collecte ; accès, opposition, rectification/suppression (réponse sous un mois pour la suppression) |
| Sous-traitants | 39, 52 | contrat écrit |
| Sécurité | 70, 71 | engagements écrits du personnel, mesures contre l'accès non autorisé |
| Sanctions | 29 à 32 | avertissement, mise en demeure, retrait, amende de 1 à 100 millions de FCFA, suspension |

**Ce que nous ignorons et que la CDP doit confirmer** : (1) si la donnée « apprentissage du Coran » relève d'une simple
déclaration (art. 18) ou d'une autorisation ; (2) si l'hébergement à Paris est un pays « suffisamment protecteur » (art. 49)
ou demande l'autorisation de l'art. 51 ; (3) si la CDP attend une notification en cas de violation ; (4) un âge de
majorité numérique (nous n'en avons pas trouvé : Awzid applique 18 ans par prudence).

## Étapes (dans l'ordre)

1. **Préparer l'identité du responsable** : raison sociale, forme juridique, siège, NINEA ou immatriculation, nom du représentant légal, coordonnées, éventuel représentant au Sénégal si la société est à l'étranger. *(Vous seul.)*
2. **Créer l'adresse de contact « données personnelles »** (même que le support) : elle doit figurer dans la politique de confidentialité et les mentions légales (champs entre crochets). *(Vous seul.)*
3. **Lire le site de la CDP** : repérer les formulaires de déclaration, de demande d'autorisation et d'information sur un transfert, les frais éventuels, le mode de dépôt (en ligne, courrier, dépôt au siège) et les délais.
4. **Poser trois questions à la CDP par écrit** (courriel ou courrier ; garder une trace) :
   - « Une application d'apprentissage du Coran, avec consentement exprès écrit, relève-t-elle d'une déclaration (art. 18) ou d'une autorisation ? »
   - « L'hébergement des données en France (Google Cloud, Paris) exige-t-il une simple information (art. 49) ou une autorisation (art. 51) ? »
   - « Une notification est-elle attendue en cas de violation de données ? »
5. **Rassembler les pièces** — Claude les prépare, vous les relisez :
   - fiche de chaque traitement : `REGISTRE_TRAITEMENTS.md` (lignes 1 à 7, 9, 10, 14) ;
   - mesures de sécurité : registre § « Mesures de sécurité » et `AIPD_MINEURS_DONNEES_RELIGIEUSES.md` § 5 ;
   - analyse d'impact : `AIPD_MINEURS_DONNEES_RELIGIEUSES.md` ;
   - modèles d'information et de consentement : pages `/legal/confidentialite`, `/legal/cgu`, accord « conviction religieuse » (texte de l'application) ;
   - contrats : Google Cloud (condition de traitement), prestataire d'e-mail ; contrat de sous-traitance avec l'école [à rédiger avec le juriste] ;
   - durées : `DUREES_CONSERVATION.md`.
6. **Remplir et déposer** le dossier (déclaration ou demande d'autorisation, et information ou demande pour le transfert). *(Vous seul : c'est vous qui signez.)* Conserver l'accusé de dépôt.
7. **Attendre le récépissé** (un mois, prorogeable une fois, art. 18 ; deux mois pour une autorisation, art. 23 : silence = réponse favorable). Ne pas ouvrir au Sénégal avant.
8. **Après réception** : donner le numéro de récépissé à Claude pour l'ajouter aux mentions légales et à la politique ; ranger le récépissé avec les contrats ; mettre une date de revue annuelle.
9. **Traduction** : prévoir une version simple en wolof et en arabe de l'information aux familles (hors bêta).
10. **Droits des personnes** : à réception d'une demande, répondre dans un mois (art. 69) ; l'export et la suppression se font dans « Mon compte ».

## Ce que Claude fait pendant ce temps

Met à jour le registre et l'AIPD après les réponses de la CDP, ajuste les textes juridiques, ajoute le numéro de récépissé, prépare le projet de courrier des trois questions (sur demande).

## Calendrier conseillé

Poser les questions dès maintenant (étape 4) : la réponse conditionne la nature du dossier. Les formalités prennent des
semaines ; pour une école pilote sénégalaise, les lancer **avant** de faire créer des comptes.
