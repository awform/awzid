<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import { audioIdFor, sourceLecteur, type LevelAudio } from '$lib/lecons-audio';
  import type { Forme } from './donnees';

  /**
   * Cahier « Je parle » — une phrase qui se touche pour l'entendre : le LECTEUR DISCRET de l'application (chargé à la
   * demande au premier toucher, famille « l » des leçons : phrase précédente et suivante = les phrases de la page) et
   * le fichier du texte (clé `audioKey`, index audio du niveau). Sans fichier : la phrase s'affiche, sans bouton.
   * L'arabe est sur sa propre ligne, la traduction dessous ; jamais de synthèse sur un texte coranique (`audioIdFor`).
   */
  let {
    forme,
    audio,
    grand = false,
    ligne = false,
  }: { forme: Forme; audio: LevelAudio | null; grand?: boolean; ligne?: boolean } = $props();
  const id = $derived(audioIdFor(forme.ar, audio));

  async function jouer(ev: MouseEvent) {
    const declencheur = ev.currentTarget as HTMLElement;
    try {
      const { ouvrir } = await import('$lib/lecteur/ouvrir');
      await ouvrir({ declencheur, type: 'l', resoudre: sourceLecteur });
    } catch {
      /* fichier ou lecteur indisponible : la phrase reste lisible */
    }
  }
</script>

{#snippet contenu()}
  {#if forme.u && !ligne}<span class="tag"><Bidi text={forme.u} /></span>{/if}
  <span class="ar" class:grand lang="ar" dir="rtl"><Bidi text={forme.ar} base="ar" /></span>
  <span class="fr"><Bidi text={forme.fr} /></span>
{/snippet}

{#if id}
  <button
    type="button"
    class="phrase"
    class:ligne
    data-testid="parler-phrase"
    data-lecteur="l"
    data-audio={id}
    data-phrase
    onclick={jouer}
    ><span class="vh">{t('parler.ecouter')}</span>{@render contenu()}<span
      class="son"
      aria-hidden="true"
      ><svg viewBox="0 0 24 24" width="18" height="18"
        ><path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor" /><path
          d="M15.5 8.5a5 5 0 0 1 0 7"
          stroke="currentColor"
          stroke-width="2"
          fill="none"
          stroke-linecap="round"
        /></svg
      ></span
    ></button
  >
{:else}
  <div class="phrase muet" class:ligne>{@render contenu()}</div>
{/if}

<style>
  .phrase {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.15rem;
    width: 100%;
    min-height: 2.75rem;
    margin: 0;
    padding: 0.45rem 0.75rem 0.5rem 2.6rem;
    border: 0;
    border-radius: var(--radius-md, 14px);
    background: transparent;
    color: var(--ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .phrase.muet {
    cursor: default;
    padding-inline-start: 0.75rem;
  }
  button.phrase:hover {
    background: color-mix(in srgb, var(--primary) 7%, transparent);
  }
  /* ligne d'antisèche : deux cellules, l'arabe à droite, le français à gauche ; l'une sous l'autre sur un écran étroit */
  .ligne {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    gap: 0 0.75rem;
    border-radius: 0;
    padding: 0.3rem 0.6rem 0.3rem 2.4rem;
  }
  .ligne .ar {
    grid-column: 2;
    grid-row: 1;
  }
  .ligne .fr {
    grid-column: 1;
    grid-row: 1;
  }
  @media (max-width: 34rem) {
    .ligne {
      grid-template-columns: 1fr;
    }
    .ligne .fr {
      grid-row: 2;
    }
  }
  .tag {
    align-self: flex-start;
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.1rem 0.6rem;
    border-radius: 999px;
    background: var(--paper);
    color: var(--ink2);
    border: 1px solid var(--line);
  }
  .ar {
    display: block;
    font-family: var(--font-ar);
    font-size: var(--parler-ar, 1.6rem);
    line-height: 2.1;
    text-align: right;
    unicode-bidi: isolate;
  }
  .ar.grand {
    font-size: var(--parler-ar-grand, 1.9rem);
  }
  .ligne .ar {
    font-size: var(--parler-ar-ligne, 1.45rem);
    line-height: 1.9;
  }
  .fr {
    display: block;
    color: var(--ink2);
    font-size: 0.95rem;
  }
  .son {
    position: absolute;
    inset-inline-start: 0.6rem;
    top: 0.75rem;
    display: grid;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 999px;
    color: var(--primary);
    border: 1.5px solid currentColor;
  }
  .ligne .son {
    top: 50%;
    transform: translateY(-50%);
    inset-inline-start: 0.4rem;
  }
  .vh {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  /* phrase en cours dans le lecteur (classe posée par le lecteur discret) */
  :global(.phrase.lecteur-actif) {
    background: color-mix(in srgb, var(--or-line, var(--gold)) 22%, transparent);
    outline: 2px solid var(--or-line, var(--gold));
  }
</style>
