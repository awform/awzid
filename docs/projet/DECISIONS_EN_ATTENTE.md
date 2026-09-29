# Décisions en attente du client

Points qui demandent une décision du client (argent, comptes, marque, prix, juridique, contenu religieux).
Pour chacun : la solution **provisoire et réversible** retenue dans le code, ou « sauté ». Tenu par les sessions
de développement ; le plus récent en haut.

| # | Date | Lot | Sujet | Question au client | Provisoire retenu |
|---|---|---|---|---|---|
| D1 | 29/09/2026 | 17 | Juridique — lois et autorités par pays | Faire valider par le juriste le tableau `countryRules` (`apps/api/src/auth/policy.ts`) : âges, lois, autorités ; formalités auprès de la CDP (Sénégal) à accomplir. | Tableau appliqué, marqué `aValider` ; pays inconnus : mention générique, aucune autorité inventée. |
| D2 | 29/09/2026 | 17 | Comptes — domaine des relais | Nom de domaine des relais (ex. `relais.awzid.org`) et enregistrement DNS `*.relais…` → serveur central. | Rien de créé ; `RELAIS_DOMAINE` absent = aucun certificat demandé. |
| D3 | 29/09/2026 | 17 | Contact pour les directeurs | Numéro et adresse de l'équipe AWFORM à imprimer dans `infra/relais/MODE_EMPLOI_DIRECTEUR.md`. | « [à compléter] ». |

## Décisions prises

| # | Date | Sujet | Décision du chef de projet | Suite |
|---|---|---|---|---|
| D4 | 29/09/2026 | Budget de poids web (≈ 205 Ko pour 150 Ko) | On **garde 150 Ko** et on allège la coquille : langues chargées à la demande, découpage par page. | Lot 24 (V1-h). |
| D5 | 29/09/2026 | Dictée photographiée (V1, option) | **Écartée pour l'instant.** | Rien à faire. |
