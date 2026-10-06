/**
 * Chantier A2 — client de l'audio EN LIGNE de Quran Foundation, avec une API QF SIMULÉE (aucun réseau) :
 * réglage (inactif sans identifiants), adresses acceptées, jeton gardé et renouvelé, pagination, contrôle
 * des versets, cache ≤ 24 h (conditions : ≤ 7 jours), erreurs ; catalogue des récitateurs.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HAFS_SURA_VERSES, QF_CATALOGUE, qfRecitationId, QF_ESSAI_RECITER } from '@awform/db';
import {
  QF_AUDIO_BASE,
  QF_AUDIO_HOSTS,
  QF_CACHE_LIMIT_MS,
  QF_CACHE_MS,
  QF_ENDPOINTS,
  QfAudioClient,
  qfAudioUrl,
  qfConfigFromEnv,
  QfError,
  type FetchLike,
} from '../src/coran-qf.js';

const CFG = { env: 'prelive' as const, clientId: 'client-essai', clientSecret: 'secret-essai' };

/** Fausse API QF : jeton, puis fichiers d'une sourate (adresses relatives comme QF), paginés. */
function fakeQf(
  o: {
    verses?: (sura: number) => number;
    url?: (sura: number, aya: number) => string;
    status?: number;
    tokenLife?: number;
    expireFirstToken?: boolean;
  } = {},
) {
  const log: Array<{ url: string; headers: Record<string, string>; body?: string }> = [];
  let tokens = 0;
  const f: FetchLike = async (url, init) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    log.push({ url, headers, body: init?.body as string | undefined });
    const json = (b: unknown, status = 200) =>
      new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
    if (url === QF_ENDPOINTS.prelive.oauth) {
      tokens++;
      return json({
        access_token: `jeton-${tokens}`,
        expires_in: o.tokenLife ?? 3600,
        token_type: 'bearer',
      });
    }
    if (o.expireFirstToken && headers['x-auth-token'] === 'jeton-1')
      return json({ message: 'x' }, 401);
    if (o.status) return json({ message: 'x' }, o.status);
    const m =
      /\/content\/api\/v4\/recitations\/(\d+)\/by_chapter\/(\d+)\?per_page=(\d+)&page=(\d+)/.exec(
        url,
      );
    if (!m) return json({ message: 'introuvable' }, 404);
    const sura = Number(m[2]);
    const per = Number(m[3]);
    const page = Number(m[4]);
    const n = o.verses ? o.verses(sura) : HAFS_SURA_VERSES[sura - 1]!;
    const all = Array.from({ length: n }, (_, i) => i + 1);
    const slice = all.slice((page - 1) * per, page * per);
    const pages = Math.ceil(n / per);
    return json({
      audio_files: slice.map((a) => ({
        verse_key: `${sura}:${a}`,
        url: o.url
          ? o.url(sura, a)
          : `Husary/mp3/${String(sura).padStart(3, '0')}${String(a).padStart(3, '0')}.mp3`,
      })),
      pagination: { per_page: per, current_page: page, next_page: page < pages ? page + 1 : null },
    });
  };
  return { f, log, tokens: () => tokens };
}

describe('A2 : réglage de l’audio en ligne de Quran Foundation', () => {
  it('inactif sans identifiants, sans erreur ; prélancement par défaut ; simulation seulement en essai', () => {
    expect(qfConfigFromEnv({}, false)).toBeNull();
    expect(qfConfigFromEnv({ QF_CLIENT_ID: 'x' }, false)).toBeNull();
    expect(qfConfigFromEnv({ QF_CLIENT_ID: ' x ', QF_CLIENT_SECRET: 'y' }, false)).toEqual({
      env: 'prelive',
      clientId: 'x',
      clientSecret: 'y',
    });
    expect(
      qfConfigFromEnv({ QF_CLIENT_ID: 'x', QF_CLIENT_SECRET: 'y', QF_ENV: 'production' }, false)
        ?.env,
    ).toBe('production');
    expect(
      qfConfigFromEnv({ QF_CLIENT_ID: 'x', QF_CLIENT_SECRET: 'y', QF_ENV: 'autre' }, false),
    ).toBeNull();
    expect(qfConfigFromEnv({ QF_ENV: 'essai' }, false)).toBeNull();
    expect(qfConfigFromEnv({ QF_ENV: 'essai' }, true)?.env).toBe('essai');
  });

  it('garde des réponses : 24 h, sous la limite d’une semaine des conditions', () => {
    expect(QF_CACHE_MS).toBe(24 * 3600_000);
    expect(QF_CACHE_MS).toBeLessThanOrEqual(QF_CACHE_LIMIT_MS);
  });
});

