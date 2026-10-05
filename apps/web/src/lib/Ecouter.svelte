<script lang="ts">
  import { getContext } from 'svelte';
  import { t } from './i18n';
  import { AUDIO_CTX, audioIdFor, playLessonAudio, type LevelAudio } from './lecons-audio';

  /**
   * Bouton « écouter » d'un texte arabe de la leçon (A3) : présent SEULEMENT si le fichier du texte existe
   * (jamais de synthèse du navigateur, jamais sur un texte coranique) ; gros bouton (48 px au moins),
   * second bouton « lentement » (0,8, même hauteur de voix) ; aucune lecture automatique.
   */
  let { text, label, small = false }: { text: string; label?: string; small?: boolean } = $props();

  const audio = getContext<(() => LevelAudio | null) | undefined>(AUDIO_CTX);
  const id = $derived(audioIdFor(text, audio?.() ?? null));
  let playing = $state(false);

  async function play(slow: boolean) {
    if (!id) return;
    playing = true;
    try {
      const a = await playLessonAudio(id, slow);
      const end = () => (playing = false);
      a.addEventListener('ended', end, { once: true });
      a.addEventListener('pause', end, { once: true });
    } catch {
      playing = false;
    }
  }
</script>

{#if id}<span class="ecouter" class:small dir="ltr"
    ><button
      type="button"
      class="spk"
      class:playing
      data-testid="ecouter"
      data-audio={id}
      aria-label={label ?? t('audio.ecouter')}
      title={t('audio.mention')}
      onclick={() => play(false)}
      ><svg viewBox="0 0 24 24" aria-hidden="true"
        ><path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor" /><path
          d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12"
          stroke="currentColor"
          stroke-width="2"
          fill="none"
          stroke-linecap="round"
        /></svg
      ></button
    ><button
      type="button"
      class="lent"
      data-testid="ecouter-lent"
      aria-label={t('audio.ecouter_lent')}
      onclick={() => play(true)}>{t('audio.lent')}</button
    ></span
  >{/if}

<style>
  .ecouter {
    display: inline-flex;
    gap: 4px;
    align-items: center;
    vertical-align: middle;
    margin-inline: 6px;
  }
  button {
    border: 2px solid var(--teal);
    background: var(--card);
    color: var(--teal);
    cursor: pointer;
    font: inherit;
    padding: 0;
  }
  .spk {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: inline-grid;
    place-items: center;
  }
  .spk svg {
    width: 26px;
    height: 26px;
  }
  .spk.playing {
    background: var(--teal);
    color: var(--card);
  }
  .lent {
    min-height: 48px;
    padding: 0 10px;
    border-radius: 24px;
    font-size: 14px;
    font-family: var(--font-ui);
  }
  .small .spk,
  .small .lent {
    width: auto;
    min-width: 44px;
    height: 44px;
    min-height: 44px;
  }
  button:focus-visible {
    outline: 3px solid var(--gold);
    outline-offset: 2px;
  }
</style>
