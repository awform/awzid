-- Lot F2 (revue E1, E2) : REPRISE SANS PERTE — chaque enseignant reçoit une école « personnelle » (une par nom
-- d'établissement saisi dans ses classes ; les classes sans nom rejoignent la première école nommée de
-- l'enseignant, sinon « École personnelle »). Il en est direction et enseignant ; ses classes y sont rattachées,
-- il en est le titulaire (class_teacher). Licences d'école → école personnelle de l'enseignant qui les a achetées.
-- Rôles : parent, eleve_adulte, admin d'après le type de compte (account_kind ne décrit plus que le titulaire).
-- Retour arrière (manuel) : UPDATE class_group SET school_id = NULL (après ALTER … DROP NOT NULL) ; DELETE FROM
--   class_teacher; DELETE FROM school_member; UPDATE subscription SET school_id = NULL; DELETE FROM school;
--   DELETE FROM account_role WHERE role IN ('parent', 'eleve_adulte', 'admin');
CREATE TEMP TABLE "f2_cle" ON COMMIT DROP AS
SELECT c."id" AS class_id, c."teacher_account_id" AS teacher,
  COALESCE(
    NULLIF(btrim(c."school_name"), ''),
    (SELECT NULLIF(btrim(c2."school_name"), '') FROM "class_group" c2
      WHERE c2."teacher_account_id" = c."teacher_account_id" AND NULLIF(btrim(c2."school_name"), '') IS NOT NULL
      ORDER BY c2."created_at", c2."id" LIMIT 1),
    ''
  ) AS cle
FROM "class_group" c;
--> statement-breakpoint
CREATE TEMP TABLE "f2_ecole" ON COMMIT DROP AS
SELECT uuidv7() AS id, k.teacher, k.cle FROM (
  SELECT DISTINCT teacher, cle FROM "f2_cle"
  UNION
  SELECT a."id", '' FROM "account" a
  WHERE a."kind" = 'enseignant' AND NOT EXISTS (SELECT 1 FROM "f2_cle" WHERE teacher = a."id")
) k;
--> statement-breakpoint
INSERT INTO "school" ("id", "name", "name_ar", "country", "place", "place_ar", "personal", "created_by", "created_at")
SELECT e.id,
  CASE WHEN e.cle = '' THEN 'École personnelle' ELSE left(e.cle, 120) END,
  (SELECT c."school_name_ar" FROM "class_group" c JOIN "f2_cle" k ON k.class_id = c."id"
    WHERE k.teacher = e.teacher AND k.cle = e.cle AND c."school_name_ar" IS NOT NULL ORDER BY c."created_at" LIMIT 1),
  a."country",
  (SELECT c."place" FROM "class_group" c JOIN "f2_cle" k ON k.class_id = c."id"
    WHERE k.teacher = e.teacher AND k.cle = e.cle AND c."place" IS NOT NULL ORDER BY c."created_at" LIMIT 1),
  (SELECT c."place_ar" FROM "class_group" c JOIN "f2_cle" k ON k.class_id = c."id"
    WHERE k.teacher = e.teacher AND k.cle = e.cle AND c."place_ar" IS NOT NULL ORDER BY c."created_at" LIMIT 1),
  true, e.teacher, a."created_at"
FROM "f2_ecole" e JOIN "account" a ON a."id" = e.teacher;
--> statement-breakpoint
INSERT INTO "school_member" ("school_id", "account_id", "role", "since")
SELECT e.id, e.teacher, r.role, a."created_at"
FROM "f2_ecole" e JOIN "account" a ON a."id" = e.teacher
CROSS JOIN (VALUES ('direction'), ('enseignant')) AS r(role);
--> statement-breakpoint
UPDATE "class_group" c SET "school_id" = e.id
FROM "f2_cle" k JOIN "f2_ecole" e ON e.teacher = k.teacher AND e.cle = k.cle
WHERE k.class_id = c."id";
--> statement-breakpoint
INSERT INTO "class_teacher" ("class_id", "account_id", "role", "since")
SELECT c."id", c."teacher_account_id", 'titulaire', c."created_at" FROM "class_group" c
WHERE c."teacher_account_id" IS NOT NULL;
--> statement-breakpoint
-- licence d'école : rattachée à l'école (la première nommée, sinon la plus ancienne) de l'enseignant qui l'a achetée
UPDATE "subscription" s SET "school_id" = (
  SELECT sc."id" FROM "school" sc WHERE sc."created_by" = s."account_id" AND sc."personal"
  ORDER BY sc."name" = 'École personnelle', sc."created_at", sc."id" LIMIT 1)
WHERE s."plan_code" = 'licence_ecole' AND s."school_id" IS NULL;
--> statement-breakpoint
UPDATE "billing_checkout" b SET "school_id" = (
  SELECT sc."id" FROM "school" sc WHERE sc."created_by" = b."account_id" AND sc."personal"
  ORDER BY sc."name" = 'École personnelle', sc."created_at", sc."id" LIMIT 1)
WHERE b."plan_code" = 'licence_ecole' AND b."school_id" IS NULL;
--> statement-breakpoint
INSERT INTO "account_role" ("account_id", "role", "granted_at")
SELECT a."id", CASE a."kind" WHEN 'parent' THEN 'parent' WHEN 'adulte' THEN 'eleve_adulte' ELSE 'admin' END, a."created_at"
FROM "account" a WHERE a."kind" IN ('parent', 'adulte', 'admin')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "class_group" ALTER COLUMN "school_id" SET NOT NULL;
