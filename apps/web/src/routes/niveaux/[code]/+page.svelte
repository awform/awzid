<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import Ar from '$lib/Ar.svelte';
  import { arabicSize, isQuranReadingLevel, isReligionLevel, unitLabel } from '$lib/api';
  import { demoProfileFor, type DevProfile } from '$lib/attempts';
  import { downloadPack, getSettings } from '$lib/offline';
  import { t } from '$lib/i18n';
  let { data } = $props();

  let profile: DevProfile | null = $state(null);
  let status: Record<string, string> = $state({});
  /** hors ligne d'abord : sans « données économes », le niveau ouvert est téléchargé en arrière-plan */
  let offlineState: 'local' | 'en_cours' | 'fait' | 'econome' | 'erreur' = $state('local');
  onMount(async () => {
    if (!data.local) {
      const s = await getSettings();
      if (s.econome) offlineState = 'econome';
      else {
        offlineState = 'en_cours';
        downloadPack(data.level)
          .then(() => (offlineState = 'fait'))
          .catch(() => (offlineState = 'erreur'));
      }
    }
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

<svelte:head><title>{t('app.nom')} — {data.level}</title></svelte:head>

<p>
  {#if isQuranReadingLevel(data.level)}<a href={resolve('/coran')}>{t('qc.retour')}</a>
  {:else if isReligionLevel(data.level)}<a href={resolve('/sciences')}
      >{t('niveau.retour_sciences')}</a
    >
  {:else}<a href={resolve('/')}>{t('niveau.retour')}</a>{/if}
</p>
<h1><Bidi text={t('niveau.titre', { level: data.level })} /></h1>
{#if profile}<p class="profil"><Bidi text={profile.pseudonym} /></p>{/if}
<p class="offline" data-testid="etat-hors-ligne">
  {#if offlineState === 'local' || offlineState === 'fait'}{t('niveau.disponible')}
  {:else if offlineState === 'en_cours'}{t('niveau.en_cours')}
  {:else if offlineState === 'econome'}{t('niveau.econome')}
    <a href={resolve('/hors-ligne')}>{t('niveau.econome_lien')}</a>
  {:else}{t('niveau.erreur')}{/if}
</p>
<ol class="units" style="--ar-size: {arabicSize(data.level)}px">
  {#each data.units as u (u.id)}
    <li class={u.kind}>
      <a href={resolve('/lecons/[id]', { id: u.id })} data-testid="unit">
        <span class="label"><Bidi text={unitLabel(u)} /></span>
        <span class="fr"><Bidi text={u.titleFr} /></span>
        {#if status[u.id] && status[u.id] !== 'ouverte'}<span
            class="st {status[u.id]}"
            data-testid="statut"><Bidi text={t(`statut.${status[u.id]}`)} /></span
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
    color: var(--soon-ink);
  }
  .st {
    font-size: 0.8rem;
    border-radius: 99px;
    padding: 1px 10px;
    background: var(--warn-bg);
    color: var(--soon-ink);
    font-weight: 700;
  }
  .st.terminee,
  .st.maitrisee {
    background: var(--ok-bg);
    color: var(--ok-ink);
  }
  .offline {
    font-size: 0.85rem;
    color: var(--ok-ink);
    margin: 4px 0;
  }
  .profil {
    color: var(--ink2);
    margin: 0;
  }
</style>
