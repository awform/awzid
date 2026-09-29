ALTER TABLE "certificate" ADD COLUMN "verif_code" text;--> statement-breakpoint
ALTER TABLE "certificate" ADD COLUMN "signature" text;--> statement-breakpoint
ALTER TABLE "certificate" ADD COLUMN "key_id" text;--> statement-breakpoint
ALTER TABLE "certificate" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "certificate" ADD COLUMN "revoke_reason" text;--> statement-breakpoint
CREATE UNIQUE INDEX "certificate_verif" ON "certificate" USING btree ("verif_code");