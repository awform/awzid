-- Retour arrière manuel : DROP TABLE khatma_part; DROP TABLE khatma; ALTER TABLE notification_pref DROP COLUMN khatma, DROP COLUMN last_khatma;
CREATE TABLE "khatma" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kind" text NOT NULL,
	"scope" text DEFAULT 'profil' NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"class_id" uuid,
	"title" text,
	"mode" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"pages_per_day" smallint,
	"status" text DEFAULT 'active' NOT NULL,
	"reminder_hour" smallint,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "khatma_kind" CHECK ("khatma"."kind" IN ('khatma', 'wird')),
	CONSTRAINT "khatma_scope" CHECK ("khatma"."scope" IN ('profil', 'famille', 'classe')),
	CONSTRAINT "khatma_mode" CHECK ("khatma"."mode" IN ('duree', 'pages', 'wird')),
	CONSTRAINT "khatma_status" CHECK ("khatma"."status" IN ('active', 'terminee', 'archivee')),
	CONSTRAINT "khatma_ppd" CHECK ("khatma"."pages_per_day" IS NULL OR "khatma"."pages_per_day" BETWEEN 1 AND 100),
	CONSTRAINT "khatma_hour" CHECK ("khatma"."reminder_hour" IS NULL OR "khatma"."reminder_hour" BETWEEN 0 AND 23),
	CONSTRAINT "khatma_title" CHECK ("khatma"."title" IS NULL OR char_length("khatma"."title") <= 40),
	CONSTRAINT "khatma_wird" CHECK (("khatma"."kind" = 'wird') = ("khatma"."mode" = 'wird')),
	CONSTRAINT "khatma_fin" CHECK ("khatma"."mode" <> 'duree' OR "khatma"."end_date" IS NOT NULL),
	CONSTRAINT "khatma_rythme" CHECK ("khatma"."mode" = 'duree' OR "khatma"."pages_per_day" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "khatma_part" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"khatma_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"first_page" smallint NOT NULL,
	"last_page" smallint NOT NULL,
	"done" integer DEFAULT 0 NOT NULL,
	"day_mark" date,
	"done_day_start" integer DEFAULT 0 NOT NULL,
	"pos_sura" smallint,
	"pos_aya" smallint,
	"finished_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "khatma_part_unique" UNIQUE("khatma_id","profile_id"),
	CONSTRAINT "khatma_part_pages" CHECK ("khatma_part"."first_page" BETWEEN 1 AND 604 AND "khatma_part"."last_page" BETWEEN "khatma_part"."first_page" AND 604),
	CONSTRAINT "khatma_part_done" CHECK ("khatma_part"."done" >= 0 AND "khatma_part"."done_day_start" >= 0),
	CONSTRAINT "khatma_part_pos" CHECK ("khatma_part"."pos_sura" IS NULL OR "khatma_part"."pos_sura" BETWEEN 1 AND 114)
);
--> statement-breakpoint
ALTER TABLE "notification_pref" ADD COLUMN "khatma" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_pref" ADD COLUMN "last_khatma" text;--> statement-breakpoint
ALTER TABLE "khatma" ADD CONSTRAINT "khatma_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khatma" ADD CONSTRAINT "khatma_class_id_class_group_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khatma_part" ADD CONSTRAINT "khatma_part_khatma_id_khatma_id_fk" FOREIGN KEY ("khatma_id") REFERENCES "public"."khatma"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khatma_part" ADD CONSTRAINT "khatma_part_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "khatma_owner" ON "khatma" USING btree ("owner_account_id","status");--> statement-breakpoint
CREATE INDEX "khatma_class" ON "khatma" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "khatma_part_profile" ON "khatma_part" USING btree ("profile_id");