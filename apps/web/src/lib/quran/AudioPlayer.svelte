<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onDestroy } from 'svelte';
  import { suraName } from '@awform/hifz';
  import type { Reciter, SuraPack } from '$lib/coran-audio';
  import { fmtNumber, t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { shortName } from './lecture';
  import { clampRate, isHafs } from './player';
  import { playableUrl } from './offline-audio';

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
    onaya,
    onindex,
    onend,
    onsettings,
    onvolume,
  }: {
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
    onend?: () => void;
    /** ouvre le panneau « Réglages » du lecteur (à la section donnée : « ecoute », « recitateur ») */
    onsettings?: (section?: 'ecoute' | 'recitateur') => void;
    onvolume?: (v: number) => void;
  } = $props();

  let audio: HTMLAudioElement | undefined = $state();
  let idx = $state(0);
  let playing = $state(false);
  let started = $state(false);
  let error = $state('');
  let sleepUntil: number | null = null;
  let lastUrl = '';

  const aya = $derived(queue[idx] ?? null);
  $effect(() => {
    if (audio) {
      audio.playbackRate = clampRate(rate);
      audio.preservesPitch = true;
    }
  });
  $effect(() => {
    if (audio) audio.volume = Math.max(0, Math.min(1, volume));
  });
  // file changée (autre sourate, autre plage, autres réglages) : on repart du début, sans jouer
  $effect(() => {
    void queue;
    void pack;
    stop();
  });

  function setMedia(a: number) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t('ca.media_titre', { sourate: suraName(pack?.sura ?? 1), aya: fmtNumber(a) }),
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
    if (i >= queue.length) return finish();
    idx = Math.max(0, i);
    const f = pack.files.find((x) => x.aya === queue[idx]);
    if (!f) return playAt(idx + 1);
    error = '';
    if (lastUrl.startsWith('blob:')) URL.revokeObjectURL(lastUrl);
    lastUrl = await playableUrl(f.url);
    audio.src = lastUrl;
    audio.playbackRate = clampRate(rate);
    audio.preservesPitch = true;
    try {
      await audio.play();
      playing = true;
      started = true;
      onaya?.(f.aya);
      onindex?.(idx);
      setMedia(f.aya);
    } catch {
      playing = false;
      error = navigator.onLine
        ? t('ca.erreur_lecture')
        : t(reciter.enLigne ? 'ca.dispo_internet' : 'ca.erreur_hors_ligne');
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

  async function toggle() {
    if (!audio) return;
    if (playing) {
      audio.pause();
      playing = false;
      return;
    }
    if (!started) {
      sleepUntil = sleepMin > 0 ? Date.now() + sleepMin * 60_000 : null;
      return playAt(idx);
    }
    try {
      await audio.play();
      playing = true;
    } catch {
      error = t('ca.erreur_lecture');
    }
  }
  async function go(i: number) {
    if (i < 0 || i >= queue.length) return;
    sleepUntil ??= sleepMin > 0 ? Date.now() + sleepMin * 60_000 : null;
    await playAt(i);
  }
  function ended() {
    if (sleepUntil && Date.now() >= sleepUntil) return finish();
    void playAt(idx + 1);
  }
  function finish() {
    stop();
    onend?.();
  }
  export function stop() {
    audio?.pause();
    playing = false;
    started = false;
    idx = 0;
    sleepUntil = null;
    onaya?.(null);
    onindex?.(null);
  }
  onDestroy(() => {
    audio?.pause();
    if (lastUrl.startsWith('blob:')) URL.revokeObjectURL(lastUrl);
  });
  const pct = $derived(started ? Math.round(((idx + 1) / Math.max(1, queue.length)) * 100) : 0);
</script>

<div class="player" data-testid="lecteur-audio" data-reciter={reciter.id}>
  <audio bind:this={audio} onended={ended} preload="none"></audio>
  <button
    type="button"
    class="who"
    onclick={() => onsettings?.('recitateur')}
    title={reciter.nameFr}
    aria-label={t('cl.reglages_de', { nom: reciter.nameFr })}
    data-testid="mini-recitateur"
    ><span class="nm"><Bidi text={shortName(reciter.nameFr)} /></span
    >{#if !isHafs(reciter.riwaya)}<span class="autre" data-testid="mini-autre-riwaya"
        ><Bidi text={reciter.riwayaFr} /></span
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
      {#if started && aya}<Bidi
          text={t('ca.position', {
            aya: fmtNumber(aya),
            n: fmtNumber(idx + 1),
            total: fmtNumber(queue.length),
          })}
        />{#if status}<span class="st" data-testid="etape">
            · <Bidi text={status} /></span
          >{/if}{:else}<Bidi text={t('ca.pret', { total: fmtNumber(queue.length) })} />{/if}
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
    max-width: 9.5em;
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
  :global([dir='rtl']) .controls > .ic:not(.stop) :global(svg) {
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
    .player {
      flex-wrap: nowrap;
      gap: 2px 4px;
    }
    .who {
      max-width: 6.5em;
      padding-inline: 4px;
    }
    .controls .ic:not(.stop) {
      width: 40px;
    }
  }
</style>
