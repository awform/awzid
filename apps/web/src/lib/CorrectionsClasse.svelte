<script lang="ts">
  import { onMount } from 'svelte';
  import Ar from '$lib/Ar.svelte';
  import { fmtDate, t } from '$lib/i18n';
  import type { Appreciation, FreeAnswer } from '$lib/freeAnswers';
  import { call } from '$lib/session';

  /**
   * Correction des réponses libres par l'enseignant de la classe (lot 18) : réponses des élèves encore
   * inscrits, avec la consigne de l'exercice TELLE QUE DANS LE LIVRE ; appréciation (acquis / en cours /
   * à reprendre) et commentaire court. Aucune note chiffrée.
   */
  let { classId }: { classId: string } = $props();
  type Obj = Record<string, unknown>;
  type Row = FreeAnswer & { pseudonym: string | null; exercice: Obj | null };
  let rows = $state<Row[]>([]);
  let filter = $state<'a_corriger' | 'corrigees'>('a_corriger');
  let comments = $state<Record<string, string>>({});
  let error = $state('');
  const APPS: Appreciation[] = ['acquis', 'en_cours', 'a_reprendre'];
  const str = (v: unknown) => (typeof v === 'string' ? v : '');

  async function refresh() {
    const r = await call<{ reponses: Row[] }>(
      'GET',
      `/ecole/classes/${classId}/reponses-libres?statut=${filter}`,
    );
    rows = r.ok ? r.data!.reponses : [];
    for (const x of rows) comments[x.id] ??= x.comment ?? '';
  }
  onMount(refresh);

  /** consigne et question de l'item, lues dans le contenu du livre */
  function prompt(x: Row) {
    const ex = x.exercice ?? {};
    const items = Array.isArray(ex.items) ? (ex.items as Obj[]) : [];
    const it = items[x.itemIndex] ?? {};
    return {
      consigne: str(ex.consigne_fr) || str(ex.consigne),
      q: str(it.q_fr) || str(it.fr) || str(it.question_fr),
      ar: str(it.ar),
    };
  }

  async function correct(x: Row, appreciation: Appreciation) {
    error = '';
    const r = await call('POST', `/ecole/reponses-libres/${x.id}/correction`, {
      appreciation,
      ...(comments[x.id]?.trim() ? { commentaire: comments[x.id]!.trim() } : {}),
    });
    if (!r.ok) {
      error = t(`erreur.${r.code ?? 'reseau'}`);
      return;
    }
    await refresh();
  }
</script>

<section class="card" data-testid="corrections">
  <h2>{t('libre.titre_enseignant')}</h2>
  <p class="muted small">{t('libre.aide_enseignant')}</p>
  <div class="filters" role="group">
    {#each ['a_corriger', 'corrigees'] as const as f (f)}
      <button
        type="button"
        class:active={filter === f}
        aria-pressed={filter === f}
        onclick={() => {
          filter = f;
          void refresh();
        }}>{t(`libre.filtre.${f}`)}</button
      >
    {/each}
  </div>
  {#if !rows.length}
    <p class="muted">{t('libre.aucune')}</p>
  {/if}
  {#each rows as x (x.id)}
    {@const p = prompt(x)}
    <article class="item" data-testid="reponse-a-corriger">
      <p class="muted small">
        {x.pseudonym ?? '?'} · {x.exerciseId} · {fmtDate(x.sentAt)}
      </p>
      {#if p.consigne}<p class="consigne">{p.consigne}</p>{/if}
      {#if p.ar}<Ar text={p.ar} tag="p" />{/if}
      {#if p.q}<p>{p.q}</p>{/if}
      <blockquote>{x.answer}</blockquote>
      <label
        >{t('libre.commentaire')}
        <textarea rows="2" maxlength="600" bind:value={comments[x.id]}></textarea></label
      >
      <div class="apps">
        {#each APPS as a (a)}
          <button
            type="button"
            class:active={x.appreciation === a}
            onclick={() => correct(x, a)}
            data-testid="appreciation-{a}">{t(`libre.appreciation.${a}`)}</button
          >
        {/each}
      </div>
    </article>
  {/each}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</section>

<style>
  .filters,
  .apps {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .active {
    background: var(--primary);
    color: var(--on-primary);
  }
  .item {
    border-top: 1px solid var(--line);
    padding: 10px 0;
    display: grid;
    gap: 6px;
  }
  .consigne {
    font-weight: 700;
    margin: 0;
  }
  blockquote {
    margin: 0;
    padding: 8px 12px;
    background: var(--sand);
    border-left: 4px solid var(--teal);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  label {
    display: grid;
    gap: 4px;
  }
  .error {
    color: var(--bad-ink);
  }
  .small {
    font-size: 0.9rem;
    margin: 0;
  }
</style>
