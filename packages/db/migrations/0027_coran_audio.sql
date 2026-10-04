CREATE TABLE "class_reciter_rule" (
	"class_id" uuid PRIMARY KEY NOT NULL,
	"allowed" text[] NOT NULL,
	"set_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_reciter_pref" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"reciter_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_reciter_rule" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"allowed" text[] NOT NULL,
	"set_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quran_audio_import" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"reciter_id" text NOT NULL,
	"source_dir" text NOT NULL,
	"pattern" text NOT NULL,
	"status" text NOT NULL,
	"tracks" integer DEFAULT 0 NOT NULL,
	"total_bytes" bigint DEFAULT 0 NOT NULL,
	"total_ms" bigint DEFAULT 0 NOT NULL,
	"blocking" integer DEFAULT 0 NOT NULL,
	"warnings" integer DEFAULT 0 NOT NULL,
	"report" jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quran_audio_import_status" CHECK ("quran_audio_import"."status" IN ('bloque', 'importe', 'active'))
);
--> statement-breakpoint
CREATE TABLE "quran_reciter" (
	"id" text PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"name_fr" text NOT NULL,
	"riwaya" text NOT NULL,
	"speed" text,
	"style" text,
	"expected_verses" integer NOT NULL,
	"license_source" text NOT NULL,
	"license_url" text NOT NULL,
	"license_archived_on" date NOT NULL,
	"license_text" text NOT NULL,
	"credit" text NOT NULL,
	"status" text DEFAULT 'en_attente' NOT NULL,
	"activated_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"retired_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quran_reciter_id" CHECK ("quran_reciter"."id" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "quran_reciter_riwaya" CHECK ("quran_reciter"."riwaya" IN ('hafs', 'shuba', 'warsh', 'qalun', 'bazzi', 'qunbul', 'duri', 'susi', 'hisham', 'ibn_dhakwan', 'khalaf', 'khallad', 'abu_al_harith', 'duri_kisai', 'ibn_wardan', 'ibn_jammaz', 'ruways', 'rawh', 'ishaq', 'idris')),
	CONSTRAINT "quran_reciter_speed" CHECK ("quran_reciter"."speed" IS NULL OR "quran_reciter"."speed" IN ('lente', 'moyenne', 'rapide')),
	CONSTRAINT "quran_reciter_style" CHECK ("quran_reciter"."style" IS NULL OR "quran_reciter"."style" IN ('murattal', 'mujawwad', 'muallim')),
	CONSTRAINT "quran_reciter_status" CHECK ("quran_reciter"."status" IN ('en_attente', 'actif', 'retire')),
	CONSTRAINT "quran_reciter_retrait" CHECK ("quran_reciter"."status" <> 'retire' OR ("quran_reciter"."retired_at" IS NOT NULL AND length("quran_reciter"."retired_reason") > 0)),
	CONSTRAINT "quran_reciter_versets" CHECK ("quran_reciter"."expected_verses" BETWEEN 1 AND 6300)
);
--> statement-breakpoint
CREATE TABLE "quran_track" (
	"reciter_id" text NOT NULL,
	"sura" smallint NOT NULL,
	"aya" smallint NOT NULL,
	"path" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"format" text NOT NULL,
	"import_id" uuid,
	CONSTRAINT "quran_track_reciter_id_sura_aya_pk" PRIMARY KEY("reciter_id","sura","aya"),
	CONSTRAINT "quran_track_sura" CHECK ("quran_track"."sura" BETWEEN 1 AND 114),
	CONSTRAINT "quran_track_aya" CHECK ("quran_track"."aya" BETWEEN 0 AND 286),
	CONSTRAINT "quran_track_duree" CHECK ("quran_track"."duration_ms" > 0),
	CONSTRAINT "quran_track_taille" CHECK ("quran_track"."bytes" > 0),
	CONSTRAINT "quran_track_sha" CHECK ("quran_track"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "quran_track_format" CHECK ("quran_track"."format" IN ('mp3', 'wav', 'ogg', 'opus', 'm4a')),
	CONSTRAINT "quran_track_chemin" CHECK ("quran_track"."path" !~ '(^/|\.\.)')
);
--> statement-breakpoint
CREATE TABLE "relay_reciter" (
	"relay_id" uuid NOT NULL,
	"reciter_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relay_reciter_relay_id_reciter_id_pk" PRIMARY KEY("relay_id","reciter_id")
);
--> statement-breakpoint
ALTER TABLE "class_reciter_rule" ADD CONSTRAINT "class_reciter_rule_class_id_class_group_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_reciter_rule" ADD CONSTRAINT "class_reciter_rule_set_by_account_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_reciter_pref" ADD CONSTRAINT "profile_reciter_pref_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_reciter_pref" ADD CONSTRAINT "profile_reciter_pref_reciter_id_quran_reciter_id_fk" FOREIGN KEY ("reciter_id") REFERENCES "public"."quran_reciter"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_reciter_rule" ADD CONSTRAINT "profile_reciter_rule_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_reciter_rule" ADD CONSTRAINT "profile_reciter_rule_set_by_account_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quran_audio_import" ADD CONSTRAINT "quran_audio_import_reciter_id_quran_reciter_id_fk" FOREIGN KEY ("reciter_id") REFERENCES "public"."quran_reciter"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quran_track" ADD CONSTRAINT "quran_track_reciter_id_quran_reciter_id_fk" FOREIGN KEY ("reciter_id") REFERENCES "public"."quran_reciter"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quran_track" ADD CONSTRAINT "quran_track_import_id_quran_audio_import_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."quran_audio_import"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relay_reciter" ADD CONSTRAINT "relay_reciter_relay_id_relay_id_fk" FOREIGN KEY ("relay_id") REFERENCES "public"."relay"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relay_reciter" ADD CONSTRAINT "relay_reciter_reciter_id_quran_reciter_id_fk" FOREIGN KEY ("reciter_id") REFERENCES "public"."quran_reciter"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quran_audio_import_reciter" ON "quran_audio_import" USING btree ("reciter_id");