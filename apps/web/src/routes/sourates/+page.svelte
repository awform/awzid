<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { suraName } from '@awform/hifz';
  import { fmtNumber, t } from '$lib/i18n';
  import { fetchMe, type Me } from '$lib/session';
  import { hifzToday, loadMeta } from '$lib/hifz';
  import { completeSuras } from '$lib/milestones';
  import { loadSuras, setSuraStep, type SuraRow } from '$lib/carnet';

  /**
   * Suivi des sourates (lot 22) : la liste vient des livres ; la famille coche « j'écoute », « je répète »,
   * « je récite seul » ; seul l'enseignant valide. Le texte n'est pas reproduit : renvoi au lecteur (Tanzil).
   * Rappel : une sourate entièrement acquise dans le carnet de hifẓ est signalée.
   */
  const STEPS = ['ecoute', 'repete', 'recite'] as const;
  let me = $state<Me | null>(null);
  let profileId = $state('');
  let rows = $state<SuraRow[]>([]);
  let hifzDone = $state<number[]>([]);
  let error = $state('');

  async function load() {
    const r = await loadSuras(profileId);
    rows = r.ok && r.data ? r.data.sourates : [];
    hifzDone = [];
    const h = await hifzToday(profileId).catch(() => null);
    const meta = h ? await loadMeta() : null;
    if (h && meta)
      hifzDone = completeSuras(
        h.acquis,
        meta.weights.map((w) => w.length),
      );
  }
  onMount(async () => {
    me = await fetchMe();
    profileId = me?.profiles[0]?.id ?? '';
    if (profileId) await load();
  });
  async function step(sura: number, etape: (typeof STEPS)[number]) {
    error = '';
    const r = await setSuraStep(profileId, sura, etape);
    if (!r.ok) error = t(`erreur.${r.code ?? 'reseau'}`);
    await load();
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('sour.titre')}</title></svelte:head>

<h1>{t('sour.titre')}</h1>
{#if !me}
  <p>
    {t('profils.connexion_requise')} <a href={resolve('/connexion')}>{t('entete.connexion')}</a>
  </p>
{:else}
  {#if me.profiles.length > 1}
    <label
      >{t('sour.profil')}
      <select bind:value={profileId} onchange={load}>
        {#each me.profiles as p (p.id)}<option value={p.id}>{p.pseudonym}</option>{/each}
      </select></label
    >
  {/if}
  <p class="muted small">{t('sour.aide')}</p>
  {#if error}<p class="card bad" role="alert">{error}</p>{/if}
  <ul class="list">
    {#each rows as s (s.sura)}
      <li class="card" data-testid="sourate-suivi">
        <h2>
          {fmtNumber(s.sura)}. <span lang="ar" dir="rtl">{suraName(s.sura)}</span>
          {#if hifzDone.includes(s.sura)}<span class="chip">{t('sour.hifz')}</span>{/if}
        </h2>
        {#if s.etape === 'valide'}
          <p class="ok">{t('sour.valide')}</p>
        {:else}
          <p class="steps">
            {#each STEPS as e (e)}
              <button
                type="button"
                class:primary={s.etape === e}
                aria-pressed={s.etape === e}
                onclick={() => step(s.sura, e)}>{t(`sour.${e}`)}</button
              >
            {/each}
          </p>
        {/if}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- chemin résolu, suivi d'un paramètre -->
        <a href={`${resolve('/coran/lecteur')}?s=${s.sura}`}>{t('rel.ouvrir_lecteur')}</a>
      </li>
    {:else}
      <li class="muted">{t('sour.aucune')}</li>
    {/each}
  </ul>
{/if}

<style>
  .steps {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
</style>
