<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import Ar from '$lib/Ar.svelte';
  import { isQuranReadingLevel, isReligionLevel } from '$lib/api';
  import { demoProfileFor } from '$lib/attempts';
  import { t } from '$lib/i18n';
  import { levelFitsProfile, levelParts } from '$lib/levels';
  import type { ProfileInfo } from '$lib/session';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  let { data } = $props();

  /**
   * Onglet « Arabe » (lot 26) : les livres du profil d'abord (« Pour toi »), les autres ensuite ; chaque
   * livre est une carte avec son titre arabe, sa filière en couleur et son nombre d'unités.
   */
  let profile = $state<ProfileInfo | null>(null);
  onMount(async () => {
    profile = await demoProfileFor('').catch(() => null);
  });
  const arabic = $derived(
    data.levels.filter((x) => !isReligionLevel(x.code) && !isQuranReadingLevel(x.code)),
  );
  const mine = $derived(
    profile
      ? arabic
          .filter((l) => levelFitsProfile(l.code, profile!.kind))
          .sort(
            (a, b) => Number(b.code === profile!.levelCode) - Number(a.code === profile!.levelCode),
          )
      : [],
  );
  const others = $derived(arabic.filter((l) => !mine.includes(l)));
</script>

<svelte:head><title>{t('app.nom')} — {t('onglets.arabe')}</title></svelte:head>

<a class="today card" href={resolve('/aujourdhui')} data-testid="lien-aujourdhui">
  <span class="today-ic"><Icon name="maison" /></span>
  <span>{t('auj.lien')}</span>
</a>
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
{#if mine.length}
  <ul class="books" data-testid="mes-livres">
    {#each mine as l (l.code)}{@render book(l, l.code === profile?.levelCode)}{/each}
  </ul>
  {#if others.length}<h2 class="autres">{t('arabe.autres')}</h2>{/if}
{/if}
<ul class="books">
  {#each others as l (l.code)}{@render book(l, false)}{/each}
</ul>
<p class="more">
  <a class="button" href={resolve('/revisions')} data-testid="lien-revisions"
    ><Icon name="revisions" size={20} />{t('revisions.titre')}</a
  >
  <a class="button" href={resolve('/ecriture')}><Icon name="plume" size={20} />{t('trace.titre')}</a
  >
</p>
<p class="edition"><Bidi text={t('arabe.edition', { edition: data.edition })} /></p>

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
  .autres {
    margin-top: var(--space-l);
  }
  .more {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>
