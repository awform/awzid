/**
 * Vidéos vivantes du CAHIER DE LECTURE (25/10/2026) — lecteur plein écran, chargé À LA DEMANDE comme les lecteurs v1 et
 * v2 (appui sur « Regarder la vidéo » d'une page du cahier, groupe `/_app/video.json`, garde de poids dans
 * scripts/budget.mjs), derrière les interrupteurs `cahier_lecture` ET `video_v2`. Il joue les scènes de
 * `buildVideoCahier` (packages/content/src/video-cahier.ts) : l'élément (lettre, syllabe, mot, phrase) s'affiche EN
 * GRAND et s'allume AU MOMENT où sa voix le dit (événement `playing` du fichier : au son exact), la flèche avance de
 * droite à gauche le long de la ligne ; quand la ligne est lue, une pause (1,5 fois sa durée) laisse l'élève RÉPÉTER
 * (la flèche refait le chemin au rythme du modèle), puis la ligne suivante.
 *
 * Règles : aucun texte de contenu écrit ici (arabe et français viennent du cahier, rendus octet pour octet, jamais
 * normalisés) ; textes d'interface = clés `vv.*` ; la voix n'est QUE le fichier audio du texte (ou la récitation
 * stockée d'un verset, fournie par le cahier) ; l'arabe a toujours sa propre ligne ; aucun visage ; aucune musique ;
 * préchargement LIMITÉ à 4 fichiers à la fois (le courant et les trois suivants) ; animations sur `transform` et
 * `opacity` seulement (`prefers-reduced-motion` : fondus seuls).
 */
import {
  buildVideoCahier,
  calendrier,
  SANS_VOIX_MS,
  SOUFFLE_MS,
  type Ligne,
  type PageIn,
  type Unite,
  type VideoCahier,
} from '@awform/content/video-cahier';
import { audioIdFor, leconsSource, stopLessonAudio, type LevelAudio } from '$lib/lecons-audio';
import { loadTexts, t } from '$lib/i18n';
// feuille reliée à l'ouverture (CSP « style-src 'self' » ; un import la ferait relier par la page du cahier)
import feuille from './lecteur-cahier.css?url';

export interface OuvrirCahierOptions {
  page: PageIn;
  audio: LevelAudio | null;
  profileId?: string | null;
  /**
   * Récitation stockée d'un verset (fournie par le cahier) : renvoie la durée (ms) à la fin ; `surAudio` reçoit
   * l'élément joué (pause, vitesse). Jamais une voix de synthèse.
   */
  recite?: (
    ref: string,
    profileId: string | null,
    signal: AbortSignal,
    surAudio: (a: HTMLAudioElement) => void,
  ) => Promise<number>;
  /** arrête tout son du cahier (fermeture) */
  arreter?: () => void;
}

/** Taille de la fenêtre de préchargement : le fichier courant et les trois suivants (4 à la fois). */
export const PRECHARGEMENT = 4;

const c = String.fromCharCode;
const AR = `${c(0x600)}-${c(0x6ff)}`;
const LETTRE = new RegExp(`[${c(0x621)}-${c(0x63f)}${c(0x641)}-${c(0x64a)}]`, 'g');
// suite arabe d'un titre français ; les lettres citées une à une (« ك ل م ه ») restent dans la phrase
const RUN = new RegExp(`[${AR}](?:[${AR}\\s.]*[${AR}])?`, 'g');

class Coupe extends Error {}
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[x]!);

/** Titre français du cahier : un mot ou une phrase arabe passe sur sa propre ligne, le texte reste identique. */
export function titreH(s: string): string {
  let out = '';
  let pos = 0;
  for (const m of s.matchAll(RUN)) {
    out += esc(s.slice(pos, m.index!));
    const long = m[0].split(/\s+/).some((w) => (w.match(LETTRE) ?? []).length > 1);
    out += long
      ? `<span class="ar-l" lang="ar" dir="rtl">${esc(m[0])}</span>`
      : `<bdi class="lt" lang="ar" dir="rtl">${esc(m[0])}</bdi>`;
    pos = m.index! + m[0].length;
  }
  return out + esc(s.slice(pos));
}

