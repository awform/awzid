# AIPD — enfants, données révélant une conviction religieuse, voix et IA (bêta fermée)

> **Provisoire — avant signature d'un juriste ; en attente d'une seconde lecture juridique.** Rédigée le 13/10/2026.
> Complète et remplace pour la bêta `docs/juridique/AIPD_BROUILLON.md` (30/09/2026), dont les mesures et preuves
> restent valables (tableau § 4 de ce document). Structure du **RGPD art. 35(7)** (lu à la source le 13/10/2026) :
> (a) description, (b) nécessité et proportionnalité, (c) risques, (d) mesures.

## 0. Faut-il une AIPD ?

L'art. 35(1) l'impose pour un traitement « susceptible d'engendrer un risque élevé » ; l'art. 35(3)(b) cite le
traitement **à grande échelle** de catégories particulières (art. 9). Réunis ici : personnes vulnérables (enfants dès
5 ans), donnée pouvant révéler une conviction religieuse, voix, IA envisagée. La **bêta fermée** n'est pas « à grande
échelle » (invités seulement), mais l'AIPD est faite **avant** l'ouverture, car l'ouverture publique la rendra
obligatoire et les mesures sont les mêmes.

## 1. Description des traitements (35(7)(a))

Voir `REGISTRE_TRAITEMENTS.md` : lignes 2 (profils d'enfants), 3 (accord art. 9), 4 (suivi pédagogique), 5 et 6 (voix),
10 (tuteur), 11-12 (signalements). Personnes : enfants (dès 5 ans) via leur parent, adolescents, adultes, enseignants.
Finalité : apprendre l'arabe, le Coran et les bases religieuses ; aucune finalité commerciale sur les données.
Hébergement : Google Cloud, Paris (UE). Pas de publicité, pas de revente, pas de profilage commercial.

## 2. Nécessité et proportionnalité (35(7)(b))

| Question | Réponse |
|---|---|
| Faut-il traiter l'usage du Coran ? | Oui, c'est le service demandé : sans suivi (progression, hifẓ) l'application ne sert pas. Aucune donnée n'est demandée sur la religion elle-même (ni confession, ni pratique déclarée). |
| Minimisation | Enfant : pseudonyme, **année** de naissance, niveau, avatar. Pas de nom, photo, adresse, téléphone. Élève de classe papier : prénom + initiale. Signalement : catégorie, texte court, chemin de page, version ; enfant : catégorie seulement. |
| Base légale de la donnée religieuse | Consentement **explicite** (RGPD art. 9(2)(a)), séparé des CGU, case non cochée, daté, versionné, preuve ; par le parent pour un enfant. Sénégal : consentement **exprès écrit** (loi 2008-12 art. 41), recueilli par écrit dans l'application. |
| Alternative moins intrusive ? | Un usage sans compte (hors ligne, sans suivi) reste possible pour les contenus gratuits ; le suivi exige le compte. Le retrait de l'accord met le compte en pause sans rien effacer ; l'export et la suppression sont disponibles. |
| Âge | RGPD art. 8 (lu) : 16 ans, États membres de 13 à 16. Paramétrage : FR 15, DE 16, ES 14, GB/US 13, Québec 14, défaut 16, Sénégal 18 par prudence (`apps/api/src/auth/policy.ts`). **Un enfant n'a jamais de compte propre** : le parent crée le profil, avec des efforts raisonnables de vérification (art. 8(2)) : compte parent à e-mail vérifié, code parent, accord daté. États-Unis < 13 ans : fermé. |
| Durées | `DUREES_CONSERVATION.md` : suppression sous 30 jours, sauvegardes 14 jours, voix 7 jours sur l'appareil, 1 à 30 jours si envoyée. |
| Tiers | Aucun transfert de données de l'utilisateur à un tiers pour ses besoins propres. Sous-traitants listés au registre. Quran Foundation ne reçoit aucune donnée de l'utilisateur (seule l'IP d'un appareil qui lit un récitateur « en ligne »). |

## 3. Risques pour les personnes (35(7)(c))

Échelle 1 (négligeable) à 4 (maximal), **après** mesures.

| # | Risque | Vraisemblance | Gravité | Mesures principales (§ 5) | Reste à faire |
|---|---|---|---|---|---|
| R1 | Révélation d'une conviction religieuse (fuite de la base, visibilité de l'inscription, réquisition) | 2 | 3 | M1, M2, M3, M8 | seconde lecture juridique ; décision sur les réquisitions (§ 6) |
| R2 | Accès à un compte d'enfant par un tiers (autre famille, enseignant non autorisé) | 1 | 3 | M2, M4 | test d'intrusion externe avant l'ouverture publique |
| R3 | Contact d'un enfant par un adulte | 1 | 4 | M5 | numéros d'aide par pays (D11) |
| R4 | Voix d'enfant conservée, réutilisée ou envoyée à une IA | 1 | 3 | M6 | — |
| R5 | IA : réponse religieuse inventée, tuteur détourné, données envoyées à un fournisseur | 1 | 3 | M7 | **réviser l'AIPD avant d'activer un fournisseur réel** (Gemini/Vertex AI prévu) |
| R6 | Consentement parental mal recueilli ou non prouvé | 2 | 3 | M1, M3 | méthode de vérification renforcée avant l'ouverture publique ; avis du juriste sur les âges |
| R7 | Signalement ou capture d'écran révélant des données personnelles | 2 | 2 | M9 | — |
| R8 | Contenu religieux erroné présenté comme exact (atteinte à la croyance, confusion d'un enfant) | 2 | 3 | M10 | relecture savante par niveau |
| R9 | Perte de disponibilité ou d'intégrité (panne, rançongiciel) | 2 | 2 | M8 | stockage hors site (D10) |
| R10 | Données de Sénégalais hébergées à l'étranger sans formalité | 2 | 3 | M3 | **déclaration CDP** (`GUIDE_CDP_SENEGAL_CLIENT.md`) avant l'ouverture au Sénégal |

## 4. État des mesures héritées de l'AIPD du 30/09

Contrôle de propriété à chaque route, cookie HttpOnly/SameSite/Secure, en-tête anti-CSRF, second facteur du
personnel (tests `lot21`, `recital`, `ecole-synthese`) ; messagerie sans échange entre élèves ; voix chiffrée AES-256-GCM ;
filtres et batterie adverse du tuteur ; sauvegarde chiffrée avec restauration testée ; relais d'école chiffré ; comptes
PostgreSQL à droits minimaux, CSP, scan ZAP. Détail et fichiers : `docs/juridique/AIPD_BROUILLON.md` § 4.

## 5. Mesures prévues (35(7)(d))

| # | Mesure | Où |
|---|---|---|
| M1 | Accord art. 9 explicite, séparé, retirable ; accord parental profil par profil ; preuves versionnées | `apps/api/src/auth/accords.ts`, `policy.ts` (`TEXT_VERSION = 2026-10-13`) |
| M2 | Minimisation : aucun nom/photo d'enfant ; aucune donnée religieuse déclarative | schéma `profile` |
| M3 | Pays : âge par pays, Sénégal 18 ans, US < 13 fermé, accord au transfert hors du Sénégal | `policy.ts` |
| M4 | Isolation des comptes, code parent pour les accords d'enfant, second facteur du personnel | `guards.ts`, `auth/routes.ts` |
| M5 | Pas de contact entre élèves ; messagerie enseignant ↔ famille chiffrée ; signalement | `messagerie.ts` |
| M6 | Voix : 7 jours sur l'appareil ; envoi par choix ; analyse IA **en mémoire**, conteneur en lecture seule, jamais conservée ni réutilisée pour entraîner | `recitations.ts`, `ecoute-ia.ts`, `ECOUTE_IA.md` |
| M7 | Tuteur **éteint en bêta** (fournisseur simulé) ; désactivé par défaut pour l'enfant ; Coran jamais généré ; questions religieuses transmises à l'enseignant | `packages/tutor` |
| M8 | Hébergement UE, chiffrement en transit et au repos, sauvegardes chiffrées, journal d'audit, procédure de violation | `PROCEDURE_VIOLATION_DONNEES.md` |
| M9 | Signalement : texte court, « n'écrivez ni nom ni adresse », enfant sans texte, capture facultative et masquée, purge à 90 jours | `apps/web/src/lib/avis/`, `apps/api/src/support.ts` |
| M10 | Mention « en cours de relecture savante », bouton « Signaler une erreur », errata publics datés et sourcés, suspension d'urgence d'un bloc | `signalements.ts`, page `/errata` |

## 6. Points ouverts

1. **Réquisition par une autorité** demandant la liste des inscrits : politique à écrire avec le juriste (minimiser, exiger un acte régulier, informer si la loi le permet).
2. **Profils d'enfants et Quran Foundation** : son modèle de politique de confidentialité demande de déclarer l'application « non destinée aux moins de 13 ans » et de bloquer les inscriptions de mineurs détectés ; cela entre en tension avec notre usage par des enfants (voir `LICENCES_PRODUCTION.md` § 3). À trancher par écrit avec QF avant d'afficher ses contenus à des profils d'enfants en production.
3. **Gemini / Vertex AI** : AIPD à réviser, région UE, contrat de traitement, absence d'entraînement sur nos données.
4. **Désignation d'un DPO** : à décider avant l'ouverture publique.

## 7. Conclusion provisoire

Risques résiduels **acceptables pour une bêta fermée** (invités connus, tuteur éteint, paiement éteint) sous réserve
de : consentements en place (fait dans le code), déclaration CDP avant tout utilisateur sénégalais, accord de QF
sur les profils d'enfants, seconde lecture juridique des textes. **Avis du DPO et décision du responsable : [à compléter].**
