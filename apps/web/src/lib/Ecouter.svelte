<script lang="ts">
  import { getContext } from 'svelte';
  import { t } from './i18n';
  import { AUDIO_CTX, audioIdFor, leconsSource, SLOW_RATE, type LevelAudio } from './lecons-audio';

  /**
   * Bouton « écouter » d'un texte arabe de la leçon (A3) : présent SEULEMENT si le fichier du texte existe
   * (jamais de synthèse du navigateur, jamais sur un texte coranique) ; gros bouton (48 px au moins),
   * second bouton « lentement » (0,75, même hauteur de voix) ; aucune lecture automatique.
   * Le lecteur (pause, recul, avance, phrase précédente et suivante, boucle, vitesse, lecture continue) est chargé
   * à la demande au premier appui, jamais avant : `$lib/lecteur/ouvrir`.
   */
  let { text, label, small = false }: { text: string; label?: string; small?: boolean } = $props();

  const audio = getContext<(() => LevelAudio | null) | undefined>(AUDIO_CTX);
  const id = $derived(audioIdFor(text, audio?.() ?? null));
  let bouton: HTMLButtonElement | undefined = $state();

  async function play(lent: boolean) {
    if (!id || !bouton) return;
    try {
      const { ouvrir } = await import('./lecteur/ouvrir');
      await ouvrir({
        declencheur: bouton,
        type: 'l',
        resoudre: leconsSource,
        vitesse: lent ? SLOW_RATE : undefined,
      });
    } catch {
      /* fichier ou lecteur indisponible : le bouton reste utilisable */
    }
  }
</script>

{#if id}<span class="ecouter" class:small dir="ltr"
    ><button
      type="button"
      class="spk"
      data-testid="ecouter"
      data-audio={id}
      data-lecteur="l"
      bind:this={bouton}
      aria-label={label ?? t('audio.ecouter')}
      onclick={() => play(false)}
      ><svg viewBox="0 0 24 24" aria-hidden="true"
        ><path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor" /><path
          d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12"
          stroke="currentColor"
          stroke-width="2"
          fill="none"
          stroke-linecap="round"
        /></svg
      ><span class="nom">{t('audio.ecouter')}</span></button
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
  /* D1 : jamais une icône seule — « Écouter » est écrit à côté du haut-parleur */
  .spk {
    min-height: 48px;
    padding: 0 12px 0 8px;
    border-radius: 24px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .nom {
    font-size: 14px;
    font-family: var(--font-ui);
    font-weight: 600;
  }
  .spk svg {
    width: 26px;
    height: 26px;
  }
  /* la classe « playing » est posée par le lecteur pendant la lecture de cette phrase */
  .spk:global(.playing) {
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
    min-width: 44px;
    height: 44px;
    min-height: 44px;
  }
  button:focus-visible {
    outline: 3px solid var(--gold);
    outline-offset: 2px;
  }
</style>
