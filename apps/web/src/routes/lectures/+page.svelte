<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import Ar from '$lib/Ar.svelte';
  import { demoProfileFor } from '$lib/attempts';
  import {
    keepBooklet,
    keptBooklets,
    listBooklets,
    readBooklets,
    removeBooklet,
    type BookletSummary,
  } from '$lib/booklets';
  import { t } from '$lib/i18n';

  /**
   * Bibliothèque des livrets gradués : un livret est proposé après la leçon où l'élève a vu ses mots
   * (« place »). Lecture à l'écran, livrets gardés sur l'appareil pour la lecture sans réseau.
   */
  let list: BookletSummary[] = $state([]);
  let offline = $state(false);
  let kept: string[] = $state([]);
  let read: string[] = $state([]);
  let level = $state('');
  let busy = $state('');
  let msg = $state('');
  let ready = $state(false);
  const levels = $derived([...new Set(list.map((b) => b.level))]);
  const shown = $derived(list.filter((b) => !level || b.level === level));

  onMount(async () => {
    const r = await listBooklets();
    const p = await demoProfileFor('');
    const lv = p?.levelCode ?? (p?.kind === 'adulte' ? 'ad1' : 'en1');
    const codes = r.list.map((b) => b.level);
    kept = [...(await keptBooklets(r.list))];
    read = [...(await readBooklets())];
    level = codes.includes(lv) ? lv : (codes[0] ?? '');
    list = r.list;
    offline = r.offline;
    ready = true;
  });

  async function keepLevel() {
    busy = level;
    let n = 0;
    for (const b of shown) if (!kept.includes(b.code) && (await keepBooklet(b.code))) n++;
    kept = [...(await keptBooklets(list))];
    busy = '';
    msg = t('bib.gardes', { n });
  }
  async function toggleKeep(code: string) {
    busy = code;
    if (kept.includes(code)) await removeBooklet(code);
    else await keepBooklet(code);
    kept = [...(await keptBooklets(list))];
    busy = '';
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('onglets.lectures')}</title></svelte:head>

<h1>{t('lectures.titre')}</h1>
<p class="muted">{t('lectures.texte')}</p>
{#if offline}<p class="card">{t('bib.hors_ligne')}</p>{/if}
{#if msg}<p class="card ok" role="status">{msg}</p>{/if}

<div class="row" role="group" aria-label={t('bib.niveau')}>
  {#each levels as l (l)}
    <button type="button" class:primary={level === l} onclick={() => (level = l)} data-niveau={l}
      >{t('bib.niveau_n', { code: l })}</button
    >
  {/each}
</div>
{#if shown.length && !offline}
  <p>
    <button type="button" onclick={keepLevel} disabled={!!busy} data-testid="garder-niveau"
      >{t('bib.garder_niveau')}</button
    >
  </p>
{/if}

<ul class="books" data-testid="livrets" data-ready={ready}>
  {#each shown as b (b.code)}
    <li class="card book" data-livret={b.code}>
      <a href={resolve('/lectures/[code]', { code: b.code })}>
        <Ar text={b.titreAr ?? ''} tag="p" />
        <strong>{b.titreFr}</strong>
      </a>
      <p class="muted small">{b.resumeFr}</p>
      <p class="small">
        {t('bib.pages', { n: b.pages ?? 0 })}{#if b.placeFr}
          · {b.placeFr}{/if}
        {#if read.includes(b.code)}
          · <span class="lu">{t('bib.lu')}</span>{/if}
        {#if kept.includes(b.code)}
          · <span class="kept" data-testid="garde">{t('bib.sur_appareil')}</span>{/if}
      </p>
      {#if !offline}
        <button type="button" class="small" disabled={!!busy} onclick={() => toggleKeep(b.code)}
          >{kept.includes(b.code) ? t('bib.retirer') : t('bib.garder')}</button
        >
      {/if}
    </li>
  {:else}
    <li class="muted">{t('bib.aucun')}</li>
  {/each}
</ul>

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .books {
    list-style: none;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 10px;
  }
  .book a {
    text-decoration: none;
    color: var(--ink);
    display: grid;
    gap: 2px;
  }
  .book :global(p.ar) {
    font-size: 1.5rem;
    margin: 0;
  }
  .lu {
    color: var(--ok-ink);
    font-weight: 700;
  }
  .kept {
    color: var(--teal);
  }
  .small {
    font-size: 0.9rem;
  }
  .ok {
    background: var(--ok-bg);
  }
</style>
