<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import Ar from '$lib/Ar.svelte';
  import { arabicSize, unitLabel } from '$lib/api';
  import { demoProfileFor, type DevProfile } from '$lib/attempts';
  let { data } = $props();

  const LABEL: Record<string, string> = {
    commencee: 'commencée',
    terminee: 'terminée',
    maitrisee: 'maîtrisée ★',
  };
  let profile: DevProfile | null = $state(null);
  let status: Record<string, string> = $state({});
  onMount(async () => {
    profile = await demoProfileFor(data.level);
    if (!profile) return;
    try {
      const r = await fetch(`/api/v1/progress?profile=${profile.id}&level=${data.level}`);
      if (r.ok) {
        const body = (await r.json()) as { progress: Array<{ unitId: string; status: string }> };
        status = Object.fromEntries(body.progress.map((p) => [p.unitId, p.status]));
      }
    } catch {
      /* hors ligne */
    }
  });
</script>

<svelte:head><title>AWFORM — {data.level}</title></svelte:head>

<p><a href={resolve('/')}>← Mes livres</a></p>
<h1>Leçons — {data.level}</h1>
{#if profile}<p class="profil">{profile.pseudonym}</p>{/if}
<ol class="units" style="--ar-size: {arabicSize(data.level)}px">
  {#each data.units as u (u.id)}
    <li class={u.kind}>
      <a href={resolve('/lecons/[id]', { id: u.id })} data-testid="unit">
        <span class="label">{unitLabel(u)}</span>
        <span class="fr">{u.titleFr}</span>
        {#if status[u.id] && status[u.id] !== 'ouverte'}<span
            class="st {status[u.id]}"
            data-testid="statut">{LABEL[status[u.id] ?? ''] ?? status[u.id]}</span
          >{/if}
        <Ar text={u.titleAr} />
      </a>
    </li>
  {/each}
</ol>

<style>
  .units {
    list-style: none;
    padding: 0;
  }
  .units a {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 2px 12px;
    align-items: center;
    padding: 10px 14px;
    margin: 8px 0;
    background: var(--card);
    border: 2px solid var(--line);
    border-radius: 14px;
    text-decoration: none;
    color: var(--ink);
  }
  .units :global(.ar) {
    grid-column: 1 / -1;
    text-align: right;
  }
  .label {
    font-weight: 700;
    color: var(--teal);
  }
  .bilan .label {
    color: #9a6700;
  }
  .st {
    font-size: 0.8rem;
    border-radius: 99px;
    padding: 1px 10px;
    background: #fff8e1;
    color: #9a6700;
    font-weight: 700;
  }
  .st.terminee,
  .st.maitrisee {
    background: #eaf7f1;
    color: var(--good);
  }
  .profil {
    color: var(--ink2);
    margin: 0;
  }
</style>