describe('A2 : adresses des fichiers renvoyées par QF', () => {
  it('relative, sans protocole ou https sur un hôte connu → https ; le reste est refusé', () => {
    expect(QF_AUDIO_BASE).toBe('https://verses.quran.foundation/');
    expect(qfAudioUrl('Alafasy/mp3/001001.mp3')).toBe(
      'https://verses.quran.foundation/Alafasy/mp3/001001.mp3',
    );
    expect(qfAudioUrl('//mirrors.quranicaudio.com/everyayah/Husary_64kbps/002251.mp3')).toBe(
      'https://mirrors.quranicaudio.com/everyayah/Husary_64kbps/002251.mp3',
    );
    expect(
      qfAudioUrl('https://download.quranicaudio.com/qdc/abu_bakr_shatri/murattal/1.mp3'),
    ).toMatch(/^https:\/\/download\.quranicaudio\.com\//);
    for (const bad of [
      'http://verses.quran.foundation/a/001001.mp3',
      'https://exemple.org/001001.mp3',
      'https://verses.quran.foundation.exemple.org/001001.mp3',
      'javascript:alert(1)',
      'data:audio/mpeg;base64,AAAA',
      'https://u:p@verses.quran.foundation/a.mp3',
      'https://verses.quran.foundation:8443/a.mp3',
      'https://verses.quran.foundation/a.mp3?x=1',
      'Alafasy/mp3/001001.html',
      '',
      42,
      null,
    ])
      expect(qfAudioUrl(bad), String(bad)).toBeNull();
    // essais : adresses du même site (bips), seulement en mode essai
    expect(
      qfAudioUrl('/api/v1/quran/audio/file/essai-hafs/001001-0123456789abcdef.wav', true),
    ).toBe('/api/v1/quran/audio/file/essai-hafs/001001-0123456789abcdef.wav');
    expect(qfAudioUrl('/api/v1/quran/audio/file/essai-hafs/001001.wav')).toBeNull();
    expect(qfAudioUrl('/api/v1/quran/audio/file/../../etc/passwd', true)).toBeNull();
  });

  it('hôtes acceptés = hôtes permis par la politique de sécurité du site (media-src)', () => {
    const cfg = readFileSync(
      join(import.meta.dirname, '..', '..', 'web', 'svelte.config.js'),
      'utf8',
    );
    const media = /'media-src': \[([^\]]*)\]/.exec(cfg)![1]!;
    const hosts = [...media.matchAll(/'https:\/\/([^']+)'/g)].map((m) => m[1]);
    expect(hosts).toEqual([...QF_AUDIO_HOSTS]);
  });
});

