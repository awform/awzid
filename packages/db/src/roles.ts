/**
 * Comptes PostgreSQL séparés (lot 14, moindre privilège) :
 *  - propriétaire (POSTGRES_USER « awform ») : migrations et import des éditions — service « outils » seulement ;
 *  - <préfixe>_api : lit le contenu (jamais le modifier), écrit les données des utilisateurs ; journaux
 *    immuables en ajout seul (réponses : ajout et effacement avec le profil) ; aucune DDL ;
 *  - <préfixe>_worker : purges (comptes supprimés, journal du tuteur, registre des certificats) et sa file
 *    pg-boss (schéma « pgboss » qui lui appartient) ; rien d'autre.
 * Les effacements en cascade (clés étrangères) s'exécutent avec les droits du propriétaire des tables.
 * CHAQUE table du schéma public doit figurer ci-dessous (test : une nouvelle table sans droits décidés échoue).
 */

import type pg from 'pg';

type Right = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
const R: Right[] = ['SELECT'];
const RI: Right[] = ['SELECT', 'INSERT'];
const RID: Right[] = ['SELECT', 'INSERT', 'DELETE'];
const RIU: Right[] = ['SELECT', 'INSERT', 'UPDATE'];
const ALL: Right[] = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

/** Droits de l'API, table par table. */
export const API_GRANTS: Record<string, Right[]> = {
  // contenu importé (éditions, Coran de référence) : lecture seule
  edition: R,
  level: R,
  level_version: R,
  unit: R,
  unit_version: R,
  exercise: R,
  exercise_version: R,
  hifz_book: R,
  booklet: R,
  quran_verse: R,
  quran_division: R,
  registry_entry: R,
  illustration: R,
  qr_redirect: R,
  eval_doc: R,
  // journaux immuables : ajout seul (les réponses s'effacent avec le profil)
  attempt: RID,
  practice_event: RI,
  hifz_event: RI,
  billing_event: RI,
  audit_log: RI,
  tutor_log: RIU,
  // données des comptes et de l'école
  account: ALL,
  profile: ALL,
  guardianship: ALL,
  consent: ALL,
  session: ALL,
  auth_throttle: ALL,
  progress: ALL,
  hifz_plan: ALL,
  class_group: ALL,
  class_member: ALL,
  tutor_question: ALL,
  tutor_alert: ALL,
  billing_checkout: ALL,
  subscription: ALL,
  profile_rhythm: ALL,
  class_subgroup: ALL,
  class_pupil: ALL,
  class_assignment: ALL,
  assignment_mark: ALL,
  paper_result: ALL,
  certificate: RIU,
  // lot 16 : récitations envoyées (chiffrées), notifications
  recitation_upload: ALL,
  push_subscription: ALL,
  notification_pref: ALL,
  // lot 17 : relais d'école (l'API authentifie les relais et met à jour leur dernier battement)
  relay: ['SELECT', 'UPDATE'],
  // lot 18 : réponses libres corrigées par l'enseignant
  free_answer: ALL,
  // lot 19 : épreuves notées
  exam_session: ALL,
  exam_submission: ALL,
  // lot 21 : messagerie encadrée et visio
  message_thread: ALL,
  message: ALL,
  message_read: ALL,
  message_report: ALL,
  video_session: ALL,
  video_presence: ALL,
  // lot 22 : carnet de pratique signé par le parent, suivi des sourates
  practice_check: ALL,
  practice_signature: ALL,
  sura_progress: ALL,
  // vérification sur les vrais livres (04/10/2026) : cas pratique ra* d'un adulte autonome
  cas_tentative: ALL,
  carnet_perso: ALL,
  // lot 23 : codes d'activation imprimés dans les livres
  activation_batch: ALL,
  activation_code: ALL,
  level_pass: ALL,
  // suite V1-b : récital de hifẓ
  hifz_recital: ALL,
  hifz_recital_entry: ALL,
  // lot 27 : audio du Coran — pistes et imports posés par l'outil d'import (propriétaire) : lecture seule ;
  // récitateur : lecture et retrait immédiat par l'administrateur ; choix et listes des familles et écoles
  quran_reciter: ['SELECT', 'UPDATE'],
  quran_track: R,
  quran_audio_import: R,
  profile_reciter_pref: ALL,
  profile_reciter_rule: ALL,
  class_reciter_rule: ALL,
  relay_reciter: ALL,
};

/** Droits du travailleur : uniquement ce que ses tâches touchent. */
export const WORKER_GRANTS: Record<string, Right[]> = {
  account: ['SELECT', 'DELETE'],
  tutor_log: ['SELECT', 'DELETE'],
  // ajout ; effacement au-delà de la durée de conservation seulement (audit MIN-8)
  audit_log: ['INSERT', 'DELETE'],
  // audit MIN-7 : verrous anti-essais effacés après 24 h (colonnes lues : voir WORKER_COLUMN_GRANTS)
  auth_throttle: ['DELETE'],
  // audit MIN-8 : durées de conservation (lecture des seules colonnes de date et d'état, voir plus bas)
  tutor_question: ['DELETE'],
  tutor_alert: ['DELETE'],
  session: ['DELETE'],
  billing_checkout: ['DELETE'],
  // lot 21 : conservation des messages (12 mois après l'année scolaire)
  message: ['DELETE'],
  certificate: ['SELECT', 'UPDATE'],
  // lot 16 : effacement des récitations échues, envoi des notifications
  recitation_upload: ['SELECT', 'DELETE'],
  push_subscription: ['SELECT', 'UPDATE', 'DELETE'],
  notification_pref: ['SELECT', 'UPDATE'],
  class_assignment: ['SELECT'],
  class_pupil: ['SELECT'],
  assignment_mark: ['SELECT'],
};

