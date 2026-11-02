<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { resolve } from '$app/paths';
  import { fn } from '$lib/fonctions.svelte';
  import { t } from '$lib/i18n';
  import BoutonEcoute from '$lib/ecoute/BoutonEcoute.svelte';
  import Feuille from '$lib/quran/lecture/Feuille.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  /**
   * « Lecteur simple » — panneau « Outils » : tout ce que la barre du haut portait avant (Traduction, Grand texte, Retrouve ce verset,
   * Réglages), plus le réglage « Souligner les mots que je reconnais », la recherche d'un mot et les sources. Un toucher sur « Outils »,
   * un toucher sur la ligne voulue : rien ne disparaît, rien n'occupe le haut de l'écran.
   */
  let {
    open = $bindable(false),
    trad = null,
    grand,
    profileId,
    profKind,
    cm,
    ontrad,
    ongrand,
    onreglages,
    oninfos,
  }: {
    open?: boolean;
    /** traduction : null (muṣḥaf d'une autre riwāya, pas de traduction) ou « affichée » */
    trad?: boolean | null;
    grand: boolean;
    profileId: string | null;
    profKind: string;
    cm: typeof import('$lib/coran-mots') | null;
    ontrad: () => void;
    ongrand: () => void;
    onreglages: () => void;
    oninfos: () => void;
  } = $props();

  /** « Mots du Coran » ouvert pour cette personne et prêt (même condition que la pastille) */
  const mots = $derived(!!cm && fn('coran_mots') && cm.reglage.pret);
  /** ferme le panneau puis agit (le texte du Coran réapparaît, ou la feuille demandée s'ouvre) */
  const agir = (f: () => void) => () => {
    open = false;
    f();
  };
</script>

<button
  type="button"
  class="outils-btn"
  onclick={() => (open = true)}
  aria-haspopup="dialog"
  data-testid="ouvrir-outils">{t('ls.outils')}</button
>

<Feuille id="outils" title={t('ls.outils_titre')} bind:open testid="outils">
  <ul class="outils" data-testid="outils-liste">
    {#if trad !== null}
      <li>
        <button type="button" aria-pressed={trad} onclick={agir(ontrad)} data-testid="mp-trad">
          <Icon name="traduction" size={22} /><span>{t('mp.traduction_court')}</span>
        </button>
      </li>
    {/if}
    <li>
      <button
        type="button"
        aria-pressed={grand}
        onclick={agir(ongrand)}
        data-testid="barre-grand-texte"
      >
        <Icon name="taille" size={22} /><span>{t('cl.grand_texte')}</span>
      </button>
    </li>
    {#if profileId && fn('shazam_coran')}
      <li class="retrouver">
        <BoutonEcoute {profileId} kind={profKind} portion={null} retrouver />
      </li>
    {/if}
    <li>
      <button type="button" onclick={agir(onreglages)} data-testid="ouvrir-reglages-lecteur">
        <Icon name="reglages" size={22} /><span>{t('cl.reglages')}</span>
      </button>
    </li>
    {#if mots}
      <li>
        <label class="souligner">
          <input
            type="checkbox"
            role="switch"
            checked={cm!.reglage.on}
            onchange={(e) => cm!.reglage.regler(e.currentTarget.checked)}
            data-testid="cm-souligner"
          />
          <span>{t('ls.souligner')}</span>
        </label>
      </li>
      <li>
        <!-- eslint-disable svelte/no-navigation-without-resolve -- chemin résolu -->
        <a href={resolve('/coran/mots')} data-testid="cm-chercher">
          <Icon name="loupe" size={22} /><span>{t('ls.chercher')}</span>
        </a>
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
      </li>
    {/if}
    <li>
      <button type="button" onclick={agir(oninfos)} data-testid="infos-texte">
        <Icon name="info" size={22} /><span>{t('cl.sources')}</span>
      </button>
    </li>
    {#if mots}
      <li>
        <!-- eslint-disable svelte/no-navigation-without-resolve -- chemin résolu, suivi d'une ancre -->
        <a class="petit" href={`${resolve('/coran/mots')}#sources`} data-testid="cm-sources">
          <Bidi text={t('ls.sources_donnees')} />
        </a>
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
      </li>
    {/if}
  </ul>
</Feuille>

<style>
  /* le bouton de la barre du haut (même allure que « Réglages » avant : pastille dorée de 44 px) */
  .outils-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-inline-size: 44px;
    min-block-size: 44px;
    padding: 0 12px;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--or-ink);
    background: var(--or-soft);
    border: 1px solid var(--or-line);
    border-radius: var(--radius-pill);
    cursor: pointer;
  }
  .outils {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .outils button,
  .outils a,
  .outils .souligner,
  .retrouver :global(.rv) {
    display: flex;
    align-items: center;
    gap: 12px;
    inline-size: 100%;
    box-sizing: border-box;
    min-block-size: 48px;
    padding: 0 12px;
    font: inherit;
    font-weight: 700;
    color: var(--mp-green);
    text-align: start;
    text-decoration: none;
    background: transparent;
    border: 0;
    border-radius: var(--radius-md);
    cursor: pointer;
  }
  .outils button:hover,
  .outils a:hover,
  .retrouver :global(.rv:hover) {
    background: var(--mp-mint);
  }
  .outils button[aria-pressed='true'] {
    color: var(--or-ink);
    background: var(--or-soft);
  }
  .souligner input {
    inline-size: 1.4rem;
    block-size: 1.4rem;
    margin: 0;
    accent-color: var(--primary);
  }
  .petit {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--ink2);
  }
</style>
