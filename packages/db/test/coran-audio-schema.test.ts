/**
 * Lot 27 — schéma de l'audio du Coran : récitateur (riwāya, étiquettes, licence, statut et retrait), piste,
 * état d'import, préférences et listes autorisées. Valeurs d'essai seulement (aucun fichier audio ici).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, resetTestDatabase, runMigrations, type DbHandle } from '../src/client.js';
import { API_GRANTS } from '../src/roles.js';

const URL = process.env.TEST_DATABASE_URL;

const RECITER = `insert into quran_reciter (id, name_ar, name_fr, riwaya, expected_verses, license_source,
  license_url, license_archived_on, license_text, credit) values ($1, 'اختبار', 'Essai', $2, $3,
  'Essai', 'https://exemple.invalid/licence', '2025-07-30', 'texte', 'crédit')`;

describe.skipIf(!URL)('schéma audio du Coran (lot 27)', () => {
  let h: DbHandle;
  beforeAll(async () => {
    h = connect(URL, 2);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
  });
  afterAll(async () => {
    await h?.close();
  });

  const fails = async (q: string, p: unknown[]) => {
    await expect(h.pool.query(q, p)).rejects.toThrow();
  };

  it('récitateur : riwāya connue, identifiant simple, compte de versets borné, en attente par défaut', async () => {
    await h.pool.query(RECITER, ['essai-hafs', 'hafs', 6236]);
    const r = await h.pool.query('select status from quran_reciter where id = $1', ['essai-hafs']);
    expect(r.rows[0].status).toBe('en_attente');
    await fails(RECITER, ['essai-x', 'inconnue', 6236]);
    await fails(RECITER, ['Essai Hafs', 'hafs', 6236]);
    await fails(RECITER, ['essai-y', 'qalun', 0]);
    await h.pool.query(RECITER, ['essai-qalun', 'qalun', 6214]);
  });

  it('retrait : date ET motif obligatoires ; étiquettes contrôlées', async () => {
    await fails("update quran_reciter set status = 'retire' where id = 'essai-hafs'", []);
    await fails(
      "update quran_reciter set status = 'retire', retired_at = now(), retired_reason = '' where id = 'essai-hafs'",
      [],
    );
    await h.pool.query(
      "update quran_reciter set status = 'retire', retired_at = now(), retired_reason = 'essai' where id = 'essai-qalun'",
    );
    await fails("update quran_reciter set speed = 'tres_vite' where id = 'essai-hafs'", []);
    await h.pool.query(
      "update quran_reciter set speed = 'lente', style = 'murattal' where id = 'essai-hafs'",
    );
  });

  it('piste : une par verset, durée et taille > 0, empreinte SHA-256, chemin relatif sans « .. »', async () => {
    const q = `insert into quran_track (reciter_id, sura, aya, path, duration_ms, bytes, sha256, format)
      values ('essai-hafs', $1, $2, $3, $4, $5, $6, 'mp3')`;
    const sha = 'a'.repeat(64);
    await h.pool.query(q, [1, 1, 'essai-hafs/001001-aaaa.mp3', 1000, 10, sha]);
    await fails(q, [1, 1, 'essai-hafs/autre.mp3', 1000, 10, sha]);
    await fails(q, [1, 2, 'x.mp3', 0, 10, sha]);
    await fails(q, [1, 3, 'x.mp3', 10, 0, sha]);
    await fails(q, [1, 4, 'x.mp3', 10, 10, 'zz']);
    await fails(q, [1, 5, '../x.mp3', 10, 10, sha]);
    await fails(q, [1, 6, '/srv/x.mp3', 10, 10, sha]);
    await fails(q, [115, 1, 'x.mp3', 10, 10, sha]);
  });

  it('état d’import : statut contrôlé, rapport gardé', async () => {
    const q = `insert into quran_audio_import (reciter_id, source_dir, pattern, status, report, started_at)
      values ('essai-hafs', '/tmp/x', 'SSSVVV.mp3', $1, '{}', now())`;
    await h.pool.query(q, ['bloque']);
    await fails(q, ['inconnu']);
  });

  it('droits de l’API : pistes et imports en lecture, récitateur modifiable (retrait), choix des familles', () => {
    expect(API_GRANTS.quran_track).toEqual(['SELECT']);
    expect(API_GRANTS.quran_audio_import).toEqual(['SELECT']);
    expect(API_GRANTS.quran_reciter).toEqual(['SELECT', 'UPDATE']);
    for (const x of [
      'profile_reciter_pref',
      'profile_reciter_rule',
      'class_reciter_rule',
      'relay_reciter',
    ])
      expect(API_GRANTS[x]).toBeDefined();
  });
});
