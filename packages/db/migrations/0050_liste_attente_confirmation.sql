-- Liste d'attente : double consentement (confirmation de l'adresse par e-mail). Ajouts seuls (deux colonnes facultatives
-- et un index) ; compatible avec la version précédente. Les demandes DÉJÀ présentes sont tenues pour confirmées.
-- Retour arrière (manuel) : DROP INDEX "waitlist_token"; ALTER TABLE "waitlist" DROP COLUMN "token_hash", DROP COLUMN "confirmed_at";
ALTER TABLE "waitlist" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "token_hash" text;--> statement-breakpoint
CREATE INDEX "waitlist_token" ON "waitlist" USING btree ("token_hash");
--> statement-breakpoint
UPDATE "waitlist" SET "confirmed_at" = "created_at" WHERE "confirmed_at" IS NULL;
