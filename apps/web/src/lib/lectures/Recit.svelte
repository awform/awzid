<script lang="ts" module>
  export interface Bloc {
    k: 'h' | 'h4' | 'p' | 'ul' | 'ol' | 'coran' | 'bq' | 'table';
    l?: number;
    h?: string;
    items?: Array<{ l: number; h: string }>;
    ar?: Array<{ l: number; t: string; ref: string }>;
    sens?: Array<{ l: number; h: string; s: number }>;
    p?: Array<{ l: number; h: string }>;
    rows?: string[][];
    head?: boolean;
  }
  export interface RecitData {
    p: 'enfant' | 'adulte';
    id: string;
    livre: string;
    titre: string;
    ar: string | null;
    fiche?: Array<{ l: number; h: string }>;
    adulte?: Bloc[];
    enfant: Bloc[];
    questions: Array<{ l: number; h: string; rl?: number; r?: string }>;
    audio?: { e?: Entree[]; a?: Entree[] };
    illus?: Array<{ v: string; avant: number; vignette: number; svg: string; cap: string }>;
  }
  import type { Entree } from './lecteur';
</script>

<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import Html from './Html.svelte';
  import { construireItems, voisin, type Item } from './lecteur';

  /**
   * Un récit, rendu de la maquette validée (« nouh-v2 ») : bascule enfant / adulte (l'enfant n'a que sa version), typographie des
   * deux mondes, versets dans leur encadré (arabe tel quel, jamais lu par la voix de synthèse), questions repliables, lecteur audio
   * qui enchaîne les passages, surligne le bloc (`data-ligne`) et saute les places de versets. Les textes (HTML) viennent du
   * serveur, échappés à la fabrication (packages/content/scripts/histoires-compact.mjs).
   */
  let { recit, onretour }: { recit: RecitData; onretour: () => void } = $props();

  const CLE_V = 'awzid-histoire-version';
  const CLE_R = 'awzid-histoire-vitesse';
  const lire = (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  };
  const ecrire = (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* stockage indisponible */
    }
  };
  let version = $state<'enfant' | 'adulte'>(
    untrack(() =>
      recit.p === 'enfant' || !recit.adulte
        ? 'enfant'
        : lire(CLE_V) === 'adulte'
          ? 'adulte'
          : 'enfant',
    ),
  );
  const blocs = $derived(version === 'adulte' ? (recit.adulte ?? []) : recit.enfant);
  const illus = $derived((recit.illus ?? []).filter((x) => x.v === version));
  /** illustration à placer avant le bloc i (la première dont la ligne « avant » est atteinte) */
  const illusAvant = $derived.by(() => {
    const m: Array<typeof illus> = [];
    const reste = [...illus];
    blocs.forEach((b, i) => {
      const l = premiere(b);
      const ici = reste.filter((x) => x.avant <= l);
      if (ici.length) {
        m[i] = ici;
        ici.forEach((x) => reste.splice(reste.indexOf(x), 1));
      }
    });
    return m;
  });
  const illusHaut = $derived(illus.filter((x) => version === 'adulte' && x.avant <= 3));
  function premiere(b: Bloc): number {
    return b.l ?? b.items?.[0]?.l ?? b.p?.[0]?.l ?? 0;
  }
  function choisir(v: 'enfant' | 'adulte') {
    if (v === version) return;
    arreter();
    version = v;
    ecrire(CLE_V, v);
  }

  // ---------------------------------------------------------------- lecteur
  let racine = $state<HTMLElement | null>(null);
  let items = $state<Item[]>([]);
  let els: HTMLElement[] = [];
  let idx = $state(-1);
  let enLecture = $state(false);
  let progres = $state(0);
  let vitesse = $state(lire(CLE_R) === '1.25' ? 1.25 : 1);
  let courant: HTMLElement | null = null;
  let minuteur = 0;
  let echecs = 0;
  const audio = typeof Audio !== 'undefined' ? new Audio() : null;
  const nbFichiers = $derived(items.filter((x) => x.src).length);
  const entrees = $derived(version === 'adulte' ? recit.audio?.a : recit.audio?.e);

  $effect(() => {
    void version;
    void racine;
    const e = entrees;
    void tick().then(() => {
      if (!racine) return;
      const tous = Array.from(racine.querySelectorAll<HTMLElement>('[data-ligne]'))
        .filter((el) => !el.classList.contains('ar') && Number(el.dataset.ligne) > 1)
        .sort((a, b) => Number(a.dataset.ligne) - Number(b.dataset.ligne));
      els = tous;
      items = e
        ? construireItems(
            e,
            tous.map((el) => Number(el.dataset.ligne)),
            recit.livre,
            recit.id,
            version,
          )
        : [];
      racine.querySelectorAll<HTMLElement>('[data-idx]').forEach((el) => {
        el.classList.remove('lisible');
        delete el.dataset.idx;
      });
      items.forEach((it, i) => {
        const el = tous[it.bloc];
        if (el && !el.dataset.idx) {
          el.classList.add('lisible');
          el.dataset.idx = String(i);
        }
      });
    });
  });

  function marquer(el: HTMLElement | null) {
    if (el === courant) return;
    courant?.classList.remove('en-cours');
    courant = el;
    if (!el) return;
    el.classList.add('en-cours');
    const r = el.getBoundingClientRect();
    const h = window.innerHeight || 0;
    if (r.top < 70 || r.bottom > h - 130) {
      const reduit = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({
        block: r.height > h * 0.6 ? 'start' : 'center',
        behavior: reduit ? 'auto' : 'smooth',
      });
    }
  }
  function annuler() {
    if (minuteur) clearTimeout(minuteur);
    minuteur = 0;
  }
  function suivant() {
    if (idx + 1 < items.length) jouer(idx + 1);
    else {
      annuler();
      enLecture = false;
      idx = -1;
      marquer(null);
      progres = 1;
    }
  }
  function jouer(i: number) {
    if (!audio || i < 0 || i >= items.length) return;
    annuler();
    idx = i;
    enLecture = true;
    const it = items[i]!;
    marquer(els[it.bloc] ?? null);
    progres = i / items.length;
    if (!it.src) {
      // place du verset : pas de voix de synthèse sur l'arabe
      audio.pause();
      minuteur = window.setTimeout(() => {
        minuteur = 0;
        if (enLecture && idx === i) suivant();
      }, 900);
      return;
    }
    audio.src = it.src;
    audio.playbackRate = vitesse;
    void audio.play().catch(() => (enLecture = false));
  }
  function arreter() {
    annuler();
    enLecture = false;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
    }
    idx = -1;
    marquer(null);
    progres = 0;
  }
  if (audio) {
    audio.preload = 'auto';
    audio.addEventListener('play', () => {
      audio.playbackRate = vitesse;
      enLecture = true;
    });
    audio.addEventListener('pause', () => {
      if (!minuteur && !audio.ended) enLecture = false;
    });
    audio.addEventListener('ended', () => {
      echecs = 0;
      suivant();
    });
    audio.addEventListener('error', () => {
      if (idx < 0 || !audio.getAttribute('src')) return;
      echecs++;
      if (echecs <= 3) suivant();
      else {
        echecs = 0;
        arreter();
      }
    });
    audio.addEventListener('timeupdate', () => {
      if (idx >= 0 && items.length)
        progres =
          (idx + (audio.duration > 0 ? audio.currentTime / audio.duration : 0)) / items.length;
    });
  }
  onDestroy(() => arreter());

  function basculer() {
    if (!audio) return;
    if (idx < 0) return jouer(0);
    if (enLecture) {
      annuler();
      enLecture = false;
      audio.pause();
      return;
    }
    if (!items[idx]?.src || !audio.getAttribute('src')) return jouer(idx);
    void audio.play().catch(() => undefined);
  }
  function changerVitesse() {
    vitesse = vitesse === 1 ? 1.25 : 1;
    ecrire(CLE_R, String(vitesse));
    if (audio) {
      audio.defaultPlaybackRate = vitesse;
      audio.playbackRate = vitesse;
    }
  }
  function surClic(ev: MouseEvent) {
    if (!items.length) return;
    const cible = ev.target as HTMLElement;
    if (cible.closest('a, button, summary, input, select, textarea')) return;
    const el = cible.closest<HTMLElement>('.lisible');
    if (!el?.dataset.idx) return;
    if (String(window.getSelection?.() ?? '').length > 0) return;
    jouer(Number(el.dataset.idx));
  }
  const pos = $derived(
    idx < 0 || !items[idx]
      ? t('hx.ecouter')
      : items[idx]!.src
        ? t('hx.passage', { n: items[idx]!.num, t: nbFichiers })
        : t('hx.verset', { v: items[idx]!.verset ?? '' }),
  );
  const couleurs = ['c1', 'c2', 'c3', 'c4', 'c5'];
  const numH = (i: number) => blocs.slice(0, i).filter((b) => b.k === 'h').length;
