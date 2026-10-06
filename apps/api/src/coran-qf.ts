/**
 * Chantier A2 — écoute EN LIGNE des récitateurs de Quran Foundation (QF).
 *
 * Le serveur demande à l'API de contenu de QF (jeton OAuth2 « client_credentials », scope « content ») les
 * adresses des fichiers d'une sourate, verset par verset (/recitations/{id}/by_chapter/{sourate}) ; le jeton
 * et les identifiants ne quittent JAMAIS le serveur. L'appareil lit ensuite chaque fichier directement sur le
 * réseau de diffusion de QF (adresses contrôlées : hôtes connus, https, extension audio).
 *
 * Conditions QF (Developer Terms, mise à jour du 04/10/2026, lues le 06/10/2026 — SOURCES_MUSHAF.md § 8) :
 *  - réponses gardées AU PLUS 24 h, en mémoire seulement (règle : pas plus d'une semaine hors Content Sync) ;
 *  - aucun fichier audio gardé chez nous ni sur l'appareil (« audio URLs are distinct from the underlying
 *    recordings ») : pas de paquet hors ligne, pas de relais d'école ;
 *  - adresses servies seulement aux comptes connectés de l'application (pas d'API ouverte : pas de
 *    redistribution « as data ») ; crédit de QF affiché avec chaque récitateur.
 * Sans QF_CLIENT_ID / QF_CLIENT_SECRET : fonction INACTIVE, sans erreur (récitateurs QF non proposés).
 * Essais automatiques (AWFORM_AUDIO_ESSAI=on et QF_ENV=essai) : API QF SIMULÉE dans le processus (aucun
 * réseau), fichiers = bips non coraniques du récitateur d'essai.
 */
import { and, asc, eq } from 'drizzle-orm';
import { HAFS_SURA_VERSES, schema as t, type Db, type QfEnv } from '@awform/db';

export const QF_ENDPOINTS: Record<QfEnv, { oauth: string; api: string }> = {
  prelive: {
    oauth: 'https://prelive-oauth2.quran.foundation/oauth2/token',
    api: 'https://apis-prelive.quran.foundation',
  },
  production: {
    oauth: 'https://oauth2.quran.foundation/oauth2/token',
    api: 'https://apis.quran.foundation',
  },
  // jamais contacté : réponses simulées (essaiFetch)
  essai: { oauth: 'https://qf-essai.invalid/oauth2/token', api: 'https://qf-essai.invalid' },
};
/** base des adresses RELATIVES renvoyées par QF (exemple de la documentation : verses.quran.foundation) */
export const QF_AUDIO_BASE = 'https://verses.quran.foundation/';
/** hôtes de diffusion acceptés (mêmes hôtes dans media-src de la politique de sécurité du site) */
export const QF_AUDIO_HOSTS: readonly string[] = [
  'verses.quran.foundation',
  'verses.quran.com',
  'audio.qurancdn.com',
  'mirrors.quranicaudio.com',
  'download.quranicaudio.com',
];
/** durée de garde des réponses de QF (mémoire) : 24 h ≤ 7 jours permis hors Content Sync */
export const QF_CACHE_MS = 24 * 3600_000;
export const QF_CACHE_LIMIT_MS = 7 * 24 * 3600_000;
const CACHE_MAX_ENTRIES = 400;
const PER_PAGE = 50;
const ESSAI_PREFIX = '/api/v1/quran/audio/file/';

export interface QfConfig {
  env: QfEnv;
  clientId: string;
  clientSecret: string;
}

/**
 * Réglage lu dans l'environnement du service api (fichier de secrets du déploiement : prod.env → api.env).
 * null : fonction inactive (pas d'identifiants, environnement inconnu, ou simulation hors essais).
 */
export function qfConfigFromEnv(env: NodeJS.ProcessEnv, essai: boolean): QfConfig | null {
  const e = (env.QF_ENV ?? 'prelive').trim();
  if (e === 'essai')
    return essai ? { env: 'essai', clientId: 'essai', clientSecret: 'essai' } : null;
  if (e !== 'prelive' && e !== 'production') return null;
  const clientId = (env.QF_CLIENT_ID ?? '').trim();
  const clientSecret = (env.QF_CLIENT_SECRET ?? '').trim();
  if (!clientId || !clientSecret) return null;
  return { env: e, clientId, clientSecret };
}

