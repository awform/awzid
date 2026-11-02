<script lang="ts">
  import Parcours from '$lib/tafsir/Parcours.svelte';
  import { t } from '$lib/i18n';

  /** « Tafsīr du niveau » (interrupteur `tafsir_sens`) : les sourates de la portion du niveau, avec la progression. */
</script>

<svelte:head><title>{t('app.nom')} — {t('tf.parcours_titre')}</title></svelte:head>

<Parcours />
