<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n';
  import { loadCarnetPerso, setCarnetPerso } from '$lib/pratique';

  /** Ligne de carnet d'une leçon ra*, à cocher par un adulte (sans signature). */
  let { profileId, unitId }: { profileId: string; unitId: string } = $props();
  let coche = $state<boolean | null>(null);
  let error = $state('');

  onMount(async () => {
    const r = await loadCarnetPerso(profileId);
    const l = r.ok ? r.data?.lignes.find((x) => x.unitId === unitId) : undefined;
    coche = l ? l.coche : null;
  });
  async function toggle(e: Event) {
    error = '';
    const v = (e.currentTarget as HTMLInputElement).checked;
    const r = await setCarnetPerso(profileId, unitId, v);
    if (r.ok) coche = v;
    else error = t(`erreur.${r.code ?? 'reseau'}`);
  }
</script>

{#if coche !== null}
  <p>
    <label class="check"
      ><input type="checkbox" checked={coche} onchange={toggle} data-testid="carnet-perso-case" />
      {t('carnetp.fait')}</label
    >
    · <a href={resolve('/carnet')} data-testid="lien-carnet-perso">{t('carnetp.lien')}</a>
  </p>
  {#if error}<p class="bad" role="alert">{error}</p>{/if}
{/if}
