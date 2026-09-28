<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { demoProfileFor, pendingCount, type DevProfile } from '$lib/attempts';
  import { fmtDate, t } from '$lib/i18n';
  import { localPacks } from '$lib/offline';
  import { lastSync } from '$lib/sync-core';

  /** « Mon suivi » : état des leçons du profil actif, réponses en attente, dernier envoi, téléchargements. */
  const LEVELS = ['en1', 'ad1'];
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
    profile = await demoProfileFor('');
    if (!profile) return;
    for (const level of LEVELS) {
      try {
        const r = await fetch(`/api/v1/progress?profile=${profile.id}&level=${level}`);
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

<svelte:head><title>{t('app.nom')} — {t('onglets.suivi')}</title></svelte:head>

<h1>{t('onglets.suivi')}</h1>
{#if profile}<p class="muted">{profile.pseudonym}</p>
{:else}<p class="card">
    {t('suivi.choisir_profil')} <a href={resolve('/profils')}>{t('suivi.qui_apprend')}</a>
  </p>{/if}

<section class="card">
  <h2>{t('suivi.mes_lecons')}</h2>
  {#if offline}<p class="muted">{t('suivi.hors_ligne')}</p>{/if}
  {#each rows as r (r.level)}
    <p data-level={r.level}>
      <strong>{r.level}</strong> —
      {#each Object.entries(r.counts) as [k, n] (k)}<span class="chip"
          >{t('suivi.compte', { n, statut: t(`statut.${k}`) })}</span
        >{/each}
      {#if r.total === 0}<span class="muted">{t('suivi.rien')}</span>{/if}
    </p>
  {/each}
</section>

<section class="card">
  <h2>{t('suivi.appareil')}</h2>
  <p>
    {t('suivi.niveaux', { n: packs })} — <a href={resolve('/hors-ligne')}>{t('horsligne.titre')}</a>
  </p>
  <p>{t('suivi.attente', { n: pending })}</p>
  <p class="muted">
    {synced ? t('suivi.dernier_envoi', { date: fmtDate(synced) }) : t('suivi.jamais')}
  </p>
  <p><a href={resolve('/ecole')}>{t('horsligne.lien_ecole')}</a></p>
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
