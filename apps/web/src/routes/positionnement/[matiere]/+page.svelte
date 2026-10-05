<script lang="ts">
  import { page } from '$app/state';
  import { t } from '$lib/i18n';
  import TestNiveau from '$lib/parcours/TestNiveau.svelte';

  /** A27 — test de positionnement (arabe, sciences ; le Coran a sa piste à part). */
  const matiere = $derived(page.params.matiere === 'sciences' ? 'sciences' : 'arabe');
</script>

<svelte:head><title>{t('app.nom')} — {t('parc.positionnement_titre')}</title></svelte:head>

{#key matiere}<TestNiveau mode="positionnement" {matiere} />{/key}
