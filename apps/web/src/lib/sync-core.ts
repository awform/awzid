/**
 * Synchronisation DIFFÉRÉE et SANS CONFLIT des événements d'apprentissage (CDC §2.15, ARCHITECTURE_V2 §3.2) :
 *  - chaque action est un événement IMMUABLE, identifié par un UUIDv7 créé sur l'appareil, rangé tout de
 *    suite dans IndexedDB (rien ne se perd en cas de coupure de réseau ou d'électricité) ;
 *  - l'envoi se fait par petits lots, dans l'ordre, dès que le réseau revient (page ou service worker) ;
 *  - le serveur ignore un doublon et RECALCULE les états : il n'y a jamais de conflit à résoudre à la main ;
 *  - lot F1 (revue E5) : un événement refusé par le serveur n'est plus jamais jeté. Il quitte la file (pour
 *    ne pas bloquer les suivants) et est MIS DE CÔTÉ sur l'appareil avec le motif du refus ; il est renvoyé
 *    automatiquement (au plus une fois par heure, 5 fois), puis reste visible dans « Mes téléchargements »
 *    où l'on peut le renvoyer ou le signaler (résumé sans contenu). Chaque événement porte l'édition du
 *    contenu affiché (`edition`) et la version de son format (`v`) : le serveur accepte une réponse donnée
 *    sur une édition antérieure ;
 *  - un lot refusé en bloc (erreur du serveur, audit OFF-2) est coupé en deux jusqu'à isoler l'événement
 *    fautif : les autres partent, lui est réessayé, puis mis en QUARANTAINE (gardé à part, jamais perdu)
 *    après 3 cycles en échec. Serveur indisponible (429, 502-504) : on attend, sans rien écarter.
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
  /** code de l'édition du contenu affiché (lot F1) */
  edition?: string;
  /** version du format de l'événement (lot F1 : 2 ; absent = 1) */
  v?: number;
}

/** Version du format des événements écrits par cette version de l'application. */
export const EVENT_FORMAT = 2;

/** Événement refusé par le serveur, gardé de côté sur l'appareil (lot F1). */
export interface SetAside {
  ev: AttemptEvent;
  reason: string;
  code?: string;
  tries: number;
  firstAt: string;
  lastTry: string;
  /** résumé envoyé au serveur (« Signaler ») */
  reported?: boolean;
}

export interface FlushResult {
  sent: number;
  rejected: number;
  remaining: number;
  progress: Record<
    string,
    { status: string; score: number | null; bestScore: number | null; revised?: string[] }
  >;
  offline: boolean;
  /** le serveur demande une connexion : la file reste sur l'appareil */
  unauthenticated?: boolean;
  /** événements mis en quarantaine pendant cet envoi (audit OFF-2) */
  quarantined: number;
  /** événements refusés gardés de côté sur l'appareil (total après cet envoi, lot F1) */
  setAside: number;
}

export const BATCH = 100;
/** échecs isolés d'un même événement avant sa mise en quarantaine */
export const QUARANTINE_AFTER = 3;
const FAILS = 'syncFailures';
const QUARANTINE = 'syncQuarantine';
const ASIDE = 'syncSetAside';
/** nouvel essai automatique d'un événement mis de côté : au plus une fois par heure, 5 fois */
export const ASIDE_RETRY_MS = 3_600_000;
export const ASIDE_MAX_TRIES = 5;
const UNAVAILABLE = new Set([429, 502, 503, 504]);
/**
 * Refus qui ne tiennent pas aux événements (audit OFF-4) : droits (403, second facteur…), service absent
 * (404, aucune édition publiée) — la file ATTEND, rien n'est mis en quarantaine.
 */
const NOT_THE_EVENTS = new Set([403, 404]);
const POST = { 'content-type': 'application/json', 'x-awform': '1' };

/** Événements écartés de la file après des échecs répétés (diagnostic, envoi manuel plus tard). */
export async function quarantined(): Promise<AttemptEvent[]> {
  return (await kvGet<AttemptEvent[]>(QUARANTINE).catch(() => undefined)) ?? [];
}

/** Événements refusés par le serveur et gardés sur l'appareil (lot F1). */
export async function setAside(): Promise<SetAside[]> {
  return (await kvGet<SetAside[]>(ASIDE).catch(() => undefined)) ?? [];
}

