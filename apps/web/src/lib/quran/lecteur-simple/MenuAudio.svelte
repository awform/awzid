<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { fmtNumber, t } from '$lib/i18n';
  import Feuille from '$lib/quran/lecture/Feuille.svelte';

  /**
   * « Lecteur simple » — le bouton « ⋯ » de la barre audio compacte et son menu : ce que « Écouter ici / Reprendre où j'étais / + » et
   * les petits boutons du lecteur proposaient avant (écouter d'ici, reprendre, autres actions du verset, reculer et avancer de 5 s,
   * récitateur, réglages d'écoute, arrêter). Un toucher sur « ⋯ », un toucher sur la ligne voulue.
   */
  let {
    open = $bindable(false),
    reprendre,
    recitateur,
    ici,
    onreprendre,
    onverset,
    onsaut,
    onrecitateur,
    onecoute,
    onarreter,
  }: {
    open?: boolean;
    /** une lecture a été mise en pause en changeant d'emplacement : « Reprendre où j'étais » */
    reprendre: boolean;
    recitateur: string;
    ici: () => void;
    onreprendre: () => void;
    onverset: () => void;
    onsaut: (s: number) => void;
    onrecitateur: () => void;
    onecoute: () => void;
    onarreter: () => void;
  } = $props();

  const agir = (f: () => void) => () => {
    open = false;
    f();
  };
  const SAUT_S = 5;
</script>

<button
  type="button"
  class="mplus"
  onclick={() => (open = true)}
  aria-haspopup="dialog"
  aria-label={t('ls.audio_plus')}
  title={t('ls.audio_plus')}
  data-testid="audio-plus"
>
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"
    ><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle
      cx="19"
      cy="12"
      r="1.8"
    /></svg
  >
</button>

<Feuille id="audio-plus" title={t('ls.audio_titre')} bind:open testid="audio-menu">
  <ul class="liste">
    <li>
      <button type="button" onclick={agir(ici)} data-testid="am-ici">{t('cl.ecouter_ici')}</button>
    </li>
    {#if reprendre}
      <li>
        <button type="button" onclick={agir(onreprendre)} data-testid="am-reprendre"
          >{t('cl.reprendre_lecture')}</button
        >
      </li>
    {/if}
    <li>
      <button type="button" onclick={agir(onverset)} data-testid="am-verset"
        >{t('cl.autres_actions')}</button
      >
    </li>
    <li>
      <button type="button" onclick={() => onsaut(-SAUT_S)} data-testid="am-recul"
        ><Bidi text={t('ca.recul', { s: fmtNumber(SAUT_S) })} /></button
      >
    </li>
    <li>
      <button type="button" onclick={() => onsaut(SAUT_S)} data-testid="am-avance"
        ><Bidi text={t('ca.avance', { s: fmtNumber(SAUT_S) })} /></button
      >
    </li>
    <li>
      <button type="button" onclick={agir(onrecitateur)} data-testid="am-recitateur"
        ><Bidi text={t('cl.reglages_de', { nom: recitateur })} /></button
      >
    </li>
    <li>
      <button type="button" onclick={agir(onecoute)} data-testid="am-ecoute"
        >{t('cl.reglages_ecoute')}</button
      >
    </li>
    <li>
      <button type="button" onclick={agir(onarreter)} data-testid="am-arreter"
        >{t('ca.arreter')}</button
      >
    </li>
  </ul>
</Feuille>

<style>
  .mplus {
    display: inline-grid;
    place-items: center;
    inline-size: 44px;
    block-size: 44px;
    padding: 0;
    color: var(--mp-green);
    background: transparent;
    border: 0;
    border-radius: 50%;
    cursor: pointer;
  }
  .mplus svg {
    fill: currentColor;
  }
  .mplus:hover {
    background: var(--mp-mint);
  }
  .liste {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .liste button {
    display: flex;
    align-items: center;
    inline-size: 100%;
    box-sizing: border-box;
    min-block-size: 48px;
    padding: 0 12px;
    font: inherit;
    font-weight: 700;
    color: var(--mp-green);
    text-align: start;
    background: transparent;
    border: 0;
    border-radius: var(--radius-md);
    cursor: pointer;
  }
  .liste button:hover {
    background: var(--mp-mint);
  }
</style>
