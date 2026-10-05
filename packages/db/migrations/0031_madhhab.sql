-- Lot F1 (revue d'architecture G2) : étiquette d'école juridique (madhhab), SANS modifier aucun texte.
-- Existant : sciences islamiques (re, ra) et règles de fiqh du registre → « maliki » ; arabe, Coran, lectures,
-- versets et hadiths du registre → « commun ». Blocs de fiqh des leçons : calculés par `backfillContent`.
-- Retour arrière (manuel) : ALTER TABLE level DROP COLUMN madhhab; ALTER TABLE registry_entry DROP COLUMN
--   madhhab; ALTER TABLE unit_version DROP COLUMN madhhab_blocks;
ALTER TABLE "level" ADD COLUMN "madhhab" text;--> statement-breakpoint
ALTER TABLE "registry_entry" ADD COLUMN "madhhab" text;--> statement-breakpoint
ALTER TABLE "unit_version" ADD COLUMN "madhhab_blocks" jsonb;--> statement-breakpoint
ALTER TABLE "level" ADD CONSTRAINT "level_madhhab" CHECK ("level"."madhhab" IS NULL OR "level"."madhhab" IN ('maliki', 'hanafi', 'shafii', 'hanbali', 'commun'));--> statement-breakpoint
ALTER TABLE "registry_entry" ADD CONSTRAINT "registry_madhhab" CHECK ("registry_entry"."madhhab" IS NULL OR "registry_entry"."madhhab" IN ('maliki', 'hanafi', 'shafii', 'hanbali', 'commun'));--> statement-breakpoint
UPDATE "level" SET "madhhab" = CASE WHEN "code" ~ '^r[ae][0-9]' THEN 'maliki' ELSE 'commun' END;--> statement-breakpoint
UPDATE "registry_entry" SET "madhhab" = CASE
  WHEN "data"->>'madhhab' IN ('maliki', 'hanafi', 'shafii', 'hanbali', 'commun') THEN "data"->>'madhhab'
  WHEN "kind" <> 'fiqh' THEN 'commun'
  WHEN "id" LIKE 'FIQH\_HAN\_%' THEN 'hanafi'
  WHEN "id" LIKE 'FIQH\_SHA\_%' THEN 'shafii'
  WHEN "id" LIKE 'FIQH\_HNB\_%' THEN 'hanbali'
  ELSE 'maliki' END;
