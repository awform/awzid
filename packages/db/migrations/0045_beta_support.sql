-- Bêta-support : « Signaler un problème » (problem_report). Ajout seulement.
-- Retour arrière (manuel) : DROP TABLE "problem_report";
CREATE TABLE "problem_report" (
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
	CONSTRAINT "problem_report_status_check" CHECK ("problem_report"."status" IN ('nouveau', 'en_cours', 'regle')),
	CONSTRAINT "problem_report_category" CHECK ("problem_report"."category" IN ('bug', 'contenu', 'religieux', 'autre')),
	CONSTRAINT "problem_report_body" CHECK ("problem_report"."body" IS NULL OR char_length("problem_report"."body") <= 500),
	CONSTRAINT "problem_report_capture_type" CHECK ("problem_report"."capture_type" IS NULL OR "problem_report"."capture_type" IN ('image/jpeg', 'image/png'))
);
--> statement-breakpoint
ALTER TABLE "problem_report" ADD CONSTRAINT "problem_report_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_report" ADD CONSTRAINT "problem_report_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_report" ADD CONSTRAINT "problem_report_handled_by_account_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "problem_report_status" ON "problem_report" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "problem_report_account" ON "problem_report" USING btree ("account_id","created_at");