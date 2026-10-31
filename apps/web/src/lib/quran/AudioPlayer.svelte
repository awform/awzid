<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onDestroy, untrack } from 'svelte';
  import { suraName } from '@awform/hifz';
  import type { Reciter, SuraPack } from '$lib/coran-audio';
  import { fmtNumber, t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { BASMALA } from './lecture';
  import { clampRate, isHafs, silenceMs } from './player';
  import { Prechargeur, prochainJouable } from './enchainement';
  import { garderEcoute, playableUrl } from './offline-audio';

  /** reculer / avancer : 5 secondes, comme le lecteur des phrases (`lib/lecteur`) */
  const SAUT_S = 5;

  /**
   * Lecteur audio de l'espace Coran — Coran épuré (06/10/2026) : UNE barre discrète (récitateur abrégé,
   * précédent, lecture/pause, suivant, arrêt, progression fine, volume, icône des réglages d'écoute). Joue une
   * file de versets (écoute ou mémorisation), vitesse sans changer la hauteur de la voix, arrêt automatique,
   * lecture en arrière-plan avec les commandes du système (Media Session).
   * ADAB : jamais de lecture automatique (toujours un geste de l'utilisateur), pas de musique, pas de points.
   */
  let {
    reciter,
    pack,
    queue,
    rate = 1,
    sleepMin = 0,
    volume = 1,
    status = '',
    basmala = null,
    silence = 0,
    onaya,
    onindex,
    onend,
    onplaystate,
    onsettings,
    onvolume,
  }: {
    /** fichier de la basmala (entrée BASMALA de la file), du même récitateur ; null : entrée sautée */
    basmala?: string | null;
    /** lecture en cours (true) ou en pause / arrêtée (false) */
    onplaystate?: (on: boolean) => void;
    reciter: Reciter;
    pack: SuraPack | null;
    queue: number[];
    rate?: number;
    sleepMin?: number;
    volume?: number;
    /** texte de l'étape (mémoriser), lu avec la position */
    status?: string;
    onaya?: (aya: number | null) => void;
    /** position dans la file (mémorisation : nouveau verset ou enchaînement) */
    onindex?: (i: number | null) => void;
    /** fin de la file (« fin ») ou arrêt automatique (« sommeil ») */
    onend?: (why: 'fin' | 'sommeil') => void;
    /** ouvre le panneau « Réglages » du lecteur (à la section donnée : « ecoute », « recitateur ») */
    onsettings?: (section?: 'ecoute' | 'recitateur') => void;
    onvolume?: (v: number) => void;
    /** hifẓ : silence après chaque verset (facteur de sa durée, 0 : sans) pour le répéter après le récitateur */
    silence?: number;
  } = $props();
  /** silence « à vous » en cours après un verset ; reprise au verset suivant après une pause pendant le silence */
  let gap = $state(false);
  let gapTimer: ReturnType<typeof setTimeout> | null = null;
  let resumeNext = false;
  function clearGap() {
    if (gapTimer) clearTimeout(gapTimer);
    gapTimer = null;
    gap = false;
  }

  // deux éléments audio en alternance : pendant qu'un verset est lu, le suivant est chargé dans l'autre, puis démarre
  // aussitôt à la fin du premier (aucun silence de chargement entre deux versets, même très courts)
  let els: Array<HTMLAudioElement | undefined> = $state([undefined, undefined]);
  let cur = $state(0);
  const audio = $derived(els[cur]);
  const reserve = new Prechargeur();
  /** adresses posées sur chaque élément (blob hors ligne à libérer) */
  const urls = ['', ''];
  const libere = (u: string) => {
    if (u.startsWith('blob:')) URL.revokeObjectURL(u);
  };
  let idx = $state(0);
  let playing = $state(false);
  let started = $state(false);
  let error = $state('');
  let sleepUntil: number | null = null;
  let lastUrl = '';
  const trouver = (a: number) =>
    a === BASMALA
      ? basmala
        ? { aya: BASMALA, url: basmala }
        : null
      : pack?.files.find((x) => x.aya === a);

  const aya = $derived(queue[idx] ?? null);
  $effect(() => onplaystate?.(playing));
  $effect(() => {
    for (const a of els) {
      if (!a) continue;
      a.playbackRate = clampRate(rate);
      a.preservesPitch = true;
    }
  });
  $effect(() => {
    for (const a of els) if (a) a.volume = Math.max(0, Math.min(1, volume));
  });
  // file changée (autre sourate, autre plage, autres réglages) : on repart du début, sans jouer
  $effect(() => {
    void queue;
    void pack;
    // hors suivi : stop() lit `cur` et `els` ; sans cela, la bascule vers l element de réserve relançait cet effet et arrêtait la lecture
    untrack(stop);
  });

  function setMedia(a: number) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title:
          a === BASMALA
            ? t('ca.media_basmala', { sourate: suraName(pack?.sura ?? 1) })
            : t('ca.media_titre', { sourate: suraName(pack?.sura ?? 1), aya: fmtNumber(a) }),
        artist: reciter.nameFr,
        album: t('ca.media_album', { riwaya: reciter.riwayaFr }),
      });
      navigator.mediaSession.setActionHandler('play', () => void toggle());
      navigator.mediaSession.setActionHandler('pause', () => void toggle());
      navigator.mediaSession.setActionHandler('previoustrack', () => void go(idx - 1));
      navigator.mediaSession.setActionHandler('nexttrack', () => void go(idx + 1));
      navigator.mediaSession.setActionHandler('stop', stop);
    } catch {
      /* commandes du système indisponibles */
    }
  }

  async function playAt(i: number) {
    if (!audio || !pack) return;
    if (i >= queue.length) return finish('fin');
    idx = Math.max(0, i);
    const f = trouver(queue[idx]!);
    if (!f) return playAt(idx + 1);
    clearGap();
    resumeNext = false;
    error = '';
    const pre = reserve.prendre(idx, f.aya);
    if (pre && els[1 - cur]) {
      // verset déjà chargé dans l'autre élément : on bascule, la lecture démarre sans attente
      const ancien = cur;
      cur = 1 - cur;
      els[ancien]?.pause();
      libere(urls[ancien]!);
      urls[ancien] = '';
      lastUrl = pre.url;
    } else {
      libere(urls[cur]!);
      lastUrl = await playableUrl(f.url);
      urls[cur] = lastUrl;
      audio.src = lastUrl;
    }
    audio.playbackRate = clampRate(rate);
    audio.preservesPitch = true;
    try {
      await audio.play();
      playing = true;
      started = true;
      onaya?.(f.aya);
      onindex?.(idx);
      setMedia(f.aya);
      void precharger();
    } catch {
      playing = false;
      error = navigator.onLine
        ? t('ca.erreur_lecture')
        : t(reciter.enLigne ? 'ca.dispo_internet' : 'ca.erreur_hors_ligne');
    }
  }

  /** charge le verset suivant de la file dans l'élément de réserve, pendant la lecture du verset courant */
  async function precharger() {
    const suivant = prochainJouable(queue, idx, trouver);
    const autre = els[1 - cur];
    if (!suivant || !autre || reserve.a(suivant.i)) return;
    const jeton = reserve.debut();
    const mon = 1 - cur;
    try {
      const url = await playableUrl(suivant.f.url);
      if (mon !== 1 - cur || !reserve.ranger(jeton, { i: suivant.i, aya: suivant.aya, url }))
        return libere(url);
      libere(urls[mon]!);
      urls[mon] = url;
      autre.preload = 'auto';
      autre.src = url;
      autre.playbackRate = clampRate(rate);
      autre.preservesPitch = true;
      autre.load();
    } catch {
      /* préchargement impossible : le verset suivant sera chargé à la fin du courant, comme avant */
    }
  }
  function viderReserve() {
    reserve.vider();
    const autre = els[1 - cur];
    if (autre && urls[1 - cur]) {
      autre.removeAttribute('src');
      autre.load();
      libere(urls[1 - cur]!);
      urls[1 - cur] = '';
    }
  }

  /**
   * Démarre la lecture depuis le début de la file — appelé seulement sur un geste de l'utilisateur (« Écouter »,
   * « Écouter d'ici », « Répéter ce verset »), après la mise à jour de la file (`await tick()`).
   */
  export async function start() {
    sleepUntil = sleepMin > 0 ? Date.now() + sleepMin * 60_000 : null;
    started = false;
    await playAt(0);
  }

  /** Pause (changement d'emplacement pendant la lecture) ; `resume` reprend au même endroit. */
  export function pause() {
    if (!audio || !playing) return;
    if (gap) {
      clearGap();
      resumeNext = true;
    }
    audio.pause();
    playing = false;
  }
  export async function resume() {
    if (!playing) await toggle();
  }

  async function toggle() {
    if (!audio) return;
    if (playing) return pause();
    if (!started) {
      sleepUntil = sleepMin > 0 ? Date.now() + sleepMin * 60_000 : null;
      return playAt(idx);
    }
    if (resumeNext) return playAt(idx + 1);
    try {
      await audio.play();
      playing = true;
    } catch {
      error = t('ca.erreur_lecture');
    }
  }
  /** Reculer / avancer de quelques secondes dans le verset en cours (même geste que le lecteur des phrases). */
  function saut(s: number) {
    if (!audio || !started) return;
    const fin = Number.isFinite(audio.duration) ? audio.duration : Infinity;
    audio.currentTime = Math.max(0, Math.min(audio.currentTime + s, fin));
  }
  async function go(i: number) {
    if (i < 0 || i >= queue.length) return;
    sleepUntil ??= sleepMin > 0 ? Date.now() + sleepMin * 60_000 : null;
    await playAt(i);
  }
  function ended(ev?: Event) {
    // l'élément de réserve ne fait jamais avancer la file
    if (ev && ev.currentTarget !== audio) return;
    // F5 : verset entendu jusqu'au bout (en ligne) gardé pour être réécouté hors ligne ; jamais un récitateur
    // « en ligne seulement »
    const f = pack?.files.find((x) => x.aya === queue[idx]);
    if (f && !reciter.enLigne && !lastUrl.startsWith('blob:')) void garderEcoute(f.url);
    if (sleepUntil && Date.now() >= sleepUntil) return finish('sommeil');
    // hifẓ : silence « à vous » (au moins la durée du verset) avant le verset suivant
    const ms = f && silence > 0 ? silenceMs(f.durationMs, silence, rate) : 0;
    if (!ms) return void playAt(idx + 1);
    gap = true;
    gapTimer = setTimeout(() => void playAt(idx + 1), ms);
  }
  function finish(why: 'fin' | 'sommeil') {
    stop();
    onend?.(why);
  }
  export function stop() {
    viderReserve();
    clearGap();
    resumeNext = false;
    els.forEach((a) => a?.pause());
    playing = false;
    started = false;
    idx = 0;
    sleepUntil = null;
    onaya?.(null);
    onindex?.(null);
  }
  onDestroy(() => {
    clearGap();
    reserve.vider();
    els.forEach((a) => a?.pause());
    urls.forEach(libere);
  });
  const pct = $derived(started ? Math.round(((idx + 1) / Math.max(1, queue.length)) * 100) : 0);
  // la basmala lue en tête de sourate n'est PAS un verset (sauf al-Fātiḥa en Ḥafṣ, où elle est le verset 1 et
  // n'est donc pas ajoutée) : elle n'entre pas dans le compte des écoutes (« 4 versets × 3 » = 12, pas 13)
  const lead = $derived(queue[0] === BASMALA ? 1 : 0);
  const total = $derived(queue.length - lead);
