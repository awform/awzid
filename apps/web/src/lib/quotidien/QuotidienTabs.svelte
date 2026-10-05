<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';

  /** A12 — onglets de l'espace « Au quotidien » : horaires, qibla, adhkār, verset à partager. */
  let { current }: { current: 'horaires' | 'qibla' | 'adhkar' | 'verset' } = $props();
  const TABS = [
    { id: 'horaires', href: '/quotidien', icon: 'minuterie' },
    { id: 'qibla', href: '/quotidien/qibla', icon: 'boussole' },
    { id: 'adhkar', href: '/quotidien/adhkar', icon: 'chapelet' },
    { id: 'verset', href: '/quotidien/verset', icon: 'partager' },
  ] as const;
</script>

<nav class="seg" aria-label={t('qt.espace')}>
  {#each TABS as x (x.id)}
    <a
      href={resolve(x.href)}
      class:on={current === x.id}
      aria-current={current === x.id ? 'page' : undefined}
      data-quotidien-tab={x.id}
      ><Icon name={x.icon} size={20} /><span><Bidi text={t(`qt.onglet_${x.id}`)} /></span></a
    >
  {/each}
</nav>

<style>
  .seg {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
    padding: 4px;
    margin: var(--space-s) 0 var(--space-m);
    border-radius: var(--radius-lg);
    background: var(--surface);
  }
  .seg a {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: 56px;
    padding: 4px;
    border-radius: var(--radius-md);
    color: var(--ink2);
    text-decoration: none;
    font-size: 0.85rem;
    font-weight: 700;
    text-align: center;
    transition: background var(--motion-fast) ease;
  }
  .seg a.on {
    background: var(--card);
    color: var(--primary);
    box-shadow: var(--shadow-card);
  }
  .seg span {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
