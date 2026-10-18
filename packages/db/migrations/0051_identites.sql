-- 18/10/2026 — identités : inscription par numéro WhatsApp (vérification « inversée », validation manuelle de la
-- bêta, codes de récupération), inscription assistée (invitation préparée par un administrateur) et « Continuer avec
-- Google » (OpenID Connect). Ajouts seuls (tables et colonnes facultatives) ; la seule contrainte relâchée est
-- « waitlist.email NOT NULL » (une demande peut porter un numéro au lieu d'une adresse). Compatible avec la version
-- précédente de l'API (elle ignore les nouvelles colonnes et tables). Droits : packages/db/src/roles.ts.
-- Retour arrière (manuel, après avoir remis l'API précédente ; efface les numéros et les liaisons Google) :
--   DELETE FROM "waitlist" WHERE "email" IS NULL;
--   ALTER TABLE "waitlist" DROP CONSTRAINT "waitlist_contact", DROP CONSTRAINT "waitlist_phone_hash_unique",
--     DROP COLUMN "phone_enc", DROP COLUMN "phone_hash", DROP COLUMN "phone_mask", ALTER COLUMN "email" SET NOT NULL;
--   ALTER TABLE "invitation" DROP CONSTRAINT "invitation_assisted_kind", DROP COLUMN "phone_hash",
--     DROP COLUMN "phone_mask", DROP COLUMN "phone_enc", DROP COLUMN "assisted_kind", DROP COLUMN "assisted_country";
--   DROP INDEX "account_phone"; ALTER TABLE "account" DROP CONSTRAINT "account_phone_pair",
--     DROP COLUMN "phone_enc", DROP COLUMN "phone_hash", DROP COLUMN "phone_verified_at", DROP COLUMN "last_login_at";
--   DROP TABLE "account_identity", "phone_challenge", "recovery_code";
--   puis retirer la dernière ligne de la table des migrations appliquées (drizzle.__drizzle_migrations).
-- Les comptes créés par numéro seul ou par Google seul (sans e-mail) deviennent alors inaccessibles : les compter avant
-- (SELECT count(*) FROM account WHERE email IS NULL AND kind IN ('parent', 'adulte') AND deleted_at IS NULL).
CREATE TABLE "account_identity" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"subject" text NOT NULL,
	"email" text,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "account_identity_provider" CHECK ("account_identity"."provider" IN ('google'))
);
--> statement-breakpoint
CREATE TABLE "phone_challenge" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"purpose" text NOT NULL,
	"channel" text NOT NULL,
	"phone_hash" text NOT NULL,
	"phone_enc" text NOT NULL,
	"account_id" uuid,
	"code_hash" text NOT NULL,
	"code_enc" text,
	"validated_by" uuid,
	"poll_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sends" integer DEFAULT 0 NOT NULL,
	"last_sent_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"validated_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "phone_challenge_purpose" CHECK ("phone_challenge"."purpose" IN ('inscription', 'reinitialisation', 'reverification', 'ajout_numero', 'liste_attente')),
	CONSTRAINT "phone_challenge_channel" CHECK ("phone_challenge"."channel" IN ('entrant', 'sortant'))
);
--> statement-breakpoint
CREATE TABLE "recovery_code" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "waitlist" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "phone_enc" text;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "phone_hash" text;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "phone_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "phone_hash" text;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "phone_mask" text;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "phone_enc" text;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "assisted_kind" text;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "assisted_country" text;--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "phone_enc" text;--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "phone_hash" text;--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "phone_mask" text;--> statement-breakpoint
ALTER TABLE "account_identity" ADD CONSTRAINT "account_identity_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_challenge" ADD CONSTRAINT "phone_challenge_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_challenge" ADD CONSTRAINT "phone_challenge_validated_by_account_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_code" ADD CONSTRAINT "recovery_code_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_identity_subject" ON "account_identity" USING btree ("provider","subject");--> statement-breakpoint
CREATE UNIQUE INDEX "account_identity_account" ON "account_identity" USING btree ("account_id","provider");--> statement-breakpoint
CREATE INDEX "phone_challenge_phone" ON "phone_challenge" USING btree ("phone_hash","created_at");--> statement-breakpoint
CREATE INDEX "phone_challenge_code" ON "phone_challenge" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "recovery_code_account" ON "recovery_code" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_phone" ON "account" USING btree ("phone_hash");--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_phone_hash_unique" UNIQUE("phone_hash");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_phone_pair" CHECK (("account"."phone_hash" IS NULL) = ("account"."phone_enc" IS NULL));--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_assisted_kind" CHECK ("invitation"."assisted_kind" IS NULL OR "invitation"."assisted_kind" IN ('parent', 'adulte'));--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_contact" CHECK ("waitlist"."email" IS NOT NULL OR "waitlist"."phone_hash" IS NOT NULL);