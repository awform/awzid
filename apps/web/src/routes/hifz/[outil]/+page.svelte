<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import Bidi from '$lib/Bidi.svelte';
  import { demoProfileFor, type DevProfile } from '$lib/attempts';
  import Enfant from '$lib/hifz-outils/Enfant.svelte';
  import Fraicheur from '$lib/hifz-outils/Fraicheur.svelte';
  import PointsFaibles from '$lib/hifz-outils/PointsFaibles.svelte';
  import Priere from '$lib/hifz-outils/Priere.svelte';
  import TestHasard from '$lib/hifz-outils/TestHasard.svelte';
  import { t } from '$lib/i18n';
  import type { PageProps } from './$types';

  /**
   * Hifẓ complet (12/10/2026) — écrans des outils du carnet : test au hasard, mes points faibles, fraîcheur des
   * passages, deux rakʿa, écran enfant. Une seule action principale par écran ; tout fonctionne hors ligne
   * (sauf l'IA d'écoute et l'audio non gardé).
   */
  let { data }: PageProps = $props();
  const titre = $derived(t(`hz.titre_${data.outil}`));
  let profile = $state<DevProfile | null>(null);
  let loaded = $state(false);
  onMount(async () => {
    profile = await demoProfileFor('');
    loaded = true;
  });
</script>

<svelte:head><title>{t('app.nom')} — {titre}</title></svelte:head>

<p class="retour"><a href={resolve('/hifz')}>{t('hz.retour_carnet')}</a></p>
<h1><Bidi text={titre} /></h1>

{#if loaded && !profile}
  <p class="card">
    {t('hifz.choisir_profil')} <a href={resolve('/profils')}>{t('suivi.qui_apprend')}</a>
  </p>
{:else if profile}
  {#key `${data.outil}:${profile.id}`}
    {#if data.outil === 'test'}<TestHasard profileId={profile.id} kind={profile.kind} />
    {:else if data.outil === 'points-faibles'}<PointsFaibles profileId={profile.id} />
    {:else if data.outil === 'fraicheur'}<Fraicheur profileId={profile.id} />
    {:else if data.outil === 'priere'}<Priere profileId={profile.id} />
    {:else}<Enfant profileId={profile.id} />{/if}
  {/key}
{/if}

<style>
  .retour {
    margin: 0 0 4px;
    font-size: 0.95rem;
  }
</style>
