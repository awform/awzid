<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import Ar from '$lib/Ar.svelte';
  import { listBooklets, readBooklets, type BookletSummary } from '$lib/booklets';
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import type { Unite } from './parcours';

  /**
   * A27 — lectures graduées de SON niveau : un livret s'ouvre après la leçon où l'élève a vu ses mots (« place »
   * donnée par le livre : « après L14 ») ; avant, il est montré fermé (aucun mot en avance).
   */
  let { niveau, unites }: { niveau: string; unites: Unite[] } = $props();
  let list = $state<BookletSummary[]>([]);
  let read = $state<string[]>([]);
  let ready = $state(false);
  /** dernière leçon faite (numéro du livre) */
  const reached = $derived(
    Math.max(
      0,
      ...unites
        .filter((u) => u.kind === 'lecon' && (u.statut === 'terminee' || u.statut === 'maitrisee'))
        .map((u) => u.numLecon ?? u.n),
    ),
  );
  const after = (b: BookletSummary) => {
    const m = /(?:apr[eè]s\s+(?:la\s+)?(?:L|le[cç]on\s*)\s*)(\d+)/i.exec(b.placeFr ?? '');
    return m ? Number(m[1]) : 0;
  };
  onMount(async () => {
    const r = await listBooklets();
    list = r.list.filter((b) => b.level === niveau);
    read = [...(await readBooklets())];
    ready = true;
  });
</script>

<ul class="books" data-testid="livrets-niveau" data-ready={ready}>
  {#each list as b (b.code)}
    {@const open = after(b) <= reached}
    <li class="card book" class:closed={!open} data-livret={b.code} data-ouvert={open}>
      {#if open}
        <a href={resolve('/lectures/[code]', { code: b.code })}>
          <Ar text={b.titreAr ?? ''} tag="p" />
          <strong><Bidi text={b.titreFr} /></strong>
        </a>
      {:else}
        <Ar text={b.titreAr ?? ''} tag="p" />
        <strong><Bidi text={b.titreFr} /></strong>
        <p class="muted small">
          <Icon name="cle" size={16} />
          <Bidi text={t('parc.livret_apres', { n: after(b) })} />
        </p>
      {/if}
      {#if read.includes(b.code)}<span class="lu">{t('bib.lu')}</span>{/if}
    </li>
  {:else}
    {#if ready}<li class="muted">{t('bib.aucun')}</li>{/if}
  {/each}
</ul>
<p><a href={resolve('/lectures')}>{t('parc.toutes_lectures')}</a></p>

<style>
  .books {
    list-style: none;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr));
    gap: 10px;
  }
  .book a {
    text-decoration: none;
    color: var(--ink);
    display: grid;
    gap: 2px;
  }
  .book :global(p.ar) {
    font-size: 1.4rem;
    margin: 0;
  }
  .closed {
    opacity: 0.75;
    border-style: dashed;
  }
  .lu {
    color: var(--ok-ink);
    font-weight: 700;
    font-size: 0.9rem;
  }
  .small {
    font-size: 0.9rem;
  }
</style>
