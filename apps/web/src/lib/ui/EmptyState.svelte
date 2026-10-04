<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  /** Lot 26 — état vide : une icône, une phrase qui dit quoi faire, une action (facultative). */
  let {
    icon = 'vide',
    title,
    text = '',
    children,
  }: { icon?: string; title: string; text?: string; children?: Snippet } = $props();
</script>

<section class="empty" data-testid="etat-vide">
  <span class="pastille"><Icon name={icon} size={32} /></span>
  <h2><Bidi text={title} /></h2>
  {#if text}<p class="muted"><Bidi {text} /></p>{/if}
  {#if children}<div class="actions">{@render children()}</div>{/if}
</section>

<style>
  .empty {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: var(--space-s);
    padding: var(--space-l) var(--space-m);
    margin: var(--space-m) 0;
    border: 2px dashed var(--line);
    border-radius: var(--radius-lg);
    background: var(--card);
  }
  .pastille {
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: var(--primary-soft);
    color: var(--primary);
  }
  h2 {
    margin: 0;
    font-size: 1.15rem;
  }
  p {
    margin: 0;
    max-width: 42ch;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-s);
    justify-content: center;
    margin-top: var(--space-s);
  }
</style>
