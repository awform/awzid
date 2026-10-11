-- Lot F3 (revue d'architecture M7, M8, M9, G4) : liens à usage unique envoyés par e-mail (vérification de
-- l'adresse, réinitialisation du mot de passe, changement d'adresse), adresse vérifiée, subdivision du pays
-- (Québec), fuseau horaire du compte, région d'hébergement des données (« eu ») du compte et de l'école.
-- En avant seulement ; les comptes existants gardent une adresse « non vérifiée » (aucune donnée modifiée).
-- Retour arrière (manuel) :
--   DROP TABLE "account_link";
--   ALTER TABLE "account" DROP CONSTRAINT "account_region", DROP CONSTRAINT "account_data_region",
--     DROP COLUMN "email_verified_at", DROP COLUMN "region", DROP COLUMN "tz", DROP COLUMN "data_region";
--   ALTER TABLE "school" DROP CONSTRAINT "school_data_region", DROP COLUMN "data_region";
CREATE TABLE "account_link" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"email" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_link_purpose" CHECK ("account_link"."purpose" IN ('verification_email', 'reinitialisation', 'changement_email'))
);
--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "region" text;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "tz" text;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "data_region" text DEFAULT 'eu' NOT NULL;--> statement-breakpoint
ALTER TABLE "school" ADD COLUMN "data_region" text DEFAULT 'eu' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_link" ADD CONSTRAINT "account_link_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_link_hash" ON "account_link" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "account_link_account" ON "account_link" USING btree ("account_id");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_region" CHECK ("account"."region" IS NULL OR "account"."region" ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$');--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_data_region" CHECK ("account"."data_region" ~ '^[a-z]{2,10}$');--> statement-breakpoint
ALTER TABLE "school" ADD CONSTRAINT "school_data_region" CHECK ("school"."data_region" ~ '^[a-z]{2,10}$');