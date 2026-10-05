/**
 * Lot F2 — REPRISE SANS PERTE des données d'avant les migrations 0034-0037 : la base est d'abord migrée jusqu'à
 * 0033 (dossier de migrations tronqué), remplie comme avant F2 (enseignants, classes à nom d'école libre, élèves
 * papier et inscrits, tutelles, licence d'école), puis migrée jusqu'au bout. Tout doit être retrouvé, rattaché.
 */
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
  connect,
  MIGRATIONS_DIR,
  resetTestDatabase,
  runMigrations,
  type DbHandle,
} from '../src/client.js';
import { profileKindFromYear } from '@awform/content';
import { refreshProfileKinds } from '../src/responsables.js';

const URL = process.env.TEST_DATABASE_URL;

/** copie du dossier de migrations arrêtée à la migration `last` (incluse) */
function truncated(last: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'f2-migr-'));
  cpSync(MIGRATIONS_DIR, dir, { recursive: true });
  const jp = join(dir, 'meta', '_journal.json');
  const j = JSON.parse(readFileSync(jp, 'utf8')) as { entries: Array<{ idx: number }> };
  j.entries = j.entries.filter((e) => e.idx <= last);
  writeFileSync(jp, JSON.stringify(j));
  return dir;
}

describe.skipIf(!URL)('lot F2 — reprise des données d’avant F2 (awform_test)', () => {
  let h: DbHandle;
  const q = async <T = Record<string, unknown>>(s: string, p: unknown[] = []) =>
    (await h.pool.query(s, p)).rows as T[];
  const id = (n: number) => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;

  beforeAll(async () => {
    h = connect(URL, 2);
    await resetTestDatabase(h.pool);
    await migrate(drizzle(h.pool), { migrationsFolder: truncated(33) });
    // ---- données « d'avant » (SQL brut : le schéma TypeScript est déjà celui de F2)
    await q(
      `insert into level (code, track, rank) values ('en1','enfants',1), ('re1','religion',1)`,
    );
    await q(
      `insert into account (id, kind, email, country, created_at) values
        ($1,'enseignant','prof@a.example','SN', now() - interval '400 days'),
        ($2,'enseignant','prof2@a.example','SN', now()),
        ($3,'parent','parent@a.example','FR', now()),
        ($4,'adulte','adulte@a.example','FR', now()),
        ($5,'admin','admin@a.example','FR', now()),
        ($6,'enseignant','sans-classe@a.example','SN', now())`,
      [id(1), id(2), id(3), id(4), id(5), id(6)],
    );
    await q(
      `insert into class_group (id, teacher_account_id, name, join_code, school_name, place, school_year, level_code) values
        ($1,$4,'CP','AAAA1111','École Al-Falah','Dakar','2026-2027','en1'),
        ($2,$4,'CE1','AAAA2222',null,null,null,'re1'),
        ($3,$5,'Hifz','AAAA3333','  ','Thiès','2025/26',null)`,
      [id(11), id(12), id(13), id(1), id(2)],
    );
    await q(
      `insert into profile (id, owner_account_id, kind, pseudonym, birth_year, level_code) values
        ($1,$3,'enfant','Awa',${new Date().getUTCFullYear() - 9},'en1'),
        ($2,$4,'adulte','Samir',1990,'re1')`,
      [id(21), id(22), id(3), id(4)],
    );
    await q(
      `insert into guardianship (parent_account_id, profile_id, consent_at) values ($1,$2,now())`,
      [id(3), id(21)],
    );
    await q(`insert into class_member (class_id, profile_id) values ($1,$2)`, [id(11), id(21)]);
    await q(
      `insert into class_pupil (id, class_id, profile_id, display_name) values
        ($1,$4,$5,'Awa'), ($2,$4,null,'Moussa S.'), ($3,$6,null,'Fatou N.')`,
      [id(31), id(32), id(33), id(11), id(21), id(13)],
    );
    await q(
      `insert into paper_result (pupil_id, level_code, item, score, max, day) values ($1,'en1','examen',15,20,'2026-06-01')`,
      [id(32)],
    );
    await q(
      `insert into subscription (account_id, plan_code, status, provider, seats, current_period_start) values ($1,'licence_ecole','active','simule',30,now())`,
      [id(1)],
    );
    await runMigrations(h.db);
  });
  afterAll(async () => h?.close());

  it('écoles personnelles : une par établissement nommé, classes sans nom rattachées, enseignant sans classe', async () => {
    const s = await q<{
      name: string;
      created_by: string;
      place: string | null;
      personal: boolean;
    }>('select name, created_by, place, personal from school order by name');
    expect(s.map((x) => `${x.name}|${x.created_by}`).sort()).toEqual(
      [
        `École Al-Falah|${id(1)}`,
        `École personnelle|${id(2)}`,
        `École personnelle|${id(6)}`,
      ].sort(),
    );
    expect(s.every((x) => x.personal)).toBe(true);
    // CE1 (sans nom) rejoint l'école nommée de son enseignant
    const cls = await q<{ id: string; school: string }>(
      'select c.id, s.name as school from class_group c join school s on s.id = c.school_id order by c.name',
    );
    expect(Object.fromEntries(cls.map((c) => [c.id, c.school]))).toEqual({
      [id(11)]: 'École Al-Falah',
      [id(12)]: 'École Al-Falah',
      [id(13)]: 'École personnelle',
    });
    const m = await q<{ account_id: string; role: string }>(
      'select account_id, role from school_member order by account_id, role',
    );
    expect(m).toHaveLength(6); // 3 enseignants × (direction, enseignant)
    const ct = await q('select class_id, account_id, role from class_teacher');
    expect(ct).toHaveLength(3);
    expect(ct.every((r) => r.role === 'titulaire')).toBe(true);
  });

  it('rien n’est perdu : élèves, notes, membres, tutelle ; licence portée par l’école', async () => {
    expect(await q('select * from class_pupil')).toHaveLength(3);
    expect(await q('select * from paper_result')).toHaveLength(1);
    expect(await q('select * from class_member')).toHaveLength(1);
    const lic = await q<{ name: string }>(
      'select s.name from subscription x join school s on s.id = x.school_id',
    );
    expect(lic).toEqual([{ name: 'École Al-Falah' }]);
    const cu = await q('select * from profile_custodian');
    expect(cu).toEqual([
      expect.objectContaining({
        profile_id: id(21),
        account_id: id(3),
        nature: 'parent',
        status: 'actif',
      }),
    ]);
  });

  it('niveaux par matière, années scolaires, inscriptions datées', async () => {
    const pl = await q<{
      profile_id: string;
      subject_code: string;
      level_code: string;
      source: string;
    }>(
      'select profile_id, subject_code, level_code, source from profile_level order by profile_id',
    );
    expect(pl).toEqual([
      { profile_id: id(21), subject_code: 'arabe', level_code: 'en1', source: 'reprise' },
      { profile_id: id(22), subject_code: 'sciences', level_code: 're1', source: 'reprise' },
    ]);
    const y = await q<{ label: string; school: string }>(
      'select y.label, s.name as school from school_year y join school s on s.id = y.school_id order by y.label',
    );
    expect(y.map((x) => x.label)).toContain('2026-2027');
    expect(y.map((x) => x.label)).toContain('2025-2026'); // « 2025/26 » lu
    expect(await q('select * from class_group where school_year_id is null')).toHaveLength(0);
    const e = await q('select * from enrolment');
    expect(e).toHaveLength(3);
    expect(e.every((r) => r.outcome === 'en_cours')).toBe(true);
    const subj = await q<{ code: string; subject_code: string }>(
      'select code, subject_code from level order by code',
    );
    expect(subj).toEqual([
      { code: 'en1', subject_code: 'arabe' },
      { code: 're1', subject_code: 'sciences' },
    ]);
  });

  it('rôles : le type ne décrit plus que le titulaire ; parent, élève adulte, admin en rôles', async () => {
    const r = await q<{ email: string; role: string }>(
      'select a.email, r.role from account_role r join account a on a.id = r.account_id order by a.email',
    );
    expect(r).toEqual([
      { email: 'admin@a.example', role: 'admin' },
      { email: 'adulte@a.example', role: 'eleve_adulte' },
      { email: 'parent@a.example', role: 'parent' },
    ]);
    const k = await q<{ data_type: string }>(
      `select data_type from information_schema.columns where table_name = 'account' and column_name = 'kind'`,
    );
    expect(k[0]!.data_type).toBe('text');
  });

  it('clé du titulaire en RESTRICT : un compte d’enseignant titulaire ne s’efface pas sans transfert', async () => {
    await expect(q('delete from account where id = $1', [id(2)])).rejects.toThrow(/class_group/);
  });

  it('E4 : type enfant / ado / adulte recalculé depuis l’année (âge au plus bas de l’année)', async () => {
    const y = new Date().getUTCFullYear();
    expect(profileKindFromYear(y - 13)).toBe('enfant');
    expect(profileKindFromYear(y - 14)).toBe('ado');
    expect(profileKindFromYear(y - 19)).toBe('adulte');
    await q(`update profile set birth_year = $1 where id = $2`, [y - 15, id(21)]);
    const n = await refreshProfileKinds(h.db, [{ id: id(21), kind: 'enfant', birthYear: y - 15 }]);
    expect(n).toBe(1);
    expect(
      (await q<{ kind: string }>('select kind from profile where id = $1', [id(21)]))[0]!.kind,
    ).toBe('ado');
  });
});
