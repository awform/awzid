# Décisions en attente du client

Points qui demandent une décision du client (argent, comptes, marque, prix, juridique, contenu religieux).
Pour chacun : la solution **provisoire et réversible** retenue dans le code, ou « sauté ». Tenu par les sessions
de développement ; le plus récent en haut.

| # | Date | Lot | Sujet | Question au client | Provisoire retenu |
|---|---|---|---|---|---|
| D9 | 29/09/2026 | audit MIN-8 | Juridique — durées de conservation | Faire valider par le juriste : journal d'audit 12 mois ; questions et alertes du tuteur 12 mois une fois traitées (24 mois au plus) ; sessions 30 jours après expiration ; paiements abandonnés 30 jours (paiements réussis gardés pour la comptabilité) ; verrous anti-essais 24 h. À reporter dans la politique de confidentialité. | Appliqué chaque nuit par le travailleur (`purgeRetention`, `purgeAuthThrottle`, `packages/db/src/purge.ts`) ; chiffres modifiables à un seul endroit. |
| D1 | 29/09/2026 | 17 | Juridique — lois et autorités par pays | Faire valider par le juriste le tableau `countryRules` (`apps/api/src/auth/policy.ts`) : âges, lois, autorités ; formalités auprès de la CDP (Sénégal) à accomplir. | Tableau appliqué, marqué `aValider` ; pays inconnus : mention générique, aucune autorité inventée. |
| D2 | 29/09/2026 | 17 | Comptes — domaine des relais | Nom de domaine des relais (ex. `relais.awzid.org`) et enregistrement DNS `*.relais…` → serveur central. | Rien de créé ; `RELAIS_DOMAINE` absent = aucun certificat demandé. |
| D8 | 29/09/2026 | 20 | Juridique / marque — vérification publique des certificats | La page `/verifier/<numéro>?c=<code>` montre à qui détient le QR : nom affiché (prénom + initiale), niveau, mention, date. À valider par le juriste et à mentionner dans la politique de confidentialité ; nom de domaine définitif pour l'adresse imprimée ; conservation de l'ancienne clé de signature en cas de rotation. | Page active, registre seulement, sans le bon code : rien ; clé générée par `deploy.sh` (`AWFORM_CERT_SIGN_KEY`). |
| D3 | 29/09/2026 | 17 | Contact pour les directeurs | Numéro et adresse de l'équipe AWFORM à imprimer dans `infra/relais/MODE_EMPLOI_DIRECTEUR.md`. | « [à compléter] ». |

## Décisions prises

| # | Date | Sujet | Décision du chef de projet | Suite |
|---|---|---|---|---|
| D4 | 29/09/2026 | Budget de poids web (≈ 205 Ko pour 150 Ko) | On **garde 150 Ko** et on allège la coquille : langues chargées à la demande, découpage par page. | Lot 24 (V1-h). |
| D5 | 29/09/2026 | Dictée photographiée (V1, option) | **Écartée pour l'instant.** | Rien à faire. |
| D6 | 29/09/2026 | Barème des épreuves | Utiliser en priorité le barème `guide.bareme` du livre quand il existe, les règles provisoires sinon. | Fait (lot 21) : grille lue de façon tolérante (`bookGrid`), une note par partie ; format réel à vérifier sur les vrais livres (VM). |
| D7 | 29/09/2026 | Corrigés des bilans en entraînement | Masquer les corrigés des bilans et examens dans la projection élève ; entraînement sur bilan corrigé par le serveur. | Fait (lot 21) : `studentProjection`, route `POST /units/:id/corriger`, examen en épreuve notée seulement ; tests `d7.test.ts`, `lot19.test.ts`. |
| CI | 29/09/2026 | CI sur les branches de travail | Activer la CI sur les branches `lot*-wip` (déclencheur push). | Fait (lot 21), et sur `corrections-audit`. |
