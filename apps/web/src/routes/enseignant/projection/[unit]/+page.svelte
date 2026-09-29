<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import Ar from '$lib/Ar.svelte';
  import Illus from '$lib/Illus.svelte';
  import { unitLabel } from '$lib/api';
  import { t } from '$lib/i18n';
  import type { PageData } from './$types';

  /**
   * MODE PROJECTION (lot 18, V1-a) : la leçon affichée en grand au tableau de la classe (vidéoprojecteur,
   * écran), une partie à la fois — titre et lettres, lecture, mots, dialogue, Coran. Contenu = projection
   * ÉLÈVE du livre (ni guide, ni corrigé, ni texte « non préparé ») ; aucune donnée d'élève à l'écran.
   * Flèches du clavier ou boutons pour avancer ; plein écran.
   */
  let { data }: { data: PageData } = $props();
  const u = $derived(data.unit);
  const L = $derived(u.lesson);
  const lettres = $derived(L.lettres ?? []);
  type Slide = 'titre' | 'lettres' | 'lecture' | 'mots' | 'dialogue' | 'coran';
  const slides = $derived(
    (
      [
        'titre',
        lettres.some((x) => x.nom_ar) && 'lettres',
        (L.lecture?.syllabes?.length ||
          L.lecture?.ligne?.length ||
          L.lecture?.vedette ||
          L.lecture?.phrases?.length) &&
          'lecture',
        L.mots?.length && 'mots',
        L.dialogue?.repliques?.length && 'dialogue',
        L.coran?.versets?.some((v) => v.ar) && 'coran',
      ] as Array<Slide | false | 0 | undefined>
    ).filter(Boolean) as Slide[],
  );
  let i = $state(0);
  const cur = $derived(slides[Math.min(i, slides.length - 1)] ?? 'titre');
  const go = (d: number) => (i = Math.max(0, Math.min(slides.length - 1, i + d)));

  onMount(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') go(1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1);
      else return;
      e.preventDefault();
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });
  function plein() {
    const el = document.documentElement;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('projection.titre')}</title></svelte:head>

<div class="bar">
  <a href={resolve('/enseignant')}>{t('projection.retour')}</a>
  <span class="muted"
    >{unitLabel(u)} · {t(`projection.partie.${cur}`)} ({i + 1}/{slides.length})</span
  >
  <span class="nav">
    <button
      type="button"
      onclick={() => go(-1)}
      disabled={i === 0}
      aria-label={t('projection.precedent')}>←</button
    >
    <button
      type="button"
      onclick={() => go(1)}
      disabled={i >= slides.length - 1}
      aria-label={t('projection.suivant')}>→</button
    >
    <button type="button" onclick={plein}>{t('projection.plein_ecran')}</button>
  </span>
</div>

<main class="slide" data-testid="projection" data-partie={cur} aria-live="polite">
  {#if cur === 'titre'}
    <Ar tag="h1" text={L.titre_ar} {lettres} />
    <p class="fr">{L.titre_fr}</p>
    {#if lettres.length}<p class="fam" lang="ar" dir="rtl">
        {#each lettres as x, k (k)}<span class="c{k % 4}">{x.l}</span>{/each}
      </p>{/if}
  {:else if cur === 'lettres'}
    <div class="grid">
      {#each lettres as x, k (k)}
        <div class="letter">
          <span class="big c{k % 4}" lang="ar">{x.l}</span>
          {#if x.nom_ar}<Ar text={x.nom_ar} />{/if}
        </div>
      {/each}
    </div>
  {:else if cur === 'lecture'}
    {@const R = L.lecture!}
    {#if R.syllabes?.length}<p class="line">
        {#each R.syllabes as s, k (k)}<span><Ar text={s.ar} {lettres} /></span>{/each}
      </p>{/if}
    {#if R.ligne?.length}<p class="line">
        {#each R.ligne as w, k (k)}<span><Ar text={w} {lettres} /></span>{/each}
      </p>{/if}
    {#if R.vedette}<p class="line"><Ar text={R.vedette.ar} {lettres} /></p>{/if}
    {#each R.phrases ?? [] as ph, k (k)}<p class="line"><Ar text={ph.ar} {lettres} /></p>{/each}
  {:else if cur === 'mots'}
    <div class="grid">
      {#each L.mots ?? [] as m, k (k)}
        <figure>
          {#if m.img}<Illus k={m.img} cls="proj" />{/if}
          <figcaption><Ar text={m.ar} {lettres} /></figcaption>
        </figure>
      {/each}
    </div>
  {:else if cur === 'dialogue'}
    {#each L.dialogue?.repliques ?? [] as r, k (k)}
      <p class="rep">
        {#if r.qui_ar}<Ar text={r.qui_ar} /> :{/if}
        <Ar text={r.ar} {lettres} />
      </p>
    {/each}
  {:else if cur === 'coran'}
    {#each (L.coran?.versets ?? []).filter((v) => v.ar) as v, k (k)}
      <p class="verse"><Ar text={v.ar} quran /></p>
    {/each}
  {/if}
</main>

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
  }
  .nav {
    display: flex;
    gap: 8px;
  }
  .nav button {
    min-width: 48px;
    min-height: 48px;
  }
  .slide {
    min-height: 70vh;
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 24px;
    text-align: center;
    font-size: clamp(1.4rem, 3vw, 2.4rem);
    background: var(--paper);
    padding: 16px;
    overflow-wrap: anywhere;
  }
  .slide :global(.ar),
  .slide :global(.quran-text) {
    font-size: clamp(2.2rem, 6vw, 5rem);
    line-height: 1.8;
  }
  .fam,
  .big {
    font-family: var(--font-ar);
    font-size: clamp(3rem, 10vw, 8rem);
  }
  .fam span {
    margin: 0 0.2em;
  }
  .c0 {
    color: var(--c0);
  }
  .c1 {
    color: var(--c1);
  }
  .c2 {
    color: var(--c2);
  }
  .c3 {
    color: var(--c3);
  }
  .grid {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 32px;
    direction: rtl;
  }
  .letter,
  figure {
    display: grid;
    justify-items: center;
    margin: 0;
  }
  figure :global(.proj) {
    width: min(28vw, 220px);
    height: auto;
  }
  .line {
    direction: rtl;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.6em;
    margin: 0;
  }
  .rep,
  .verse {
    direction: rtl;
    margin: 0;
  }
  .fr {
    font-size: 0.8em;
    margin: 0;
  }
</style>
