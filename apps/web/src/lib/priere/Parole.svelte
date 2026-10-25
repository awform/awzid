<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import { attendre } from './mouvement';
  import { mots } from './calendrier';
  import { sourceAudio, type Voix } from './audio';
  import type { Element } from './donnees';
  import Pastilles from './Pastilles.svelte';
  import Picto from './Picto.svelte';
  import Texte from './Texte.svelte';

  /**
   * Une PAROLE du livre (takbīr, tasbīḥ, tashahhud, adhkār, adhān, versets de la prière…) : l'arabe sur sa propre ligne,
   * mot à mot, le bouton d'écoute, le sens, la voix (haute ou basse), le statut. La voix :
   *  - Coran (`ayyub:…`) : récitation d'Ayyūb, verset par verset (le verset lu s'éclaire) ; jamais de synthèse ;
   *  - parole (`tts`) : fichier de synthèse existant, le mot entendu s'éclaire ; « Audio en préparation » sinon ;
   *  - basmala : jamais de voix, une explication à la place.
   * Tout le contenu vient des données.
   */
  let {
    p,
    voix,
    longue = false,
    lienMam,
    surParle,
    detail = true,
  }: {
    p: Element;
    voix: Voix;
    longue?: boolean;
    /** adresse du mot à mot complet (Fātiḥa) */
    lienMam?: string;
    surParle?: (oui: boolean) => void;
    /** sens, explication, mot à mot, autres écoles, sources */
    detail?: boolean;
  } = $props();

  let pret = $state(false);
  let lecture = $state(false);
  let actif = $state(-1);
  let verset = $state(-1);
  let progres = $state(0);
  let echec = $state(false);
  let variante = $state(false);

  onMount(() => {
    void voix.preparer().then(() => (pret = true));
  });
  onDestroy(() => {
    if (lecture) voix.arreter();
  });

  const src = $derived(pret ? sourceAudio(p, voix.la) : null);
  const varSrc = $derived(
    pret && p.variante
      ? sourceAudio({ audio: p.variante.audio, ar: p.variante.ar }, voix.la)
      : null,
  );
  const coran = $derived(src?.type === 'ayyub');
  const liste = $derived(p.ar ? mots(p.ar) : []);
  const mam = $derived(Array.isArray(p.mot_a_mot) ? p.mot_a_mot : []);

  let arret = false;
  async function ecouter(autre = false) {
    if (lecture) {
      arret = true;
      voix.arreter();
      return;
    }
    arret = false;
    const s = autre ? varSrc : src;
    const texte = autre ? p.variante?.ar : p.ar;
    if (!s || !texte) return;
    lecture = true;
    variante = autre;
    echec = false;
    progres = 0;
    surParle?.(true);
    try {
      if (s.type === 'ayyub') {
        for (const [k, ref] of s.refs.entries()) {
          verset = k;
          const r = await voix.reciter(ref, {
            surProgres: (f) => (progres = (k + f) / s.refs.length),
          });
          if (r === 'arret') break;
          if (k < s.refs.length - 1) await attendre(350);
          if (arret) break;
        }
      } else if (s.type === 'tts') {
        await voix.dire(texte, s.id, {
          surMot: (i) => (actif = i),
          surProgres: (f) => (progres = f),
        });
      }
    } catch {
      echec = true;
    } finally {
      lecture = false;
      actif = -1;
      verset = -1;
      progres = 0;
      surParle?.(false);
    }
  }
</script>

