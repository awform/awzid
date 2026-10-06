<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';

  /** A37 — sous-onglets de « Vivre l'islam » : Bon comportement (en premier) · Prières · Adhkār. */
  let { current }: { current: 'comportement' | 'prieres' | 'adhkar' } = $props();
  const TABS = [
    { id: 'comportement', href: '/vivre', icon: 'etoile' },
    { id: 'prieres', href: '/quotidien', icon: 'minuterie' },
    { id: 'adhkar', href: '/quotidien/adhkar', icon: 'chapelet' },
  ] as const;
</script>

<nav class="vt" aria-label={t('vi.espace')}>
  {#each TABS as x (x.id)}
    <a
      href={resolve(x.href)}
      class:on={current === x.id}
      aria-current={current === x.id ? 'page' : undefined}
      data-vivre-tab={x.id}
      ><Icon name={x.icon} size={20} /><span><Bidi text={t(`vi.onglet_${x.id}`)} /></span></a
    >
  {/each}
</nav>

<style>
  .vt {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    margin: var(--space-s) 0 var(--space-m);
  }
  .vt a {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 48px;
    padding: 6px 8px;
    border-radius: var(--radius-pill);
    border: 2px solid var(--line);
    background: var(--card);
    color: var(--ink);
    text-decoration: none;
    font-weight: 800;
    font-size: 0.92rem;
    text-align: center;
  }
  .vt a.on {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--on-primary);
  }
  .vt span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @media (max-width: 380px) {
    .vt a {
      flex-direction: column;
      gap: 2px;
      border-radius: var(--radius-lg);
      font-size: 0.8rem;
    }
    .vt span {
      white-space: normal;
      line-height: 1.15;
    }
  }
</style>
