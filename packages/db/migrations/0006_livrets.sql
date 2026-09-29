CREATE TABLE "booklet" (
	"edition_id" uuid NOT NULL,
	"code" text NOT NULL,
	"level_code" text NOT NULL,
	"rank" smallint NOT NULL,
	"catalogue" jsonb NOT NULL,
	"content" jsonb NOT NULL,
	CONSTRAINT "booklet_edition_id_code_pk" PRIMARY KEY("edition_id","code")
);
--> statement-breakpoint
ALTER TABLE "booklet" ADD CONSTRAINT "booklet_edition_id_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booklet_level" ON "booklet" USING btree ("edition_id","level_code");