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
// feuille du lecteur reliée à l'ouverture (fichier du site : CSP « style-src 'self' ») ; un `import './lecteur.css'`
// la ferait relier par la page de leçon (SvelteKit relie les feuilles des imports dynamiques), même sans vidéo
import feuille from './lecteur.css?url';

/** tracés validés par le référent (`/video/traits.json`, généré par scripts/video-traits.mjs), chargés au premier tracé */
type Traits = Record<string, Array<{ s: string; t: number[][] } | null>>;
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
// passage arabe d'un texte français ; entre parenthèses ou guillemets, ceux-ci l'accompagnent sur sa ligne
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

/**
 * Journal de TEST (fabrication des MP4 d'essai, e2e/video-mp4.spec.ts) : sons joués (fichier, instant) et question en
 * cours. Il n'existe que si un test le crée avant l'ouverture (`window.__vv`) : rien n'est noté en usage normal.
 */
type Journal = { sons: Array<[string, number]>; q?: Question };
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
/** anneau doré qui se vide (« À toi ! », temps de réponse) */
const anneau = (cls: string, centre: string) =>
  `<div class="atoi"><div class="anneau ${cls}"><svg viewBox="0 0 100 100"><circle class="fd" cx="50" cy="50" r="42"/><circle class="or" cx="50" cy="50" r="42"/></svg>${centre}</div></div>`;
const arH = (s: string, cls = '') => `<span class="ar ${cls}" lang="ar" dir="rtl">${esc(s)}</span>`;
/** texte français du livre : un passage arabe (2 lettres ou plus) passe sur sa propre ligne ; une lettre reste */
export function frH(s: string, cls = 'fr'): string {
  let out = '';
  let buf = '';
  // après une ligne arabe, la ponctuation qui la suivait ne commence pas la ligne française (« , la ligature »)
  const fl = () => (out ? buf.replace(/^\s*[,;.?!]\s*/, '') : buf);
  for (const p of s.split(RUN)) {
    if (!p) continue;
    if (!RUN.test(p)) buf += esc(p);
    else if ((p.match(LETTRE) ?? []).length <= 1)
      buf += `<bdi class="lt" lang="ar" dir="rtl">${esc(p.trim())}</bdi>${/\s$/.test(p) ? ' ' : ''}`;
    else {
      if (buf.trim()) out += `<span class="${cls}">${fl()}</span>`;
      buf = '';
      out += arH(p.trim(), 'l');
    }
  }
  const reste = fl();
  if (reste.replace(/[\s.,;:]/g, '')) out += `<span class="${cls}">${reste}</span>`;
  return `<div class="frh">${out}</div>`;
}

/** choix d'un exercice : arabe ; français ; ou français du livre avec de l'arabe (chacun sur sa ligne) */
const choixH = (o: string) =>
  LATIN.test(o)
    ? frH(o, 'fr toujours')
    : RUN.test(o)
      ? arH(o)
      : `<span class="fr toujours">${esc(o)}</span>`;

/** fermeture du lecteur ouvert (un seul à la fois) */
let fermerOuvert: (() => void) | null = null;

