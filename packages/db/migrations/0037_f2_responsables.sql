-- Lot F2 (revue E3, E4) : responsables d'un profil. Toutes les lignes de guardianship (lien parent ↔ profil,
-- consentement daté) sont reprises dans profile_custodian (nature « parent », actif), ainsi que les profils
-- d'enfant ou d'ado d'un compte parent qui n'avaient pas de ligne (profils de démonstration). guardianship reste
-- en place, en lecture seule (retour arrière).
-- Retour arrière (manuel) : DELETE FROM profile_custodian;
INSERT INTO "profile_custodian" ("profile_id", "nature", "account_id", "status", "evidence", "created_at", "accepted_at")
SELECT g."profile_id", 'parent', g."parent_account_id", 'actif',
  jsonb_build_object('reprise', 'guardianship', 'consentAt', g."consent_at"), g."consent_at", g."consent_at"
FROM "guardianship" g
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "profile_custodian" ("profile_id", "nature", "account_id", "status", "evidence", "created_at", "accepted_at")
SELECT p."id", 'parent', p."owner_account_id", 'actif',
  jsonb_build_object('reprise', 'titulaire_parent'), p."created_at", p."created_at"
FROM "profile" p JOIN "account" a ON a."id" = p."owner_account_id"
WHERE a."kind" = 'parent' AND NOT EXISTS (
  SELECT 1 FROM "profile_custodian" pc WHERE pc."profile_id" = p."id" AND pc."account_id" = p."owner_account_id"
)
ON CONFLICT DO NOTHING;
