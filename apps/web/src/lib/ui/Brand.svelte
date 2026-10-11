<script lang="ts">
  import { t } from '$lib/i18n';
  /**
   * Marque Awzid : symbole (SVG de la marque, non modifié, servi comme fichier statique) + nom « Awzid » en
   * texte HTML. Le slogan « Grandir dans le savoir » n'est montré que si `slogan` (page de connexion), jamais
   * sous l'icône carrée ni en petit. Le symbole (clair ou pour fond foncé) et la couleur du nom se règlent en CSS
   * seulement, par les variables `--mh-*` (posée sur l'en-tête) ou `--mp-*` (posée sur la page : `surPage`),
   * calculées à la génération de tokens.css selon le fond de chaque thème et mode.
   */
  let {
    slogan = false,
    surPage = false,
    size = 32,
  }: { slogan?: boolean; surPage?: boolean; size?: number } = $props();
  const largeur = $derived(Math.round((size * 168) / 216));
</script>

<span class="brand-in" class:grand={slogan} class:pg={surPage} data-marque data-testid="marque">
  <span class="sym" data-testid="marque-symbole" style:width="{size}px" style:height="{size}px">
    <img class="clair" src="/awzid-symbole.svg" alt={t('app.nom')} width={largeur} height={size} />
    <img class="sombre" src="/awzid-symbole-sombre.svg" alt="" width={largeur} height={size} />
  </span>
  <span class="txt">
    <span class="word">{t('app.nom')}</span>
    {#if slogan}
      <span class="slogan" lang="fr" data-testid="marque-slogan">{t('app.slogan')}</span>
    {/if}
  </span>
</span>

<style>
  .brand-in {
    --v-clair: var(--mh-clair, block);
    --v-sombre: var(--mh-sombre, none);
    --v-nom: var(--mh-nom, currentColor);
    --v-slogan: var(--mh-slogan, currentColor);
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .pg {
    --v-clair: var(--mp-clair, block);
    --v-sombre: var(--mp-sombre, none);
    --v-nom: var(--mp-nom, currentColor);
    --v-slogan: var(--mp-slogan, currentColor);
  }
  .sym {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .sym img {
    height: 100%;
    width: auto;
  }
  .clair {
    display: var(--v-clair);
  }
  .sombre {
    display: var(--v-sombre);
  }
  .txt {
    display: inline-flex;
    flex-direction: column;
    line-height: 1.15;
  }
  .word {
    color: var(--v-nom);
    /* police de la marque : Lexend 600, auto-hébergée (static/fonts) */
    font-family: var(--font-brand);
    font-weight: 600;
    letter-spacing: 0.06em;
  }
  .grand .word {
    font-size: 1.6rem;
  }
  .slogan {
    color: var(--v-slogan);
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