async function putAside(list: Array<{ ev: AttemptEvent; reason: string; code?: string }>) {
  if (!list.length) return;
  const now = new Date().toISOString();
  const cur = await setAside();
  for (const x of list) {
    const old = cur.find((s) => s.ev.id === x.ev.id);
    if (old)
      Object.assign(old, { reason: x.reason, code: x.code, tries: old.tries + 1, lastTry: now });
    else cur.push({ ...x, tries: 1, firstAt: now, lastTry: now });
  }
  // borne de sécurité (stockage de l'appareil) : les 1 000 plus récents
  await kvSet(ASIDE, cur.slice(-1000));
}

async function dropAside(ids: readonly string[]) {
  if (!ids.length) return;
  const set = new Set(ids);
  await kvSet(
    ASIDE,
    (await setAside()).filter((s) => !set.has(s.ev.id)),
  );
}

/** Échec d'un événement seul : réessayé au prochain cycle, en quarantaine au 3e. Vrai si écarté. */
async function failedAlone(e: AttemptEvent): Promise<boolean> {
  const fails = (await kvGet<Record<string, number>>(FAILS)) ?? {};
  const n = (fails[e.id] ?? 0) + 1;
  if (n < QUARANTINE_AFTER) {
    fails[e.id] = n;
    await kvSet(FAILS, fails);
    return false;
  }
  delete fails[e.id];
  await kvSet(FAILS, fails);
  await kvSet(QUARANTINE, [...(await quarantined()), e].slice(-200));
  await delMany('events', [e.id]);
  return true;
}

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
  const full: AttemptEvent = {
    ...ev,
    id: uuidv7(),
    deviceAt: new Date().toISOString(),
    v: EVENT_FORMAT,
  };
  await putMany('events', [full]);
  return full;
}

export function pendingCount(): Promise<number> {
  return count('events');
}

/**
 * Renvoie les événements mis de côté dont le délai est passé (tous si `force`) : acceptés ou doublons →
 * retirés ; refusés de nouveau → gardés (essai compté). Renvoie le nombre encore de côté.
 */
export async function retrySetAside(
  fetchFn: typeof fetch = fetch,
  base = '',
  force = false,
): Promise<number> {
  const now = Date.now();
  const due = (await setAside()).filter(
    (s) =>
      force || (s.tries < ASIDE_MAX_TRIES && now - new Date(s.lastTry).getTime() >= ASIDE_RETRY_MS),
  );
  for (let i = 0; i < due.length; i += BATCH) {
    const batch = due.slice(i, i + BATCH);
    let body: {
      accepted: Array<{ id: string }>;
      duplicates: string[];
      rejected: Array<{ id: string; reason?: string; code?: string }>;
    };
    try {
      const r = await fetchFn(`${base}/api/v1/attempts`, {
        method: 'POST',
        headers: POST,
        credentials: 'same-origin',
        body: JSON.stringify({ events: batch.map((s) => s.ev) }),
      });
      if (!r.ok || (r.headers.get('content-type') ?? '').includes('text/html')) break;
      body = (await r.json()) as typeof body;
    } catch {
      break;
    }
    await dropAside([...body.accepted.map((a) => a.id), ...body.duplicates]);
    await putAside(
      body.rejected.flatMap((x) => {
        const s = batch.find((b) => b.ev.id === x.id);
        return s ? [{ ev: s.ev, reason: x.reason ?? s.reason, code: x.code }] : [];
      }),
    );
  }
  return (await setAside()).length;
}

/**
 * « Signaler » : résumé des refus (nombre, motifs, édition) envoyé au serveur — jamais le contenu des
 * réponses ni le profil. Les événements restent sur l'appareil.
 */
export async function reportSetAside(fetchFn: typeof fetch = fetch, base = ''): Promise<boolean> {
  const list = await setAside();
  if (!list.length) return false;
  const reasons: Record<string, number> = {};
  for (const s of list) {
    const k = s.reason.slice(0, 80);
    reasons[k] = (reasons[k] ?? 0) + 1;
  }
  try {
    const r = await fetchFn(`${base}/api/v1/sync/rejets`, {
      method: 'POST',
      headers: POST,
      credentials: 'same-origin',
      body: JSON.stringify({
        count: list.length,
        reasons: Object.fromEntries(Object.entries(reasons).slice(0, 10)),
        ...(list.at(-1)?.ev.edition ? { edition: list.at(-1)!.ev.edition } : {}),
      }),
    });
    if (!r.ok) return false;
  } catch {
    return false;
  }
  await kvSet(
    ASIDE,
    list.map((s) => ({ ...s, reported: true })),
  );
  return true;
}

let running: Promise<FlushResult> | null = null;

