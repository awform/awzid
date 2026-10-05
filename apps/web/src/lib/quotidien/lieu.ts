/**
 * A12 — lieu effectif (ville de la liste intégrée, ou position de l'appareil) et géolocalisation SUR ACCORD.
 * La position lue par le navigateur est arrondie (≈ 100 m) puis gardée sur l'appareil ; elle n'est jamais
 * envoyée (aucun appel réseau ici ; contrôlé par l'e2e a12.spec.ts qui surveille toutes les requêtes).
 */
import { t } from '$lib/i18n';
import { round3, type Place } from './reglages';
import { cityById, type CountryCode } from './villes';

export interface ResolvedPlace {
  label: string;
  lat: number;
  lng: number;
  tz: string;
  country: CountryCode | null;
}

export function placeOf(p: Place | null): ResolvedPlace | null {
  if (!p) return null;
  if (p.kind === 'ville') {
    const c = cityById(p.id);
    return c ? { label: c.name, lat: c.lat, lng: c.lng, tz: c.tz, country: c.country } : null;
  }
  return { label: t('qt.lieu_appareil'), lat: p.lat, lng: p.lng, tz: p.tz, country: null };
}

export const deviceTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export type GeoError = 'refus' | 'indisponible' | 'delai' | 'absent';

/** Demande la position (le navigateur affiche sa propre autorisation) ; à n'appeler que sur un geste. */
export function askPosition(): Promise<Place> {
  return new Promise((resolve, reject: (e: GeoError) => void) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return reject('absent');
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          kind: 'appareil',
          lat: round3(pos.coords.latitude),
          lng: round3(pos.coords.longitude),
          tz: deviceTimeZone(),
        }),
      (err) => reject(err.code === 1 ? 'refus' : err.code === 3 ? 'delai' : 'indisponible'),
      { enableHighAccuracy: false, maximumAge: 10 * 60_000, timeout: 20_000 },
    );
  });
}
