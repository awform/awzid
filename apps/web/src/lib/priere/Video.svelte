<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onDestroy, onMount, untrack } from 'svelte';
  import { t } from '$lib/i18n';
  import { mots as motsDe } from './calendrier';
  import { refsAyyub, sourceAudio, type Voix } from './audio';
  import {
    chargerSection,
    chargerSourate,
    etapesDe,
    trouver,
    type Element,
    type Plan,
    type Progres,
    type Section,
    type Sourate,
  } from './donnees';
  import { attendre } from './mouvement';
  import Picto from './Picto.svelte';
  import SilhouetteVue from './SilhouetteVue.svelte';
  import Texte from './Texte.svelte';
  import type { Genre, NomPose } from './silhouette';

  /**
   * Écran 3 — « Vidéo vivante de la prière » : les deux unités du ṣubḥ enchaînées. La silhouette bouge (1,3 s, puis 650 ms
   * de calme), la voix suit (takbīr pendant le mouvement, puis la formule de la position ; le Coran est récité par
   * Ayyūb, verset par verset), le texte s'éclaire au mot entendu, la frise compte les temps, le compteur dit l'unité.
   * L'enchaînement est dans `animation.json` ; tous les textes viennent du livre. Mouvement réduit : les positions
   * changent sans interpolation, la vidéo enchaîne toujours les étapes et la voix.
   */
  let {
    plan,
    progres,
    voix,
    changerGenre,
    vu,
    auto = false,
  }: {
    plan: Plan;
    progres: Progres;
    voix: Voix;
    changerGenre: (g: Genre) => void;
    vu: (id: string) => void;
    /** démarre à l'arrivée (toucher sur « Vidéo vivante ») */
    auto?: boolean;
  } = $props();

  type Contenu =
    | { type: 'parole'; ar: string; sens?: string; mots: string[]; actif: number }
    | { type: 'coran'; ar: string; sens?: string; actif: boolean }
    | { type: 'texte'; fr: string };

  let section = $state<Section | null>(null);
  let sourates = $state<Record<number, Sourate | null>>({});
  let vi = $state(0);
  let lecture = $state(false);
  let contenu = $state<Contenu | null>(null);
  let avancee = $state(0);
  let parle = $state(false);
  let sil = $state<{ aller: (p: NomPose, ms: number) => Promise<void> } | null>(null);
  let jeton = 0;

  const beats = $derived(plan.animation.video.beats);
  const etapes = $derived(etapesDe(section, 'S5.subh'));
  const total = $derived(plan.animation.pas.rakaat);
  const beat = $derived(beats[vi]);

  /** parole par identifiant (une même parole revient à plusieurs étapes : même contenu) */
  const parole = (id: string): Element | null => trouver(section, id);
  const titreEtape = (id: string) => etapes.find((e) => e.id === id)?.titre ?? '';

  onMount(() => {
    void voix.preparer();
    void chargerSection('S5').then((s) => {
      section = s;
      afficher(0);
      // à l'arrivée par un toucher sur « Vidéo vivante » (`&lecture=1`), la vidéo démarre ; sinon elle attend un appui
      if (
        auto &&
        (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation
          ?.isActive
      )
        lancer();
    });
    for (const n of new Set(Object.values(plan.animation.video.sourates)))
      void chargerSourate(n).then((d) => (sourates = { ...sourates, [n]: d?.sourate ?? null }));
  });
  onDestroy(() => {
    jeton++;
    voix.arreter();
  });

  /** montre le contenu d'un temps sans le jouer (arrêt, précédent, suivant) */
  function afficher(j: number) {
    const b = beats[j];
    if (!b) return;
    const ps = (b.paroles ?? []).map(parole).filter((x): x is Element => !!x);
    const p = ps[ps.length - 1];
    if (b.coran) {
      const v = parole(b.coran)?.ar_versets?.[0];
      contenu = v ? { type: 'coran', ar: v.ar, sens: v.sens, actif: false } : null;
    } else if (b.sourate) {
      const s = sourates[plan.animation.video.sourates[String(b.r)] ?? 0];
      const v = s?.versets[0];
      contenu = v
        ? { type: 'coran', ar: v.ar, sens: v.sens, actif: false }
        : { type: 'texte', fr: '' };
    } else if (p?.ar)
      contenu = { type: 'parole', ar: p.ar, sens: p.sens, mots: motsDe(p.ar), actif: -1 };
    else contenu = { type: 'texte', fr: etapes.find((e) => e.id === b.etape)?.geste ?? '' };
  }

  async function direPar(p: Element, mvt?: Promise<void>, jt = jeton) {
    if (!p.ar) return;
    const src = sourceAudio(p, voix.la);
    const ar = p.ar;
    if (src.type === 'ayyub') {
      for (const ref of src.refs) {
        if (jt !== jeton) return;
        contenu = { type: 'coran', ar, sens: p.sens, actif: true };
        parle = true;
        try {
          await voix.reciter(ref);
        } catch {
          await voix.dire(ar, null);
        }
        parle = false;
      }
      return;
    }
    contenu = { type: 'parole', ar, sens: p.sens, mots: motsDe(ar), actif: -1 };
    parle = true;
    await mvt?.catch(() => undefined);
    // synthèse : fichier existant ; sinon (en préparation, basmala…) le même rythme, sans son
    await voix.dire(ar, src.type === 'tts' ? src.id : null, {
      surMot: (k) => {
        if (contenu?.type === 'parole') contenu = { ...contenu, actif: k };
      },
    });
    parle = false;
  }

  async function jouer(j: number, jt: number) {
    const b = beats[j];
    if (!b) return;
    vi = j;
    avancee = 0;
    const ok = () => jt === jeton && lecture;
    contenu = null;
    afficher(j);
    vu(b.etape);
    const mvt = sil?.aller(b.pose as NomPose, 1300) ?? Promise.resolve();
    if (b.coran) {
      await mvt;
      const p = parole(b.coran);
      const refs = refsAyyub(p?.audio);
      const vs = p?.ar_versets ?? [];
      for (const [k, r] of refs.entries()) {
        if (!ok()) return;
        const v = vs[k];
        contenu = { type: 'coran', ar: v?.ar ?? '', sens: v?.sens, actif: true };
        parle = true;
        try {
          await voix.reciter(r, { surProgres: (f) => (avancee = (k + f) / refs.length) });
        } catch {
          await attendre(2500);
        }
        parle = false;
        if (!ok()) return;
        await attendre(350);
      }
    } else if (b.sourate) {
      await mvt;
      const n = plan.animation.video.sourates[String(b.r)] ?? 0;
      const s = sourates[n] ?? (await chargerSourate(n))?.sourate;
      const vs = s?.versets ?? [];
      for (const [k, v] of vs.entries()) {
        if (!ok()) return;
        contenu = { type: 'coran', ar: v.ar, sens: v.sens, actif: true };
        const ref = refsAyyub(v.audio)[0];
        parle = true;
        try {
          if (ref) await voix.reciter(ref, { surProgres: (f) => (avancee = (k + f) / vs.length) });
        } catch {
          await attendre(2500);
        }
        parle = false;
        if (!ok()) return;
        await attendre(350);
      }
    } else if (b.paroles?.length || b.takbir) {
      if (b.takbir) {
        // le takbīr se dit PENDANT le mouvement
        const tk = parole('S5.w.takbir');
        if (tk) await direPar(tk, undefined, jt);
      }
      await mvt;
      const ps = (b.paroles ?? []).map(parole).filter((x): x is Element => !!x);
      for (const [k, p] of ps.entries()) {
        if (!ok()) return;
        avancee = k / Math.max(1, ps.length);
        await direPar(p, undefined, jt);
        if (!ok()) return;
        await attendre(500);
      }
    } else {
      await mvt;
      avancee = 1;
      await attendre(b.attente ?? 1500);
    }
    avancee = 1;
    if (ok()) await attendre(650);
  }

  function lancer() {
    if (lecture) return;
    lecture = true;
    const jt = ++jeton;
    void (async () => {
      await voix.preparer();
      while (jt === jeton && lecture) {
        if (vi >= beats.length) break;
        try {
          await jouer(vi, jt);
        } catch {
          break; // un temps qui échoue arrête la vidéo, jamais l'écran
        }
        if (jt === jeton && lecture) vi++;
      }
      if (jt === jeton) {
        lecture = false;
        vi = Math.min(vi, beats.length - 1);
        parle = false;
      }
    })();
  }
  function arreter() {
    lecture = false;
    jeton++;
    voix.arreter();
    parle = false;
  }
  function sauter(j: number) {
    arreter();
    vi = Math.max(0, Math.min(beats.length - 1, j));
    afficher(vi);
    void sil?.aller((beats[vi]?.pose ?? 'debout') as NomPose, 900);
  }
  // les sourates chargées après coup : le texte du temps affiché les montre
  $effect(() => {
    void sourates;
    untrack(() => {
      if (!lecture && beat?.sourate) afficher(vi);
    });
  });
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve, svelte/no-useless-mustaches -- vue de la même page (?e=pas) ; une espace entre deux mots arabes -->
<div class="e-video" data-testid="priere-video" data-beat={vi}>
  <div class="outils">
    <div class="seg" role="group" aria-label={t('priere.silhouette')}>
      {#each ['homme', 'femme'] as g (g)}
        <button
          type="button"
          aria-pressed={progres.genre === g}
          data-genre={g}
          onclick={() => changerGenre(g as Genre)}><Bidi text={t(`priere.${g}`)} /></button
        >
      {/each}
    </div>
  </div>
  <div class="ecran">
    <div class="haut-video">
      <div><b>{t('priere.video')}</b><small>{t('priere.video_sous_titre')}</small></div>
      <div class="rakaa" aria-live="polite">
        <span class="chiffre" data-testid="priere-video-unite"
          ><Bidi text={beat?.r ?? 1} /><small> / <Bidi text={total} /></small></span
        >
        <span class="points"
          >{#each Array(total) as _, k (k)}<i class:fait={k < (beat?.r ?? 1)}></i>{/each}</span
        >
      </div>
    </div>
    <div class="scene">
      <SilhouetteVue bind:this={sil} pose="debout" genre={progres.genre} {parle} />
    </div>
    <div class="sous-titre" aria-live="polite" data-testid="priere-video-texte">
      {#if beat}<div class="pos"><Bidi text={titreEtape(beat.etape)} /></div>{/if}
      {#if contenu?.type === 'coran'}
        <span class="coran quran-text" lang="ar" dir="rtl"
          ><span class="verset" class:actif={contenu.actif}>{contenu.ar}</span></span
        >
        {#if contenu.sens}<p><Bidi text={contenu.sens} /></p>{/if}
      {:else if contenu?.type === 'parole'}
        <span class="ar quran-text" lang="ar" dir="rtl"
          >{#each contenu.mots as w, k (k)}<span
              class="mot"
              class:actif={contenu.actif === k}
              class:dit={contenu.actif > k}>{w}</span
            >{' '}{/each}</span
        >
        {#if contenu.sens}<p><Bidi text={contenu.sens} /></p>{/if}
      {:else if contenu?.type === 'texte'}
        <p><Texte txt={contenu.fr} /></p>
      {/if}
    </div>
    <div class="frise" aria-hidden="true">
      {#each beats as b, k (k)}
        <i
          class:fait={k < vi}
          class:ici={k === vi}
          class:r2={k > 0 && b.r === 2 && beats[k - 1]?.r === 1}
          ><b style:width="{k === vi ? avancee * 100 : 0}%"></b></i
        >
      {/each}
    </div>
    <div class="commandes">
      <button
        type="button"
        class="rond"
        aria-label={t('priere.position_prec')}
        data-testid="priere-video-prec"
        onclick={() => sauter(vi - 1)}><Picto nom="precedent" /></button
      >
      <button
        type="button"
        class="rond or"
        aria-label={t(lecture ? 'priere.pause' : 'priere.lire')}
        data-testid="priere-video-lire"
        aria-pressed={lecture}
        onclick={() => (lecture ? arreter() : lancer())}
        ><Picto nom={lecture ? 'pause' : 'lecture'} /></button
      >
      <button
        type="button"
        class="rond"
        aria-label={t('priere.position_suiv')}
        data-testid="priere-video-suiv"
        onclick={() => sauter(vi + 1)}><Picto nom="suivant" /></button
      >
    </div>
  </div>
  <div class="sous-ecran">
    <a class="btn clair" href="?e=pas" onclick={arreter}
      ><Picto nom="retour" />{t('priere.revenir_pas')}</a
    >
  </div>
  <p class="legende-video"><Picto nom="info" /><span>{t('priere.video_legende')}</span></p>
</div>
<!-- eslint-enable svelte/no-navigation-without-resolve, svelte/no-useless-mustaches -->