/** Adresse d'un fichier renvoyée par QF → adresse https sur un hôte connu, ou null (refusée). */
export function qfAudioUrl(raw: unknown, essai = false): string | null {
  if (typeof raw !== 'string' || !raw || raw.length > 500) return null;
  if (essai && raw.startsWith(ESSAI_PREFIX))
    return /^[\w./-]+$/.test(raw) && !raw.includes('..') ? raw : null;
  let u: URL;
  try {
    if (raw.startsWith('//')) u = new URL(`https:${raw}`);
    else if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) u = new URL(raw);
    else u = new URL(raw.replace(/^\/+/, ''), QF_AUDIO_BASE);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash)
    return null;
  if (!QF_AUDIO_HOSTS.includes(u.hostname)) return null;
  if (!/\.(mp3|ogg|opus|m4a)$/i.test(u.pathname)) return null;
  return u.toString();
}

export type QfErrorCode = 'qf_indisponible' | 'qf_refus' | 'qf_incomplet' | 'sourate_absente';
export class QfError extends Error {
  constructor(
    readonly code: QfErrorCode,
    message: string = code,
  ) {
    super(message);
  }
}

export interface QfTrack {
  aya: number;
  url: string;
  durationMs: number;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

interface AudioFilesPage {
  audio_files?: Array<{ verse_key?: unknown; url?: unknown; duration?: unknown }>;
  pagination?: { next_page?: number | null };
}

/** Client de l'API audio de QF : jeton en mémoire, réponses gardées 24 h, une seule requête à la fois par sourate. */
export class QfAudioClient {
  private tok: { value: string; until: number } | null = null;
  private tokPending: Promise<string> | null = null;
  private readonly cache = new Map<string, { until: number; tracks: QfTrack[] }>();
  private readonly pending = new Map<string, Promise<QfTrack[]>>();
  /** appels réseau faits (contrôle du cache dans les tests) */
  calls = 0;

  constructor(
    readonly cfg: QfConfig,
    private readonly fetchImpl: FetchLike = (u, i) => fetch(u, i),
    private readonly now: () => number = Date.now,
  ) {}

