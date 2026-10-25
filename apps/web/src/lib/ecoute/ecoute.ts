/**
 * A5 — logique de l'appareil pour « Réciter et vérifier » (chargée à la demande avec le panneau).
 *
 *  - ENREGISTRER PUIS VÉRIFIER : MediaRecorder (Opus, ou mp4 sur Safari), 5 min au plus ; l'enregistrement est
 *    envoyé au serveur pour l'analyse, qui ne le garde pas ; sur l'appareil, il reste EN MÉMOIRE seulement (pour
 *    « Envoyer au maître », qui passe par l'envoi existant du lot 16 et son propre accord) et disparaît à la
 *    fermeture du panneau ;
 *  - SUIVI EN DIRECT (prototype) : le micro est lu en PCM 16 kHz et envoyé par morceaux d'une seconde ; le
 *    serveur renvoie les mots sûrs (passages finis par une pause) et partiels ; la comparaison se fait ICI avec
 *    le même code que le serveur (`comparer`, @awform/hifz) : texte qui avance, mots qui se dévoilent ;
 *  - BILAN de séance (versets récités, mots à revoir) gardé sur l'appareil (20 derniers), repris par le carnet.
 * Jamais de note, jamais de tajwīd, jamais « valide » : seul le maître juge.
 */
import { loadTexts } from '$lib/i18n';
import { call } from '$lib/session';
import type { Bilan } from './bilans';
import {
  comparer,
  ecartsDAccord,
  motsARevoir,
  type EtatMot,
  type MotAttendu,
  type MotEntendu,
  type ResultatEcoute,
} from '@awform/hifz';

export interface Portion {
  s: number;
  from: number;
  to: number;
}
export const MAX_S = 300;
/**
 * Signaler les erreurs PENDANT le suivi en direct ? Non pour l'instant : mesuré le 06/10/2026, les passages du
 * direct (coupés aux pauses) sont moins bien reconnus que l'enregistrement entier et donnaient de fausses alertes
 * (ECOUTE_IA.md § 4). Le texte avance et se dévoile ; les écarts viennent du bilan de fin.
 */
export const SIGNALER_EN_DIRECT = false;
/**
 * SUIVI DE LA RÉCITATION (interrupteur `shazam_coran`, 25/10/2026) : le service relit chaque passage AVEC SON
 * CONTEXTE (4 s avant, le passage suivant après) et en deux lectures (RNN-T et CTC) ; un écart n'est montré pendant la
 * récitation que sur ces mots « stables » et seulement si les deux lectures le voient (`ecartsDAccord`). Mesure :
 * docs/projet/ECOUTE_IA.md § 10. Les mots provisoires et partiels ne font que dévoiler le texte.
 */

// ------------------------------------------------------------------ accord, vérification

export async function donnerAccord(profileId: string, pin = ''): Promise<string | null> {
  const r = await call(
    'POST',
    `/profiles/${profileId}/ecoute/accord`,
    {},
    pin ? { 'x-parent-pin': pin } : undefined,
  );
  return r.ok ? null : (r.code ?? 'reseau');
}

export interface Verification {
  resultat: ResultatEcoute;
  aRevoir: number;
  positions: Array<[number, number, number]>;
  duree: number;
  calcul: number;
}

export async function verifier(
  profileId: string,
  p: Portion,
  audio: Blob,
): Promise<{ ok: true; v: Verification } | { ok: false; code: string }> {
  try {
    const r = await fetch(
      `/api/v1/profiles/${profileId}/ecoute/verifier?s=${p.s}&from=${p.from}&to=${p.to}`,
      {
        method: 'POST',
        headers: {
          'x-awform': '1',
          'content-type': (audio.type || 'audio/webm').split(';')[0]!,
        },
        body: audio,
        credentials: 'same-origin',
      },
    );
    const j = (await r.json().catch(() => null)) as
      (Verification & { error?: { code?: string } }) | null;
    if (!r.ok || !j) {
      // message de l'erreur renvoyée (catalogue `fr-erreurs`), chargé avant l'affichage
      if (j?.error?.code) await loadTexts('erreurs');
      return { ok: false, code: j?.error?.code ?? 'reseau' };
    }
    return { ok: true, v: j };
  } catch {
    return { ok: false, code: 'reseau' };
  }
}

// ------------------------------------------------------------------ enregistrement

/** Enregistreur : MediaRecorder, arrêt automatique à 5 min. Le flux du micro est coupé à l'arrêt. */
export class Enregistreur {
  private rec: MediaRecorder | null = null;
  private morceaux: Blob[] = [];
  private minuterie: ReturnType<typeof setTimeout> | null = null;
  debut = 0;

  async demarrer(stream: MediaStream, onFin: (b: Blob) => void, maxS = MAX_S): Promise<void> {
    this.morceaux = [];
    const types = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];
    const mimeType = types.find((m) => MediaRecorder.isTypeSupported?.(m));
    this.rec = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : {});
    this.rec.ondataavailable = (e) => {
      if (e.data.size) this.morceaux.push(e.data);
    };
    this.rec.onstop = () => {
      if (this.minuterie) clearTimeout(this.minuterie);
      const b = new Blob(this.morceaux, { type: this.rec?.mimeType || mimeType || 'audio/webm' });
      this.morceaux = [];
      onFin(b);
    };
    this.rec.start(1000);
    this.debut = Date.now();
    this.minuterie = setTimeout(() => this.arreter(), maxS * 1000);
  }
  arreter(): void {
    if (this.rec && this.rec.state !== 'inactive') this.rec.stop();
  }
}

