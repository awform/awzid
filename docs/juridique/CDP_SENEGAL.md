# Commission de protection des données personnelles (CDP, Sénégal) — formalités à prévoir

> **BROUILLON — à valider par un juriste** connaissant la pratique de la CDP. Rédigé le 30/09/2026. Les numéros
> d'articles de la loi n° 2008-12 du 25 janvier 2008 et de son décret d'application n° 2008-721 du 30 juin 2008
> sont cités **sous réserve de vérification** ; les formulaires et la procédure en ligne de la CDP
> (cdp.sn) doivent être consultés dans leur version en vigueur.

## 1. Pourquoi Awzid est concerné

L'école pilote est au Sénégal : des données de personnes au Sénégal (élèves, souvent mineurs, parents,
enseignants) sont traitées, et **hébergées hors du Sénégal** (Union européenne). La loi 2008-12 s'applique au
responsable du traitement établi au Sénégal **ou** qui recourt à des moyens situés au Sénégal (le relais
d'école posé dans l'école en est un) [à vérifier].

## 2. Formalités probables

| Formalité | Pourquoi | Pour quels traitements (voir `REGISTRE_TRAITEMENTS.md`) | À vérifier |
|---|---|---|---|
| **Demande d'autorisation** (plutôt qu'une simple déclaration) | données **sensibles** probables (conviction religieuse révélée par l'usage du hifẓ et des sciences islamiques) ; données de mineurs | 1 à 5, 7, 8 | régime exact pour les données religieuses et les mineurs ; possibilité d'une autorisation unique |
| **Autorisation de transfert** vers un pays tiers | hébergement dans l'Union européenne ; plus tard fournisseurs aux États-Unis (tuteur d'IA, notifications des navigateurs, paiement) | tous (hébergement) ; 8, 9, 10 | liste des pays jugés « adéquats » par la CDP ; garanties à fournir (clauses contractuelles) |
| **Déclaration** (régime normal ou simplifié) | traitements courants | 11 (journal), 13 (sauvegardes), 9 (comptabilité) | normes simplifiées existantes |
| **Désignation d'un correspondant** à la protection des données | facultatif ou recommandé selon la CDP | — | usage de la CDP |
| **Information des personnes** | droit à l'information | tous | contenu minimal exigé par la loi |

## 3. Pièces à préparer

1. Identité du responsable (statuts, NINEA ou immatriculation, représentant au Sénégal si l'entreprise est à
   l'étranger) — **[à fournir par le client]**.
2. **Fiche de chaque traitement** : finalité, catégories de données et de personnes, durées, destinataires,
   transferts — à tirer de `docs/juridique/REGISTRE_TRAITEMENTS.md`.
3. **Mesures de sécurité** (description technique) — à tirer de `docs/juridique/AIPD_BROUILLON.md` § 4 et de
   `docs/projet/ZAP.md`.
4. **Analyse d'impact** (AIPD) — `docs/juridique/AIPD_BROUILLON.md` (à finaliser).
5. **Modèles d'information et de recueil du consentement** : politique de confidentialité (versions parents et
   adolescents), texte de l'accord de transfert hors du pays, texte du consentement parental.
6. **Contrats** : hébergeur (UE), sous-traitance avec l'école, futurs prestataires (paiement mobile, IA) avec
   clauses de transfert.
7. Contact de la personne chargée des demandes d'accès, de rectification et d'opposition.

## 4. Ce que l'application fait déjà

| Exigence (à rapprocher des articles de la loi) | Dans l'application | Preuve |
|---|---|---|
| Consentement **exprès** de la personne | inscription : case « CGU » et, pour le Sénégal, **accord exprès au transfert hors du pays** ; accords datés, versionnés, avec la loi et l'autorité citées dans la preuve | `apps/api/src/auth/policy.ts` (`requiredAccountConsents`, `lawEvidence`), e2e `comptes.spec.ts` (« Sénégal : consentement au transfert ») |
| Mineurs protégés | **tout mineur (moins de 18 ans) au Sénégal passe par un parent** (âge 18 dans `DIGITAL_CONSENT_AGE`) ; code parent pour chaque accord donné pour un enfant | `apps/api/src/auth/policy.ts`, `apps/api/src/guards.ts` |
| Information | page « Confidentialité » (brouillon), mention de la CDP comme autorité de réclamation | `apps/web/src/lib/legal/content.ts` |
| Droit d'accès et de portabilité | export complet en un fichier | `apps/api/src/auth/donnees.ts` (`/account/export`) |
| Droit d'opposition, de suppression | suppression du compte (effacement définitif sous 30 jours), retrait des accords facultatifs | `apps/api/src/auth/donnees.ts`, `packages/db/src/purge.ts` |
| Durées limitées | purges nocturnes | `packages/db/src/purge.ts` |
| Sécurité et confidentialité | chiffrement des voix, messages, files du relais ; second facteur des enseignants ; comptes de base à droits minimaux ; sauvegardes chiffrées et restauration testée | voir AIPD § 4 |
| Données dans l'école | relais d'école : envois chiffrés, effacés dès leur transmission | `apps/relay`, `infra/ci/test-relais.sh` |
| Tableau par pays | lois et autorités par pays, marqué « à valider » | `countryRules` (`apps/api/src/auth/policy.ts`), décision D1 |

## 5. Ce qui manque avant l'ouverture au Sénégal

- Dépôt des formalités ci-dessus et **réponse de la CDP** (délais à prévoir) ;
- fondement de la donnée religieuse (**D18**) et texte de consentement correspondant ;
- traduction des informations en **wolof** (et arabe) à étudier pour les familles ;
- numéro d'aide pour les enfants au Sénégal dans la messagerie (D11) ;
- contact de l'équipe pour les directeurs (D3).
