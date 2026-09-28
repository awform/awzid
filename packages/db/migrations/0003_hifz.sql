CREATE TYPE "public"."hifz_mode" AS ENUM('carnet', 'rythme');--> statement-breakpoint
CREATE TABLE "class_group" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"teacher_account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"join_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_group_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
CREATE TABLE "class_member" (
	"class_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"added_by" uuid,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_member_class_id_profile_id_pk" PRIMARY KEY("class_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "hifz_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"day" text NOT NULL,
	"part" text NOT NULL,
	"kind" text NOT NULL,
	"q" smallint,
	"source" text NOT NULL,
	"pos" integer,
	"details" jsonb,
	"author_account_id" uuid,
	"device_at" timestamp with time zone NOT NULL,
	"server_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hifz_event_q" CHECK ("hifz_event"."q" IS NULL OR "hifz_event"."q" BETWEEN 0 AND 3)
);
--> statement-breakpoint
CREATE TABLE "hifz_plan" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"mode" "hifz_mode" NOT NULL,
	"book_code" text,
	"rhythm_years" smallint,
	"sura_order" text DEFAULT 'rebours' NOT NULL,
	"start_date" text NOT NULL,
	"trial" boolean DEFAULT false NOT NULL,
	"new_factor" real DEFAULT 1 NOT NULL,
	"relief_until" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hifz_plan_rhythm" CHECK ("hifz_plan"."rhythm_years" IS NULL OR "hifz_plan"."rhythm_years" BETWEEN 3 AND 7)
);
--> statement-breakpoint
ALTER TABLE "class_group" ADD CONSTRAINT "class_group_teacher_account_id_account_id_fk" FOREIGN KEY ("teacher_account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_member" ADD CONSTRAINT "class_member_class_id_class_group_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_member" ADD CONSTRAINT "class_member_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_member" ADD CONSTRAINT "class_member_added_by_account_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hifz_event" ADD CONSTRAINT "hifz_event_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hifz_event" ADD CONSTRAINT "hifz_event_author_account_id_account_id_fk" FOREIGN KEY ("author_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hifz_plan" ADD CONSTRAINT "hifz_plan_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hifz_plan" ADD CONSTRAINT "hifz_plan_updated_by_account_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_member_profile" ON "class_member" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "hifz_event_profile" ON "hifz_event" USING btree ("profile_id","day");