<script lang="ts">
  import { htmlSur } from './lecteur';

  /**
   * Texte d'un récit déjà converti en HTML ÉCHAPPÉ à la fabrication (histoires-compact.mjs). Seconde barrière ici : seules les
   * balises <strong>, <em> et <span class="ar-in" lang="ar" dir="rtl"> passent ; sinon tout le texte est affiché échappé.
   */
  let { h }: { h: string } = $props();
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- liste blanche vérifiée par htmlSur (strong, em, span arabe) -->
{@html htmlSur(h)}