export async function micro(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
  });
}
/**
 * Cause PRÉCISE d'un micro inaccessible (lot lecteur 4, essai du client) : page non sécurisée (http : le
 * navigateur refuse le micro), autorisation refusée, aucun micro, ou autre.
 */
export type CauseMicro = 'micro_https' | 'micro_refuse' | 'micro_absent' | 'micro';
export function causeMicro(
  e: unknown,
  env: { secure: boolean; api: boolean } = {
    secure: typeof window === 'undefined' || window.isSecureContext !== false,
    api: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
  },
): CauseMicro {
  if (!env.secure) return 'micro_https';
  const nom = (e as { name?: string } | null)?.name ?? '';
  if (nom === 'NotAllowedError' || nom === 'PermissionDeniedError') return 'micro_refuse';
  if (nom === 'SecurityError') return env.api ? 'micro_refuse' : 'micro_https';
  if (nom === 'NotFoundError' || nom === 'DevicesNotFoundError' || nom === 'OverconstrainedError')
    return 'micro_absent';
  if (!env.api) return 'micro_https';
  return 'micro';
}
export const coupe = (s: MediaStream | null) => s?.getTracks().forEach((tr) => tr.stop());

// ------------------------------------------------------------------ suivi en direct

export interface EtatDirect {
  resultat: ResultatEcoute;
  /** mot attendu « en cours » (le suivant du dernier reconnu) */
  courant: number;
  secondes: number;
}

/**
 * Suivi en direct : PCM 16 kHz (AudioContext + ScriptProcessor, pris en charge partout), morceaux d'une seconde
 * envoyés UN PAR UN ; mots sûrs accumulés ; comparaison locale. Les erreurs ne sont signalées que sur les mots
 * sûrs (jamais sur les partiels) et seulement si la machine est sûre d'elle (mêmes seuils que le serveur).
 */
export class SuiviDirect {
  private ctx: AudioContext | null = null;
  private noeud: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private tampon: Int16Array[] = [];
  private enCours = false;
  private sid = '';
  private surs: MotEntendu[] = [];
  private partiel: MotEntendu[] = [];
  private voix: Array<[number, number]> = [];
  /** mode suivi : mots stables (deux lectures) et provisoires du dernier passage */
  private stables: MotEntendu[] = [];
  private stablesCtc: MotEntendu[] = [];
  private provisoires: MotEntendu[] = [];
  private arrete = false;
  secondes = 0;
  /** le serveur a accepté le mode « suivi de la récitation » (erreurs signalées pendant la récitation) */
  suivi = false;

  constructor(
    private profileId: string,
    private p: Portion,
    private att: MotAttendu[],
    private maj: (e: EtatDirect) => void,
    private erreur: (code: string) => void,
    private demandeSuivi = false,
  ) {}

  async demarrer(stream: MediaStream): Promise<boolean> {
    const r = await call<{ sid: string; suivi?: boolean }>(
      'POST',
      `/profiles/${this.profileId}/ecoute/direct?s=${this.p.s}&from=${this.p.from}&to=${this.p.to}${this.demandeSuivi ? '&suivi=1' : ''}`,
      {},
    );
    if (!r.ok || !r.data) {
      this.erreur(r.code ?? 'reseau');
      return false;
    }
    this.sid = r.data.sid;
    this.suivi = r.data.suivi === true;
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC({ sampleRate: 16000 });
    this.source = this.ctx.createMediaStreamSource(stream);
    this.noeud = this.ctx.createScriptProcessor(4096, 1, 1);
    const ratio = this.ctx.sampleRate / 16000;
    this.noeud.onaudioprocess = (e) => {
      if (this.arrete) return;
      const x = e.inputBuffer.getChannelData(0);
      // rééchantillonnage simple si le navigateur a imposé une autre fréquence
      const n = Math.floor(x.length / ratio);
      const y = new Int16Array(n);
      for (let i = 0; i < n; i++) {
        const v = Math.max(-1, Math.min(1, x[Math.floor(i * ratio)]!));
        y[i] = v * 32767;
      }
      this.tampon.push(y);
      void this.envoyer();
    };
    this.source.connect(this.noeud);
    this.noeud.connect(this.ctx.destination);
    return true;
  }

