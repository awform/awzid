import { execFileSync } from 'node:child_process';
import type { Locator, Page } from '@playwright/test';

/**
 * Corrections du lecteur (06/10/2026) — VRAIES récitations de la démonstration dans les e2e (VM seulement) :
 * les récitateurs actifs de la démo et leurs pistes (tables quran_reciter et quran_track, quelques sourates)
 * sont copiés dans la base de TEST ; les fichiers audio sont lus dans le volume de l'API de la démo
 * (`docker exec … cat`, lecture seule) et servis au navigateur par interception. Sans Docker ni démo : sauté.
 */
const DB = process.env.E2E_DEMO_DB_CONTAINER ?? 'awform-db-1';
const API = process.env.E2E_DEMO_API_CONTAINER ?? 'awform-api-1';
const RECITER_COLS =
  'id, name_ar, name_fr, riwaya, speed, style, expected_verses, license_source, license_url, license_archived_on, license_text, credit, status, activated_at, credit_ar, usage_note';
const TRACK_COLS = 'reciter_id, sura, aya, path, duration_ms, bytes, sha256, format';

const demoPsql = (sql: string) =>
  execFileSync(
    'docker',
    ['exec', '-i', DB, 'sh', '-c', 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq'],
    {
      input: sql,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
export interface DemoReciter {
  id: string;
  riwaya: string;
}

/** Récitateurs actifs de la démo (null : démo absente → test sauté). */
export function demoReciters(): DemoReciter[] | null {
  if (!process.env.TEST_DATABASE_URL) return null;
  try {
    return demoPsql(
      "select '" +
        DEMO_PREFIX +
        "' || id || '|' || riwaya from quran_reciter where status = 'actif' and id not like 'essai-%' and id not like 'qf-%' and source <> 'qf' order by id;",
    )
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [id, riwaya] = l.split('|');
        return { id: id!, riwaya: riwaya! };
      });
  } catch {
    return null;
  }
}

/**
 * Préfixe des récitateurs copiés : ils trient APRÈS les récitateurs d'essai (le défaut des autres fichiers e2e,
 * lancés en parallèle sur la même base, ne change donc jamais) et ne portent pas l'identifiant du conseil débutant.
 */
export const DEMO_PREFIX = 'zz-';
const realId = (id: string) => (id.startsWith(DEMO_PREFIX) ? id.slice(DEMO_PREFIX.length) : id);

/**
 * Copies PARTAGÉES et COMPTÉES : chaque processus de test qui les utilise s'inscrit (table « e2e_demo_holder »
 * de la base de TEST, verrou consultatif) ; le dernier qui s'en va les supprime. Deux projets (mobile, bureau) et
 * plusieurs fichiers peuvent donc les utiliser en même temps sans se couper la lecture, et elles ne restent pas
 * dans la base pour les autres fichiers (vu le 11/10/2026 : lot27, liste d'un enfant restreinte par le parent,
 * polluée par les copies « zz- »). Seuls les ids « zz-… » sont supprimés (jamais un récitateur réel ni « qf- ») ;
 * pistes et préférences suivent (clés étrangères « on delete cascade »).
 */
const HOLDER = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
const LOCK = 'select pg_advisory_xact_lock(724242);';
const HOLDERS =
  'create table if not exists e2e_demo_holder (holder text primary key, at timestamptz not null default now());';
const testPsql = (script: string) =>
  execFileSync(
    'psql',
    [process.env.TEST_DATABASE_URL!, '-Atq', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    {
      input: script,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

/** Copie ces récitateurs (ids préfixés) et leurs pistes des sourates données dans la base de test (idempotent). */
export function installDemoReciters(ids: string[], suras: number[]) {
  const list = ids.map((x) => `'${realId(x).replace(/[^a-z0-9-]/g, '')}'`).join(',');
  const s = suras.map((n) => Math.trunc(n)).join(',');
  const recSel = RECITER_COLS.split(', ')
    .map((c) => (c === 'id' ? `'${DEMO_PREFIX}' || id` : c))
    .join(', ');
  const trSel = TRACK_COLS.split(', ')
    .map((c) => (c === 'reciter_id' ? `'${DEMO_PREFIX}' || reciter_id` : c))
    .join(', ');
  const rec = demoPsql(
    `\\copy (select ${recSel} from quran_reciter where id in (${list})) to stdout`,
  );
  const tr = demoPsql(
    `\\copy (select ${trSel} from quran_track where reciter_id in (${list}) and sura in (${s})) to stdout`,
  );
  const script = [
    'begin;',
    LOCK,
    HOLDERS,
    `insert into e2e_demo_holder (holder) values ('${HOLDER}') on conflict do nothing;`,
    `create temp table s_r as select ${RECITER_COLS} from quran_reciter with no data;`,
    `create temp table s_t as select ${TRACK_COLS} from quran_track with no data;`,
    `copy s_r (${RECITER_COLS}) from stdin;`,
    rec.replace(/\n$/, ''),
    '\\.',
    `copy s_t (${TRACK_COLS}) from stdin;`,
    tr.replace(/\n$/, ''),
    '\\.',
    `insert into quran_reciter (${RECITER_COLS}) select ${RECITER_COLS} from s_r on conflict do nothing;`,
    `insert into quran_track (${TRACK_COLS}) select ${TRACK_COLS} from s_t on conflict do nothing;`,
    'commit;',
    '',
  ].join('\n');
  testPsql(script);
}
/**
 * Ce processus n'utilise plus les copies ; s'il était le dernier, elles sont supprimées (ids « zz-… » seulement).
 * Idempotent ; les ids reçus ne servent pas (toutes les copies partent ensemble, quand plus personne ne lit).
 */
export function removeDemoReciters(_ids: string[]) {
  if (!process.env.TEST_DATABASE_URL) return;
  const zz = `'${DEMO_PREFIX.replace(/[^a-z0-9-]/g, '')}%'`;
  testPsql(
    [
      'begin;',
      LOCK,
      HOLDERS,
      `delete from e2e_demo_holder where holder = '${HOLDER}';`,
      `delete from quran_reciter where id like ${zz} and not exists (select 1 from e2e_demo_holder);`,
      'commit;',
      '',
    ].join('\n'),
  );
}

/**
 * Sert au navigateur les vrais fichiers de la démo et relève la clé (« récitateur/SSSVVV ») de chaque fichier
 * demandé, dans l'ordre.
 */
export async function serveDemoAudio(page: Page): Promise<string[]> {
  const asked: string[] = [];
  await page.route(/\/api\/v1\/quran\/audio\/file\/([a-z0-9-]+)\/([\w.-]+)$/, async (route) => {
    const m = /\/file\/([a-z0-9-]+)\/([\w.-]+)$/.exec(new URL(route.request().url()).pathname)!;
    const rid = realId(m[1]!);
    // F5 : le verset entendu jusqu'au bout est recopié dans le cache « réécouter hors ligne » (fetch, servi par le
    // cache HTTP dans un vrai navigateur) : servi ici aussi, mais ce n'est pas une LECTURE (seul l'élément audio,
    // type « media », en est une)
    if (route.request().resourceType() !== 'fetch')
      asked.push(`${rid.startsWith('essai-') ? '' : DEMO_PREFIX}${rid}/${m[2]!.slice(0, 6)}`);
    try {
      const body = execFileSync('docker', ['exec', API, 'cat', `/audio/${rid}/${m[2]}`], {
        maxBuffer: 64 * 1024 * 1024,
      });
      await route.fulfill({ status: 200, contentType: 'audio/mpeg', body });
    } catch {
      await route.fulfill({ status: 404, body: '' });
    }
  });
  return asked;
}
/**
 * Touche un verset comme le ferait un élève : sur une partie VISIBLE et non couverte (un long verset peut dépasser
 * l'écran ; le centre de sa boîte tombe alors sous la barre du lecteur ou l'en-tête, qu'un doigt ne toucherait pas).
 */
export async function tapVisible(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const pt = await target.evaluate((el) => {
    for (const r of Array.from(el.getClientRects())) {
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (r.width < 4 || y < 0 || y > innerHeight) continue;
      const hit = document.elementFromPoint(x, y);
      if (hit && el.contains(hit)) return { x, y };
    }
    return null;
  });
  if (pt) await page.mouse.click(pt.x, pt.y);
  else await target.click();
}
export const fileKey = (id: string, s: number, a: number) =>
  `${id}/${String(s).padStart(3, '0')}${String(a).padStart(3, '0')}`;
