-- V2-3 : identifiant et mot de passe d'un profil d'enfant (sans e-mail ni nom de famille) ; session limitée à un profil.
-- Retour arrière (manuel) : ALTER TABLE "session" DROP COLUMN "profile_id"; DROP TABLE "profile_login";
CREATE TABLE "profile_login" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"password_hash" text NOT NULL,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_login_login_unique" UNIQUE("login"),
	CONSTRAINT "profile_login_forme" CHECK ("profile_login"."login" ~ '^[a-z0-9-]{3,24}$' AND "profile_login"."login" ~ '[a-z]' AND "profile_login"."login" !~ '^-|-$')
);
--> statement-breakpoint
ALTER TABLE "profile_login" ADD CONSTRAINT "profile_login_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_login" ADD CONSTRAINT "profile_login_created_by_account_id_account_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "profile_id" uuid;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;