describe('A2 : client de l’API audio de QF (simulée)', () => {
  it('jeton client_credentials (Basic, scope content), en-têtes x-auth-token et x-client-id', async () => {
    const q = fakeQf();
    const c = new QfAudioClient(CFG, q.f);
    const tr = await c.suraTracks(6, 1);
    expect(tr.map((x) => x.aya)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(tr[0]!.url).toBe('https://verses.quran.foundation/Husary/mp3/001001.mp3');
    const [tok, call] = q.log;
    expect(tok!.url).toBe('https://prelive-oauth2.quran.foundation/oauth2/token');
    expect(tok!.headers.authorization).toBe(
      `Basic ${Buffer.from('client-essai:secret-essai').toString('base64')}`,
    );
    expect(tok!.body).toBe('grant_type=client_credentials&scope=content');
    expect(call!.url).toBe(
      'https://apis-prelive.quran.foundation/content/api/v4/recitations/6/by_chapter/1?per_page=50&page=1&fields=duration',
    );
    expect(call!.headers).toMatchObject({
      'x-auth-token': 'jeton-1',
      'x-client-id': 'client-essai',
    });
    // le secret ne part jamais vers l'API de contenu
    expect(JSON.stringify(call)).not.toContain('secret-essai');
  });

  it('pagination : al-Baqara (286 versets) en 6 pages, versets 1…286 dans l’ordre', async () => {
    const q = fakeQf();
    const c = new QfAudioClient(CFG, q.f);
    const tr = await c.suraTracks(7, 2);
    expect(tr).toHaveLength(286);
    expect(tr.every((x, i) => x.aya === i + 1)).toBe(true);
    expect(q.log.filter((l) => l.url.includes('by_chapter')).length).toBe(6);
  });

  it('cache : une seule requête par sourate pendant 24 h, une seule à la fois ; renouvelé après', async () => {
    let now = 1_000_000;
    const q = fakeQf();
    const c = new QfAudioClient(CFG, q.f, () => now);
    const [a, b] = await Promise.all([c.suraTracks(7, 1), c.suraTracks(7, 1)]);
    expect(a).toBe(b);
    await c.suraTracks(7, 1);
    const n = q.log.length;
    now += QF_CACHE_MS - 1000;
    await c.suraTracks(7, 1);
    expect(q.log.length).toBe(n);
    now += 2000;
    await c.suraTracks(7, 1);
    expect(q.log.length).toBeGreaterThan(n);
    // jeton renouvelé seulement à son expiration (marge d'une minute)
    expect(q.tokens()).toBe(2);
  });

  it('jeton refusé (401) : un nouveau jeton, une seule fois', async () => {
    const q = fakeQf({ expireFirstToken: true });
    const c = new QfAudioClient(CFG, q.f);
    expect(await c.suraTracks(7, 1)).toHaveLength(7);
    expect(q.tokens()).toBe(2);
  });

  it('refus : verset manquant ou en trop, adresse inconnue, sourate absente, service indisponible', async () => {
    const code = async (p: Promise<unknown>) => {
      try {
        await p;
        return 'ok';
      } catch (e) {
        expect(e).toBeInstanceOf(QfError);
        return (e as QfError).code;
      }
    };
    expect(await code(new QfAudioClient(CFG, fakeQf({ verses: () => 6 }).f).suraTracks(7, 1))).toBe(
      'qf_incomplet',
    );
    expect(await code(new QfAudioClient(CFG, fakeQf({ verses: () => 8 }).f).suraTracks(7, 1))).toBe(
      'qf_incomplet',
    );
    expect(
      await code(
        new QfAudioClient(CFG, fakeQf({ url: () => 'https://exemple.org/a.mp3' }).f).suraTracks(
          7,
          1,
        ),
      ),
    ).toBe('qf_incomplet');
    expect(await code(new QfAudioClient(CFG, fakeQf({ verses: () => 0 }).f).suraTracks(7, 1))).toBe(
      'sourate_absente',
    );
    expect(await code(new QfAudioClient(CFG, fakeQf({ status: 404 }).f).suraTracks(7, 1))).toBe(
      'sourate_absente',
    );
    expect(await code(new QfAudioClient(CFG, fakeQf({ status: 503 }).f).suraTracks(7, 1))).toBe(
      'qf_indisponible',
    );
    expect(await code(new QfAudioClient(CFG, fakeQf({ status: 403 }).f).suraTracks(7, 1))).toBe(
      'qf_refus',
    );
    const down: FetchLike = async () => {
      throw new Error('réseau');
    };
    expect(await code(new QfAudioClient(CFG, down).suraTracks(7, 1))).toBe('qf_indisponible');
    // une erreur n'est pas gardée : la requête suivante réessaie
    let fail = true;
    const ok = fakeQf();
    const flaky: FetchLike = async (u, i) => {
      if (fail && u.includes('by_chapter')) return new Response('{}', { status: 502 });
      return ok.f(u, i);
    };
    const c = new QfAudioClient(CFG, flaky);
    expect(await code(c.suraTracks(7, 1))).toBe('qf_indisponible');
    fail = false;
    expect(await c.suraTracks(7, 1)).toHaveLength(7);
  });
});

describe('A2 : catalogue des récitateurs en ligne', () => {
  it('Ḥafṣ, identifiants uniques, prélancement = al-Ḥuṣarī (6) et al-ʿAfāsī (7) seulement', () => {
    const ids = QF_CATALOGUE.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^qf-[a-z0-9-]+$/.test(id))).toBe(true);
    expect(QF_CATALOGUE.every((m) => m.riwaya === 'hafs' && m.expectedVerses === 6236)).toBe(true);
    expect(QF_CATALOGUE.every((m) => m.nameAr && m.credit.includes('Quran Foundation'))).toBe(true);
    expect(
      QF_CATALOGUE.filter((m) => m.qf.prelive !== null).map((m) => [m.id, m.qf.prelive]),
    ).toEqual([
      ['qf-husary', 6],
      ['qf-afasy', 7],
    ]);
    const prod = QF_CATALOGUE.map((m) => m.qf.production).filter((x) => x !== null);
    expect(new Set(prod).size).toBe(prod.length);
    expect(qfRecitationId('qf-afasy', 'production')).toBe(7);
    expect(qfRecitationId('qf-sudais', 'prelive')).toBeNull();
    expect(qfRecitationId('qf-sudais', 'production')).toBe(3);
    // essais : seulement le récitateur d'essai (bips), jamais un vrai récitateur
    expect(qfRecitationId('qf-afasy', 'essai')).toBeNull();
    expect(qfRecitationId(QF_ESSAI_RECITER, 'essai')).toBe(7);
    expect(qfRecitationId(QF_ESSAI_RECITER, 'prelive')).toBeNull();
  });
});
