# Signalement à Quran Foundation — erreur de type de caractère, verset 2:181 (mushaf 2 « QCF V1 »)

Message prêt à envoyer par le client (formulaire de contact / support développeur de Quran Foundation). Contexte :
chantier A34, correction locale `qf-2-181-fin` dans `infra/outils/qf-lignes/corrections.json` (à retirer quand
Quran Foundation aura corrigé : l'outil la signalera alors « obsolète »).

---

**Subject:** Data issue in mushaf 2 (QCF V1): verse 2:181 end marker typed as "word"

Hello Quran Foundation team,

While validating the Content Sync snapshot of `mushafs:2` ("QCF V1", 604 pages × 15 lines) against the official
King Fahd Complex page fonts, we found one mislabelled word record:

- Resource: `mushafs:2` (QCF V1), snapshot `schema_version` 1, pre-live environment, synced on 2026-10-06
- Verse: 2:181 (`verse_id` 188), page 27, line 15
- Record: `mushaf_word` id **444875** (`word_id` 83903), `position_in_verse` 14, `position_in_page` 130,
  `text` = U+FBFE
- Current values: `char_type_id` 1, `char_type_name` "word"
- Expected values: `char_type_id` 3, `char_type_name` "end"

Evidence: in the King Fahd Complex font `QCF_P027`, U+FBEF–U+FBFD are the 13 words of 2:181 in reading order and
U+FBFE is the verse-end ornament numbered ١٨١. Verse 2:181 has 13 words (Tanzil text), and every other verse in
the snapshot has exactly one "end" record; 2:181 currently has 14 "word" records and no "end" record. For
comparison, the end marker of 2:180 (record 444860, U+FBEE) is correctly typed `char_type_id` 3 / "end".

Could you please correct the type of record 444875? Thank you for the Content Sync service and the data.

Best regards,
The Awzid team