/** Envoie la file (lots de BATCH, ordre chronologique). Un seul envoi à la fois par contexte. */
export function flushQueue(fetchFn: typeof fetch = fetch, base = ''): Promise<FlushResult> {
  if (running) return running;
  running = (async () => {
    const res: FlushResult = {
      sent: 0,
      rejected: 0,
      remaining: 0,
      progress: {},
      offline: false,
      quarantined: 0,
      setAside: 0,
    };
    // événements fautifs isolés pendant ce cycle : laissés dans la file, pas renvoyés tout de suite
    const skip = new Set<string>();
    let size = BATCH;
    try {
      for (;;) {
        const all = (await getAll<AttemptEvent>('events'))
          .filter((e) => !skip.has(e.id))
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        if (all.length === 0) break;
        const batch = all.slice(0, size);
        let r: Response;
        try {
          r = await fetchFn(`${base}/api/v1/attempts`, {
            method: 'POST',
            // en-tête anti-CSRF exigé par l'API pour toute écriture ; cookie de session de même origine
            headers: POST,
            credentials: 'same-origin',
            body: JSON.stringify({ events: batch }),
          });
        } catch {
          res.offline = true;
          break;
        }
        if (r.status === 401) {
          res.unauthenticated = true; // reconnexion nécessaire : la file est gardée
          break;
        }
        if (!r.ok) {
          if (UNAVAILABLE.has(r.status) || NOT_THE_EVENTS.has(r.status)) break; // tout est gardé
          // lot refusé en bloc : on le coupe en deux jusqu'à isoler l'événement fautif (audit OFF-2)
          if (batch.length > 1) {
            size = Math.ceil(batch.length / 2);
            continue;
          }
          const lone = batch[0]!;
          if (await failedAlone(lone)) res.quarantined++;
          else skip.add(lone.id);
          continue;
        }
        size = Math.min(BATCH, size * 2);
        // portail captif (Wi-Fi à page de connexion) : une page HTML au lieu de la réponse attendue —
        // traité comme « hors ligne » (audit OFF-4), jamais comme une réponse
        if ((r.headers.get('content-type') ?? '').includes('text/html')) {
          res.offline = true;
          break;
        }
        let body: {
          accepted: Array<{ id: string }>;
          duplicates: string[];
          rejected: Array<{ id: string; reason?: string; code?: string }>;
          progress?: FlushResult['progress'];
        };
        try {
          body = (await r.json()) as typeof body;
        } catch {
          res.offline = true;
          break;
        }
        // réponses d'un AUTRE compte de l'appareil (audit OFF-3) : gardées pour lui, jamais effacées
        const foreign = body.rejected.filter((x) => x.code === 'autre_compte');
        for (const x of foreign) skip.add(x.id);
        // identifiant déjà pris ailleurs (audit OFF-7) : l'événement repart sous un NOUVEL identifiant
        const clash = body.rejected.filter((x) => x.code === 'conflit_identifiant');
        if (clash.length) {
          const byId = new Map(batch.map((e) => [e.id, e]));
          const fresh = clash
            .map((x) => byId.get(x.id))
            .filter((e): e is AttemptEvent => !!e)
            .map((e) => ({ ...e, id: uuidv7() }));
          await putMany('events', fresh);
          await delMany(
            'events',
            clash.map((x) => x.id),
          );
        }
        const rejected = body.rejected.filter(
          (x) => x.code !== 'autre_compte' && x.code !== 'conflit_identifiant',
        );
        // lot F1 : refusés → mis de côté (jamais jetés), avec le motif du serveur
        const byId = new Map(batch.map((e) => [e.id, e]));
        await putAside(
          rejected.flatMap((x) => {
            const ev = byId.get(x.id);
            return ev ? [{ ev, reason: x.reason ?? '', code: x.code }] : [];
          }),
        );
        const done = [
          ...body.accepted.map((a) => a.id),
          ...body.duplicates,
          ...rejected.map((x) => x.id),
        ];
        res.sent += body.accepted.length + body.duplicates.length;
        res.rejected += rejected.length;
        Object.assign(res.progress, body.progress ?? {});
        if (done.length === 0) {
          if (foreign.length || clash.length) continue;
          break;
        }
        await delMany('events', done);
        await kvSet('lastSync', new Date().toISOString());
      }
      // nouvel essai des événements mis de côté dont le délai est passé (réseau présent)
      if (!res.offline && !res.unauthenticated) await retrySetAside(fetchFn, base);
    } finally {
      res.remaining = await count('events');
      res.setAside = (await setAside()).length;
      running = null;
    }
    return res;
  })();
  return running;
}

export async function lastSync(): Promise<string | undefined> {
  return kvGet<string>('lastSync');
}
