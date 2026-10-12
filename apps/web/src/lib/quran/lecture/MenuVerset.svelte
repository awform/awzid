<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { resolve } from '$app/paths';
  import { suraName } from '@awform/hifz';
  import { localeInfo, t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { noteLines, translationInfo, type TranslatedVerse } from '../translation';
  import { enPaysage } from './paysage';
  import { fondTouche } from './relais';

  /**
   * Coran épuré — PETIT MENU d'un verset (toucher un verset) : Écouter d'ici · Répéter ce verset · Traduction ·
   * Signet · Écrire de mémoire (« J'écris le Coran », A27, si ce verset est au programme de l'élève) · Partager
   * (verset en image, A12). Mémoriser : « Voir / masquer ce verset ». Popover près du verset sur grand écran,
   * feuille du bas sur téléphone. Rien ne joue sans ce geste.
   */
  let {
    at = $bindable(null),
    anchor,
    canListen,
    hafs,
    memo,
    revealed,
    marked,
    ecrire,
    tradKey,
    loadTrad,
    onlisten,
    onrepeat,
    onmark,
    onreveal,
  }: {
    /** verset ouvert (null : menu fermé) */
    at?: { s: number; a: number } | null;
    anchor: HTMLElement | null;
    canListen: boolean;
    /** muṣḥaf Ḥafṣ affiché (traduction et image : Ḥafṣ seulement) */
    hafs: boolean;
    memo: boolean;
    revealed: boolean;
    marked: boolean;
    /** lien « Écrire de mémoire » si le verset est au programme d'écriture de l'élève */
    ecrire: string | null;
    tradKey: string;
    loadTrad: (s: number, a: number) => Promise<TranslatedVerse | null>;
    onlisten: (s: number, a: number) => void;
    onrepeat: (s: number, a: number) => void;
    onmark: (s: number, a: number) => void;
    onreveal: (s: number, a: number) => void;
  } = $props();

  let dlg: HTMLDialogElement | undefined = $state();
  let tr = $state<TranslatedVerse | null | 'attente'>(null);
  let style = $state('');
  const info = $derived(translationInfo(tradKey));

  $effect(() => {
    if (!dlg) return;
    if (at && !dlg.open) {
      tr = null;
      place();
      dlg.showModal();
    } else if (!at && dlg.open) dlg.close();
  });
  /**
   * Téléphone couché : panneau latéral sur toute la hauteur, du côté opposé au verset touché (il reste visible),
   * défilable ; aucun choix ne passe sous une barre (12/10/2026).
   */
  let gauche = $state(false);
  let lateral = $state(false);
  /** grand écran : sous le verset touché, sans sortir de l'écran */
  function place() {
    lateral = enPaysage();
    if (lateral) {
      const r = anchor?.getBoundingClientRect();
      gauche = !!r && r.left + r.width / 2 > window.innerWidth / 2;
      style = '';
      return;
    }
    if (!anchor || window.innerWidth < 600) {
      style = '';
      return;
    }
    const r = anchor.getBoundingClientRect();
    const w = 300;
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2));
    const below = r.bottom + 8;
    const top = below + 380 > window.innerHeight ? Math.max(12, r.top - 388) : below;
    style = `left:${Math.round(left)}px;top:${Math.round(top)}px`;
  }
  function close() {
    at = null;
  }
  function act(f: (s: number, a: number) => void) {
    const x = at;
    close();
    if (x) f(x.s, x.a);
  }
  async function showTrad() {
    if (!at) return;
    tr = 'attente';
    tr = await loadTrad(at.s, at.a);
  }
</script>

<dialog
  bind:this={dlg}
  class="menu"
  class:placed={!!style}
  class:lateral
  class:gauche
  {style}
  aria-labelledby="menu-verset-titre"
  data-testid="menu-verset"
  lang={localeInfo().code}
  dir={localeInfo().dir}
  onclose={close}
  onclick={(e) => dlg && fondTouche(e, dlg, close)}
