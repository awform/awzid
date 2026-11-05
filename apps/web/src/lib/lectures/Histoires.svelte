<script lang="ts">
  import { onMount } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { demoProfileFor } from '$lib/attempts';
  import { t } from '$lib/i18n';
  import { charger, type Etat } from './donnees';
  import Recit, { type RecitData } from './Recit.svelte';

  /**
   * « Histoire, de la création à nos jours » (interrupteur `histoires`) : sommaire par livre, puis un récit à la fois (`?r=id`).
   * Le profil enfant ne reçoit du serveur que la version enfant.
   */
  interface Entree {
    id: string;
    t: string;
    e: number;
    a: number;
    /** renvoi vers un récit d'un autre livre (cycle de Mūsā → livre 1) */
    l?: string;
  }
  interface Livre {
    id: string;
    n: number;
    t: string;
    r: Entree[];
    /** 5/11 : bloc « Le cycle de Mūsā » (livre 2), dans l'ordre de lecture */
    cycle?: { t: string; r: Entree[] };
  }
  interface Index {
    p: string;
    /** avertissement au lecteur, en tête de chaque livre */
    av?: Entree;
    livres: Livre[];
  }
  let profil = $state<string | null>(null);
  let enfant = $state(false);
  let index = $state<Index | null>(null);
  let recit = $state<RecitData | null>(null);
  let etat = $state<Etat | 'attente'>('attente');

  async function ouvrir(id: string | null) {
    if (!id) {
      recit = null;
      history.replaceState(history.state, '', location.pathname);
      return;
    }
    etat = 'attente';
    const r = await charger<RecitData>(`histoires/recits/${id}`, profil, enfant);
    recit = r.data;
    etat = r.etat;
    if (recit) {
      history.replaceState(history.state, '', `?r=${encodeURIComponent(id)}`);
      window.scrollTo(0, 0);
    }
  }
  onMount(async () => {
    const p = await demoProfileFor('').catch(() => null);
    profil = p?.id ?? null;
    enfant = p?.kind === 'enfant';
    const r = await charger<Index>('histoires/index', profil, enfant);
    index = r.data;
    etat = r.etat;
    const demande = new URLSearchParams(location.search).get('r');
    if (
      index &&
      demande &&
      (index.av?.id === demande || index.livres.some((l) => l.r.some((x) => x.id === demande)))
    )
      await ouvrir(demande);
  });
  const numero = (l: Livre, i: number) => (l.id === 'l1' ? i : i + 1);
  /** récits du livre hors du cycle (le cycle est présenté à part, en tête) */
  const horsCycle = (l: Livre) =>
    l.cycle ? l.r.filter((x) => !l.cycle!.r.some((c) => c.id === x.id)) : l.r;
</script>

<svelte:head>
  <!-- Literata (adulte) et Andika (enfant), auto-hébergées : seulement sur cette page, jamais au démarrage ni en précache -->
  <link rel="stylesheet" href="/polices-histoires/polices.css" />
</svelte:head>

{#snippet ligne(r: Entree, n: string)}
  <li>
    <button type="button" onclick={() => ouvrir(r.id)} data-r={r.id} class:renvoi={r.l}>
      <span class="n"><Bidi text={n} /></span>
      <span class="t"
        >{#if r.l}<span class="ou"
            ><Bidi
              text={t('hx.renvoi', { n: index?.livres.find((x) => x.id === r.l)?.n ?? 1 })}
            /></span
          >{/if}<Bidi text={r.t} /></span
      >
      {#if enfant ? r.e : r.e || r.a}<span class="audio"><Bidi text={t('hx.audio')} /></span>{/if}
    </button>
  </li>
{/snippet}

{#if recit}
  <Recit {recit} onretour={() => ouvrir(null)} />
{:else}
  <section class="hx-sommaire" data-testid="hx-sommaire">
    <p class="essai"><Bidi text={t('lx.essai')} /></p>
    {#if etat === 'attente' && !index}
      <p class="muted" aria-busy="true"><Bidi text={t('lx.chargement')} /></p>
    {:else if etat === 'ferme'}
      <p class="card"><Bidi text={t('lx.ferme')} /></p>
    {:else if etat === 'hors_ligne'}
      <p class="card"><Bidi text={t('lx.hors_ligne')} /></p>
    {:else if etat === 'indisponible'}
      <p class="card"><Bidi text={t('lx.indisponible')} /></p>
    {:else if index}
      <h1><Bidi text={t('hx.titre')} /></h1>
      {#each index.livres as l (l.id)}
        <section class="livre" aria-labelledby="hx-{l.id}">
          <h2 id="hx-{l.id}">
            <span class="num"><Bidi text={t('hx.livre', { n: l.n })} /></span>
            <Bidi text={l.t} />
          </h2>
          {#if index.av}
            <ul class="av" data-testid="hx-av-{l.id}">{@render ligne(index.av, '·')}</ul>
          {/if}
          {#if l.cycle}
            <h3 class="bloc" data-testid="hx-cycle"><Bidi text={l.cycle.t} /></h3>
            <ol>
              {#each l.cycle.r as r, i (r.id)}{@render ligne(r, String(i + 1))}{/each}
            </ol>
            <h3 class="bloc"><Bidi text={t('hx.autres')} /></h3>
          {/if}
          <ol>
            {#each horsCycle(l) as r, i (r.id)}{@render ligne(r, String(numero(l, i)))}{/each}
          </ol>
        </section>
      {/each}
    {/if}
  </section>
{/if}

<style>
  .hx-sommaire {
    max-width: 44rem;
    margin-inline: auto;
    display: grid;
    gap: 16px;
  }
  .essai {
    font-size: 0.85rem;
    color: var(--muted, #5a5f66);
  }
  .livre h2 {
    display: grid;
    gap: 2px;
    font-size: 1.2rem;
    margin: 8px 0 10px;
  }
  .livre .num {
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted, #5a5f66);
  }
  .bloc {
    font-size: 1rem;
    margin: 14px 0 8px;
  }
  .av {
    margin-bottom: 8px;
  }
  .ou {
    display: block;
    font-size: 0.75rem;
    color: var(--muted, #5a5f66);
  }
  .renvoi {
    border-style: dashed;
  }
  ol,
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  button {
    width: 100%;
    min-height: 48px;
    display: grid;
    grid-template-columns: 2.2em minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    text-align: start;
    padding: 10px 14px;
    border-radius: 12px;
    border: 1px solid var(--border, rgba(0, 0, 0, 0.12));
    background: var(--card, transparent);
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .n {
    font-variant-numeric: tabular-nums;
    color: var(--muted, #5a5f66);
  }
  .audio {
    font-size: 0.75rem;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid currentColor;
  }
</style>
