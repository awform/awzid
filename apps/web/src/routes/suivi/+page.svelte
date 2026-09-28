<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { demoProfileFor, pendingCount, type DevProfile } from '$lib/attempts';
  import { lastSync } from '$lib/sync-core';
  import { localPacks } from '$lib/offline';

  /** « Mon suivi » : état des leçons du profil, réponses en attente, dernier envoi, téléchargements. */
  const LEVELS = ['en1', 'ad1'];
  const LABEL: Record<string, string> = {
    commencee: 'commencée',
    terminee: 'terminée',
    maitrisee: 'maîtrisée',
  };
  let profile: DevProfile | null = $state(null);
  let rows: Array<{ level: string; counts: Record<string, number>; total: number }> = $state([]);
  let pending = $state(0);
  let synced: string | undefined = $state(undefined);
  let offline = $state(false);
  let packs = $state(0);

  onMount(async () => {
    pending = await pendingCount();
    synced = await lastSync();
    packs = (await localPacks()).length;
    for (const level of LEVELS) {
      const p = await demoProfileFor(level);
      profile ??= p;
      if (!p) continue;
      try {
        const r = await fetch(`/api/v1/progress?profile=${p.id}&level=${level}`);
        if (!r.ok) continue;
        const body = (await r.json()) as { progress: Array<{ status: string }> };
        const counts: Record<string, number> = {};
        for (const x of body.progress) counts[x.status] = (counts[x.status] ?? 0) + 1;
        rows = [...rows, { level, counts, total: body.progress.length }];
      } catch {
        offline = true;
      }
    }
  });
</script>

<svelte:head><title>AWFORM — Mon suivi</title></svelte:head>

<h1>Mon suivi</h1>
{#if profile}<p class="muted">{profile.pseudonym}</p>{/if}

<section class="card">
  <h2>Mes leçons</h2>
  {#if offline}<p class="muted">Sans réseau : le suivi sera mis à jour au retour du réseau.</p>{/if}
  {#each rows as r (r.level)}
    <p data-level={r.level}>
      <strong>{r.level}</strong> —
      {#each Object.entries(r.counts) as [k, n] (k)}<span class="chip">{n} {LABEL[k] ?? k}</span
        >{/each}
      {#if r.total === 0}<span class="muted">rien commencé pour l'instant</span>{/if}
    </p>
  {/each}
</section>

<section class="card">
  <h2>Sur cet appareil</h2>
  <p>Niveaux téléchargés : {packs} — <a href={resolve('/hors-ligne')}>mes téléchargements</a></p>
  <p>Réponses en attente d'envoi : {pending}</p>
  <p class="muted">
    Dernier envoi : {synced ? new Date(synced).toLocaleString('fr-FR') : 'jamais'}
  </p>
  <p><a href={resolve('/ecole')}>Mode école (tablette partagée)</a></p>
</section>

<style>
  .chip {
    display: inline-block;
    margin: 0 4px;
    padding: 1px 10px;
    border-radius: 99px;
    background: #eaf7f1;
    color: var(--good);
    font-weight: 700;
    font-size: 0.85rem;
  }
</style>
