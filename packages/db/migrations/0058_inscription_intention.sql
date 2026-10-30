-- V2-2 : intention déclarée à l'inscription (« Qui va apprendre ? »). Retour arrière (manuel) : ALTER TABLE "account" DROP COLUMN "signup_intent";
ALTER TABLE "account" ADD COLUMN "signup_intent" text;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_signup_intent" CHECK ("account"."signup_intent" IS NULL OR "account"."signup_intent" IN ('moi', 'enfants', 'famille', 'eleves'));
