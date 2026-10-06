<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { suraName } from '@awform/hifz';
  import Ar from '$lib/Ar.svelte';
  import { isQuranReadingLevel } from '$lib/api';
  import { demoProfileFor } from '$lib/attempts';
  import { hifzToday } from '$lib/hifz';
  import { fmtNumber, t } from '$lib/i18n';
  import Feuille from '$lib/quran/lecture/Feuille.svelte';
  import { readLast, readMarks, type Position } from '$lib/quran/lecture';
  import { portionRange } from '$lib/quran/player';
  import Icon from '$lib/ui/Icon.svelte';

  /**
   * Coran épuré (06/10/2026) — accueil sobre : « Reprendre où j'en étais » (dernière lecture), portion du jour
   * de la piste de hifẓ, signets ; Récitateurs et Carnet en petits liens ; livrets « Lecture du Coran ». Les
   * textes d'explication (« Avec respect », garanties) sont derrière l'icône d'information.
   */
  let { data } = $props();
  /** lot 28 : livrets « Lecture du Coran » publiés (qc1 à qc3) */
  const livrets = $derived(data.levels.filter((l) => isQuranReadingLevel(l.code)));
  let last = $state<Position | null>(null);
  let marks = $state<Position[]>([]);
  let portion = $state<{ s: number; from: number; to: number } | null>(null);
  let info = $state(false);
  onMount(async () => {
    last = readLast();
    marks = readMarks().slice(0, 5);
    const prof = await demoProfileFor('').catch(() => null);
    if (prof) {
      const today = await hifzToday(prof.id).catch(() => null);
      portion = portionRange(today?.nouveau ?? null);
    }
  });
  const ref = (p: { s: number; a: number }) =>
    t('cl.ref_courte', { sourate: suraName(p.s), a: fmtNumber(p.a) });
</script>

<svelte:head><title>{t('app.nom')} — {t('onglets.coran')}</title></svelte:head>

<div class="head">
  <h1>{t('onglets.coran')}</h1>
  <button
    type="button"
    class="info"
    onclick={() => (info = true)}
    aria-label={t('cl.infos')}
    title={t('cl.infos')}
    aria-haspopup="dialog"
    data-testid="infos-coran"><Icon name="info" size={22} /></button
  >
</div>

