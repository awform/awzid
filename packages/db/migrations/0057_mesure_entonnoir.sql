-- V2-0 : mesure anonyme (compteurs par heure, sans donnée personnelle). Retour arrière (manuel) : DROP TABLE funnel_event;
CREATE TABLE "funnel_event" (
	"hour" timestamp with time zone NOT NULL,
	"step" text NOT NULL,
	"platform" text NOT NULL,
	"locale" text NOT NULL,
	"n" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "funnel_event_hour_step_platform_locale_pk" PRIMARY KEY("hour","step","platform","locale"),
	CONSTRAINT "funnel_event_step" CHECK ("step" IN ('inscription_ouverte', 'inscription_choix', 'inscription_identifiants', 'inscription_mdp_valide', 'inscription_compte_cree', 'connexion_ouverte', 'connexion_identifiants', 'connexion_reussie', 'connexion_echec_mdp', 'connexion_blocage')),
	CONSTRAINT "funnel_event_platform" CHECK ("platform" IN ('mobile', 'bureau')),
	CONSTRAINT "funnel_event_locale" CHECK ("locale" IN ('fr', 'en', 'es', 'de', 'ar', 'autre')),
	CONSTRAINT "funnel_event_n" CHECK ("funnel_event"."n" >= 0)
);
