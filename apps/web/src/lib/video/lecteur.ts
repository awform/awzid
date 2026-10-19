/**
 * Vidéos vivantes (19/10/2026) — lecteur plein écran, chargé À LA DEMANDE (appui sur « Voir en vidéo »), jamais
 * préchargé (liste `/_app/video.json`, garde de poids dédiée dans scripts/budget.mjs). Il joue les scènes générées
 * par `buildVideo` (packages/content) depuis la leçon reçue : aucun texte de contenu n'est écrit ici, seulement des
 * textes d'interface (`vv.*`, embarqués dans ce morceau). L'arabe a toujours sa propre ligne (une lettre isolée citée
 * reste dans la phrase) ; la voix n'est QUE le fichier audio du texte (hors ligne : copie de l'appareil) ; aucune
 * musique, aucun visage. Tracé des lettres : seulement les formes validées par le référent (`traits.ts`).
 */
import {
  buildVideo,
  dureeMode,
  scenesDuMode,
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
import './lecteur.css';

/** tracés validés par le référent (`/video/traits.json`, généré par scripts/video-traits.mjs), chargés au premier tracé */
type Traits = Record<string, Array<number[][] | null>>;
let traitsP: Promise<Traits> | null = null;
const chargerTraits = () =>
  (traitsP ??= fetch('/video/traits.json')
    .then((r) => (r.ok ? (r.json() as Promise<Traits>) : ({} as Traits)))
    // hors ligne avant le premier usage : aucune forme tracée, la lettre est montrée complète
    .catch(() => ((traitsP = null), {} as Traits)));

export interface OuvrirOptions {
  unit: { id: string; levelCode: string; lesson: unknown };
  illus: Record<string, { viewBox: string }>;
  audio: LevelAudio | null;
  profileId?: string | null;
  /** jonction avec la conversation guidée du tuteur IA (facultative) : appelée depuis « À toi de jouer la scène ! » */
  tuteur?: (u: { unitId: string }) => void;
}

const c = String.fromCharCode;
const AR = `${c(0x600)}-${c(0x6ff)}`;
const RUN = new RegExp(`([${AR}][${AR}\\s.]*)`);
const LETTRE = new RegExp(`[${c(0x621)}-${c(0x64a)}]`, 'g');
const TATWEEL = c(0x640);
const ALIF = c(0x627);
const NASKH = '"Noto Naskh Arabic"';
/**
 * Couleur fixe par famille de lettres (charte des vidéos du livre 1, contraste ≥ 4,5:1 sur la carte) : dent,
 * crochet, lettres qui ne se lient pas, trois dents, emphatiques, gorge profonde, petites têtes, ك ل م ه, hamza.
 */
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

class Coupe extends Error {}
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[x]!);
function h(tag: string, cls = '', html = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}
const arH = (s: string, cls = '') => `<span class="ar ${cls}" lang="ar" dir="rtl">${esc(s)}</span>`;
/** texte français du livre : un passage arabe (2 lettres ou plus) passe sur sa propre ligne ; une lettre reste */
export function frH(s: string, cls = 'fr'): string {
  let out = '';
  let buf = '';
  for (const p of s.split(RUN)) {
    if (!p) continue;
    if (!RUN.test(p)) buf += esc(p);
    else if ((p.match(LETTRE) ?? []).length <= 1)
      buf += `<bdi class="lt" lang="ar" dir="rtl">${esc(p.trim())}</bdi>${/\s$/.test(p) ? ' ' : ''}`;
    else {
      if (buf.trim()) out += `<span class="${cls}">${buf}</span>`;
      buf = '';
      out += arH(p.trim(), 'l');
    }
  }
  if (buf.replace(/[\s.,;:]/g, '')) out += `<span class="${cls}">${buf}</span>`;
  return `<div class="frh">${out}</div>`;
}

let lecteur: Lecteur | null = null;

/** Ouvre le lecteur plein écran (un seul à la fois), après ses textes (catalogue `fr-video`, à la demande). */
export async function ouvrir(o: OuvrirOptions): Promise<void> {
  await loadTexts('video');
  lecteur?.fermer();
  lecteur = new Lecteur(o);
}

class Lecteur {
  o: OuvrirOptions;
  v: VideoLecon;
  root: HTMLElement;
  stage: HTMLElement;
  zone!: HTMLElement;
  band!: HTMLElement;
  kind = '';
  mode: VideoMode = 'longue';
  lettre = 0;
  scenes: Scene[] = [];
  i = 0;
  jeton = 0;
  pause = true;
  debut = false;
  vitesse = 1;
  audio: HTMLAudioElement | null = null;
  seul: HTMLAudioElement | null = null;
  score = { ok: 0, n: 0 };
  retour: Element | null;
  cle: string;

