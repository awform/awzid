/**
 * Audio du Coran (lot 27) : client TYPÉ de l'API (aucune interface ici). Récitateurs, pistes d'une sourate,
 * paquets hors ligne par sourate, préférence et listes autorisées du profil, liste de la classe. Les
 * récitations viennent du Complexe du Roi Fahd ; le crédit de chaque récitateur doit être affiché.
 */
import { call } from './session';

export type Riwaya = 'hafs' | 'shuba' | 'qalun' | 'warsh' | 'susi' | 'duri' | (string & {});
/** « verset » : surlignage verset par verset sur le texte de Ḥafṣ ; « sans_surlignage » : autre riwāya */
export type Surlignage = 'verset' | 'sans_surlignage';
export type ModeAudio = 'ecouter' | 'memoriser';

export interface Reciter {
  id: string;
  nameAr: string;
  nameFr: string;
  riwaya: Riwaya;
  riwayaFr: string;
  speed: 'lente' | 'moyenne' | 'rapide' | null;
  style: 'murattal' | 'mujawwad' | 'muallim' | null;
  credit: string;
  creditAr: string;
  usageNote: string;
  license: { source: string; url: string; archivedOn: string; text: string };
  verses: number;
  surlignage: Surlignage;
  conseilDebutant: boolean;
  /** A2 : écoute EN LIGNE seulement (Quran Foundation) : ni paquet hors ligne, ni relais */
  enLigne?: boolean;
}

export interface AudioFile {
  aya: number;
  url: string;
  bytes: number;
  sha256: string;
  durationMs: number;
  format: string;
  surlignage: Surlignage;
}

/** Pistes d'une sourate = manifeste du paquet hors ligne de cette sourate. */
export interface SuraPack {
  format: 1;
  reciter: string;
  riwaya: Riwaya;
  credit: string;
  sura: number;
  hash: string;
  surlignage: Surlignage;
  /** « sourate » : un seul fichier de sourate entière (piste 0), pas d'écoute verset par verset */
  mode?: 'versets' | 'sourate';
  /** A2 : fichiers lus sur le réseau de Quran Foundation (adresses https), jamais gardés sur l'appareil */
  enLigne?: boolean;
  wifiSeulement: boolean;
  bytes: number;
  durationMs: number;
  files: AudioFile[];
}

export interface PackIndex {
  reciter: string;
  credit: string;
  surlignage: Surlignage;
  wifiSeulement: boolean;
  totalBytes: number;
  suras: Array<{
    sura: number;
    files: number;
    bytes: number;
    durationMs: number;
    hash: string;
    url: string;
  }>;
}

export interface ProfileReciters {
  mode: ModeAudio;
  riwayaCarnet: Riwaya | null;
  restreint: boolean;
  reciters: Reciter[];
  preference: { choisi: string | null; effectif: string | null };
  conseilDebutant: string | null;
}

const pin = (code?: string) => (code ? { 'x-parent-pin': code } : undefined);

export const reciters = () =>
  call<{ reciters: Reciter[]; conseilDebutant: string }>('GET', '/quran/audio/reciters');
export const packIndex = (reciterId: string) =>
  call<PackIndex>('GET', `/quran/audio/reciters/${reciterId}/packs`);
export const suraPack = (reciterId: string, sura: number) =>
  call<SuraPack>('GET', `/quran/audio/reciters/${reciterId}/packs/${sura}`);
export const profileReciters = (profileId: string, mode: ModeAudio = 'ecouter') =>
  call<ProfileReciters>('GET', `/profiles/${profileId}/quran/reciters?mode=${mode}`);
/** Pistes pour un profil : liste autorisée et règle de riwāya (409 riwaya_differente_du_carnet). */
export const profileSuraTracks = (
  profileId: string,
  sura: number,
  reciterId: string,
  mode: ModeAudio = 'ecouter',
) =>
  call<SuraPack>(
    'GET',
    `/profiles/${profileId}/quran/suras/${sura}/tracks?recitateur=${encodeURIComponent(reciterId)}&mode=${mode}`,
  );
export const setPreference = (profileId: string, reciterId: string | null) =>
  call<{ ok: true; choisi: string | null }>('PUT', `/profiles/${profileId}/quran/reciter`, {
    reciterId,
  });
export const parentAllowed = (profileId: string) =>
  call<{ parent: string[] | null }>('GET', `/profiles/${profileId}/quran/allowed-reciters`);
/** Liste autorisée par le parent (null : sans restriction) ; code parent exigé. */
export const setParentAllowed = (profileId: string, list: string[] | null, parentPin?: string) =>
  call<{ ok: true; parent: string[] | null }>(
    'PUT',
    `/profiles/${profileId}/quran/allowed-reciters`,
    { reciters: list },
    pin(parentPin),
  );
export const classAllowed = (classId: string) =>
  call<{ classe: string[] | null; reciters: Reciter[] }>(
    'GET',
    `/teacher/classes/${classId}/quran/allowed-reciters`,
  );
export const setClassAllowed = (classId: string, list: string[] | null) =>
  call<{ ok: true; classe: string[] | null }>(
    'PUT',
    `/teacher/classes/${classId}/quran/allowed-reciters`,
    { reciters: list },
  );

/**
 * Téléchargement hors ligne : sourates choisies qui tiennent dans le quota de l'appareil (octets libres),
 * dans l'ordre donné ; les sourates déjà présentes (même empreinte) ne comptent pas.
 */
export function packsWithinQuota(
  index: Pick<PackIndex, 'suras'>,
  wanted: number[],
  freeBytes: number,
  present: Record<number, string> = {},
): { take: number[]; bytes: number; skipped: number[] } {
  let bytes = 0;
  const take: number[] = [];
  const skipped: number[] = [];
  for (const s of wanted) {
    const e = index.suras.find((x) => x.sura === s);
    if (!e || present[s] === e.hash) continue;
    if (bytes + e.bytes <= freeBytes) {
      take.push(s);
      bytes += e.bytes;
    } else skipped.push(s);
  }
  return { take, bytes, skipped };
}
