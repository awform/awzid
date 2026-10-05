/**
 * A12 — qibla : direction initiale du grand cercle (orthodromie) vers la Kaʿba, en degrés depuis le nord vrai,
 * dans le sens des aiguilles d'une montre ; distance par la formule de haversine. Calcul local, sans réseau.
 * Valeurs contrôlées contre api.aladhan.com/v1/qibla le 05/10/2026 (test qibla.test.ts).
 */
export const KAABA = { lat: 21.4225, lng: 39.8262 } as const;
const R = 6371.0088; // rayon moyen de la Terre (km)
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function qiblaBearing(lat: number, lng: number): number {
  const φ1 = rad(lat);
  const φ2 = rad(KAABA.lat);
  const Δλ = rad(KAABA.lng - lng);
  const y = Math.sin(Δλ);
  const x = Math.cos(φ1) * Math.tan(φ2) - Math.sin(φ1) * Math.cos(Δλ);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function distanceKm(lat: number, lng: number, to: { lat: number; lng: number } = KAABA) {
  const dφ = rad(to.lat - lat);
  const dλ = rad(to.lng - lng);
  const a =
    Math.sin(dφ / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(to.lat)) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Points du grand cercle (pour la petite carte schématique) : n+1 points de (lat, lng) jusqu'à la Kaʿba. */
export function greatCircle(lat: number, lng: number, n = 32): Array<{ lat: number; lng: number }> {
  const φ1 = rad(lat);
  const λ1 = rad(lng);
  const φ2 = rad(KAABA.lat);
  const λ2 = rad(KAABA.lng);
  const δ = distanceKm(lat, lng) / R;
  if (δ < 1e-9) return [{ lat, lng }];
  const out = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const a = Math.sin((1 - f) * δ) / Math.sin(δ);
    const b = Math.sin(f * δ) / Math.sin(δ);
    const x = a * Math.cos(φ1) * Math.cos(λ1) + b * Math.cos(φ2) * Math.cos(λ2);
    const y = a * Math.cos(φ1) * Math.sin(λ1) + b * Math.cos(φ2) * Math.sin(λ2);
    const z = a * Math.sin(φ1) + b * Math.sin(φ2);
    out.push({ lat: deg(Math.atan2(z, Math.hypot(x, y))), lng: deg(Math.atan2(y, x)) });
  }
  return out;
}

/** Point cardinal (16 secteurs) d'un cap, pour la lecture « 119° (ESE) ». */
export function compassPoint(b: number): string {
  const P = [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSO',
    'SO',
    'OSO',
    'O',
    'ONO',
    'NO',
    'NNO',
  ];
  return P[Math.round((((b % 360) + 360) % 360) / 22.5) % 16]!;
}

/**
 * Cap de l'appareil (degrés depuis le nord) d'après un événement d'orientation : boussole d'iOS
 * (webkitCompassHeading), sinon alpha d'un événement « absolu » (Android : deviceorientationabsolute).
 * null si l'orientation n'est pas rapportée au nord (alpha relatif) : on n'affiche alors pas de boussole.
 */
export function headingOf(e: {
  alpha: number | null;
  absolute?: boolean;
  webkitCompassHeading?: number;
}): number | null {
  if (typeof e.webkitCompassHeading === 'number' && Number.isFinite(e.webkitCompassHeading))
    return ((e.webkitCompassHeading % 360) + 360) % 360;
  if (e.absolute && typeof e.alpha === 'number') return (360 - e.alpha + 360) % 360;
  return null;
}
