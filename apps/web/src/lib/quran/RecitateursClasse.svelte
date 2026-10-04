<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { classAllowed, setClassAllowed, type Reciter } from '$lib/coran-audio';
  import { t } from '$lib/i18n';

  /** Lot 27 — l'enseignant choisit les récitateurs écoutés par sa classe (null : sans restriction). */
  let { classId }: { classId: string } = $props();
  let all = $state<Reciter[]>([]);
  let allowAll = $state(true);
  let allowed = $state<string[]>([]);
  let msg = $state('');

  onMount(async () => {
    const r = await classAllowed(classId);
    if (!r.ok || !r.data) return;
    all = r.data.reciters;
    allowAll = r.data.classe === null;
    allowed = r.data.classe ?? all.map((x) => x.id);
  });
  async function save(e: SubmitEvent) {
    e.preventDefault();
    const r = await setClassAllowed(classId, allowAll ? null : allowed);
    msg = r.ok ? t('ca.parent_enregistre') : t(`erreur.${r.code ?? 'reseau'}`);
  }
</script>

{#if all.length}
  <section class="card" data-testid="recitateurs-classe">
    <h3>{t('ca.classe_titre')}</h3>
    <p class="muted">{t('ca.classe_texte')}</p>
    <form onsubmit={save}>
      <label class="check"
        ><input type="checkbox" bind:checked={allowAll} />{t('ca.parent_tous')}</label
      >
      {#if !allowAll}
        <fieldset>
          <legend>{t('ca.parent_liste')}</legend>
          {#each all as r (r.id)}
            <label class="check"
              ><input type="checkbox" value={r.id} bind:group={allowed} /><Bidi text={r.nameFr} /> — <Bidi
                text={r.riwayaFr}
              /></label
            >
          {/each}
        </fieldset>
      {/if}
      <button type="submit" class="primary">{t('commun.enregistrer')}</button>
      {#if msg}<p role="status"><Bidi text={msg} /></p>{/if}
    </form>
  </section>
{/if}

<style>
  form {
    display: grid;
    gap: var(--space-s);
    max-width: 520px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
  }
</style>