  constructor(o: OuvrirOptions) {
    this.o = o;
    this.retour = document.activeElement;
    this.cle = `awzid.vv.${o.unit.id}`;
    const la = o.audio;
    this.v = buildVideo(o.unit.lesson, {
      unitId: o.unit.id,
      hasAudio: (s) => !!audioIdFor(s, la),
      images: Object.keys(o.illus),
      audioList: la ? [...la.fichiers] : [],
    });
    stopLessonAudio();
    document.dispatchEvent(new Event('awzid-son'));
    const r = (this.root = h('div', 'vv'));
    r.setAttribute('role', 'dialog');
    r.setAttribute('aria-modal', 'true');
    r.setAttribute('aria-label', t('vv.titre'));
    r.dataset.testid = 'vv';
    r.classList.toggle('sans-trad', !traductionVisible(o.profileId));
    r.innerHTML = `<div class="vv-l"><header class="vv-t"><div class="tt"><span class="k"></span><b class="s"></b></div><button class="ib fermer" data-k="fermer" aria-label="${esc(t('vv.fermer'))}">✕</button></header><div class="seg" aria-hidden="true"></div><section class="vv-sc" aria-live="polite"></section><nav class="vv-cmd"><div class="rang"><button class="ib" data-k="prec" aria-label="${esc(t('vv.prec'))}"><svg viewBox="0 0 24 24"><path d="M6 5v14M18 6l-8 6 8 6z"/></svg></button><button class="ib lire" data-k="lire"></button><button class="ib" data-k="suiv" aria-label="${esc(t('vv.suiv'))}"><svg viewBox="0 0 24 24"><path d="M18 5v14M6 6l8 6-8 6z"/></svg></button><span class="temps"></span></div><div class="rang"><button class="puce" data-k="vitesse"></button><button class="puce" data-k="trad" data-testid="vv-trad"></button></div></nav></div>`;
    this.stage = r.querySelector('.vv-sc')!;
    document.body.append(r);
    document.documentElement.classList.add('vv-ouvert');
    r.addEventListener('click', (e) => this.clic(e));
    r.addEventListener('keydown', (e) => this.clavier(e));
    this.majBoutons();
    this.depart();
    r.querySelector<HTMLElement>('.fermer')!.focus();
  }

  // ———————————————————————————————— commandes ————————————————————————————————
  clic(e: MouseEvent) {
    const b = (e.target as Element).closest<HTMLElement>('[data-k],[data-dire]');
    if (!b) return;
    if (b.dataset.dire !== undefined) return this.ecouter(b.dataset.dire);
    switch (b.dataset.k) {
      case 'fermer':
        return this.fermer();
      case 'lire':
        return this.basculer();
      case 'prec':
        return this.debut ? void this.jouer(this.i - 1) : undefined;
      case 'suiv':
        return this.debut ? void this.jouer(this.i + 1) : undefined;
      case 'vitesse': {
        const V = [0.75, 1, 1.25];
        this.vitesse = V[(V.indexOf(this.vitesse) + 1) % 3]!;
        if (this.audio) this.audio.playbackRate = this.vitesse;
        return this.majBoutons();
      }
      case 'trad': {
        const sans = this.root.classList.toggle('sans-trad');
        memoriserTraduction(this.o.profileId, !sans);
        return this.majBoutons();
      }
    }
  }
  clavier(e: KeyboardEvent) {
    if (e.key === 'Escape') return this.fermer();
    if ((e.target as Element).closest('button')) return;
    if (e.key === ' ') {
      e.preventDefault();
      this.basculer();
    }
    if (this.debut && e.key === 'ArrowRight') void this.jouer(this.i + 1);
    if (this.debut && e.key === 'ArrowLeft') void this.jouer(this.i - 1);
  }
  basculer() {
    if (!this.debut) return;
    this.pause = !this.pause;
    if (this.audio) void (this.pause ? this.audio.pause() : this.audio.play().catch(() => {}));
    this.majBoutons();
  }
  majBoutons() {
    const q = (k: string) => this.root.querySelector<HTMLElement>(`[data-k="${k}"]`)!;
    const l = q('lire');
    l.innerHTML = this.pause
      ? '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
    l.setAttribute('aria-label', t(this.pause ? 'vv.lecture' : 'vv.pause'));
    l.toggleAttribute('disabled', !this.debut);
    q('vitesse').textContent = t('vv.vitesse', { v: String(this.vitesse).replace('.', ',') });
    const sans = this.root.classList.contains('sans-trad');
    q('trad').textContent = t(sans ? 'bib.voir_traduction' : 'bib.cacher_traduction');
    q('trad').setAttribute('aria-pressed', String(sans));
    this.root.toggleAttribute('data-pause', this.pause && this.debut);
  }
  fermer() {
    this.jeton++;
    this.audio?.pause();
    this.seul?.pause();
    this.root.remove();
    document.documentElement.classList.remove('vv-ouvert');
    if (lecteur === this) lecteur = null;
    (this.retour as HTMLElement | null)?.focus?.();
  }

