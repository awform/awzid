ALTER TABLE "certificate" ADD COLUMN "holder_name" text;--> statement-breakpoint
ALTER TABLE "certificate" ADD COLUMN "mention" text;--> statement-breakpoint
ALTER TABLE "certificate" ADD COLUMN "detached_at" timestamp with time zone;--> statement-breakpoint
-- registre : nom affiché des certificats déjà délivrés (élèves encore dans la classe)
UPDATE "certificate" c SET "holder_name" = p."display_name" FROM "class_pupil" p WHERE p."id" = c."pupil_id" AND c."holder_name" IS NULL;
