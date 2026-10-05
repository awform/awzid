<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { suraName } from '@awform/hifz';
  import { fmtNumber, t } from '$lib/i18n';
  import type { Onglet } from '../lecture';
  import { SURA_NAMES_AR } from '../sura-names-ar';
  import Feuille from './Feuille.svelte';

  /**
   * Coran épuré — SÉLECTEUR ouvert par la puce « Al-Ikhlāṣ · v. 2 · p. 604 · juzʾ 30 » (ou les sélecteurs
   * dorés de la barre sur grand écran) : recherche en tête, puis onglets Sourate / Page / Juzʾ / Ḥizb.
   * La recherche accepte une référence (« 2:255 », « page 50 », « juz 3 », numéro de sourate), filtre la liste
   * des sourates par leur nom, et cherche des mots arabes dans les sourates déjà ouvertes.
   */
  let {
    open = $bindable(false),
    tab = $bindable<Onglet>('sourate'),
    pos,
    lengths,
    hizb,
    onverse,
    onpage,
    onjuz,
    onhizb,
    onsearch,
  }: {
    open?: boolean;
    tab?: Onglet;
    pos: { s: number; a: number; p: number; juz: number };
    lengths: readonly number[];
    /** ḥizb disponibles (Ḥafṣ ; absents des données des autres riwāyāt) */
    hizb: boolean;
    onverse: (s: number, a: number) => void;
    onpage: (p: number) => void;
    onjuz: (j: number) => void;
    onhizb: (n: number) => void;
    /** référence → navigue et renvoie null ; texte arabe → versets trouvés */
    onsearch: (q: string) => Promise<Array<{ s: number; a: number }> | null>;
  } = $props();

  const TABS = $derived(
    (['sourate', 'page', 'juz', 'hizb'] as const).filter((x) => hizb || x !== 'hizb'),
  );
  let q = $state('');
  let verse = $state(1);
  let pageN = $state(1);
  let suraSel = $state(1);
  let results = $state<Array<{ s: number; a: number }> | null>(null);
  $effect(() => {
    if (open) {
      suraSel = pos.s;
      verse = pos.a;
      pageN = pos.p;
      results = null;
    }
  });
  /** forme simple pour filtrer les noms latins (sans signes diacritiques ni apostrophes) */
  const LATIN: Record<string, string> = {
    ā: 'a',
    á: 'a',
    à: 'a',
    â: 'a',
    ī: 'i',
    î: 'i',
    ū: 'u',
    û: 'u',
    é: 'e',
    è: 'e',
    ê: 'e',
    ḥ: 'h',
    ṣ: 's',
    ḍ: 'd',
    ṭ: 't',
    ẓ: 'z',
    ḏ: 'd',
    ṯ: 't',
  };
  /** forme de comparaison d'un nom LATIN (jamais du texte coranique) : sans signes ni apostrophes */
  const plain = (x: string) =>
    [...x.toLowerCase()]
      .map((c) => LATIN[c] ?? c)
      .join('')
      .replace(/[ʿʾ'’-]/g, '');
  const suras = $derived.by(() => {
    const all = Array.from({ length: 114 }, (_, i) => i + 1);
    const k = plain(q.trim());
    if (!k || /^\d+\s*[:. ]/.test(k) || /^(p|page|j|juz)\s*\d/.test(k)) return all;
    if (/^\d+$/.test(k)) return all.filter((s) => String(s).startsWith(k));
    if (/[؀-ۿ]/.test(q)) return all;
    return all.filter((s) => plain(suraName(s)).includes(k));
  });
  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    const r = await onsearch(q);
    if (r === null) open = false;
    else results = r;
  }
  function goSura(s: number) {
    suraSel = s;
    onverse(s, 1);
    open = false;
  }
  function onKeyTabs(e: KeyboardEvent) {
    const i = TABS.indexOf(tab as (typeof TABS)[number]);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const d = (e.key === 'ArrowRight') === (document.dir !== 'rtl') ? 1 : -1;
      tab = TABS[(i + d + TABS.length) % TABS.length]!;
      document.getElementById(`sel-tab-${tab}`)?.focus();
      e.preventDefault();
    }
  }
