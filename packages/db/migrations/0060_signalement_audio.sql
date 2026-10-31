-- V2-3 : motifs « audio absent » et « audio faux » (signalement par les enfants et les ados). Retour arrière (manuel) : remettre l'ancienne liste.
ALTER TABLE "content_report" DROP CONSTRAINT "content_report_reason";--> statement-breakpoint
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_reason" CHECK ("content_report"."reason" IN ('texte_arabe', 'sens', 'reference', 'regle', 'corrige', 'orthographe', 'audio_absent', 'audio_faux', 'autre'));
