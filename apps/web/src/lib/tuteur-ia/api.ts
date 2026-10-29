/**
 * Tuteur IA de conversation (19/10/2026) : appels à l'API et micro. Chargé À LA DEMANDE avec l'écran (jamais
 * dans la coquille de l'élève). La voix enregistrée part au serveur et n'est gardée nulle part.
 */
import type { Scenario } from '@awform/content/conversation';
import { call } from '$lib/session';

export type { Scenario };

export interface EtatTuteur {
  actif: boolean;
  audience?: 'enfant' | 'ado' | 'adulte';
  guidee?: { voix: boolean; accordVoix: boolean };
  libre?: {
    disponible: boolean;
    raison?: 'mode' | 'enfant' | 'niveau_1' | 'accord_parental' | 'couts_coupes';
    simule: boolean;
    voix: boolean;
  };
  minutesRestantes?: number;
}
export interface ResultatGuidee {
  mots: Array<{ ar: string; etat: 'juste' | 'doute' | 'manquant' }>;
  bilan: 'bravo' | 'presque' | 'reessaie';
  attendue: string;
}
export interface ReponseLibre {
  logId: string;
  transcription?: string;
  reponse_ar: string;
  reponse_fr: string;
  correction: { dit: string; correct: string; explication_fr: string } | null;
  audio: { mime: string; b64: string } | null;
  lu: boolean;
  repli?: boolean;
  simule?: boolean;
  redirection?:
    | 'religion'
    | 'coran'
    | 'protection'
    | 'injection'
    | 'hors_sujet'
    | 'perso'
    // 20/10/2026 : sujets hors périmètre (refus poli, autre sujet proposé)
    | 'politique'
    | 'inconvenant'
    | 'conseil';
  aide?: string;
  /** motif d'une redirection « protection » (rencontre avec un inconnu, ou détresse) */
  protection?: 'rencontre' | 'detresse';
  minutesRestantes?: number;
  /** 28/10/2026 : oral — la remarque de prononciation arrive juste après (prononciation()) */
  prononciationId?: string;
}
/** Prononciation d'un tour oral : remarque VÉRIFIÉE (mot du livre) ou conseil d'écoute (paire difficile), et voix. */
export interface ResultatPrononciation {
  remarque: { correct: string; son: string; explication_fr: string } | null;
  conseil: {
    son: string;
    autre: string;
    mot: string;
    paire: [{ ar: string; fr?: string }, { ar: string; fr?: string }];
    explication_fr: string;
  } | null;
  /** 29/10/2026 : écrit — correction de grammaire arrivée juste après la réponse */
  correction?: { dit: string; correct: string; explication_fr: string } | null;
  audio: { mime: string; b64: string } | null;
  /** 29/10/2026 : protection détectée après coup (oral) */
  renvoi?: { redirection: 'protection'; aide?: string; protection?: 'rencontre' | 'detresse' };
}
export interface Audio {
  mime: string;
  b64: string;
  secondes: number;
}

const base = (id: string) => `/tuteur-ia/${encodeURIComponent(id)}`;
/** dialogue de la leçon (texte des livres), sous l'interrupteur du tuteur */
export const scenario = (id: string, unit: string) =>
  call<Scenario>('GET', `${base(id)}/scenario/${encodeURIComponent(unit)}`);
export const etat = (id: string, unit: string) =>
  call<EtatTuteur>('GET', `${base(id)}/etat?unit=${encodeURIComponent(unit)}`);
export const guidee = (
  id: string,
  body: { unitId: string; tour: number; texte?: string; audio?: Audio },
) => call<ResultatGuidee>('POST', `${base(id)}/guidee`, body);
export const libre = (
  id: string,
  body: {
    unitId: string;
    texte?: string;
    audio?: Audio;
    historique: Array<{ de: 'eleve' | 'tuteur'; ar: string }>;
    genre: 'm' | 'f' | 'x';
    adresse: 'tu' | 'vous';
  },
) => call<ReponseLibre>('POST', `${base(id)}/libre`, body);
export const prononciation = (id: string, pid: string) =>
  call<ResultatPrononciation>('GET', `${base(id)}/prononciation/${encodeURIComponent(pid)}`);
/** accord « analyse vocale par IA » (A5), au premier usage */
export const accordVoix = (id: string) =>
  call<{ ok: boolean }>('POST', `/profiles/${encodeURIComponent(id)}/ecoute/accord`, {});

// ------------------------------------------------------------------ micro

export interface Enregistreur {
  arreter(): Promise<Audio | null>;
  annuler(): void;
}

const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

async function enBase64(b: Blob): Promise<string> {
  const u = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Démarre le micro ; s'arrête seul après `maxS` secondes (`surFin` est alors appelé). Rejette sans micro. */
export async function enregistrer(maxS: number, surFin: () => void): Promise<Enregistreur> {
  const flux = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
  });
  const type =
    TYPES.find((x) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(x)) ??
    '';
  // 28/10/2026 (latence) : voix mono compressée à 24 kbit/s (≈ 128 kbit/s par défaut dans Chrome) : envoi plus court
  const rec = new MediaRecorder(flux, {
    ...(type ? { mimeType: type } : {}),
    audioBitsPerSecond: 24_000,
  });
  const morceaux: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && morceaux.push(e.data);
  const debut = performance.now();
  rec.start();
  const minuterie = setTimeout(surFin, maxS * 1000);
  const fermer = () => {
    clearTimeout(minuterie);
    for (const p of flux.getTracks()) p.stop();
  };
  return {
    arreter: () =>
      new Promise((ok) => {
        rec.onstop = async () => {
          fermer();
          const secondes = Math.min(maxS, (performance.now() - debut) / 1000);
          if (secondes < 0.4 || !morceaux.length) return ok(null);
          const blob = new Blob(morceaux, { type: rec.mimeType || type || 'audio/webm' });
          ok({
            mime: (blob.type || 'audio/webm').split(';')[0]!,
            b64: await enBase64(blob),
            secondes: Math.max(0.2, secondes),
          });
        };
        if (rec.state !== 'inactive') rec.stop();
        else ok(null);
      }),
    annuler: () => {
      rec.onstop = null;
      if (rec.state !== 'inactive') rec.stop();
      fermer();
    },
  };
}

/** Joue une réponse du tuteur (base64, en `blob:` comme le veut la CSP) ; renvoie l'élément pour l'arrêter. */
export function jouer(a: { mime: string; b64: string }, fin?: () => void): HTMLAudioElement {
  const bin = atob(a.b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([u], { type: a.mime }));
  const el = new Audio(url);
  const liberer = () => {
    URL.revokeObjectURL(url);
    fin?.();
  };
  el.onended = liberer;
  el.onerror = liberer;
  void el.play().catch(liberer);
  return el;
}
