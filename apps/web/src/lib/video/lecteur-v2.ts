/**
 * Vidéos vivantes — lecteur V2 (20/10/2026, maquette validée par le client ; interrupteur `video_v2`, sinon le lecteur
 * v1 `lecteur.ts` reste celui de l'élève). Chargé À LA DEMANDE comme la v1 (appui sur « Voir en vidéo », groupe
 * `/_app/video.json`, garde de poids dans scripts/budget.mjs). Même principe : il joue les scènes générées par
 * `buildVideo` (option `v2`) ; aucun texte de contenu écrit ici, seulement des textes d'interface (`vv.*`). L'arabe a
 * toujours sa propre ligne ; la voix n'est QUE le fichier audio du texte ; aucune musique, aucun visage.
 *
 * V2 :
 *  - chapitres (liste fixe, traduite) : sommaire de 2 s, intertitres, barre de progression découpée en chapitres ;
 *  - rythme : la durée suit les audios réels (durées lues dans les métadonnées des fichiers) ;
 *  - surlignage au rythme de la voix (mot par mot, au prorata des lettres ; découpe aux espaces SEULEMENT) ;
 *  - sous-titres : traduction du livre de ce qui est dit, bandeau en bas (bouton « Voir / Cacher la traduction ») ;
 *  - consigne en pastille en haut de la carte ; minuteur discret dans « À toi ! » ; repères visuels pendant la pause ;
 *  - récapitulatif final de la version courte (textes déjà montrés) ;
 *  - animations sur `transform` et `opacity` seulement ; `prefers-reduced-motion` : fondus seuls ;
 *  - ENREGISTREMENT (MP4, e2e/video-mp4.spec.ts) : `window.__vvRec` créé par le test seulement (sans commandes, lancé
 *    dans un mode, attente du carton d'ouverture, fin signalée) ; journal `window.__vv` (sons, sous-titres, chapitres).
 */
import {
  buildVideo,
  dureeMode,
  scenesDuMode,
  type Chapitre,
  type Question,
  type Scene,
  type T,
  type Temps,
  type VideoLecon,
  type VideoMode,
} from '@awform/content/video';
import { audioIdFor, leconsSource, stopLessonAudio, type LevelAudio } from '$lib/lecons-audio';
import { loadTexts, t } from '$lib/i18n';
import { memoriserTraduction, traductionVisible } from '$lib/traduction';
// feuille reliée à l'ouverture (CSP « style-src 'self' » ; un import la ferait relier par la page de leçon)
import feuille from './lecteur-v2.css?url';

/** tracés validés par le référent (`/video/traits.json`), chargés au premier tracé */
type Traits = Record<string, Array<{ s: string; t: number[][] } | null>>;
let traitsP: Promise<Traits> | null = null;
const chargerTraits = () =>
  (traitsP ??= fetch('/video/traits.json')
    .then((r) => (r.ok ? (r.json() as Promise<Traits>) : ({} as Traits)))
    .catch(() => ((traitsP = null), {} as Traits)));

export interface OuvrirOptions {
  unit: { id: string; levelCode: string; lesson: unknown };
  illus: Record<string, { viewBox: string }>;
  audio: LevelAudio | null;
  profileId?: string | null;
  tuteur?: (u: { unitId: string }) => void;
}
/** enregistrement (MP4) : sans commandes, lancé dans `mode` après `attente` (carton d'ouverture), `onFin` à la fin */
type Rec = { mode: VideoMode; attente?: Promise<void>; onFin?: () => void };

const c = String.fromCharCode;
const AR = `${c(0x600)}-${c(0x6ff)}`;
// (deux formes arabes séparées par « / », « · » ou « ← » restent sur la même ligne : les deux terminaisons du duel)
const RUN = new RegExp(
  `(\\(\\s?[${AR}][${AR}\\s.]*\\s?\\)|«\\s?[${AR}][${AR}\\s.]*\\s?»|[${AR}](?:\\s[/·←]\\s(?=[${AR}])|[${AR}\\s.])*)`,
);
// lettres (le tatweel U+0640 n'en est pas une : une terminaison citée « ـْتُ » reste dans la phrase)
const LETTRE = new RegExp(`[${c(0x621)}-${c(0x63f)}${c(0x641)}-${c(0x64a)}]`, 'g');
const LATIN = /[A-Za-z]/;
const TATWEEL = c(0x640);
const ALIF = c(0x627);
const NASKH = '"Noto Naskh Arabic"';
const FAMILLES: Array<[number[], string]> = [
  [[0x628, 0x62a, 0x62b, 0x646, 0x64a], '#0b6e4f'],
  [[0x62c, 0x62d, 0x62e], '#9a3b12'],
  [[0x62f, 0x630, 0x631, 0x632, 0x627, 0x648], '#1f4e79'],
  [[0x633, 0x634], '#6a2c5f'],
  [[0x635, 0x636, 0x637, 0x638], '#7a4a12'],
  [[0x639, 0x63a], '#1b6670'],
  [[0x641, 0x642], '#5b6b1e'],
  [[0x643, 0x644, 0x645, 0x647], '#8b2e3c'],
  [[0x621, 0x623, 0x625, 0x624, 0x626, 0x622], '#4b4f9e'],
];
const famille = (l: string) => FAMILLES.find(([cs]) => cs.includes(l.charCodeAt(0)))?.[1];

/**
 * Journal de TEST et d'enregistrement : sons, scènes, sous-titres, chapitres (texte, instant), contenus réduits pour
 * tenir (`zoom`) ; `vite` : horloge accélérée sans son (contrôle de mise en page des 25 unités). Il n'existe que si
 * un test le crée avant l'ouverture (`window.__vv`) : rien n'est noté en usage normal.
 */
type Journal = {
  sons: Array<[string, number]>;
  scenes?: Array<[string, number]>;
  st?: Array<[string, number]>;
  ch?: Array<[string, number]>;
  zoom?: string[];
  vite?: number;
  q?: Question;
};
const journal = () => (globalThis as { __vv?: Journal }).__vv;

class Coupe extends Error {}
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[x]!);
function h(tag: string, cls = '', html = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}
const anneau = (cls: string, centre: string) =>
  `<div class="atoi"><div class="anneau ${cls}"><svg viewBox="0 0 100 100"><circle class="fd" cx="50" cy="50" r="42"/><circle class="or" cx="50" cy="50" r="42"/></svg>${centre}</div></div>`;
const arH = (s: string, cls = '') => `<span class="ar ${cls}" lang="ar" dir="rtl">${esc(s)}</span>`;
/** V2 — texte arabe découpé en mots (aux espaces seulement : les liaisons ne traversent jamais une espace) */
export const arW = (s: string, cls = '') =>
  `<span class="ar ${cls}" lang="ar" dir="rtl">${s
    .split(/(\s+)/)
    .map((p) => (!p ? '' : /^\s+$/.test(p) ? p : `<span class="w">${esc(p)}</span>`))
    .join('')}</span>`;
/** texte français du livre : un passage arabe passe sur sa propre ligne ; une lettre (ou une suite de lettres isolées) reste */
export function frH(s: string, cls = 'fr'): string {
  let out = '';
  let buf = '';
  // après une ligne arabe, la ponctuation qui la suivait ne commence pas la ligne française (« , la ligature »)
  const fl = () => (out ? buf.replace(/^\s*(?:[)\]»]\s*[,;.?!]?|[,;.?!])\s*/, '') : buf);
  const vide = (x: string) => !x.replace(/[\s.,;:)\]»]/g, '');
  // V2 — parenthèse ouverte avant une ligne arabe (sa fermante, après la ligne, est déjà retirée) : retirée aussi
  const ouv = (x: string) =>
    (x.match(/\(/g) ?? []).length > (x.match(/\)/g) ?? []).length
      ? x.replace(/\((?=[^()]*$)/, '')
      : x;
  for (const p of s.split(RUN)) {
    if (!p) continue;
    // V2 — typographie française : « et » ne finissent jamais seuls une ligne, ni ? ! : ; ne la commencent
    if (!RUN.test(p)) buf += esc(p.replace(/« /g, '« ').replace(/ ([»?!:;])/g, ' $1'));
    else if (isolees(p))
      buf += `<bdi class="lt" lang="ar" dir="rtl">${esc(p.trim())}</bdi>${/\s$/.test(p) ? ' ' : ''}`;
    else {
      if (!vide(fl())) out += `<span class="${cls}">${ouv(fl())}</span>`;
      buf = '';
      out += arH(p.trim(), 'l');
    }
  }
  const reste = fl();
  if (!vide(reste)) out += `<span class="${cls}">${reste}</span>`;
  return `<div class="frh">${out}</div>`;
}
/** choix d'un exercice : arabe ; français ; ou français du livre avec de l'arabe (chacun sur sa ligne) */
const choixH = (o: string) =>
  LATIN.test(o)
    ? frH(o, 'fr toujours')
    : RUN.test(o)
      ? arH(o)
      : `<span class="fr toujours">${esc(o)}</span>`;
