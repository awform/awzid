<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import Bidi from '$lib/Bidi.svelte';
  import { loadTexts, t } from '$lib/i18n';
  import { suraName } from '@awform/hifz';
  import { aRevoirDe, bilans, type Bilan } from './bilans';

  /**
   * A5 — carnet de hifẓ : passages « à revoir » d'après les dernières séances « Réciter et vérifier » (bilans
   * gardés sur l'appareil). Rien n'est noté ni validé : ce sont des pistes de révision ; le maître juge.
   */
  let { profileId }: { profileId: string } = $props();
  let liste = $state<Bilan[]>([]);

  onMount(async () => {
    const l = aRevoirDe(await bilans(profileId)).slice(0, 5);
    if (l.length) await loadTexts('ecoute');
    liste = l;
  });
</script>

{#if liste.length}
  <section class="card" data-testid="ecoute-a-revoir-carnet">
    <h2>{t('ec.carnet_titre')}</h2>
    <ul class="plain">
      {#each liste as b (`${b.s}:${b.from}-${b.to}`)}
        {@const q = `?s=${b.s}&a=${b.mots[0]?.[1] ?? b.from}&memo=1`}
        <li>
          <Bidi
            text={t('ec.carnet_ligne', {
              sourate: suraName(b.s),
              de: b.from,
              a: b.to,
              n: b.aRevoir,
            })}
          />
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- chemin résolu, suivi d'un paramètre -->
          <a href={`${resolve('/coran/lecteur')}${q}`} data-testid="ecoute-revoir"
            >{t('ec.carnet_ouvrir')}</a
          >
        </li>
      {/each}
    </ul>
    <p class="muted small"><Bidi text={t('ec.carnet_aide')} /></p>
  </section>
{/if}

<style>
  li {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    align-items: baseline;
    margin-bottom: 6px;
  }
</style>
