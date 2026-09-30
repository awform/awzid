# Décisions en attente du client

Points qui demandent une décision du client (argent, comptes, marque, prix, juridique, contenu religieux).
Pour chacun : la solution **provisoire et réversible** retenue dans le code, ou « sauté ». Tenu par les sessions
de développement ; le plus récent en haut.

| # | Date | Lot | Sujet | Question au client | Provisoire retenu |
|---|---|---|---|---|---|
| D11 | 30/09/2026 | 21 | Juridique — conservation des messages école ↔ famille | Faire valider par le juriste : messages et pièces jointes effacés à la fin de l'année scolaire suivante (au 1er août, 12 mois au moins après l'année du message) ; signalements gardés avec le message ; numéros d'aide par pays à confirmer. À reporter dans la politique de confidentialité. | Appliqué chaque nuit (`purgeRetention`, `packages/db/src/purge.ts`) ; numéros d'aide : fonction `helpline` (`packages/tutor/src/classify.ts`), déjà utilisée par le tuteur. |
| D10 | 29/09/2026 | audit INF-8 | Comptes / argent — stockage hors site des sauvegardes | Choisir un stockage hors du serveur (disque d'un autre site, stockage objet, serveur ssh) et une machine pour la restauration automatique mensuelle (elle seule détient la clé privée). | Copie prête (`AWFORM_BACKUP_HORS_SITE` dans `~/.config/awform/backup.env`) mais non branchée ; `status.sh` le rappelle ; restauration testée à la main depuis le PC, alerte au-delà de 35 jours. |
| D9 | 29/09/2026 | audit MIN-8 | Juridique — durées de conservation | Faire valider par le juriste : journal d'audit 12 mois ; questions et alertes du tuteur 12 mois une fois traitées (24 mois au plus) ; sessions 30 jours après expiration ; paiements abandonnés 30 jours (paiements réussis gardés pour la comptabilité) ; verrous anti-essais 24 h. À reporter dans la politique de confidentialité. | Appliqué chaque nuit par le travailleur (`purgeRetention`, `purgeAuthThrottle`, `packages/db/src/purge.ts`) ; chiffres modifiables à un seul endroit. |
| D1 | 29/09/2026 | 17 | Juridique — lois et autorités par pays | Faire valider par le juriste le tableau `countryRules` (`apps/api/src/auth/policy.ts`) : âges, lois, autorités ; formalités auprès de la CDP (Sénégal) à accomplir. | Tableau appliqué, marqué `aValider` ; pays inconnus : mention générique, aucune autorité inventée. |
| D2 | 29/09/2026 | 17 | Comptes — domaine des relais | Nom de domaine des relais (ex. `relais.awzid.org`) et enregistrement DNS `*.relais…` → serveur central. | Rien de créé ; `RELAIS_DOMAINE` absent = aucun certificat demandé. |
| D8 | 29/09/2026 | 20 | Juridique / marque — vérification publique des certificats | La page `/verifier/<numéro>?c=<code>` montre à qui détient le QR : nom affiché (prénom + initiale), niveau, mention, date. À valider par le juriste et à mentionner dans la politique de confidentialité ; nom de domaine définitif pour l'adresse imprimée ; conservation de l'ancienne clé de signature en cas de rotation. | Page active, registre seulement, sans le bon code : rien ; clé générée par `deploy.sh` (`AWFORM_CERT_SIGN_KEY`). |
| D3 | 29/09/2026 | 17 | Contact pour les directeurs | Numéro et adresse de l'équipe AWFORM à imprimer dans `infra/relais/MODE_EMPLOI_DIRECTEUR.md`. | « [à compléter] ». |

## Décisions prises

| # | Date | Sujet | Décision du chef de projet | Suite |
|---|---|---|---|---|
| D4 | 29/09/2026 | Budget de poids web (≈ 205 Ko pour 150 Ko) | On **garde 150 Ko** et on allège la coquille : langues chargées à la demande, découpage par page. | Fait (audit PERF-1) : anglais chargé à la demande, police du Coran préchargée seulement avec des versets ; mesure du JavaScript **initial** de chaque page d'entrée (CDC § 4.3) : pire page `/lecons/[id]` 102,9 Ko ≤ 150 ; total de toutes les pages 231,7 Ko, borné à 300 Ko (seuil provisoire, à confirmer). Mesure sur un vrai téléphone d'entrée de gamme : à faire (lot 24). |
| D5 | 29/09/2026 | Dictée photographiée (V1, option) | **Écartée pour l'instant.** | Rien à faire. |
| D6 | 29/09/2026 | Barème des épreuves | Utiliser en priorité le barème `guide.bareme` du livre quand il existe, les règles provisoires sinon. | Fait (lot 21) : grille lue de façon tolérante (`bookGrid`), une note par partie ; format réel à vérifier sur les vrais livres (VM). |
| D7 | 29/09/2026 | Corrigés des bilans en entraînement | Masquer les corrigés des bilans et examens dans la projection élève ; entraînement sur bilan corrigé par le serveur. | Fait (lot 21) : `studentProjection`, route `POST /units/:id/corriger`, examen en épreuve notée seulement ; tests `d7.test.ts`, `lot19.test.ts`. |
| CI | 29/09/2026 | CI sur les branches de travail | Activer la CI sur les branches `lot*-wip` (déclencheur push). | Fait (lot 21), et sur `corrections-audit`. |
