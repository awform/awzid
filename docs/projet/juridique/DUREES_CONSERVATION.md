# Durées de conservation (bêta fermée)

> **Provisoire — avant signature d'un juriste ; en attente d'une seconde lecture juridique.** 13/10/2026. Les durées
> sont celles **appliquées par le code** ; les décisions D9 et D11 (`DECISIONS_EN_ATTENTE.md`) restent à valider.
> Principe (loi 2008-12 art. 35 et 72, RGPD art. 5) : garder le temps nécessaire, pas plus.

| Donnée | Durée | Appliquée par |
|---|---|---|
| Compte supprimé | accès coupé aussitôt ; effacement définitif **sous 30 jours** | `purge.ts` (`purge-comptes`) |
| Sauvegardes chiffrées | **14 dernières** (~14 jours glissants) : un effacé disparaît des sauvegardes 14 jours plus tard | `infra/prod/backup.sh` |
| Sessions | 30 jours après expiration | `purge.ts` |
| Verrous anti-essais (empreinte d'e-mail, IP) | 24 heures | `purge.ts` |
| Liens par e-mail (vérification, mot de passe, adresse) | 30 min (mot de passe) ou 24 h ; usage unique ; effacés avec le compte | `auth/recuperation.ts` |
| Journal du tuteur | 12 mois | `purge.ts` |
| Questions et alertes du tuteur | 12 mois après traitement, 24 mois au plus (D9) | `purge.ts` |
| Journal d'audit | 12 mois (D9) ; cibles pseudonymisées à l'effacement d'un compte | `purge.ts` |
| Voix sur l'appareil | 7 jours | application |
| Récitation envoyée à l'enseignant | durée de la classe : 1 à 30 jours (14 par défaut), ou suppression par la famille | `recitations.ts` |
| Hifẓ en classe, **mode enregistrement** (adultes consentants, interrupteur `hifz_classe`) | **30 jours au plus** : durée de la classe (1 à 30 jours, 14 par défaut), puis suppression automatique chaque nuit (travailleur) ; suppression par l'élève à tout moment ; l'annotation du maître (erreurs cochées, issue, remarque) ne contient **aucune voix** et se garde comme le suivi pédagogique | `hifz-classe.ts`, `recitations.ts` (`purgeExpiredRecitations`) |
| Hifẓ en classe, **mode direct** (enfants et tous les autres élèves) | **aucun enregistrement, jamais** (contrainte de la base) ; seules les erreurs cochées (verset, rang du mot, type) sont gardées, avec la séance | `hifz-classe.ts` |
| Voix analysée par l'IA (« Réciter et vérifier ») | **aucune** (mémoire seulement) | `ecoute-ia.ts` |
| Voix analysée pour l'indication des madd (`tajwid_madd`, adultes, bêta fermée) | **aucune** (mémoire seulement, API et service) ; journal d'audit `tajwid.madd` (verset, type, décision) : 12 mois (D9) | `tajwid-madd.ts` |
| Messages école ↔ famille | 12 mois après la fin de l'année scolaire (D11) | `purge.ts` |
| Signalements « Signaler un problème » : **capture d'écran** | 90 jours | `problemes.ts` (`purgeProblemes`) |
| Signalements « Signaler un problème » **réglés** | 12 mois (365 jours) après création. *Les signalements « nouveau » ou « en cours » ne sont pas purgés.* | `problemes.ts` |
| Avis | 12 mois | `tasks.ts` |
| Empreintes d'usage | 2 jours ; totaux par jour sans personne | `tasks.ts` |
| Signalements d'erreur sur un texte (reçu → corrigé/rejeté) | durée du compte (lien d'auteur supprimé avec le compte) ; l'**erratum** public est durable | `signalements` |
| Preuves d'accord (consentements) | durée du compte + 5 ans [à valider : prescription] | `schema` |
| Paiements réussis | [durée comptable à fixer : 10 ans en France ?] — **désactivés en bêta** | — |
| Paiements abandonnés | 30 jours | `purge.ts` |
| Registre des certificats | durable (preuve d'un diplôme) [à valider] ; document complet réduit 30 jours après le départ de l'élève | `purge.ts` |
| Liste d'attente de la bêta (adresse, langue, prénom et mot facultatifs de l'écran de l'application) | **12 mois** après la demande si l'adresse est confirmée par e-mail (double consentement) ; **7 jours** si elle n'est jamais confirmée ; effacement immédiat par le lien de désinscription ou sur demande écrite (`DELETE /api/v1/admin/liste-attente/:id`) [à valider] | `tasks.ts` (`purgeListeAttente`) |
| Invitation à la bêta (code) | [à fixer avec le lot « invitation »] | branche `beta-wip` |

**Exigence Quran Foundation** (modèle de politique de confidentialité) : suppression définitive sous 30 jours après
demande, sauvegardes purgées sous 90 jours : **couvert** (30 jours, 14 jours).

**À faire** : la purge des signalements « nouveau/en cours » très anciens n'existe pas ; en bêta le volume est faible,
mais une règle (par exemple 24 mois) est à décider avant l'ouverture publique.
