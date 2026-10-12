<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import Bidi from '$lib/Bidi.svelte';
  import { loadMeta, loadVerses } from '$lib/hifz';
  import { fmtDate, t } from '$lib/i18n';
  import { libelle, marquesDe } from './donnees';
  import MotsVerset from './MotsVerset.svelte';
  import { prochesDe } from './mutashabihat';
  import { carteErreurs, pointsFaibles, type PointFaible } from './outils';

  /**
   * Hifẓ complet — « MES POINTS FAIBLES » : la carte des erreurs, verset par verset (erreurs, hésitations, oublis
   * encore actifs : une récitation « juste » les résout), avec les mots marqués surlignés discrètement sur le
   * texte. Action principale : tester le point le plus faible.
   */
  let { profileId }: { profileId: string } = $props();
  const MAX = 30;
  let liste = $state<PointFaible[]>([]);
  let textes = $state<Record<string, string>>({});
  let charge = $state(false);
  let basmala = $state('');

  onMount(async () => {
    liste = pointsFaibles(carteErreurs(await marquesDe(profileId))).slice(0, MAX);
    charge = true;
    basmala = (await loadMeta())?.basmala ?? '';
    const next: Record<string, string> = {};
    for (const p of liste) {
      const [v] = await loadVerses(p.s, p.a, p.a);
      if (v) next[`${p.s}:${p.a}`] = v.text;
    }
    textes = next;
  });
  const tester = (p: PointFaible) =>
    `${resolve('/hifz/[outil]', { outil: 'test' })}?verset=${p.s}:${p.a}`;
</script>

{#if charge && !liste.length}
  <p class="card muted" data-testid="points-vides">{t('hz.points_vides')}</p>
{:else if liste.length}
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- adresse résolue + paramètre -->
  <a class="button primary" href={tester(liste[0]!)} data-testid="tester-plus-faible"
    >{t('hz.tester_plus_faible')}</a
  >
  <ol class="points" data-testid="points-faibles">
    {#each liste as p (`${p.s}:${p.a}`)}
      <li class="card" data-point={`${p.s}:${p.a}`}>
        <h2><Bidi text={libelle({ s: p.s, from: p.a, to: p.a })} /></h2>
        <p class="small">
          <Bidi
            text={t('hz.compte', {
              e: p.erreurs,
              h: p.hesitations,
              o: p.oublis,
              d: fmtDate(p.dernier, { dateStyle: 'medium' }),
            })}
          />
        </p>
        {#if textes[`${p.s}:${p.a}`]}
          <MotsVerset
            v={{ s: p.s, a: p.a, text: textes[`${p.s}:${p.a}`]! }}
            mots={p.mots}
            {basmala}
          />
        {/if}
        {#each prochesDe(p.s, p.a) as x (`${x.s}:${x.a}`)}
          <p class="small" role="note" data-testid="mutashabih">
            <Bidi text={t('hz.proche_de', { ref: libelle({ s: x.s, from: x.a, to: x.a }) })} />
          </p>
        {/each}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- adresse résolue + paramètre -->
        <a href={tester(p)}>{t('hz.tester_ce_verset')}</a>
      </li>
    {/each}
  </ol>
{/if}

<style>
  .points {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 10px;
  }
  .points h2 {
    font-size: 1.05rem;
    margin: 0;
  }
  .small {
    font-size: 0.9rem;
  }
  .button {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 16px;
    border-radius: 999px;
    text-decoration: none;
    font-weight: 700;
    margin-bottom: 10px;
  }
</style>
