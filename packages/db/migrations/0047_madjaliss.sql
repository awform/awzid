-- Madjaliss (P3-1) : séance d'un texte faite (« madjlis », item « akhdari:12 ») dans le journal de l'entraînement.
-- Élargit seulement la contrainte du genre ; aucune donnée touchée.
-- Retour arrière (manuel) : DELETE FROM "practice_event" WHERE "kind" = 'madjlis'; puis la contrainte d'avant
-- ("kind" IN ('trace', 'carte')).
ALTER TABLE "practice_event" DROP CONSTRAINT "practice_event_kind";--> statement-breakpoint
ALTER TABLE "practice_event" ADD CONSTRAINT "practice_event_kind" CHECK ("practice_event"."kind" IN ('trace', 'carte', 'madjlis'));
