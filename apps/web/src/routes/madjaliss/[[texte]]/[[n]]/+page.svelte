<script lang="ts">
  import { page } from '$app/state';
  import { t } from '$lib/i18n';
  import { texteDuCursus } from '$lib/madjaliss/cycles';
  import Liste from '$lib/madjaliss/Liste.svelte';
  import SeancePage from '$lib/madjaliss/SeancePage.svelte';
  import Sommaire from '$lib/madjaliss/Sommaire.svelte';

  /**
   * Madjaliss : UNE seule page pour les trois écrans (liste des textes, sommaire d'un texte, séance) — un seul
   * nœud, donc un seul morceau gardé au premier usage, sans module partagé qui partirait dans le morceau commun
   * préchargé (vite.config.ts, ESPACES). Adresses : /madjaliss, /madjaliss/akhdari, /madjaliss/akhdari/12.
   */
  const texte = $derived(page.params.texte ?? '');
  const n = $derived(page.params.n ?? '');
  const cursus = $derived(texteDuCursus(texte));
  const nom = $derived(cursus ? t(`mj.t_${cursus.id.replace('-', '_')}`) : t('mj.titre'));
  const titre = $derived(
    !texte ? t('mj.titre') : !n ? nom : `${t('mj.seance', { n: Number(n) })} — ${nom}`,
  );
</script>

<svelte:head><title>{t('app.nom')} — {titre}</title></svelte:head>

{#if !texte}
  <Liste />
{:else if !n}
  {#key texte}<Sommaire id={texte} />{/key}
{:else}
  {#key `${texte}/${n}`}<SeancePage id={texte} n={Number(n)} />{/key}
{/if}