<!-- eslint-disable svelte/no-useless-mustaches -- une espace entre deux mots arabes -->
<section class="parole" class:longue data-testid="priere-parole" data-id={p.id}>
  <div class="moment"><small>{p.titre}</small></div>
  <Pastilles niveau={p.niveau} voix={p.voix} repetition={p.repetition} />

  {#if p.ar_versets?.length}
    <span class="coran" lang="ar" dir="rtl"
      >{#each p.ar_versets as v, k (v.ref)}<span
          class="verset"
          class:actif={verset === k}
          data-ref={v.ref}>{v.ar}</span
        >{/each}</span
    >
  {:else if p.ar}
    <span class={coran ? 'coran' : 'ar'} lang="ar" dir="rtl"
      >{#if coran}<span class="verset" class:actif={lecture}>{p.ar}</span
        >{:else}{#each liste as w, i (i)}<span
            class="mot"
            class:actif={actif === i}
            class:dit={actif > i}>{w}</span
          >{' '}{/each}{/if}</span
    >
  {/if}

  {#if src}
    {#if src.type === 'interdit'}
      <div class="audio-off" data-testid="priere-sans-voix" data-raison={src.raison}>
        <span class="rond" aria-hidden="true"><Picto nom="voix-basse" /></span>
        <span
          >{t(
            src.raison === 'basmala' ? 'priere.sans_voix_basmala' : 'priere.sans_voix_coran',
          )}</span
        >
      </div>
    {:else if src.type === 'tts' && !src.id}
      <div class="audio-off" data-testid="priere-audio-attente">
        <button
          type="button"
          class="rond"
          aria-disabled="true"
          aria-label={t('priere.audio_attente')}><Picto nom="ecouter" /></button
        >
        <span>{t('priere.audio_attente')}</span>
      </div>
    {:else if src.type !== 'aucun'}
      <div class="ecoute">
        <button
          type="button"
          class="rond petit"
          data-testid="priere-ecouter"
          data-source={src.type}
          aria-pressed={lecture && !variante}
          aria-label={t(lecture ? 'priere.arreter' : 'priere.ecouter') + ' : ' + p.titre}
          onclick={() => ecouter(false)}
          ><Picto nom={lecture && !variante ? 'pause' : 'ecouter'} /></button
        >
        <span class="barre" aria-hidden="true"
          ><i style:width="{(lecture && !variante ? progres : 0) * 100}%"></i></span
        >
      </div>
      {#if coran}
        <p class="note petit"><Picto nom="info" /><span>{t('priere.recite_ayyub')}</span></p>
        {#if p.extrait}<p class="note petit">
            <Picto nom="info" /><span>{t('priere.extrait')}</span>
          </p>{/if}
      {/if}
    {/if}
    {#if echec}<p class="note petit" role="status">{t('priere.recitation_absente')}</p>{/if}
  {/if}

  {#if detail}
    {#if p.sens}<p class="sens"><Texte txt={p.sens} /></p>{/if}
    {#if p.ar_versets?.length}
      <ol class="rangs" data-testid="priere-sens-versets">
        {#each p.ar_versets as v (v.ref)}{#if v.sens}<li>{v.sens}</li>{/if}{/each}
      </ol>
    {/if}
    {#if p.explication}<p class="fais"><Texte txt={p.explication} /></p>{/if}
    {#if p.numerotation}<p class="note petit">
        <Picto nom="info" /><span>{p.numerotation}</span>
      </p>{/if}
    {#if lienMam}
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- vue de la même page (?e=sourate) -->
      <a class="lien-mam" href={lienMam}>{t('priere.mot_a_mot_lien')}<Picto nom="fleche" /></a>
    {/if}
    {#if mam.length}
      <details class="plus">
        <summary>{t('priere.mot_a_mot')}<Picto nom="chevron-b" /></summary>
        <ul class="mam" data-testid="priere-mam">
          {#each mam as m, i (i)}<li>
              <span class="ar" lang="ar" dir="rtl">{m.ar}</span><span>{m.fr}</span>
            </li>{/each}
        </ul>
      </details>
    {/if}
    {#if p.autres_ecoles}
      <details class="plus">
        <summary>{t('priere.autres_ecoles')}<Picto nom="chevron-b" /></summary>
        <p><Texte txt={p.autres_ecoles} /></p>
      </details>
    {/if}
    {#if p.variante}
      <div class="parole variante" data-testid="priere-variante">
        <div class="moment"><small>{t('priere.autre_forme')}</small></div>
        <span class="ar" lang="ar" dir="rtl">{p.variante.ar}</span>
        {#if varSrc?.type === 'tts' && varSrc.id}
          <div class="ecoute">
            <button
              type="button"
              class="rond petit"
              aria-pressed={lecture && variante}
              aria-label={t(lecture && variante ? 'priere.arreter' : 'priere.ecouter') +
                ' : ' +
                t('priere.autre_forme')}
              onclick={() => ecouter(true)}
              ><Picto nom={lecture && variante ? 'pause' : 'ecouter'} /></button
            >
            <span class="barre" aria-hidden="true"
              ><i style:width="{(lecture && variante ? progres : 0) * 100}%"></i></span
            >
          </div>
        {/if}
        {#if p.variante.fr}<p class="sens"><Texte txt={p.variante.fr} /></p>{/if}
      </div>
    {/if}
    {#if p.sources?.length}
      <details class="plus">
        <summary>{t('priere.sources')}<Picto nom="chevron-b" /></summary>
        <ul class="sources">
          {#each p.sources as s, i (i)}<li>{s}</li>{/each}
        </ul>
      </details>
    {/if}
  {/if}
</section>
<!-- eslint-enable svelte/no-useless-mustaches -->
