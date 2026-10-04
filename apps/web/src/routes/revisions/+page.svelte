<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount, setContext } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { resolve } from '$app/paths';
  import Ar from '$lib/Ar.svelte';
  import { demoProfileFor, type DevProfile } from '$lib/attempts';
  import {
    answer,
    dueWords,
    isYoung,
    loadBoxes,
    loadDeck,
    type Boxes,
    type Deck,
    type Word,
  } from '$lib/cards';
  import { localIso } from '$lib/hifz';
  import { t } from '$lib/i18n';
  import Illus from '$lib/Illus.svelte';
  import Sprite from '$lib/Sprite.svelte';

  /**
   * Révision des mots (cahier § 2.5) : cartes pour les grands (recto arabe et image, verso sens) ;
   * mini-jeu « relier » pour les petits (E1-E2), 5 minutes au plus. Aucune translittération, aucune note.
   */
  const MAX_MS = 5 * 60_000;
  let profile = $state<DevProfile | null>(null);
  let deck = $state<Deck | null>(null);
  let boxes: Boxes = $state({});
  let queue: Word[] = $state([]);
  let flipped = $state(false);
  let seen = $state(0);
  let known = $state(0);
  let loaded = $state(false);
  // mini-jeu
  let round: Word[] = $state([]);
  let pictures: Word[] = $state([]);
  let chosen = $state<string | null>(null);
  let wrong = $state<string | null>(null);
  let rounds = $state(0);
  let startedAt = 0;
  let finished = $state(false);

  setContext('illustrations', () => deck?.illustrations ?? {});
  const young = $derived(!!profile && isYoung(profile));

  onMount(async () => {
    profile = await demoProfileFor('');
    if (profile) {
      deck = await loadDeck(profile);
      boxes = await loadBoxes(profile.id);
      queue = dueWords(deck.words, boxes, localIso());
      startedAt = Date.now();
      if (young) newRound();
    }
    loaded = true;
  });

  async function reply(ok: boolean) {
    const w = queue[0];
    if (!w || !profile) return;
    boxes = await answer(profile.id, boxes, w, ok);
    seen++;
    if (ok) known++;
    // « à revoir » : la carte revient une fois en fin de séance
    queue = ok || w === queue[queue.length - 1] ? queue.slice(1) : [...queue.slice(1), w];
    flipped = false;
  }

  function shuffle<T>(xs: T[]): T[] {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }
  function newRound() {
    const pool = (deck?.words ?? []).filter((w) => w.img);
    if (pool.length < 2 || rounds >= 5 || Date.now() - startedAt > MAX_MS) {
      finished = true;
      return;
    }
    round = shuffle(pool).slice(0, 4);
    pictures = shuffle(round);
    chosen = null;
    wrong = null;
  }
  const firstTry = new SvelteSet<string>();
  async function pickPicture(w: Word) {
    if (!chosen || !profile) return;
    const ok = chosen === w.ar;
    if (!firstTry.has(chosen)) {
      firstTry.add(chosen);
      const word = round.find((x) => x.ar === chosen)!;
      await answer(profile.id, boxes, word, ok);
    }
    if (ok) {
      round = round.filter((x) => x.ar !== w.ar);
      pictures = pictures.filter((x) => x.ar !== w.ar);
      chosen = null;
      wrong = null;
      if (round.length === 0) {
        rounds++;
        firstTry.clear();
        newRound();
      }
    } else wrong = w.ar;
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('revisions.titre')}</title></svelte:head>
{#if deck}<Sprite illustrations={deck.illustrations} />{/if}

<h1>{t('revisions.titre')}</h1>

{#if loaded && !profile}
  <p class="card">
    {t('suivi.choisir_profil')} <a href={resolve('/profils')}>{t('suivi.qui_apprend')}</a>
  </p>
{:else if loaded && deck && deck.words.length === 0}
  <p class="card">{t('revisions.aucun_mot')}</p>
{:else if young && loaded}
  <p class="muted">{t('revisions.jeu_consigne')}</p>
  {#if finished}
    <p class="card ok" role="status" data-testid="jeu-fini">{t('revisions.jeu_fini')}</p>
  {:else}
    <section class="card game" data-testid="jeu">
      <div class="words" lang="ar" dir="rtl">
        {#each round as w (w.ar)}
          <button
            type="button"
            class="word"
            class:sel={chosen === w.ar}
            onclick={() => ((chosen = w.ar), (wrong = null))}
            data-mot={w.ar}><Ar text={w.ar} /></button
          >
        {/each}
      </div>
      <div class="pics">
        {#each pictures as w (w.ar)}
          <button
            type="button"
            class="pic"
            class:bad={wrong === w.ar}
            onclick={() => pickPicture(w)}
            data-image={w.ar}
            aria-label={t('revisions.image')}><Illus k={w.img} cls="img" /></button
          >
        {/each}
      </div>
      {#if wrong}<p class="retry" role="status">{t('exo.essaie_encore')}</p>{/if}
    </section>
  {/if}
{:else if deck}
  {#if queue.length}
    {@const w = queue[0]!}
    <section class="card cardbox" data-testid="carte">
      <button
        type="button"
        class="face"
        onclick={() => (flipped = !flipped)}
        aria-label={t('revisions.retourner')}
        data-testid="retourner"
      >
        {#if w.img}<Illus k={w.img} cls="img" />{/if}
        <Ar text={w.ar} tag="p" />
        {#if flipped}<p class="fr" data-testid="sens"><Bidi text={w.fr} /></p>{/if}
      </button>
      {#if flipped}
        <div class="row">
          <button type="button" class="primary" onclick={() => reply(true)} data-testid="je-savais"
            >{t('revisions.je_savais')}</button
          >
          <button type="button" onclick={() => reply(false)} data-testid="a-revoir"
            >{t('revisions.a_revoir')}</button
          >
        </div>
      {:else}
        <p class="muted small">{t('revisions.touche')}</p>
      {/if}
      <p class="muted small"><Bidi text={t('revisions.reste', { n: queue.length })} /></p>
    </section>
  {:else}
    <p class="card ok" role="status" data-testid="fini">
      <Bidi
        text={seen ? t('revisions.bilan', { n: seen, sus: known }) : t('revisions.rien_aujourdhui')}
      />
    </p>
  {/if}
{/if}
<p class="muted small"><Bidi text={t('revisions.note')} /></p>

<style>
  .cardbox {
    display: grid;
    gap: 10px;
    justify-items: center;
    text-align: center;
  }
  .face {
    all: unset;
    cursor: pointer;
    display: grid;
    gap: 6px;
    justify-items: center;
    min-width: 240px;
    padding: 12px;
    border: 2px solid var(--line);
    border-radius: 16px;
    font-size: 1.8rem;
  }
  .face:focus-visible {
    outline: 3px solid var(--teal);
  }
  .fr {
    font-size: 1.1rem;
    font-weight: 700;
    margin: 0;
  }
  :global(.cardbox .img),
  :global(.game .img) {
    width: 96px;
    height: 96px;
  }
  .row {
    display: flex;
    gap: 8px;
  }
  .words,
  .pics {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
    margin: 8px 0;
  }
  .word {
    font-size: 1.6rem;
    min-width: 96px;
  }
  .word.sel {
    border-color: var(--teal);
    background: var(--ok-bg);
  }
  .pic.bad {
    border-color: var(--bad-ink);
  }
  .ok {
    background: var(--ok-bg);
  }
  .small {
    font-size: 0.9rem;
  }
</style>
