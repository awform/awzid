<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount, setContext } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { activeProfile } from '$lib/attempts';
  import ExamExercise from '$lib/ExamExercise.svelte';
  import type { ExamAnswers } from '$lib/epreuves';
  import { fmtDate, t } from '$lib/i18n';
  import Sprite from '$lib/Sprite.svelte';
  import { call, type ProfileInfo } from '$lib/session';

  /**
   * Passage d'une épreuve (lot 19) : projection d'épreuve SANS réponse, une réponse par item, UNE copie
   * envoyée (enfant : code parent) ; la note est donnée à la fermeture de la session par l'enseignant.
   */
  type Obj = Record<string, unknown>;
  interface View {
    epreuve: { id: string; bareme: number; closesAt: string; titleFr: string };
    lesson: Obj;
    exercises: Array<{ id: string; position: number; type: string }>;
    illustrations: Record<string, { viewBox: string; svg: string }>;
  }
  const sid = $derived(page.params.sid ?? '');
  let profile = $state<ProfileInfo | null>(null);
  let view = $state<View | null>(null);
  let answers = $state<ExamAnswers>({});
  let pin = $state('');
  let error = $state('');
  let busy = $state(false);
  let sent = $state(false);
  setContext('illustrations', () => view?.illustrations ?? {});

  onMount(async () => {
    profile = await activeProfile();
    if (!profile) return;
    const r = await call<View>('GET', `/profiles/${profile.id}/epreuves/${sid}`);
    if (r.ok) view = r.data;
    else error = t(`erreur.${r.code ?? 'reseau'}`);
  });
  const exs = $derived(
    Array.isArray(view?.lesson.exercices) ? (view!.lesson.exercices as Obj[]) : [],
  );
  const idOf = (i: number) => view?.exercises.find((e) => e.position === i + 1)?.id ?? '';

  async function envoyer() {
    if (!profile || !view || !confirm(t('epreuve.confirmer'))) return;
    busy = true;
    error = '';
    const r = await call(
      'POST',
      `/profiles/${profile.id}/epreuves/${sid}/copie`,
      { answers },
      profile.kind === 'enfant' && pin ? { 'x-parent-pin': pin } : undefined,
    );
    busy = false;
    if (!r.ok) {
      error = t(`erreur.${r.code ?? 'reseau'}`);
      return;
    }
    sent = true;
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('epreuve.titre')}</title></svelte:head>

{#if view}<Sprite illustrations={view.illustrations} />{/if}

<p><a href={resolve('/aujourdhui')}>{t('epreuve.retour')}</a></p>
{#if sent}
  <p class="card" role="status" data-testid="copie-envoyee">{t('epreuve.copie_envoyee')}</p>
  <button type="button" onclick={() => goto(resolve('/aujourdhui'))}>{t('epreuve.retour')}</button>
{:else if view}
  <h1><Bidi text={view.epreuve.titleFr} /></h1>
  <p class="muted">
    <Bidi
      text={t('epreuve.consignes', {
        bareme: view.epreuve.bareme,
        date: fmtDate(view.epreuve.closesAt),
      })}
    />
  </p>
  {#each exs as ex, i (i)}
    {@const id = idOf(i)}
    {#if id}
      <ExamExercise
        {ex}
        n={i + 1}
        bind:value={() => answers[id] ?? {}, (v) => (answers = { ...answers, [id]: v })}
      />
    {/if}
  {/each}
  {#if profile?.kind === 'enfant'}
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
  <button
    type="button"
    class="primary"
    disabled={busy}
    onclick={envoyer}
    data-testid="envoyer-copie">{t('epreuve.envoyer')}</button
  >
{/if}
{#if error}<p class="error" role="alert"><Bidi text={error} /></p>{/if}

<style>
  .error {
    color: var(--bad-ink);
  }
</style>
