CREATE TABLE "practice_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"item" text NOT NULL,
	"ok" boolean NOT NULL,
	"day" text NOT NULL,
	"details" jsonb,
	"device_at" timestamp with time zone NOT NULL,
	"server_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practice_event_kind" CHECK ("practice_event"."kind" IN ('trace', 'carte'))
);
--> statement-breakpoint
ALTER TABLE "practice_event" ADD CONSTRAINT "practice_event_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "practice_event_profile" ON "practice_event" USING btree ("profile_id","day");