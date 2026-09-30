# Paiement mobile au Sénégal (Wave, Orange Money) — architecture et simulateur

Rédigé le 30/09/2026 (branche `suite-v1-b`, complément E, préparation V2). **Tout est SIMULÉ** : aucun compte
chez un opérateur ou un agrégateur, aucune clé, aucun argent. **Les prix sont une décision du client** (D19).

## 1. Parcours

1. La famille (adulte titulaire, code parent ou mot de passe — audits PAY-6, MIN-1) choisit une formule dans
   « Offres ». Au Sénégal (zone Afrique de l'Ouest), les **passes prépayés** (1, 3, 12 mois) ne se paient
   que par mobile money ; les formules renouvelables peuvent aussi l'être (choix du lot 10, voir D19).
2. L'API crée une **commande** (`billing_checkout` : montant en francs CFA, devise `XOF`, statut `ouverte`) et
   demande au prestataire une page de paiement (`PaymentProvider.createCheckout`).
3. L'utilisateur paie **chez l'opérateur** (en vrai : application Wave ou code USSD / validation Orange Money
   sur son téléphone). Awzid ne voit **jamais** son numéro de téléphone ni son solde.
4. L'opérateur envoie une **notification signée** (webhook) à `POST /api/v1/billing/webhook/mobile_money`.
5. L'API vérifie la signature et l'horodatage, **compare le montant et la devise** à ceux de la commande, puis
   passe la commande de `ouverte` à `payee` **atomiquement** (audit PAY-1) et crée le pass. Une notification
   déjà traitée est un doublon ; une seconde notification (autre transaction) pour la même commande est
   ignorée.

## 2. Sécurité des notifications

| Contrôle | Mise en œuvre | Test |
|---|---|---|
| Authenticité | HMAC-SHA256 de `<horodatage>.<corps brut>`, en-tête `x-mobile-signature: t=<s>,v1=<hex>`, comparaison à temps constant | `packages/billing/test/mobile.test.ts` |
| Rejeu | horodatage à ±5 minutes, sinon `signature_perimee` (400) | idem ; API : « notification rejouée tard » |
| Montant | montant et devise notifiés = commande, sinon `montant_incorrect` : rien n'est accordé, la commande reste ouverte | `apps/api/test/mobile-money.test.ts` |
| Idempotence | identifiant d'événement = `<opérateur>:<transaction>`, unique en base (`billing_event`) | même notification ×6 en parallèle → 1 pass |
| Course | transition conditionnelle `status = 'ouverte'` (PAY-1) | Wave ×4 + Orange Money ×4 + page simulée, en parallèle → 1 seul traitement |
| Devise | le prestataire refuse toute commande qui n'est pas en francs CFA entiers | `mobile.test.ts` |
| Corps brut | le webhook lit le corps **non analysé** pour vérifier la signature | `apps/api/src/billing.ts` |

## 3. Code

- `packages/billing/src/providers/mobile-simule.ts` — `SimulatedMobileMoneyProvider` (interface
  `PaymentProvider`), `signMobile`, `mobileSignatureHeader`, `verifyMobileSignature`, opérateurs `wave`,
  `orange_money`. Secret dérivé de `AWFORM_PAIEMENT_SIM_SECRET` (aucune nouvelle variable).
- `packages/billing/src/setup.ts` — en mode `AWFORM_PAIEMENT=simule`, le moyen `mobile_money` utilise ce
  simulateur ; les autres, le simulateur général.
- `packages/billing/src/plans.ts` — passes `pass_1_mois`, `pass_3_mois`, `pass_12_mois` (XOF, prix
  **provisoires**).
- `apps/api/src/billing.ts` — contrôle du montant, webhook `mobile_money` accepté en simulation, simulation par
  opérateur (`POST /billing/simulate/:id` avec `operateur`).
- Web : page de paiement simulé avec choix de l'opérateur (`routes/abonnement/paiement-simule/[id]`),
  e2e `apps/web/e2e/mobile-money.spec.ts`.

## 4. Passage au réel (plus tard, sur décision du client)

1. **Choisir** : API directe de chaque opérateur (Wave Business, Orange Money Web Payment) ou **agrégateur**
   (PayDunya, CinetPay, PayTech… — déjà prévu par `MobileMoneyProvider`, `MOBILE_MONEY_AGREGATEUR`) ; ouvrir le
   compte marchand (**client**), obtenir les clés (**client**, dans `prod.env`, périmètre de l'API seulement).
2. **Écrire l'adaptateur réel** derrière `PaymentProvider` : création de la session de paiement, lecture de
   **son** format de signature (à vérifier dans la documentation du prestataire : en-tête, algorithme,
   horodatage) et de ses statuts ; garder les contrôles du § 2 (montant, idempotence, PAY-1).
3. **Rapprochement** : tâche du travailleur qui interroge le prestataire pour les commandes restées
   `ouverte` (notification perdue), et expiration des commandes non payées (aujourd'hui : purgées après 30
   jours, D9).
4. **Remboursements** et litiges : procédure et outil d'administration à définir.
5. **Formalités** : conditions de vente (CGV), mentions légales du marchand, déclaration CDP du traitement
   (`docs/juridique/CDP_SENEGAL.md`), comptabilité.
6. Nouvelle **analyse d'impact** (paiement réel) et scan de sécurité du webhook.
