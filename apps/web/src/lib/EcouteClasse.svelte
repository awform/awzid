<script lang="ts">
  import { onMount } from 'svelte';
  import { note, type Counters } from '@awform/hifz';
  import { fmtDate, fmtNumber, t } from '$lib/i18n';
  import { call } from '$lib/session';

  /**
   * Écoute des récitations envoyées par les familles (lot 16 ; QUA-3 : repris de la page de la classe sans
   * changement de comportement) : audio déchiffré par le serveur pour l'enseignant de la classe, note par le
   * barème du carnet.
   */
  let {
    classId,
    done,
  }: {
    classId: string;
    done: (ok: boolean, code: string | null | undefined, text: string) => boolean;
  } = $props();
  const id = $derived(classId);
  let counters: Counters = $state({
    aides: 0,
    hesitations: 0,
    sauts: 0,
    oublis: 0,
    claires: 0,
    discretes: 0,
    fluidite: 4,
  });
  const live = $derived(note(counters));
  const FIELDS = ['aides', 'hesitations', 'sauts', 'oublis', 'claires', 'discretes'] as const;
  onMount(() => loadRecs());

  // ---------------------------------------------------------------- écoute des récitations (lot 16)
  interface Rec {
    id: string;
    pseudonym: string;
    part: string;
    createdAt: string;
    grade: { note: { total: number } } | null;
  }
  let recs = $state<Rec[]>([]);
  let ecouteJours = $state(14);
  let audioUrl = $state<Record<string, string>>({});
  let noteFor = $state<string | null>(null);
  async function loadRecs() {
    const r = await call<{ jours: number; recitations: Rec[] }>(
      'GET',
      `/ecole/classes/${id}/recitations`,
    );
    recs = r.data?.recitations ?? [];
    ecouteJours = r.data?.jours ?? 14;
  }
  /** l'audio est déchiffré par le serveur pour l'enseignant de la classe seulement, jamais mis en cache */
  async function ecouter(rid: string) {
    const r = await fetch(`/api/v1/ecole/recitations/${rid}/audio`, { credentials: 'same-origin' });
    if (!r.ok) return done(false, 'introuvable', '');
    audioUrl = { ...audioUrl, [rid]: URL.createObjectURL(await r.blob()) };
  }
  function ouvrirNote(rid: string) {
    noteFor = rid;
    counters = {
      aides: 0,
      hesitations: 0,
      sauts: 0,
      oublis: 0,
      claires: 0,
      discretes: 0,
      fluidite: 4,
    };
  }
  async function noter(e: SubmitEvent, rid: string) {
    e.preventDefault();
    const r = await call<{ note: { total: number; mention: string } }>(
      'POST',
      `/ecole/recitations/${rid}/note`,
      { counters },
    );
    if (done(r.ok, r.code, t('ecoute.note_ok', { note: fmtNumber(r.data?.note.total ?? 0) }))) {
      noteFor = null;
      await loadRecs();
    }
  }
</script>

<section class="card" data-testid="ecoute">
  <h2>{t('ecoute.titre')}</h2>
  <p class="muted small">{t('ecoute.aide', { n: ecouteJours })}</p>
  <ul class="plain">
    {#each recs as r (r.id)}
      <li class="devoir" data-recitation={r.id}>
        <div>
          <strong>{r.pseudonym}</strong> · {r.part} ·
          <span class="muted small">{fmtDate(r.createdAt, { dateStyle: 'medium' })}</span>
          {#if r.grade}· {t('envoi.note', { n: r.grade.note.total })}{/if}
        </div>
        {#if audioUrl[r.id]}
          <audio controls src={audioUrl[r.id]} data-testid="ecoute-audio"></audio>
        {:else}
          <button
            type="button"
            class="small"
            onclick={() => ecouter(r.id)}
            data-testid="ecoute-ecouter">{t('ecoute.ecouter')}</button
          >
        {/if}
        {#if noteFor === r.id}
          <form class="form" onsubmit={(e) => noter(e, r.id)} data-testid="ecoute-note">
            {#each FIELDS as f (f)}
              <label class="count"
                ><span>{t(`ens.c_${f}`)}</span>
                <input type="number" min="0" max="50" bind:value={counters[f]} /></label
              >
            {/each}
            <label class="count"
              ><span>{t('ens.c_fluidite')}</span>
              <input type="number" min="0" max="4" bind:value={counters.fluidite} /></label
            >
            <p class="live">
              {t('ens.note_calculee', {
                memo: fmtNumber(live.memorisation),
                tajwid: fmtNumber(live.tajwid),
                fluidite: fmtNumber(live.fluidite),
                total: fmtNumber(live.total),
                mention: t(`hifz.mention_${live.mention}`),
              })}
            </p>
            <button type="submit" class="primary" data-testid="ecoute-enregistrer"
              >{t('ens.enregistrer')}</button
            >
          </form>
        {:else}
          <button
            type="button"
            class="small"
            onclick={() => ouvrirNote(r.id)}
            data-testid="ecoute-noter">{t('ecoute.noter')}</button
          >
        {/if}
      </li>
    {:else}
      <li class="muted">{t('ecoute.aucune')}</li>
    {/each}
  </ul>
</section>

<style>
  .form {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    max-width: 640px;
  }
  .plain {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .devoir {
    display: grid;
    gap: 6px;
    border-bottom: 1px solid var(--line);
    padding-bottom: 8px;
  }
  input {
    font: inherit;
    min-height: 44px;
    padding: 4px 8px;
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--card);
    color: var(--ink);
    max-width: calc(100vw - 72px);
  }
  section,
  form {
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
  }
  .count {
    display: flex !important;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }
  .count input {
    width: 6em;
  }
  .live {
    font-weight: 700;
  }
  .small {
    font-size: 0.9rem;
  }
</style>
