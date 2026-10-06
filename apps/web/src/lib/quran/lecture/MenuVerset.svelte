<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { resolve } from '$app/paths';
  import { suraName } from '@awform/hifz';
  import { localeInfo, t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { noteLines, translationInfo, type TranslatedVerse } from '../translation';

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
  /** grand écran : sous le verset touché, sans sortir de l'écran */
  function place() {
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
  {style}
  aria-labelledby="menu-verset-titre"
  data-testid="menu-verset"
  lang={localeInfo().code}
  dir={localeInfo().dir}
  onclose={close}
  onclick={(e) => e.target === dlg && close()}
>
  {#if at}
    <p class="head" id="menu-verset-titre">
      <Bidi text={t('cl.menu_titre', { sourate: suraName(at.s), a: at.a })} />
    </p>
    <ul>
      {#if memo}
        <li>
          <button type="button" onclick={() => act(onreveal)} data-testid="menu-voir"
            ><Icon name="masque" size={20} /><Bidi
              text={revealed ? t('cl.menu_masquer') : t('cl.menu_voir')}
            /></button
          >
        </li>
      {/if}
      {#if canListen}
        <li>
          <button type="button" onclick={() => act(onlisten)} data-testid="menu-ecouter"
            ><Icon name="lecture" size={20} /><Bidi text={t('cl.menu_ecouter')} /></button
          >
        </li>
        <li>
          <button type="button" onclick={() => act(onrepeat)} data-testid="menu-repeter"
            ><Icon name="repeter" size={20} /><Bidi text={t('cl.menu_repeter')} /></button
          >
        </li>
      {/if}
      {#if hafs && info}
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
      <li>
        <button
          type="button"
          onclick={() => act(onmark)}
          aria-pressed={marked}
          data-testid="menu-signet"
          ><Icon name="etoile" size={20} /><Bidi
            text={marked ? t('cl.menu_signet_retirer') : t('cl.menu_signet')}
          /></button
        >
      </li>
      {#if ecrire}
        <li>
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- chemin résolu, suivi d'un paramètre -->
          <a href={ecrire} onclick={close} data-testid="menu-ecrire"
            ><Icon name="plume" size={20} /><Bidi text={t('cl.menu_ecrire')} /></a
          >
        </li>
      {/if}
      {#if hafs}
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
  {/if}
</dialog>

<style>
  .menu {
    width: min(100vw, 420px);
    max-width: 100vw;
    max-height: 80vh;
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
