<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import TutorSegments from '$lib/TutorSegments.svelte';
  import {
    ask,
    isChild,
    myQuestions,
    report,
    tutorStatus,
    type TutorAnswer,
    type TutorQuestion,
    type TutorStatus,
  } from '$lib/tutor';

  /**
   * « Demander au tuteur » (lot 9). Moins de 13 ans : des BOUTONS seulement (un indice, explique encore,
   * que dit ma leçon, je ne comprends pas un mot). Ados et adultes : en plus, un texte encadré (300
   * caractères, sur la leçon). Le tuteur dit qu'il est un programme ; chaque réponse peut être signalée ;
   * les questions transmises à l'enseignant reviennent ici avec sa réponse.
   */
  let {
    unitId,
    profile,
    words = [],
  }: {
    unitId: string;
    profile: { id: string; kind: string; birthYear: number | null } | null;
    words?: string[];
  } = $props();

  let status: TutorStatus | null = $state(null);
  let open = $state(false);
  let busy = $state(false);
  let text = $state('');
  let word = $state('');
  let answers: TutorAnswer[] = $state([]);
  let reported: string[] = $state([]);
  let questions: TutorQuestion[] = $state([]);
  let error = $state('');
  const child = $derived(isChild(profile));

  onMount(async () => {
    const r = await tutorStatus();
    status = r.ok ? r.data : null;
  });

  async function toggle() {
    open = !open;
    if (open && profile) {
      const q = await myQuestions(profile.id);
      questions = q.ok && q.data ? q.data.questions.filter((x) => x.status === 'repondue') : [];
    }
  }
  async function go(action: 'indice' | 'explique' | 'lecon' | 'mot' | 'question') {
    if (!profile || busy) return;
    busy = true;
    error = '';
    const r = await ask(profile.id, {
      unitId,
      action,
      ...(action === 'question' ? { text: text.trim() } : {}),
      ...(action === 'mot' && word ? { word } : {}),
    });
    busy = false;
    if (!r.ok || !r.data) {
      error = t('tuteur.indisponible');
      return;
    }
    answers = [r.data, ...answers].slice(0, 10);
    if (action === 'question') text = '';
  }
  async function signal(logId: string) {
    if (!profile) return;
    const r = await report(profile.id, logId);
    if (r.ok) reported = [...reported, logId];
  }
</script>

{#if status?.disponible && profile}
  <section class="card tuteur" data-testid="tuteur">
    <button
      type="button"
      class="primary"
      onclick={toggle}
      aria-expanded={open}
      data-testid="tuteur-ouvrir">{t('tuteur.demander')}</button
    >
    {#if open}
      <p class="muted small" data-testid="tuteur-programme">
        {t('tuteur.programme')}{#if status.fournisseur === 'simule'}<br /><em
            >{t('tuteur.simule')}</em
          >{/if}
      </p>
      <div class="row" role="group" aria-label={t('tuteur.boutons')}>
        <button type="button" disabled={busy} onclick={() => go('indice')} data-action="indice"
          >{t('tuteur.indice')}</button
        >
        <button type="button" disabled={busy} onclick={() => go('explique')} data-action="explique"
          >{t('tuteur.explique')}</button
        >
        <button type="button" disabled={busy} onclick={() => go('lecon')} data-action="lecon"
          >{t('tuteur.lecon')}</button
        >
      </div>
      {#if words.length}
        <div class="row">
          <label for="mot-{unitId}">{t('tuteur.mot')}</label>
          <select id="mot-{unitId}" bind:value={word} data-testid="tuteur-mot-choix">
            {#each words as w (w)}<option value={w}>{w}</option>{/each}
          </select>
          <button type="button" disabled={busy || !word} onclick={() => go('mot')} data-action="mot"
            >{t('tuteur.voir_mot')}</button
          >
        </div>
      {/if}
      {#if !child}
        <form
          class="question"
          onsubmit={(e) => {
            e.preventDefault();
            if (text.trim()) void go('question');
          }}
        >
          <label for="q-{unitId}">{t('tuteur.ta_question')}</label>
          <textarea
            id="q-{unitId}"
            maxlength="300"
            rows="2"
            bind:value={text}
            placeholder={t('tuteur.placeholder')}
            data-testid="tuteur-texte"></textarea>
          <p class="muted small">{t('tuteur.cadre')} · {text.length}/300</p>
          <button type="submit" disabled={busy || !text.trim()} data-testid="tuteur-envoyer"
            >{t('tuteur.envoyer')}</button
          >
        </form>
      {/if}
      {#if error}<p class="bad" role="alert">{error}</p>{/if}
      <ol class="answers" data-testid="tuteur-reponses">
        {#each answers as a (a.logId)}
          <li class="answer" data-decision={a.decision} data-route={a.route}>
            {#if a.refus}
              <p>{t(`tuteur.refus_${a.refus}`)}</p>
            {:else}
              <TutorSegments segments={a.segments} />
              {#if a.transmise}<p class="muted small" data-testid="tuteur-transmise">
                  {t('tuteur.transmise')}
                </p>{/if}
            {/if}
            <p class="meta">
              <span class="muted small"
                >{a.ia ? t('tuteur.reponse_ia') : t('tuteur.reponse_locale')}</span
              >
              {#if reported.includes(a.logId)}<span class="small" data-testid="tuteur-signale"
                  >{t('tuteur.signale')}</span
                >{:else}<button type="button" class="small link" onclick={() => signal(a.logId)}
                  >{t('tuteur.signaler')}</button
                >{/if}
            </p>
          </li>
        {/each}
      </ol>
      {#if questions.length}
        <section class="ens" data-testid="tuteur-reponses-enseignant">
          <h3>{t('tuteur.reponses_enseignant')}</h3>
          {#each questions as q (q.id)}
            <p class="q">« {q.text} »</p>
            <p class="a">{q.answer}</p>
          {/each}
        </section>
      {/if}
    {/if}
  </section>
{/if}

<style>
  .tuteur {
    display: grid;
    gap: 8px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .question {
    display: grid;
    gap: 4px;
  }
  textarea {
    font: inherit;
    width: 100%;
  }
  .answers {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .answer {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 8px 10px;
  }
  .meta {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    margin: 4px 0 0;
  }
  .link {
    background: none;
    border: none;
    text-decoration: underline;
    cursor: pointer;
  }
  .small {
    font-size: 0.85rem;
  }
  .ens .q {
    font-style: italic;
    margin: 4px 0 0;
  }
  .ens .a {
    margin: 0 0 6px;
  }
  .bad {
    color: #a33;
  }
</style>
