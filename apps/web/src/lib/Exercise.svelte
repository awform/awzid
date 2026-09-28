<script lang="ts">
  import type { Exercise, LanguageExercise, Lettre } from '@awform/content/types';
  import {
    checkComplete,
    checkEcoute,
    checkPremiereLettre,
    checkVraiFaux,
    exerciseTotal,
    isLanguageExercise,
  } from '@awform/grading';
  import Ar from './Ar.svelte';

  /**
   * Squelette du lecteur d'exercices (lot 1) : les types à choix (première lettre, écoute, complète,
   * vrai/faux) sont déjà interactifs et corrigés par la bibliothèque PARTAGÉE @awform/grading ;
   * les 4 autres types sont affichés et deviendront interactifs au lot 2.
   * Règle du moteur : un nouvel essai est permis ; l'item compte quand il est trouvé.
   */
  let { ex, id, lettres = [] }: { ex: Exercise; id: string; lettres?: Lettre[] } = $props();

  const TITLES: Record<string, string> = {
    premiere_lettre: 'Par quelle lettre commence le mot ?',
    chasse: 'Je trouve toutes les lettres',
    relier: "Je relie le mot à l'image",
    ecoute: "J'écoute et je choisis",
    vrai_faux: 'Vrai ou faux ?',
    complete: 'Je complète',
    contient: 'Quels mots contiennent la lettre ?',
    ordre: "Je remets les mots dans l'ordre",
  };

  const lang: LanguageExercise | null = $derived(isLanguageExercise(ex) ? ex : null);
  const total = $derived(lang ? exerciseTotal(lang) : 0);
  /** état par item : 'ok' trouvé, 'retry' essayer encore */
  let state: Record<number, 'ok' | 'retry'> = $state({});
  const found = $derived(Object.values(state).filter((s) => s === 'ok').length);

  function answer(item: number, ok: boolean) {
    if (state[item] === 'ok') return;
    state[item] = ok ? 'ok' : 'retry';
  }
  function choose(item: number, option: string) {
    if (!lang) return;
    if (lang.type === 'premiere_lettre') answer(item, checkPremiereLettre(lang, item, option));
    else if (lang.type === 'ecoute') answer(item, checkEcoute(lang, item, option));
    else if (lang.type === 'complete') answer(item, checkComplete(lang, item, option));
  }
</script>

<section class="ex" data-exercise={id} data-type={ex.type}>
  <header>
    <h3>{ex.titre_fr ?? TITLES[ex.type] ?? 'Exercice'}</h3>
    {#if ex.titre_ar}<Ar text={ex.titre_ar} />{/if}
    {#if ex.consigne_fr}<p class="consigne">{ex.consigne_fr}</p>{/if}
    {#if lang}<p class="score" aria-live="polite">★ {found} / {total}</p>{/if}
  </header>

  {#if lang?.type === 'premiere_lettre' || lang?.type === 'ecoute' || lang?.type === 'complete'}
    <ol class="items">
      {#each lang.items as it, i (i)}
        <li class:ok={state[i] === 'ok'} data-item={i}>
          {#if lang.type === 'premiere_lettre' && 'suite' in it}
            <span class="ar blank" dir="rtl" lang="ar"><u>?</u>{String(it.suite)}</span>
          {:else if lang.type === 'complete' && 'avant' in it}
            <span class="ar" dir="rtl" lang="ar"
              ><Ar text={String(it.avant ?? '')} {lettres} /> <u>…</u>
              <Ar text={String(it.apres ?? '')} {lettres} /></span
            >
          {:else if lang.type === 'ecoute' && 'dit' in it}
            <details class="adulte">
              <summary>Pour l'adulte : texte à lire à voix haute</summary>
              <Ar text={String(it.dit)} />
            </details>
          {/if}
          <div class="opts" dir="rtl">
            {#each it.options as o, k (k)}
              <button type="button" onclick={() => choose(i, o)} lang="ar"
                ><Ar text={o} {lettres} /></button
              >
            {/each}
          </div>
          {#if lang.type === 'complete' && 'fr' in it && it.fr}<p class="fr">{it.fr}</p>{/if}
          {#if state[i] === 'retry'}<p class="retry">Essaie encore !</p>{/if}
          {#if state[i] === 'ok'}<p class="bravo">Bravo !</p>{/if}
        </li>
      {/each}
    </ol>
  {:else if lang?.type === 'vrai_faux'}
    <ol class="items">
      {#each lang.items as it, i (i)}
        <li class:ok={state[i] === 'ok'} data-item={i}>
          {#if it.ar}<Ar text={it.ar} {lettres} />{/if}
          {#if it.fr}<p class="fr">{it.fr}</p>{/if}
          <div class="opts">
            <button type="button" onclick={() => answer(i, checkVraiFaux(lang, i, true))}
              ><span class="ar" lang="ar">صَحِيحٌ</span> ✓</button
            >
            <button type="button" onclick={() => answer(i, checkVraiFaux(lang, i, false))}
              ><span class="ar" lang="ar">خَطَأٌ</span> ✗</button
            >
          </div>
          {#if state[i] === 'retry'}<p class="retry">Essaie encore !</p>{/if}
          {#if state[i] === 'ok'}<p class="bravo">Bravo !</p>{/if}
        </li>
      {/each}
    </ol>
  {:else if lang?.type === 'chasse'}
    <div class="grid" dir="rtl">
      {#each lang.grille as x, k (k)}<span class="cell"><Ar text={x} /></span>{/each}
    </div>
  {:else if lang?.type === 'contient'}
    <div class="grid" dir="rtl">
      {#each lang.mots as m, k (k)}<span class="cell"><Ar text={m.ar} {lettres} /></span>{/each}
    </div>
  {:else if lang?.type === 'relier'}
    <ol class="items">
      {#each lang.items as it, i (i)}<li><Ar text={it.ar} {lettres} /></li>{/each}
    </ol>
  {:else if lang?.type === 'ordre'}
    <ol class="items">
      {#each lang.items as it, i (i)}
        <li>
          <div class="opts" dir="rtl">
            {#each it.mots as w, k (k)}<span class="chip"><Ar text={w} {lettres} /></span>{/each}
          </div>
          {#if it.fr}<p class="fr">{it.fr}</p>{/if}
        </li>
      {/each}
    </ol>
  {:else}
    <p class="later">Exercice « {ex.type} » : prévu dans un lot suivant.</p>
  {/if}
</section>

<style>
  .ex {
    background: var(--card);
    border: 2px solid var(--line);
    border-radius: 16px;
    padding: 12px 16px;
    margin: 16px 0;
  }
  h3 {
    margin: 0;
    font-size: 1.05rem;
  }
  .score {
    font-weight: 700;
    color: var(--teal);
    margin: 4px 0;
  }
  .items {
    padding-inline-start: 1.2em;
  }
  .items li {
    margin: 12px 0;
  }
  .items li.ok {
    background: #eaf7f1;
    border-radius: 12px;
  }
  .opts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
    gap: 8px;
  }
  .cell,
  .chip {
    border: 2px dashed var(--line);
    border-radius: 12px;
    padding: 2px 10px;
    text-align: center;
  }
  .fr {
    color: var(--ink2);
    margin: 4px 0;
  }
  .retry {
    color: var(--c3);
    margin: 4px 0;
  }
  .bravo {
    color: var(--good);
    font-weight: 700;
    margin: 4px 0;
  }
  .adulte summary {
    color: var(--ink2);
    font-size: 0.9rem;
  }
  .consigne {
    margin: 4px 0;
  }
</style>
