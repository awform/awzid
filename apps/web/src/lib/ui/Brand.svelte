<script lang="ts">
  import { t } from '$lib/i18n';
  import { encreDeMarque, NOM, SLOGAN } from './brand-ink';
  /**
   * Marque Awzid : symbole (SVG de la marque, non modifié) + nom « Awzid » en texte HTML. Le slogan
   * « Grandir dans le savoir » n'est montré que si `slogan` (page de connexion/accueil), jamais sous l'icône
   * carrée ni en petit. Sur fond sombre : awzid-symbole-sombre.svg (même dessin, couleurs pour fond foncé).
   */
  let { slogan = false, size = 32 }: { slogan?: boolean; size?: number } = $props();
  const largeur = $derived(Math.round((size * 168) / 216));
</script>

<span class="brand-in" class:grand={slogan} data-marque data-testid="marque">
  <span class="sym" data-testid="marque-symbole" style:width="{size}px" style:height="{size}px">
    <img class="clair" src="/awzid-symbole.svg" alt="" width={largeur} height={size} />
    <img class="sombre" src="/awzid-symbole-sombre.svg" alt="" width={largeur} height={size} />
  </span>
  <span class="txt">
    <span class="word" use:encreDeMarque={NOM}>{t('app.nom')}</span>
    {#if slogan}
      <span class="slogan" lang="fr" data-testid="marque-slogan" use:encreDeMarque={SLOGAN}
        >{t('app.slogan')}</span
      >
    {/if}
  </span>
</span>

<style>
  .brand-in {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .sym {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .sym img {
    display: block;
    height: 100%;
    width: auto;
  }
  .sombre {
    display: none !important;
  }
  .brand-in:global([data-fond='sombre']) .clair {
    display: none;
  }
  .brand-in:global([data-fond='sombre']) .sombre {
    display: block !important;
  }
  .txt {
    display: inline-flex;
    flex-direction: column;
    line-height: 1.15;
  }
  .word {
    font-family: var(--font-title);
    font-weight: 700;
    letter-spacing: 0.06em;
  }
  .grand .word {
    font-size: 1.6rem;
  }
  .slogan {
    font-weight: 600;
    font-size: 0.95rem;
  }
  /* très petit écran : le symbole seul dans l'en-tête (le nom reste lu par les lecteurs d'écran) */
  @media (max-width: 359px) {
    .brand-in:not(.grand) .word {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  }
</style>
