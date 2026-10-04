/**
 * Relais d'école — copie locale de l'audio du Coran (lot 27). Le central donne la liste des fichiers des
 * récitateurs choisis par l'école (GET /api/v1/relais/quran-audio, jeton du relais) ; le relais télécharge
 * ce qui manque (empreinte SHA-256 et taille vérifiées, écriture atomique), et EFFACE tout ce qui n'est plus
 * dans la liste (récitateur retiré : coupure propagée à l'école). Les fichiers sont servis sur le Wi-Fi, avec
 * ou sans Internet, en lecture partielle (Range).
 */
import { createHash } from 'node:crypto';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';

/** chemin relatif d'un fichier audio : « récitateur/SSSVVV-empreinte.ext » */
export const AUDIO_PATH = /^[a-z0-9]+(-[a-z0-9]+)*\/[0-9]{6}-[0-9a-f]{16}\.(mp3|wav|ogg|opus|m4a)$/;
const MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
};

export interface AudioListing {
  reciters: Array<{
    id: string;
    files: Array<{ path: string; url: string; bytes: number; sha256: string }>;
  }>;
}

export interface AudioSyncResult {
  telecharges: number;
  effaces: number;
  erreurs: number;
  fichiers: number;
  octets: number;
}

export class AudioCache {
  constructor(readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  file(rel: string): string | null {
    if (!AUDIO_PATH.test(rel)) return null;
    const f = join(this.dir, rel);
    return existsSync(f) ? f : null;
  }

  stats(): { fichiers: number; octets: number } {
    let fichiers = 0;
    let octets = 0;
    for (const r of existsSync(this.dir) ? readdirSync(this.dir) : []) {
      const d = join(this.dir, r);
      if (!statSync(d).isDirectory()) continue;
      for (const f of readdirSync(d)) {
        if (f.endsWith('.part')) continue;
        fichiers++;
        octets += statSync(join(d, f)).size;
      }
    }
    return { fichiers, octets };
  }

  /** Aligne la copie sur la liste du central (téléchargements, effacements). */
  async sync(
    upstream: string,
    token: string,
    o: { timeoutMs?: number } = {},
  ): Promise<AudioSyncResult> {
    const res: AudioSyncResult = { telecharges: 0, effaces: 0, erreurs: 0, fichiers: 0, octets: 0 };
    const r = await fetch(`${upstream}/api/v1/relais/quran-audio`, {
      headers: { 'x-relais-jeton': token },
      signal: AbortSignal.timeout(o.timeoutMs ?? 30_000),
    });
    if (!r.ok) throw new Error(`liste audio : HTTP ${r.status}`);
    const list = (await r.json()) as AudioListing;
    const wanted = new Map<string, { url: string; bytes: number; sha256: string }>();
    for (const rec of list.reciters)
      for (const f of rec.files) if (AUDIO_PATH.test(f.path)) wanted.set(f.path, f);

    // 1. effacer ce qui n'est plus demandé (récitateur retiré ou retiré du choix de l'école)
    for (const rec of readdirSync(this.dir)) {
      const d = join(this.dir, rec);
      if (!statSync(d).isDirectory()) continue;
      for (const f of readdirSync(d)) {
        if (!wanted.has(`${rec}/${f}`)) {
          rmSync(join(d, f), { force: true });
          if (!f.endsWith('.part')) res.effaces++;
        }
      }
      if (readdirSync(d).length === 0) rmSync(d, { recursive: true, force: true });
    }

    // 2. télécharger ce qui manque (ou dont la taille diffère)
    for (const [rel, f] of wanted) {
      const dest = join(this.dir, rel);
      if (existsSync(dest) && statSync(dest).size === f.bytes) continue;
      try {
        const g = await fetch(`${upstream}${f.url}`, {
          signal: AbortSignal.timeout(o.timeoutMs ?? 120_000),
        });
        if (!g.ok) throw new Error(`HTTP ${g.status}`);
        const buf = Buffer.from(await g.arrayBuffer());
        const sha = createHash('sha256').update(buf).digest('hex');
        if (buf.length !== f.bytes || sha !== f.sha256) throw new Error('empreinte différente');
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(`${dest}.part`, buf);
        renameSync(`${dest}.part`, dest);
        res.telecharges++;
      } catch {
        res.erreurs++;
      }
    }
    const s = this.stats();
    res.fichiers = s.fichiers;
    res.octets = s.octets;
    return res;
  }
}

/** Envoi d'un fichier de la copie : lecture partielle (Range), 416, ETag faible sur la taille. */
export function serveAudio(req: FastifyRequest, reply: FastifyReply, file: string) {
  const size = statSync(file).size;
  const ext = file.split('.').pop() ?? '';
  reply
    .header('Accept-Ranges', 'bytes')
    .header('Content-Type', MIME[ext] ?? 'application/octet-stream')
    .header('Cache-Control', 'public, max-age=86400')
    .header('x-awform-relais', 'copie-audio');
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    let start = -1;
    let end = size - 1;
    if (m && (m[1] || m[2])) {
      if (!m[1]) start = Math.max(0, size - Number(m[2]));
      else {
        start = Number(m[1]);
        if (m[2]) end = Math.min(Number(m[2]), size - 1);
      }
    }
    if (start < 0 || start > end || start >= size)
      return reply.code(416).header('Content-Range', `bytes */${size}`).send();
    return reply
      .code(206)
      .header('Content-Range', `bytes ${start}-${end}/${size}`)
      .header('Content-Length', String(end - start + 1))
      .send(createReadStream(file, { start, end }));
  }
  return reply.header('Content-Length', String(size)).send(createReadStream(file));
}
