# Corrections de l'audit général du 29/09/2026

Audit : branche `audit-dossier`, `docs/projet/AUDIT_GENERAL_2026-09-29.md` (9/20, 73 constats détaillés).
Corrections sur la branche `corrections-audit` (partie de `lot21-wip`), dans l'ordre fixé par le chef de projet ;
**un commit par constat** (identifiant dans le message) et **un test qui échouait avant et passe après**.

États : **corrigé** · **en cours** · **reporté** (avec la raison) · **déjà corrigé** (par un lot antérieur à cette branche).

| Constat | Gravité | Sujet | État | Commit | Test |
|---|---|---|---|---|---|
| SEC-1 | majeur | Second facteur : `totp/setup` désactive le 2FA avant confirmation ; `totp/confirm` sans limite ni anti-rejeu | corrigé | 51a32f8 | audit-2fa.test.ts « SEC-1 A/B » |
| SEC-2 | majeur | Course sur le compteur d'échecs : 20 mots de passe, 30 codes parent testés d'un coup | corrigé | 4d6f007 | audit-2fa.test.ts « SEC-2 » |
| SEC-3 | majeur | Consentements « parentaux » accordés sans le code parent (tuteur IA, partage enseignant) | corrigé | df1dbe7 | audit-mineurs.test.ts « SEC-3 » |
| SEC-4 | majeur | Second facteur non exigé sur les notifications et les paiements des enseignants | corrigé | 6c5a72f | audit-2fa.test.ts « SEC-4 » |
| SEC-5 | mineur | Rejeu d'un code TOTP par connexions parallèles | corrigé | 4b9dae9 | audit-2fa.test.ts « SEC-5 » |
| SEC-6 | mineur | Ressaisies du mot de passe sans limite d'essais | à faire | | |
| SEC-7 | mineur | HTTP clair servi en production ; cookie sans `Secure` sur HTTP | à faire | | |
| SEC-8 | mineur | Entrées de la file hors ligne sans schéma (1 Mo de JSON libre par événement) | à faire | | |
| MIN-1 | majeur | Un mineur ayant l'âge du « consentement numérique » obtient un profil **adulte**, sans aucune protection | corrigé | c33fbcd | audit-mineurs.test.ts « MIN-1 » |
| MIN-2 | majeur | Deux calculs d'âge : un profil « enfant » reçoit le tuteur « ado » (texte libre, la nuit) | corrigé | 47b9224 | audit-mineurs.test.ts « MIN-2 » |
| MIN-3 | majeur | Compte « parent » sans contrôle d'âge : un enfant consent pour lui-même (Sénégal compris) | corrigé | 12480c2 | audit-mineurs.test.ts « MIN-3 » |
| MIN-4 | majeur | Accord `tuteur_ia` : ni code parent, ni preuve, ni pays ; impossible à retirer depuis « mes consentements » | corrigé | 85f2baf | audit-mineurs.test.ts « MIN-4 » |
| MIN-5 | majeur | Compte supprimé : l'enseignant garde l'accès à l'enfant pendant 30 jours (liste, audio, CSV) | corrigé | e6b6483 | audit-rgpd.test.ts |
| MIN-6 | majeur | Export RGPD incomplet (art. 15 et 20) | corrigé | 25da93d | audit-rgpd.test.ts |
| MIN-7 | majeur | Après l'effacement définitif, il reste des données personnelles (e-mail en clair, âge, pays) | corrigé | 3e1e41c | audit-rgpd.test.ts, roles.test.ts |
| MIN-8 | majeur | Durées de conservation non appliquées (questions libres des enfants gardées sans limite) | corrigé | 6a01db4 | audit-rgpd.test.ts, roles.test.ts |
| MIN-9 | mineur | Consentement `rappels` décoratif : son retrait n'arrête pas les notifications | à faire | | |
| MIN-10 | mineur | Code parent contournable pour l'envoi de récitations | à faire | | |
| MIN-11 | mineur | Une récitation réapparaît chez l'enseignant après retrait puis nouvelle inscription | à faire | | |
| MIN-12 | mineur | Administrateur : textes libres des enfants de toutes les classes, comptes supprimés, masquage faible | à faire | | |
| MIN-13 | mineur | Journaux Fastify : URL complète (identifiants, paramètres) et adresse IP | à faire | | |
| MIN-14 | mineur | Réinscription impossible 30 jours et révélation de l'existence du compte | à faire | | |
| MIN-15 | mineur | Pays déclaratif, codes inexistants acceptés | à faire | | |
| MIN-16 | mineur | Enregistrements vocaux locaux : la limite de 7 jours n'est appliquée qu'à l'ouverture de l'écran | corrigé | a319a48 | apps/web/src/lib/recordings.test.ts |
| MIN-17 | mineur | Branche `lot17-wip` : consentement par pays cohérent mais non appliqué aux profils | corrigé | b42308f | audit-mineurs.test.ts « MIN-17 » |
| CON-1 | bloquant | Les corrigés des examens et bilans sont envoyés à l'élève (API et paquet hors ligne) et comptent pour le certificat | corrigé | 1b24221 (D7) + 68ac8d0 | audit-con1.test.ts (échoue sans la correction) |
| CON-2 | majeur | Projection élève en **liste noire** : translittération, corrigés et notes d'enseignant passent | corrigé | 9654f04 | packages/content/test/con2.test.ts |
| CON-3 | majeur | Masquage des numéros de hadith non vérifiés : contournable, et absent sans registre | corrigé (sans registre : tous les numéros retirés, au lieu d'un refus d'import) | 03d23fd | con3.test.ts, audit-con.test.ts |
| CON-4 | majeur | Filtre du tuteur : Coran hors référence non détecté (formes de présentation, séparateurs invisibles) | à faire | | |
| CON-5 | majeur | Filtre du tuteur : avis religieux, numéros de hadith et phonétique latine non détectés | à faire | | |
| CON-6 | majeur | Bouton « explique » : le texte libre contourne le classifieur (pas d'alerte de détresse) et part au modèle | à faire | | |
| CON-7 | majeur | Plafond de coût mensuel du tuteur dépassé par des appels parallèles | à faire | | |
| CON-8 | majeur | La batterie adverse est circulaire (et vide avec le fournisseur simulé) | à faire | | |
| CON-9 | mineur | Mise en service de Claude avec un rapport de batterie écrit à la main | à faire | | |
| CON-10 | mineur | Balise de fin du message élève reconstructible (injection) | à faire | | |
| CON-11 | mineur | Texte libre d'un enfant de moins de 13 ans stocké sans être lu ni classé | à faire | | |
| CON-12 | mineur | Classifieur local : contournements simples et faux positifs | à faire | | |
| OFF-1 | bloquant | Relais d'école (lot 17) : des réponses confirmées « acceptées » à la tablette sont effacées si la session de l'élève a expiré | corrigé | 44fa0b6 (commun avec OFF-6) | relay.test.ts « audit OFF-1 » |
| OFF-2 | majeur | Un seul événement hors bornes : 500 sur tout le lot et file de l'appareil bloquée à vie | corrigé | fd53ac2 | audit-off.test.ts, apps/web/src/lib/offline.test.ts |
| OFF-3 | majeur | Appareil partagé : à la déconnexion, la file et les voix de A restent ; la connexion de B détruit la file de A | corrigé | e143f63, e9714b0 | apps/web/src/lib/session.test.ts |
| OFF-4 | mineur | File de l'appareil : 4xx renvoyés à l'infini, portail captif et quota plein non gérés | à faire | | |
| OFF-5 | mineur | Réponse antidatée par `deviceAt` : la leçon passe « maîtrisée » ; dates impossibles acceptées | corrigé | fc727cd | audit-off.test.ts |
| OFF-6 | majeur | Relais (lot 17) : saturation du disque par n'importe quel appareil du Wi-Fi ; exception non rattrapée | corrigé | 44fa0b6 (commun avec OFF-1) | relay.test.ts « audit OFF-6 » |
| OFF-7 | mineur | Collision volontaire d'identifiant : un autre compte fait disparaître un événement | à faire | | |
| MET-1 | bloquant | Un bilan ou un examen fait dans l'application compte toujours 100 % : certificat « Très bien » assuré | corrigé | e723584 | audit-met1.test.ts |
| MET-2 | mineur | Certificat délivrable avec un contrôle continu partiel ; examen à 49,995 % arrondi à 50 | corrigé | e45008a | school.test.ts « audit MET-2 » ; lot13.test.ts (livres réels) mis à jour |
| MET-3 | mineur | Hifẓ : un jour invalide arrête le rejeu du journal ; mois d'essai surestimé ; barème avec `Infinity` | à faire | | |
| MET-4 | mineur | Jalons : un mot tracé est compté comme la lettre « mot » ; migration Leitner fragile | à faire | | |
| PAY-1 | majeur | Course sur la validation d'un paiement : un paiement, plusieurs abonnements | corrigé | voir « PAY-1 » dans git log | audit-pay.test.ts |
| PAY-2 | majeur | Un abonnement impayé (ou un essai terminé) redevient actif si l'on clique « annuler » | corrigé | voir « PAY-2 » dans git log | audit-pay.test.ts |
| PAY-3 | majeur | Stripe : un paiement non encaissé (SEPA, asynchrone) ouvre l'abonnement ; la 1re facture offre un 2e mois | à faire | | |
| PAY-4 | majeur | Les droits d'accès ne sont appliqués nulle part, même avec `AWFORM_DROITS=on` | à faire | | |
| PAY-5 | mineur | Essai « découverte » : course et unicité par compte seulement | à faire | | |
| PAY-6 | mineur | Barrière parentale à l'achat facultative | à faire | | |
| PAY-7 | mineur | Rotation du secret Stripe : plusieurs `v1=` mal gérés | à faire | | |
| QUA-1 | majeur | Le garde-fou CI « aucune normalisation Unicode » ne peut jamais échouer | corrigé | b9cd9dc | audit-qua1.test.ts |
| QUA-2 | majeur | Tests qui ne prouvent pas ce qu'ils annoncent | corrigé en partie : batterie au nombre exact (1 081, par famille), travailleur testé (planification, purge de nuit), test de concurrence de l'API ; CON-1 prouvé par l'API (audit-con1) ; school.test corrigé (lot 21). Reportés : couverture mesurée (dépendance à ajouter), a11y « moderate » (e2e à relancer avec les livres), tableau SIM_TABLE (documentation, pas un test) | 9d71681 | battery.test.ts, apps/worker/test/tasks.test.ts, audit-qua2.test.ts |
| QUA-3 | mineur | Fonctions très longues | à faire | | |
| INF-1 | bloquant | La CI est rouge sur `main` depuis le lot 9 (24 exécutions sur 24) | déjà corrigé | 8e8784f | CI locale : school.test.ts, pnpm -r --no-bail |
| INF-2 | majeur | En CI, les tests d'API sur base sont presque tous sautés (57 sur 87), même une fois INF-1 corrigé | déjà corrigé | 8e8784f | synthetique.test.ts ; 100 tests d'API sans les livres |
| INF-3 | mineur | Actions GitHub non épinglées par empreinte | à faire | | |
| INF-4 | mineur | Dépendances : 2 vulnérabilités connues (outillage) | à faire | | |
| INF-5 | mineur | Gradle téléchargé sans empreinte | à faire | | |
| INF-6 | majeur | `X-Forwarded-For` falsifiable : limites par adresse IP (inscription, connexion) contournées | corrigé | e91c3fa | audit-inf6.test.ts |
| INF-7 | majeur | `backup.sh` : un `pg_dump` en échec laisse une « sauvegarde » partielle, non journalisée, prise pour bonne | corrigé | d155d45 | audit-infra.test.ts |
| INF-8 | majeur | Ni copie hors site, ni test de restauration automatique | corrigé en partie : copie hors site prête et journalisée, état des sauvegardes et alerte à 35 jours, seuils de restauration ; stockage et restauration automatique = décision D10 | d155d45 | audit-infra.test.ts |
| INF-9 | majeur | Un déploiement `--demo` laisse le paiement SIMULÉ et le tuteur simulé actifs pour toujours | corrigé | a1640a5 | audit-infra.test.ts |
| INF-10 | mineur | Migrations sans retour arrière, appliquées avant la bascule | à faire | | |
| INF-11 | mineur | Images Docker non épinglées par empreinte ; scripts : avertissements shellcheck | à faire | | |
| PERF-1 | majeur | Budget JavaScript dépassé : 204,3 Ko Brotli (budget 150 Ko), et non « ≈ 59 Ko » | corrigé | 1dff35a | budget CI (pnpm --filter @awform/web budget), i18n.test.ts |
| A11Y-1 | mineur | Cibles tactiles sous la règle de 48 px du projet | à faire | | |
| CDC-1 | majeur | Affirmations du brief et du journal démenties par le code ou par GitHub | à faire | | |
| CDC-2 | mineur | Fonctionnalités et exigences de test du CDC absentes ou partielles (lots 0-16) | à faire | | |
