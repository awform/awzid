<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import type { Voix } from './audio';
  import {
    chargerSection,
    etapesDe,
    listeNiveaux,
    trouver,
    type Plan,
    type Progres,
    type Section,
  } from './donnees';
  import ElementVue from './ElementVue.svelte';
  import { remplacerRequete } from './navigation';
  import Parole from './Parole.svelte';
  import Pastilles from './Pastilles.svelte';
  import Picto from './Picto.svelte';
  import SilhouetteVue from './SilhouetteVue.svelte';
  import Texte from './Texte.svelte';
  import type { Genre, NomPose } from './silhouette';

  /**
   * Écran 2 — « Prier pas à pas » : la scène animée (silhouette, étiquette « Étape n sur N », compteur d'unités), le
   * ruban des étapes, puis la carte de l'étape : titre, statut, ce qu'on fait, notes, erreurs fréquentes, chaque
   * parole (arabe mot à mot, écoute, sens, voix) et « Revoir le geste ». Tout le texte vient du livre (S5.subh).
   */
  let {
    plan,
    progres,
    voix,
    depart = 0,
    vu,
    changerGenre,
  }: {
    plan: Plan;
    progres: Progres;
    voix: Voix;
    depart?: number;
    vu: (id: string) => void;
    changerGenre: (g: Genre) => void;
  } = $props();

  let section = $state<Section | null>(null);
  let i = $state(0);
  let parle = $state(false);
  let sil = $state<{ aller: (p: NomPose, ms: number) => Promise<void> } | null>(null);
  let ruban: HTMLElement | undefined = $state();

  onMount(() => {
    void chargerSection('S5').then((s) => {
      section = s;
      i = Math.max(0, Math.min(etapesDe(s, 'S5.subh').length - 1, depart));
    });
  });
  onDestroy(() => voix.arreter());

  const etapes = $derived(etapesDe(section, 'S5.subh'));
  const titreParcours = $derived(trouver(section, 'S5.subh')?.titre ?? '');
  const etape = $derived(etapes[i]);
  const anim = $derived(etape ? plan.animation.pas.etapes[etape.id] : undefined);
  const pose = $derived((anim?.pose ?? 'debout') as NomPose);
  const unite = $derived(anim?.rakaa ?? 1);
  const total = $derived(plan.animation.pas.rakaat);

  function aller(k: number) {
    if (k < 0 || k >= etapes.length) return;
    voix.arreter();
    i = k;
    remplacerRequete(`e=pas&i=${k}`);
  }
  $effect(() => {
    if (etape) vu(etape.id);
  });
  // le ruban garde l'étape courante au centre
  $effect(() => {
    void i;
    const cur = ruban?.children[i] as HTMLElement | undefined;
    if (cur && ruban)
      ruban.scrollLeft = cur.offsetLeft - ruban.clientWidth / 2 + cur.offsetWidth / 2;
  });

  /** « Revoir le geste » : de la position précédente à celle de l'étape (ou toute la suite, pour l'étape qui enchaîne). */
  async function revoir() {
    if (!etape || !sil) return;
    const suite = anim?.suite;
    const avant = plan.animation.pas.etapes[etapes[Math.max(0, i - 1)]?.id ?? '']?.pose as
      NomPose | undefined;
    await sil.aller(avant ?? 'debout', 0);
    for (const p of suite ?? [pose]) await sil.aller(p as NomPose, 1200);
  }
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- vue de la même page (?e=video) -->
<div class="e-pas" data-testid="priere-pas">
  <div class="outils">
    <div class="seg" role="group" aria-label={t('priere.silhouette')}>
      {#each ['homme', 'femme'] as g (g)}
        <button
          type="button"
          aria-pressed={progres.genre === g}
          data-genre={g}
          onclick={() => changerGenre(g as Genre)}>{t(`priere.${g}`)}</button
        >
      {/each}
    </div>
    <a class="btn or" href="?e=video" data-testid="priere-vers-video"
      ><Picto nom="video" />{t('priere.video')}</a
    >
  </div>

  <div class="scene-zone">
    <div class="scene" class:parle>
      <SilhouetteVue bind:this={sil} {pose} genre={progres.genre} {parle} duree={1200} />
    </div>
    <div class="etiquette">
      <small data-testid="priere-num-etape"
        >{t('priere.etape_n', { n: i + 1, total: etapes.length })}</small
      ><b>{titreParcours}</b>
    </div>
    <div class="compteur-rakaa" aria-live="polite">
      <span class="points"
        >{#each Array(total) as _, k (k)}<i class:fait={k < unite}></i>{/each}</span
      ><span data-testid="priere-unite">{t('priere.unite', { r: unite, total })}</span>
    </div>
  </div>

  <nav class="ruban" bind:this={ruban} aria-label={t('priere.etapes')}>
    {#each etapes as e, k (e.id)}
      <button
        type="button"
        class:fait={k < i}
        aria-current={k === i ? 'step' : undefined}
        data-etape={e.id}
        onclick={() => aller(k)}><i>{k + 1}</i><span>{e.titre}</span></button
      >
    {/each}
  </nav>

  {#if etape}
    {#key etape.id}
      <article
        class="carte panneau"
        aria-live="polite"
        data-testid="priere-etape"
        data-id={etape.id}
      >
        <h2>{etape.titre}</h2>
        <Pastilles niveau={listeNiveaux(etape)} />
        {#if etape.geste}<p class="fais"><Texte txt={etape.geste} /></p>{/if}
        {#each etape.notes ?? [] as n, k (k)}
          <p class="note"><Picto nom="info" /><span><Texte txt={n} /></span></p>
        {/each}
        {#if etape.autres_ecoles}
          <details class="plus">
            <summary>{t('priere.autres_ecoles')}<Picto nom="chevron-b" /></summary>
            <p><Texte txt={etape.autres_ecoles} /></p>
          </details>
        {/if}
        {#if etape.erreurs_frequentes?.length}
          <details class="plus" open>
            <summary>{t('priere.erreurs')}<Picto nom="chevron-b" /></summary>
            <ul class="liste-erreurs">
              {#each etape.erreurs_frequentes as x, k (k)}<li><Texte txt={x} /></li>{/each}
            </ul>
          </details>
        {/if}
        {#each etape.paroles ?? [] as p (p.id)}
          <Parole
            {p}
            {voix}
            longue={(p.ar ?? '').length > 60}
            surParle={(b) => (parle = b)}
            lienMam={p.id === 'S5.fatiha' ? '?e=sourate&s=1' : undefined}
          />
        {/each}
        {#each etape.preuves ?? [] as p (p.id)}<ElementVue e={p} {voix} />{/each}
        {#if etape.sources?.length}
          <details class="plus">
            <summary>{t('priere.sources')}<Picto nom="chevron-b" /></summary>
            <ul class="sources">
              {#each etape.sources as s, k (k)}<li>{s}</li>{/each}
            </ul>
          </details>
        {/if}
        <button
          type="button"
          class="btn clair bloc"
          style="margin-top:14px"
          data-testid="priere-revoir"
          onclick={revoir}><Picto nom="repeter" />{t('priere.revoir_geste')}</button
        >
      </article>
    {/key}
  {:else}
    <p class="muted" aria-busy="true">…</p>
  {/if}
  <div class="nav-etapes">
    <button
      type="button"
      class="rond clair"
      aria-label={t('priere.etape_prec')}
      disabled={i === 0}
      onclick={() => aller(i - 1)}><Picto nom="fleche-g" /></button
    >
    <button
      type="button"
      class="btn bloc"
      data-testid="priere-suivante"
      disabled={i >= etapes.length - 1}
      onclick={() => aller(i + 1)}>{t('priere.etape_suiv')}<Picto nom="fleche" /></button
    >
  </div>
</div>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
