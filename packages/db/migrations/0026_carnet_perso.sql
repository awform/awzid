CREATE TABLE "carnet_perso" (
	"profile_id" uuid NOT NULL,
	"unit_id" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carnet_perso_profile_id_unit_id_pk" PRIMARY KEY("profile_id","unit_id")
);
--> statement-breakpoint
ALTER TABLE "carnet_perso" ADD CONSTRAINT "carnet_perso_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carnet_perso" ADD CONSTRAINT "carnet_perso_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;