</script>

{#snippet contenu(b: Bloc, i: number)}
  {#if b.k === 'h'}
    <h2 class={version === 'enfant' ? couleurs[numH(i) % 5] : ''} data-ligne={b.l}>
      <Html h={b.h ?? ''} />
    </h2>
  {:else if b.k === 'h4'}
    <h3 data-ligne={b.l}><Html h={b.h ?? ''} /></h3>
  {:else if b.k === 'p'}
    <p
      data-ligne={b.l}
      class:ouvre={version === 'adulte' && i > 0 && blocs[i - 1]?.k === 'h' && numH(i) === 1}
    >
      <Html h={b.h ?? ''} />
    </p>
  {:else if b.k === 'ul'}
    <ul class="liste">
      {#each b.items ?? [] as it (it.l)}<li data-ligne={it.l}><Html h={it.h} /></li>{/each}
    </ul>
  {:else if b.k === 'ol'}
    <ol class="liste">
      {#each b.items ?? [] as it (it.l)}<li data-ligne={it.l}><Html h={it.h} /></li>{/each}
    </ol>
  {:else if b.k === 'coran'}
    <div class="coran" role="group" aria-label={t('hx.coran')}>
      <p class="ref">
        {t('hx.coran')} · <Bidi text={(b.ar ?? []).map((a) => a.ref).join(' ; ')} />
      </p>
      {#each b.ar ?? [] as a (a.l)}<p class="ar" lang="ar" dir="rtl" data-ligne={a.l}>
          <Bidi text={a.t} base="ar" />
        </p>{/each}
      {#each b.sens ?? [] as s (s.l)}<p class="sens" data-ligne={s.l}>
          {#if s.s}<span class="sens-l">{t('hx.sens')}</span>{/if}
          <Html h={s.h} />
        </p>{/each}
    </div>
  {:else if b.k === 'bq'}
    <blockquote>
      {#each b.p ?? [] as x (x.l)}<p data-ligne={x.l}><Html h={x.h} /></p>{/each}
    </blockquote>
  {:else if b.k === 'table'}
    <div class="tableau" data-ligne={b.l}>
      <table aria-label={recit.titre}>
        <tbody>
          {#each b.rows ?? [] as r, ri (ri)}
            <tr
              >{#each r as c, ci (ci)}{#if b.head && ri === 0}<th><Html h={c} /></th>{:else}<td
                    ><Html h={c} /></td
                  >{/if}{/each}</tr
            >
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/snippet}

{#snippet figure(x: { svg: string; cap: string; vignette: number })}
  <figure class:vignette={x.vignette}>
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG de la maquette validée, contrôlé à la fabrication (ni script ni on*=) -->
    <div class="illu">{@html x.svg}</div>
    {#if x.cap}<figcaption><Html h={x.cap} /></figcaption>{/if}
  </figure>
{/snippet}

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<article
  class="hx"
  data-version={version}
  class:avec-lecteur={items.length > 0}
  data-testid="hx-recit"
  onclick={surClic}
>
  <header class="entete">
    <button type="button" class="retour" onclick={onretour} data-testid="hx-retour"
      ><Bidi text={t('lx.retour')} /></button
    >
    {#if recit.p !== 'enfant' && recit.adulte}
      <div class="bascule" role="group" aria-label={t('hx.bascule')}>
        <button
          type="button"
          aria-pressed={version === 'enfant'}
          onclick={() => choisir('enfant')}
          data-testid="hx-b-enfant">{t('hx.enfant')}</button
        >
        <button
          type="button"
          aria-pressed={version === 'adulte'}
          onclick={() => choisir('adulte')}
          data-testid="hx-b-adulte">{t('hx.adulte')}</button
        >
      </div>
    {/if}
  </header>

  <div
    class="version {version === 'adulte' ? 'v-adulte' : 'v-enfant'}"
    bind:this={racine}
    data-testid="hx-{version}"
  >
    <div class="titre">
      {#if recit.ar}<p class="nom-ar" lang="ar" dir="rtl">
          <Bidi text={recit.ar} base="ar" />
        </p>{/if}
      <h1 data-ligne="1"><Bidi text={recit.titre} /></h1>
    </div>
    {#each illusHaut as x (x.avant)}{@render figure(x)}{/each}
    {#if version === 'adulte' && recit.fiche?.length}
      <ul class="fiche">
        {#each recit.fiche as f (f.l)}<li data-ligne={f.l}><Html h={f.h} /></li>{/each}
      </ul>
    {/if}
    {#each blocs as b, i (i)}
      {#each (illusAvant[i] ?? []).filter((x) => !illusHaut.includes(x)) as x (x.avant)}{@render figure(
          x,
        )}{/each}
      {@render contenu(b, i)}
    {/each}
    {#if recit.questions.length}
      <section class="questions" aria-labelledby="hx-q">
        <h2 id="hx-q" class={version === 'enfant' ? couleurs[numH(blocs.length) % 5] : ''}>
          {t('hx.questions')}
        </h2>
        <ol>
          {#each recit.questions as q (q.l)}
            <li>
              <p class="q" data-ligne={q.l}><Html h={q.h} /></p>
              {#if q.r}<details>
                  <summary>{t('hx.reponse')}</summary>
                  <p data-ligne={q.rl}><Html h={q.r} /></p>
                </details>{/if}
            </li>
          {/each}
        </ol>
      </section>
    {/if}
    {#if version === 'enfant'}<p class="fin">{t('hx.fin')}</p>{/if}
  </div>

  {#if items.length}
    <div class="lecteur" role="region" aria-label={t('hx.lecteur')} data-testid="hx-lecteur">
      <div class="lecteur-in">
        <button
          type="button"
          aria-label={t('hx.prec')}
          onclick={() => {
            const j = voisin(items, Math.max(idx, 0), -1);
            jouer(j < 0 ? 0 : j);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
        </button>
        <button
          type="button"
          class="jouer"
          aria-label={enLecture ? t('hx.pause') : t('hx.jouer')}
          onclick={basculer}
          data-testid="hx-jouer"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"
            ><path d={enLecture ? 'M6 5h4v14H6zM14 5h4v14h-4z' : 'M8 5v14l11-7z'} /></svg
          >
        </button>
        <button
          type="button"
          aria-label={t('hx.suiv')}
          onclick={() => {
            const j = voisin(items, idx, 1);
            if (j >= 0) jouer(j);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"
            ><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg
          >
        </button>
        <div class="l-info">
          <span class="l-pos" data-testid="hx-pos"><Bidi text={pos} /></span><span class="l-voix"
            >{t('hx.voix')}</span
          >
        </div>
        <button
          type="button"
          class="vitesse"
          aria-label={t('hx.vitesse', { v: vitesse === 1 ? '1' : '1,25' })}
          onclick={changerVitesse}><Bidi text={vitesse === 1 ? '1×' : '1,25×'} /></button
        >
      </div>
      <div class="l-prog" aria-hidden="true">
        <i style="width:{(progres * 100).toFixed(2)}%"></i>
      </div>
    </div>
  {/if}
</article>

<style>
  /* Maquette validée « nouh-v2 » : deux mondes (enfant : crème, rond, coloré ; adulte : papier, sérif, turquoise profond) */
  .hx {
    --ad-bg: #faf7f2;
    --ad-fg: #1f2328;
    --ad-doux: #5a5f66;
    --ad-accent: #0f6e6e;
    --ad-sable: #c8a96a;
    --ad-encadre: #efe9de;
    --ad-surl: #e3efec;
    --en-bg: #fffbf2;
    --en-fg: #2a2a33;
    --en-doux: #565668;
    --en-titre: #1d3b5c;
    --en-ligne: #efddb8;
    --en-surl: #ffeda8;
    --corail: #ff6b5a;
    --tournesol: #ffc93c;
    --turquoise: #1fb5ac;
    --ciel: #4da3ff;
    --feuille: #5cc46b;
    --sur-vif: #2a2a33;
    --barre-bg: rgba(255, 251, 242, 0.94);
    --barre-ligne: rgba(42, 42, 51, 0.12);
    --ombre: rgba(31, 35, 40, 0.1);
    --f-enfant: 'Andika', 'Luciole', 'Segoe UI', system-ui, sans-serif;
    --f-enfant-titre: 'Baloo 2', 'Andika', system-ui, sans-serif;
    --f-adulte: 'Literata', 'Source Serif 4', Georgia, serif;
    --f-ui: 'Source Sans 3', 'Segoe UI', system-ui, sans-serif;
    --f-coran: 'Amiri Quran', 'Amiri', 'Traditional Arabic', serif;
    --f-ar: 'Amiri', 'Noto Naskh Arabic', 'Traditional Arabic', serif;
    --bg: var(--en-bg);
    --fg: var(--en-fg);
    --surl: var(--en-surl);
    background: var(--bg);
    color: var(--fg);
    font-family: var(--f-enfant);
    margin-inline: -16px;
    padding: 12px 16px 48px;
    border-radius: 0;
  }
  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme='light'])) .hx {
      --ad-bg: #14161a;
      --ad-fg: #e8e4dc;
      --ad-doux: #a9a59c;
      --ad-accent: #5fc1b9;
      --ad-sable: #8e7a4e;
      --ad-encadre: #1e2125;
      --ad-surl: #1c3431;
      --en-bg: #1a1922;
      --en-fg: #f3eee0;
      --en-doux: #c2bdcc;
      --en-titre: #ffd873;
      --en-ligne: #3a3750;
      --en-surl: #3e3518;
      --barre-bg: rgba(26, 25, 34, 0.94);
      --barre-ligne: rgba(255, 255, 255, 0.12);
      --ombre: rgba(0, 0, 0, 0.35);
    }
  }
  :global(:root[data-theme='dark']) .hx {
    --ad-bg: #14161a;
    --ad-fg: #e8e4dc;
    --ad-doux: #a9a59c;
    --ad-accent: #5fc1b9;
    --ad-sable: #8e7a4e;
    --ad-encadre: #1e2125;
    --ad-surl: #1c3431;
    --en-bg: #1a1922;
    --en-fg: #f3eee0;
    --en-doux: #c2bdcc;
    --en-titre: #ffd873;
    --en-ligne: #3a3750;
    --en-surl: #3e3518;
    --barre-bg: rgba(26, 25, 34, 0.94);
    --barre-ligne: rgba(255, 255, 255, 0.12);
    --ombre: rgba(0, 0, 0, 0.35);
  }
  .hx[data-version='adulte'] {
    --bg: var(--ad-bg);
    --fg: var(--ad-fg);
    --surl: var(--ad-surl);
  }
  .hx.avec-lecteur {
    padding-bottom: 120px;
  }
  .hx :global(p) {
    margin: 0;
  }
  .entete {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px 16px;
    padding-bottom: 20px;
    max-width: 44rem;
    margin-inline: auto;
  }
  .retour {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--fg);
    font: 600 0.95rem/1.2 var(--f-ui);
    min-height: 44px;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
  }
  .bascule {
    display: inline-flex;
    padding: 4px;
    border-radius: 999px;
    border: 1.5px solid currentColor;
    gap: 4px;
    color: var(--fg);
  }
  .bascule button {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--fg);
    font: 700 0.95rem/1 var(--f-ui);
    padding: 10px 16px;
    border-radius: 999px;
    cursor: pointer;
    min-height: 44px;
  }
  .bascule button[aria-pressed='true'] {
    background: var(--fg);
    color: var(--bg);
  }
  figure {
    margin: 0;
  }
  .illu {
    border-radius: 20px;
    overflow: hidden;
    background: #f4efe6;
    box-shadow:
      0 1px 2px var(--ombre),
      0 8px 24px -12px var(--ombre);
    max-width: 100%;
  }
  .illu :global(svg) {
    display: block;
    width: 100%;
    height: auto;
  }
  .vignette {
    max-width: 22rem;
    margin-inline: auto;
    width: 100%;
  }
  figcaption {
    font: 400 0.82rem/1.4 var(--f-ui);
    color: var(--ad-doux);
    padding-top: 8px;
  }
  .hx :global(.lisible) {
    cursor: pointer;
    border-radius: 8px;
    transition:
      background-color 0.3s,
      box-shadow 0.3s;
  }
  .hx :global(.en-cours) {
    background: var(--surl);
    box-shadow: 0 0 0 8px var(--surl);
  }
  .hx :global(.ar-in) {
    font-family: var(--f-ar);
    font-size: 1.15em;
    line-height: 1;
  }

  /* version enfant */
  .v-enfant {
    display: grid;
    gap: 22px;
    max-width: 32rem;
    margin-inline: auto;
    font-size: 20px;
    line-height: 1.6;
    color: var(--en-fg);
  }
  .v-enfant .titre {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 2px;
    padding-top: 4px;
  }
  .v-enfant .nom-ar {
    font: 700 3.6rem/1.25 var(--f-ar);
    color: var(--corail);
  }
  .v-enfant h1 {
    font: 800 2.1rem/1.15 var(--f-enfant-titre);
    color: var(--en-titre);
    margin: 0;
  }
  .v-enfant h2 {
    font: 800 1.6rem/1.2 var(--f-enfant-titre);
    color: var(--en-titre);
    margin: 14px 0 0;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .v-enfant h2::before {
    content: '';
    flex: 0 0 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--pastille, var(--corail));
  }
  .v-enfant .c1 {
    --pastille: var(--corail);
  }
  .v-enfant .c2 {
    --pastille: var(--tournesol);
  }
  .v-enfant .c3 {
    --pastille: var(--turquoise);
  }
  .v-enfant .c4 {
    --pastille: var(--ciel);
  }
  .v-enfant .c5 {
    --pastille: var(--feuille);
  }
  .v-enfant :global(.ar-in) {
    font-weight: 700;
  }
  .questions {
    display: grid;
    gap: 14px;
    margin-top: 6px;
  }
  .questions ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 14px;
    counter-reset: q;
  }
  .questions li {
    counter-increment: q;
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr);
    gap: 4px 12px;
    align-items: start;
    padding: 14px 16px;
    border-radius: 18px;
    border: 2px solid var(--en-ligne);
  }
  .questions li::before {
    content: counter(q);
    grid-row: 1 / span 2;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font: 800 1.15rem/1 var(--f-enfant-titre);
    color: var(--sur-vif);
    background: var(--qc, var(--corail));
  }
  .questions li:nth-child(5n + 2) {
    --qc: var(--tournesol);
  }
  .questions li:nth-child(5n + 3) {
    --qc: var(--turquoise);
  }
  .questions li:nth-child(5n + 4) {
    --qc: var(--ciel);
  }
  .questions li:nth-child(5n + 5) {
    --qc: var(--feuille);
  }
  .questions .q {
    font-size: 19px;
    line-height: 1.45;
  }
  .questions details {
    font-size: 18px;
  }
  .questions summary {
    cursor: pointer;
    font: 700 0.95rem/1.4 var(--f-ui);
    color: var(--en-titre);
    padding-block: 6px;
    min-height: 44px;
  }
  .v-adulte .questions li {
    border-color: var(--ad-sable);
  }
  .v-adulte .questions summary {
    color: var(--ad-accent);
  }
  .v-adulte .questions .q,
  .v-adulte .questions details {
    font-size: 1rem;
  }
  .fin {
    display: grid;
    justify-items: center;
    color: var(--en-doux);
    font: 600 0.85rem/1.4 var(--f-ui);
    text-align: center;
    padding-top: 10px;
  }

  /* version adulte */
  .v-adulte {
    display: grid;
    gap: 20px;
    max-width: 38em;
    margin-inline: auto;
    font: 400 18px/1.6 var(--f-adulte);
    color: var(--ad-fg);
  }
  .v-adulte .titre {
    display: grid;
    gap: 6px;
    padding-top: 6px;
  }
  .v-adulte .nom-ar {
    font: 400 2.6rem/1.3 var(--f-ar);
    color: var(--ad-accent);
  }
  .v-adulte h1 {
    font: 600 1.75rem/1.2 var(--f-adulte);
    margin: 0;
  }
  .fiche {
    list-style: none;
    margin: 0;
    padding: 16px 18px;
    background: var(--ad-encadre);
    border-radius: 4px;
    display: grid;
    gap: 10px;
    font: 400 0.95rem/1.55 var(--f-ui);
  }
  .fiche :global(strong) {
    font-weight: 700;
    color: var(--ad-accent);
  }
  .v-adulte h2 {
    font: 700 1.3rem/1.25 var(--f-ui);
    color: var(--ad-accent);
    margin: 26px 0 0;
    padding-top: 14px;
    border-top: 1px solid var(--ad-sable);
  }
  .v-adulte h3 {
    font: 700 1.05rem/1.3 var(--f-ui);
    color: var(--ad-accent);
    margin: 8px 0 0;
  }
  .v-enfant h3 {
    font: 800 1.25rem/1.25 var(--f-enfant-titre);
    color: var(--en-titre);
    margin: 8px 0 0;
  }
  .v-adulte .ouvre::first-letter {
    font: 600 3.3em/0.8 var(--f-adulte);
    float: left;
    padding: 0.08em 0.1em 0 0;
    color: var(--ad-accent);
  }
  .liste {
    margin: 0;
    padding-left: 1.3em;
    display: grid;
    gap: 8px;
  }
  .v-adulte ol.liste li::marker {
    font: 700 0.95em var(--f-ui);
    color: var(--ad-accent);
  }
  .v-adulte ul.liste li::marker {
    color: var(--ad-sable);
  }
  .coran {
    display: grid;
    gap: 12px;
    padding-block: 18px;
    border-block: 1px solid var(--ad-sable);
    margin-block: 4px;
  }
  .coran .ref {
    font: 700 0.72rem/1 var(--f-ui);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ad-accent);
  }
  .coran .ar {
    font: 400 1.6rem/2.15 var(--f-coran);
    direction: rtl;
    text-align: right;
    color: var(--fg);
  }
  .coran .sens {
    font-size: 0.94rem;
    line-height: 1.6;
  }
  .sens-l {
    font: 700 0.72rem/1 var(--f-ui);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ad-accent);
    margin-inline-end: 6px;
  }
  blockquote {
    margin: 0;
    padding: 12px 16px;
    border-inline-start: 3px solid var(--ad-sable);
    background: color-mix(in srgb, var(--ad-encadre) 60%, transparent);
    display: grid;
    gap: 8px;
    border-radius: 4px;
  }
  .tableau {
    overflow-x: auto;
    max-width: 100%;
  }
  table {
    border-collapse: collapse;
    font: 400 0.9rem/1.45 var(--f-ui);
    min-width: 100%;
  }
  th,
  td {
    border: 1px solid var(--ad-sable);
    padding: 6px 8px;
    text-align: start;
    vertical-align: top;
  }

  /* lecteur */
  .lecteur {
    position: sticky;
    bottom: 0;
    z-index: 20;
    margin: 24px -16px 0;
    background: var(--barre-bg);
    border-top: 1px solid var(--barre-ligne);
    backdrop-filter: blur(10px);
    padding: 8px 16px calc(8px + env(safe-area-inset-bottom, 0px));
    font-family: var(--f-ui);
    color: var(--fg);
  }
  .lecteur-in {
    max-width: 36rem;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .lecteur button {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--fg);
    cursor: pointer;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    flex: 0 0 auto;
  }
  .lecteur button svg {
    width: 22px;
    height: 22px;
    fill: currentColor;
  }
  .lecteur .jouer {
    background: var(--fg);
    color: var(--bg);
    width: 48px;
    height: 48px;
  }
  .l-info {
    flex: 1 1 auto;
    min-width: 0;
    display: grid;
    line-height: 1.2;
    padding-left: 6px;
  }
  .l-pos {
    font-weight: 700;
    font-size: 0.95rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .l-voix {
    font-size: 0.75rem;
    opacity: 0.7;
  }
  .lecteur .vitesse {
    width: auto;
    min-width: 56px;
    padding: 0 10px;
    border-radius: 999px;
    border: 1.5px solid currentColor;
    height: 44px;
    font: 700 0.85rem/1 var(--f-ui);
  }
  .l-prog {
    max-width: 36rem;
    margin: 6px auto 0;
    height: 3px;
    border-radius: 3px;
    background: var(--barre-ligne);
    overflow: hidden;
  }
  .l-prog i {
    display: block;
    height: 100%;
    background: var(--fg);
    opacity: 0.55;
  }
  @media (prefers-reduced-motion: reduce) {
    .hx :global(.lisible) {
      transition: none;
    }
  }
</style>
