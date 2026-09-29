CREATE TABLE "assignment_mark" (
	"assignment_id" uuid NOT NULL,
	"pupil_id" uuid NOT NULL,
	"done" boolean NOT NULL,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_mark_assignment_id_pupil_id_pk" PRIMARY KEY("assignment_id","pupil_id")
);
--> statement-breakpoint
CREATE TABLE "certificate" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"number" text NOT NULL,
	"kind" text NOT NULL,
	"class_id" uuid,
	"pupil_id" uuid,
	"issued_by" uuid,
	"subject" text NOT NULL,
	"document" jsonb NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certificate_number_unique" UNIQUE("number"),
	CONSTRAINT "certificate_kind" CHECK ("certificate"."kind" IN ('niveau', 'hifz'))
);
--> statement-breakpoint
CREATE TABLE "class_assignment" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"class_id" uuid NOT NULL,
	"group_id" uuid,
	"kind" text NOT NULL,
	"target" text NOT NULL,
	"due_day" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_assignment_kind" CHECK ("class_assignment"."kind" IN ('lecon', 'hifz', 'lecture'))
);
--> statement-breakpoint
CREATE TABLE "class_pupil" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"class_id" uuid NOT NULL,
	"profile_id" uuid,
	"display_name" text NOT NULL,
	"name_ar" text,
	"gender" text,
	"group_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_pupil_gender" CHECK ("class_pupil"."gender" IS NULL OR "class_pupil"."gender" IN ('m', 'f'))
);
--> statement-breakpoint
CREATE TABLE "class_subgroup" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"class_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_doc" (
	"edition_id" uuid NOT NULL,
	"key" text NOT NULL,
	"content" jsonb NOT NULL,
	CONSTRAINT "eval_doc_edition_id_key_pk" PRIMARY KEY("edition_id","key")
);
--> statement-breakpoint
CREATE TABLE "paper_result" (
	"pupil_id" uuid NOT NULL,
	"level_code" text NOT NULL,
	"item" text NOT NULL,
	"score" real NOT NULL,
	"max" real NOT NULL,
	"day" text NOT NULL,
	"details" jsonb,
	"entered_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paper_result_pupil_id_level_code_item_pk" PRIMARY KEY("pupil_id","level_code","item"),
	CONSTRAINT "paper_result_score" CHECK ("paper_result"."max" > 0 AND "paper_result"."score" >= 0 AND "paper_result"."score" <= "paper_result"."max")
);
--> statement-breakpoint
ALTER TABLE "class_group" ADD COLUMN "level_code" text;--> statement-breakpoint
ALTER TABLE "class_group" ADD COLUMN "school_name" text;--> statement-breakpoint
ALTER TABLE "class_group" ADD COLUMN "school_name_ar" text;--> statement-breakpoint
ALTER TABLE "class_group" ADD COLUMN "place" text;--> statement-breakpoint
ALTER TABLE "class_group" ADD COLUMN "place_ar" text;--> statement-breakpoint
ALTER TABLE "class_group" ADD COLUMN "school_year" text;--> statement-breakpoint
ALTER TABLE "assignment_mark" ADD CONSTRAINT "assignment_mark_assignment_id_class_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."class_assignment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_mark" ADD CONSTRAINT "assignment_mark_pupil_id_class_pupil_id_fk" FOREIGN KEY ("pupil_id") REFERENCES "public"."class_pupil"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_class_id_class_group_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_group"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_pupil_id_class_pupil_id_fk" FOREIGN KEY ("pupil_id") REFERENCES "public"."class_pupil"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_issued_by_account_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_assignment" ADD CONSTRAINT "class_assignment_class_id_class_group_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_assignment" ADD CONSTRAINT "class_assignment_group_id_class_subgroup_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."class_subgroup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_pupil" ADD CONSTRAINT "class_pupil_class_id_class_group_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_pupil" ADD CONSTRAINT "class_pupil_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_pupil" ADD CONSTRAINT "class_pupil_group_id_class_subgroup_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."class_subgroup"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_subgroup" ADD CONSTRAINT "class_subgroup_class_id_class_group_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_doc" ADD CONSTRAINT "eval_doc_edition_id_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_result" ADD CONSTRAINT "paper_result_pupil_id_class_pupil_id_fk" FOREIGN KEY ("pupil_id") REFERENCES "public"."class_pupil"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_result" ADD CONSTRAINT "paper_result_entered_by_account_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "certificate_class" ON "certificate" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "class_assignment_class" ON "class_assignment" USING btree ("class_id","due_day");--> statement-breakpoint
CREATE UNIQUE INDEX "class_pupil_profile" ON "class_pupil" USING btree ("class_id","profile_id");--> statement-breakpoint
CREATE INDEX "class_pupil_class" ON "class_pupil" USING btree ("class_id");--> statement-breakpoint
-- liste de classe : élèves déjà inscrits par leur parent (pseudonyme du profil, jamais le nom réel)
INSERT INTO "class_pupil" ("class_id", "profile_id", "display_name") SELECT m."class_id", m."profile_id", p."pseudonym" FROM "class_member" m JOIN "profile" p ON p."id" = m."profile_id" ON CONFLICT DO NOTHING;
