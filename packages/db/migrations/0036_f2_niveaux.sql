-- Lot F2 (revue E8) : matières, niveau PAR MATIÈRE historisé, années scolaires, inscriptions datées.
-- Reprise : profile.level_code → une ligne courante de profile_level (origine « reprise ») ; matière d'une classe
-- d'après son niveau ; année scolaire d'après le texte libre de la classe (« 2026-2027 », « 2026/27 »…), sinon
-- l'année en cours (1er septembre → 31 juillet) ; chaque élève de chaque liste de classe → une inscription
-- « en cours » datée de son ajout. Aucune donnée existante modifiée ni effacée (le texte school_year reste).
-- Retour arrière (manuel) : DELETE FROM enrolment; UPDATE class_group SET school_year_id = NULL, subject_code =
--   NULL; DELETE FROM school_year; DELETE FROM profile_level; UPDATE level SET subject_code = NULL;
--   DELETE FROM subject;
INSERT INTO "subject" ("code", "title_fr", "rank", "has_levels") VALUES
  ('arabe', 'Arabe', 1, true),
  ('sciences', 'Sciences islamiques', 2, true),
  ('coran', 'Coran', 3, true),
  ('ecriture', 'Écriture', 4, false)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "level" SET "subject_code" = CASE
  WHEN "code" ~ '^(ado|ad|en)[0-9]+$' THEN 'arabe'
  WHEN "code" ~ '^r[ea][0-9]+$' THEN 'sciences'
  WHEN "code" ~ '^qc[0-9]+$' THEN 'coran'
END WHERE "subject_code" IS NULL;
--> statement-breakpoint
INSERT INTO "profile_level" ("profile_id", "subject_code", "level_code", "since", "source")
SELECT p."id", l."subject_code", p."level_code", p."created_at", 'reprise'
FROM "profile" p JOIN "level" l ON l."code" = p."level_code"
WHERE l."subject_code" IS NOT NULL;
--> statement-breakpoint
UPDATE "class_group" c SET "subject_code" = l."subject_code"
FROM "level" l WHERE l."code" = c."level_code" AND c."subject_code" IS NULL;
--> statement-breakpoint
CREATE TEMP TABLE "f2_annee" ON COMMIT DROP AS
SELECT c."id" AS class_id, c."school_id",
  COALESCE(
    substring(c."school_year" from '^\s*(\d{4})')::int,
    CASE WHEN extract(month from now()) >= 8 THEN extract(year from now())::int
      ELSE extract(year from now())::int - 1 END
  ) AS y
FROM "class_group" c;
--> statement-breakpoint
INSERT INTO "school_year" ("school_id", "label", "starts_on", "ends_on", "status")
SELECT DISTINCT a."school_id", a.y || '-' || (a.y + 1), make_date(a.y, 9, 1), make_date(a.y + 1, 7, 31), 'en_cours'
FROM "f2_annee" a
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "class_group" c SET "school_year_id" = sy."id"
FROM "f2_annee" a JOIN "school_year" sy ON sy."school_id" = a."school_id" AND sy."label" = a.y || '-' || (a.y + 1)
WHERE c."id" = a.class_id;
--> statement-breakpoint
INSERT INTO "enrolment" ("class_id", "pupil_id", "school_year_id", "from_day", "outcome")
SELECT p."class_id", p."id", c."school_year_id", p."created_at"::date, 'en_cours'
FROM "class_pupil" p JOIN "class_group" c ON c."id" = p."class_id";
