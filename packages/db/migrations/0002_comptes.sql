ALTER TYPE "public"."account_kind" ADD VALUE 'enseignant';--> statement-breakpoint
CREATE TABLE "auth_throttle" (
	"key" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "totp_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "totp_last_counter" integer;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "birth_year" smallint;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "parent_pin_hash" text;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "password_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consent" ADD COLUMN "profile_id" uuid;--> statement-breakpoint
ALTER TABLE "consent" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "consent" ADD COLUMN "evidence" jsonb;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "mfa_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "consent" ADD CONSTRAINT "consent_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;