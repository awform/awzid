<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onDestroy, onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import type { NomGeste } from './ablution';
  import AblutionVue from './AblutionVue.svelte';
  import type { Voix } from './audio';
  import {
    chargerSection,
    etapesDe,
    listeNiveaux,
    trouver,
    type Element,
    type Plan,
    type Progres,
    type Section,
  } from './donnees';
  import ElementVue from './ElementVue.svelte';
  import { vibrer } from './mouvement';
  import { remplacerRequete } from './navigation';
  import Parole from './Parole.svelte';
  import Pastilles from './Pastilles.svelte';
  import Picto from './Picto.svelte';
  import type { Genre } from './silhouette';
  import Texte from './Texte.svelte';

  /**
   * Écran 4 — « Les ablutions » : buste habillé, manches relevées, vue de face, SANS VISAGE ; l'eau coule d'un robinet
   * doré, la zone lavée s'entoure d'or, le « ×3 » se remplit goutte à goutte. Les gestes suivent les étapes du livre
   * (S2A). La tête : l'illustration est celle de l'homme, la règle de la femme est donnée par le texte. Le grand lavage
   * (S2B) n'est montré QUE par des pictogrammes et du texte : jamais par un corps. Rien de ce texte n'est écrit ici.
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
  let cycles = $state(0);
  let ruban: HTMLElement | undefined = $state();
  let lavage = $state<string | null>(null);

  onMount(() => {
    void chargerSection('S2').then((s) => {
      section = s;
      i = Math.max(0, Math.min(etapesDe(s, 'S2A.etapes').length - 1, depart));
    });
  });
  onDestroy(() => voix.arreter());

  const etapes = $derived(etapesDe(section, 'S2A.etapes'));
  const etape = $derived(etapes[i]);
  const A = $derived(plan.animation.ablutions);
  const cfg = $derived(etape ? A[etape.id] : undefined);
  const geste = $derived((cfg?.geste ?? 'intention') as NomGeste);
  const fois = $derived(cfg?.fois ?? 1);
  // la tête : illustration de l'homme seulement, la règle de la femme est donnée par le texte
  const genreImage = $derived<Genre>(cfg?.homme_seulement ? 'homme' : progres.genre);
  const regle = $derived(cfg?.regle ? trouver(section, cfg.regle) : null);
  const sous = (id: string) => section?.sous_sections?.find((x) => x.id === id);
  const reste = (id: string, exclus: string[]): Element[] =>
    (sous(id)?.elements ?? []).filter((x) => !exclus.includes(x.id) && x.type !== 'pas_a_pas');

  function aller(k: number) {
    if (k < 0 || k >= etapes.length) return;
    voix.arreter();
    cycles = 0;
    i = k;
    remplacerRequete(`e=ablutions&i=${k}`);
  }
  $effect(() => {
    if (etape) vu(etape.id);
  });
  $effect(() => {
    void i;
    const cur = ruban?.children[i] as HTMLElement | undefined;
    if (cur && ruban)
      ruban.scrollLeft = cur.offsetLeft - ruban.clientWidth / 2 + cur.offsetWidth / 2;
  });
  function compter(c: number) {
    cycles = c;
    if (fois > 1 && c === fois) vibrer(20);
  }
  const lavageEtapes = $derived(etapesDe(section, 'S2B.etapes'));
  const seche = $derived(etapesDe(section, 'S2C.etapes'));
</script>

<div class="e-ablutions" data-testid="priere-ablutions">
  <div class="outils">
    <div class="seg" role="group" aria-label={t('priere.silhouette')}>
      {#each ['homme', 'femme'] as g (g)}
        <button
          type="button"
          aria-pressed={progres.genre === g}
          data-genre={g}
          onclick={() => changerGenre(g as Genre)}
          ><Bidi text={t(g === 'homme' ? 'priere.homme' : 'priere.femme')} /></button
        >
      {/each}
    </div>
  </div>

  <div class="scene-zone">
    <div class="scene"><AblutionVue {geste} genre={genreImage} surCycle={compter} /></div>
    <div class="etiquette">
      <small data-testid="priere-num-geste"
        ><Bidi text={t('priere.geste_n', { n: i + 1, total: etapes.length })} /></small
      ><b><Bidi text={etape?.titre ?? ''} /></b>
    </div>
    {#if fois > 1}
      <div class="fois" aria-live="polite" data-testid="priere-fois">
        ×<Bidi text={fois} />
        {#each Array(fois) as _, k (k)}<i class:fait={k < Math.min(cycles, fois)}></i>{/each}
      </div>
    {/if}
  </div>

  <nav class="ruban" bind:this={ruban} aria-label={t('priere.gestes')}>
    {#each etapes as e, k (e.id)}
      <button
        type="button"
        class:fait={k < i}
        aria-current={k === i ? 'step' : undefined}
        data-etape={e.id}
        onclick={() => aller(k)}
        ><i><Bidi text={k + 1} /></i><span><Bidi text={e.titre} /></span></button
      >
    {/each}
  </nav>

  {#if etape}
    {#key etape.id}
      <article
        class="carte panneau"
        aria-live="polite"
        data-testid="priere-geste"
        data-id={etape.id}
      >
        <h2><Bidi text={i + 1} />. <Bidi text={etape.titre} /></h2>
        <Pastilles niveau={listeNiveaux(etape)} />
        {#if etape.geste}<p class="fais"><Texte txt={etape.geste} /></p>{/if}
        {#each etape.paroles ?? [] as p (p.id)}<Parole {p} {voix} />{/each}
        {#if cfg?.homme_seulement}
          <p class="note petit" data-testid="priere-illustration-homme">
            <Picto nom="info" /><span>{t('priere.illustration_homme')}</span>
          </p>
        {/if}
        {#if regle}<div data-testid="priere-regle-femme"><ElementVue e={regle} {voix} /></div>{/if}
        {#each etape.notes ?? [] as n, k (k)}<p class="note">
            <Picto nom="info" /><span><Texte txt={n} /></span>
          </p>{/each}
        {#if etape.autres_ecoles}
          <details class="plus">
            <summary>{t('priere.autres_ecoles')}<Picto nom="chevron-b" /></summary>
            <p><Texte txt={etape.autres_ecoles} /></p>
          </details>
        {/if}
        {#if etape.sources?.length}
          <details class="plus">
            <summary>{t('priere.sources')}<Picto nom="chevron-b" /></summary>
            <ul class="sources">
              {#each etape.sources as s, k (k)}<li><Bidi text={s} /></li>{/each}
            </ul>
          </details>
        {/if}
      </article>
    {/key}
  {:else}
    <p class="muted" aria-busy="true">…</p>
  {/if}
  <div class="nav-etapes">
    <button
      type="button"
      class="rond clair"
      aria-label={t('priere.geste_prec')}
      disabled={i === 0}
      onclick={() => aller(i - 1)}><Picto nom="fleche-g" /></button
    >
    <button
      type="button"
      class="btn bloc"
      data-testid="priere-geste-suivant"
      disabled={i >= etapes.length - 1}
      onclick={() => aller(i + 1)}>{t('priere.geste_suiv')}<Picto nom="fleche" /></button
    >
  </div>

  {#if section}
    {#each reste('S2A', ['S2A.etapes', 'S2A.tete.femme']) as e (e.id)}<ElementVue
        {e}
        {voix}
      />{/each}

    <!-- grand lavage : pictogrammes et texte seulement, jamais un corps -->
    {#if sous('S2B')}
      <div class="sec">
        <h2><Bidi text={sous('S2B')?.titre} /></h2>
        <span class="fil"></span>
      </div>
      <div class="ghusl" data-testid="priere-grand-lavage">
        <p class="doux petit">{t('priere.ghusl_pudeur')}</p>
        <ul class="frise-pictos" aria-label={t('priere.ghusl_etapes')}>
          {#each lavageEtapes as e, k (e.id)}
            <li>
              <button
                type="button"
                aria-pressed={lavage === e.id}
                data-etape={e.id}
                onclick={() => (lavage = lavage === e.id ? null : e.id)}
                ><b><Bidi text={k + 1} /></b><Picto
                  nom={plan.animation.pictos[e.id] ?? 'goutte'}
                /><span><Bidi text={e.titre} /></span></button
              >
            </li>
          {/each}
        </ul>
        {#each lavageEtapes.filter((x) => x.id === lavage) as e (e.id)}
          <div class="detail" data-testid="priere-lavage-detail">
            <Pastilles niveau={listeNiveaux(e)} />
            <p class="fais"><Texte txt={e.geste ?? ''} /></p>
            {#each e.notes ?? [] as n, k (k)}<p class="note">
                <Picto nom="info" /><span><Texte txt={n} /></span>
              </p>{/each}
          </div>
        {/each}
      </div>
      {#each reste('S2B', ['S2B.etapes']) as e (e.id)}<ElementVue {e} {voix} />{/each}
    {/if}

    {#if sous('S2C')}
      <div class="sec">
        <h2><Bidi text={sous('S2C')?.titre} /></h2>
        <span class="fil"></span>
      </div>
      <div class="ghusl">
        <ul class="frise-pictos">
          {#each seche as e, k (e.id)}
            <li>
              <button
                type="button"
                aria-pressed={lavage === e.id}
                data-etape={e.id}
                onclick={() => (lavage = lavage === e.id ? null : e.id)}
                ><b><Bidi text={k + 1} /></b><Picto
                  nom={plan.animation.pictos[e.id] ?? 'main'}
                /><span><Bidi text={e.titre} /></span></button
              >
            </li>
          {/each}
        </ul>
        {#each seche.filter((x) => x.id === lavage) as e (e.id)}
          <div class="detail">
            <Pastilles niveau={listeNiveaux(e)} />
            <p class="fais"><Texte txt={e.geste ?? ''} /></p>
          </div>
        {/each}
      </div>
      {#each reste('S2C', ['S2C.etapes']) as e (e.id)}<ElementVue {e} {voix} />{/each}
    {/if}

    {#if sous('S2D')}
      <div class="sec">
        <h2><Bidi text={sous('S2D')?.titre} /></h2>
        <span class="fil"></span>
      </div>
      {#each reste('S2D', []) as e (e.id)}<ElementVue {e} {voix} />{/each}
    {/if}
  {/if}
</div>
