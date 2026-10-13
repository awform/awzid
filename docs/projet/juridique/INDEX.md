# Volet juridique et support de la bêta fermée — index

> **Provisoire — avant signature d'un juriste ; en attente d'une seconde lecture juridique.** Rédigé le
> 13/10/2026 par Claude (juriste provisoire, décision du client du 13/10 : « oui, prépare la bêta »). Ces documents
> remplacent, pour la bêta, ceux de `docs/juridique/` (30/09 et 06/10/2026), qui restent comme historique.

## Contenu

| Document | Objet |
|---|---|
| `REGISTRE_TRAITEMENTS.md` | registre des traitements (RGPD art. 30) mis à jour pour la bêta fermée, sous-traitants |
| `AIPD_MINEURS_DONNEES_RELIGIEUSES.md` | analyse d'impact : enfants, données révélant une conviction religieuse, voix et IA |
| `DUREES_CONSERVATION.md` | durées de conservation, rattachées à leur code |
| `PROCEDURE_VIOLATION_DONNEES.md` | que faire en cas de violation de données (72 h, 24 h Quran Foundation) |
| `GUIDE_CDP_SENEGAL_CLIENT.md` | démarches du client auprès de la CDP, pas à pas (jamais faites à sa place) |
| `LICENCES_PRODUCTION.md` | Quran Foundation, polices, audio, Tanzil, traductions : obligations, écarts, liens |
| `SUPPORT_ET_ERRATA.md` | contact, FAQ, « Signaler un problème », parcours « erreur religieuse », errata, journal traité par Claude |

Textes publiés dans l'application (source française, puis anglaise) : `apps/web/static/i18n/legal/fr.json` et
`en.json` — mentions légales, CGU, confidentialité, cookies, conditions de la bêta, conditions pour les invités,
page d'information de la bêta. Espagnol, allemand, arabe : **non faits** (voir `SUPPORT_ET_ERRATA.md` § 7).

## Ce que seul le client peut fournir (champs entre crochets dans les textes)

1. Éditeur : raison sociale, forme juridique, capital, siège, immatriculation (RCS/SIREN ou NINEA), directeur de la publication.
2. **Adresse de contact** (et adresse « données personnelles » ; une seule suffit pour la bêta) — à créer.
3. Hébergeur : identité exacte de la société contractante Google pour le compte Google Cloud, lien vers sa politique.
4. Prestataire d'e-mail (SMTP) et lien vers sa politique.
5. Droit applicable et juridiction ; droit de rétractation (après la bêta).
6. Déclaration à la CDP du Sénégal (`GUIDE_CDP_SENEGAL_CLIENT.md`) **avant** l'ouverture à des utilisateurs sénégalais.
7. Désignation d'un DPO (facultative à ce stade, voir l'AIPD).
8. Compte développeur Quran Foundation actif, et réponse écrite de QF sur les profils d'enfants (`LICENCES_PRODUCTION.md` § 3).
9. Seconde lecture juridique de l'ensemble.
