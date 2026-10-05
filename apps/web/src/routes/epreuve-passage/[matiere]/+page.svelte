<script lang="ts">
  import { page } from '$app/state';
  import { t } from '$lib/i18n';
  import TestNiveau from '$lib/parcours/TestNiveau.svelte';

  /** A27 — épreuve de passage : l'épreuve de fin du niveau courant ouvre le niveau suivant. */
  const matiere = $derived(page.params.matiere === 'sciences' ? 'sciences' : 'arabe');
</script>

<svelte:head><title>{t('app.nom')} — {t('parc.epreuve_titre')}</title></svelte:head>

{#key matiere}<TestNiveau mode="epreuve" {matiere} />{/key}
