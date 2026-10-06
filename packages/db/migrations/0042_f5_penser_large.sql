-- F5 « penser large » : interrupteurs de fonctions (feature_flag, feature_rule), canal bêta (beta_member), avis
-- (feedback), usage sans traceur (usage_day ; usage_seen et usage_salt effacés après 2 jours). Ajouts seulement.
-- Retour arrière (manuel) : DROP TABLE "usage_seen", "usage_salt", "usage_day", "feedback", "beta_member",
-- "feature_rule", "feature_flag";
CREATE TABLE "beta_member" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" uuid,
	"profile_id" uuid,
	"school_id" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"added_by" uuid,
	CONSTRAINT "beta_member_one" CHECK (num_nonnulls("beta_member"."account_id", "beta_member"."profile_id", "beta_member"."school_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "feature_flag" (
	"key" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "feature_flag_state" CHECK ("feature_flag"."state" IN ('on', 'off', 'beta'))
);
--> statement-breakpoint
CREATE TABLE "feature_rule" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"key" text NOT NULL,
	"effect" text NOT NULL,
	"role" text,
	"age" text,
	"country" text,
	"school_id" uuid,
	"channel" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "feature_rule_effect" CHECK ("feature_rule"."effect" IN ('on', 'off')),
	CONSTRAINT "feature_rule_role" CHECK ("feature_rule"."role" IS NULL OR "feature_rule"."role" IN ('eleve', 'parent', 'enseignant', 'direction', 'admin', 'visiteur')),
	CONSTRAINT "feature_rule_age" CHECK ("feature_rule"."age" IS NULL OR "feature_rule"."age" IN ('enfant', 'ado', 'adulte')),
	CONSTRAINT "feature_rule_country" CHECK ("feature_rule"."country" IS NULL OR "feature_rule"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "feature_rule_channel" CHECK ("feature_rule"."channel" IS NULL OR "feature_rule"."channel" IN ('beta', 'production'))
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" uuid,
	"profile_id" uuid,
	"role" text NOT NULL,
	"age" text,
	"category" text NOT NULL,
	"body" text,
	"page" text,
	"app_version" text,
	"capture" "bytea",
	"capture_type" text,
	"status" text DEFAULT 'nouveau' NOT NULL,
	"handled_at" timestamp with time zone,
	"handled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_status_check" CHECK ("feedback"."status" IN ('nouveau', 'lu', 'traite', 'rejete')),
	CONSTRAINT "feedback_category" CHECK ("feedback"."category" IN ('idee', 'probleme', 'difficile', 'aime', 'autre')),
	CONSTRAINT "feedback_body" CHECK ("feedback"."body" IS NULL OR char_length("feedback"."body") <= 500),
	CONSTRAINT "feedback_capture_type" CHECK ("feedback"."capture_type" IS NULL OR "feedback"."capture_type" IN ('image/jpeg', 'image/png'))
);
--> statement-breakpoint
CREATE TABLE "usage_day" (
	"day" date NOT NULL,
	"key" text NOT NULL,
	"role" text NOT NULL,
	"persons" integer DEFAULT 0 NOT NULL,
	"events" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_day_day_key_role_pk" PRIMARY KEY("day","key","role")
);
--> statement-breakpoint
CREATE TABLE "usage_salt" (
	"day" date PRIMARY KEY NOT NULL,
	"salt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_seen" (
	"day" date NOT NULL,
	"key" text NOT NULL,
	"fingerprint" text NOT NULL,
	CONSTRAINT "usage_seen_day_key_fingerprint_pk" PRIMARY KEY("day","key","fingerprint")
);
--> statement-breakpoint
ALTER TABLE "beta_member" ADD CONSTRAINT "beta_member_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beta_member" ADD CONSTRAINT "beta_member_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beta_member" ADD CONSTRAINT "beta_member_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beta_member" ADD CONSTRAINT "beta_member_added_by_account_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flag" ADD CONSTRAINT "feature_flag_updated_by_account_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_rule" ADD CONSTRAINT "feature_rule_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_rule" ADD CONSTRAINT "feature_rule_created_by_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_handled_by_account_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "beta_member_account" ON "beta_member" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "beta_member_profile" ON "beta_member" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "beta_member_school" ON "beta_member" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "feature_rule_key" ON "feature_rule" USING btree ("key");--> statement-breakpoint
CREATE INDEX "feedback_status" ON "feedback" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "feedback_account" ON "feedback" USING btree ("account_id","created_at");