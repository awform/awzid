CREATE TABLE "free_answer" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"profile_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"unit_id" text NOT NULL,
	"exercise_id" text NOT NULL,
	"item_index" smallint NOT NULL,
	"answer" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"appreciation" text,
	"comment" text,
	"corrected_by" uuid,
	"corrected_at" timestamp with time zone,
	CONSTRAINT "free_answer_len" CHECK (char_length("free_answer"."answer") BETWEEN 1 AND 2000),
	CONSTRAINT "free_answer_appreciation" CHECK ("free_answer"."appreciation" IS NULL OR "free_answer"."appreciation" IN ('acquis', 'en_cours', 'a_reprendre')),
	CONSTRAINT "free_answer_comment" CHECK ("free_answer"."comment" IS NULL OR char_length("free_answer"."comment") <= 600)
);
--> statement-breakpoint
ALTER TABLE "free_answer" ADD CONSTRAINT "free_answer_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_answer" ADD CONSTRAINT "free_answer_class_id_class_group_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_answer" ADD CONSTRAINT "free_answer_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_answer" ADD CONSTRAINT "free_answer_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_answer" ADD CONSTRAINT "free_answer_corrected_by_account_id_fk" FOREIGN KEY ("corrected_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "free_answer_one" ON "free_answer" USING btree ("profile_id","class_id","exercise_id","item_index");--> statement-breakpoint
CREATE INDEX "free_answer_class" ON "free_answer" USING btree ("class_id","corrected_at");