<script lang="ts">
  import { t } from '$lib/i18n';

  /**
   * Douas (phase 2) — bouton « Écouter » d'une doua tirée d'un hadith : voix de synthèse PROVISOIRE (décision du
   * client du 15/10/2026), sans aucune mention « provisoire » (décision du 18/10/2026). Jamais pour un verset : le
   * fichier n'existe que pour les hadiths (garde Coran à la génération et dans scripts/douas.mjs) et ce composant
   * n'est rendu que si `src` est fourni. Aucune lecture automatique ; un seul son à la fois.
   */
  let { src, id }: { src: string; id: string } = $props();
  let bouton: HTMLButtonElement | undefined = $state();

  /** Le lecteur (pause, recul, avance, vitesse…) est chargé à la demande, au premier appui. */
  async function toggle() {
    if (!bouton) return;
    try {
      const { ouvrir } = await import('$lib/lecteur/ouvrir');
      await ouvrir({ declencheur: bouton, type: 'd', resoudre: async (ref) => ({ url: ref }) });
    } catch {
      /* fichier ou lecteur indisponible */
    }
  }
</script>

<span class="ecouter" dir="ltr"
  ><button
    type="button"
    class="spk"
    data-testid="douas-ecouter"
    data-audio={src}
    data-lecteur="d"
    data-doua-id={id}
    bind:this={bouton}
    onclick={toggle}
    ><svg viewBox="0 0 24 24" aria-hidden="true"
      ><path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor" /><path
        d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12"
        stroke="currentColor"
        stroke-width="2"
        fill="none"
        stroke-linecap="round"
      /></svg
    ><span>{t('do.ecouter')}</span></button
  ></span
>

<style>
  .ecouter {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: 2px 0 6px;
  }
  .spk {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 44px;
    padding: 0 12px 0 8px;
    border-radius: 22px;
    border: 2px solid var(--teal);
    background: var(--card);
    color: var(--teal);
    font: inherit;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
  }
  .spk svg {
    width: 24px;
    height: 24px;
  }
  .spk:global(.playing) {
    background: var(--teal);
    color: var(--card);
  }
  .spk:focus-visible {
    outline: 3px solid var(--gold);
    outline-offset: 2px;
  }
</style>
