<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';

  /**
   * Lot 10 — bouton « Voir / Cacher la traduction » commun (lectures graduées, Madjaliss, leçons des livres) : voir
   * `$lib/traduction.ts` (défaut : traduction visible, choix mémorisé par profil).
   */
  let { visible, onbasculer }: { visible: boolean; onbasculer: () => void } = $props();
</script>

<button
  type="button"
  class="small"
  aria-pressed={!visible}
  data-testid="traduction"
  data-visible={visible ? '1' : '0'}
  onclick={onbasculer}
  ><Bidi text={visible ? t('bib.cacher_traduction') : t('bib.voir_traduction')} /></button
>