/** lettres isolées citées (une lettre par morceau, lām-alif compté une fois : « ك ل م ه », « لا ») : dans la phrase */
const LAMALIF = new RegExp(`${c(0x644)}[${c(0x622, 0x623, 0x625, 0x627)}]`, 'g');
const isolees = (p: string) =>
  p
    .trim()
    .split(/\s+/)
    .every((m) => (m.replace(LAMALIF, c(0x644)).match(LETTRE) ?? []).length <= 1);
/** titre du livre qui commence par des lettres citées : « Les lettres ك ل م ه, la ligature لا… » */
const titreH = (s: string, cls = 'h') => {
  const m = RUN.exec(s);
  return frH(
    m?.index === 0 && isolees(m[0]) && m[0].trim().includes(' ')
      ? `${t('vv.les_lettres')} ${s}`
      : s,
    cls,
  );
};

let fermerOuvert: (() => void) | null = null;

/** Ouvre le lecteur plein écran (un seul à la fois), après ses textes (catalogue `fr-video`, à la demande). */
export async function ouvrir(o: OuvrirOptions): Promise<void> {
  await loadTexts('video');
  // feuille de la v1 (interrupteur basculé pendant la session) : retirée, mêmes classes
  document.getElementById('vv-feuille')?.remove();
  if (!document.getElementById('vv2-feuille')) {
    const st = document.createElement('link');
    st.id = 'vv2-feuille';
    st.rel = 'stylesheet';
    st.href = feuille;
    await new Promise((ok) => {
      st.onload = st.onerror = ok;
      setTimeout(ok, 4000);
      document.head.append(st);
    });
  }
  fermerOuvert?.();
  fermerOuvert = creer(o);
}

/** V2 — temps de lecture d'une traduction affichée après le son (ms) */
const lecture = (fr = '', min = 700, max = 2000) =>
  Math.min(max, Math.max(min, 450 + 28 * fr.length));

