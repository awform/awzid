<script lang="ts">
  import { onMount } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { demoProfileFor } from '$lib/attempts';
  import { t } from '$lib/i18n';
  import { charger, type Etat } from './donnees';

  /**
   * Mukhtaṣar Khalīl (interrupteur `khalil`) : sommaire des chapitres puis un chapitre à la fois (`?c=clé`). Texte arabe tel que
   * servi (jamais retapé ni normalisé, aucune translittération, aucune voix), traduction française, explication repliée, note de
   * contexte des passages sensibles (« relève du seul juge ») affichée telle quelle avant la première phrase concernée.
   */
  interface Chap {
    k: string;
    t: string;
    d: number;
    f: number;
  }
  interface Unite {
    n: number;
    ar: string;
    fr: string;
    ti?: number;
    e?: { tx: string; ti?: string };
    c?: number;
  }
  interface Chapitre {
    k: string;
    t: string;
    s: Array<{ t: string; n: number }>;
    ctx: string[];
    u: Unite[];
  }

  let profil = $state<string | null>(null);
  let index = $state<{ c: Chap[] } | null>(null);
  let chap = $state<Chapitre | null>(null);
  let etat = $state<Etat | 'attente'>('attente');

  async function ouvrir(k: string | null) {
    if (!k) {
      chap = null;
      history.replaceState(history.state, '', location.pathname);
      return;
    }
    etat = 'attente';
    const r = await charger<Chapitre>(`khalil/chapitres/${k}`, profil);
    chap = r.data;
    etat = r.etat;
    if (chap) {
      history.replaceState(history.state, '', `?c=${encodeURIComponent(k)}`);
      window.scrollTo(0, 0);
    }
  }
  onMount(async () => {
    const p = await demoProfileFor('').catch(() => null);
    profil = p?.id ?? null;
    const r = await charger<{ c: Chap[] }>('khalil/index', profil);
    index = r.data;
    etat = r.etat;
    const c = new URLSearchParams(location.search).get('c');
    if (index && c && index.c.some((x) => x.k === c)) await ouvrir(c);
  });
  const pos = $derived(chap && index ? index.c.findIndex((c) => c.k === chap!.k) : -1);
  /** titres de section à placer avant une phrase */
  const sections = $derived(new Map((chap?.s ?? []).map((s) => [s.n, s.t])));
</script>

<section class="kh" data-testid="kh">
  <p class="essai"><Bidi text={t('lx.essai')} /></p>
  {#if etat === 'attente' && !index}
    <p class="muted" aria-busy="true"><Bidi text={t('lx.chargement')} /></p>
  {:else if etat === 'ferme'}
    <p class="card"><Bidi text={t('lx.ferme')} /></p>
  {:else if etat === 'adultes'}
    <p class="card" data-testid="kh-adultes"><Bidi text={t('lx.adultes')} /></p>
  {:else if etat === 'hors_ligne'}
    <p class="card"><Bidi text={t('lx.hors_ligne')} /></p>
  {:else if etat === 'indisponible'}
    <p class="card"><Bidi text={t('lx.indisponible')} /></p>
  {:else if chap}
    <nav class="haut">
      <button
        type="button"
        class="button secondary"
        onclick={() => ouvrir(null)}
        data-testid="kh-retour"><Bidi text={t('lx.retour')} /></button
      >
    </nav>
    <h1 data-testid="kh-chapitre"><Bidi text={chap.t} /></h1>
    <ol class="unites">
      {#each chap.u as u, i (u.n)}
        {#if sections.has(u.n) && sections.get(u.n)}
          <li class="section"><h2><Bidi text={sections.get(u.n)!} /></h2></li>
        {/if}
        {#if u.c !== undefined && (i === 0 || chap.u[i - 1]!.c !== u.c)}
          <li class="contexte" role="note">
            <strong><Bidi text={t('khl.contexte')} /></strong>
            <p><Bidi text={chap.ctx[u.c] ?? ''} /></p>
          </li>
        {/if}
        <li class="unite" class:titre={u.ti} data-n={u.n}>
          <span class="num"><Bidi text={String(u.n)} /></span>
          <p class="ar" lang="ar" dir="rtl"><Bidi text={u.ar} base="ar" /></p>
          <p class="fr"><Bidi text={u.fr} /></p>
          {#if u.e}
            <details>
              <summary
                ><Bidi
                  text={u.e.ti ? `${t('khl.explication')} : ${u.e.ti}` : t('khl.explication')}
                /></summary
              >
              <p><Bidi text={u.e.tx} /></p>
            </details>
          {/if}
        </li>
      {/each}
    </ol>
    <nav class="bas">
      {#if pos > 0}<button
          type="button"
          class="button secondary"
          onclick={() => ouvrir(index!.c[pos - 1]!.k)}><Bidi text={t('khl.precedent')} /></button
        >{/if}
      {#if index && pos >= 0 && pos < index.c.length - 1}<button
          type="button"
          class="button"
          data-testid="kh-suivant"
          onclick={() => ouvrir(index!.c[pos + 1]!.k)}><Bidi text={t('khl.suivant')} /></button
        >{/if}
    </nav>
  {:else if index}
    <h1><Bidi text={t('khl.titre')} /></h1>
    <p class="muted"><Bidi text={t('khl.intro')} /></p>
    <ol class="sommaire" data-testid="kh-sommaire">
      {#each index.c as c (c.k)}
        <li>
          <button type="button" onclick={() => ouvrir(c.k)} data-k={c.k}>
            <span class="t"><Bidi text={c.t} /></span>
            <span class="muted"><Bidi text={t('khl.unites', { n: c.f - c.d + 1 })} /></span>
          </button>
        </li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  .kh {
    max-width: 44rem;
    margin-inline: auto;
    display: grid;
    gap: 14px;
  }
  .essai {
    font-size: 0.85rem;
    color: var(--muted, #5a5f66);
  }
  .sommaire,
  .unites {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }
  .sommaire button {
    width: 100%;
    min-height: 48px;
    text-align: start;
    display: grid;
    gap: 2px;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid var(--border, rgba(0, 0, 0, 0.12));
    background: var(--card, transparent);
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .sommaire .t {
    font-weight: 600;
  }
  .unite {
    position: relative;
    padding: 12px 14px 12px 14px;
    border-radius: 12px;
    border: 1px solid var(--border, rgba(0, 0, 0, 0.1));
    display: grid;
    gap: 8px;
  }
  .unite.titre {
    border-color: var(--accent, #0f6e6e);
  }
  .num {
    font-size: 0.75rem;
    color: var(--muted, #5a5f66);
    font-variant-numeric: tabular-nums;
  }
  .ar {
    margin: 0;
    font-family: 'Amiri', 'Noto Naskh Arabic', 'Traditional Arabic', serif;
    font-size: 1.45rem;
    line-height: 2;
    text-align: right;
  }
  .fr {
    margin: 0;
    line-height: 1.55;
  }
  .titre .fr {
    font-weight: 700;
  }
  .section h2 {
    font-size: 1.05rem;
    margin: 14px 0 0;
    color: var(--accent, #0f6e6e);
  }
  .contexte {
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--surface-2, rgba(200, 169, 106, 0.15));
    font-size: 0.92rem;
  }
  .contexte p {
    margin: 4px 0 0;
  }
  details summary {
    cursor: pointer;
    font-weight: 600;
    min-height: 44px;
  }
  details p {
    font-size: 0.93rem;
    line-height: 1.55;
  }
  .bas,
  .haut {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: space-between;
  }
  .bas button,
  .haut button {
    min-height: 44px;
  }
</style>
