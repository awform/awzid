/**
 * Synchronisation DIFFÉRÉE et SANS CONFLIT des événements d'apprentissage (CDC §2.15, ARCHITECTURE_V2 §3.2) :
 *  - chaque action est un événement IMMUABLE, identifié par un UUIDv7 créé sur l'appareil, rangé tout de
 *    suite dans IndexedDB (rien ne se perd en cas de coupure de réseau ou d'électricité) ;
 *  - l'envoi se fait par petits lots, dans l'ordre, dès que le réseau revient (page ou service worker) ;
 *  - le serveur ignore un doublon et RECALCULE les états : il n'y a jamais de conflit à résoudre à la main ;
 *  - un événement refusé définitivement (empreinte périmée, profil inconnu) est retiré de la file et
 *    compté, pour ne pas bloquer les suivants.
 * Ce module n'utilise que fetch + IndexedDB : il tourne dans la page ET dans le service worker.
 */
import { count, delMany, getAll, kvGet, kvSet, putMany } from './idb';

export interface AttemptEvent {
  id: string;
  profileId: string;
  unitId: string;
  /** « hifz » : événement du carnet de hifẓ (réponse = jour, part, résultat, source) */
  eventType: 'reponse' | 'checklist' | 'hifz' | 'trace' | 'carte';
  exerciseId?: string;
  exerciseHash?: string;
  itemIndex?: number;
  response: unknown;
  deviceAt: string;
}

export interface FlushResult {
  sent: number;
  rejected: number;
  remaining: number;
  progress: Record<string, { status: string; score: number | null; bestScore: number | null }>;
  offline: boolean;
  /** le serveur demande une connexion : la file reste sur l'appareil */
  unauthenticated?: boolean;
}

export const BATCH = 100;

/** UUID version 7 (horodatage en millisecondes + aléa cryptographique), RFC 9562. */
export function uuidv7(now = Date.now()): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  let ts = now;
  for (let i = 5; i >= 0; i--) {
    b[i] = ts & 0xff;
    ts = Math.floor(ts / 256);
  }
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x70;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export async function queueEvent(ev: Omit<AttemptEvent, 'id' | 'deviceAt'>): Promise<AttemptEvent> {
  const full: AttemptEvent = { ...ev, id: uuidv7(), deviceAt: new Date().toISOString() };
  await putMany('events', [full]);
  return full;
}

export function pendingCount(): Promise<number> {
  return count('events');
}

let running: Promise<FlushResult> | null = null;

/** Envoie la file (lots de BATCH, ordre chronologique). Un seul envoi à la fois par contexte. */
export function flushQueue(fetchFn: typeof fetch = fetch, base = ''): Promise<FlushResult> {
  if (running) return running;
  running = (async () => {
    const res: FlushResult = { sent: 0, rejected: 0, remaining: 0, progress: {}, offline: false };
    try {
      for (;;) {
        const all = (await getAll<AttemptEvent>('events')).sort((a, b) =>
          a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
        );
        if (all.length === 0) break;
        const batch = all.slice(0, BATCH);
        let r: Response;
        try {
          r = await fetchFn(`${base}/api/v1/attempts`, {
            method: 'POST',
            // en-tête anti-CSRF exigé par l'API pour toute écriture ; cookie de session de même origine
            headers: { 'content-type': 'application/json', 'x-awform': '1' },
            credentials: 'same-origin',
            body: JSON.stringify({ events: batch }),
          });
        } catch {
          res.offline = true;
          break;
        }
        if (r.status === 401) res.unauthenticated = true; // reconnexion nécessaire : la file est gardée
        if (!r.ok) break;
        const body = (await r.json()) as {
          accepted: Array<{ id: string }>;
          duplicates: string[];
          rejected: Array<{ id: string }>;
          progress?: FlushResult['progress'];
        };
        const done = [
          ...body.accepted.map((a) => a.id),
          ...body.duplicates,
          ...body.rejected.map((x) => x.id),
        ];
        res.sent += body.accepted.length + body.duplicates.length;
        res.rejected += body.rejected.length;
        Object.assign(res.progress, body.progress ?? {});
        if (done.length === 0) break;
        await delMany('events', done);
        await kvSet('lastSync', new Date().toISOString());
      }
    } finally {
      res.remaining = await count('events');
      running = null;
    }
    return res;
  })();
  return running;
}

export async function lastSync(): Promise<string | undefined> {
  return kvGet<string>('lastSync');
}
