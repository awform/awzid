<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import { reduit } from './mouvement';
  import { ici, stations, type Plan, type Progres } from './donnees';
  import Picto from './Picto.svelte';
  import SilhouetteVue from './SilhouetteVue.svelte';
  import Texte from './Texte.svelte';
  import type { NomPose } from './silhouette';

  /**
   * Écran 1 — « Le chemin de la prière » : panneau vert avec une silhouette ivoire qui prie en boucle dans une arche
   * dorée, anneau d'or de l'avancement, citation, puis le chemin : une station par section du référent (fait : vert
   * coché, en cours : or avec une onde, à venir : ivoire), arrivée, accès directs. Titres, introductions et citation
   * viennent des données.
   */
  let { plan, progres }: { plan: Plan; progres: Progres } = $props();

  const st = $derived(stations(plan, progres.vus));
  const faites = $derived(st.filter((s) => s.fait).length);
  const enCours = $derived(ici(st));
  const prochaine = $derived(plan.sections.find((s) => s.id === enCours));
  const ECRAN = $derived(plan.animation.accueil.ecrans);
  const ICONE = $derived(plan.animation.accueil.stations);
  const D = ['d1', 'd2', 'd3', 'd2'];

  // silhouette du panneau : prie en boucle (immobile en mouvement réduit)
  const SUITE: NomPose[] = [
    'takbir',
    'debout',
    'ruku',
    'releve',
    'sujud',
    'assise',
    'sujud',
    'tashahhud',
    'salam',
    'debout',
  ];
  let pose = $state<NomPose>('debout');
  onMount(() => {
    if (reduit()) return;
    let i = 0;
    const iv = setInterval(() => {
      pose = SUITE[i % SUITE.length]!;
      i++;
    }, 2800);
    return () => clearInterval(iv);
  });

  // pointillé d'or qui relie les médaillons
  let chemin: HTMLElement;
  let trace = $state('');
  function tracer() {
    if (!chemin) return;
    const r0 = chemin.getBoundingClientRect();
    const pts = [...chemin.querySelectorAll('.med')].map((m) => {
      const r = m.getBoundingClientRect();
      return [r.left - r0.left + r.width / 2, r.top - r0.top + r.height / 2] as const;
    });
    if (!pts.length) return;
    let d = `M${pts[0]!.join(',')}`;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const my = (a[1] + b[1]) / 2;
      d += `C${a[0]},${my} ${b[0]},${my} ${b[0]},${b[1]}`;
    }
    trace = d;
  }
  onMount(() => {
    tracer();
    addEventListener('resize', tracer);
    void document.fonts?.ready.then(tracer);
    return () => removeEventListener('resize', tracer);
  });
  $effect(() => {
    void st;
    queueMicrotask(tracer);
  });
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- vues de la même page (?e=…) -->
<section class="bandeau cadre heros" data-testid="priere-heros">
  <div>
    <div class="sur">{t('priere.parcours')}</div>
    <h1><Bidi text={plan.meta.titre} /></h1>
  </div>
  <div class="medaille">
    <SilhouetteVue
      {pose}
      camera="figure"
      decor={false}
      viewBox="30 22 180 196"
      aria={false}
      duree={1300}
    />
  </div>
  <div class="progres-heros">
    <div class="anneau-or" aria-hidden="true">
      <svg viewBox="0 0 62 62"
        ><circle
          cx="31"
          cy="31"
          r="26"
          fill="none"
          stroke="rgba(255,255,255,.18)"
          stroke-width="6"
        /><circle
          cx="31"
          cy="31"
          r="26"
          fill="none"
          stroke="#D9B54A"
          stroke-width="6"
          stroke-linecap="round"
          stroke-dasharray="{(faites / Math.max(1, st.length)) * 163.4} 163.4"
        /></svg
      ><b><Bidi text={faites} />/<Bidi text={st.length} /></b>
    </div>
    <div class="txt">
      <strong data-testid="priere-avancement"
        ><Bidi text={t('priere.avancement_global', { n: faites, total: st.length })} /></strong
      >
      <span
        ><Bidi
          text={prochaine ? t('priere.prochaine', { titre: prochaine.titre }) : t('priere.termine')}
        /></span
      >
    </div>
  </div>
</section>

{#if plan.citation}
  <div class="citation" data-testid="priere-citation">
    {#if plan.citation.ar}<span class="ar quran-text" lang="ar" dir="rtl">{plan.citation.ar}</span
      >{/if}
    {#if plan.citation.fr}<p><Texte txt={plan.citation.fr} /></p>{/if}
    {#if plan.citation.reference}<small><Bidi text={plan.citation.reference} /></small>{/if}
  </div>
{/if}

<div class="sec">
  <h2>{t('priere.chemin')}</h2>
  <span class="fil"></span>
</div>
<div class="chemin" bind:this={chemin} data-testid="priere-chemin">
  <svg class="trace" aria-hidden="true"
    ><path
      d={trace}
      fill="none"
      stroke="var(--or)"
      stroke-width="2"
      stroke-dasharray="2 7"
      stroke-linecap="round"
    /></svg
  >
  {#each plan.sections as s, k (s.id)}
    {@const x = st[k]!}
    <a
      class="station {D[k % 4]} {x.fait ? 'fait' : enCours === s.id ? 'ici' : ''}"
      href="?e={ECRAN[s.id]}"
      data-station={s.id}
      aria-label={t(
        x.fait
          ? 'priere.station_faite'
          : enCours === s.id
            ? 'priere.station_ici'
            : 'priere.station',
        {
          n: k + 1,
          titre: s.titre,
        },
      )}
    >
      <span class="med"
        ><Picto nom={x.fait ? 'ok' : (ICONE[s.id] ?? 'etoile8-trait')} /><span class="num"
          ><Bidi text={k + 1} /></span
        ></span
      >
      <span class="bulle">
        <h3><Bidi text={s.titre} /></h3>
        <p><Bidi text={s.intro} /></p>
        <span class="etat"
          ><span class="barre"
            ><i style:width="{Math.round((100 * x.n) / Math.max(1, x.total))}%"></i></span
          ><small
            ><Bidi
              text={x.fait
                ? t('priere.station_terminee')
                : t('priere.avancement', { n: x.n, total: x.total })}
            /></small
          ></span
        >
        {#if enCours === s.id}<span class="cta"
            ><span class="btn">{t('priere.continuer')}<Picto nom="fleche" /></span></span
          >{/if}
      </span>
    </a>
  {/each}
</div>

<div class="arrivee">
  <svg class="rosette i" aria-hidden="true"><use href="#pr-rosette" /></svg>
  <div>
    <h3>{t('priere.arrivee_titre')}</h3>
    <p>{t('priere.arrivee_texte')}</p>
  </div>
</div>

<div class="sec">
  <h2>{t('priere.acces')}</h2>
  <span class="fil"></span>
</div>
<div class="acces">
  <a class="large" href="?e=video&lecture=1" data-testid="priere-acces-video"
    ><span class="picto"><Picto nom="video" /></span><span
      ><b>{t('priere.video')}</b><br /><small>{t('priere.video_texte')}</small></span
    ></a
  >
  <a href="?e=entrainement" data-testid="priere-acces-entrainement"
    ><Picto nom="repeter" /><b>{t('priere.entrainement')}</b><small
      >{t('priere.entrainement_texte')}</small
    ></a
  >
  <a href="?e=apres" data-testid="priere-acces-apres"
    ><Picto nom="chapelet" /><b>{t('priere.apres')}</b><small>{t('priere.apres_texte')}</small></a
  >
</div>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
