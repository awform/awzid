<script lang="ts">
  import type { Snippet } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { localeInfo, t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';

  /**
   * Coran épuré — FEUILLE (dialogue modal natif) : glisse du bas sur téléphone, panneau à droite sur grand
   * écran. Clavier : Échap ferme, le focus reste dans la feuille (dialogue modal), retour au bouton d'origine.
   */
  let {
    id,
    title,
    open = $bindable(false),
    testid,
    children,
  }: {
    id: string;
    title: string;
    open?: boolean;
    testid?: string;
    children: Snippet;
  } = $props();

  let dlg: HTMLDialogElement | undefined = $state();
  $effect(() => {
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    else if (!open && dlg.open) dlg.close();
  });
</script>

<dialog
  bind:this={dlg}
  class="sheet"
  aria-labelledby={`${id}-titre`}
  data-testid={testid}
  lang={localeInfo().code}
  dir={localeInfo().dir}
  onclose={() => (open = false)}
  onclick={(e) => {
    // clic sur le fond (hors du contenu) : fermer
    if (e.target === dlg) open = false;
  }}
>
  <div class="in">
    <header>
      <h2 id={`${id}-titre`}><Bidi text={title} /></h2>
      <button
        type="button"
        class="x"
        onclick={() => (open = false)}
        aria-label={t('tj.fermer')}
        data-testid="fermer-feuille"><Icon name="ajouter" size={22} /></button
      >
    </header>
    {#if open}{@render children()}{/if}
  </div>
</dialog>

<style>
  .sheet {
    width: min(460px, 100vw);
    max-width: 100vw;
    max-height: min(86vh, 760px);
    margin: auto 0 0;
    padding: 0;
    color: var(--ink);
    background: var(--card);
    border: 0;
    border-top: 3px solid var(--or-line);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    box-shadow: var(--shadow-float);
    overscroll-behavior: contain;
  }
  .sheet[open] {
    animation: up var(--motion) ease-out;
  }
  @keyframes up {
    from {
      transform: translateY(24px);
      opacity: 0;
    }
  }
  .sheet::backdrop {
    background: color-mix(in srgb, var(--mp-ink) 35%, transparent);
  }
  .in {
    padding: 0 16px 20px;
  }
  header {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 0 8px;
    background: var(--card);
  }
  h2 {
    flex: 1;
    margin: 0;
    font-size: 1.05rem;
    color: var(--mp-green);
  }
  .x {
    display: inline-grid;
    place-items: center;
    width: 44px;
    height: 44px;
    min-height: 44px;
    padding: 0;
    color: var(--ink2);
    background: transparent;
    border: 0;
    border-radius: 50%;
  }
  .x :global(svg) {
    transform: rotate(45deg);
  }
  .x:hover {
    background: var(--surface);
  }
  @media (max-width: 599px) {
    .sheet {
      width: 100vw;
      margin: auto 0 0;
    }
  }
  @media (min-width: 600px) {
    .sheet {
      margin: auto;
      border-radius: var(--radius-lg);
    }
  }
</style>
