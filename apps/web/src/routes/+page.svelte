<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import Ar from '$lib/Ar.svelte';
  import { isQuranReadingLevel, isReligionLevel } from '$lib/api';
  import { demoProfileFor } from '$lib/attempts';
  import { t } from '$lib/i18n';
  import { levelParts } from '$lib/levels';
  import type { ProfileInfo } from '$lib/session';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import EspaceNiveau from '$lib/parcours/EspaceNiveau.svelte';
  let { data } = $props();

  /**
   * Onglet « Arabe ». A27 : un élève ne voit QUE son niveau (espace du niveau) ; sans profil d'élève, le
   * catalogue des livres (lot 26 : titre arabe, filière en couleur, nombre d'unités).
   */
  let profile = $state<ProfileInfo | null>(null);
  let ready = $state(false);
  onMount(async () => {
    profile = await demoProfileFor('').catch(() => null);
    ready = true;
  });
  const arabic = $derived(
    data.levels.filter((x) => !isReligionLevel(x.code) && !isQuranReadingLevel(x.code)),
  );
</script>

<svelte:head><title>{t('app.nom')} — {t('onglets.arabe')}</title></svelte:head>

<a class="today card" href={resolve('/aujourdhui')} data-testid="lien-aujourdhui">
  <span class="today-ic"><Icon name="maison" /></span>
  <span>{t('auj.lien')}</span>
</a>
{#if profile}
  <!-- A27 : l'élève ne voit QUE son niveau (onglets, anciens livres, aperçu du suivant) -->
  <h1>{t('parc.mon_arabe')}</h1>
  <EspaceNiveau {profile} matiere="arabe" />
{:else if ready}
  <h1>{t('arabe.titre')}</h1>
  {#if data.offline}<p class="card warnbox">{t('arabe.hors_ligne')}</p>{/if}

  {#snippet book(l: (typeof arabic)[number], current: boolean)}
    <li>
      <a
        class="book"
        class:current
        data-track={levelParts(l.code)?.track ?? ''}
        href={resolve('/niveaux/[code]', { code: l.code })}
        data-testid="level"
      >
        <span class="code"><Bidi text={l.codeFr ?? l.code} /></span>
        {#if l.titreAr}<span class="titre-ar"><Ar text={l.titreAr} /></span>{/if}
        <span class="titre"><Bidi text={l.titleFr} /></span>
        <small><Bidi text={t('arabe.unites', { n: l.units })} /></small>
      </a>
    </li>
  {/snippet}

  {#if arabic.length === 0}
    <EmptyState icon="telecharger" title={t('arabe.titre')} text={t('arabe.hors_ligne')}>
      <a class="button" href={resolve('/hors-ligne')}>{t('entete.telechargements')}</a>
    </EmptyState>
  {/if}
  <!-- sans profil d'élève (visiteur, famille, maître) : le catalogue des livres -->
  <ul class="books">
    {#each arabic as l (l.code)}{@render book(l, false)}{/each}
  </ul>
  <p class="more">
    <a class="button" href={resolve('/revisions')} data-testid="lien-revisions"
      ><Icon name="revisions" size={20} />{t('revisions.titre')}</a
    >
    <a class="button" href={resolve('/ecriture')}
      ><Icon name="plume" size={20} />{t('trace.titre')}</a
    >
  </p>
  <p class="edition"><Bidi text={t('arabe.edition', { edition: data.edition })} /></p>
{/if}

<style>
  .today {
    display: flex;
    align-items: center;
    gap: var(--space-m);
    text-decoration: none;
    font-weight: 700;
    color: var(--primary);
    min-height: var(--target);
  }
  .today-ic {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--primary-soft);
  }
  .books {
    list-style: none;
    padding: 0;
    margin: var(--space-m) 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
    gap: var(--space-m);
  }
  .book {
    --spine: var(--primary);
    position: relative;
    display: grid;
    gap: 4px;
    height: 100%;
    padding: var(--space-m) var(--space-m) var(--space-m) calc(var(--space-m) + 10px);
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    text-decoration: none;
    color: var(--ink);
    overflow: hidden;
    transition:
      transform var(--motion-fast) ease,
      border-color var(--motion-fast) ease;
  }
  /* dos du livre : couleur de la filière */
  .book::before {
    content: '';
    position: absolute;
    inset-block: 0;
    inset-inline-start: 0;
    width: 8px;
    background: var(--spine);
  }
  .book[data-track='enfants'] {
    --spine: var(--c2);
  }
  .book[data-track='ados'] {
    --spine: var(--c1);
  }
  .book[data-track='adultes'] {
    --spine: var(--accent);
  }
  .book:hover {
    transform: translateY(-2px);
    border-color: var(--spine);
  }
  .book.current {
    border: 2px solid var(--spine);
  }
  .code {
    font-weight: 800;
    font-size: 0.85rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink2);
  }
  .titre-ar {
    font-size: 1.15em;
  }
  .titre {
    font-weight: 600;
  }
  small,
  .edition {
    color: var(--ink2);
  }
  .more {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>
