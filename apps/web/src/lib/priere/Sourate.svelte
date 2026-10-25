<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { t } from '$lib/i18n';
  import { refsAyyub, type RefVerset, type Voix } from './audio';
  import {
    chargerSection,
    chargerSourate,
    trouver,
    type DonneesSourate,
    type Element,
    type Progres,
    type Section,
  } from './donnees';
  import { attendre, reduit } from './mouvement';
  import { remplacerRequete } from './navigation';
  import Picto from './Picto.svelte';
  import Texte from './Texte.svelte';

  /**
   * Écran 5 — « La sourate mot à mot » : trois parties en trois couleurs pour Al-Fātiḥa (sous le hadith qudsī), versets
   * en grand où chaque mot touché ouvre une feuille avec son sens, récitation d'Ayyūb verset par verset ou en entier
   * (le verset lu s'encadre d'or et défile), « Allah répond » sous les versets concernés, bouton Voir / Cacher la
   * traduction, sens général. Pour Al-Fātiḥa : la Basmala n'est pas récitée dans la prière obligatoire (note du référent,
   * au-dessus du verset 1) ; les numéros suivent le décompte de Ḥafṣ. Texte coranique : Tanzil, octet pour octet.
   */
  let {
    progres,
    voix,
    depart = 1,
    vu,
    basculerTrad,
  }: {
    progres: Progres;
    voix: Voix;
    depart?: number;
    vu: (id: string) => void;
    basculerTrad: () => void;
  } = $props();

  const PARTIES = ['louange', 'engagement', 'demande'];
  let numero = $state(1);
  let donnees = $state<DonneesSourate | null>(null);
  let s8 = $state<Section | null>(null);
  let s5 = $state<Section | null>(null);
  let actif = $state(-1);
  let lecture = $state(false);
  let tout = $state(false);
  let progres8 = $state(0);
  let absent = $state(false);
  let choisi = $state<{ k: number; i: number } | null>(null);
  let feuilleBtn: HTMLButtonElement | undefined = $state();
  let dernierMot: HTMLElement | null = null;
  let arret = false;

  onMount(() => {
    numero = depart;
    void chargerSection('S8').then((s) => (s8 = s));
    void chargerSection('S5').then((s) => (s5 = s));
  });
  onDestroy(() => {
    arret = true;
    voix.arreter();
  });
  $effect(() => {
    const n = numero;
    donnees = null;
    absent = false;
    void chargerSourate(n).then((d) => {
      if (n !== numero) return;
      donnees = d;
      absent = !d;
      if (d) vu(`S8.${n}`);
    });
  });

  const so = $derived(donnees?.sourate);
  const liste = $derived(trouver(s8, 'S8.liste')?.lignes ?? []);
  const fatiha = $derived(numero === 1 ? trouver(s5, 'S5.fatiha') : null);
  const hadith = $derived(numero === 1 ? trouver(s5, 'S5.e3.p1') : null);
  const refDe = (ref: string): RefVerset => {
    const [s, v] = ref.split(':').map(Number);
    return { s: s ?? numero, v: v ?? 1 };
  };
  /** partie d'un verset d'Al-Fātiḥa, d'après les références du référent (`refs_hafs`, décompte de Ḥafṣ) */
  const partieDe = (ref: string): number =>
    (fatiha?.partie ?? []).findIndex((p) => p.refs_hafs.includes(ref));
  /** « Verset 5 » ou « Versets 2 à 4 » */
  const plage = (refs: string[]): string =>
    refs.length > 1
      ? t('priere.versets_plage', { a: refDe(refs[0]!).v, b: refDe(refs[refs.length - 1]!).v })
      : t('priere.verset_n', { n: refDe(refs[0] ?? '').v });
  const reponse = (ref: string): string | undefined =>
    (fatiha?.ar_versets ?? []).find((x) => x.ref === ref)?.reponse_d_allah;
  const recitee = (k: number) => so?.versets[k]?.recite_dans_la_priere_obligatoire !== false;

  async function lireVerset(k: number): Promise<boolean> {
    const v = so?.versets[k];
    if (!v) return false;
    const ref = refsAyyub(v.audio)[0] ?? refDe(v.ref);
    actif = k;
    try {
      const r = await voix.reciter(ref, {
        surProgres: (f) => {
          if (tout) progres8 = (k + f) / (so?.versets.length ?? 1);
        },
      });
      return r !== 'arret';
    } catch {
      absent = true;
      return false;
    }
  }
  async function ecouter(k: number) {
    if (lecture) {
      arret = true;
      voix.arreter();
      return;
    }
    arret = false;
    lecture = true;
    absent = false;
    await lireVerset(k);
    lecture = false;
    actif = -1;
  }
  /** toute la sourate, comme dans la prière : sans la Basmala quand elle n'y est pas récitée */
  async function ecouterTout() {
    if (lecture) {
      arret = true;
      voix.arreter();
      return;
    }
    arret = false;
    lecture = tout = true;
    absent = false;
    progres8 = 0;
    const vs = so?.versets ?? [];
    for (let k = 0; k < vs.length; k++) {
      if (!recitee(k)) continue;
      document
        .querySelector(`.priere #v${k}`)
        ?.scrollIntoView({ block: 'center', behavior: reduit() ? 'auto' : 'smooth' });
      if (!(await lireVerset(k)) || arret) break;
      await attendre(500);
      if (arret) break;
    }
    lecture = tout = false;
    actif = -1;
    progres8 = 0;
  }

  async function ouvrir(k: number, i: number, el: HTMLElement) {
    dernierMot = el;
    choisi = { k, i };
    await tick();
    feuilleBtn?.focus({ preventScroll: true });
  }
  function fermer() {
    if (!choisi) return;
    choisi = null;
    dernierMot?.focus({ preventScroll: true });
  }
  const mot = $derived(choisi && so ? so.versets[choisi.k]?.mot_a_mot[choisi.i] : undefined);
  function touche(e: KeyboardEvent) {
    if (e.key === 'Escape' && choisi) fermer();
  }
  function choisirSourate(n: number) {
    voix.arreter();
    arret = true;
    numero = n;
    remplacerRequete(`e=sourate&s=${n}`);
  }
  const nomPartie = (k: number): string => {
    const x = partieDe(so?.versets[k]?.ref ?? '');
    return x >= 0 ? (fatiha?.partie?.[x]?.nom ?? '') : '';
  };
  const hadithEl = $derived<Element | null>(hadith);
