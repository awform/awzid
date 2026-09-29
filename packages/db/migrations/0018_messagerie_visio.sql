CREATE TABLE "message" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"class_id" uuid NOT NULL,
	"thread_id" uuid,
	"kind" text NOT NULL,
	"author_account_id" uuid,
	"key_version" smallint NOT NULL,
	"iv" "bytea" NOT NULL,
	"body" "bytea" NOT NULL,
	"attachment_name" text,
	"attachment_mime" text,
	"attachment_iv" "bytea",
	"attachment" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "message_kind" CHECK ("message"."kind" IN ('prive', 'annonce')),
	CONSTRAINT "message_thread_kind" CHECK (("message"."kind" = 'prive') = ("message"."thread_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "message_read" (
	"message_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_read_message_id_account_id_pk" PRIMARY KEY("message_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "message_report" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"message_id" uuid NOT NULL,
	"reporter_account_id" uuid,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handled_at" timestamp with time zone,
	"handled_by" uuid,
	"decision" text,
	CONSTRAINT "message_report_decision" CHECK ("message_report"."decision" IS NULL OR "message_report"."decision" IN ('classe', 'retire'))
);
--> statement-breakpoint
CREATE TABLE "message_thread" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"class_id" uuid NOT NULL,
	"teacher_account_id" uuid NOT NULL,
	"family_account_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_presence" (
	"session_id" uuid NOT NULL,
	"pupil_id" uuid NOT NULL,
	"present" boolean NOT NULL,
	CONSTRAINT "video_presence_session_id_pupil_id_pk" PRIMARY KEY("session_id","pupil_id")
);
--> statement-breakpoint
CREATE TABLE "video_session" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"class_id" uuid NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_min" smallint NOT NULL,
	"url" text NOT NULL,
	"provider" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"canceled_at" timestamp with time zone,
	CONSTRAINT "video_session_duration" CHECK ("video_session"."duration_min" BETWEEN 10 AND 240)
);
--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_class_id_class_group_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_thread_id_message_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_author_account_id_account_id_fk" FOREIGN KEY ("author_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_read" ADD CONSTRAINT "message_read_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_read" ADD CONSTRAINT "message_read_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_report" ADD CONSTRAINT "message_report_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_report" ADD CONSTRAINT "message_report_reporter_account_id_account_id_fk" FOREIGN KEY ("reporter_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_report" ADD CONSTRAINT "message_report_handled_by_account_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_thread" ADD CONSTRAINT "message_thread_class_id_class_group_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_thread" ADD CONSTRAINT "message_thread_teacher_account_id_account_id_fk" FOREIGN KEY ("teacher_account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_thread" ADD CONSTRAINT "message_thread_family_account_id_account_id_fk" FOREIGN KEY ("family_account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_thread" ADD CONSTRAINT "message_thread_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_presence" ADD CONSTRAINT "video_presence_session_id_video_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."video_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_presence" ADD CONSTRAINT "video_presence_pupil_id_class_pupil_id_fk" FOREIGN KEY ("pupil_id") REFERENCES "public"."class_pupil"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_session" ADD CONSTRAINT "video_session_class_id_class_group_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_session" ADD CONSTRAINT "video_session_created_by_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_by_thread" ON "message" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "message_by_class" ON "message" USING btree ("class_id","created_at");--> statement-breakpoint
CREATE INDEX "message_created" ON "message" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "message_report_one" ON "message_report" USING btree ("message_id","reporter_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_thread_one" ON "message_thread" USING btree ("class_id","profile_id");--> statement-breakpoint
CREATE INDEX "video_session_class" ON "video_session" USING btree ("class_id","starts_at");