  private async envoyer(force = false): Promise<void> {
    const n = this.tampon.reduce((s, b) => s + b.length, 0);
    if (this.enCours || (!force && n < 16000) || !n) return;
    this.enCours = true;
    const bloc = new Int16Array(n);
    let o = 0;
    for (const b of this.tampon.splice(0)) {
      bloc.set(b, o);
      o += b.length;
    }
    try {
      const r = await fetch(`/api/v1/ecoute/direct/${this.sid}`, {
        method: 'POST',
        headers: { 'x-awform': '1', 'content-type': 'application/octet-stream' },
        body: bloc.buffer,
        credentials: 'same-origin',
      });
      const j = (await r.json().catch(() => null)) as {
        mots?: MotEntendu[];
        partiel?: MotEntendu[];
        voix?: Array<[number, number]>;
        t?: number;
        stables?: MotEntendu[];
        stables_ctc?: MotEntendu[];
        provisoires?: MotEntendu[];
        error?: { code?: string };
      } | null;
      if (!r.ok || !j) {
        this.erreur(j?.error?.code ?? 'reseau');
        if (r.status === 413) await this.arreter();
        return;
      }
      this.surs.push(...(j.mots ?? []));
      this.stables.push(...(j.stables ?? []));
      this.stablesCtc.push(...(j.stables_ctc ?? []));
      if (j.provisoires) this.provisoires = j.provisoires;
      this.voix.push(...(j.voix ?? []));
      this.partiel = j.partiel ?? [];
      this.secondes = j.t ?? this.secondes;
      this.maj(this.etat());
    } catch {
      this.erreur('reseau');
    } finally {
      this.enCours = false;
    }
  }

  /**
   * État courant : mots reconnus (sûrs ou partiels) dévoilés, mot en cours ; erreurs signalées en direct
   * seulement si `SIGNALER_EN_DIRECT` (sinon un mot oublié reste simplement caché, et le bilan de fin le dira).
   */
  etat(): EtatDirect {
    if (this.suivi) return this.etatSuivi();
    const resultat = comparer(this.att, this.surs, { voix: this.voix, enCours: true });
    const avecPartiel = comparer(this.att, [...this.surs, ...this.partiel], { enCours: true });
    const fin = Math.max(resultat.finRecitee, avecPartiel.finRecitee);
    const mots: EtatMot[] = resultat.mots.map((m, i) => {
      if (m === 'non_recite' && avecPartiel.mots[i] === 'ok') return 'ok';
      if (!SIGNALER_EN_DIRECT && m !== 'ok') return 'non_recite';
      return m;
    });
    const ecarts = SIGNALER_EN_DIRECT ? resultat.ecarts : [];
    return { resultat: { ...resultat, mots, ecarts }, courant: fin + 1, secondes: this.secondes };
  }

  /**
   * Suivi de la récitation : écarts des mots STABLES vus par les deux lectures (sinon rien n'est signalé) ; mots
   * reconnus (stables, provisoires ou partiels) dévoilés ; mot en cours après le dernier reconnu.
   */
  private etatSuivi(): EtatDirect {
    const opts = { voix: this.voix, enCours: true };
    const r = comparer(this.att, this.stables, opts);
    const c = comparer(this.att, this.stablesCtc, opts);
    const ecarts =
      r.statut === 'resultat' && c.statut === 'resultat' ? ecartsDAccord(r.ecarts, c.ecarts) : [];
    const signale = new Set<number>();
    for (const e of ecarts)
      if (e.type !== 'ajoute') for (let i = e.i; i <= e.fin; i++) signale.add(i);
    const tous = comparer(this.att, [...this.stables, ...this.provisoires, ...this.partiel], {
      enCours: true,
    });
    const mots: EtatMot[] = r.mots.map((m, i) =>
      signale.has(i) ? m : m === 'ok' || tous.mots[i] === 'ok' ? 'ok' : 'non_recite',
    );
    const fin = Math.max(r.finRecitee, tous.finRecitee);
    return { resultat: { ...r, mots, ecarts }, courant: fin + 1, secondes: this.secondes };
  }

  /**
   * Fin : la séance est close (l'audio est effacé de la mémoire du service). Le bilan vient ensuite de la
   * vérification de TOUT l'enregistrement (`verifier`), plus sûre que les passages du direct.
   */
  async arreter(): Promise<void> {
    if (this.arrete) return;
    this.arrete = true;
    this.tampon = [];
    this.noeud?.disconnect();
    this.source?.disconnect();
    await this.ctx?.close().catch(() => {});
    if (this.sid) await call('DELETE', `/ecoute/direct/${this.sid}`).catch(() => null);
  }
}

// ------------------------------------------------------------------ bilan de séance

export function bilanDe(p: Portion, att: MotAttendu[], r: ResultatEcoute): Bilan {
  const mots: Bilan['mots'] = [];
  for (const e of r.ecarts)
    for (let i = e.i; i <= (e.type === 'ajoute' ? e.i : e.fin); i++) {
      const m = att[Math.max(0, i)];
      if (m) mots.push([m.s, m.a, m.k, e.type]);
    }
  const a0 = r.debut >= 0 ? att[r.debut]?.a : undefined;
  const a1 = r.finRecitee >= 0 ? att[r.finRecitee]?.a : undefined;
  return {
    date: new Date().toISOString(),
    s: p.s,
    from: p.from,
    to: p.to,
    versets: a0 !== undefined && a1 !== undefined ? [a0, a1] : null,
    aRevoir: motsARevoir(r),
    mots,
    pasCompris: r.statut === 'pas_compris',
  };
}
