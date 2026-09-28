CREATE TABLE "illustration" (
	"edition_id" uuid NOT NULL,
	"key" text NOT NULL,
	"view_box" text NOT NULL,
	"svg" text NOT NULL,
	"source_file" text NOT NULL,
	CONSTRAINT "illustration_edition_id_key_pk" PRIMARY KEY("edition_id","key")
);
--> statement-breakpoint
ALTER TABLE "illustration" ADD CONSTRAINT "illustration_edition_id_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."edition"("id") ON DELETE cascade ON UPDATE no action;