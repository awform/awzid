<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import { etapeSuivante, type EtapeSeance } from '$lib/seance';
  import Icon from '$lib/ui/Icon.svelte';

  /** D1 — lien vers l'étape suivante de « Ma séance du jour » (rien hors d'une séance). */
  let { ici }: { ici: EtapeSeance['k'] } = $props();
  let suite = $state<EtapeSeance | null>(null);
  onMount(() => {
    suite = etapeSuivante(ici);
  });
</script>

{#if suite}
  <!-- eslint-disable svelte/no-navigation-without-resolve -- chemin résolu à l'accueil (plan de la séance) -->
  <a class="button primary suite" href={suite.href} data-testid="suite-seance" data-suite={suite.k}
    ><Icon name="fleche" size={20} /><span
      ><Bidi
        text={t('seance.suite', { etape: t(suite.k === 'mots' ? 'auj.mots' : 'auj.hifz') })}
      /></span
    ></a
  >
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
{/if}

<style>
  .suite {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 56px;
    margin: var(--space-m) 0;
  }
</style>
