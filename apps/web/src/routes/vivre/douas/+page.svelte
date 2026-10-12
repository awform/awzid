<script lang="ts">
  import { fn } from '$lib/fonctions.svelte';
  import { t } from '$lib/i18n';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import EnTete from '$lib/ui/EnTete.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import VivreTabs from '$lib/vivre/VivreTabs.svelte';

  /**
   * Douas (phase 1) — onglet de « Vivre l'islam ». L'écran (`$lib/douas`) et ses données sont chargés À LA DEMANDE
   * (jamais préchargés sur l'appareil de l'élève : scripts/groupes.mjs) et gardés au premier usage (hors ligne
   * ensuite). Même interrupteur que l'espace : « Vivre l'islam ».
   */
  const vue = import('$lib/douas/DouasVue.svelte');
</script>

<svelte:head><title>{t('app.nom')} — {t('do.titre')}</title></svelte:head>

<EnTete titre={t('nav.vivre')} ar="حَيَاةُ الْمُسْلِمِ" icon="vivre" teinte={2} />
<VivreTabs current="douas" />

{#if !fn('vivre_islam')}
  <EmptyState icon="horsligne" title={t('fn.coupee')} />
{:else}
  {#await vue}
    <Loading />
  {:then m}
    <m.default />
  {:catch}
    <EmptyState icon="horsligne" title={t('do.absentes_titre')} text={t('do.absentes_texte')} />
  {/await}
{/if}