  private async token(force = false): Promise<string> {
    if (!force && this.tok && this.tok.until > this.now()) return this.tok.value;
    this.tokPending ??= (async () => {
      this.calls++;
      let r: Response;
      try {
        r = await this.fetchImpl(QF_ENDPOINTS[this.cfg.env].oauth, {
          method: 'POST',
          headers: {
            authorization: `Basic ${Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString('base64')}`,
            'content-type': 'application/x-www-form-urlencoded',
            accept: 'application/json',
          },
          body: 'grant_type=client_credentials&scope=content',
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new QfError('qf_indisponible', 'jeton : réseau');
      }
      if (!r.ok)
        throw new QfError(
          r.status >= 500 || r.status === 429 ? 'qf_indisponible' : 'qf_refus',
          `jeton : HTTP ${r.status}`,
        );
      const j = (await r.json().catch(() => ({}))) as {
        access_token?: unknown;
        expires_in?: unknown;
      };
      if (typeof j.access_token !== 'string' || !j.access_token)
        throw new QfError('qf_refus', 'jeton absent');
      const life = typeof j.expires_in === 'number' && j.expires_in > 0 ? j.expires_in : 3600;
      // marge d'une minute (au moins 30 s de vie)
      this.tok = { value: j.access_token, until: this.now() + Math.max(30, life - 60) * 1000 };
      return j.access_token;
    })().finally(() => {
      this.tokPending = null;
    });
    return this.tokPending;
  }

  private async get(path: string): Promise<unknown> {
    const url = `${QF_ENDPOINTS[this.cfg.env].api}/content/api/v4${path}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const tok = await this.token(attempt > 0);
      this.calls++;
      let r: Response;
      try {
        r = await this.fetchImpl(url, {
          headers: {
            'x-auth-token': tok,
            'x-client-id': this.cfg.clientId,
            accept: 'application/json',
          },
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new QfError('qf_indisponible', 'réseau');
      }
      // jeton expiré ou révoqué : un nouveau jeton, une seule fois
      if (r.status === 401 && attempt === 0) {
        this.tok = null;
        continue;
      }
      if (r.status === 404) throw new QfError('sourate_absente');
      if (!r.ok)
        throw new QfError(
          r.status >= 500 || r.status === 429 ? 'qf_indisponible' : 'qf_refus',
          `HTTP ${r.status}`,
        );
      return r.json();
    }
    throw new QfError('qf_refus', 'jeton refusé');
  }

  /** Fichiers d'une sourate, verset par verset (1…n, comptes de Ḥafṣ), gardés 24 h. */
  async suraTracks(recitationId: number, sura: number): Promise<QfTrack[]> {
    const key = `${this.cfg.env}:${recitationId}:${sura}`;
    const hit = this.cache.get(key);
    if (hit && hit.until > this.now()) return hit.tracks;
    if (hit) this.cache.delete(key);
    const p = this.pending.get(key);
    if (p) return p;
    const run = this.fetchSura(recitationId, sura)
      .then((tracks) => {
        this.cache.set(key, { until: this.now() + QF_CACHE_MS, tracks });
        while (this.cache.size > CACHE_MAX_ENTRIES)
          this.cache.delete(this.cache.keys().next().value!);
        return tracks;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, run);
    return run;
  }

  private async fetchSura(recitationId: number, sura: number): Promise<QfTrack[]> {
    const n = HAFS_SURA_VERSES[sura - 1];
    if (!n) throw new QfError('sourate_absente');
    const byAya = new Map<number, QfTrack>();
    const essai = this.cfg.env === 'essai';
    let page = 1;
    for (let guard = 0; guard < 20; guard++) {
      const j = (await this.get(
        `/recitations/${recitationId}/by_chapter/${sura}?per_page=${PER_PAGE}&page=${page}&fields=duration`,
      )) as AudioFilesPage;
      for (const f of j.audio_files ?? []) {
        const m =
          typeof f.verse_key === 'string' ? /^(\d{1,3}):(\d{1,3})$/.exec(f.verse_key) : null;
        if (!m || Number(m[1]) !== sura)
          throw new QfError('qf_incomplet', `clé ${String(f.verse_key)}`);
        const aya = Number(m[2]);
        const url = qfAudioUrl(f.url, essai);
        if (!url) throw new QfError('qf_incomplet', `adresse refusée (${aya})`);
        // durée : secondes (champ « duration » quand QF le donne), sinon inconnue (0)
        const d =
          typeof f.duration === 'number' && f.duration > 0 ? Math.round(f.duration * 1000) : 0;
        byAya.set(aya, { aya, url, durationMs: d });
      }
      const next = j.pagination?.next_page;
      if (!next || next <= page) break;
      page = next;
    }
    if (byAya.size === 0) throw new QfError('sourate_absente');
    // exactement les versets 1…n du texte de Ḥafṣ (sinon : rien, plutôt qu'un verset décalé)
    if (byAya.size !== n || [...byAya.keys()].some((a) => a < 1 || a > n))
      throw new QfError('qf_incomplet', `${byAya.size}/${n} versets`);
    return [...byAya.values()].sort((a, b) => a.aya - b.aya);
  }
}

/**
 * API QF SIMULÉE (essais automatiques seulement) : jeton factice et fichiers = bips du récitateur d'essai
 * « essai-hafs » déjà servis par l'API (adresses du même site). Pagination comme QF (per_page).
 */
export function essaiFetch(db: Db, sourceReciter = 'essai-hafs'): FetchLike {
  return async (url) => {
    const json = (o: unknown, status = 200) =>
      new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
    if (url === QF_ENDPOINTS.essai.oauth) return json({ access_token: 'essai', expires_in: 3600 });
    const m = /\/recitations\/(\d+)\/by_chapter\/(\d+)\?per_page=(\d+)&page=(\d+)/.exec(url);
    if (!m) return json({ message: 'introuvable' }, 404);
    const sura = Number(m[2]);
    const per = Number(m[3]);
    const page = Number(m[4]);
    const rows = await db
      .select({ aya: t.quranTrack.aya, path: t.quranTrack.path })
      .from(t.quranTrack)
      .where(and(eq(t.quranTrack.reciterId, sourceReciter), eq(t.quranTrack.sura, sura)))
      .orderBy(asc(t.quranTrack.aya));
    const files = rows.filter((r) => r.aya > 0);
    if (!files.length) return json({ message: 'introuvable' }, 404);
    const slice = files.slice((page - 1) * per, page * per);
    const pages = Math.ceil(files.length / per);
    return json({
      audio_files: slice.map((r) => ({
        verse_key: `${sura}:${r.aya}`,
        url: `${ESSAI_PREFIX}${r.path}`,
      })),
      pagination: {
        per_page: per,
        current_page: page,
        next_page: page < pages ? page + 1 : null,
        total_pages: pages,
        total_records: files.length,
      },
    });
  };
}
