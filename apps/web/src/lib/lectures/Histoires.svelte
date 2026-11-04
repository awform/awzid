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
  interface Livre {
    id: string;
    n: number;
    t: string;
    r: Array<{ id: string; t: string; e: number; a: number }>;
  }
  let profil = $state<string | null>(null);
  let enfant = $state(false);
  let index = $state<{ p: string; livres: Livre[] } | null>(null);
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
    const r = await charger<{ p: string; livres: Livre[] }>('histoires/index', profil, enfant);
    index = r.data;
    etat = r.etat;
    const demande = new URLSearchParams(location.search).get('r');
    if (index && demande && index.livres.some((l) => l.r.some((x) => x.id === demande)))
      await ouvrir(demande);
  });
  const numero = (l: Livre, i: number) => (l.id === 'l1' ? i : i + 1);
</script>

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
          <ol>
            {#each l.r as r, i (r.id)}
              <li>
                <button type="button" onclick={() => ouvrir(r.id)} data-r={r.id}>
                  <span class="n"><Bidi text={String(numero(l, i))} /></span>
                  <span class="t"><Bidi text={r.t} /></span>
                  {#if enfant ? r.e : r.e || r.a}<span class="audio"
                      ><Bidi text={t('hx.audio')} /></span
                    >{/if}
                </button>
              </li>
            {/each}
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
  ol {
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