>
  {#if at}
    {@const bsm = at.a === 0}
    <p class="head" id="menu-verset-titre">
      <Bidi
        text={bsm
          ? t('cl.menu_titre_basmala', { sourate: suraName(at.s) })
          : t('cl.menu_titre', { sourate: suraName(at.s), a: at.a })}
      />
    </p>
    <ul>
      <!-- « Écouter d'ici » en PREMIER et le plus visible -->
      {#if canListen}
        <li>
          <button
            type="button"
            class="principal"
            onclick={() => act(onlisten)}
            data-testid="menu-ecouter"
            ><Icon name="lecture" filled size={22} /><Bidi text={t('cl.menu_ecouter')} /></button
          >
        </li>
      {/if}
      {#if memo && !bsm}
        <li>
          <button type="button" onclick={() => act(onreveal)} data-testid="menu-voir"
            ><Icon name="masque" size={20} /><Bidi
              text={revealed ? t('cl.menu_masquer') : t('cl.menu_voir')}
            /></button
          >
        </li>
      {/if}
      {#if canListen && !bsm}
        <li>
          <button type="button" onclick={() => act(onrepeat)} data-testid="menu-repeter"
            ><Icon name="repeter" size={20} /><Bidi text={t('cl.menu_repeter')} /></button
          >
        </li>
      {/if}
      {#if hafs && info && !bsm}
        <li>
          <button
            type="button"
            onclick={showTrad}
            aria-expanded={tr !== null}
            data-testid="menu-traduction"
            ><Icon name="traduction" size={20} /><Bidi text={t('mp.traduction_court')} /></button
          >
          {#if tr === 'attente'}<p class="tr muted">…</p>
          {:else if tr}
            <div class="tr" lang={info.lang} dir="ltr" data-testid="menu-traduction-texte">
              <p><Bidi text={tr.text} /></p>
              {#if tr.notes}<details>
                  <summary lang={localeInfo().code} dir={localeInfo().dir}>{t('mp.notes')}</summary>
                  {#each noteLines(tr.notes) as l, i (i)}<p class="note">
                      <Bidi text={l} />
                    </p>{/each}
                </details>{/if}
              <p class="credit" lang={localeInfo().code} dir={localeInfo().dir}>
                <Bidi
                  text={t('mp.credit_traduction', { titre: t(info.label), version: info.version })}
                />
              </p>
            </div>
          {/if}
        </li>
      {/if}
      {#if !bsm}<li>
          <button
            type="button"
            onclick={() => act(onmark)}
            aria-pressed={marked}
            data-testid="menu-signet"
            ><Icon name="etoile" size={20} /><Bidi
              text={marked ? t('cl.menu_signet_retirer') : t('cl.menu_signet')}
            /></button
          >
        </li>{/if}
      {#if ecrire && !bsm}
        <li>
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- chemin résolu, suivi d'un paramètre -->
          <a href={ecrire} onclick={close} data-testid="menu-ecrire"
            ><Icon name="plume" size={20} /><Bidi text={t('cl.menu_ecrire')} /></a
          >
        </li>
      {/if}
      {#if hafs && !bsm}
        <li>
          <!-- eslint-disable svelte/no-navigation-without-resolve -- chemin résolu, suivi d'un paramètre -->
          <a
            href={`${resolve('/quotidien/verset')}?s=${at.s}&a=${at.a}`}
            onclick={close}
            data-testid="menu-partager"
            ><Icon name="partager" size={20} /><Bidi text={t('cl.menu_partager')} /></a
          >
          <!-- eslint-enable svelte/no-navigation-without-resolve -->
        </li>
      {/if}
    </ul>
    {#if canListen}<p class="astuce" data-testid="menu-astuce">
        <Bidi text={t('cl.astuce_appui_long')} />
      </p>{/if}
  {/if}
</dialog>

<style>
  .menu {
    width: min(100vw, 420px);
    max-width: 100vw;
    /* barre d'adresse d'Android : la hauteur VISIBLE (dvh), sinon le bas du menu sort de l'écran */
    max-height: 80vh;
    max-height: 90dvh;
    overflow-y: auto;
    overscroll-behavior: contain;
    margin: auto 0 0;
    padding: 6px 8px 12px;
    color: var(--ink);
    background: var(--card);
    border: 1px solid var(--line);
    border-top: 3px solid var(--or-line);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    box-shadow: var(--shadow-float);
  }
  .menu::backdrop {
    background: color-mix(in srgb, var(--mp-ink) 20%, transparent);
  }
  @media (min-width: 600px) {
    .menu {
      margin: auto;
      width: 300px;
      border-radius: var(--radius-lg);
    }
    .menu.placed {
      position: fixed;
      inset: auto;
      margin: 0;
    }
    .menu::backdrop {
      background: transparent;
    }
  }
  /* téléphone couché (PAYSAGE_MQ) : panneau latéral, toute la hauteur visible, défilable, au-dessus de tout */
  @media (orientation: landscape) and (max-height: 500px) {
    .menu.lateral {
      position: fixed;
      top: 0;
      bottom: 0;
      left: auto;
      right: 0;
      width: min(340px, 46vw);
      height: auto;
      max-height: none;
      margin: 0;
      padding: 6px 8px max(12px, env(safe-area-inset-bottom));
      border: 0;
      border-left: 3px solid var(--or-line);
      border-radius: 0;
    }
    .menu.lateral.gauche {
      left: 0;
      right: auto;
      border-left: 0;
      border-right: 3px solid var(--or-line);
    }
    .menu.lateral::backdrop {
      background: color-mix(in srgb, var(--mp-ink) 20%, transparent);
    }
  }
  .head {
    margin: 4px 8px 6px;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--mp-green);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  button,
  a {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 12px;
    width: 100%;
    min-height: 48px;
    padding: 0 10px;
    font: inherit;
    color: var(--ink);
    text-align: start;
    text-decoration: none;
    background: transparent;
    border: 0;
    border-radius: var(--radius-md);
    cursor: pointer;
  }
  button :global(svg),
  a :global(svg) {
    color: var(--mp-green);
    flex: none;
  }
  button:hover,
  a:hover {
    background: var(--mp-mint);
  }
  /* « Écouter d'ici » : action principale, la plus visible */
  .principal {
    min-height: 54px;
    margin-bottom: 4px;
    font-weight: 800;
    color: var(--mp-on-band);
    background: var(--mp-band);
  }
  .principal :global(svg) {
    color: var(--mp-on-band);
  }
  .principal:hover {
    background: var(--mp-green);
  }
  .astuce {
    margin: 6px 10px 0;
    font-size: 0.78rem;
    color: var(--ink2);
  }
  button[aria-pressed='true'] :global(svg) {
    color: var(--or-line);
  }
  .tr {
    margin: 2px 10px 8px;
    padding: 8px 10px;
    font-size: 0.95rem;
    line-height: 1.55;
    background: var(--surface);
    border-radius: var(--radius-md);
  }
  .tr p {
    margin: 0 0 4px;
  }
  .note,
  .credit {
    font-size: 0.8rem;
    color: var(--ink2);
  }
  summary {
    min-height: 44px;
    font-size: 0.85rem;
    cursor: pointer;
  }
</style>
