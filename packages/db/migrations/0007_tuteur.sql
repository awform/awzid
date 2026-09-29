CREATE TABLE "tutor_alert" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"profile_id" uuid NOT NULL,
	"log_id" uuid,
	"motif" text NOT NULL,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"profile_id" uuid NOT NULL,
	"unit_id" text,
	"role_id" text NOT NULL,
	"role_version" text NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"action" text NOT NULL,
	"question" text,
	"decision" text NOT NULL,
	"route" text NOT NULL,
	"filter" jsonb,
	"segments" jsonb,
	"refused" text,
	"reported_at" timestamp with time zone,
	"cost_micros" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_question" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"profile_id" uuid NOT NULL,
	"unit_id" text,
	"text" text NOT NULL,
	"motif" text NOT NULL,
	"status" text DEFAULT 'en_attente' NOT NULL,
	"answer" text,
	"answered_by" uuid,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_question_status" CHECK ("tutor_question"."status" IN ('en_attente', 'repondue'))
);
--> statement-breakpoint
ALTER TABLE "tutor_alert" ADD CONSTRAINT "tutor_alert_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_alert" ADD CONSTRAINT "tutor_alert_log_id_tutor_log_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."tutor_log"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_log" ADD CONSTRAINT "tutor_log_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_question" ADD CONSTRAINT "tutor_question_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_question" ADD CONSTRAINT "tutor_question_answered_by_account_id_fk" FOREIGN KEY ("answered_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tutor_log_profile" ON "tutor_log" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE INDEX "tutor_question_profile" ON "tutor_question" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "tutor_question_status" ON "tutor_question" USING btree ("status");