</script>

<svelte:window onkeydown={touche} />

<!-- eslint-disable svelte/no-useless-mustaches -- une espace entre deux mots arabes -->
<div class="e-sourate" data-testid="priere-sourate" data-sourate={numero}>
  {#if absent && !so}
    <p class="note" role="status">{t('priere.donnees_absentes')}</p>
  {:else if so}
    <section class="bandeau cadre tete-sourate">
      <div>
        <div class="sur">{trouver(s8, 'S8.liste')?.titre ?? ''}</div>
        <h1>{so.nom_fr}</h1>
        <p>{t('priere.n_versets', { n: so.nombre_versets })}</p>
      </div>
      <span></span>
      <span class="ar-titre" lang="ar" dir="rtl">{so.nom_ar}</span>
      <div class="lire-tout">
        <button
          type="button"
          class="rond or"
          data-testid="priere-lire-tout"
          aria-pressed={tout}
          aria-label={t(tout ? 'priere.arreter' : 'priere.ecouter_tout')}
          onclick={ecouterTout}><Picto nom={tout ? 'pause' : 'lecture'} /></button
        >
        <span>{t('priere.ecouter_tout')}<small>{t('priere.recitateur')}</small></span>
      </div>
      <div class="barre" aria-hidden="true"><i style:width="{progres8 * 100}%"></i></div>
    </section>

    <nav class="puces" aria-label={t('priere.sourates')} data-testid="priere-sourates">
      {#each liste as l (l[0])}
        <button
          type="button"
          class="puce"
          aria-pressed={Number(l[0]) === numero}
          data-sourate={l[0]}
          onclick={() => choisirSourate(Number(l[0]))}>{l[0]}. {l[1]}</button
        >
      {/each}
    </nav>

    {#if fatiha}
      <section class="partage" aria-labelledby="t-partage">
        {#if hadithEl}
          {#if hadithEl.ar}<span class="ar" lang="ar" dir="rtl">{hadithEl.ar}</span>{/if}
          {#if hadithEl.fr}<p class="hadith-fr"><Texte txt={hadithEl.fr} /></p>{/if}
          {#if hadithEl.reference}<small>{hadithEl.reference}</small>{/if}
        {/if}
        <h2 class="cache" id="t-partage">{t('priere.trois_parties')}</h2>
        <div
          class="bandes"
          style:grid-template-columns="repeat({fatiha.partie?.length ?? 3}, 1fr)"
          data-testid="priere-parties"
        >
          {#each fatiha.partie ?? [] as p, k (p.nom)}
            <button
              type="button"
              class="bande {PARTIES[k] ?? 'louange'}"
              data-partie={PARTIES[k]}
              onclick={() =>
                document
                  .querySelector(`.priere .v.${PARTIES[k]}`)
                  ?.scrollIntoView({ block: 'center', behavior: reduit() ? 'auto' : 'smooth' })}
              ><b class="nom">{p.nom}</b><span>{plage(p.refs_hafs)}</span></button
            >
          {/each}
        </div>
        {#each fatiha.partie ?? [] as p, k (p.nom)}
          <div class="bande-fr" data-partie-fr={PARTIES[k]}>
            <p><Texte txt={p.fr} /></p>
            {#if p.debut?.ar}
              <!-- mots arabes de repère : le début et la fin de la partie, chacun sur sa ligne -->
              <span class="ar centre" lang="ar" dir="rtl">{p.debut.ar}</span>
              {#if p.fin?.ar && p.fin.ar !== p.debut.ar}<span class="ar centre" lang="ar" dir="rtl"
                  >{p.fin.ar}</span
                >{/if}
            {/if}
          </div>
        {/each}
        {#if fatiha.partie_source}
          <details class="plus">
            <summary>{t('priere.sources')}<Picto nom="chevron-b" /></summary>
            <ul class="sources"><li>{fatiha.partie_source}</li></ul>
          </details>
        {/if}
        {#if so.numerotation}<small data-testid="priere-numerotation">{so.numerotation}</small>{/if}
      </section>
    {/if}

    {#if so.note_priere}
      <div class="note-priere" data-testid="priere-note-priere">
        <p><Texte txt={so.note_priere.fr} /></p>
        {#if so.note_priere.sources?.length}
          <details class="plus">
            <summary>{t('priere.sources')}<Picto nom="chevron-b" /></summary>
            <ul class="sources">
              {#each so.note_priere.sources as x, k (k)}<li>{x}</li>{/each}
            </ul>
          </details>
        {/if}
      </div>
    {/if}

    <div class="barre-outils">
      <h2>{t('priere.touchez_mot')}</h2>
      <button
        type="button"
        class="puce"
        aria-pressed={progres.trad}
        data-testid="priere-trad"
        onclick={basculerTrad}
        ><Picto nom={progres.trad ? 'oeil-barre' : 'oeil'} />{t(
          progres.trad ? 'priere.cacher_trad' : 'priere.voir_trad',
        )}</button
      >
    </div>
    {#if absent}<p class="note" role="status">{t('priere.recitation_absente')}</p>{/if}

    <div class="versets">
      {#if so.basmala_de_tete && numero !== 1}
        <div class="note-priere" data-testid="priere-basmala-tete">
          <span class="coran centre" lang="ar" dir="rtl">{so.basmala_de_tete.ar}</span>
          {#if so.basmala_de_tete.note}<p class="petit">{so.basmala_de_tete.note}</p>{/if}
        </div>
      {/if}
      {#each so.versets as v, k (v.ref)}
        {@const pk = fatiha ? partieDe(v.ref) : -1}
        <article
          class="v {pk >= 0 ? PARTIES[pk] : ''}"
          class:actif={actif === k}
          id="v{k}"
          data-ref={v.ref}
          data-recite={v.recite_dans_la_priere_obligatoire === false ? 'non' : 'oui'}
        >
          <div class="entete">
            <span class="numero"
              ><svg aria-hidden="true"><use href="#pr-etoile8-trait" /></svg><b
                >{v.ref.split(':')[1]}</b
              ></span
            >
            <span class="partie">{pk >= 0 ? nomPartie(k) : ''}</span>
            <button
              type="button"
              class="rond petit clair"
              data-testid="priere-ecouter-verset"
              aria-label={t('priere.ecouter_verset', { n: v.ref.split(':')[1] })}
              onclick={() => ecouter(k)}
              ><Picto nom={lecture && actif === k && !tout ? 'pause' : 'ecouter'} /></button
            >
          </div>
          <span class="coran" lang="ar" dir="rtl"
            >{#each v.mot_a_mot as m, i (i)}<button
                type="button"
                class="mot"
                class:choisi={choisi?.k === k && choisi?.i === i}
                data-i={i}
                aria-label={m.ar + ' : ' + m.fr}
                onclick={(e) => ouvrir(k, i, e.currentTarget)}>{m.ar}</button
              >{' '}{/each}</span
          >
          <p class="trad"><Texte txt={v.sens} /></p>
          {#if reponse(v.ref)}
            <p class="reponse"><Picto nom="balance" /><span>{reponse(v.ref)}</span></p>
          {/if}
          {#if v.recite_dans_la_priere_obligatoire === false}
            <p class="note-verset" data-testid="priere-non-recitee">
              {t('priere.basmala_non_recitee')}
            </p>
          {/if}
          {#if v.note}<p class="note-verset">{v.note}</p>{/if}
        </article>
      {/each}
    </div>

    <section class="carte sens-general">
      {#if so.sens_general}
        <h2>{t('priere.sens_general')}</h2>
        <p><Texte txt={so.sens_general} /></p>
      {/if}
      {#if so.apport_pour_la_priere}
        <h2 style="margin-top:14px">{t('priere.apport')}</h2>
        <p><Texte txt={so.apport_pour_la_priere} /></p>
      {/if}
      {#if so.tafsir?.length}
        <details class="plus">
          <summary>{t('priere.tafsir')}<Picto nom="chevron-b" /></summary>
          {#each so.tafsir as x, k (k)}
            <h3 style="font-size:16px;margin-top:10px">{x.point}</h3>
            <p><Texte txt={x.explication} /></p>
          {/each}
        </details>
      {/if}
      {#if so.note_revelation}
        <p class="note petit" data-testid="priere-note-revelation">
          <Picto nom="info" /><span><Texte txt={so.note_revelation} /></span>
        </p>
      {/if}
      {#if so.traduction}
        <p class="source" style="margin-top:12px">
          <Picto nom="lectures" /><span>{so.traduction}</span>
        </p>
      {/if}
      {#if so.sources?.length}
        <details class="plus">
          <summary>{t('priere.sources')}<Picto nom="chevron-b" /></summary>
          <ul class="sources">
            {#each so.sources as x, k (k)}<li>{x}</li>{/each}
          </ul>
        </details>
      {/if}
    </section>

    <!-- le voile ferme la feuille comme la touche Échap (clavier : svelte:window) -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="voile-feuille" class:ouvert={!!choisi} onclick={fermer}></div>
    <div
      class="feuille"
      class:ouverte={!!choisi}
      role="dialog"
      aria-modal="true"
      aria-labelledby="f-glose"
      data-testid="priere-feuille"
    >
      {#if mot && choisi}
        <span class="ar" lang="ar" dir="rtl">{mot.ar}</span>
        <p class="glose" id="f-glose">{mot.fr}</p>
        <p class="ou">
          {t('priere.verset_n', { n: so.versets[choisi.k]?.ref.split(':')[1] })}{fatiha &&
          nomPartie(choisi.k)
            ? ` · ${nomPartie(choisi.k)}`
            : ''}
        </p>
        <button
          type="button"
          class="btn bloc"
          bind:this={feuilleBtn}
          onclick={() => {
            const k = choisi!.k;
            fermer();
            void ecouter(k);
          }}><Picto nom="ecouter" />{t('priere.ecouter_le_verset')}</button
        >
      {/if}
    </div>
  {:else}
    <p class="muted" aria-busy="true">…</p>
  {/if}
</div>
<!-- eslint-enable svelte/no-useless-mustaches -->
