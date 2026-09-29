<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { fmtDate, t } from '$lib/i18n';
  import { answerQuestion, teacherQuestions } from '$lib/tutor';

  /**
   * « Questions en attente » (lot 9) : questions que le tuteur n'a pas le droit de traiter (avis religieux,
   * refus du modèle), transmises par les élèves des classes de l'enseignant. L'humain répond ; l'élève voit
   * la réponse dans « Demander au tuteur ». Pseudonyme seulement.
   */
  type Q = NonNullable<Awaited<ReturnType<typeof teacherQuestions>>['data']>['questions'][number];
  let list: Q[] = $state([]);
  let loaded = $state(false);
  let code = $state('');
  let drafts: Record<string, string> = $state({});
  let msg = $state('');

  async function load() {
    const r = await teacherQuestions();
    loaded = true;
    code = r.ok ? '' : (r.code ?? 'erreur');
    list = r.ok && r.data ? r.data.questions : [];
  }
  onMount(load);

  async function send(id: string) {
    const a = (drafts[id] ?? '').trim();
    if (!a) return;
    const r = await answerQuestion(id, a);
    if (r.ok) {
      msg = t('ensq.envoyee');
      await load();
    }
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('ensq.titre')}</title></svelte:head>

<p><a href={resolve('/enseignant')}>{t('ensq.retour')}</a></p>
<h1>{t('ensq.titre')}</h1>
<p class="muted">{t('ensq.intro')}</p>
{#if msg}<p class="card ok" role="status" data-testid="ensq-message">{msg}</p>{/if}

{#if loaded && code === 'reserve_aux_enseignants'}
  <p class="card">{t('ens.reserve')}</p>
{:else if loaded && code}
  <p class="card warnbox">
    {t('compte.totp_obligatoire')} <a href={resolve('/compte')}>{t('entete.compte')}</a>
  </p>
{:else if loaded}
  <ul class="qs" data-testid="questions-attente">
    {#each list as q (q.id)}
      <li class="card" data-question={q.id}>
        <p class="muted small">
          {q.pseudonym} · {q.className} · {q.unitId ?? ''} · {fmtDate(q.createdAt)} · {t(
            `ensq.motif_${q.motif}`,
          )}
        </p>
        <p class="texte">« {q.text} »</p>
        <label for="rep-{q.id}">{t('ensq.ta_reponse')}</label>
        <textarea
          id="rep-{q.id}"
          rows="3"
          maxlength="2000"
          bind:value={drafts[q.id]}
          data-testid="ensq-reponse"></textarea>
        <button type="button" class="primary" onclick={() => send(q.id)} data-testid="ensq-envoyer"
          >{t('ensq.envoyer')}</button
        >
      </li>
    {:else}
      <li class="muted">{t('ensq.aucune')}</li>
    {/each}
  </ul>
{/if}

<style>
  .qs {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 10px;
  }
  .texte {
    font-size: 1.1rem;
  }
  textarea {
    width: 100%;
    font: inherit;
  }
  .small {
    font-size: 0.9rem;
  }
  .ok {
    background: var(--ok-bg);
  }
</style>
