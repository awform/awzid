CREATE TABLE "profile_rhythm" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"weekly_goal" smallint DEFAULT 4 NOT NULL,
	"rest_days" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_rhythm_goal" CHECK ("profile_rhythm"."weekly_goal" BETWEEN 3 AND 6)
);
--> statement-breakpoint
ALTER TABLE "profile_rhythm" ADD CONSTRAINT "profile_rhythm_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;