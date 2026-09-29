# Décisions en attente du client

Points qui demandent une décision du client (argent, comptes, marque, prix, juridique, contenu religieux).
Pour chacun : la solution **provisoire et réversible** retenue dans le code, ou « sauté ». Tenu par les sessions
de développement ; le plus récent en haut.

| # | Date | Lot | Sujet | Question au client | Provisoire retenu |
|---|---|---|---|---|---|
| D1 | 29/09/2026 | 17 | Juridique — lois et autorités par pays | Faire valider par le juriste le tableau `countryRules` (`apps/api/src/auth/policy.ts`) : âges, lois, autorités ; formalités auprès de la CDP (Sénégal) à accomplir. | Tableau appliqué, marqué `aValider` ; pays inconnus : mention générique, aucune autorité inventée. |
| D2 | 29/09/2026 | 17 | Comptes — domaine des relais | Nom de domaine des relais (ex. `relais.awzid.org`) et enregistrement DNS `*.relais…` → serveur central. | Rien de créé ; `RELAIS_DOMAINE` absent = aucun certificat demandé. |
| D8 | 29/09/2026 | 20 | Juridique / marque — vérification publique des certificats | La page `/verifier/<numéro>?c=<code>` montre à qui détient le QR : nom affiché (prénom + initiale), niveau, mention, date. À valider par le juriste et à mentionner dans la politique de confidentialité ; nom de domaine définitif pour l'adresse imprimée ; conservation de l'ancienne clé de signature en cas de rotation. | Page active, registre seulement, sans le bon code : rien ; clé générée par `deploy.sh` (`AWFORM_CERT_SIGN_KEY`). |
| D7 | 29/09/2026 | 19 | Contenu — corrigés des bilans en entraînement | Les bilans et examens sont servis en ENTRAÎNEMENT avec leurs corrigés (projection élève) : un élève pourrait les consulter avant une épreuve notée ouverte dans l'application. Masquer les corrigés des bilans/examens hors épreuve (entraînement corrigé par le serveur) ? | Épreuve notée à passer **en classe, sous surveillance** (mode école) ; la copie est corrigée par le serveur à partir de la projection sans réponse. |
| D6 | 29/09/2026 | 19 | Pédagogie — barème des épreuves | Dans une épreuve notée : « chasse » et « contient » : 1 point par case juste, −1 par case touchée à tort (plancher 0) ; une seule réponse par item ; partie hors application ajoutée par l'enseignant (points/maximum) ; note arrondie au demi-point ; remédiation sous 8/20. Les livres donnent-ils un barème par exercice à reprendre ? | Règles ci-contre (`packages/grading/src/exam.ts`), réversibles. |
| D3 | 29/09/2026 | 17 | Contact pour les directeurs | Numéro et adresse de l'équipe AWFORM à imprimer dans `infra/relais/MODE_EMPLOI_DIRECTEUR.md`. | « [à compléter] ». |

## Décisions prises

| # | Date | Sujet | Décision du chef de projet | Suite |
|---|---|---|---|---|
| D4 | 29/09/2026 | Budget de poids web (≈ 205 Ko pour 150 Ko) | On **garde 150 Ko** et on allège la coquille : langues chargées à la demande, découpage par page. | Lot 24 (V1-h). |
| D5 | 29/09/2026 | Dictée photographiée (V1, option) | **Écartée pour l'instant.** | Rien à faire. |
