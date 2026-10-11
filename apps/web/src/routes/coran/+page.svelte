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
  import ListeSourates from '$lib/quran/ListeSourates.svelte';
  import { portionRange } from '$lib/quran/player';
  import { SURA_NAMES_AR } from '$lib/quran/sura-names-ar';
  import EnTete from '$lib/ui/EnTete.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  /**
   * Coran (D2) — accueil : en-tête étoilé, carte « Reprendre la lecture » (nom arabe calligraphié, bouton doré :
   * l'action principale), accès Lire / Écouter / Mémoriser, portion du jour et signets, liste des 114 sourates avec
   * recherche, Récitateurs et Carnet, livrets « Lecture du Coran ». Textes longs et crédits derrière « Informations ».
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
  const lecteur = resolve('/coran/lecteur');
  const MODES = [
    { id: 'lire', icon: 'lire', q: '', testid: 'ouvrir-lecteur' },
    { id: 'ecouter', icon: 'casque', q: '?ecoute=1', testid: 'mode-ecouter' },
    { id: 'memoriser', icon: 'repeter', q: '?memo=1', testid: 'mode-memoriser' },
  ] as const;
</script>

<svelte:head><title>{t('app.nom')} — {t('onglets.coran')}</title></svelte:head>

<EnTete titre={t('onglets.coran')} ar="الْقُرْآنُ الْكَرِيمُ">
  {#snippet action()}
    <button
      type="button"
      class="info"
      onclick={() => (info = true)}
      aria-haspopup="dialog"
      data-testid="infos-coran"><Icon name="info" size={20} /><span>{t('cl.infos')}</span></button
    >
  {/snippet}
</EnTete>

<!-- eslint-disable svelte/no-navigation-without-resolve -- chemins résolus, suivis d'un paramètre -->
<section
  class="carte-reprendre reprendre"
  aria-labelledby="reprendre-titre"
  data-testid="reprendre-carte"
>
  <h2 id="reprendre-titre">
    <Bidi text={t(last ? 'cl.reprendre_lecture' : 'cl.commencer_lecture')} />
  </h2>
  <p class="rp-ar" lang="ar" dir="rtl">
    <Bidi text={SURA_NAMES_AR[(last?.s ?? 1) - 1] ?? ''} base="ar" />
  </p>
  {#if last}
    <p class="rp-ref">
      <Bidi text={`${ref(last)} · ${t('mp.page')} ${fmtNumber(last.p, { useGrouping: false })}`} />
    </p>
    <a class="dore" href={`${lecteur}?s=${last.s}&a=${last.a}`} data-testid="reprendre"
      >{t('cl.continuer_lecture')}<Icon name="fleche" size={20} /></a
    >
  {:else}
    <p class="rp-ref"><Bidi text={suraName(1)} /></p>
    <a class="dore" href={`${lecteur}?s=1`} data-testid="commencer-lecture"
      >{t('cl.ouvrir_mushaf')}<Icon name="fleche" size={20} /></a
    >
  {/if}
</section>

<ul class="modes" aria-label={t('cl.ouvrir_mushaf_aide')}>
  {#each MODES as m (m.id)}
    <li>
      <a href={`${lecteur}${m.q}`} data-testid={m.testid}
        ><span class="m-ic"><Icon name={m.icon} size={26} /></span><span
          ><Bidi text={t(`cl.mode_${m.id}`)} /></span
        ></a
      >
    </li>
  {/each}
</ul>

{#if portion}
  <a class="jour" href={`${lecteur}?memo=1`} data-testid="portion-du-jour"
    ><Icon name="repeter" size={22} /><span
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

{#if marks.length}
  <section class="marks" aria-labelledby="signets-titre">
    <h2 id="signets-titre">{t('cl.signets')}</h2>
    <ul>
      {#each marks as m (`${m.s}:${m.a}`)}
        <li>
          <a href={`${lecteur}?s=${m.s}&a=${m.a}`} data-signet={`${m.s}:${m.a}`}
            ><Icon name="etoile" size={16} /><Bidi text={ref(m)} /></a
          >
        </li>
      {/each}
    </ul>
  </section>
{/if}
<!-- eslint-enable svelte/no-navigation-without-resolve -->

<p class="links">
  <a href={resolve('/coran/recitateurs')} data-testid="ouvrir-recitateurs"
    ><Icon name="casque" size={20} />{t('ca.onglet_recitateurs')}</a
  >
  <a href={resolve('/hifz')} data-testid="ouvrir-hifz"
    ><Icon name="plume" size={20} />{t('cl.carnet')}</a
  >
</p>

<ListeSourates />

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
  <p class="muted"><Bidi text={t('cl.source_sourates')} /></p>
  <p><a href={resolve('/garanties')}>{t('pied.garanties')}</a></p>
</Feuille>

<style>
  .info {
    min-height: 48px;
    padding: 4px 14px;
    color: var(--primary);
    border-radius: var(--radius-pill);
  }
  /* carte « Reprendre » (.carte-reprendre et a.dore, app.css : même vocabulaire que l'Arabe, D1) */
  .reprendre h2 {
    margin: 0;
    font-size: 1rem;
    color: var(--ink2);
  }
  .rp-ar {
    margin: 0;
    font-family: var(--font-ar-titre);
    font-weight: 700;
    font-size: 2rem;
    line-height: 1.7;
    text-align: right;
  }
  .rp-ref {
    margin: 0 0 8px;
    font-weight: 600;
  }
  .modes {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    list-style: none;
    margin: var(--space-m) 0;
    padding: 0;
  }
  .modes a {
    display: grid;
    justify-items: center;
    gap: 6px;
    min-height: 88px;
    padding: 12px 4px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--card);
    color: var(--ink);
    font-weight: 700;
    text-align: center;
    text-decoration: none;
  }
  .modes a:hover {
    border-color: var(--primary);
  }
  .m-ic {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--primary-soft);
    color: var(--primary);
  }
  .jour {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    padding: 10px 16px;
    color: var(--or-ink);
    text-decoration: none;
    background: var(--or-soft);
    border: 1px solid var(--or-line);
    border-radius: 16px;
  }
  .jour > span {
    display: grid;
  }
  .marks h2,
  .livrets-box h2 {
    font-size: 1.15rem;
    margin: var(--space-l) 0 8px;
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
    margin: var(--space-m) 0 0;
  }
  .links a {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 48px;
    color: var(--primary);
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
    border: 1px solid var(--line);
    border-radius: 16px;
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
