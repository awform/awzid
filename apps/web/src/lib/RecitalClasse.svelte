<script lang="ts">
  import { onMount } from 'svelte';
  import { fmtDate, fmtNumber, t } from '$lib/i18n';
  import {
    cancelRecital,
    choicesLeft,
    classRecitals,
    COMPTEURS,
    drawFor,
    emptyCounters,
    planRecital,
    publishRecital,
    scoreEntry,
    type ClassRecital,
    type Compteurs,
    type Parcours,
  } from '$lib/recital';

  /**
   * Récital de hifẓ de la classe (suite V1-b, CDC §2.6-6) : l'enseignant planifie la séance ; pour chaque
   * élève, le serveur tire au sort les passages du carnet ; l'enseignant saisit les relevés (barème du carnet),
   * publie le résultat officiel. Élèves listés par nom (jamais par note) ; le texte n'est pas reproduit.
   */
  let { classId }: { classId: string } = $props();
  let eleves = $state<Array<{ id: string; nom: string }>>([]);
  let recitals = $state<ClassRecital[]>([]);
  let form = $state({ titre: '', jour: '' });
  let parcours = $state<Record<string, Parcours>>({});
  let saisie = $state<
    Record<string, { choix: string | null; compteurs: Compteurs; secondJury: boolean }>
  >({});
  let error = $state('');
  let info = $state('');

  async function load() {
    const r = await classRecitals(classId);
    if (!r.ok || !r.data) return;
    eleves = r.data.eleves;
    recitals = r.data.recitals;
    for (const rc of recitals)
      for (const e of rc.passages)
        saisie[e.id] ??= {
          choix: e.choix?.passage ?? null,
          compteurs: e.compteurs ?? emptyCounters(),
          secondJury: e.secondJury,
        };
  }
  onMount(load);

  const show = (r: { ok: boolean; code?: string | null }) => {
    if (!r.ok) error = t(`erreur.${r.code ?? 'reseau'}`);
  };

  async function plan(e: SubmitEvent) {
    e.preventDefault();
    error = info = '';
    const r = await planRecital(classId, form);
    show(r);
    if (r.ok) form = { titre: '', jour: '' };
    await load();
  }
  async function draw(rid: string, pid: string) {
    error = info = '';
    show(await drawFor(rid, pid, parcours[pid] ?? 'socle'));
    await load();
  }
  async function score(rid: string, eid: string) {
    error = info = '';
    show(await scoreEntry(rid, eid, saisie[eid]!));
    await load();
  }
  async function publish(rid: string) {
    if (!confirm(t('rec.publier_confirmer'))) return;
    error = info = '';
    const r = await publishRecital(rid);
    show(r);
    if (r.ok && r.data) info = t('rec.publie_ok', { n: r.data.validations });
    await load();
  }
  async function cancel(rid: string) {
    if (!confirm(t('rec.annuler_confirmer'))) return;
    error = info = '';
    show(await cancelRecital(rid));
    await load();
  }
</script>

<section class="card">
  <h2>{t('rec.titre')}</h2>
  <p class="muted small">{t('rec.aide_ens')}</p>
  <p class="muted small">{t('rec.lecteur')}</p>
  <form class="form" onsubmit={plan} data-testid="recital-planifier">
    <label for="rec-titre">{t('rec.intitule')}</label>
    <input id="rec-titre" bind:value={form.titre} maxlength="120" required />
    <label for="rec-jour">{t('rec.jour')}</label>
    <input id="rec-jour" type="date" bind:value={form.jour} required />
    <button type="submit" class="primary">{t('rec.planifier')}</button>
  </form>
</section>
{#if error}<p class="card bad" role="alert">{error}</p>{/if}
{#if info}<p class="card ok" role="status">{info}</p>{/if}

{#each recitals as rc (rc.id)}
  {@const ouvert = !rc.publie && !rc.annule}
  <section class="card" data-testid="recital">
    <h3>
      {rc.titre} — {fmtDate(`${rc.jour}T12:00:00`, { dateStyle: 'long' })}
      <span class="muted small">{t('rec.carnet', { code: rc.carnet })}</span>
    </h3>
    {#if rc.annule}<p class="muted">{t('rec.annule')}</p>{/if}
    {#if rc.publie}<p class="ok">{t('rec.publie')}</p>{/if}
    {#if !rc.annule}
      <ul class="list">
        {#each eleves as el (el.id)}
          {@const e = rc.passages.find((x) => x.pupilId === el.id)}
          <li data-testid="recital-eleve">
            <strong>{el.nom}</strong>
            {#if !e}
              {#if ouvert}
                <label
                  >{t('rec.parcours')}
                  <select bind:value={parcours[el.id]}>
                    <option value="socle">{t('rec.socle')}</option>
                    <option value="renforce">{t('rec.renforce')}</option>
                  </select></label
                >
                <button type="button" onclick={() => draw(rc.id, el.id)} data-testid="recital-tirer"
                  >{t('rec.tirer')}</button
                >
              {/if}
            {:else}
              <p class="small">{t('rec.tires')} :</p>
              <ol data-testid="recital-tires">
                {#each e.tires as p (p.passage)}<li>{p.libelle}</li>{/each}
              </ol>
              {#if e.note}
                <p data-testid="recital-note">
                  {t('rec.note', {
                    total: fmtNumber(e.note.total),
                    mention: t(`hifz.mention_${e.note.mention}`),
                    coran: fmtNumber(e.note.coran15),
                  })}
                </p>
              {/if}
              {#if ouvert && saisie[e.id]}
                <div class="grid-c">
                  <label
                    >{t('rec.choix')}
                    <select bind:value={saisie[e.id]!.choix}>
                      <option value={null}>{t('rec.sans_choix')}</option>
                      {#each choicesLeft(rc.choixPossibles, e) as c (c.passage)}<option
                          value={c.passage}>{c.libelle}</option
                        >{/each}
                    </select></label
                  >
                  {#each COMPTEURS as k (k)}
                    <label
                      >{t(`ens.c_${k}`)}
                      <input
                        type="number"
                        min="0"
                        max={k === 'fluidite' ? 4 : 50}
                        step="1"
                        bind:value={saisie[e.id]!.compteurs[k]}
                      /></label
                    >
                  {/each}
                  <label class="radio"
                    ><input type="checkbox" bind:checked={saisie[e.id]!.secondJury} />
                    {t('rec.second_jury')}</label
                  >
                </div>
                <p class="muted small">{t('ens.regle_oubli')}</p>
                <button type="button" onclick={() => score(rc.id, e.id)} data-testid="recital-noter"
                  >{t('rec.noter')}</button
                >
              {/if}
            {/if}
          </li>
        {/each}
      </ul>
      {#if ouvert}
        <p class="actions">
          <button
            type="button"
            class="primary"
            onclick={() => publish(rc.id)}
            data-testid="recital-publier">{t('rec.publier')}</button
          >
          <button type="button" onclick={() => cancel(rc.id)}>{t('rec.annuler')}</button>
        </p>
      {/if}
    {/if}
  </section>
{:else}
  <p class="muted">{t('rec.aucun')}</p>
{/each}

<style>
  .grid-c {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 8px 12px;
  }
  .grid-c label {
    display: flex;
    flex-direction: column;
    font-size: 0.9rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>
