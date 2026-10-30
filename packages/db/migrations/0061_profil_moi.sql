-- V2-3 : profil « Moi » du parent (choix « Moi et mes enfants »). Un seul par compte ; toujours un profil d'adulte.
-- Retour arrière (manuel) : DROP INDEX "profile_one_owner"; ALTER TABLE "profile" DROP COLUMN "is_owner";
ALTER TABLE "profile" ADD COLUMN "is_owner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_owner_adulte" CHECK (NOT "profile"."is_owner" OR "profile"."kind" = 'adulte');--> statement-breakpoint
CREATE UNIQUE INDEX "profile_one_owner" ON "profile" USING btree ("owner_account_id") WHERE "profile"."is_owner";