</script>

<div class="player" data-testid="lecteur-audio" data-reciter={reciter.id}>
  <audio bind:this={els[0]} onended={ended} preload="none"></audio>
  <audio bind:this={els[1]} onended={ended} preload="none"></audio>
  <button
    type="button"
    class="who"
    onclick={() => onsettings?.('recitateur')}
    title={reciter.nameFr}
    aria-label={t('cl.reglages_de', { nom: reciter.nameFr })}
    data-testid="mini-recitateur"
    ><span class="nm"><Bidi text={reciter.nameFr} /></span>{#if !isHafs(reciter.riwaya)}<span
        class="autre"
        data-testid="mini-autre-riwaya"><Bidi text={reciter.riwayaFr} /></span
      >{/if}</button
  >
  <div class="controls">
    <button
      type="button"
      class="ic"
      onclick={() => go(idx - 1)}
      disabled={!started || idx === 0}
      aria-label={t('ca.precedent')}
      title={t('ca.precedent')}><span class="flip"><Icon name="fleche" size={20} /></span></button
    >
    <button
      type="button"
      class="ic saut"
      onclick={() => saut(-SAUT_S)}
      disabled={!started}
      aria-label={t('ca.recul', { s: fmtNumber(SAUT_S) })}
      title={t('ca.recul', { s: fmtNumber(SAUT_S) })}
      data-testid="recul-5"
      ><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"
        ><path d="M12 5a7 7 0 1 1-6.7 5M4 4.5v6h6" /><text x="12" y="16" class="n">5</text></svg
      ></button
    >
    <button
      type="button"
      class="play"
      onclick={toggle}
      disabled={!pack || queue.length === 0}
      data-testid="jouer"
      aria-pressed={playing}
      aria-label={playing ? t('ca.pause') : t('ca.ecouter')}
      title={playing ? t('ca.pause') : t('ca.ecouter')}
      >{#if playing}<Icon name="pause" size={22} />{:else}<Icon
          name="lecture"
          filled
          size={22}
        />{/if}</button
    >
    <button
      type="button"
      class="ic saut"
      onclick={() => saut(SAUT_S)}
      disabled={!started}
      aria-label={t('ca.avance', { s: fmtNumber(SAUT_S) })}
      title={t('ca.avance', { s: fmtNumber(SAUT_S) })}
      data-testid="avance-5"
      ><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"
        ><path d="M12 5a7 7 0 1 0 6.7 5M20 4.5v6h-6" /><text x="12" y="16" class="n">5</text></svg
      ></button
    >
    <button
      type="button"
      class="ic"
      onclick={() => go(idx + 1)}
      disabled={!started || idx >= queue.length - 1}
      aria-label={t('ca.suivant')}
      title={t('ca.suivant')}><Icon name="fleche" size={20} /></button
    >
    <button
      type="button"
      class="ic stop"
      onclick={stop}
      disabled={!started}
      aria-label={t('ca.arreter')}
      title={t('ca.arreter')}
      data-testid="arreter-audio"><span class="sq" aria-hidden="true"></span></button
    >
  </div>
  <div class="track">
    <div
      class="bar"
      role="progressbar"
      aria-label={t('ca.progression')}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={pct}
    >
      <span style:width={`${pct}%`}></span>
    </div>
    <p class="where" aria-live="polite" data-testid="position">
      {#if started && aya === BASMALA}<Bidi
          text={t('ca.position_basmala')}
        />{:else if started && aya}<Bidi
          text={t('ca.position', {
            aya: fmtNumber(aya),
            n: fmtNumber(idx + 1 - lead),
            total: fmtNumber(total),
          })}
        />{#if status}<span class="st" data-testid="etape">
            · <Bidi text={status} /></span
          >{/if}{#if gap}<span class="st" data-testid="a-vous">
            · {t('cl.a_vous')}</span
          >{/if}{:else}<Bidi text={t('ca.pret', { total: fmtNumber(total) })} />{/if}
    </p>
  </div>
  <label class="vol" title={t('cl.volume')}
    ><span class="sr">{t('cl.volume')}</span><Icon name="casque" size={18} /><input
      type="range"
      min="0"
      max="1"
      step="0.05"
      value={volume}
      oninput={(e) => onvolume?.(Number(e.currentTarget.value))}
      data-testid="volume"
    /></label
  >
  <button
    type="button"
    class="ic rep"
    onclick={() => onsettings?.('ecoute')}
    aria-label={t('cl.reglages_ecoute')}
    title={t('cl.reglages_ecoute')}
    aria-haspopup="dialog"
    data-testid="ouvrir-reglages"><Icon name="repeter" size={20} /></button
  >
  {#if error}<p class="error" role="alert"><Bidi text={error} /></p>{/if}
</div>

<style>
  .player {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    min-width: 0;
  }
  .who {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    min-height: 44px;
    max-width: 14em;
    padding: 2px 8px;
    font: inherit;
    font-size: 0.82rem;
    font-weight: 700;
    line-height: 1.2;
    color: var(--mp-green);
    background: transparent;
    border: 0;
    border-radius: var(--radius-md);
    cursor: pointer;
    text-align: start;
  }
  .who:hover {
    background: var(--mp-mint);
  }
  .nm,
  .autre {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .autre {
    font-size: 0.72rem;
    color: var(--warn-ink);
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .ic,
  .play {
    display: inline-grid;
    place-items: center;
    width: 44px;
    height: 44px;
    min-height: 44px;
    padding: 0;
    color: var(--mp-green);
    background: transparent;
    border: 0;
    border-radius: 50%;
    cursor: pointer;
  }
  .ic:hover:not(:disabled) {
    background: var(--mp-mint);
  }
  .ic:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .play {
    width: 48px;
    height: 48px;
    color: var(--mp-on-band);
    background: var(--mp-band);
    box-shadow: 0 0 0 3px var(--or-soft);
  }
  .play[aria-pressed='true'] {
    box-shadow: 0 0 0 3px var(--or-line);
  }
  .play:disabled {
    opacity: 0.45;
  }
  .flip {
    display: inline-flex;
    transform: scaleX(-1);
  }
  :global([dir='rtl']) .flip {
    transform: none;
  }
  .saut svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .saut svg .n {
    fill: currentColor;
    stroke: none;
    font: 700 8px var(--font-ui, sans-serif);
    text-anchor: middle;
  }
  :global([dir='rtl']) .controls > .ic:not(.stop, .saut) :global(svg) {
    transform: scaleX(-1);
  }
  .sq {
    width: 12px;
    height: 12px;
    border-radius: 2px;
    background: currentColor;
  }
  .track {
    flex: 1 1 140px;
    min-width: 0;
  }
  .bar {
    height: 4px;
    border-radius: 2px;
    background: var(--mp-mint2);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--or-line);
    transition: width var(--motion) ease;
  }
  .where {
    margin: 3px 0 0;
    font-size: 0.75rem;
    color: var(--mp-ink2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .vol {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--mp-ink2);
  }
  .vol input {
    width: 80px;
    min-height: 44px;
    accent-color: var(--mp-green);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .error {
    flex: 1 1 100%;
    margin: 0;
    font-size: 0.85rem;
    color: var(--bad-ink);
  }
  /* téléphone : le volume est celui de l'appareil */
  @media (max-width: 899px) {
    .vol {
      display: none;
    }
    /*
     * 11/10/2026 (lisibilité) : le nom du récitateur sur SA ligne, en entier (plus de « M. a… ») ; dessous, les
     * commandes et « Verset 12 » écrit en entier
     */
    .player {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      grid-template-areas:
        'who who rep'
        'controls track track';
      gap: 0 4px;
    }
    .who {
      grid-area: who;
      max-width: none;
      padding-inline: 6px;
    }
    .rep {
      grid-area: rep;
    }
    .controls {
      grid-area: controls;
    }
    .track {
      grid-area: track;
      align-self: center;
    }
    .where {
      white-space: normal;
      overflow: visible;
      font-size: 0.8rem;
      line-height: 1.25;
    }
    .controls .ic:not(.stop) {
      width: 40px;
    }
    .error {
      grid-column: 1 / -1;
    }
  }
</style>