/** Ouvre le lecteur plein écran (un seul à la fois), après ses textes (catalogue `fr-video`, à la demande). */
export async function ouvrir(o: OuvrirOptions): Promise<void> {
  await loadTexts('video');
  if (!document.getElementById('vv-feuille')) {
    const st = document.createElement('link');
    st.id = 'vv-feuille';
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

/**
 * Le lecteur (fermeture : état et fonctions locales, que le minifieur raccourcit). Rend la fonction qui le ferme.
 */
function creer(opt: OuvrirOptions): () => void {
  let vid: VideoLecon;
  let root: HTMLElement;
  let stage: HTMLElement;
  let zone: HTMLElement;
  let band: HTMLElement;
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
  let retour: Element | null;
  let cle: string;

  // —— initialisation (ancien constructeur) ——
  const init = () => {
    retour = document.activeElement;
    cle = `awzid.vv.${opt.unit.id}`;
    const la = opt.audio;
    vid = buildVideo(opt.unit.lesson, {
      unitId: opt.unit.id,
      hasAudio: (s) => !!audioIdFor(s, la),
      images: Object.keys(opt.illus),
      audioList: la ? [...la.fichiers] : [],
    });
    stopLessonAudio();
    document.dispatchEvent(new Event('awzid-son'));
    const r = (root = h('div', 'vv'));
    r.setAttribute('role', 'dialog');
    r.setAttribute('aria-modal', 'true');
    r.setAttribute('aria-label', t('vv.titre'));
    r.dataset.testid = 'vv';
    r.classList.toggle('sans-trad', !traductionVisible(opt.profileId));
    r.innerHTML = `<div class="vv-l"><header class="vv-t"><div class="tt"><span class="k"></span><b class="s"></b></div><button class="ib fermer" data-k="fermer" aria-label="${esc(t('vv.fermer'))}">✕</button></header><div class="seg" aria-hidden="true"></div><section class="vv-sc" aria-live="polite"></section><nav class="vv-cmd"><div class="rang"><button class="ib" data-k="prec" aria-label="${esc(t('vv.prec'))}"><svg viewBox="0 0 24 24"><path d="M6 5v14M18 6l-8 6 8 6z"/></svg></button><button class="ib lire" data-k="lire"></button><button class="ib" data-k="suiv" aria-label="${esc(t('vv.suiv'))}"><svg viewBox="0 0 24 24"><path d="M18 5v14M6 6l8 6-8 6z"/></svg></button><span class="temps"></span></div><div class="rang"><button class="puce" data-k="vitesse"></button><button class="puce" data-k="trad" data-testid="vv-trad"></button></div></nav></div>`;
    stage = r.querySelector('.vv-sc')!;
    document.body.append(r);
    document.documentElement.classList.add('vv-ouvert');
    r.addEventListener('click', (e) => clic(e));
    r.addEventListener('keydown', (e) => clavier(e));
    majBoutons();
    depart();
    r.querySelector<HTMLElement>('.fermer')!.focus();
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
    document.documentElement.classList.remove('vv-ouvert');
    if (fermerOuvert === fermer) fermerOuvert = null;
    (retour as HTMLElement | null)?.focus?.();
  }

  // ———————————————————————————————— temps et voix ————————————————————————————————
  /** progression de 0 à 1 sur `ms` (vitesse, pause), coupée si la scène change */
  function prog(ms: number, f?: (p: number) => void): Promise<void> {
    const j = jeton;
    return new Promise((ok, ko) => {
      let fait = 0;
      let t0 = performance.now();
      const tick = (x: number) => {
        if (j !== jeton) return ko(new Coupe());
        if (!pause) fait += (x - t0) * vitesse;
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
  /** joue le fichier audio du texte s'il existe (copie de l'appareil d'abord) ; sinon un court silence */
  async function dire(x: T | undefined, el?: Element | null): Promise<void> {
    const id = x?.son ? audioIdFor(x.ar, opt.audio) : null;
    el?.classList.add('joue');
    try {
      if (!id) return await att(700);
      const j = jeton;
      const s = await leconsSource(id).catch(() => null);
      // scène changée pendant l'attente : cette suite s'arrête (sinon elle continuerait dans la scène suivante)
      vivant(j);
      if (!s) return await att(700);
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
        a.onplaying = () => journal()?.sons.push([id, Date.now()]);
        // connexion coupée ou lecture refusée : la scène continue en silence
        setTimeout(() => !pause && a.currentTime === 0 && fin(), 2500);
        if (!pause) a.play().catch(fin);
        const garde = () =>
          j !== jeton ? (a.pause(), fin()) : fini || requestAnimationFrame(garde);
        requestAnimationFrame(garde);
      });
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

  // ———————————————————————————————— départ, modes, scènes ————————————————————————————————
  function depart() {
    debut = false;
    pause = true;
    jeton++;
    majBoutons();
    tete(t('vv.choisir'), '');
    root.querySelector('.seg')!.innerHTML = '';
    const L = opt.unit.lesson as { titre_fr?: string };
    const s = stage;
    s.innerHTML = '';
    const d = h('div', 'vv-dep');
    d.innerHTML = `${L.titre_fr ? frH(L.titre_fr, 'h') : ''}<div class="filet"><i></i></div>`;
    let rep: { m?: VideoMode; l?: number; i?: number; s?: string } = {};
    try {
      rep = JSON.parse(localStorage.getItem(cle) ?? '{}') ?? {};
    } catch {
      /* navigation privée */
    }
    if (rep.s === vid.source.slice(0, 12) && rep.m && vid.modes.includes(rep.m) && rep.i) {
      const b = h('button', 'bouton or', esc(t('vv.reprendre', { n: rep.i + 1 })));
      b.dataset.testid = 'vv-reprendre';
      b.onclick = () => lancer(rep.m!, rep.l ?? 0, rep.i);
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
      // version courte d'un livre de la phrase : phrase vedette, mots et dialogue
      const p = m === 'courte' && vid.scenes.some((s) => s.id === 'courte-vedette');
      const b = h(
        'button',
        'mode',
        `<b>${esc(t(`vv.mode_${m}`))}</b><span>${esc(t(p ? 'vv.mode_courte_p' : `vv.mode_${m}_d`))}${dur ? ` · ${esc(dur)}` : ''}</span>`,
      );
      b.dataset.mode = m;
      b.onclick = () => (m === 'lettre' && vid.lettres.length > 1 ? choixLettre() : lancer(m, 0));
      d.append(b);
    }
    s.append(d);
  }
  function choixLettre() {
    const d = h('div', 'vv-dep', `<p class="consigne">${esc(t('vv.quelle_lettre'))}</p>`);
    const r = h('div', 'rangee');
    vid.lettres.forEach((x, k) => {
      const b = h('button', 'tuile', arH(x.l, 'g'));
      b.onclick = () => lancer('lettre', k);
      r.append(b);
    });
    d.append(r);
    stage.replaceChildren(d);
  }
  function lancer(m: VideoMode, lettre: number, i = 0) {
    modeChoisi = m;
    lettreChoisie = lettre;
    scenes = scenesDuMode(vid, m, lettre);
    score = { ok: 0, n: 0 };
    debut = true;
    pause = false;
    majBoutons();
    void jouer(i);
  }
  function tete(s: string, k: string) {
    root.querySelector('.vv-t .s')!.innerHTML = frH(s, 'x');
    root.querySelector('.vv-t .k')!.textContent = k;
  }
  function titreDe(sc: Scene): string {
    const x = sc.titre;
    return 'fr' in x ? x.fr : t(x.cle, { n: x.n, total: x.total });
  }
  async function jouer(i: number): Promise<void> {
    if (i < 0) i = 0;
    if (i >= scenes.length) return fin();
    idx = i;
    const j = ++jeton;
    audio?.pause();
    const sc = scenes[i]!;
    // titre du livre avec un mot arabe : l'en-tête garde un libellé court, le titre entier va dans la carte
    const titre = titreDe(sc);
    const long = frH(titre).includes('ar l');
    const court: Record<string, string> = {
      notion: 'vv.notion',
      quiz: 'vv.quiz',
      dialogue: 'vv.dialogue',
    };
    titreCarte = long ? titre : '';
    tete(long ? t(court[sc.part] ?? 'vv.titre') : titre, t(`vv.mode_${modeChoisi}`));
    root.querySelector('.seg')!.innerHTML = scenes
      .map((_, k) => `<i class="${k < i ? 'fait' : k === i ? 'ici' : ''}"></i>`)
      .join('');
    root.querySelector('.temps')!.textContent = t('vv.scene', {
      n: i + 1,
      total: scenes.length,
    });
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
    const tr = sc.temps.find((x) => x.k === 'trace');
    const fam = tr?.k === 'trace' ? famille(tr.l) : undefined;
    if (fam) stage.style.setProperty('--fam', fam);
    else stage.style.removeProperty('--fam');
    zone = h('div', sc.part === 'lettres' ? 'vv-c lt' : 'vv-c');
    // bandeau vert de consigne, en bas de la carte (comme les vidéos du livre)
    band = h('p', 'bandeau');
    band.dataset.testid = 'vv-bandeau';
    stage.append(zone, band);
    try {
      for (const x of sc.temps) {
        await temps(x, sc);
        vivant(j);
      }
      await att(600);
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
    const d = h('div', 'vv-dep', `<p class="h">${esc(t('vv.fin'))}</p>`);
    d.dataset.testid = 'vv-fin';
    if (score.n) d.append(h('p', 'score', esc(t('vv.score', score))));
    const b1 = h('button', 'bouton', esc(t('vv.revoir')));
    b1.onclick = () => lancer(modeChoisi, lettreChoisie);
    const b2 = h('button', 'bouton clair', esc(t('vv.autre')));
    b2.onclick = () => depart();
    d.append(b1, b2);
    stage.replaceChildren(d);
  }

  /** ajoute un élément à la scène ; si elle déborde, les éléments précédents laissent la place */
  function ajoute(html: string | HTMLElement, neuf = false): HTMLElement {
    const z = zone;
    if (neuf) z.replaceChildren();
    const e = typeof html === 'string' ? h('div', 'bloc', html) : html;
    e.classList.add('apparait', `b-${kind}`);
    z.append(e);
    tasse(e);
    return e;
  }
  /** la scène déborde : les éléments placés avant `e` laissent la place (jamais de texte coupé) */
  function tasse(e: Element) {
    const z = zone;
    const deborde = () => z.scrollHeight > z.clientHeight + 2;
    // d'abord les éléments secondaires (la grande lettre et son nom restent le plus longtemps)
    for (let c = z.firstElementChild; c && c !== e && deborde();) {
      const n = c.nextElementSibling;
      if (!c.matches('.b-trace,.b-nom')) c.remove();
      c = n;
    }
    while (deborde() && z.firstElementChild && z.firstElementChild !== e)
      z.firstElementChild.remove();
    // un bloc seul plus haut que la scène (règle longue, explication des livres de la phrase) : ses premiers morceaux
    // laissent la place aux suivants
    for (
      let c = e.querySelector('.carte > .apparait');
      c?.nextElementSibling && deborde();
      c = e.querySelector('.carte > .apparait')
    )
      c.remove();
  }
  function tuile(x: T, cls = ''): string {
    return x.son
      ? `<button class="tuile ${cls}" data-dire="${esc(x.ar)}">${arH(x.ar)}</button>`
      : `<span class="tuile ${cls}">${arH(x.ar)}</span>`;
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
  /** consigne de l'interface : écrite dans le bandeau vert (rien d'essentiel seulement à l'oral) */
  function consigne(cle: string) {
    if (band) band.textContent = t(cle);
    return '';
  }

  /** « À toi ! » : anneau doré qui se vide pendant que l'élève parle, puis la correction (audio du livre) */
  async function aToi(cle: string, ms: number, puis: T[] = []) {
    consigne(cle);
    const d = ajoute(anneau('', `<b>${esc(t('vv.a_toi'))}</b>`));
    const o = d.querySelector<SVGElement>('.or')!;
    await prog(ms, (p) => (o.style.strokeDashoffset = String(264 * p)));
    d.remove();
    for (const x of puis) await dire(x);
  }
  /** attend une réponse (ou le délai : la réponse est alors montrée) */
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
    switch (x.k) {
      case 'titre': {
        const e = ajoute(
          `${x.fr ? frH(x.fr, 'h') : ''}${x.ar ? arH(x.ar, 'titre') : ''}<div class="filet"><i></i></div><div class="rangee"></div>`,
          true,
        );
        const r = e.querySelector('.rangee')!;
        for (const l of x.tableau ?? []) {
          r.append(h('span', 'apparait', arH(l.ar, 'g')));
          await att(450);
        }
        return att(x.ms - 450 * (x.tableau?.length ?? 0));
      }
      case 'bulle': {
        const cote = x.cote === undefined ? '' : x.cote ? 'g' : 'd';
        const e = ajoute(
          `<div class="bulle ${cote}">${x.qui ? arH(x.qui, 'qui') : ''}${x.lignes.map((l) => arH(l.ar)).join('')}${fr(x.fr)}</div>`,
        );
        for (const l of x.lignes) await dire(l, e.firstElementChild);
        return att(x.ms * 0.5);
      }
      case 'objectif':
        ajoute(`<div class="carte">${x.ar ? arH(x.ar.ar) : ''}${fr(x.fr, true)}</div>`);
        return att(x.ms);
      case 'trace': {
        const e = ajoute('<div class="trace-h"></div>', true);
        const trace = await tracer(e.firstElementChild as HTMLElement, x.l, x.l, 0, 6.5);
        // source des tracés, en petit au bas de la scène (seulement si la forme a été tracée)
        if (trace) zone.append(h('p', 'src b-src', esc(t('vv.traits_source'))));
        return att(600);
      }
      case 'nom': {
        const e = ajoute(`${consigne(x.consigne.cle)}${tuile(x.nom, 'nom')}`);
        await dire(x.nom, e.querySelector('.tuile'));
        return att(x.ms * 0.4);
      }
      case 'points':
        ajoute(`${x.ar ? arH(x.ar, 'points') : ''}${fr(x.fr, true)}`);
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
        const tu = [...e.querySelectorAll('.tuile')];
        if (x.aToi) await aToi('vv.a_toi', x.aToi);
        for (let k = 0; k < x.items.length; k++) await dire(x.items[k], tu[k]);
        return att(400);
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
        e.innerHTML = `${tuile(x.mot, 'mot')}${fr(x.fr)}`;
        await dire(x.mot, e.firstElementChild);
        return att(1200);
      }
      case 'texte': {
        const e = ajoute(`${tuile(x.ar, `t${x.taille}`)}${fr(x.fr)}`);
        await dire(x.ar, e.firstElementChild);
        return att(x.ms * 0.35);
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
        const e = ajoute(`${img(x.img)}${tuile(x.ar, 'mot')}${fr(x.fr)}`, !lettres);
        await att(300);
        await dire(x.ar, e.querySelector('.tuile'));
        return att(x.ms * 0.4);
      }
      case 'grille':
        ajoute(
          `${consigne('vv.touche')}<div class="grille">${x.items.map((y) => (y.ar.son ? `<button class="tuile" data-dire="${esc(y.ar.ar)}">` : '<span class="tuile">') + img(y.img, '') + arH(y.ar.ar) + (y.ar.son ? '</button>' : '</span>')).join('')}</div>`,
          true,
        );
        return att(x.ms);
      case 'regle': {
        const e = ajoute(
          `<div class="carte">${x.titre_ar ? arH(x.titre_ar, 'titre') : ''}${x.titre_fr ? frH(x.titre_fr, 'h') : ''}${x.signe ? arH(x.signe, 'g') : ''}</div>`,
        );
        const cte = e.firstElementChild!;
        for (const a of x.ar ?? []) {
          cte.append(h('div', 'apparait', arH(a.ar, 'l')));
          tasse(e);
          await att(1400);
        }
        for (const f of x.fr ?? []) {
          cte.append(h('div', 'apparait', frH(f, 'fr toujours')));
          tasse(e);
          await att(1200 + 40 * f.length);
        }
        return att(800);
      }
      case 'fr':
        ajoute(`<div class="carte">${frH(x.fr, 'fr toujours')}</div>`);
        return att(x.ms);
      case 'lettres': {
        const e = ajoute('<div class="grille lettres"></div>', true);
        for (const y of x.items) {
          const d = h('div', 'apparait', `${arH(y.l, 'g')}${y.nom ? tuile(y.nom, 'nom') : ''}`);
          e.firstElementChild!.append(d);
          if (y.nom) await dire(y.nom, d.querySelector('.tuile'));
          await att(y.nom ? 500 : 600);
        }
        return att(800);
      }
      case 'aToi':
        return aToi(x.consigne.cle, x.ms - 1300 * (x.puis?.length ?? 0), x.puis);
      case 'cles': {
        // une ligne par mot ou expression du livre (arabe sur sa ligne, sens en dessous), dite à son tour
        const e = ajoute(
          `${consigne('vv.ecoute_lis')}<div class="cles">${x.items.map((l) => `<div class="carte">${LATIN.test(l.ar.ar) ? frH(l.ar.ar, 'fr toujours') : tuile(l.ar, 'tm')}${fr(l.fr)}</div>`).join('')}</div>`,
          true,
        );
        const cs = e.querySelectorAll('.carte');
        for (const [k, l] of x.items.entries()) {
          const c = cs[k]?.querySelector('.tuile') ?? cs[k];
          if (l.ar.son) await dire(l.ar, c);
          else for (const d of l.dits ?? []) await dire(d, c);
          await att(700);
        }
        return att(800);
      }
      case 'retenir': {
        const e = ajoute(
          `<div class="carte">${x.fr ? frH(x.fr, 'fr toujours') : ''}${x.ar ? tuile(x.ar, 'tm') : ''}</div>`,
          true,
        );
        await att(1200 + 40 * (x.fr?.length ?? 0));
        if (x.ar) await dire(x.ar, e.querySelector('.tuile'));
        return att(1500);
      }
      case 'q':
        return question(x.q, sc.jouable === true, `${x.i + 1} / ${x.n}`);
      case 'jouer':
        return jouerScene(x.repliques);
    }
  }

  // ———————————————————————————————— exercices du livre ————————————————————————————————
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
          }
        });
      }
      case 'complete': {
        // une indication en français du livre (« vous (des femmes) : ») a sa propre ligne, au-dessus de la ligne arabe
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
          }
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
          `${arH(q.cible, 'g')}<div class="grille g4">${q.mots.map((m, k) => `<button class="opt" data-o="${k}" aria-pressed="false">${arH(m.ar.ar)}</button>`).join('')}</div>${jouable ? `<button class="bouton" data-v>${esc(t('vv.verifier'))}</button>` : ''}`,
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
        // colonne de droite décalée (comme l'épreuve du livre) : l'élève touche un mot puis son sens
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
        // réponse montrée : chaque sens rejoint la ligne de son mot
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
        return att(2500);
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
          if (q.fr) ajoute(fr(q.fr));
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

  /** « À toi de jouer la scène ! » : l'élève choisit un rôle, l'appli joue les autres (audio du livre) */
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
          `<div class="bulle ${r.qui === moi ? 'd' : 'g'}">${arH(r.qui_ar, 'qui')}${arH(r.ar.ar)}${fr(r.fr)}</div>`,
        );
        if (r.qui === moi) await aToi('vv.dis_replique', 5000);
        else await dire(r.ar, b.firstElementChild);
        await att(400);
      }
      ajoute(`<p class="retour ok">${esc(t('vv.rejouer'))}</p>`);
      await att(1800);
    }
  }

  // ———————————————————————————————— tracé des lettres ————————————————————————————————
  /**
   * Lettre (ou forme du livre) dans la police du cahier (Noto Naskh Arabic 700). Forme VALIDÉE (`traits.ts`) : un
   * masque suit le trajet de la plume, trait par trait (numérotés), puis les points et signes apparaissent ; trajets
   * recalés sur le contour réel de la forme (boîte d'encre mesurée, liaisons retirées). Sinon : la lettre complète,
   * sans animation de traits. Renvoie vrai si la forme a été tracée.
   */
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
    // police en attributs SVG (dans un attribut style, les guillemets du nom de police fermeraient l'attribut)
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
      // numéros d'ordre sur la grande lettre seulement (illisibles dans les vignettes des formes)
      if (F >= 60) svg.append(num);
      await prog(Math.max(900, L * 9), (q) => {
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
    await att(500);
    return true;
  }
  init();
  return fermer;
}
