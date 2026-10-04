<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';

  /** Lot 27 — onglets de l'espace Coran : Muṣḥaf (page par page), Lire, Écouter, Mémoriser, Mes récitateurs. */
  let { current }: { current: 'mushaf' | 'lire' | 'ecouter' | 'memoriser' | 'recitateurs' } =
    $props();
  const TABS = [
    { id: 'mushaf', href: '/coran/mushaf', icon: 'mushaf' },
    { id: 'lire', href: '/coran/lecteur', icon: 'lire' },
    { id: 'ecouter', href: '/coran/ecouter', icon: 'casque' },
    { id: 'memoriser', href: '/coran/memoriser', icon: 'repeter' },
    { id: 'recitateurs', href: '/coran/recitateurs', icon: 'personne' },
  ] as const;
</script>

<nav class="seg" aria-label={t('ca.espace')}>
  {#each TABS as x (x.id)}
    <a
      href={resolve(x.href)}
      class:on={current === x.id}
      aria-current={current === x.id ? 'page' : undefined}
      data-coran-tab={x.id}
      ><Icon name={x.icon} size={20} /><span><Bidi text={t(`ca.onglet_${x.id}`)} /></span></a
    >
  {/each}
</nav>

<style>
  .seg {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
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
  }
  /* cinq onglets : sur les très petits écrans, ils défilent dans la barre (jamais la page) */
  @media (max-width: 420px) {
    .seg {
      grid-template-columns: repeat(5, minmax(68px, 1fr));
      overflow-x: auto;
    }
  }
</style>
