CREATE TABLE "hifz_recital" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"class_id" uuid NOT NULL,
	"book_code" text NOT NULL,
	"title" text NOT NULL,
	"day" date NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"canceled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "hifz_recital_entry" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"recital_id" uuid NOT NULL,
	"pupil_id" uuid NOT NULL,
	"parcours" text NOT NULL,
	"drawn" jsonb NOT NULL,
	"choice" text,
	"counters" jsonb,
	"note" jsonb,
	"second_jury" boolean DEFAULT false NOT NULL,
	"drawn_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scored_at" timestamp with time zone,
	"scored_by" uuid,
	CONSTRAINT "hifz_recital_entry_parcours" CHECK ("hifz_recital_entry"."parcours" IN ('socle', 'renforce'))
);
--> statement-breakpoint
ALTER TABLE "hifz_recital" ADD CONSTRAINT "hifz_recital_class_id_class_group_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hifz_recital" ADD CONSTRAINT "hifz_recital_created_by_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hifz_recital_entry" ADD CONSTRAINT "hifz_recital_entry_recital_id_hifz_recital_id_fk" FOREIGN KEY ("recital_id") REFERENCES "public"."hifz_recital"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hifz_recital_entry" ADD CONSTRAINT "hifz_recital_entry_pupil_id_class_pupil_id_fk" FOREIGN KEY ("pupil_id") REFERENCES "public"."class_pupil"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hifz_recital_entry" ADD CONSTRAINT "hifz_recital_entry_scored_by_account_id_fk" FOREIGN KEY ("scored_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hifz_recital_class" ON "hifz_recital" USING btree ("class_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "hifz_recital_entry_pupil" ON "hifz_recital_entry" USING btree ("recital_id","pupil_id");--> statement-breakpoint
CREATE INDEX "hifz_recital_entry_pupil_idx" ON "hifz_recital_entry" USING btree ("pupil_id");