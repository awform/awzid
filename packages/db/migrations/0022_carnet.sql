CREATE TABLE "practice_check" (
	"profile_id" uuid NOT NULL,
	"exercise_id" text NOT NULL,
	"week" date NOT NULL,
	"line" smallint NOT NULL,
	"day" smallint NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practice_check_profile_id_exercise_id_week_line_day_pk" PRIMARY KEY("profile_id","exercise_id","week","line","day"),
	CONSTRAINT "practice_check_day" CHECK ("practice_check"."day" BETWEEN 0 AND 6),
	CONSTRAINT "practice_check_line" CHECK ("practice_check"."line" BETWEEN 0 AND 49)
);
--> statement-breakpoint
CREATE TABLE "practice_signature" (
	"profile_id" uuid NOT NULL,
	"exercise_id" text NOT NULL,
	"week" date NOT NULL,
	"signed_by" uuid NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practice_signature_profile_id_exercise_id_week_pk" PRIMARY KEY("profile_id","exercise_id","week")
);
--> statement-breakpoint
CREATE TABLE "sura_progress" (
	"profile_id" uuid NOT NULL,
	"sura" smallint NOT NULL,
	"step" smallint NOT NULL,
	"validated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sura_progress_profile_id_sura_pk" PRIMARY KEY("profile_id","sura"),
	CONSTRAINT "sura_progress_sura" CHECK ("sura_progress"."sura" BETWEEN 1 AND 114),
	CONSTRAINT "sura_progress_step" CHECK ("sura_progress"."step" BETWEEN 1 AND 4)
);
--> statement-breakpoint
ALTER TABLE "practice_check" ADD CONSTRAINT "practice_check_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_check" ADD CONSTRAINT "practice_check_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_signature" ADD CONSTRAINT "practice_signature_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_signature" ADD CONSTRAINT "practice_signature_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_signature" ADD CONSTRAINT "practice_signature_signed_by_account_id_fk" FOREIGN KEY ("signed_by") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sura_progress" ADD CONSTRAINT "sura_progress_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sura_progress" ADD CONSTRAINT "sura_progress_validated_by_account_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;