  // ———————————————————————————————— temps et voix ————————————————————————————————
  /** progression de 0 à 1 sur `ms` (vitesse, pause), coupée si la scène change */
  prog(ms: number, f?: (p: number) => void): Promise<void> {
    const j = this.jeton;
    return new Promise((ok, ko) => {
      let fait = 0;
      let t0 = performance.now();
      const tick = (x: number) => {
        if (j !== this.jeton) return ko(new Coupe());
        if (!this.pause) fait += (x - t0) * this.vitesse;
        t0 = x;
        f?.(Math.min(1, fait / ms));
        if (fait >= ms) return ok();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }
  att = (ms: number) => this.prog(ms);
  /** joue le fichier audio du texte s'il existe (copie de l'appareil d'abord) ; sinon un court silence */
  async dire(x: T | undefined, el?: Element | null): Promise<void> {
    const id = x?.son ? audioIdFor(x.ar, this.o.audio) : null;
    el?.classList.add('joue');
    try {
      if (!id) return await this.att(700);
      const j = this.jeton;
      const s = await leconsSource(id).catch(() => null);
      if (!s) return await this.att(700);
      await new Promise<void>((ok) => {
        const a = new Audio(s.url);
        a.preservesPitch = true;
        a.playbackRate = this.vitesse;
        this.audio = a;
        let fini = false;
        const fin = () => {
          if (fini) return;
          fini = true;
          this.audio = null;
          s.liberer?.();
          ok();
        };
        a.onended = a.onerror = fin;
        // connexion coupée ou lecture refusée : la scène continue en silence
        setTimeout(() => !this.pause && a.currentTime === 0 && fin(), 2500);
        if (!this.pause) a.play().catch(fin);
        const garde = () =>
          j !== this.jeton ? (a.pause(), fin()) : fini || requestAnimationFrame(garde);
        requestAnimationFrame(garde);
      });
      await this.att(250);
    } finally {
      el?.classList.remove('joue');
    }
  }
  /** toucher un mot : on l'entend, sans arrêter la scène */
  ecouter(ar: string) {
    const id = audioIdFor(ar, this.o.audio);
    if (!id) return;
    this.seul?.pause();
    void leconsSource(id).then((s) => {
      const a = (this.seul = new Audio(s.url));
      a.playbackRate = this.vitesse;
      a.preservesPitch = true;
      a.onended = () => s.liberer?.();
      void a.play().catch(() => {});
    });
  }

  // ———————————————————————————————— départ, modes, scènes ————————————————————————————————
  depart() {
    this.debut = false;
    this.pause = true;
    this.jeton++;
    this.majBoutons();
    this.tete(t('vv.choisir'), '');
    this.root.querySelector('.seg')!.innerHTML = '';
    const L = this.o.unit.lesson as { titre_fr?: string };
    const s = this.stage;
    s.innerHTML = '';
    const d = h('div', 'vv-dep');
    d.innerHTML = `${L.titre_fr ? frH(L.titre_fr, 'h') : ''}<div class="filet"><i></i></div>`;
    let rep: { m?: VideoMode; l?: number; i?: number; s?: string } = {};
    try {
      rep = JSON.parse(localStorage.getItem(this.cle) ?? '{}') ?? {};
    } catch {
      /* navigation privée */
    }
    if (rep.s === this.v.source.slice(0, 12) && rep.m && this.v.modes.includes(rep.m) && rep.i) {
      const b = h('button', 'bouton or', esc(t('vv.reprendre', { n: rep.i + 1 })));
      b.dataset.testid = 'vv-reprendre';
      b.onclick = () => this.lancer(rep.m!, rep.l ?? 0, rep.i);
      d.append(b);
    }
    for (const m of this.v.modes) {
      const ms = m === 'lettre' ? dureeMode(this.v, m, 0) : dureeMode(this.v, m);
      const dur =
        m === 'quiz'
          ? ''
          : ms < 90_000
            ? t('vv.duree_s', { s: Math.round(ms / 10_000) * 10 })
            : t('vv.duree', { m: Math.round(ms / 60_000) });
      const b = h(
        'button',
        'mode',
        `<b>${esc(t(`vv.mode_${m}`))}</b><span>${esc(t(`vv.mode_${m}_d`))}${dur ? ` · ${esc(dur)}` : ''}</span>`,
      );
      b.dataset.mode = m;
      b.onclick = () =>
        m === 'lettre' && this.v.lettres.length > 1 ? this.choixLettre() : this.lancer(m, 0);
      d.append(b);
    }
    s.append(d);
  }
  choixLettre() {
    const d = h('div', 'vv-dep', `<p class="consigne">${esc(t('vv.quelle_lettre'))}</p>`);
    const r = h('div', 'rangee');
    this.v.lettres.forEach((x, k) => {
      const b = h('button', 'tuile', arH(x.l, 'g'));
      b.onclick = () => this.lancer('lettre', k);
      r.append(b);
    });
    d.append(r);
    this.stage.replaceChildren(d);
  }
  lancer(m: VideoMode, lettre: number, i = 0) {
    this.mode = m;
    this.lettre = lettre;
    this.scenes = scenesDuMode(this.v, m, lettre);
    this.score = { ok: 0, n: 0 };
    this.debut = true;
    this.pause = false;
    this.majBoutons();
    void this.jouer(i);
  }
  tete(s: string, k: string) {
    this.root.querySelector('.vv-t .s')!.innerHTML = frH(s, 'x');
    this.root.querySelector('.vv-t .k')!.textContent = k;
  }
  titre(sc: Scene): string {
    const x = sc.titre;
    return 'fr' in x ? x.fr : t(x.cle, { n: x.n, total: x.total });
  }
  async jouer(i: number): Promise<void> {
    if (i < 0) i = 0;
    if (i >= this.scenes.length) return this.fin();
    this.i = i;
    const j = ++this.jeton;
    this.audio?.pause();
    const sc = this.scenes[i]!;
    this.tete(this.titre(sc), t(`vv.mode_${this.mode}`));
    this.root.querySelector('.seg')!.innerHTML = this.scenes
      .map((_, k) => `<i class="${k < i ? 'fait' : k === i ? 'ici' : ''}"></i>`)
      .join('');
    this.root.querySelector('.temps')!.textContent = t('vv.scene', {
      n: i + 1,
      total: this.scenes.length,
    });
    try {
      localStorage.setItem(
        this.cle,
        JSON.stringify({ m: this.mode, l: this.lettre, i, s: this.v.source.slice(0, 12) }),
      );
    } catch {
      /* navigation privée */
    }
    this.stage.innerHTML = '';
    this.stage.dataset.scene = sc.id;
    const tr = sc.temps.find((x) => x.k === 'trace');
    const fam = tr?.k === 'trace' ? famille(tr.l) : undefined;
    if (fam) this.stage.style.setProperty('--fam', fam);
    else this.stage.style.removeProperty('--fam');
    this.zone = h('div', sc.part === 'lettres' ? 'vv-c lt' : 'vv-c');
    // bandeau vert de consigne, en bas de la carte (comme les vidéos du livre)
    this.band = h('p', 'bandeau');
    this.band.dataset.testid = 'vv-bandeau';
    this.stage.append(this.zone, this.band);
    try {
      for (const x of sc.temps) await this.temps(x, sc);
      await this.att(600);
      if (j === this.jeton) void this.jouer(i + 1);
    } catch (e) {
      if (!(e instanceof Coupe)) throw e;
    }
  }
  fin() {
    this.jeton++;
    this.pause = true;
    this.debut = false;
    this.majBoutons();
    const d = h('div', 'vv-dep', `<p class="h">${esc(t('vv.fin'))}</p>`);
    d.dataset.testid = 'vv-fin';
    if (this.score.n) d.append(h('p', 'score', esc(t('vv.score', this.score))));
    const b1 = h('button', 'bouton', esc(t('vv.revoir')));
    b1.onclick = () => this.lancer(this.mode, this.lettre);
    const b2 = h('button', 'bouton clair', esc(t('vv.autre')));
    b2.onclick = () => this.depart();
    d.append(b1, b2);
    this.stage.replaceChildren(d);
  }

  /** ajoute un élément à la scène ; si elle déborde, les éléments précédents laissent la place */
  ajoute(html: string | HTMLElement, neuf = false): HTMLElement {
    const z = this.zone;
    if (neuf) z.replaceChildren();
    const e = typeof html === 'string' ? h('div', 'bloc', html) : html;
    e.classList.add('apparait', `b-${this.kind}`);
    z.append(e);
    while (z.scrollHeight > z.clientHeight + 2 && z.firstElementChild !== e)
      z.firstElementChild!.remove();
    return e;
  }
  tuile(x: T, cls = ''): string {
    return x.son
      ? `<button class="tuile ${cls}" data-dire="${esc(x.ar)}">${arH(x.ar)}</button>`
      : `<span class="tuile ${cls}">${arH(x.ar)}</span>`;
  }
  img(k?: string, cls = 'illu'): string {
    const d = k ? this.o.illus[k] : undefined;
    return d
      ? `<svg class="${cls}" viewBox="${esc(d.viewBox)}" aria-hidden="true"><use href="#i-${esc(k!)}"/></svg>`
      : '';
  }
  fr(s?: string, toujours = false): string {
    return s ? frH(s, toujours ? 'fr toujours' : 'fr') : '';
  }
  /** consigne de l'interface : écrite dans le bandeau vert (rien d'essentiel seulement à l'oral) */
  consigne(cle: string) {
    if (this.band) this.band.textContent = t(cle);
    return '';
  }

  /** « À toi ! » : anneau doré qui se vide pendant que l'élève parle, puis la correction (audio du livre) */
  async aToi(cle: string, ms: number, puis: T[] = []) {
    this.consigne(cle);
    const d = this.ajoute(
      `<div class="atoi"><div class="anneau"><svg viewBox="0 0 100 100"><circle class="fd" cx="50" cy="50" r="42"/><circle class="or" cx="50" cy="50" r="42"/></svg><b>${esc(t('vv.a_toi'))}</b></div></div>`,
    );
    const o = d.querySelector<SVGElement>('.or')!;
    await this.prog(ms, (p) => (o.style.strokeDashoffset = String(264 * p)));
    d.remove();
    for (const x of puis) await this.dire(x);
  }
  /** attend une réponse (ou le délai : la réponse est alors montrée) */
  reponse<R>(ms = 12_000): { p: Promise<R | null>; dire: (r: R) => void } {
    let dire: (r: R) => void = () => {};
    const d = this.ajoute(
      '<div class="atoi"><div class="anneau petit"><svg viewBox="0 0 100 100"><circle class="fd" cx="50" cy="50" r="42"/><circle class="or" cx="50" cy="50" r="42"/></svg></div></div>',
    );
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
      this.prog(ms, (x) => {
        if (!fini) o.style.strokeDashoffset = String(264 * x);
      }).then(() => fin(null), ko);
    });
    return { p, dire };
  }
  noter(ok: boolean) {
    this.score.n++;
    if (ok) this.score.ok++;
  }
  retourTexte(r: unknown, ok: boolean) {
    this.ajoute(
      `<p class="retour ${ok ? 'ok' : 'ko'}">${esc(t(r === null ? 'vv.reponse' : ok ? 'vv.bravo' : 'vv.presque'))}</p>`,
    );
  }

  // ———————————————————————————————— les temps ————————————————————————————————
  async temps(x: Temps, sc: Scene): Promise<void> {
    const lettres = sc.part === 'lettres';
    this.kind = x.k;
    switch (x.k) {
      case 'titre': {
        const e = this.ajoute(
          `${x.fr ? frH(x.fr, 'h') : ''}${x.ar ? arH(x.ar, 'titre') : ''}<div class="filet"><i></i></div><div class="rangee"></div>`,
          true,
        );
        const r = e.querySelector('.rangee')!;
        for (const l of x.tableau ?? []) {
          r.append(h('span', 'apparait', arH(l.ar, 'g')));
          await this.att(450);
        }
        return this.att(x.ms - 450 * (x.tableau?.length ?? 0));
      }
      case 'bulle': {
        const cote = x.cote === undefined ? '' : x.cote ? 'g' : 'd';
        const e = this.ajoute(
          `<div class="bulle ${cote}">${x.qui ? arH(x.qui, 'qui') : ''}${x.lignes.map((l) => arH(l.ar)).join('')}${this.fr(x.fr)}</div>`,
        );
        for (const l of x.lignes) await this.dire(l, e.firstElementChild);
        return this.att(x.ms * 0.5);
      }
      case 'objectif':
        this.ajoute(`<div class="carte">${x.ar ? arH(x.ar.ar) : ''}${this.fr(x.fr, true)}</div>`);
        return this.att(x.ms);
      case 'trace': {
        const e = this.ajoute('<div class="trace-h"></div>', true);
        const trace = await this.tracer(e.firstElementChild as HTMLElement, x.l, x.l, 0, 8.5);
        if (trace) e.append(h('p', 'src', esc(t('vv.traits_source'))));
        return this.att(600);
      }
      case 'nom': {
        const e = this.ajoute(`${this.consigne(x.consigne.cle)}${this.tuile(x.nom, 'nom')}`);
        await this.dire(x.nom, e.querySelector('.tuile'));
        return this.att(x.ms * 0.4);
      }
      case 'points':
        this.ajoute(`${x.ar ? arH(x.ar, 'points') : ''}${this.fr(x.fr, true)}`);
        return this.att(x.ms);
      case 'formes': {
        const lab = ['vv.isolee', 'vv.debut', 'vv.milieu', 'vv.fin_mot'];
        const l = sc.temps.find((y) => y.k === 'trace');
        const e = this.ajoute('<div class="formes"></div>');
        const r = e.firstElementChild!;
        for (let k = 0; k < x.formes.length; k++) {
          const f = h(
            'div',
            'forme apparait',
            `<div class="g"></div><span>${esc(t(lab[k] ?? ''))}</span>`,
          );
          r.append(f);
          if (l?.k === 'trace')
            await this.tracer(f.firstElementChild as HTMLElement, x.formes[k]!, l.l, k, 2.6);
          else f.firstElementChild!.innerHTML = arH(x.formes[k]!);
          await this.att(400);
        }
        return this.att(1200);
      }
      case 'rangee': {
        const e = this.ajoute(
          `${x.consigne ? this.consigne(x.consigne.cle) : ''}<div class="rangee">${x.items.map((y) => this.tuile(y)).join('')}</div>`,
          !lettres,
        );
        const tu = [...e.querySelectorAll('.tuile')];
        if (x.aToi) await this.aToi('vv.a_toi', x.aToi);
        for (let k = 0; k < x.items.length; k++) await this.dire(x.items[k], tu[k]);
        return this.att(400);
      }
      case 'joindre': {
        const e = this.ajoute(
          `<div class="joindre">${x.morceaux.map((m) => `<span>${arH(m.ar)}</span>`).join('')}</div>`,
        );
        const j = e.firstElementChild!;
        for (let k = 0; k < x.morceaux.length; k++) await this.dire(x.morceaux[k], j.children[k]);
        await this.att(400);
        j.classList.add('serre');
        await this.att(1000);
        e.innerHTML = `${this.tuile(x.mot, 'mot')}${this.fr(x.fr)}`;
        await this.dire(x.mot, e.firstElementChild);
        return this.att(1200);
      }
      case 'texte': {
        const e = this.ajoute(`${this.tuile(x.ar, `t${x.taille}`)}${this.fr(x.fr)}`);
        await this.dire(x.ar, e.firstElementChild);
        return this.att(x.ms * 0.35);
      }
      case 'inter': {
        const e = this.ajoute(
          `<div class="inter" dir="rtl">${x.ar.map((a, k) => `<span>${arH(a.ar)}<span class="fr">${esc(x.fr[k] ?? '')}</span></span>`).join('')}</div>`,
        );
        const sp = e.firstElementChild!.children;
        for (let k = 0; k < x.ar.length; k++) await this.dire(x.ar[k], sp[k]);
        return this.att(x.ms * 0.4);
      }
      case 'mot': {
        const e = this.ajoute(
          `${this.img(x.img)}${this.tuile(x.ar, 'mot')}${this.fr(x.fr)}`,
          !lettres,
        );
        await this.att(300);
        await this.dire(x.ar, e.querySelector('.tuile'));
        return this.att(x.ms * 0.4);
      }
      case 'grille':
        this.ajoute(
          `${this.consigne('vv.touche')}<div class="grille">${x.items.map((y) => (y.ar.son ? `<button class="tuile" data-dire="${esc(y.ar.ar)}">` : '<span class="tuile">') + this.img(y.img, '') + arH(y.ar.ar) + (y.ar.son ? '</button>' : '</span>')).join('')}</div>`,
          true,
        );
        return this.att(x.ms);
      case 'regle': {
        const e = this.ajoute(
          `<div class="carte">${x.titre_ar ? arH(x.titre_ar, 'titre') : ''}${x.titre_fr ? frH(x.titre_fr, 'h') : ''}${x.signe ? arH(x.signe, 'g') : ''}</div>`,
        );
        const cte = e.firstElementChild!;
        for (const a of x.ar ?? []) {
          cte.append(h('div', 'apparait', arH(a.ar, 'l')));
          await this.att(1400);
        }
        for (const f of x.fr ?? []) {
          cte.append(h('div', 'apparait', frH(f, 'fr toujours')));
          await this.att(1200 + 40 * f.length);
        }
        return this.att(800);
      }
      case 'fr':
        this.ajoute(`<div class="carte">${frH(x.fr, 'fr toujours')}</div>`);
        return this.att(x.ms);
      case 'lettres': {
        const e = this.ajoute('<div class="grille lettres"></div>', true);
        for (const y of x.items) {
          const d = h(
            'div',
            'apparait',
            `${arH(y.l, 'g')}${y.nom ? this.tuile(y.nom, 'nom') : ''}`,
          );
          e.firstElementChild!.append(d);
          if (y.nom) await this.dire(y.nom, d.querySelector('.tuile'));
          await this.att(y.nom ? 500 : 600);
        }
        return this.att(800);
      }
      case 'aToi':
        return this.aToi(x.consigne.cle, x.ms - 1300 * (x.puis?.length ?? 0), x.puis);
      case 'q':
        return this.question(x.q, sc.jouable === true, `${x.i + 1} / ${x.n}`);
      case 'jouer':
        return this.jouerScene(x.repliques);
    }
  }

  // ———————————————————————————————— exercices du livre ————————————————————————————————
  async question(q: Question, jouable: boolean, rang: string): Promise<void> {
    this.ajoute(`<p class="k">${esc(rang)}</p>`, true);
    const opts = (xs: string[], cls = '') =>
      `<div class="options ${cls}">${xs.map((o, k) => `<button class="opt" data-o="${k}">${RUN.test(o) ? arH(o) : `<span class="fr toujours">${esc(o)}</span>`}</button>`).join('')}</div>`;
    const choix = async (
      e: HTMLElement,
      xs: string[],
      bon: string | undefined,
      apres?: () => Promise<void>,
    ) => {
      const bs = [...e.querySelectorAll<HTMLButtonElement>('.opt')];
      if (!jouable || bon === undefined) {
        bs.forEach((b) => (b.disabled = true));
        await this.aToi(bon === undefined ? 'vv.epreuve' : 'vv.a_toi', 5000);
        if (bon !== undefined) {
          bs[xs.indexOf(bon)]?.classList.add('bon');
          this.ajoute(`<p class="retour">${esc(t('vv.sans_son'))}</p>`);
          await apres?.();
        }
        return this.att(1500);
      }
      const r = this.reponse<string>();
      bs.forEach((b) => (b.onclick = () => r.dire(xs[+b.dataset.o!]!)));
      const v = await r.p;
      bs.forEach((b, k) => {
        b.disabled = true;
        if (xs[k] === bon) b.classList.add('bon');
        else if (xs[k] === v) b.classList.add('faux');
      });
      this.noter(v === bon);
      this.retourTexte(v, v === bon);
      await apres?.();
      return this.att(900);
    };
    switch (q.k) {
      case 'ecoute': {
        const e = this.ajoute(
          `${q.dit?.son ? `<button class="ecoute" data-dire="${esc(q.dit.ar)}">▶ ${esc(t('vv.reecouter'))}</button>` : ''}${opts(q.options)}`,
        );
        if (q.dit?.son && jouable) await this.dire(q.dit);
        return choix(e, q.options, q.dit?.ar, () => this.dire(q.dit));
      }
      case 'premiere': {
        const e = this.ajoute(
          `${this.img(q.img)}<div class="trou" dir="rtl"><span class="case"></span>${arH(q.suite, 'suite')}</div>${this.fr(q.fr, true)}${opts(q.options)}`,
        );
        return choix(e, q.options, q.reponse, async () => {
          if (q.reponse) e.querySelector('.case')!.innerHTML = arH(q.reponse);
          if (q.mot) {
            const m = this.ajoute(this.tuile(q.mot, 'mot'));
            await this.dire(q.mot, m.firstElementChild);
          }
        });
      }
      case 'complete': {
        const e = this.ajoute(
          `<div class="trou" dir="rtl">${q.avant ? (RUN.test(q.avant) ? arH(q.avant, 'suite') : esc(q.avant)) : ''}<span class="case"></span>${q.apres ? arH(q.apres, 'suite') : ''}</div>${this.fr(q.fr, true)}${opts(q.options)}`,
        );
        return choix(e, q.options, q.reponse, async () => {
          if (q.reponse)
            e.querySelector('.case')!.innerHTML = RUN.test(q.reponse)
              ? arH(q.reponse)
              : esc(q.reponse);
          if (q.mot) {
            const m = this.ajoute(this.tuile(q.mot, 'mot'));
            await this.dire(q.mot, m.firstElementChild);
          }
        });
      }
      case 'vf': {
        const e = this.ajoute(
          `${this.img(q.img)}${this.tuile(q.ar, 'tm')}${this.fr(q.fr, true)}<div class="options"><button class="opt" data-o="0">${esc(t('vv.vrai'))}</button><button class="opt" data-o="1">${esc(t('vv.faux'))}</button></div>`,
        );
        await this.dire(q.ar, e.querySelector('.tuile'));
        const xs = [t('vv.vrai'), t('vv.faux')];
        return choix(e, xs, q.vrai === undefined ? undefined : xs[q.vrai ? 0 : 1], async () => {
          if (q.correction) {
            const m = this.ajoute(this.tuile(q.correction, 'tm'));
            await this.dire(q.correction, m.firstElementChild);
          }
        });
      }
      case 'chasse': {
        const e = this.ajoute(
          `<p class="score">0 / ${q.grille.filter((l) => l === q.cible).length}</p><div class="grille g6">${q.grille.map((l, k) => `<button class="opt" data-o="${k}">${arH(l)}</button>`).join('')}</div>`,
        );
        const total = q.grille.filter((l) => l === q.cible).length;
        const bs = [...e.querySelectorAll<HTMLButtonElement>('.opt')];
        let trouve = 0;
        let erreurs = 0;
        const r = this.reponse<boolean>(20_000);
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
        this.noter(v === true && !erreurs);
        this.ajoute(
          `<p class="retour ${v ? 'ok' : 'ko'}">${esc(t('vv.il_y_en_a', { n: total }))}</p>`,
        );
        return this.att(2000);
      }
      case 'contient': {
        const e = this.ajoute(
          `${arH(q.cible, 'g')}<div class="grille g4">${q.mots.map((m, k) => `<button class="opt" data-o="${k}" aria-pressed="false">${arH(m.ar.ar)}</button>`).join('')}</div>${jouable ? `<button class="bouton" data-v>${esc(t('vv.verifier'))}</button>` : ''}`,
        );
        const bs = [...e.querySelectorAll<HTMLButtonElement>('.opt')];
        if (!jouable) {
          bs.forEach((b) => (b.disabled = true));
          return this.aToi('vv.epreuve', 6000);
        }
        bs.forEach(
          (b) =>
            (b.onclick = () =>
              b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'))),
        );
        const r = this.reponse<boolean>(20_000);
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
        this.noter(ok);
        if (q.oui_fr) this.ajoute(this.fr(q.oui_fr, true));
        this.retourTexte(true, ok);
        for (const [k, m] of q.mots.entries()) if (m.oui) await this.dire(m.ar, bs[k]);
        return this.att(900);
      }
      case 'relier': {
        // colonne de droite décalée (comme l'épreuve du livre) : l'élève touche un mot puis son sens
        const n = q.items.length;
        const dec = Math.max(1, Math.floor(n / 2)) % Math.max(1, n);
        const droite = q.droite ?? q.items.map((_, k) => q.items[(k + dec) % n]!);
        const e = this.ajoute(
          `<div class="relier"><div>${q.items.map((x, k) => `<button class="opt" data-g="${k}">${arH(x.ar.ar)}</button>`).join('')}</div><div>${droite.map((x, k) => `<button class="opt" data-d="${k}">${this.img(x.img, 'mini')}${x.fr ? `<span class="fr toujours">${esc(x.fr)}</span>` : ''}</button>`).join('')}</div></div>`,
        );
        const G = [...e.querySelectorAll<HTMLButtonElement>('[data-g]')];
        const D = [...e.querySelectorAll<HTMLButtonElement>('[data-d]')];
        if (!jouable || q.droite) {
          [...G, ...D].forEach((b) => (b.disabled = true));
          return this.aToi('vv.epreuve', 8000);
        }
        let sel = -1;
        let reste = n;
        let erreurs = 0;
        const r = this.reponse<boolean>(10_000 + 4000 * n);
        G.forEach(
          (b, k) =>
            (b.onclick = () => (
              G.forEach((x) => x.classList.remove('sel')),
              b.classList.add('sel'),
              (sel = k),
              void this.dire(q.items[k]!.ar)
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
        // réponse montrée : chaque sens rejoint la ligne de son mot
        D.forEach(
          (b, k) => (
            (b.style.order = String((k + dec) % n)),
            (b.disabled = true),
            b.classList.add('bon')
          ),
        );
        G.forEach((b) => ((b.disabled = true), b.classList.add('bon')));
        this.noter(v === true && !erreurs);
        this.retourTexte(v, v === true && !erreurs);
        return this.att(2500);
      }
      case 'ordre': {
        const e = this.ajoute(
          `<div class="ligne-rep" dir="rtl"></div><div class="options">${q.mots.map((m, k) => `<button class="opt" data-o="${k}">${RUN.test(m) ? arH(m) : esc(m)}</button>`).join('')}</div>`,
        );
        const rep = e.firstElementChild!;
        const bs = [...e.querySelectorAll<HTMLButtonElement>('.opt')];
        const fin = async (ok: boolean | null) => {
          bs.forEach((b) => (b.disabled = true));
          if (q.phrase) {
            rep.innerHTML = this.tuile(q.phrase, 'tm');
            await this.dire(q.phrase, rep.firstElementChild);
          }
          if (q.fr) this.ajoute(this.fr(q.fr));
          if (ok !== null) this.retourTexte(ok, ok);
        };
        if (!jouable || !q.ordre) {
          bs.forEach((b) => (b.disabled = true));
          await this.aToi(q.ordre ? 'vv.a_toi' : 'vv.epreuve', 6000);
          if (q.phrase) await fin(null);
          return this.att(1500);
        }
        const pris: number[] = [];
        const r = this.reponse<boolean>(8000 + 3000 * q.mots.length);
        bs.forEach((b, k) => {
          b.onclick = () => {
            b.disabled = true;
            pris.push(k);
            rep.append(
              h('span', 'tuile', RUN.test(q.mots[k]!) ? arH(q.mots[k]!) : esc(q.mots[k]!)),
            );
            if (pris.length === q.mots.length)
              r.dire(pris.every((x, i) => q.mots[x] === q.mots[q.ordre![i]!]));
          };
        });
        const v = await r.p;
        this.noter(v === true);
        await fin(v);
        return this.att(1200);
      }
    }
  }

  /** « À toi de jouer la scène ! » : l'élève choisit un rôle, l'appli joue les autres (audio du livre) */
  async jouerScene(rs: Array<{ qui: string; qui_ar: string; ar: T; fr?: string }>): Promise<void> {
    const roles = [...new Map(rs.map((r) => [r.qui, r.qui_ar])).entries()];
    for (;;) {
      const e = this.ajoute(
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
        if (this.o.tuteur) {
          const b = h('button', 'bouton', esc(t('vv.tuteur')));
          b.onclick = () => this.o.tuteur!({ unitId: this.o.unit.id });
          box.append(b);
        }
      });
      const j = this.jeton;
      const moi = await Promise.race([choix, this.prog(3_600_000).then(() => '')]);
      if (j !== this.jeton || !moi) return;
      this.zone.replaceChildren();
      for (const r of rs) {
        const b = this.ajoute(
          `<div class="bulle ${r.qui === moi ? 'd' : 'g'}">${arH(r.qui_ar, 'qui')}${arH(r.ar.ar)}${this.fr(r.fr)}</div>`,
        );
        if (r.qui === moi) await this.aToi('vv.dis_replique', 5000);
        else await this.dire(r.ar, b.firstElementChild);
        await this.att(400);
      }
      this.ajoute(`<p class="retour ok">${esc(t('vv.rejouer'))}</p>`);
      await this.att(1800);
    }
  }

  // ———————————————————————————————— tracé des lettres ————————————————————————————————
  /**
   * Lettre (ou forme du livre) dans la police du cahier (Noto Naskh Arabic 700). Forme VALIDÉE (`traits.ts`) : un
   * masque suit le trajet de la plume, trait par trait (numérotés), puis les points et signes apparaissent ; trajets
   * recalés sur le contour réel de la forme (boîte d'encre mesurée, liaisons retirées). Sinon : la lettre complète,
   * sans animation de traits. Renvoie vrai si la forme a été tracée.
   */
  async tracer(host: HTMLElement, s: string, l: string, f: number, rem: number): Promise<boolean> {
    const traits = (await chargerTraits())[l]?.[f];
    const F = rem * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
    const font = `700 ${F}px ${NASKH}`;
    await document.fonts.load(font, s).catch(() => undefined);
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return false;
    ctx.font = font;
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    const m = ctx.measureText(s);
    const W = Math.max(F * 0.9, m.width + F * 0.5);
    const H = F * 1.6;
    const B = F * 1.0;
    const txt = (cls: string, extra = '') =>
      `<text class="${cls}" x="${W / 2}" y="${B}" text-anchor="middle" direction="rtl" style="font:${font}"${extra}>${esc(s)}</text>`;
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
      svg.append(num);
      await this.prog(Math.max(900, L * 9), (q) => {
        path.style.strokeDashoffset = String(L * (1 - q));
        const o = path.getPointAtLength(L * q);
        plume.setAttribute('cx', String(o.x));
        plume.setAttribute('cy', String(o.y));
      });
    }
    // les points et les signes, après le corps
    plume.remove();
    plein.removeAttribute('mask');
    plein.classList.add('apparait');
    await this.att(500);
    return true;
  }
}
