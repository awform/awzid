# ADR 0004 — Messagerie encadrée et chiffrée (lot 21)

Date : 30/09/2026. Statut : accepté.

## Contexte

Enseignants et familles doivent échanger (annonces, message privé, visio), en protégeant les mineurs (CDC
§2.11-2.12) : aucun échange entre élèves, aucun contact d'un adolescent sans son parent, signalement possible,
conservation limitée.

## Décision

1. Deux formes seulement : **annonce** de l'enseignant à la classe (sans réponse collective) et **fil privé**
   enseignant ↔ famille d'un élève ; aucun fil entre familles ni entre élèves ; titulaire mineur refusé
   (parent requis).
2. Textes et pièces jointes (enseignant seulement, types limités) **chiffrés AES-256-GCM** en base
   (`AWFORM_MESSAGE_KEY`, « v1:<hex> », version enregistrée avec chaque message).
3. **Signalement** avec numéro d'aide ; **modération** par l'administrateur (second facteur), chaque ouverture
   journalisée ; retrait = texte et pièce effacés, trace gardée.
4. **Visio** : lien externe https planifié par l’enseignant (services connus reconnus, sinon « autre »), donné 15 minutes avant ;
   Awzid n'héberge aucune vidéo.
5. **Conservation** : 12 mois après la fin de l'année scolaire (D11), purge nocturne.

## Conséquences

- Une fuite de la base seule ne révèle pas les messages ; preuves : `apps/api/test/lot21.test.ts`,
  `apps/web/e2e/suite-v1.spec.ts`.
- **Une seule clé active** : la changer rend illisibles les messages existants. À développer avant toute
  rotation : un **trousseau** (plusieurs versions déchiffrables, chiffrement avec la plus récente,
  rechiffrement progressif) — même besoin pour les récitations (lot 16).
- Pas de notification des messages (choix de prudence) ; pas de chiffrement de bout en bout (l'école et la
  modération doivent pouvoir lire un message signalé).