/** Arabe d'un élément, découpé selon sa mise en couleur seulement (le texte n'est jamais modifié). */
export function morceaux(u: Pick<Unite, 'ar' | 'c'>): string {
  if (!u.c?.length) return esc(u.ar);
  let out = '';
  let pos = 0;
  for (const [d, l, cl] of [...u.c].sort((a, b) => a[0] - b[0])) {
    if (d > pos) out += esc(u.ar.slice(pos, d));
    out += `<span class="c-${esc(cl)}">${esc(u.ar.slice(d, d + l))}</span>`;
    pos = d + l;
  }
  return out + (pos < u.ar.length ? esc(u.ar.slice(pos)) : '');
}

const sonnee = (u: Unite) => u.voix === 'oui' || u.voix === 'recitation';

let fermerOuvert: (() => void) | null = null;

/** Ouvre le lecteur plein écran (un seul à la fois), après ses textes (catalogue `fr-video`, à la demande). */
export async function ouvrir(o: OuvrirCahierOptions): Promise<void> {
  await loadTexts('video');
  if (!document.getElementById('vc-feuille')) {
    const st = document.createElement('link');
    st.id = 'vc-feuille';
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

function creer(opt: OuvrirCahierOptions): () => void {
  const vid: VideoCahier = buildVideoCahier(opt.page, {
    hasAudio: (s) => !!audioIdFor(s, opt.audio),
  });
  // toutes les lignes, dans l'ordre, et tous les éléments (rang global)
  const lignes: Array<{ si: number; l: Ligne; n0: number }> = [];
  const flat: Unite[] = [];
  vid.scenes.forEach((sc, si) =>
    sc.lignes.forEach((l) => {
      lignes.push({ si, l, n0: flat.length });
      flat.push(...l.unites);
    }),
  );
  const retour = document.activeElement;
  const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let jeton = 0;
  let pause = false;
  let vitesse = 1;
  let audio: HTMLAudioElement | null = null;
  let ctrl: AbortController | null = null;
  let arret: (() => void) | null = null;
  let scene = -1;
  let g = 0;
  let fini = false;
  type Entree = { a: HTMLAudioElement; liberer?: () => void; pret: Promise<boolean> };
  const pool = new Map<number, Entree>();

  const root = document.createElement('div');
  root.className = 'vc';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', t('vv.cah_titre'));
  root.dataset.testid = 'vc';
  root.innerHTML = `<div class="vc-c"><header class="vc-t"><div class="tt"><span class="k"></span><b class="s">${titreH(vid.titre)}</b></div><button type="button" class="ib" data-k="fermer" aria-label="${esc(t('vv.fermer'))}">✕</button></header><div class="vc-barre" aria-hidden="true"><i></i></div><section class="vc-sc" tabindex="0" aria-label="${esc(t('vv.cah_titre'))}"></section><nav class="vc-cmd"><div class="rang"><button type="button" class="ib" data-k="prec" aria-label="${esc(t('vv.prec'))}"><svg viewBox="0 0 24 24"><path d="M6 5v14M18 6l-8 6 8 6z"/></svg></button><button type="button" class="ib lire" data-k="lire"></button><button type="button" class="ib" data-k="suiv" aria-label="${esc(t('vv.suiv'))}"><svg viewBox="0 0 24 24"><path d="M18 5v14M6 6l8 6-8 6z"/></svg></button></div><div class="rang"><button type="button" class="puce" data-k="vitesse"></button></div></nav></div>`;
  const stage = root.querySelector<HTMLElement>('.vc-sc')!;
  const barre = root.querySelector<HTMLElement>('.vc-barre i')!;
  const nch = root.querySelector<HTMLElement>('.k')!;
  const q = (k: string) => root.querySelector<HTMLElement>(`[data-k="${k}"]`)!;

  // ———————————————————————————————— commandes ————————————————————————————————
  function majBoutons() {
    q('lire').innerHTML = pause
      ? '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
    q('lire').setAttribute('aria-label', t(pause ? 'vv.lecture' : 'vv.pause'));
    q('vitesse').textContent = t('vv.vitesse', { v: String(vitesse).replace('.', ',') });
    root.toggleAttribute('data-pause', pause);
  }
  function basculer() {
    if (fini) return void rejouer();
    pause = !pause;
    if (audio) void (pause ? audio.pause() : audio.play().catch(() => {}));
    majBoutons();
  }
  function clic(e: MouseEvent) {
    const b = (e.target as Element).closest<HTMLElement>('[data-k]');
    if (!b) return;
    switch (b.dataset.k) {
      case 'fermer':
        return fermer();
      case 'lire':
        return basculer();
      case 'prec':
        return void aller(g > 0 && !fini ? g - 1 : Math.max(0, lignes.length - 1));
      case 'suiv':
        return void (g + 1 < lignes.length && !fini ? aller(g + 1) : fin());
      case 'vitesse': {
        const V = [0.75, 1, 1.25];
        vitesse = V[(V.indexOf(vitesse) + 1) % 3]!;
        if (audio) audio.playbackRate = vitesse;
        return majBoutons();
      }
      case 'revoir':
        return void rejouer();
    }
  }
  function clavier(e: KeyboardEvent) {
    if (e.key === 'Escape') return fermer();
    if ((e.target as Element).closest('button')) return;
    if (e.key === ' ') {
      e.preventDefault();
      basculer();
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const sens = (e.key === 'ArrowRight' ? 1 : -1) * (document.dir === 'rtl' ? -1 : 1);
      void aller(Math.min(lignes.length - 1, Math.max(0, g + sens)));
    }
  }
  function fermer() {
    jeton++;
    couper();
    root.remove();
    document.getElementById('vc-feuille')?.remove();
    document.documentElement.classList.remove('vv-ouvert');
    opt.arreter?.();
    if (fermerOuvert === fermer) fermerOuvert = null;
    (retour as HTMLElement | null)?.focus?.();
  }

  // ———————————————————————————————— temps ————————————————————————————————
  /** progression sur `ms` (vitesse, pause), coupée si la ligne change */
  function att(ms: number, f?: (p: number) => void): Promise<void> {
    const j = jeton;
    return new Promise((ok, ko) => {
      let fait = 0;
      let t0 = performance.now();
      const tick = (x: number) => {
        if (j !== jeton) return ko(new Coupe());
        if (!pause) fait += (x - t0) * vitesse;
        t0 = x;
        f?.(Math.min(1, fait / Math.max(1, ms)));
        if (fait >= ms) return ok();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }
  /** attend la fin d'une pause (ou le changement de ligne) */
  function reprise(): Promise<void> {
    const j = jeton;
    return new Promise((ok, ko) => {
      const tick = () =>
        j !== jeton ? ko(new Coupe()) : !pause ? ok() : requestAnimationFrame(tick);
      tick();
    });
  }
  /** arrête le son et les attentes en cours */
  function couper() {
    ctrl?.abort();
    ctrl = null;
    arret?.();
    arret = null;
    audio?.pause();
    audio = null;
    stopLessonAudio();
    for (const k of [...pool.keys()]) relacher(k);
  }

  // ———————————————————————————————— préchargement (4 fichiers à la fois) ————————————————————————————————
  function relacher(k: number) {
    const e = pool.get(k);
    if (!e) return;
    pool.delete(k);
    e.a.onended = e.a.onerror = e.a.onplaying = null;
    e.a.pause();
    e.a.removeAttribute('src');
    e.a.load();
    e.liberer?.();
  }
  async function preparer(k: number) {
    const u = flat[k];
    if (!u || u.voix !== 'oui') return null;
    const deja = pool.get(k);
    // déjà demandé (préchargement en cours) : on attend que sa source soit posée avant de le jouer
    if (deja) return (await deja.pret) ? deja : null;
    const id = audioIdFor(u.ar, opt.audio);
    if (!id) return null;
    const e: Entree = { a: new Audio(), pret: Promise.resolve(false) };
    pool.set(k, e);
    e.pret = (async () => {
      const s = await leconsSource(id).catch(() => null);
      if (!s || pool.get(k) !== e) {
        s?.liberer?.();
        return false;
      }
      e.liberer = s.liberer;
      e.a.preload = 'auto';
      e.a.preservesPitch = true;
      e.a.src = s.url;
      return true;
    })();
    return (await e.pret) ? e : null;
  }
  /** garde le fichier courant et les trois suivants, libère le reste */
  async function amorcer(n: number) {
    for (const k of [...pool.keys()]) if (k < n || k >= n + PRECHARGEMENT) relacher(k);
    for (let k = n; k < n + PRECHARGEMENT && k < flat.length; k++) await preparer(k);
  }

  // ———————————————————————————————— affichage ————————————————————————————————
  const unEl = (n: number) => stage.querySelector<HTMLElement>(`.vc-u[data-i="${n}"]`);
  function rendreScene(si: number) {
    const sc = vid.scenes[si]!;
    scene = si;
    let n = lignes.find((x) => x.si === si)!.n0;
    const html = sc.lignes
      .map((l) => {
        const us = l.unites
          .map((u) => {
            const cls = `vc-u g-${u.genre}${u.etiquette ? ' eti' : ''}`;
            const a = `<span class="a${u.a === 'q' ? ' quran-text' : ''}" lang="ar" dir="rtl">${morceaux(u)}</span>`;
            return `<span class="${cls}" data-i="${n++}">${a}${u.d ? `<small>${esc(u.d)}</small>` : ''}</span>`;
          })
          .join('');
        const rang =
          l.rang || l.titre
            ? `<p class="vc-lt">${l.rang ? `<b>${l.rang}</b>` : ''}${l.titre ? titreH(l.titre) : ''}</p>`
            : '';
        const note = l.note && !l.unites.length ? `<p class="vc-note">${titreH(l.note)}</p>` : '';
        return `<div class="vc-l1" data-g="${lignes.findIndex((x) => x.l === l)}">${rang}${note}${us ? `<div class="vc-r" dir="rtl">${us}</div>` : ''}<i class="vc-fl" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 12H5M11 6l-6 6 6 6"/></svg></i></div>`;
      })
      .join('');
    const grand = sc.lignes.some((l) => l.unites.some((u) => u.genre !== 'phrase'));
    stage.className = `vc-sc${grand ? '' : ' sans-focus'}`;
    stage.innerHTML = `<p class="vc-bt">${titreH(sc.titre)}</p>${sc.note ? `<p class="vc-note">${titreH(sc.note)}</p>` : ''}<div class="vc-focus" aria-hidden="true"></div><div class="vc-lignes">${html}</div><p class="vc-cs" role="status" aria-live="polite"></p>`;
  }
  const pastille = (cle: string | null) => {
    const p = stage.querySelector<HTMLElement>('.vc-cs');
    if (!p) return;
    p.textContent = cle ? t(cle) : '';
    p.classList.toggle('a-toi', cle === 'vv.cah_repete');
  };
  /** la flèche se place sous l'élément, de droite à gauche (transform seulement) */
  function fleche(el: HTMLElement | null) {
    const rangee = el?.closest<HTMLElement>('.vc-l1');
    const fl = rangee?.querySelector<HTMLElement>('.vc-fl');
    if (!el || !rangee || !fl) return;
    const a = rangee.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    fl.style.transform = `translateX(${Math.round(b.left + b.width / 2 - a.right + fl.offsetWidth / 2)}px)`;
  }
  /** l'élément est dit : il s'allume (au son), s'affiche en grand, la flèche le rejoint */
  function marquer(n: number) {
    const el = unEl(n);
    if (!el) return;
    stage.querySelectorAll('.vc-u.joue').forEach((x) => x.classList.remove('joue'));
    el.classList.add('joue');
    const u = flat[n]!;
    const foc = stage.querySelector<HTMLElement>('.vc-focus');
    if (foc)
      foc.innerHTML = `<span class="a g-${u.genre}${u.a === 'q' ? ' quran-text' : ''}" lang="ar" dir="rtl">${morceaux(u)}</span>`;
    fleche(el);
  }
  function eteindre(n: number) {
    const el = unEl(n);
    el?.classList.remove('joue');
    el?.classList.add('vu');
  }
  function voirLigne(gi: number) {
    const el = stage.querySelector<HTMLElement>(`.vc-l1[data-g="${gi}"]`);
    stage.querySelectorAll('.vc-l1.act').forEach((x) => x.classList.remove('act'));
    el?.classList.add('act');
    el?.scrollIntoView({ block: 'center', behavior: reduit ? 'auto' : 'smooth' });
  }

  // ———————————————————————————————— voix ————————————————————————————————
  /** dit l'élément n (fichier du niveau ou récitation stockée) ; renvoie la durée (ms) ; 0 sans voix */
  async function dire(n: number): Promise<number> {
    const u = flat[n]!;
    const j = jeton;
    if (u.voix === 'recitation' && opt.recite && u.ref) {
      ctrl = new AbortController();
      try {
        return await opt.recite(u.ref, opt.profileId ?? null, ctrl.signal, (a) => {
          audio = a;
          a.playbackRate = vitesse;
          a.addEventListener('playing', () => marquer(n), { once: true });
        });
      } catch {
        if (j !== jeton) throw new Coupe();
        marquer(n);
        await att(SANS_VOIX_MS);
        return 0;
      } finally {
        audio = null;
      }
    }
    const e = u.voix === 'oui' ? await preparer(n) : null;
    if (j !== jeton) throw new Coupe();
    if (!e) {
      marquer(n);
      await att(SANS_VOIX_MS);
      return 0;
    }
    void amorcer(n);
    await reprise();
    const a = e.a;
    return new Promise<number>((ok, ko) => {
      let t0 = performance.now();
      let termine = false;
      const sortir = (err?: Error) => {
        if (termine) return;
        termine = true;
        arret = null;
        audio = null;
        if (err) return ko(err);
        const d = Number.isFinite(a.duration) ? a.duration * 1000 : performance.now() - t0;
        ok(Math.round(d));
      };
      arret = () => sortir(new Coupe());
      audio = a;
      a.playbackRate = vitesse;
      a.onplaying = () => {
        t0 = performance.now();
        marquer(n);
      };
      a.onended = () => sortir();
      // fichier illisible (réseau coupé) : l'élément s'affiche quand même, la ligne continue
      a.onerror = () => {
        marquer(n);
        void att(SANS_VOIX_MS).then(() => sortir(), ko);
      };
      const lancer = () =>
        a.play().catch((err: unknown) => {
          // lecture refusée (aucun geste de l'élève encore) : en pause, l'élève touche « lecture »
          if ((err as Error)?.name === 'NotAllowedError') {
            pause = true;
            majBoutons();
            void reprise().then(lancer, ko);
          } else {
            marquer(n);
            void att(SANS_VOIX_MS).then(() => sortir(), ko);
          }
        });
      void lancer();
    });
  }

  // ———————————————————————————————— déroulé d'une ligne ————————————————————————————————
  async function jouerLigne(gi: number) {
    const { si, l, n0 } = lignes[gi]!;
    if (si !== scene) rendreScene(si);
    voirLigne(gi);
    nch.textContent = t('vv.cah_ligne', { n: gi + 1, total: lignes.length });
    barre.style.transform = `scaleX(${gi / lignes.length})`;
    stage
      .querySelectorAll('.vc-u.vu, .vc-u.joue, .vc-u.guide')
      .forEach((x) => x.classList.remove('vu', 'joue', 'guide'));
    pastille('vv.cah_ecoute');
    fleche(unEl(n0));
    const d: number[] = [];
    for (let i = 0; i < l.unites.length; i++) {
      d.push((await dire(n0 + i)) || SANS_VOIX_MS);
      eteindre(n0 + i);
      await att(SOUFFLE_MS);
    }
    // pause de répétition : la flèche refait le chemin au rythme du modèle
    const cal = calendrier(d, l.unites.some(sonnee));
    if (cal.repete.length) {
      pastille('vv.cah_repete');
      for (const e of cal.repete) {
        const el = unEl(n0 + e.i);
        el?.classList.add('guide');
        fleche(el);
        await att(e.a - e.de);
        el?.classList.remove('guide');
      }
    }
    pastille(null);
  }

  /** lit les lignes à partir de `depuis`, jusqu'à la fin ou jusqu'à ce qu'on change de ligne */
  async function aller(depuis: number) {
    couper();
    const j = ++jeton;
    fini = false;
    stage.querySelector('.vc-fin')?.remove();
    try {
      for (g = depuis; g < lignes.length; g++) {
        void amorcer(lignes[g]!.n0);
        await jouerLigne(g);
        if (j !== jeton) return;
      }
      if (j === jeton) fin();
    } catch (e) {
      if (!(e instanceof Coupe)) throw e;
    }
  }
  function rejouer() {
    if (!lignes.length) return;
    pause = false;
    majBoutons();
    void aller(0);
  }
  function fin() {
    jeton++;
    couper();
    fini = true;
    barre.style.transform = 'scaleX(1)';
    nch.textContent = '';
    stage.innerHTML = `<div class="vc-fin"><p class="h">${esc(t('vv.fin'))}</p><button type="button" class="puce" data-k="revoir">${esc(t('vv.revoir'))}</button></div>`;
    stage.className = 'vc-sc sans-focus';
  }

  // ———————————————————————————————— ouverture ————————————————————————————————
  root.addEventListener('click', clic);
  root.addEventListener('keydown', clavier);
  stopLessonAudio();
  document.dispatchEvent(new Event('awzid-son'));
  document.body.append(root);
  document.documentElement.classList.add('vv-ouvert');
  majBoutons();
  root.querySelector<HTMLElement>('[data-k="fermer"]')!.focus();
  if (lignes.length) void aller(0);
  else fin();
  return fermer;
}
