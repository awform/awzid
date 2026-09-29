CREATE TABLE "notification_pref" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"devoirs" boolean DEFAULT false NOT NULL,
	"rapport" boolean DEFAULT false NOT NULL,
	"enfants" boolean DEFAULT false NOT NULL,
	"quiet_start" smallint DEFAULT 20 NOT NULL,
	"quiet_end" smallint DEFAULT 8 NOT NULL,
	"tz" text DEFAULT 'Africa/Dakar' NOT NULL,
	"locale" text DEFAULT 'fr' NOT NULL,
	"last_devoirs" text,
	"last_rapport" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_pref_hours" CHECK ("notification_pref"."quiet_start" BETWEEN 0 AND 23 AND "notification_pref"."quiet_end" BETWEEN 0 AND 23)
);
--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failures" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "push_subscription_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "recitation_upload" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"profile_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"part" text NOT NULL,
	"mime" text NOT NULL,
	"duration_s" smallint,
	"size" integer NOT NULL,
	"key_version" smallint NOT NULL,
	"iv" "bytea" NOT NULL,
	"ciphertext" "bytea" NOT NULL,
	"sent_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"listened_at" timestamp with time zone,
	"grade" jsonb,
	"graded_by" uuid,
	"graded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "class_group" ADD COLUMN "recitation_days" smallint DEFAULT 14 NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_pref" ADD CONSTRAINT "notification_pref_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recitation_upload" ADD CONSTRAINT "recitation_upload_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recitation_upload" ADD CONSTRAINT "recitation_upload_class_id_class_group_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recitation_upload" ADD CONSTRAINT "recitation_upload_sent_by_account_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recitation_upload" ADD CONSTRAINT "recitation_upload_graded_by_account_id_fk" FOREIGN KEY ("graded_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recitation_upload_class" ON "recitation_upload" USING btree ("class_id","created_at");--> statement-breakpoint
CREATE INDEX "recitation_upload_profile" ON "recitation_upload" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "recitation_upload_expires" ON "recitation_upload" USING btree ("expires_at");