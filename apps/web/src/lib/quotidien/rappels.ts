/**
 * A12 — rappels doux des prières (DÉSACTIVÉS par défaut, sur accord explicite) : notification locale silencieuse
 * (aucun son imposé) à l'heure calculée sur l'appareil.
 * Limite de la plateforme web : sans serveur, une application web ne peut pas programmer une notification pour
 * plus tard une fois fermée (l'API « Notification Triggers » n'existe pas dans les navigateurs) ; et un envoi par
 * le serveur exigerait d'y envoyer la position, ce que l'on refuse. Les rappels fonctionnent donc tant que
 * l'application (ou son onglet) est ouverte, même en arrière-plan ; c'est dit à l'utilisateur.
 */
import { t } from '$lib/i18n';
import { placeOf } from './lieu';
import {
  civilDay,
  computeDay,
  fmtTime,
  loadAdhan,
  nextDay,
  nextPrayer,
  settingsOf,
} from './priere';
import { defaultMethod, readPrefs } from './reglages';

let timer: ReturnType<typeof setTimeout> | null = null;

export type PermissionResult = 'ok' | 'refuse' | 'non_pris_en_charge';

export async function askPermission(): Promise<PermissionResult> {
  if (typeof Notification === 'undefined') return 'non_pris_en_charge';
  if (Notification.permission === 'granted') return 'ok';
  if (Notification.permission === 'denied') return 'refuse';
  return (await Notification.requestPermission()) === 'granted' ? 'ok' : 'refuse';
}

export function stopReminders(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}

async function notify(title: string, body: string): Promise<void> {
  const opts: NotificationOptions = {
    body,
    silent: true,
    tag: 'awzid-priere',
    icon: '/icon.svg',
    data: { url: '/quotidien' },
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return await reg.showNotification(title, opts);
  } catch {
    /* repli ci-dessous */
  }
  new Notification(title, opts);
}

/** Programme le prochain rappel (puis le suivant, après chaque rappel) ; sans effet si désactivé. */
export async function startReminders(): Promise<void> {
  stopReminders();
  const prefs = readPrefs();
  const place = placeOf(prefs.place);
  if (!prefs.reminders || !place) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const method = prefs.method ?? defaultMethod(place.country);
  if (!method) return;
  const A = await loadAdhan();
  const s = settingsOf({ ...prefs, method });
  const now = new Date();
  const day = civilDay(now, place.tz);
  const next = nextPrayer(
    now,
    computeDay(A, place.lat, place.lng, day, s),
    computeDay(A, place.lat, place.lng, nextDay(day), s),
  );
  if (!next) return;
  // les minuteries longues dérivent (veille) : on se recale au plus tard toutes les 30 minutes
  const wait = next.at.getTime() - now.getTime();
  timer = setTimeout(
    () => {
      if (wait <= 30 * 60_000)
        void notify(
          t('qt.rappel_titre', { priere: t(`qt.p_${next.key}`) }),
          t('qt.rappel_texte', { heure: fmtTime(next.at, place.tz), lieu: place.label }),
        );
      void startReminders();
    },
    Math.min(Math.max(wait, 1000), 30 * 60_000),
  );
}
