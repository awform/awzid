/**
 * Envoi des tentatives (lot 2) : chaque réponse devient un événement immuable identifié par un UUIDv7
 * généré sur l'appareil ; file d'attente conservée localement et renvoyée tant que le serveur n'a pas
 * répondu (le serveur ignore les doublons). Le hors ligne complet (IndexedDB, synchronisation en arrière-plan)
 * arrive au lot 3. Tant que les comptes n'existent pas (lot 4), seuls les profils FICTIFS de démonstration
 * sont utilisés, et seulement si l'API de développement est active.
 */
export interface AttemptEvent {
  id: string;
  profileId: string;
  unitId: string;
  eventType: 'reponse' | 'checklist';
  exerciseId?: string;
  exerciseHash?: string;
  itemIndex?: number;
  response: unknown;
  deviceAt: string;
}

const QUEUE_KEY = 'awform.attempts.queue';

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

let memory: AttemptEvent[] = [];
let flushing = false;

function readQueue(): AttemptEvent[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as AttemptEvent[]) : memory;
  } catch {
    return memory; // stockage indisponible : la file reste en mémoire pour cette page
  }
}
function writeQueue(q: AttemptEvent[]) {
  memory = q.slice(-2000);
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(memory));
  } catch {
    /* mémoire seulement */
  }
}

export type ProgressListener = (
  unitId: string,
  progress: { status: string; score: number | null; bestScore: number | null },
) => void;
const listeners = new Set<ProgressListener>();
export function onProgress(fn: ProgressListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function enqueue(ev: Omit<AttemptEvent, 'id' | 'deviceAt'>): AttemptEvent {
  const full: AttemptEvent = { ...ev, id: uuidv7(), deviceAt: new Date().toISOString() };
  writeQueue([...readQueue(), full]);
  void flush();
  return full;
}

export async function flush(): Promise<void> {
  if (flushing) return;
  const q = readQueue();
  if (q.length === 0) return;
  flushing = true;
  let sent = false;
  try {
    const r = await fetch('/api/v1/attempts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events: q.slice(0, 200) }),
    });
    if (r.ok) {
      const body = (await r.json()) as {
        accepted: Array<{ id: string }>;
        duplicates: string[];
        rejected: Array<{ id: string }>;
        progress: Record<
          string,
          { status: string; score: number | null; bestScore: number | null }
        >;
      };
      const done = new Set([
        ...body.accepted.map((a) => a.id),
        ...body.duplicates,
        ...body.rejected.map((x) => x.id),
      ]);
      writeQueue(readQueue().filter((e) => !done.has(e.id)));
      sent = done.size > 0;
      for (const [unitId, p] of Object.entries(body.progress ?? {}))
        listeners.forEach((fn) => fn(unitId, p));
    }
  } catch {
    /* hors ligne : on réessaiera au prochain envoi */
  } finally {
    flushing = false;
  }
  // des réponses ont pu arriver pendant l'envoi : on les envoie à leur tour
  if (sent && readQueue().length) setTimeout(() => void flush(), 0);
}

export interface DevProfile {
  id: string;
  kind: 'enfant' | 'adulte';
  pseudonym: string;
}

/** Profil fictif de démonstration adapté au niveau (en* → enfant, sinon adulte), s'il existe. */
export async function demoProfileFor(level: string): Promise<DevProfile | null> {
  try {
    const r = await fetch('/api/v1/dev/profiles');
    if (!r.ok) return null;
    const { profiles } = (await r.json()) as { profiles: DevProfile[] };
    return profiles.find((p) => p.kind === (level.startsWith('en') ? 'enfant' : 'adulte')) ?? null;
  } catch {
    return null;
  }
}
