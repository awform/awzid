<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import Bidi from '$lib/Bidi.svelte';
  import { loadTexts, t } from '$lib/i18n';
  import { suraName } from '@awform/hifz';
  import { aRevoirDe, bilans, statistiquesErreurs, type Bilan, type StatsErreurs } from './bilans';

  /**
   * A5 — carnet de hifẓ : passages « à revoir » d'après les dernières séances « Réciter et vérifier » (bilans
   * gardés sur l'appareil). Rien n'est noté ni validé : ce sont des pistes de révision ; le maître juge.
   */
  let { profileId }: { profileId: string } = $props();
  let liste = $state<Bilan[]>([]);
  /** historique des erreurs : types d'écart et versets qui reviennent (comptes, jamais une note) */
  let stats = $state<StatsErreurs | null>(null);

  onMount(async () => {
    const tous = await bilans(profileId);
    const l = aRevoirDe(tous).slice(0, 5);
    const s = statistiquesErreurs(tous);
    if (l.length || s.recurrents.length) await loadTexts('ecoute');
    liste = l;
    stats = s.recurrents.length ? s : null;
  });
</script>

{#if liste.length || stats}
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
    {#if stats}
      <h3 class="small">{t('ec.stats_titre')}</h3>
      <p class="small muted" data-testid="ecoute-stats-types">
        <Bidi
          text={t('ec.stats_types', {
            s: stats.seances,
            o: stats.parType.oublie ?? 0,
            r: stats.parType.remplace ?? 0,
            d: stats.parType.ordre ?? 0,
            j: stats.parType.ajoute ?? 0,
            v: stats.parType.verset_saute ?? 0,
          })}
        />
      </p>
      <ul class="plain">
        {#each stats.recurrents.slice(0, 5) as v (`${v.s}:${v.a}`)}
          <li data-testid="ecoute-recurrent">
            <Bidi text={t('ec.stats_revient', { sourate: suraName(v.s), a: v.a, n: v.seances })} />
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- chemin résolu, suivi d'un paramètre -->
            <a href={`${resolve('/coran/lecteur')}?s=${v.s}&a=${v.a}&memo=1`}
              >{t('ec.carnet_ouvrir')}</a
            >
          </li>
        {/each}
      </ul>
    {/if}
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
