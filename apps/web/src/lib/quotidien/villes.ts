/**
 * A12 — petite liste de villes INTÉGRÉE (aucun service externe de recherche de lieu) : marché des familles
 * francophones (France, Belgique, Suisse, Luxembourg, Canada), écoles du Sénégal, et quelques grandes villes.
 * Coordonnées du centre-ville (au centième de degré près, soit moins d'une minute d'écart sur les horaires) ;
 * fuseau horaire IANA pour afficher les heures de la ville, même depuis un appareil réglé ailleurs.
 */
export interface City {
  id: string;
  name: string;
  country: CountryCode;
  lat: number;
  lng: number;
  tz: string;
}
export type CountryCode =
  'FR' | 'BE' | 'CH' | 'LU' | 'CA' | 'SN' | 'MA' | 'DZ' | 'TN' | 'CI' | 'ML' | 'SA';

const c = (
  id: string,
  name: string,
  country: CountryCode,
  lat: number,
  lng: number,
  tz: string,
): City => ({ id, name, country, lat, lng, tz });

const PAR = 'Europe/Paris';
const MTL = 'America/Toronto';
export const CITIES: readonly City[] = [
  c('paris', 'Paris', 'FR', 48.8566, 2.3522, PAR),
  c('marseille', 'Marseille', 'FR', 43.2965, 5.3698, PAR),
  c('lyon', 'Lyon', 'FR', 45.764, 4.8357, PAR),
  c('toulouse', 'Toulouse', 'FR', 43.6047, 1.4442, PAR),
  c('nice', 'Nice', 'FR', 43.7102, 7.262, PAR),
  c('nantes', 'Nantes', 'FR', 47.2184, -1.5536, PAR),
  c('strasbourg', 'Strasbourg', 'FR', 48.5734, 7.7521, PAR),
  c('montpellier', 'Montpellier', 'FR', 43.6108, 3.8767, PAR),
  c('bordeaux', 'Bordeaux', 'FR', 44.8378, -0.5792, PAR),
  c('lille', 'Lille', 'FR', 50.6292, 3.0573, PAR),
  c('rennes', 'Rennes', 'FR', 48.1173, -1.6778, PAR),
  c('grenoble', 'Grenoble', 'FR', 45.1885, 5.7245, PAR),
  c('saint-etienne', 'Saint-Étienne', 'FR', 45.4397, 4.3872, PAR),
  c('toulon', 'Toulon', 'FR', 43.1242, 5.928, PAR),
  c('reims', 'Reims', 'FR', 49.2583, 4.0317, PAR),
  c('le-havre', 'Le Havre', 'FR', 49.4944, 0.1079, PAR),
  c('rouen', 'Rouen', 'FR', 49.4432, 1.0999, PAR),
  c('dijon', 'Dijon', 'FR', 47.322, 5.0415, PAR),
  c('metz', 'Metz', 'FR', 49.1193, 6.1757, PAR),
  c('mulhouse', 'Mulhouse', 'FR', 47.7508, 7.3359, PAR),
  c('nimes', 'Nîmes', 'FR', 43.8367, 4.3601, PAR),
  c('perpignan', 'Perpignan', 'FR', 42.6887, 2.8948, PAR),
  c('clermont-ferrand', 'Clermont-Ferrand', 'FR', 45.7772, 3.087, PAR),
  c('roubaix', 'Roubaix', 'FR', 50.6942, 3.1746, PAR),
  c('saint-denis', 'Saint-Denis', 'FR', 48.9362, 2.3574, PAR),
  c('bruxelles', 'Bruxelles', 'BE', 50.8503, 4.3517, 'Europe/Brussels'),
  c('anvers', 'Anvers', 'BE', 51.2194, 4.4025, 'Europe/Brussels'),
  c('gand', 'Gand', 'BE', 51.0543, 3.7174, 'Europe/Brussels'),
  c('liege', 'Liège', 'BE', 50.6326, 5.5797, 'Europe/Brussels'),
  c('charleroi', 'Charleroi', 'BE', 50.4108, 4.4446, 'Europe/Brussels'),
  c('geneve', 'Genève', 'CH', 46.2044, 6.1432, 'Europe/Zurich'),
  c('lausanne', 'Lausanne', 'CH', 46.5197, 6.6323, 'Europe/Zurich'),
  c('zurich', 'Zurich', 'CH', 47.3769, 8.5417, 'Europe/Zurich'),
  c('bale', 'Bâle', 'CH', 47.5596, 7.5886, 'Europe/Zurich'),
  c('berne', 'Berne', 'CH', 46.948, 7.4474, 'Europe/Zurich'),
  c('luxembourg', 'Luxembourg', 'LU', 49.6116, 6.1319, 'Europe/Luxembourg'),
  c('montreal', 'Montréal', 'CA', 45.5017, -73.5673, MTL),
  c('laval', 'Laval', 'CA', 45.6066, -73.7124, MTL),
  c('quebec', 'Québec', 'CA', 46.8139, -71.208, MTL),
  c('gatineau', 'Gatineau', 'CA', 45.4765, -75.7013, MTL),
  c('ottawa', 'Ottawa', 'CA', 45.4215, -75.6972, MTL),
  c('sherbrooke', 'Sherbrooke', 'CA', 45.4042, -71.8929, MTL),
  c('toronto', 'Toronto', 'CA', 43.6532, -79.3832, MTL),
  c('dakar', 'Dakar', 'SN', 14.6928, -17.4467, 'Africa/Dakar'),
  c('touba', 'Touba', 'SN', 14.85, -15.8833, 'Africa/Dakar'),
  c('thies', 'Thiès', 'SN', 14.791, -16.9256, 'Africa/Dakar'),
  c('tivaouane', 'Tivaouane', 'SN', 14.95, -16.8167, 'Africa/Dakar'),
  c('saint-louis', 'Saint-Louis', 'SN', 16.0326, -16.4818, 'Africa/Dakar'),
  c('kaolack', 'Kaolack', 'SN', 14.1652, -16.0726, 'Africa/Dakar'),
  c('mbour', 'Mbour', 'SN', 14.4198, -16.9624, 'Africa/Dakar'),
  c('ziguinchor', 'Ziguinchor', 'SN', 12.5833, -16.2719, 'Africa/Dakar'),
  c('casablanca', 'Casablanca', 'MA', 33.5731, -7.5898, 'Africa/Casablanca'),
  c('alger', 'Alger', 'DZ', 36.7538, 3.0588, 'Africa/Algiers'),
  c('tunis', 'Tunis', 'TN', 36.8065, 10.1815, 'Africa/Tunis'),
  c('abidjan', 'Abidjan', 'CI', 5.36, -4.0083, 'Africa/Abidjan'),
  c('bamako', 'Bamako', 'ML', 12.6392, -8.0029, 'Africa/Bamako'),
  c('la-mecque', 'La Mecque', 'SA', 21.4225, 39.8262, 'Asia/Riyadh'),
  c('medine', 'Médine', 'SA', 24.4672, 39.6111, 'Asia/Riyadh'),
];

export const COUNTRIES: readonly CountryCode[] = [
  'FR',
  'BE',
  'CH',
  'LU',
  'CA',
  'SN',
  'MA',
  'DZ',
  'TN',
  'CI',
  'ML',
  'SA',
];

export const cityById = (id: string) => CITIES.find((x) => x.id === id) ?? null;
