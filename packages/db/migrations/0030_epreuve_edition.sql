-- Lot F1 (revue d'architecture M2) : une épreuve est FIGÉE sur l'édition ouverte à sa création.
-- Sessions existantes : rattachées à l'édition publiée (à défaut, la plus récente), celle qu'elles lisaient.
-- Retour arrière (manuel) : ALTER TABLE exam_session DROP COLUMN edition_id;
ALTER TABLE "exam_session" ADD COLUMN "edition_id" uuid;--> statement-breakpoint
UPDATE "exam_session" SET "edition_id" = COALESCE(
  (SELECT "id" FROM "edition" WHERE "status" = 'publiee' ORDER BY "published_at" DESC NULLS LAST LIMIT 1),
  (SELECT "id" FROM "edition" ORDER BY "created_at" DESC LIMIT 1)
) WHERE "edition_id" IS NULL;--> statement-breakpoint
ALTER TABLE "exam_session" ALTER COLUMN "edition_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "exam_session" ADD CONSTRAINT "exam_session_edition_id_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."edition"("id") ON DELETE no action ON UPDATE no action;