/** Droits par COLONNE du travailleur (ni pseudonyme ni année de naissance : seulement le lien au compte). */
export const WORKER_COLUMN_GRANTS: Record<string, string[]> = {
  profile: ['id', 'owner_account_id', 'kind'],
  auth_throttle: ['key', 'updated_at', 'locked_until'],
  audit_log: ['target', 'at'],
  tutor_question: ['status', 'created_at'],
  tutor_alert: ['handled_at', 'created_at'],
  session: ['expires_at', 'revoked_at'],
  billing_checkout: ['status', 'created_at'],
  message: ['created_at'],
};

/**
 * Droits de MODIFICATION par colonne du travailleur. Audit MIN-7 : à l'effacement définitif, il pseudonymise
 * les lignes du journal qui visaient la personne (cible, avant, après) ; l'action et la date restent intactes.
 */
export const WORKER_COLUMN_UPDATES: Record<string, string[]> = {
  audit_log: ['target', 'before', 'after'],
};

export const SEQUENCES = ['audit_log_id_seq'];

const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(s)) throw new Error(`identifiant refusé : ${s}`);
  return `"${s}"`;
};
const literal = (s: string) => `'${s.replace(/'/g, "''")}'`;

export interface RoleNames {
  api: string;
  worker: string;
}
export const roleNames = (prefix = 'awform'): RoleNames => ({
  api: `${prefix}_api`,
  worker: `${prefix}_worker`,
});

/**
 * SQL idempotent : crée ou met à jour les rôles (mot de passe), retire tout droit puis accorde la liste.
 * À exécuter par le PROPRIÉTAIRE de la base.
 */
export function rolesSql(
  database: string,
  names: RoleNames,
  passwords: { api: string; worker: string },
): string[] {
  const out: string[] = [];
  for (const k of ['api', 'worker'] as const) {
    const role = names[k];
    const pw = passwords[k];
    if (pw.length < 24) throw new Error(`mot de passe du rôle ${role} trop court`);
    out.push(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${literal(role)}) THEN CREATE ROLE ${ident(role)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; END IF; END $$`,
      `ALTER ROLE ${ident(role)} WITH LOGIN NOCREATEROLE NOINHERIT CONNECTION LIMIT 40 PASSWORD ${literal(pw)}`,
      `REVOKE ALL ON DATABASE ${ident(database)} FROM ${ident(role)}`,
      `GRANT CONNECT ON DATABASE ${ident(database)} TO ${ident(role)}`,
      `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${ident(role)}`,
      `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${ident(role)}`,
      `GRANT USAGE ON SCHEMA public TO ${ident(role)}`,
    );
  }
  // personne d'autre que le propriétaire ne crée d'objets dans public
  out.push('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  for (const [names_, grants] of [
    [names.api, API_GRANTS],
    [names.worker, WORKER_GRANTS],
  ] as const)
    for (const [table, rights] of Object.entries(grants))
      out.push(`GRANT ${rights.join(', ')} ON TABLE public.${ident(table)} TO ${ident(names_)}`);
  for (const [table, cols] of Object.entries(WORKER_COLUMN_GRANTS))
    out.push(
      `GRANT SELECT (${cols.map(ident).join(', ')}) ON TABLE public.${ident(table)} TO ${ident(names.worker)}`,
    );
  for (const [table, cols] of Object.entries(WORKER_COLUMN_UPDATES))
    out.push(
      `GRANT UPDATE (${cols.map(ident).join(', ')}) ON TABLE public.${ident(table)} TO ${ident(names.worker)}`,
    );
  for (const s of SEQUENCES)
    for (const role of [names.api, names.worker])
      out.push(`GRANT USAGE, SELECT ON SEQUENCE public.${ident(s)} TO ${ident(role)}`);
  // le propriétaire doit pouvoir « devenir » le travailleur pour lui donner le schéma pgboss (PostgreSQL 16+)
  out.push(`GRANT ${ident(names.worker)} TO CURRENT_USER WITH SET TRUE, INHERIT FALSE`);
  // file de travaux du travailleur : schéma pgboss à lui (créé vide s'il n'existe pas)
  out.push(
    `CREATE SCHEMA IF NOT EXISTS pgboss AUTHORIZATION ${ident(names.worker)}`,
    `DO $$ DECLARE r record; BEGIN
       EXECUTE 'ALTER SCHEMA pgboss OWNER TO ${names.worker}';
       FOR r IN SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'pgboss' AND c.relkind IN ('r', 'p', 'S', 'v') LOOP
         EXECUTE format('ALTER %s pgboss.%I OWNER TO ${names.worker}',
           CASE r.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' ELSE 'TABLE' END, r.relname);
       END LOOP;
       FOR r IN SELECT p.oid::regprocedure AS f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'pgboss' LOOP
         EXECUTE format('ALTER ROUTINE %s OWNER TO ${names.worker}', r.f);
       END LOOP;
       FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                WHERE n.nspname = 'pgboss' AND t.typtype = 'e' LOOP
         EXECUTE format('ALTER TYPE pgboss.%I OWNER TO ${names.worker}', r.typname);
       END LOOP;
     END $$`,
  );
  return out;
}

/** Applique les rôles et les droits (transaction) ; renvoie le nom de la base. */
export async function applyRoles(
  pool: pg.Pool,
  names: RoleNames,
  passwords: { api: string; worker: string },
): Promise<string> {
  const { rows } = await pool.query<{ db: string }>('select current_database() as db');
  const database = rows[0]!.db;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const s of rolesSql(database, names, passwords)) await client.query(s);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  return database;
}
