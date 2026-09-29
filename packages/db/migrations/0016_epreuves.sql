CREATE TABLE "exam_session" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"class_id" uuid NOT NULL,
	"unit_id" text NOT NULL,
	"bareme" smallint NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"seed" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_session_bareme" CHECK ("exam_session"."bareme" IN (20, 100)),
	CONSTRAINT "exam_session_dates" CHECK ("exam_session"."closes_at" > "exam_session"."opens_at")
);
--> statement-breakpoint
CREATE TABLE "exam_submission" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"session_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"answers" jsonb NOT NULL,
	"auto_points" smallint NOT NULL,
	"auto_max" smallint NOT NULL,
	"detail" jsonb NOT NULL,
	"teacher_points" real,
	"teacher_max" real,
	"score" real,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"graded_at" timestamp with time zone,
	CONSTRAINT "exam_submission_teacher" CHECK (("exam_submission"."teacher_points" IS NULL AND "exam_submission"."teacher_max" IS NULL) OR ("exam_submission"."teacher_max" > 0 AND "exam_submission"."teacher_points" BETWEEN 0 AND "exam_submission"."teacher_max"))
);
--> statement-breakpoint
ALTER TABLE "exam_session" ADD CONSTRAINT "exam_session_class_id_class_group_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_session" ADD CONSTRAINT "exam_session_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_session" ADD CONSTRAINT "exam_session_created_by_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_submission" ADD CONSTRAINT "exam_submission_session_id_exam_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."exam_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_submission" ADD CONSTRAINT "exam_submission_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exam_session_class" ON "exam_session" USING btree ("class_id","opens_at");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_submission_one" ON "exam_submission" USING btree ("session_id","profile_id");