function creer(opt: OuvrirOptions): () => void {
  let vid: VideoLecon;
  let root: HTMLElement;
  let stage: HTMLElement;
  let zone: HTMLElement;
  let band: HTMLElement;
  let sous: HTMLElement;
  let kind = '';
  let titreCarte = '';
  let modeChoisi: VideoMode = 'longue';
  let lettreChoisie = 0;
  let scenes: Scene[] = [];
  let idx = 0;
  let jeton = 0;
  let pause = true;
  let debut = false;
  let vitesse = 1;
  let audio: HTMLAudioElement | null = null;
  let seul: HTMLAudioElement | null = null;
  let score = { ok: 0, n: 0 };
  /** sons réellement joués (une scène sans aucun son dit ses textes de secours) */
  let nSons = 0;
  let retour: Element | null;
  let cle: string;
  // V2 — durées réelles des audios (ms), chapitres, horloge de la barre
  const durees = new Map<string, number>();
  let chaps: Array<{ c: Chapitre; de: number; a: number; ms: number }> = [];
  let estim: number[] = [];
  let ecoule = 0;
  let vu = -1;
  /** scène dont l'intertitre est en cours */
  let annonce = -1;
  const rec = (globalThis as { __vvRec?: Rec }).__vvRec;

  const init = () => {
    retour = document.activeElement;
    // reprise propre à la v2 (scènes dans un autre ordre que la v1)
    cle = `awzid.vv2.${opt.unit.id}`;
    const la = opt.audio;
    vid = buildVideo(opt.unit.lesson, {
      unitId: opt.unit.id,
      hasAudio: (s) => !!audioIdFor(s, la),
      images: Object.keys(opt.illus),
      audioList: la ? [...la.fichiers] : [],
      v2: true,
    });
    stopLessonAudio();
    document.dispatchEvent(new Event('awzid-son'));
    const r = (root = h('div', 'vv'));
    r.setAttribute('role', 'dialog');
    r.setAttribute('aria-modal', 'true');
    r.setAttribute('aria-label', t('vv.titre'));
    r.dataset.testid = 'vv';
    if (rec) r.dataset.rec = '';
    r.classList.toggle('sans-trad', !traductionVisible(opt.profileId));
    r.innerHTML = `<div class="vv-l"><header class="vv-t"><div class="tt"><span class="k"></span><b class="s"></b></div><span class="nch"></span><button class="ib fermer" data-k="fermer" aria-label="${esc(t('vv.fermer'))}">✕</button></header><div class="barre" aria-hidden="true"></div><section class="vv-sc" aria-live="polite"></section><nav class="vv-cmd"><div class="rang"><button class="ib" data-k="prec" aria-label="${esc(t('vv.prec'))}"><svg viewBox="0 0 24 24"><path d="M6 5v14M18 6l-8 6 8 6z"/></svg></button><button class="ib lire" data-k="lire"></button><button class="ib" data-k="suiv" aria-label="${esc(t('vv.suiv'))}"><svg viewBox="0 0 24 24"><path d="M18 5v14M6 6l8 6-8 6z"/></svg></button></div><div class="rang"><button class="puce" data-k="vitesse"></button><button class="puce cc" data-k="trad" data-testid="vv-trad"></button></div></nav></div>`;
    stage = r.querySelector('.vv-sc')!;
    document.body.append(r);
    document.documentElement.classList.add('vv-ouvert');
    r.addEventListener('click', (e) => clic(e));
    r.addEventListener('keydown', (e) => clavier(e));
    majBoutons();
    horloge();
    if (rec && vid.modes.includes(rec.mode)) void lancer(rec.mode, 0);
    else depart();
    if (!rec) r.querySelector<HTMLElement>('.fermer')!.focus();
  };

  // ———————————————————————————————— commandes ————————————————————————————————
  function clic(e: MouseEvent) {
    const b = (e.target as Element).closest<HTMLElement>('[data-k],[data-dire]');
    if (!b) return;
    if (b.dataset.dire !== undefined) return ecouter(b.dataset.dire);
    switch (b.dataset.k) {
      case 'fermer':
        return fermer();
      case 'lire':
        return basculer();
      case 'prec':
        return debut ? void jouer(idx - 1) : undefined;
      case 'suiv':
        return debut ? void jouer(idx + 1) : undefined;
      case 'vitesse': {
        const V = [0.75, 1, 1.25];
        vitesse = V[(V.indexOf(vitesse) + 1) % 3]!;
        if (audio) audio.playbackRate = vitesse;
        return majBoutons();
      }
      case 'trad': {
        const sans = root.classList.toggle('sans-trad');
        memoriserTraduction(opt.profileId, !sans);
        return majBoutons();
      }
    }
  }
  function clavier(e: KeyboardEvent) {
    if (e.key === 'Escape') return fermer();
    if ((e.target as Element).closest('button')) return;
    if (e.key === ' ') {
      e.preventDefault();
      basculer();
    }
    if (debut && e.key === 'ArrowRight') void jouer(idx + 1);
    if (debut && e.key === 'ArrowLeft') void jouer(idx - 1);
  }
  function basculer() {
    if (!debut) return;
    pause = !pause;
    if (audio) void (pause ? audio.pause() : audio.play().catch(() => {}));
    majBoutons();
  }
  function majBoutons() {
    const q = (k: string) => root.querySelector<HTMLElement>(`[data-k="${k}"]`)!;
    const l = q('lire');
    l.innerHTML = pause
      ? '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
    l.setAttribute('aria-label', t(pause ? 'vv.lecture' : 'vv.pause'));
    l.toggleAttribute('disabled', !debut);
    q('vitesse').textContent = t('vv.vitesse', { v: String(vitesse).replace('.', ',') });
    const sans = root.classList.contains('sans-trad');
    q('trad').textContent = t(sans ? 'bib.voir_traduction' : 'bib.cacher_traduction');
    q('trad').setAttribute('aria-pressed', String(sans));
    root.toggleAttribute('data-pause', pause && debut);
  }
  function fermer() {
    jeton++;
    audio?.pause();
    seul?.pause();
    root.remove();
    document.getElementById('vv2-feuille')?.remove();
    document.documentElement.classList.remove('vv-ouvert');
    if (fermerOuvert === fermer) fermerOuvert = null;
    (retour as HTMLElement | null)?.focus?.();
  }

  // ———————————————————————————————— temps et voix ————————————————————————————————
  /** horloge accélérée du contrôle de mise en page (journal de test seulement) */
  const vite = journal()?.vite ?? 1;
  /** progression de 0 à 1 sur `ms` (vitesse, pause), coupée si la scène change */
  function prog(ms: number, f?: (p: number) => void): Promise<void> {
    const j = jeton;
    return new Promise((ok, ko) => {
      let fait = 0;
      let t0 = performance.now();
      const tick = (x: number) => {
        if (j !== jeton) return ko(new Coupe());
        if (!pause) fait += (x - t0) * vitesse * vite;
        t0 = x;
        f?.(Math.min(1, fait / ms));
        if (fait >= ms) return ok();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }
  const att = (ms: number) => prog(ms);
  /** une suite d'une scène quittée s'arrête (après toute attente qui n'est pas un minuteur de `prog`) */
  function vivant(j: number) {
    if (j !== jeton) throw new Coupe();
  }
  /** V2 — durée réelle (ms) du son d'un texte, + 250 ms de souffle ; 0 sans son */
  const duree = (x?: T) => {
    const id = x?.son ? audioIdFor(x.dit ?? x.ar, opt.audio) : null;
    return id ? (durees.get(id) ?? 1000) + 250 : 0;
  };
  /** V2 — lit les durées des fichiers d'un mode (métadonnées seulement, quelques Ko, déjà hors ligne) */
  async function precharger(scs: Scene[]) {
    const ids = new Set<string>();
    const walk = (x: unknown): void => {
      if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === 'object') {
        const o = x as { ar?: unknown; son?: number; dit?: string };
        if (typeof o.ar === 'string' && o.son === 1) {
          const id = audioIdFor(o.dit ?? o.ar, opt.audio);
          if (id && !durees.has(id)) ids.add(id);
        }
        Object.values(o).forEach(walk);
      }
    };
    walk(scs);
    await Promise.all(
      [...ids].map(
        (id) =>
          new Promise<void>((ok) => {
            void leconsSource(id).then((s) => {
              const a = new Audio();
              a.preload = 'metadata';
              a.onloadedmetadata = () => {
                if (isFinite(a.duration)) durees.set(id, a.duration * 1000);
                ok();
              };
              a.onerror = () => ok();
              a.src = s.url;
            }, ok);
            setTimeout(ok, 2000);
          }),
      ),
    );
  }
  /** V2 — sous-titre : traduction du livre de ce qui est dit (vide : le bandeau s'efface) */
  function st(fr?: string) {
    const v = fr ?? '';
    if (sous.dataset.v === v) return;
    sous.dataset.v = v;
    sous.classList.toggle('vide', !v);
    if (v) sous.innerHTML = frH(v, 'x');
    journal()?.st?.push([v, Date.now()]);
  }
  /**
   * joue le fichier audio du texte s'il existe ; V2 : surligne le texte au rythme de la voix (mot par mot au prorata
   * des lettres ; un seul mot : un filet doré se remplit) ; sinon une courte attente
   */
  async function dire(x: T | undefined, el?: Element | null): Promise<void> {
    const id = x?.son ? audioIdFor(x.dit ?? x.ar, opt.audio) : null;
    el?.classList.add('joue');
    try {
      if (!id || vite > 1) return await att(400);
      const j = jeton;
      const s = await leconsSource(id).catch(() => null);
      // scène changée pendant l'attente : cette suite s'arrête (sinon elle continuerait dans la scène suivante)
      vivant(j);
      if (!s) return await att(500);
      const ws = el ? [...el.querySelectorAll<HTMLElement>('.w')] : [];
      // plusieurs mots : le mot dit s'allume ; un seul mot : un filet doré se remplit
      const sl = ws.length > 1 ? null : el?.querySelector<HTMLElement>('.sl');
      const poids = ws.map((w) => (w.textContent!.match(LETTRE) ?? []).length || 1);
      const tot = poids.reduce((a, b) => a + b, 0);
      await new Promise<void>((ok) => {
        const a = new Audio(s.url);
        a.preservesPitch = true;
        a.playbackRate = vitesse;
        audio = a;
        let fini = false;
        const fin = () => {
          if (fini) return;
          fini = true;
          audio = null;
          s.liberer?.();
          ok();
        };
        a.onended = a.onerror = fin;
        a.onplaying = () => (nSons++, journal()?.sons.push([id, Date.now()]));
        // connexion coupée ou lecture refusée : la scène continue en silence
        setTimeout(() => !pause && a.currentTime === 0 && fin(), 2500);
        if (!pause) a.play().catch(fin);
        const suivre = () => {
          const D = a.duration;
          if (!D || !isFinite(D)) return;
          // silence de tête et de queue des fichiers (~0,1 s) : le surlignage suit la voix, pas le fichier
          const p = Math.min(1, Math.max(0, (a.currentTime - 0.1) / Math.max(0.2, D - 0.25)));
          if (sl) sl.style.transform = `scaleX(${p})`;
          let acc = 0;
          const pos = p * tot;
          ws.forEach((w, k) => {
            w.classList.toggle('on', pos >= acc && (pos < acc + poids[k]! || k === ws.length - 1));
            acc += poids[k]!;
          });
        };
        const garde = () => {
          if (j !== jeton) return (a.pause(), fin());
          suivre();
          if (!fini) requestAnimationFrame(garde);
        };
        requestAnimationFrame(garde);
      });
      if (sl) sl.style.transform = 'scaleX(1)';
      ws.forEach((w) => w.classList.remove('on'));
      vivant(j);
      await att(250);
    } finally {
      el?.classList.remove('joue');
    }
  }
  /** toucher un mot : on l'entend, sans arrêter la scène */
  function ecouter(ar: string) {
    const id = audioIdFor(ar, opt.audio);
    if (!id) return;
    seul?.pause();
    void leconsSource(id).then((s) => {
      const a = (seul = new Audio(s.url));
      a.playbackRate = vitesse;
      a.preservesPitch = true;
      a.onended = () => s.liberer?.();
      void a.play().catch(() => {});
    });
  }

  // ———————————————————————————————— V2 : chapitres, estimation, barre ————————————————————————————————
  /** durée prévue d'une scène avec les durées réelles des sons (barre de progression) */
  function estime(sc: Scene): number {
    let n = 0;
    for (const x of sc.temps)
      switch (x.k) {
        case 'titre':
          n += lecture(x.fr, 2000, 3400) + (x.noms ?? []).reduce((s, y) => s + duree(y), 0);
          break;
        case 'bulle':
          n +=
            (x.dit ? duree(x.dit) : x.lignes.reduce((s, l) => s + duree(l), 0)) ||
            lecture(x.fr, 2200, 3600);
          break;
        case 'lettres':
          n += x.items.reduce((s, y) => s + duree(y.nom) + 350, 300);
          break;
        case 'mot':
          n += 200 + duree(x.ar) + lecture(x.fr);
          break;
        case 'texte':
          n += 300 + duree(x.ar) + lecture(x.fr);
          break;
        case 'aToi':
          n += aToiMs(sc, x) + (x.puis ?? []).reduce((s, y) => s + duree(y), 0);
          break;
        case 'bilan':
          n +=
            2000 +
            duree(x.vedette) +
            [...x.lettres, ...x.mots.filter((m) => !m.img).map((m) => m.ar)].reduce(
              (s, y) => s + duree(y),
              0,
            );
          break;
        default:
          n += x.ms;
      }
    return n;
  }
  /** V2 — ce que l'élève doit dire dans « À toi ! » : les éléments dits plus tôt dans la scène */
  function vusAvant(sc: Scene, x: Temps): T[] {
    const out: T[] = [];
    for (const y of sc.temps) {
      if (y === x) break;
      if (y.k === 'lettres') y.items.forEach((i) => i.nom && out.push(i.nom));
      if (y.k === 'mot' || y.k === 'texte') out.push(y.ar);
      if (y.k === 'nom') out.push(y.nom);
    }
    return out;
  }
  /** V2 — durée de « À toi ! » : 1,3 fois le temps de parole des audios du livre + 1 s, entre 2,5 et 9 s */
  function aToiMs(sc: Scene, x: Temps): number {
    const parle = vusAvant(sc, x).reduce((s, y) => s + (duree(y) || 1000), 0);
    return parle ? Math.min(9000, Math.max(2500, 1.3 * parle + 1000)) : x.ms;
  }
  function chapitres() {
    estim = scenes.map(estime);
    chaps = [];
    scenes.forEach((s, i) => {
      const c = s.chapitre ?? 'decouvrir';
      const l = chaps.at(-1);
      if (l && l.c === c) {
        l.a = i;
        l.ms += estim[i]!;
      } else chaps.push({ c, de: i, a: i, ms: estim[i]! });
    });
    root.querySelector('.barre')!.innerHTML = chaps
      .map(
        (x) =>
          `<span class="sg" style="flex-grow:${Math.max(1, Math.round(x.ms / 1000))}"><i></i></span>`,
      )
      .join('');
  }
  const chapDe = (i: number) => chaps.findIndex((x) => i >= x.de && i <= x.a);
  /** horloge de la barre : remplissage continu du chapitre en cours (transform seulement) */
  function horloge() {
    let t0 = performance.now();
    const tick = (x: number) => {
      if (!root.isConnected) return;
      if (debut && !pause) ecoule += (x - t0) * vitesse;
      t0 = x;
      const k = chapDe(idx);
      const sg = root.querySelectorAll<HTMLElement>('.barre .sg i');
      if (debut && k >= 0 && sg.length) {
        const ch = chaps[k]!;
        let fait = 0;
        for (let i = ch.de; i < idx; i++) fait += estim[i]!;
        fait += Math.min(ecoule, estim[idx]! * 0.98);
        sg.forEach((e, n) => {
          e.style.transform = `scaleX(${n < k ? 1 : n > k ? 0 : Math.min(1, fait / ch.ms)})`;
        });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  const nomChap = (c: Chapitre) => t(`vv.ch_${c}`);
  /** sommaire de 2 s : les chapitres de la vidéo, dans l'ordre, avec les scènes qu'ils contiennent */
  async function sommaire() {
    const o = h('div', 'ov somm');
    o.dataset.testid = 'vv-sommaire';
    o.innerHTML = `<p class="kk">${esc(t('vv.programme'))}</p><ol>${chaps
      .map(
        (x, n) =>
          `<li style="--i:${n}"><b>${n + 1}</b><span><strong>${esc(nomChap(x.c))}</strong><small>${[
            ...new Set(scenes.slice(x.de, x.a + 1).map(titreCourt)),
          ]
            .map(esc)
            .join(' · ')}</small></span></li>`,
      )
      .join('')}</ol>`;
    stage.append(o);
    journal()?.ch?.push([nomChap(chaps[0]!.c), Date.now()]);
    await att(2200);
    o.classList.add('sort');
    await att(220);
    o.remove();
  }
  /** intertitre d'un chapitre (1 s) */
  async function intertitre(k: number) {
    const o = h('div', 'ov inter-ch');
    o.innerHTML = `<p class="kk">${esc(t('vv.chapitre', { n: k + 1, total: chaps.length }))}</p><p class="nm">${esc(nomChap(chaps[k]!.c))}</p><div class="filet"><i></i></div>`;
    stage.append(o);
    journal()?.ch?.push([nomChap(chaps[k]!.c), Date.now()]);
    await att(1050);
    o.classList.add('sort');
    await att(220);
    o.remove();
  }

  // ———————————————————————————————— départ, modes, scènes ————————————————————————————————
  function depart() {
    debut = false;
    pause = true;
    jeton++;
    majBoutons();
    tete(t('vv.choisir'), '');
    root.querySelector('.barre')!.innerHTML = '';
    const L = opt.unit.lesson as { titre_fr?: string };
    const s = stage;
    s.innerHTML = '';
    const d = h('div', 'vv-dep');
    d.innerHTML = `${L.titre_fr ? titreH(L.titre_fr) : ''}<div class="filet"><i></i></div>`;
    let rep: { m?: VideoMode; l?: number; i?: number; s?: string } = {};
    try {
      rep = JSON.parse(localStorage.getItem(cle) ?? '{}') ?? {};
    } catch {
      /* navigation privée */
    }
    if (rep.s === vid.source.slice(0, 12) && rep.m && vid.modes.includes(rep.m) && rep.i) {
      const b = h('button', 'bouton or', esc(t('vv.reprendre', { n: rep.i + 1 })));
      b.dataset.testid = 'vv-reprendre';
      b.onclick = () => void lancer(rep.m!, rep.l ?? 0, rep.i);
      d.append(b);
    }
    for (const m of vid.modes) {
      const ms = m === 'lettre' ? dureeMode(vid, m, 0) : dureeMode(vid, m);
      const dur =
        m === 'quiz'
          ? ''
          : ms < 90_000
            ? t('vv.duree_s', { s: Math.round(ms / 10_000) * 10 })
            : t('vv.duree', { m: Math.round(ms / 60_000) });
      const b = h(
        'button',
        'mode',
        `<b>${esc(t(`vv.mode_${m}`))}</b><span>${esc(t(m === 'courte' && vid.scenes.some((s) => s.id === 'courte-vedette') ? 'vv.mode_courte_p' : `vv.mode_${m}_d`))}${dur ? ` · ${esc(dur)}` : ''}</span>`,
      );
      b.dataset.mode = m;
      b.onclick = () =>
        m === 'lettre' && vid.lettres.length > 1 ? choixLettre() : void lancer(m, 0);
      d.append(b);
    }
    s.append(d);
  }
  function choixLettre() {
    const d = h('div', 'vv-dep', `<p class="consigne">${esc(t('vv.quelle_lettre'))}</p>`);
    const r = h('div', 'rangee');
    vid.lettres.forEach((x, k) => {
      const b = h('button', 'tuile', arH(x.l, 'g'));
      b.onclick = () => void lancer('lettre', k);
      r.append(b);
    });
    d.append(r);
    stage.replaceChildren(d);
  }
  async function lancer(m: VideoMode, lettre: number, i = 0) {
    modeChoisi = m;
    lettreChoisie = lettre;
    scenes = scenesDuMode(vid, m, lettre);
    score = { ok: 0, n: 0 };
    const j = ++jeton;
    stage.replaceChildren(h('div', 'vv-dep', `<p class="k">${esc(t('vv.chargement'))}</p>`));
    // durées réelles des sons (rythme et barre), puis le carton d'ouverture d'un enregistrement
    await precharger(scenes);
    if (rec?.attente) await rec.attente;
    // lecteur fermé ou autre mode choisi pendant le chargement
    if (j !== jeton) return;
    chapitres();
    debut = true;
    pause = false;
    vu = annonce = -1;
    idx = i;
    majBoutons();
    void jouer(i, i === 0);
  }
  function tete(s: string, k: string) {
    root.querySelector('.vv-t .s')!.innerHTML = frH(s, 'x');
    root.querySelector('.vv-t .k')!.textContent = k;
  }
  function titreDe(sc: Scene): string {
    const x = sc.titre;
    return 'fr' in x ? x.fr : t(x.cle, { n: x.n, total: x.total });
  }
  /** titre d'une scène pour le sommaire et l'en-tête de carte (titre du livre avec de l'arabe : libellé court) */
  function titreCourt(sc: Scene): string {
    const titre = titreDe(sc);
    const court: Record<string, string> = {
      notion: 'vv.notion',
      quiz: 'vv.quiz',
      dialogue: 'vv.dialogue',
    };
    return frH(titre).includes('ar l') ? t(court[sc.part] ?? 'vv.titre') : titre;
  }
  async function jouer(i: number, ouverture = false): Promise<void> {
    if (i < 0) i = 0;
    if (i >= scenes.length) return fin();
    const j = ++jeton;
    audio?.pause();
    const sc = scenes[i]!;
    const k = chapDe(i);
    // `idx` ne passe à la scène qu'après le sommaire ou l'intertitre : « suivant » pendant l'intertitre ouvre la scène
    // annoncée (sans le rejouer), jamais celle d'après
    try {
      // V2 — sommaire au départ ; intertitre à chaque nouveau chapitre (pas pour le premier)
      if (ouverture && chaps.length > 1) {
        stage.replaceChildren();
        tete(nomChap(chaps[0]!.c), `${t(`vv.mode_${modeChoisi}`)} · ${titreDe(scenes[0]!)}`);
        await sommaire();
        vivant(j);
      } else if (k > 0 && chapDe(vu) !== k && annonce !== i) {
        annonce = i;
        tete(nomChap(chaps[k]!.c), `${t(`vv.mode_${modeChoisi}`)} · ${titreDe(scenes[0]!)}`);
        root.querySelector('.nch')!.textContent = `${k + 1}/${chaps.length}`;
        await intertitre(k);
        vivant(j);
      }
    } catch (e) {
      if (!(e instanceof Coupe)) throw e;
      return;
    }
    idx = vu = i;
    annonce = -1;
    ecoule = 0;
    const titre = titreDe(sc);
    const long = frH(titre).includes('ar l');
    titreCarte = long ? titre : '';
    tete(
      nomChap(sc.chapitre ?? 'decouvrir'),
      `${t(`vv.mode_${modeChoisi}`)} · ${titreDe(scenes[0]!)}`,
    );
    root.querySelector('.nch')!.textContent = chaps.length > 1 ? `${k + 1}/${chaps.length}` : '';
    try {
      localStorage.setItem(
        cle,
        JSON.stringify({ m: modeChoisi, l: lettreChoisie, i, s: vid.source.slice(0, 12) }),
      );
    } catch {
      /* navigation privée */
    }
    stage.innerHTML = '';
    stage.dataset.scene = sc.id;
    journal()?.scenes?.push([sc.id, Date.now()]);
    const tr = sc.temps.find((x) => x.k === 'trace');
    const fam = tr?.k === 'trace' ? famille(tr.l) : undefined;
    if (fam) stage.style.setProperty('--fam', fam);
    else stage.style.removeProperty('--fam');
    // V2 — en-tête de carte (titre de la scène), pastille de consigne, zone, sous-titre
    const tc = h('p', 'sc-h', esc(titreCourt(sc)));
    band = h('p', 'cs');
    band.dataset.testid = 'vv-bandeau';
    zone = h('div', sc.part === 'lettres' ? 'vv-c lt entre' : 'vv-c entre');
    sous = h('div', 'st vide');
    // scène sans traduction (lettres, récapitulatif) : le bandeau ne prend pas de place
    if (!sc.temps.some((x) => (x as { fr?: string }).fr)) sous.classList.add('nul');
    sous.setAttribute('aria-live', 'polite');
    stage.append(tc, band, zone, sous);
    try {
      const n0 = nSons;
      for (const x of sc.temps) {
        await temps(x, sc);
        vivant(j);
      }
      // aucune scène muette quand un texte affiché a sa voix : les textes de secours sont dits
      if (nSons === n0) for (const v of sc.voix ?? []) await dire(v);
      st('');
      await att(350);
      if (j === jeton) void jouer(i + 1);
    } catch (e) {
      if (!(e instanceof Coupe)) throw e;
    }
  }
  function fin() {
    jeton++;
    pause = true;
    debut = false;
    majBoutons();
    root
      .querySelectorAll<HTMLElement>('.barre .sg i')
      .forEach((e) => (e.style.transform = 'scaleX(1)'));
    const d = h(
      'div',
      'vv-dep fin',
      `<div class="filet"><i></i></div><p class="h">${esc(t('vv.fin'))}</p>`,
    );
    d.dataset.testid = 'vv-fin';
    if (score.n) d.append(h('p', 'score', esc(t('vv.score', score))));
    if (!rec) {
      const b1 = h('button', 'bouton', esc(t('vv.revoir')));
      b1.onclick = () => void lancer(modeChoisi, lettreChoisie);
      const b2 = h('button', 'bouton clair', esc(t('vv.autre')));
      b2.onclick = () => depart();
      d.append(b1, b2);
    }
    stage.replaceChildren(d);
    rec?.onFin?.();
  }

  function ajoute(html: string | HTMLElement, neuf = false): HTMLElement {
    const z = zone;
    if (neuf) z.replaceChildren();
    const e = typeof html === 'string' ? h('div', 'bloc', html) : html;
    e.classList.add('apparait', `b-${kind}`);
    z.append(e);
    tasse(e);
    return e;
  }
  function tasse(e: Element) {
    const z = zone;
    const deborde = () => z.scrollHeight > z.clientHeight + 2;
    for (let c = z.firstElementChild; c && c !== e && deborde();) {
      const n = c.nextElementSibling;
      if (!c.matches('.b-trace,.b-nom')) c.remove();
      c = n;
    }
    while (deborde() && z.firstElementChild && z.firstElementChild !== e)
      z.firstElementChild.remove();
    // un bloc seul plus haut que la scène (règle longue) : ses premiers morceaux laissent la place aux suivants
    for (
      let c = e.querySelector('.carte > .apparait');
      c?.nextElementSibling && deborde();
      c = e.querySelector('.carte > .apparait')
    )
      c.remove();
    // V2 — toujours trop haut : l'élément se réduit (0,9 … 0,6), sauf un texte à lire (règle, note), qui défile
    const el = e as HTMLElement;
    if (!el.matches('.b-regle,.b-fr,.b-retenir,.b-cles'))
      for (let k = 0.9; deborde() && k > 0.55; k -= 0.05) {
        el.style.zoom = String(k);
        journal()?.zoom?.push(`${stage.dataset.scene} ${el.className} ${k.toFixed(2)}`);
      }
  }
  /** temps de lecture ; un texte plus haut que la scène y défile lentement jusqu'à sa fin (jamais de texte caché) */
  function defile(ms: number): Promise<void> {
    const z = zone;
    const de = z.scrollTop;
    return prog(ms, (p) => {
      const fin = z.scrollHeight - z.clientHeight;
      if (fin > de) z.scrollTop = de + (fin - de) * Math.min(1, p * 1.25);
    });
  }
  /** tuile d'un texte du livre (V2 : mots découpés aux espaces et filet de surlignage) */
  function tuile(x: T, cls = ''): string {
    const inner = `${arW(x.ar)}<i class="sl" aria-hidden="true"></i>`;
    return x.son
      ? `<button class="tuile ${cls}" data-dire="${esc(x.ar)}">${inner}</button>`
      : `<span class="tuile ${cls}">${inner}</span>`;
  }
  function img(k?: string, cls = 'illu'): string {
    const d = k ? opt.illus[k] : undefined;
    return d
      ? `<svg class="${cls}" viewBox="${esc(d.viewBox)}" aria-hidden="true"><use href="#i-${esc(k!)}"/></svg>`
      : '';
  }
  function fr(s?: string, toujours = false): string {
    return s ? frH(s, toujours ? 'fr toujours' : 'fr') : '';
  }
  /** V2 — consigne de l'interface : pastille en haut de la carte (rien d'essentiel seulement à l'oral) */
  function consigne(cle: string) {
    if (band) {
      band.classList.remove('a-toi');
      band.innerHTML = `<span>${esc(t(cle))}</span>`;
    }
    return '';
  }

  /**
   * « À toi ! » — V2 : pastille verte avec minuteur discret (anneau + secondes) ; repères : les éléments de la scène
   * s'allument un à un pendant que l'élève parle ; puis la correction (audio du livre)
   */
  async function aToi(cle: string, ms: number, puis: T[] = [], reperes: HTMLElement[] = []) {
    if (band) {
      band.classList.add('a-toi');
      band.innerHTML = `<span class="mn"><svg viewBox="0 0 100 100"><circle class="fd" cx="50" cy="50" r="42"/><circle class="or" cx="50" cy="50" r="42"/></svg><b></b></span><span><strong>${esc(t('vv.a_toi'))}</strong> ${esc(t(cle))}</span>`;
    }
    const o = band?.querySelector<SVGElement>('.or');
    const sec = band?.querySelector('b');
    const grand = reperes.length ? null : ajoute(anneau('', `<b>${esc(t('vv.a_toi'))}</b>`));
    const og = grand?.querySelector<SVGElement>('.or');
    st('');
    let n = -1;
    await prog(ms, (p) => {
      o?.style.setProperty('stroke-dashoffset', String(264 * p));
      og?.style.setProperty('stroke-dashoffset', String(264 * p));
      if (sec) sec.textContent = String(Math.max(1, Math.ceil(((1 - p) * ms) / 1000)));
      const k = Math.min(reperes.length - 1, Math.floor(p * reperes.length));
      if (k !== n && reperes.length) {
        reperes[n]?.classList.remove('on');
        reperes[k]?.classList.add('on');
        n = k;
      }
    });
    reperes.forEach((r) => r.classList.remove('on'));
    grand?.remove();
    band?.classList.remove('a-toi');
    if (band) band.innerHTML = '';
    for (const x of puis) {
      const el = zone.querySelector(`[data-dire="${CSS.escape(x.ar)}"]`);
      await dire(x, el);
    }
  }
  function reponse<R>(ms = 12_000): { p: Promise<R | null>; dire: (r: R) => void } {
    let dire: (r: R) => void = () => {};
    const d = ajoute(anneau('petit', ''));
    const o = d.querySelector<SVGElement>('.or')!;
    const p = new Promise<R | null>((ok, ko) => {
      let fini = false;
      const fin = (r: R | null) => {
        if (fini) return;
        fini = true;
        d.remove();
        ok(r);
      };
      dire = fin;
      prog(ms, (x) => {
        if (!fini) o.style.strokeDashoffset = String(264 * x);
      }).then(() => fin(null), ko);
    });
    return { p, dire };
  }
  function noter(ok: boolean) {
    score.n++;
    if (ok) score.ok++;
  }
  function retourTexte(r: unknown, ok: boolean) {
    ajoute(
      `<p class="retour ${ok ? 'ok' : 'ko'}">${esc(t(r === null ? 'vv.reponse' : ok ? 'vv.bravo' : 'vv.presque'))}</p>`,
    );
  }

  // ———————————————————————————————— les temps ————————————————————————————————
  async function temps(x: Temps, sc: Scene): Promise<void> {
    const lettres = sc.part === 'lettres';
    kind = x.k;
    // V2 — le sous-titre ne survit pas à ce qu'il traduit (une note, une règle, un exercice qui suit)
    if (!['mot', 'texte', 'bulle', 'joindre', 'aToi', 'inter', 'jouer'].includes(x.k)) st('');
    switch (x.k) {
      case 'titre': {
        const e = ajoute(
          `${x.fr ? titreH(x.fr, 'h titre-l') : ''}${x.ar ? arH(x.ar.ar, 'titre') : ''}<div class="filet"><i></i></div><div class="rangee"></div>`,
          true,
        );
        const r = e.querySelector('.rangee')!;
        for (const l of x.tableau ?? []) {
          r.append(h('span', 'apparait', arH(l.ar, 'g')));
          await att(450);
        }
        // voix dès l'ouverture : noms des lettres l'un après l'autre, sinon le titre arabe et les mots du tableau
        const vs = (x.noms ?? [x.ar, ...(x.tableau ?? [])]).filter((v) => v?.son);
        for (const v of vs) await dire(v);
        return att(vs.length ? 900 : lecture(x.fr, 2000, 3400) - 450 * (x.tableau?.length ?? 0));
      }
      case 'bulle': {
        const cote = x.cote === undefined ? '' : x.cote ? 'g' : 'd';
        const e = ajoute(
          `<div class="bulle ${cote}">${x.qui ? arH(x.qui, 'qui') : ''}${x.lignes.map((l) => `<div class="li">${arW(l.ar)}</div>`).join('')}</div>`,
        );
        st(x.fr);
        const lis = [...e.querySelectorAll('.li')];
        // bulle dite d'un trait (`dit`) : toute la bulle s'allume ; sinon ligne par ligne
        if (x.dit) await dire(x.dit, e.firstElementChild);
        else if (x.lignes.some((l) => l.son))
          for (const [k, l] of x.lignes.entries()) await dire(l, lis[k]);
        else return att(lecture(x.fr, 2200, 3600));
        return att(lecture(x.fr, 600, 1600));
      }
      case 'objectif':
        ajoute(`<div class="carte">${x.ar ? arH(x.ar.ar) : ''}${fr(x.fr, true)}</div>`);
        if (x.ar?.son) await dire(x.ar);
        return att(x.ar?.son ? 1500 : x.ms);
      case 'trace': {
        const e = ajoute('<div class="trace-h"></div>', true);
        const trace = await tracer(e.firstElementChild as HTMLElement, x.l, x.l, 0, 6.5);
        if (trace) zone.append(h('p', 'src b-src', esc(t('vv.traits_source'))));
        return att(600);
      }
      case 'nom': {
        const e = ajoute(`${consigne(x.consigne.cle)}${tuile(x.nom, 'nom')}`);
        await dire(x.nom, e.querySelector('.tuile'));
        return att(400);
      }
      case 'points':
        ajoute(`${x.ar ? arH(x.ar.ar, 'points') : ''}${fr(x.fr, true)}`);
        if (x.ar?.son) await dire(x.ar);
        return att(x.ms);
      case 'formes': {
        const lab = ['vv.isolee', 'vv.debut', 'vv.milieu', 'vv.fin_mot'];
        const l = sc.temps.find((y) => y.k === 'trace');
        const e = ajoute('<div class="formes"></div>');
        const r = e.firstElementChild!;
        for (let k = 0; k < x.formes.length; k++) {
          const f = h(
            'div',
            'forme apparait',
            `<div class="g"></div><span>${esc(t(lab[k] ?? ''))}</span>`,
          );
          r.append(f);
          if (l?.k === 'trace')
            await tracer(f.firstElementChild as HTMLElement, x.formes[k]!, l.l, k, 2.2);
          else f.firstElementChild!.innerHTML = arH(x.formes[k]!);
          await att(400);
        }
        return att(1200);
      }
      case 'rangee': {
        const e = ajoute(
          `${x.consigne ? consigne(x.consigne.cle) : ''}<div class="rangee">${x.items.map((y) => tuile(y)).join('')}</div>`,
          !lettres,
        );
        const tu = [...e.querySelectorAll<HTMLElement>('.tuile')];
        if (x.aToi) await aToi('vv.lis_ligne', x.aToi, [], tu);
        for (let k = 0; k < x.items.length; k++) await dire(x.items[k], tu[k]);
        return att(300);
      }
      case 'joindre': {
        const e = ajoute(
          `<div class="joindre">${x.morceaux.map((m) => `<span>${arH(m.ar)}</span>`).join('')}</div>`,
        );
        const j = e.firstElementChild!;
        for (let k = 0; k < x.morceaux.length; k++) await dire(x.morceaux[k], j.children[k]);
        await att(400);
        j.classList.add('serre');
        await att(1000);
        e.innerHTML = tuile(x.mot, 'mot');
        st(x.fr);
        await dire(x.mot, e.firstElementChild);
        return att(lecture(x.fr));
      }
      case 'texte': {
        const e = ajoute(tuile(x.ar, `t${x.taille}`));
        if (!band.textContent) consigne('vv.ecoute_mot');
        st(x.fr);
        await att(300);
        await dire(x.ar, e.firstElementChild);
        return att(lecture(x.fr));
      }
      case 'inter': {
        const e = ajoute(
          `<div class="inter" dir="rtl">${x.ar.map((a, k) => `<span>${arH(a.ar)}<span class="fr">${esc(x.fr[k] ?? '')}</span></span>`).join('')}</div>`,
        );
        const sp = e.firstElementChild!.children;
        for (let k = 0; k < x.ar.length; k++) await dire(x.ar[k], sp[k]);
        return att(x.ms * 0.4);
      }
      case 'mot': {
        // V2 — un mot à la fois : image, mot, compteur ; la traduction passe en sous-titre
        const ms = sc.temps.filter((y) => y.k === 'mot');
        const n = ms.indexOf(x);
        const e = ajoute(
          `${ms.length > 1 ? `<p class="cpt">${n + 1} / ${ms.length}</p>` : ''}${img(x.img)}${tuile(x.ar, 'mot')}`,
          !lettres,
        );
        if (!band.textContent) consigne('vv.ecoute_mot');
        st(x.fr);
        await att(200);
        await dire(x.ar, e.querySelector('.tuile'));
        return att(lecture(x.fr));
      }
      case 'grille':
        ajoute(
          `${consigne('vv.touche')}<div class="grille">${x.items.map((y) => (y.ar.son ? `<button class="tuile" data-dire="${esc(y.ar.ar)}">` : '<span class="tuile">') + img(y.img, '') + arH(y.ar.ar) + (y.ar.son ? '</button>' : '</span>')).join('')}</div>`,
          true,
        );
        return att(x.ms);
      case 'regle': {
        const e = ajoute(
          `<div class="carte">${x.titre_ar ? arH(x.titre_ar.ar, 'titre') : ''}${x.titre_fr ? frH(x.titre_fr, 'h') : ''}${x.signe ? arH(x.signe, 'g') : ''}</div>`,
        );
        const cte = e.firstElementChild!;
        if (x.titre_ar?.son) await dire(x.titre_ar);
        for (const a of x.ar ?? []) {
          const d = h('div', 'apparait', arW(a.ar, 'l'));
          cte.append(d);
          tasse(e);
          if (a.son) await dire(a, d);
          await defile(a.son ? 500 : 1400);
        }
        for (const f of x.fr ?? []) {
          cte.append(h('div', 'apparait', frH(f, 'fr toujours')));
          tasse(e);
          await defile(1200 + 40 * f.length);
        }
        return att(800);
      }
      case 'fr':
        ajoute(`<div class="carte">${frH(x.fr, 'fr toujours')}</div>`);
        return defile(x.ms);
      case 'cles': {
        // une ligne par mot ou expression du livre (arabe sur sa ligne, sens en dessous), dite à son tour
        const e = ajoute(
          `${consigne('vv.ecoute_lis')}<div class="cles">${x.items.map((l) => `<div class="carte">${LATIN.test(l.ar.ar) ? frH(l.ar.ar, 'fr toujours') : tuile(l.ar, 'tm')}${fr(l.fr)}</div>`).join('')}</div>`,
          true,
        );
        const cs = e.querySelectorAll('.carte');
        for (const [k, l] of x.items.entries()) {
          const cc = cs[k]?.querySelector('.tuile') ?? cs[k];
          if (l.ar.son) await dire(l.ar, cc);
          else for (const d of l.dits ?? []) await dire(d, cc);
          await att(500);
        }
        return att(600);
      }
      case 'retenir': {
        const e = ajoute(
          `<div class="carte">${x.fr ? frH(x.fr, 'fr toujours') : ''}${x.ar ? tuile(x.ar, 'tm') : ''}</div>`,
          true,
        );
        await defile(1200 + 40 * (x.fr?.length ?? 0));
        if (x.ar) await dire(x.ar, e.querySelector('.tuile'));
        return att(1200);
      }
      case 'lettres': {
        // V2 — grille des lettres (couleur de famille) ; la lettre dite grandit doucement
        consigne('vv.ecoute_noms');
        const e = ajoute(`<div class="lgr n${Math.min(6, x.items.length)}"></div>`, true);
        for (const y of x.items) {
          const fam = famille(y.l);
          const d = h(
            'div',
            'lc apparait',
            `<span class="gl" style="${fam ? `--fam:${fam}` : ''}">${arH(y.l, 'g')}</span>${y.nom ? tuile(y.nom, 'nom') : ''}`,
          );
          e.firstElementChild!.append(d);
          tasse(e);
          await att(150);
          if (y.nom) {
            d.classList.add('joue');
            await dire(y.nom, d.querySelector('.tuile'));
            d.classList.remove('joue');
          }
          await att(200);
        }
        return att(300);
      }
      case 'aToi': {
        // V2 — repères : les lettres de la scène, ou les images des mots, ou le mot lui-même
        const ms = aToiMs(sc, x);
        const avant = sc.temps.slice(0, sc.temps.indexOf(x));
        const lt = avant.find((y) => y.k === 'lettres');
        const mots = avant.filter((y) => y.k === 'mot');
        let reperes: HTMLElement[];
        if (lt?.k === 'lettres') {
          reperes = [...zone.querySelectorAll<HTMLElement>('.lc')];
          zone.querySelectorAll('.lc .tuile').forEach((e) => e.classList.add('cache'));
        } else if (mots.length > 1) {
          const g = ajoute(
            `<div class="reps n${mots.length}">${mots.map((m) => (m.k === 'mot' ? `<span class="rp">${m.img ? img(m.img, '') : arH(m.ar.ar)}</span>` : '')).join('')}</div>`,
            true,
          );
          reperes = [...g.querySelectorAll<HTMLElement>('.rp')];
        } else reperes = [...zone.querySelectorAll<HTMLElement>('.tuile')].slice(-1);
        await aToi(x.consigne.cle, ms, x.puis, reperes);
        zone.querySelectorAll('.cache').forEach((e) => e.classList.remove('cache'));
        if (x.puis?.length) {
          const f = sc.temps.find((y) => y.k === 'texte' || y.k === 'mot');
          if (f && (f.k === 'texte' || f.k === 'mot')) st(f.fr);
          return att(lecture(f && 'fr' in f ? f.fr : '', 600, 1400));
        }
        return;
      }
      case 'bilan': {
        // V2 — récapitulatif : ce que la vidéo a montré ; les lettres et le mot vedette sont redits, chacun s'allumant
        const e = ajoute(
          `<div class="bil">${x.lettres.length ? `<div class="bl-l">${x.lettres.map((l) => `<span style="${famille(l.ar) ? `--fam:${famille(l.ar)}` : ''}">${arH(l.ar, 'g')}</span>`).join('')}</div>` : ''}${x.vedette ? `<div class="bl-v">${arH(x.vedette.ar)}</div>` : ''}${x.mots.length ? `<div class="bl-m">${x.mots.map((m) => `<span>${m.img ? img(m.img, '') : arH(m.ar.ar)}</span>`).join('')}</div>` : ''}</div>`,
          true,
        );
        e.querySelectorAll<HTMLElement>('.bil > *, .bl-m > span').forEach((el, k) => {
          el.style.setProperty('--i', String(k));
          el.classList.add('apparait');
        });
        tasse(e);
        await att(800);
        const ls = [...e.querySelectorAll('.bl-l > span')];
        for (const [k, l] of x.lettres.entries()) if (l.son) await dire(l, ls[k]);
        if (x.vedette?.son) await dire(x.vedette, e.querySelector('.bl-v'));
        const ms = [...e.querySelectorAll('.bl-m > span')];
        // les mots illustrés reviennent par leur image seule (rappel muet) ; un mot sans image est montré et redit
        for (const [k, m] of x.mots.entries()) if (!m.img && m.ar.son) await dire(m.ar, ms[k]);
        return att(1200);
      }
      case 'q':
        return question(x.q, sc.jouable === true, `${x.i + 1} / ${x.n}`);
      case 'jouer':
        return jouerScene(x.repliques);
    }
  }

  // ———————————————————————————————— exercices du livre (inchangés) ————————————————————————————————
  async function question(q: Question, jouable: boolean, rang: string): Promise<void> {
    const J = journal();
    if (J) J.q = q;
    ajoute(`${titreCarte ? frH(titreCarte, 'h') : ''}<p class="k">${esc(rang)}</p>`, true);
    const opts = (xs: string[], cls = '') =>
      `<div class="options ${cls}">${xs.map((o, k) => `<button class="opt" data-o="${k}">${choixH(o)}</button>`).join('')}</div>`;
    const choix = async (
      e: HTMLElement,
      xs: string[],
      bon: string | undefined,
      apres?: () => Promise<void>,
    ) => {
      const bs = [...e.querySelectorAll<HTMLButtonElement>('.opt')];
      if (!jouable || bon === undefined) {
        bs.forEach((b) => (b.disabled = true));
        await aToi(bon === undefined ? 'vv.epreuve' : 'vv.a_toi', 5000);
        if (bon !== undefined) {
          bs[xs.indexOf(bon)]?.classList.add('bon');
          ajoute(`<p class="retour">${esc(t('vv.sans_son'))}</p>`);
          await apres?.();
        }
        return att(1500);
      }
      const r = reponse<string>();
      bs.forEach((b) => (b.onclick = () => r.dire(xs[+b.dataset.o!]!)));
      const v = await r.p;
      bs.forEach((b, k) => {
        b.disabled = true;
        if (xs[k] === bon) b.classList.add('bon');
        else if (xs[k] === v) b.classList.add('faux');
      });
      noter(v === bon);
      retourTexte(v, v === bon);
      await apres?.();
      return att(900);
    };
    switch (q.k) {
      case 'ecoute': {
        const e = ajoute(
          `${q.dit?.son ? `<button class="ecoute" data-dire="${esc(q.dit.ar)}">▶ ${esc(t('vv.reecouter'))}</button>` : ''}${opts(q.options)}`,
        );
        if (q.dit?.son && jouable) await dire(q.dit);
        return choix(e, q.options, q.dit?.ar, () => dire(q.dit));
      }
      case 'premiere': {
        const e = ajoute(
          `${img(q.img)}<div class="trou" dir="rtl"><span class="case"></span>${arH(q.suite, 'suite')}</div>${fr(q.fr, true)}${opts(q.options)}`,
        );
        return choix(e, q.options, q.reponse, async () => {
          if (q.reponse) e.querySelector('.case')!.innerHTML = arH(q.reponse);
          if (q.mot) {
            const m = ajoute(tuile(q.mot, 'mot'));
            await dire(q.mot, m.firstElementChild);
          } else if (q.bonne?.son) await dire(q.bonne, e.querySelector('.case'));
        });
      }
      case 'complete': {
        // une indication en français du livre a sa propre ligne, au-dessus de la ligne arabe
        const ar = (s: string) => (s && RUN.test(s) ? arH(s, 'suite') : '');
        const lat = (s: string) => (s && !RUN.test(s) ? fr(s, true) : '');
        const e = ajoute(
          `${lat(q.avant)}${lat(q.apres)}<div class="trou" dir="rtl">${ar(q.avant)}<span class="case"></span>${ar(q.apres)}</div>${fr(q.fr, true)}${opts(q.options)}`,
        );
        return choix(e, q.options, q.reponse, async () => {
          if (q.reponse)
            e.querySelector('.case')!.innerHTML = RUN.test(q.reponse)
              ? arH(q.reponse)
              : esc(q.reponse);
          if (q.mot) {
            const m = ajoute(tuile(q.mot, 'mot'));
            await dire(q.mot, m.firstElementChild);
          } else if (q.bonne?.son) await dire(q.bonne, e.querySelector('.case'));
        });
      }
      case 'vf': {
        const e = ajoute(
          `${img(q.img)}${tuile(q.ar, 'tm')}${fr(q.fr, true)}<div class="options"><button class="opt" data-o="0">${esc(t('vv.vrai'))}</button><button class="opt" data-o="1">${esc(t('vv.faux'))}</button></div>`,
        );
        await dire(q.ar, e.querySelector('.tuile'));
        const xs = [t('vv.vrai'), t('vv.faux')];
        return choix(e, xs, q.vrai === undefined ? undefined : xs[q.vrai ? 0 : 1], async () => {
          if (q.correction) {
            const m = ajoute(tuile(q.correction, 'tm'));
            await dire(q.correction, m.firstElementChild);
          }
        });
      }
      case 'chasse': {
        const e = ajoute(
          `<p class="score">0 / ${q.grille.filter((l) => l === q.cible).length}</p><div class="grille g6">${q.grille.map((l, k) => `<button class="opt" data-o="${k}">${arH(l)}</button>`).join('')}</div>`,
        );
        const total = q.grille.filter((l) => l === q.cible).length;
        const bs = [...e.querySelectorAll<HTMLButtonElement>('.opt')];
        let trouve = 0;
        let erreurs = 0;
        const r = reponse<boolean>(20_000);
        bs.forEach((b, k) => {
          b.onclick = () => {
            if (q.grille[k] !== q.cible) return (erreurs++, b.classList.add('faux'));
            b.classList.add('bon');
            b.disabled = true;
            e.firstElementChild!.textContent = `${++trouve} / ${total}`;
            if (trouve === total) r.dire(true);
          };
        });
        const v = await r.p;
        bs.forEach(
          (b, k) => ((b.disabled = true), q.grille[k] === q.cible && b.classList.add('bon')),
        );
        noter(v === true && !erreurs);
        ajoute(`<p class="retour ${v ? 'ok' : 'ko'}">${esc(t('vv.il_y_en_a', { n: total }))}</p>`);
        return att(2000);
      }
      case 'contient': {
        const e = ajoute(
          // une règle de plusieurs mots (« نْ / تَنْوِينٌ + 15 حَرْفًا ») tient sur une ligne : la grille garde sa place
          `${arH(q.cible, /\s/.test(q.cible.trim()) ? 'g cible' : 'g')}<div class="grille g4">${q.mots.map((m, k) => `<button class="opt" data-o="${k}" aria-pressed="false">${choixH(m.ar.ar)}</button>`).join('')}</div>${jouable ? `<button class="bouton" data-v>${esc(t('vv.verifier'))}</button>` : ''}`,
        );
        const bs = [...e.querySelectorAll<HTMLButtonElement>('.opt')];
        if (!jouable) {
          bs.forEach((b) => (b.disabled = true));
          return aToi('vv.epreuve', 6000);
        }
        bs.forEach(
          (b) =>
            (b.onclick = () =>
              b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'))),
        );
        const r = reponse<boolean>(20_000);
        e.querySelector<HTMLElement>('[data-v]')!.onclick = () => r.dire(true);
        await r.p;
        let ok = true;
        bs.forEach((b, k) => {
          const pris = b.getAttribute('aria-pressed') === 'true';
          b.disabled = true;
          if (q.mots[k]!.oui) b.classList.add('bon');
          else if (pris) b.classList.add('faux');
          if (pris !== !!q.mots[k]!.oui) ok = false;
        });
        e.querySelector('[data-v]')?.remove();
        noter(ok);
        if (q.oui_fr) ajoute(fr(q.oui_fr, true));
        retourTexte(true, ok);
        for (const [k, m] of q.mots.entries()) if (m.oui) await dire(m.ar, bs[k]);
        return att(900);
      }
      case 'relier': {
        const n = q.items.length;
        const dec = Math.max(1, Math.floor(n / 2)) % Math.max(1, n);
        const droite = q.droite ?? q.items.map((_, k) => q.items[(k + dec) % n]!);
        const e = ajoute(
          `<div class="relier"><div>${q.items.map((x, k) => `<button class="opt" data-g="${k}">${arH(x.ar.ar)}</button>`).join('')}</div><div>${droite.map((x, k) => `<button class="opt" data-d="${k}">${img(x.img, 'mini')}${x.fr ? frH(x.fr, 'fr toujours') : ''}</button>`).join('')}</div></div>`,
        );
        const G = [...e.querySelectorAll<HTMLButtonElement>('[data-g]')];
        const D = [...e.querySelectorAll<HTMLButtonElement>('[data-d]')];
        if (!jouable || q.droite) {
          [...G, ...D].forEach((b) => (b.disabled = true));
          return aToi('vv.epreuve', 8000);
        }
        let sel = -1;
        let reste = n;
        let erreurs = 0;
        const r = reponse<boolean>(10_000 + 4000 * n);
        G.forEach(
          (b, k) =>
            (b.onclick = () => (
              G.forEach((x) => x.classList.remove('sel')),
              b.classList.add('sel'),
              (sel = k),
              void dire(q.items[k]!.ar)
            )),
        );
        D.forEach((b, k) => {
          b.onclick = () => {
            if (sel < 0) return;
            if ((k + dec) % n !== sel)
              return (
                erreurs++,
                b.classList.add('faux'),
                setTimeout(() => b.classList.remove('faux'), 600)
              );
            G[sel]!.classList.replace('sel', 'bon');
            b.classList.add('bon');
            G[sel]!.disabled = b.disabled = true;
            sel = -1;
            if (!--reste) r.dire(true);
          };
        });
        const v = await r.p;
        D.forEach(
          (b, k) => (
            (b.style.order = String((k + dec) % n)),
            (b.disabled = true),
            b.classList.add('bon')
          ),
        );
        G.forEach((b) => ((b.disabled = true), b.classList.add('bon')));
        noter(v === true && !erreurs);
        retourTexte(v, v === true && !erreurs);
        for (const [k, it] of q.items.entries()) if (it.ar.son) await dire(it.ar, G[k]);
        return att(1500);
      }
      case 'ordre': {
        const e = ajoute(
          `<div class="ligne-rep" dir="rtl"></div><div class="options">${q.mots.map((m, k) => `<button class="opt" data-o="${k}">${choixH(m)}</button>`).join('')}</div>`,
        );
        const rep = e.firstElementChild!;
        const bs = [...e.querySelectorAll<HTMLButtonElement>('.opt')];
        const fin = async (ok: boolean | null) => {
          bs.forEach((b) => (b.disabled = true));
          if (q.phrase) {
            rep.innerHTML = tuile(q.phrase, 'tm');
            await dire(q.phrase, rep.firstElementChild);
          }
          if (q.fr) st(q.fr);
          if (ok !== null) retourTexte(ok, ok);
        };
        if (!jouable || !q.ordre) {
          bs.forEach((b) => (b.disabled = true));
          await aToi(q.ordre ? 'vv.a_toi' : 'vv.epreuve', 6000);
          if (q.phrase) await fin(null);
          return att(1500);
        }
        const pris: number[] = [];
        const r = reponse<boolean>(8000 + 3000 * q.mots.length);
        bs.forEach((b, k) => {
          b.onclick = () => {
            b.disabled = true;
            pris.push(k);
            rep.append(h('span', 'tuile', choixH(q.mots[k]!)));
            if (pris.length === q.mots.length)
              r.dire(pris.every((x, i) => q.mots[x] === q.mots[q.ordre![i]!]));
          };
        });
        const v = await r.p;
        noter(v === true);
        await fin(v);
        return att(1200);
      }
    }
  }

  async function jouerScene(
    rs: Array<{ qui: string; qui_ar: string; ar: T; fr?: string }>,
  ): Promise<void> {
    const roles = [...new Map(rs.map((r) => [r.qui, r.qui_ar])).entries()];
    for (;;) {
      const e = ajoute(
        `<p class="h">${esc(t('vv.jouer'))}</p><p class="fr toujours">${esc(t('vv.choisis_role'))}</p><div class="roles"></div>`,
        true,
      );
      const box = e.querySelector('.roles')!;
      const choix = new Promise<string>((ok) => {
        for (const [qui, qa] of roles) {
          const b = h('button', 'bouton clair', arH(qa));
          b.onclick = () => ok(qui);
          box.append(b);
        }
        if (opt.tuteur) {
          const b = h('button', 'bouton', esc(t('vv.tuteur')));
          b.onclick = () => {
            fermer();
            opt.tuteur!({ unitId: opt.unit.id });
          };
          box.append(b);
        }
      });
      const j = jeton;
      const moi = await Promise.race([choix, prog(3_600_000).then(() => '')]);
      if (j !== jeton || !moi) return;
      zone.replaceChildren();
      for (const r of rs) {
        const b = ajoute(
          `<div class="bulle ${r.qui === moi ? 'd' : 'g'}">${arH(r.qui_ar, 'qui')}${tuile(r.ar)}</div>`,
        );
        st(r.fr);
        if (r.qui === moi) await aToi('vv.dis_replique', 2500 + 2 * duree(r.ar));
        else await dire(r.ar, b.querySelector('.tuile'));
        await att(300);
      }
      ajoute(`<p class="retour ok">${esc(t('vv.rejouer'))}</p>`);
      await att(1800);
    }
  }

  // ———————————————————————————————— tracé des lettres (inchangé) ————————————————————————————————
  async function tracer(
    host: HTMLElement,
    s: string,
    l: string,
    f: number,
    rem: number,
  ): Promise<boolean> {
    const j = jeton;
    const traits = (await chargerTraits())[l]?.[f]?.t;
    const F = rem * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
    const font = `700 ${F}px ${NASKH}`;
    await document.fonts.load(font, s).catch(() => undefined);
    vivant(j);
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return false;
    ctx.font = font;
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    const m = ctx.measureText(s);
    const W = Math.max(F * 0.8, m.width + F * 0.3);
    const H = F * 1.6;
    const B = F * 1.0;
    const txt = (cls: string) =>
      `<text class="${cls}" x="${W / 2}" y="${B}" text-anchor="middle" direction="rtl" font-family="Noto Naskh Arabic, serif" font-weight="700" font-size="${F}">${esc(s)}</text>`;
    host.innerHTML = `<svg class="trace" viewBox="0 0 ${W} ${H}" style="width:${W / 16}rem" role="img" aria-label="${esc(s)}">${traits ? txt('fantome') : ''}${txt('plein')}</svg>`;
    if (!traits) return false;
    const svg = host.firstElementChild as SVGSVGElement;
    let gL = W / 2 - m.actualBoundingBoxLeft;
    let gR = W / 2 + m.actualBoundingBoxRight;
    const tw = ctx.measureText(TATWEEL).width;
    if (s.startsWith(TATWEEL)) gR -= tw;
    if (s.endsWith(TATWEEL)) gL += tw;
    const A = ctx.measureText(ALIF).actualBoundingBoxAscent || F * 0.7;
    const pt = (x: number, y: number) =>
      `${(gL + (x / 100) * (gR - gL)).toFixed(1)} ${(B - (y / 100) * A).toFixed(1)}`;
    const ns = 'http://www.w3.org/2000/svg';
    const id = `vvm${Math.random().toString(36).slice(2, 8)}`;
    const mask = document.createElementNS(ns, 'mask');
    mask.id = id;
    mask.setAttribute('maskUnits', 'userSpaceOnUse');
    svg.prepend(mask);
    const plein = svg.querySelector('.plein')!;
    plein.setAttribute('mask', `url(#${id})`);
    const plume = document.createElementNS(ns, 'circle');
    plume.setAttribute('class', 'plume');
    plume.setAttribute('r', String(F * 0.045));
    svg.append(plume);
    for (const [n, p] of traits.entries()) {
      const d = `M${p.reduce<string[]>((a, v, k) => (k % 2 ? a : [...a, pt(v, p[k + 1]!)]), []).join('L')}`;
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'masque');
      path.setAttribute('stroke-width', String(F * 0.17));
      mask.append(path);
      const L = path.getTotalLength() || 1;
      path.style.strokeDasharray = `${L}`;
      path.style.strokeDashoffset = `${L}`;
      const [x0, y0] = pt(p[0]!, p[1]!).split(' ');
      const num = document.createElementNS(ns, 'text');
      num.setAttribute('class', 'num');
      num.setAttribute('x', String(+x0! + F * 0.12));
      num.setAttribute('y', String(+y0! - F * 0.1));
      num.setAttribute('font-size', String(F * 0.16));
      num.textContent = String(n + 1);
      if (F >= 60) svg.append(num);
      await prog(Math.max(900, L * 9), (q) => {
        path.style.strokeDashoffset = String(L * (1 - q));
        const o = path.getPointAtLength(L * q);
        plume.setAttribute('cx', String(o.x));
        plume.setAttribute('cy', String(o.y));
      });
    }
    plume.remove();
    plein.removeAttribute('mask');
    plein.classList.add('apparait');
    await att(500);
    return true;
  }
  init();
  return fermer;
}
