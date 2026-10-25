<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { loadTexts, t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';

  /**
   * « Retrouve ce verset » : bouton de la barre du lecteur (interrupteur `shazam_coran`). Chargé À LA DEMANDE,
   * seulement quand la fonction est ouverte, hors de la coquille de l'élève (l'écran dédié a besoin du réseau) ; son
   * libellé vient des textes de l'écoute, chargés avec lui.
   */
  let pret = $state(false);
  onMount(async () => {
    await loadTexts('ecoute');
    pret = true;
  });
</script>

{#if pret}
  <a class="rv" href={resolve('/coran/retrouver')} data-testid="retrouver-verset"
    ><Icon name="oreille" size={22} /><span>{t('rv.titre')}</span></a
  >
{/if}

<style>
  /* même allure que les outils de la barre du lecteur (.tool) */
  .rv {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 44px;
    min-height: 44px;
    padding: 0 8px;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--mp-green);
    text-decoration: none;
    border: 1px solid transparent;
    border-radius: var(--radius-pill);
  }
  .rv:hover {
    background: var(--mp-mint);
  }
  .rv:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
