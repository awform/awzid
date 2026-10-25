-- Blocage d'un compte par l'administrateur (suspension réversible, rien n'est effacé) : une colonne facultative, ajout seul
-- (règle « expand / contract »). Retour arrière (manuel) : ALTER TABLE "account" DROP COLUMN "blocked_at";
ALTER TABLE "account" ADD COLUMN "blocked_at" timestamp with time zone;