<section class="hero" aria-labelledby="reprendre-titre">
  <h2 id="reprendre-titre" class="sr">{t('cl.reprendre')}</h2>
  <!-- eslint-disable svelte/no-navigation-without-resolve -- chemins résolus, suivis d'un paramètre -->
  {#if last}
    <a
      class="cta"
      href={`${resolve('/coran/lecteur')}?s=${last.s}&a=${last.a}`}
      data-testid="reprendre"
      ><Icon name="mushaf" size={28} /><span
        ><strong>{t('cl.reprendre')}</strong><small
          ><Bidi
            text={`${ref(last)} · ${t('mp.page')} ${fmtNumber(last.p, { useGrouping: false })}`}
          /></small
        ></span
      ></a
    >
  {/if}
  <a class="cta" class:second={!!last} href={resolve('/coran/lecteur')} data-testid="ouvrir-lecteur"
    ><Icon name="lire" size={26} /><span
      ><strong>{t('cl.ouvrir_mushaf')}</strong><small>{t('cl.ouvrir_mushaf_aide')}</small></span
    ></a
  >
  {#if portion}
    <a class="cta today" href={`${resolve('/coran/lecteur')}?memo=1`} data-testid="portion-du-jour"
      ><Icon name="repeter" size={26} /><span
        ><strong>{t('cl.aujourdhui_hifz')}</strong><small
          ><Bidi
            text={t('cl.portion_du_jour', {
              sourate: suraName(portion.s),
              de: portion.from,
              a: portion.to,
            })}
          /></small
        ></span
      ></a
    >
  {/if}
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
</section>

{#if marks.length}
  <section class="marks" aria-labelledby="signets-titre">
    <h2 id="signets-titre">{t('cl.signets')}</h2>
    <ul>
      {#each marks as m (`${m.s}:${m.a}`)}
        <li>
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- chemin résolu, suivi d'un paramètre -->
          <a href={`${resolve('/coran/lecteur')}?s=${m.s}&a=${m.a}`} data-signet={`${m.s}:${m.a}`}
            ><Icon name="etoile" size={16} /><Bidi text={ref(m)} /></a
          >
        </li>
      {/each}
    </ul>
  </section>
{/if}

<p class="links">
  <a href={resolve('/coran/recitateurs')} data-testid="ouvrir-recitateurs"
    ><Icon name="personne" size={18} />{t('ca.onglet_recitateurs')}</a
  >
  <a href={resolve('/hifz')} data-testid="ouvrir-hifz"
    ><Icon name="plume" size={18} />{t('cl.carnet')}</a
  >
</p>

<section class="livrets-box" data-testid="lecture-coran">
  <h2>{t('coran.qaida_titre')}</h2>
  {#if data.offline}<p class="muted">{t('arabe.hors_ligne')}</p>{/if}
  <ul class="livrets">
    {#each livrets as l (l.code)}
      <li>
        <a
          href={resolve('/niveaux/[code]', { code: l.code })}
          data-testid="niveau-qc"
          data-level={l.code}
        >
          <strong><Bidi text={l.codeFr ?? l.code} /></strong> — <Bidi text={l.titleFr} />
          {#if l.titreAr}<Ar text={l.titreAr} />{/if}
          <small><Bidi text={t('arabe.unites', { n: l.units })} /></small>
        </a>
      </li>
    {:else}
      <li class="muted">{t('sciences.bientot')}</li>
    {/each}
  </ul>
</section>

<Feuille id="infos-coran" title={t('cl.infos')} bind:open={info} testid="feuille-infos-coran">
  <p><Bidi text={t('coran.intro')} /></p>
  <h3>{t('ca.adab_titre')}</h3>
  <ul class="adab">
    <li>{t('ca.adab_1')}</li>
    <li>{t('ca.adab_2')}</li>
    <li>{t('ca.adab_3')}</li>
  </ul>
  <h3>{t('coran.hifz_titre')}</h3>
  <p><Bidi text={t('coran.hifz_texte')} /></p>
  <h3>{t('coran.qaida_titre')}</h3>
  <p><Bidi text={t('coran.qaida_texte')} /></p>
  <p><a href={resolve('/garanties')}>{t('pied.garanties')}</a></p>
</Feuille>

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .head h1 {
    margin: 0;
  }
  .info {
    display: inline-grid;
    place-items: center;
    width: 48px;
    height: 48px;
    padding: 0;
    color: var(--mp-green);
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 50%;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .hero {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
    gap: 12px;
    margin: var(--space-m) 0;
  }
  .cta {
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 84px;
    padding: 14px 18px;
    color: var(--mp-on-band);
    text-decoration: none;
    background: var(--mp-band);
    border: 1px solid var(--mp-band);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    transition: transform var(--motion-fast) ease;
  }
  .cta:hover {
    transform: translateY(-1px);
  }
  .cta > span {
    display: grid;
    gap: 2px;
  }
  .cta strong {
    font-size: 1.1rem;
  }
  .cta small {
    font-size: 0.9rem;
  }
  .cta.second {
    color: var(--mp-green);
    background: var(--card);
    border-color: var(--mp-mint2);
  }
  .cta.today {
    color: var(--or-ink);
    background: var(--or-soft);
    border-color: var(--or-line);
  }
  .marks h2,
  .livrets-box h2 {
    font-size: 1rem;
    margin: var(--space-m) 0 6px;
    color: var(--mp-green);
  }
  .marks ul {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .marks a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 14px;
    color: var(--or-ink);
    text-decoration: none;
    background: var(--or-soft);
    border: 1px solid var(--or-line);
    border-radius: var(--radius-pill);
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 20px;
    margin: var(--space-m) 0;
  }
  .links a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    color: var(--mp-green);
    font-weight: 700;
  }
  .livrets {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .livrets a {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px 12px;
    padding: 12px 14px;
    margin: 8px 0;
    border: 1px solid var(--mp-mint2);
    border-radius: var(--radius-md);
    text-decoration: none;
    color: var(--ink);
    background: var(--card);
  }
  .livrets small {
    color: var(--ink2);
  }
  .adab {
    padding-inline-start: 1.2em;
  }
  h3 {
    font-size: 1rem;
    margin: 14px 0 4px;
  }
</style>
