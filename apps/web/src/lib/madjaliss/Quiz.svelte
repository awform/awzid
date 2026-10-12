<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import type { Question } from './quiz';

  /**
   * Quiz d'une séance (questions générées depuis les données, voir quiz.ts) : une question à la fois, réponse
   * immédiate (la bonne en vert), puis « Question suivante » ; à la fin, le nombre de bonnes réponses.
   */
  let {
    questions,
    onfin,
  }: { questions: Question[]; onfin: (bonnes: number, total: number) => void } = $props();

  let i = $state(0);
  let choisi = $state<number | null>(null);
  let bonnes = $state(0);
  let fini = $state(false);
  const q = $derived(questions[i] ?? null);

  function choisir(k: number) {
    if (choisi !== null || !q) return;
    choisi = k;
    if (k === q.bonne) bonnes += 1;
  }
  function suivante() {
    if (i + 1 < questions.length) {
      i += 1;
      choisi = null;
    } else {
      fini = true;
      onfin(bonnes, questions.length);
    }
  }
</script>

<div class="quiz" data-testid="mj-quiz">
  {#if fini}
    <p class="card ok" data-testid="mj-quiz-score">
      <Bidi text={t('mj.q_score', { bonnes, total: questions.length })} />
    </p>
  {:else if q}
    <p class="rang"><Bidi text={t('mj.q_num', { i: i + 1, n: questions.length })} /></p>
    <div class="question" data-question={q.type} data-i={i}>
      {#if q.type === 'traduction'}
        <p class="consigne"><Bidi text={t('mj.q_traduction')} /></p>
        <p class="ar matn" lang="ar" dir="rtl"><Bidi text={q.ar} base="ar" /></p>
      {:else if q.type === 'completer'}
        <p class="consigne"><Bidi text={t('mj.q_completer')} /></p>
        <p class="ar matn" lang="ar" dir="rtl">
          <Bidi text={q.avant} base="ar" /><span class="trou" aria-label={t('mj.q_trou')}
            ><Bidi text={choisi !== null ? q.options[q.bonne] : '……'} base="ar" /></span
          ><Bidi text={q.apres} base="ar" />
        </p>
      {:else}
        <p class="consigne"><Bidi text={t('mj.q_mot')} /></p>
        <p class="ar matn" lang="ar" dir="rtl"><Bidi text={q.ar} base="ar" /></p>
      {/if}
      <ul class="options">
        {#each q.options as o, k (k)}
          <li>
            <button
              type="button"
              class="option"
              class:bonne={choisi !== null && k === q.bonne}
              class:mauvaise={choisi === k && k !== q.bonne}
              data-option={k}
              aria-pressed={choisi === k}
              disabled={choisi !== null && choisi !== k && k !== q.bonne}
              onclick={() => choisir(k)}
              >{#if q.type === 'completer'}<span class="ar" lang="ar" dir="rtl"
                  ><Bidi text={o} base="ar" /></span
                >{:else}<Bidi text={o} />{/if}</button
            >
          </li>
        {/each}
      </ul>
      {#if choisi !== null}
        <p class="retour" class:ok={choisi === q.bonne} role="status" data-testid="mj-retour">
          <Icon name={choisi === q.bonne ? 'coche' : 'info'} size={20} /><Bidi
            text={t(choisi === q.bonne ? 'mj.q_juste' : 'mj.q_faux')}
          />
        </p>
        <button type="button" class="primary" data-testid="mj-q-suivante" onclick={suivante}
          ><Bidi text={t(i + 1 < questions.length ? 'mj.q_suivante' : 'mj.q_resultat')} /></button
        >
      {/if}
    </div>
  {/if}
</div>

<style>
  .quiz,
  .question {
    display: grid;
    gap: var(--space-s);
  }
  .rang,
  .consigne {
    margin: 0;
    font-weight: 600;
  }
  .matn {
    margin: 0;
    display: block;
    text-align: right;
  }
  .trou {
    display: inline-block;
    min-width: 3em;
    margin: 0 4px;
    border-bottom: 2px solid var(--gold);
    text-align: center;
  }
  .options {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: var(--space-s);
  }
  .option {
    width: 100%;
    justify-content: flex-start;
    text-align: start;
    font-weight: 500;
  }
  .option.bonne {
    background: var(--ok-bg);
    border-color: var(--ok-ink, var(--primary));
  }
  .option.mauvaise {
    background: var(--bad-bg);
    color: var(--bad-ink);
    border-color: var(--bad-ink);
  }
  .option:disabled {
    opacity: 0.6;
  }
  .retour {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-weight: 600;
    color: var(--bad-ink);
  }
  .retour.ok {
    color: var(--ok-ink, var(--ink));
  }
</style>
