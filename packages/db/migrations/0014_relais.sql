CREATE TABLE "relay" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"host" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"last_report" jsonb,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "relay_host_unique" UNIQUE("host"),
	CONSTRAINT "relay_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "recitation_upload" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "recitation_upload_idem" ON "recitation_upload" USING btree ("profile_id","idempotency_key");