<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount, setContext } from 'svelte';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import type { SceneSpec } from '@awform/content/scene';
  import type { Exercise as ExerciseData } from '@awform/content/types';
  import Ar from '$lib/Ar.svelte';
  import { loadBooklet, markRead, type BookletPack } from '$lib/booklets';
  import Exercise from '$lib/Exercise.svelte';
  import { t } from '$lib/i18n';
  import ReligionExercise from '$lib/religion/ReligionExercise.svelte';
  import Scene from '$lib/Scene.svelte';
  import Sprite from '$lib/Sprite.svelte';

  /**
   * Lecture d'un livret : couverture, pages une à une (texte arabe, traduction repliée, scène sans visage),
   * puis « je comprends » (questions), « mes mots » et le tampon « j'ai lu ce livre ».
   * Hors ligne si le livret est gardé sur l'appareil.
   */
  type Obj = Record<string, unknown>;
  let pack = $state<BookletPack | null>(null);
  let loaded = $state(false);
  let p = $state(0);
  let showFr = $state(false);
  let done = $state(false);
  setContext('illustrations', () => pack?.illustrations ?? {});

  const B = $derived((pack?.booklet ?? {}) as Obj);
  const pages = $derived((Array.isArray(B.pages) ? B.pages : []) as Obj[]);
  const questions = $derived((Array.isArray(B.questions) ? B.questions : []) as Obj[]);
  const glossaire = $derived((Array.isArray(B.glossaire) ? B.glossaire : []) as Obj[]);
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const LANG = new Set(['vrai_faux', 'relier', 'complete', 'ordre']);

  onMount(async () => {
    pack = await loadBooklet(page.params.code ?? '');
    loaded = true;
  });
  async function finish() {
    await markRead(pack!.code);
    done = true;
  }
</script>

<svelte:head><title>{t('app.nom')} — {str(B.titre_fr) || t('onglets.lectures')}</title></svelte:head
>
{#if pack}<Sprite illustrations={pack.illustrations} />{/if}

<p><a href={resolve('/lectures')}>{t('bib.retour')}</a></p>

{#if loaded && !pack}
  <p class="card">{t('bib.indisponible')}</p>
{:else if pack}
  <article class="livret" data-testid="livret" data-code={pack.code}>
    <header>
      <h1><Ar text={str(B.titre_ar)} /></h1>
      <p class="sub"><Bidi text={str(B.titre_fr)} /></p>
    </header>

    {#if p === 0 && B.couverture}
      <Scene spec={B.couverture as SceneSpec} lettres={[]} />
      <p class="muted"><Bidi text={str(B.resume_fr)} /></p>
    {/if}

    {#if p >= 1 && p <= pages.length}
      {@const pg = pages[p - 1]!}
      <section class="page" data-page={p}>
        {#if pg.scene}<Scene spec={pg.scene as SceneSpec} lettres={[]} />{/if}
        <div class="texte" lang="ar" dir="rtl">
          {#each str(pg.ar).split('|') as line, i (i)}<p><Ar text={line.trim()} /></p>{/each}
        </div>
        <button
          type="button"
          class="small"
          onclick={() => (showFr = !showFr)}
          data-testid="traduction"
          ><Bidi text={showFr ? t('bib.cacher_traduction') : t('bib.voir_traduction')} /></button
        >
        {#if showFr}<p class="fr" data-testid="texte-fr"><Bidi text={str(pg.fr)} /></p>{/if}
      </section>
    {/if}

    {#if p > pages.length}
      <section class="card" data-testid="je-comprends">
        <h2>{t('bib.je_comprends')}</h2>
        {#each questions as q, i (i)}
          {#if LANG.has(String(q.type))}
            <Exercise ex={q as unknown as ExerciseData} id={`${pack.code}.q${i + 1}`} />
          {:else}
            <ReligionExercise ex={q} n={i + 1} />
          {/if}
        {/each}
      </section>
      {#if glossaire.length}
        <section class="card">
          <h2>{t('bib.mes_mots')}</h2>
          <ul class="gloss">
            {#each glossaire as g, i (i)}<li>
                <Ar text={str(g.ar)} /> <span><Bidi text={str(g.fr)} /></span>
              </li>{/each}
          </ul>
        </section>
      {/if}
      <p>
        {#if done}<span class="tampon" data-testid="lu">{t('bib.tampon')}</span>{:else}<button
            type="button"
            class="primary"
            onclick={finish}
            data-testid="j-ai-lu">{t('bib.j_ai_lu')}</button
          >{/if}
      </p>
    {/if}

    <nav class="pager">
      <button
        type="button"
        disabled={p === 0}
        onclick={() => ((p = p - 1), (showFr = false))}
        data-testid="precedent">{t('bib.precedent')}</button
      >
      <span data-testid="numero"
        ><Bidi
          text={p === 0
            ? t('bib.couverture')
            : p > pages.length
              ? t('bib.fin')
              : t('bib.page', { n: p, total: pages.length })}
        /></span
      >
      <button
        type="button"
        class="primary"
        disabled={p > pages.length}
        onclick={() => ((p = p + 1), (showFr = false))}
        data-testid="suivant">{t('bib.suivant')}</button
      >
    </nav>
  </article>
{/if}

<style>
  .livret {
    display: grid;
    gap: 12px;
  }
  header h1 {
    margin: 0;
    font-size: 2rem;
  }
  .sub {
    margin: 0;
    font-weight: 700;
  }
  .texte {
    font-size: 1.7rem;
    line-height: 2;
  }
  .texte p {
    margin: 0;
  }
  .fr {
    background: var(--sand);
    border-radius: 8px;
    padding: 6px 8px;
  }
  .pager {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    position: sticky;
    bottom: 0;
    background: var(--card);
    padding: 6px 0;
  }
  @media (max-width: 700px) {
    .pager {
      bottom: 72px; /* au-dessus de la barre d'onglets du téléphone */
    }
  }
  .gloss {
    list-style: none;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 6px;
  }
  .tampon {
    display: inline-block;
    border: 3px solid var(--ok-ink);
    color: var(--ok-ink);
    border-radius: 12px;
    padding: 6px 12px;
    font-weight: 800;
    transform: rotate(-3deg);
  }
  .small {
    font-size: 0.9rem;
  }
</style>
