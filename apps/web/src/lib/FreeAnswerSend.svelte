<script lang="ts">
  import { onMount } from 'svelte';
  import { fmtDate, t } from '$lib/i18n';
  import { loadFreeAnswers, sendFreeAnswer, type FreeAnswerState } from '$lib/freeAnswers';

  /**
   * « Envoyer à mon enseignant » sous un exercice ouvert du livre (lot 18) : seulement si l'élève est inscrit
   * dans une classe ; enfant : code parent à chaque envoi ; la correction de l'enseignant s'affiche ici
   * (appréciation et commentaire, jamais de note chiffrée).
   */
  let {
    profile,
    exerciseId,
    itemIndex,
    text,
  }: {
    profile: { id: string; kind: string };
    exerciseId: string;
    itemIndex: number;
    text: string;
  } = $props();

  let info = $state<FreeAnswerState | null>(null);
  let classId = $state('');
  let pin = $state('');
  let error = $state('');
  let busy = $state(false);
  const enfant = $derived(profile.kind === 'enfant');
  const sent = $derived(
    info?.reponses.find(
      (r) => r.exerciseId === exerciseId && r.itemIndex === itemIndex && r.classId === classId,
    ) ?? null,
  );

  onMount(async () => {
    info = await loadFreeAnswers(profile.id);
    classId = info?.classes[0]?.id ?? '';
  });

  async function send() {
    error = '';
    if (!text.trim()) return;
    busy = true;
    const r = await sendFreeAnswer(
      profile.id,
      { classId, exerciseId, itemIndex, answer: text.trim() },
      enfant ? pin : '',
    );
    busy = false;
    if (!r.ok) {
      error = t(`erreur.${r.code ?? 'reseau'}`);
      return;
    }
    pin = '';
    info = await loadFreeAnswers(profile.id);
  }
</script>

{#if info && info.classes.length}
  <div class="fa" data-testid="reponse-libre">
    {#if info.classes.length > 1}
      <label
        >{t('libre.classe')}
        <select bind:value={classId}>
          {#each info.classes as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
        </select></label
      >
    {/if}
    {#if enfant}
      <label
        >{t('libre.code_parent')}
        <input
          type="password"
          inputmode="numeric"
          autocomplete="off"
          maxlength="8"
          bind:value={pin}
        /></label
      >
    {/if}
    <button type="button" disabled={busy || !text.trim()} onclick={send}
      >{t('libre.envoyer')}</button
    >
    {#if sent}
      <p class="muted small">{t('libre.envoyee', { date: fmtDate(sent.sentAt) })}</p>
      {#if sent.appreciation}
        <p class="correction" data-testid="correction">
          <strong>{t(`libre.appreciation.${sent.appreciation}`)}</strong>
          {#if sent.comment}— {sent.comment}{/if}
        </p>
      {:else}
        <p class="muted small">{t('libre.en_attente')}</p>
      {/if}
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </div>
{/if}

<style>
  .fa {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin: 6px 0 10px;
  }
  .fa input {
    width: 7em;
  }
  .correction {
    flex-basis: 100%;
    margin: 0;
    padding: 6px 10px;
    border-inline-start: 4px solid var(--ok-ink);
    background: var(--ok-bg);
  }
  .error {
    color: var(--bad-ink);
    flex-basis: 100%;
  }
  .small {
    font-size: 0.9rem;
    margin: 0;
    flex-basis: 100%;
  }
</style>
