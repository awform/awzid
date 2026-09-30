CREATE TABLE "activation_batch" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"level_code" text NOT NULL,
	"label" text NOT NULL,
	"months" smallint NOT NULL,
	"quantity" integer NOT NULL,
	"redeem_by" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activation_batch_months" CHECK ("activation_batch"."months" BETWEEN 1 AND 24),
	CONSTRAINT "activation_batch_quantity" CHECK ("activation_batch"."quantity" BETWEEN 1 AND 5000)
);
--> statement-breakpoint
CREATE TABLE "activation_code" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"batch_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"last4" text NOT NULL,
	"redeemed_by" uuid,
	"redeemed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "level_pass" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" uuid NOT NULL,
	"level_code" text NOT NULL,
	"code_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activation_batch" ADD CONSTRAINT "activation_batch_level_code_level_code_fk" FOREIGN KEY ("level_code") REFERENCES "public"."level"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activation_batch" ADD CONSTRAINT "activation_batch_created_by_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activation_code" ADD CONSTRAINT "activation_code_batch_id_activation_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."activation_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activation_code" ADD CONSTRAINT "activation_code_redeemed_by_account_id_fk" FOREIGN KEY ("redeemed_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_pass" ADD CONSTRAINT "level_pass_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_pass" ADD CONSTRAINT "level_pass_level_code_level_code_fk" FOREIGN KEY ("level_code") REFERENCES "public"."level"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_pass" ADD CONSTRAINT "level_pass_code_id_activation_code_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."activation_code"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activation_code_hash" ON "activation_code" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "activation_code_batch" ON "activation_code" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "level_pass_code" ON "level_pass" USING btree ("code_id");--> statement-breakpoint
CREATE INDEX "level_pass_account" ON "level_pass" USING btree ("account_id","level_code");