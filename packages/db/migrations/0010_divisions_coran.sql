CREATE TABLE "quran_division" (
	"kind" text NOT NULL,
	"n" smallint NOT NULL,
	"sura" smallint NOT NULL,
	"aya" smallint NOT NULL,
	CONSTRAINT "quran_division_kind_n_pk" PRIMARY KEY("kind","n"),
	CONSTRAINT "quran_division_kind" CHECK ("quran_division"."kind" IN ('juz', 'quart', 'page', 'manzil'))
);