</script>

<Feuille id="selecteur" title={t('cl.aller_a')} bind:open testid="selecteur">
  <form class="search" role="search" onsubmit={submit}>
    <input
      type="search"
      bind:value={q}
      placeholder={t('cl.recherche_aide')}
      aria-label={t('mp.recherche')}
      data-testid="sel-recherche"
    />
    <button type="submit" class="go">{t('mp.chercher')}</button>
  </form>
  {#if results}
    <section class="results" aria-label={t('mp.resultats')} data-testid="sel-resultats">
      {#if !results.length}<p class="muted"><Bidi text={t('mp.recherche_vide')} /></p>{:else}
        <p class="muted small">{t('mp.recherche_portee')}</p>
        <ul>
          {#each results as r (`${r.s}:${r.a}`)}<li>
              <button
                type="button"
                class="link"
                onclick={() => {
                  onverse(r.s, r.a);
                  open = false;
                }}><Bidi text={t('mp.resultat', { sourate: suraName(r.s), a: r.a })} /></button
              >
            </li>{/each}
        </ul>
      {/if}
    </section>
  {/if}

  <div class="tabs" role="tablist" aria-label={t('cl.aller_a')} tabindex="-1" onkeydown={onKeyTabs}>
    {#each TABS as x (x)}
      <button
        type="button"
        role="tab"
        id={`sel-tab-${x}`}
        aria-selected={tab === x}
        aria-controls={`sel-panel-${x}`}
        tabindex={tab === x ? 0 : -1}
        onclick={() => (tab = x)}
        data-testid={`sel-onglet-${x}`}><Bidi text={t(`cl.onglet_${x}`)} /></button
      >
    {/each}
  </div>

  <div class="panel" id={`sel-panel-${tab}`} role="tabpanel" aria-labelledby={`sel-tab-${tab}`}>
    {#if tab === 'sourate'}
      <form
        class="row"
        onsubmit={(e) => {
          e.preventDefault();
          onverse(suraSel, Math.max(1, Math.min(lengths[suraSel - 1] ?? 1, verse)));
          open = false;
        }}
      >
        <label
          >{t('mp.verset')}
          <input
            type="number"
            inputmode="numeric"
            min="1"
            max={lengths[suraSel - 1] ?? 1}
            bind:value={verse}
            data-testid="sel-verset"
          /></label
        >
        <span class="muted small"
          ><Bidi text={`${fmtNumber(suraSel)}. ${suraName(suraSel)}`} /></span
        >
        <button type="submit" class="go" data-testid="sel-verset-aller">{t('ca.aller')}</button>
      </form>
      <ul class="suras" data-testid="sel-sourates">
        {#each suras as s (s)}
          <li>
            <button
              type="button"
              class="sura"
              class:on={s === pos.s}
              aria-current={s === pos.s ? 'true' : undefined}
              onclick={() => goSura(s)}
              data-sourate={s}
            >
              <span class="num">{fmtNumber(s)}</span>
              <span class="fr"
                ><Bidi text={suraName(s)} /><small
                  ><Bidi text={t('ca.versets', { n: lengths[s - 1] ?? 0 })} /></small
                ></span
              >
              <span class="ar" lang="ar" dir="rtl"
                ><Bidi text={SURA_NAMES_AR[s - 1] ?? ''} base="ar" /></span
              >
            </button>
          </li>
        {/each}
      </ul>
    {:else if tab === 'page'}
      <form
        class="row"
        onsubmit={(e) => {
          e.preventDefault();
          onpage(pageN);
          open = false;
        }}
      >
        <label
          >{t('mp.page')}
          <input
            type="number"
            inputmode="numeric"
            min="1"
            max="604"
            bind:value={pageN}
            data-testid="sel-page"
          /></label
        >
        <span class="muted small">{t('cl.sur_604')}</span>
        <button type="submit" class="go" data-testid="sel-page-aller">{t('ca.aller')}</button>
      </form>
    {:else}
      {@const n = tab === 'juz' ? 30 : 60}
      {@const now = tab === 'juz' ? pos.juz : 0}
      <ul class="grid" data-testid={`sel-grille-${tab}`}>
        {#each Array.from({ length: n }, (_, i) => i + 1) as k (k)}
          <li>
            <button
              type="button"
              class="cell"
              class:on={k === now}
              aria-current={k === now ? 'true' : undefined}
              aria-label={t(tab === 'juz' ? 'mp.juz_n' : 'cl.hizb_n', { n: k })}
              onclick={() => {
                if (tab === 'juz') onjuz(k);
                else onhizb(k);
                open = false;
              }}
              data-testid={`sel-${tab}-${k}`}>{fmtNumber(k)}</button
            >
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</Feuille>

<style>
  .search {
    display: flex;
    gap: 6px;
    margin-bottom: 10px;
  }
  .search input {
    flex: 1;
    min-width: 0;
  }
  input {
    font: inherit;
    min-height: var(--target);
  }
  .go {
    color: var(--on-primary);
    background: var(--primary);
    border-color: var(--primary);
  }
  .tabs {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: 4px;
    padding: 4px;
    margin-bottom: 10px;
    background: var(--surface);
    border-radius: var(--radius-pill);
  }
  .tabs button {
    min-height: 44px;
    padding: 0 6px;
    font: inherit;
    font-weight: 700;
    font-size: 0.9rem;
    color: var(--ink2);
    background: transparent;
    border: 0;
    border-radius: var(--radius-pill);
  }
  .tabs button[aria-selected='true'] {
    color: var(--or-ink);
    background: var(--or-soft);
    box-shadow: inset 0 0 0 1px var(--or-line);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 8px 12px;
    margin-bottom: 10px;
  }
  .row label {
    display: grid;
    gap: 2px;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--ink2);
  }
  .row input {
    width: 6em;
  }
  .suras,
  .grid,
  .results ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .sura {
    display: grid;
    grid-template-columns: 2.4em 1fr auto;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 52px;
    padding: 4px 8px;
    font: inherit;
    color: var(--ink);
    text-align: start;
    background: transparent;
    border: 0;
    border-bottom: 1px solid var(--line);
    border-radius: 0;
  }
  .sura:hover {
    background: var(--surface);
  }
  .sura.on {
    background: var(--or-soft);
  }
  .num {
    display: inline-grid;
    place-items: center;
    width: 2.2em;
    height: 2.2em;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--mp-green);
    border: 1px solid var(--or-line);
    border-radius: 50%;
  }
  .fr {
    display: grid;
    font-weight: 700;
  }
  .fr small {
    font-weight: 400;
    color: var(--ink2);
  }
  .ar {
    font-family: var(--font-quran);
    font-size: 1.25rem;
    color: var(--mp-green);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
    gap: 6px;
  }
  .cell {
    width: 100%;
    min-height: 48px;
    padding: 0;
    font: inherit;
    font-weight: 700;
    color: var(--mp-green);
    background: var(--mp-mint);
    border: 1px solid var(--mp-mint2);
    border-radius: var(--radius-md);
  }
  .cell.on {
    color: var(--or-ink);
    background: var(--or-soft);
    border-color: var(--or-line);
  }
  .results {
    margin-bottom: 10px;
  }
  .link {
    min-height: 44px;
    padding: 0;
    color: var(--primary);
    background: none;
    border: 0;
    text-decoration: underline;
  }
  .small {
    font-size: 0.85rem;
  }
</style>
