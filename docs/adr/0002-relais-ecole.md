# ADR 0002 — Relais d'école hors Internet (lot 17)

Date : 29/09/2026 (rédigé le 30/09/2026 d'après le code). Statut : accepté.

## Contexte

L'école pilote (Sénégal) a un Internet intermittent, parfois coupé des jours entiers, et un courant instable.
L'application sait déjà travailler hors ligne sur chaque appareil (file IndexedDB), mais une classe entière doit
pouvoir charger les leçons et envoyer ses réponses sans Internet, sans perdre ni doubler un envoi.

## Décision

1. Un **relais** (mini-PC ou Raspberry Pi, `apps/relay`) posé dans l'école, entre les tablettes et le central :
   même API (`/api/v1/*`) servie en local, application servie par le même relais (`infra/relais/compose.yml`).
2. **Contenus publics** seulement mis en copie (liste fermée `CACHEABLE`) ; jamais de donnée personnelle en
   cache.
3. **Envois des élèves** (réponses, récitations) mis en **file SQLite** (WAL : résiste aux coupures de courant),
   **chiffrée AES-256-GCM** avec une clé propre au relais ; effacés dès que le central a répondu ; envoi
   identique fusionné (empreinte) ; idempotence au central (identifiants d'événements ; clé d'idempotence des
   récitations).
4. Le relais **n'a aucun droit propre** : chaque envoi garde le cookie de l'élève ; session expirée → envoi
   gardé (audit OFF-1). Le **jeton** du relais ne sert qu'au battement et au certificat HTTPS de l'école.
5. **HTTPS local** : sous-domaine par école ; certificat obtenu par le central et remis au relais.
6. Installation par un script idempotent (`infra/relais/install.sh`), mode d'emploi en français simple pour le
   directeur.

## Conséquences

- Une école sans Internet fonctionne toute la journée ; la file part seule au retour du réseau.
- Preuves : `apps/relay/test/relay.test.ts` ; **test de bout en bout** `infra/ci/test-relais.sh` (coupure du
  réseau, redémarrage du relais, retour : aucun envoi perdu ni doublé), dans la CI.
- Coûts : matériel par école (`docs/projet/RELAIS_MATERIEL.md`, D17), domaine des relais (D2).
- Limites : image ARM (Raspberry Pi) non construite par la CI ; disque du relais non chiffré (à ajouter).

## Options écartées

- Synchronisation pair-à-pair entre tablettes : complexe, non auditable.
- Serveur complet (base PostgreSQL) dans chaque école : maintenance et sauvegardes impossibles sur place.
