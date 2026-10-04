<script lang="ts">
  import { onDestroy } from 'svelte';
  import { suraName } from '@awform/hifz';
  import type { Reciter, SuraPack } from '$lib/coran-audio';
  import { fmtNumber, t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import Progress from '$lib/ui/Progress.svelte';
  import { clampRate } from './player';
  import { playableUrl } from './offline-audio';
  import RiwayaBadge from './RiwayaBadge.svelte';

  /**
   * Lot 27 — lecteur audio de l'espace Coran : joue une file de versets (écoute ou mémorisation), vitesse
   * sans changer la hauteur de la voix, minuterie d'arrêt, lecture en arrière-plan avec les commandes du
   * système (Media Session). ADAB : jamais de lecture automatique (toujours un geste de l'utilisateur), pas
   * de musique, pas de points pour l'écoute.
   */
  let {
    reciter,
    pack,
    queue,
    rate = 1,
    sleepMin = 0,
    onaya,
    onindex,
    onend,
  }: {
    reciter: Reciter;
    pack: SuraPack | null;
    queue: number[];
    rate?: number;
    sleepMin?: number;
    onaya?: (aya: number | null) => void;
    /** position dans la file (mémorisation : nouveau verset ou enchaînement) */
    onindex?: (i: number | null) => void;
    onend?: () => void;
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
  // file changée (autre sourate, autre plage) : on repart du début, sans jouer
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
      error = navigator.onLine ? t('ca.erreur_lecture') : t('ca.erreur_hors_ligne');
    }
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
  function stop() {
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
</script>

<div class="player" data-testid="lecteur-audio" data-reciter={reciter.id}>
  <audio bind:this={audio} onended={ended} preload="none"></audio>
  <div class="now">
    <RiwayaBadge riwaya={reciter.riwaya} label={reciter.riwayaFr} />
    <strong>{reciter.nameFr}</strong>
    <span class="ar" lang="ar" dir="rtl">{reciter.nameAr}</span>
  </div>
  <Progress
    value={started ? idx + 1 : 0}
    max={Math.max(1, queue.length)}
    label={t('ca.progression')}
  />
  <p class="where muted" aria-live="polite" data-testid="position">
    {#if started && aya}{t('ca.position', {
        aya: fmtNumber(aya),
        n: fmtNumber(idx + 1),
        total: fmtNumber(queue.length),
      })}{:else}{t('ca.pret', { total: fmtNumber(queue.length) })}{/if}
  </p>
  <div class="controls">
    <button
      type="button"
      class="round"
      onclick={() => go(idx - 1)}
      disabled={!started || idx === 0}
      aria-label={t('ca.precedent')}><Icon name="fleche" size={22} /></button
    >
    <button
      type="button"
      class="primary play"
      onclick={toggle}
      disabled={!pack || queue.length === 0}
      data-testid="jouer"
      aria-pressed={playing}
    >
      {#if playing}<Icon name="pause" filled size={20} />{t('ca.pause')}{:else}<Icon
          name="lecture"
          filled
          size={20}
        />{t('ca.ecouter')}{/if}
    </button>
    <button
      type="button"
      class="round next"
      onclick={() => go(idx + 1)}
      disabled={!started || idx >= queue.length - 1}
      aria-label={t('ca.suivant')}><Icon name="fleche" size={22} /></button
    >
    <button
      type="button"
      class="ghost"
      onclick={stop}
      disabled={!started}
      data-testid="arreter-audio">{t('ca.arreter')}</button
    >
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

<style>
  .player {
    display: grid;
    gap: var(--space-s);
    padding: var(--space-m);
    border-radius: var(--radius-lg);
    background: var(--surface);
  }
  .now {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
  }
  .now .ar {
    font-size: 1.2rem;
    line-height: 1.4;
  }
  .where {
    margin: 0;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-s);
  }
  .round {
    border-radius: 50%;
    padding: 0;
    width: 48px;
  }
  /* « précédent » : flèche retournée (et inversée en arabe, de droite à gauche) */
  .round:not(.next) :global(svg) {
    transform: scaleX(-1);
  }
  :global([dir='rtl']) .round :global(svg) {
    transform: scaleX(-1);
  }
  :global([dir='rtl']) .round:not(.next) :global(svg) {
    transform: none;
  }
  .play {
    min-width: 140px;
  }
</style>
