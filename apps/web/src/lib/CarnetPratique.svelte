<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import Ar from '$lib/Ar.svelte';
  import { fmtDate, t } from '$lib/i18n';
  import {
    checkBox,
    loadCarnets,
    mondayLocal,
    signWeek,
    unitOfExercise,
    type CarnetState,
  } from '$lib/carnet';

  /**
   * Carnet de pratique (lot 22) : l'enfant coche ses cases de la semaine ; le parent signe avec son code parent
   * (vérifié par le serveur). Lignes reprises du livre. Jamais de note ni de reproche : le carnet encourage.
   */
  let { profile, exerciseId }: { profile: { id: string; kind: string }; exerciseId: string } =
    $props();
  let back = $state(0);
  const week = $derived(mondayLocal(new Date(), back));
  let carnet = $state<CarnetState | null>(null);
  let pin = $state('');
  let error = $state('');
  const has = (l: number, d: number) => !!carnet?.cases.some(([a, b]) => a === l && b === d);

  async function load() {
    const r = await loadCarnets(profile.id, unitOfExercise(exerciseId), week);
    carnet = r.ok ? (r.data?.carnets.find((c) => c.id === exerciseId) ?? null) : null;
  }
  onMount(load);

  async function toggle(line: number, day: number, checked: boolean) {
    error = '';
    const r = await checkBox(profile.id, exerciseId, { week, line, day, checked });
    if (!r.ok) error = t(`erreur.${r.code ?? 'reseau'}`);
    else if (carnet && r.data) carnet = { ...carnet, ...r.data };
  }
  async function sign() {
    error = '';
    const r = await signWeek(profile.id, exerciseId, week, pin);
    pin = '';
    if (!r.ok) error = t(`erreur.${r.code ?? 'reseau'}`);
    else if (carnet && r.data) carnet = { ...carnet, ...r.data };
  }
  async function go(n: number) {
    back = n;
    await load();
  }
</script>

{#if carnet}
  <div class="cp" data-testid="carnet-pratique">
    <p class="nav">
      <button type="button" disabled={back >= 4} onclick={() => go(back + 1)}
        >{t('carnet.precedente')}</button
      >
      <strong><Bidi text={t('carnet.semaine', { date: fmtDate(week) })} /></strong>
      <button type="button" disabled={back === 0} onclick={() => go(back - 1)}
        >{t('carnet.suivante')}</button
      >
    </p>
    <table aria-label={t('carnet.semaine', { date: fmtDate(week) })}>
      <thead
        ><tr
          ><th></th>{#each Array.from({ length: carnet.jours }, (_, d) => d) as d (d)}<th
              ><Bidi text={t('carnet.jour', { n: d + 1 })} /></th
            >{/each}</tr
        ></thead
      >
      <tbody>
        {#each carnet.lignes as l, i (i)}
          <tr>
            <th scope="row"
              >{#if l.ar}<Ar text={l.ar} sep />
              {/if}<Bidi text={l.fr} /></th
            >
            {#each Array.from({ length: carnet.jours }, (_, d) => d) as d (d)}
              <td
                ><input
                  type="checkbox"
                  aria-label={t('carnet.case', { ligne: i + 1, jour: d + 1 })}
                  checked={has(i, d)}
                  disabled={!!carnet.signe}
                  onchange={(e) => toggle(i, d, e.currentTarget.checked)}
                /></td
              >
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
    {#if carnet.signe}
      <p class="ok" data-testid="carnet-signe">
        <Bidi text={t('carnet.signe', { date: fmtDate(carnet.signe) })} />
      </p>
    {:else if profile.kind !== 'adulte'}
      <p class="sign">
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
        <button type="button" disabled={!pin} onclick={sign} data-testid="carnet-signer"
          >{t('carnet.signer')}</button
        >
      </p>
    {/if}
    <p class="muted small">{t('carnet.encourage')}</p>
    {#if error}<p class="bad" role="alert"><Bidi text={error} /></p>{/if}
  </div>
{/if}

<style>
  .cp {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
  }
  th,
  td {
    padding: 4px;
    text-align: center;
  }
  th[scope='row'] {
    text-align: start;
    font-weight: 400;
  }
  input[type='checkbox'] {
    width: 28px;
    height: 28px;
  }
  .nav {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
</style>
