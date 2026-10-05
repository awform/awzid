/**
 * A34 — chargement du Muṣḥaf « à l'identique » sur l'appareil.
 *  - état (`/api/v1/quran/mushaf-exact`) : disponible ? version, crédit ;
 *  - lignes d'une page : à la demande, gardées hors ligne (Cache API « awzid-mushaf-exact ») pour les SEULES pages
 *    consultées ; revalidées en ligne au-delà de 7 jours (conditions QF : copie tenue à jour chaque semaine quand
 *    la connexion le permet) ; données retirées par le serveur → copie de l'appareil effacée ;
 *  - police de la page (QCF_Pnnn du Complexe, fichier TTF tel quel) : à la demande, gardée hors ligne, puis
 *    déclarée au navigateur (FontFace) sous le nom de la page.
 */
import { BSML_FONT_FILE, pageFontFile, type ExactPage } from './mushaf-exact';

export const EXACT_API = '/api/v1/quran/mushaf-exact';
export const PAGES_CACHE = 'awzid-mushaf-exact';
export const FONTS_CACHE = 'awzid-mushaf-exact-polices';
const WEEK_MS = 7 * 24 * 3600 * 1000;
const RECU = 'x-awzid-recu';

export interface ExactState {
  disponible: boolean;
  version?: string;
  credit?: string;
  enRetard?: boolean;
}

const hasCaches = () => typeof caches !== 'undefined';

/** État du service ; hors ligne : « disponible » si des pages sont déjà gardées sur l'appareil. */
export async function exactState(fetchImpl: typeof fetch = fetch): Promise<ExactState> {
  try {
    const r = await fetchImpl(EXACT_API, { credentials: 'same-origin' });
    if (!r.ok) throw new Error(String(r.status));
    const s = (await r.json()) as ExactState;
    // retiré côté serveur (ressource QF supprimée, compte inactif) : rien ne reste sur l'appareil
    if (!s.disponible && hasCaches()) await caches.delete(PAGES_CACHE);
    return s;
  } catch {
    if (!hasCaches()) return { disponible: false };
    const c = await caches.open(PAGES_CACHE);
    return { disponible: (await c.keys()).length > 0 };
  }
}

const pageUrl = (p: number) => `${EXACT_API}/pages/${p}`;

/**
 * Lignes d'une page : copie de l'appareil si elle a moins de 7 jours et la même version, sinon réseau (puis
 * gardée) ; sans réseau, la copie gardée sert quel que soit son âge.
 */
export async function loadExactPage(
  p: number,
  version: string | undefined,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<ExactPage | null> {
  const c = hasCaches() ? await caches.open(PAGES_CACHE) : null;
  const hit = c ? await c.match(pageUrl(p)) : undefined;
  const fresh =
    hit &&
    now() - Number(hit.headers.get(RECU) ?? 0) < WEEK_MS &&
    (!version || hit.headers.get('x-awzid-version') === version);
  if (hit && fresh) return (await hit.json()) as ExactPage;
  try {
    const r = await fetchImpl(pageUrl(p), { credentials: 'same-origin' });
    if (r.status === 404 || r.status === 401) {
      if (r.status === 404 && c) await c.delete(pageUrl(p));
      return null;
    }
    if (!r.ok) throw new Error(String(r.status));
    const body = await r.text();
    if (c)
      await c.put(
        pageUrl(p),
        new Response(body, {
          headers: {
            'content-type': 'application/json',
            [RECU]: String(now()),
            'x-awzid-version': version ?? '',
          },
        }),
      );
    return JSON.parse(body) as ExactPage;
  } catch {
    return hit ? ((await hit.json()) as ExactPage) : null;
  }
}

/** Nom de famille CSS de la police d'une page (ou « QCF_BSML »). */
export const fontFamily = (file: string) => file.replace(/\.ttf$/, '');

const loaded = new Map<string, Promise<boolean>>();

/** Charge (cache d'abord) et déclare une police du Complexe ; vrai si elle est prête. */
export function loadFont(file: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const known = loaded.get(file);
  if (known) return known;
  const job = (async () => {
    if (typeof FontFace === 'undefined' || typeof document === 'undefined') return false;
    const url = `${EXACT_API}/polices/${file}`;
    const c = hasCaches() ? await caches.open(FONTS_CACHE) : null;
    let r = c ? await c.match(url) : undefined;
    if (!r) {
      const net = await fetchImpl(url);
      if (!net.ok) return false;
      if (c) await c.put(url, net.clone());
      r = net;
    }
    const face = new FontFace(fontFamily(file), await r.arrayBuffer());
    await face.load();
    document.fonts.add(face);
    return true;
  })().catch(() => false);
  loaded.set(file, job);
  job.then((ok) => ok || loaded.delete(file));
  return job;
}

export const loadPageFont = (p: number, f?: typeof fetch) => loadFont(pageFontFile(p), f);
export const loadBsmlFont = (f?: typeof fetch) => loadFont(BSML_FONT_FILE, f);
