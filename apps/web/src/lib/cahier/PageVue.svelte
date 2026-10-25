<script lang="ts">
  import { onDestroy } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import type { LevelAudio } from '$lib/lecons-audio';
  import { t } from '$lib/i18n';
  import type { OuvrirCahierOptions } from '$lib/video/lecteur-cahier';
  import type { MinuteResultat, ProgresCahier } from './progres';
  import {
    elementsDeLaPage,
    estAtelier,
    estPaire,
    ligneTexte,
    type AtelierMot,
    type Bloc,
    type Cahier,
    type El,
    type Page,
    type Rang,
  } from './donnees';
  import { arreterSon, idSynthese, jouerElement, lectureGuidee, reciter, type Pas } from './audio';
  import { SANS_VIDEO, motsDuBilan, resultatBilan } from './outils';
  import Atelier from './Atelier.svelte';
  import Mesure from './Mesure.svelte';

  /**
   * Cahier de lecture (20/10/2026) — une page : en-tête et consigne (6 cases mémorisées : 3 lectures avec le modèle,
   * 3 seul), blocs rendus avec la charte du prototype validé, chaque case et chaque mot se touche pour l'entendre ;
   * lecture guidée (la case s'allume au rythme de la voix) ; minutes de lecture ; bilans à froid avec renvoi aux
   * pages de rattrapage ; atelier « je compose le mot » ; pont vers le Coran en récitation stockée.
   */
  let {
    page,
    cahier,
    audio,
    profil,
    progres,
    sauver,
    base,
    avenir = false,
    ouvrirVideo = null,
  }: {
    page: Page;
    cahier: Cahier;
    audio: LevelAudio | null;
    profil: string | null;
    progres: ProgresCahier;
    sauver: (p: ProgresCahier) => void;
    base: string;
    avenir?: boolean;
    /** ouvre la vidéo de la page (fourni par la route quand `video_v2` est ouvert) */
    ouvrirVideo?: ((o: OuvrirCahierOptions) => Promise<void>) | null;
  } = $props();

  const bilan = $derived(page.type === 'bilan');
  const coran = $derived(page.type === 'coran' || page.type === 'reconnaissance');
  const elements = $derived(elementsDeLaPage(page));
  /** éléments de synthèse sans fichier (le cahier le dit) ; la récitation n'en fait jamais partie */
  const sansAudio = $derived(
    audio ? elements.filter((x) => x.el.a !== 'q' && !idSynthese(x.el, audio)).length : 0,
  );
  const cases = $derived(
    progres.pages[page.id]?.cases ?? [false, false, false, false, false, false],
  );

  // ---------------------------------------------------------------- son et lecture guidée
  let actif = $state<string | null>(null);
  let guide = $state<AbortController | null>(null);
  let message = $state('');
  let indispo = $state(false);

  function voir(cle: string) {
    const e = document.querySelector(`[data-k="${CSS.escape(cle)}"]`);
    const doux = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    e?.scrollIntoView({ block: 'center', behavior: doux ? 'smooth' : 'auto' });
  }
  async function ecouter(cle: string, e: El) {
    if (bilan && !bilanFini) return marquer(cle);
    if (guide) arreter();
    indispo = false;
    actif = cle;
    try {
      await jouerElement(e, audio, profil);
    } catch {
      if (e.a === 'q') indispo = true;
    } finally {
      if (actif === cle && !guide) actif = null;
    }
  }
  async function lireAvecModele() {
    arreter();
    const ctrl = new AbortController();
    guide = ctrl;
    message = '';
    indispo = false;
    const pas: Pas[] = elements.map(({ cle, el }) => ({
      cle,
      jouer: (s) =>
        jouerElement(el, audio, profil, s).catch((err) => {
          if (el.a === 'q' && !s.aborted) indispo = true;
          throw err;
        }),
    }));
    const fini = await lectureGuidee(pas, {
      signal: ctrl.signal,
      surPas: (i) => {
        actif = i >= 0 ? pas[i]!.cle : null;
        if (i >= 0) voir(pas[i]!.cle);
      },
    });
    if (guide === ctrl) guide = null;
    actif = null;
    if (fini && page.cases === 6) {
      cocherSuivante(0);
      message = t('cahier.lecture_finie');
    }
  }
  function arreter() {
    guide?.abort();
    guide = null;
    actif = null;
    arreterSon();
  }
  onDestroy(arreter);

  // ---------------------------------------------------------------- vidéo vivante de la page (25/10/2026)
  /**
   * « Regarder la vidéo » : derrière `cahier_lecture` (la page est ouverte) ET `video_v2` (la route fournit
   * `ouvrirVideo` seulement alors), sur les pages qui ont des
   * éléments à lire (ni bilan à froid, ni minute, ni guide). Le lecteur et son générateur sont chargés au premier appui.
   */
  const voirVideo = $derived(
    !!ouvrirVideo && !SANS_VIDEO.includes(page.type) && elements.length > 0,
  );
  let videoCharge = $state(false);
  let videoEchec = $state(false);
  async function regarder() {
    if (videoCharge) return;
    arreter();
    videoCharge = true;
    videoEchec = false;
    try {
      await ouvrirVideo?.({
        page,
        audio,
        profileId: profil,
        recite: (ref, p, signal, surAudio) => reciter(ref, p, signal, surAudio),
        arreter: arreterSon,
      });
    } catch {
      videoEchec = true;
    } finally {
      videoCharge = false;
    }
  }

  // ---------------------------------------------------------------- 6 cases mémorisées
  function ecrireCases(c: boolean[]) {
    sauver({
      ...progres,
      pages: { ...progres.pages, [page.id]: { cases: c, vu: new Date().toISOString() } },
    });
  }
  function basculer(i: number) {
    const c = [...cases];
    c[i] = !c[i];
    ecrireCases(c);
  }
  /** groupe 0 : avec le modèle (cases 1 à 3) ; groupe 1 : seul (cases 4 à 6) */
  function cocherSuivante(groupe: 0 | 1) {
    const c = [...cases];
    const i = [0, 1, 2].map((x) => x + groupe * 3).find((x) => !c[x]);
    if (i === undefined) return;
    c[i] = true;
    ecrireCases(c);
  }

  // ---------------------------------------------------------------- bilan à froid
  const mots = $derived(bilan ? motsDuBilan(page) : []);
  /** clé d'affichage → rang du mot dans le bilan */
  const rangMot = $derived.by(() => {
    const m: Record<string, number> = {};
    let k = 0;
    page.blocs.forEach((b, bi) => {
      if (b.type === 'mots') b.el.forEach((_, i) => (m[`${bi}.${i}`] = k++));
    });
    return m;
  });
  let manques = $state<number[]>([]);
  let bilanFini = $state(false);
  const dernier = $derived(progres.bilans[page.id]?.at(-1) ?? null);
  const resultat = $derived(bilan ? resultatBilan(mots, manques, page.critere?.seuil) : null);
  function marquer(cle: string) {
    const i = rangMot[cle];
    if (i === undefined) return;
    manques = manques.includes(i) ? manques.filter((x) => x !== i) : [...manques, i];
  }
  function finirBilan() {
    if (!resultat) return;
    bilanFini = true;
    sauver({
      ...progres,
      bilans: {
        ...progres.bilans,
        [page.id]: [
          ...(progres.bilans[page.id] ?? []),
          {
            date: new Date().toISOString(),
            justes: resultat.justes,
            total: resultat.total,
            reussi: resultat.reussi,
            manques: [...manques].sort((a, b) => a - b),
          },
        ].slice(-10),
      },
    });
  }
  function refaireBilan() {
    manques = [];
    bilanFini = false;
  }
  const titreDe = (id: string) => cahier.pages.find((p) => p.id === id)?.titre ?? id;

  // ---------------------------------------------------------------- minutes et lecture chronométrée
  function enregistrer(r: MinuteResultat) {
    sauver({
      ...progres,
      minutes: {
        ...progres.minutes,
        [page.id]: [...(progres.minutes[page.id] ?? []), r].slice(-20),
      },
    });
  }
  const elementsMinute = $derived(
    page.blocs.reduce((n, b) => n + (b.type === 'atelier_mot' ? 0 : b.el.length), 0),
  );
  /** minute de texte (page sans blocs) : les lectures chronométrées des textes suivis */
  const mesuresTextes = $derived(
    cahier.pages
      .filter((p) => p.type === 'texte')
      .flatMap((p) => (progres.minutes[p.id] ?? []).map((m) => ({ ...m, p })))
      .sort((a, b) => a.date.localeCompare(b.date)),
  );

  // ---------------------------------------------------------------- atelier
  let atelierOuvert = $state(false);
  /** mots de l'atelier de chaque bloc (tableau stable : la progression enregistrée ne remet pas l'atelier à zéro) */
  const ateliers = $derived(
    page.blocs.map((b) => (b.type === 'atelier_mot' ? b.el.filter(estAtelier) : [])),
  );
  function atelierReussi() {
    sauver({
      ...progres,
      atelier: { ...progres.atelier, [page.id]: (progres.atelier[page.id] ?? 0) + 1 },
    });
  }

  // ---------------------------------------------------------------- navigation
  const voisines = $derived.by(() => {
    const l = cahier.pages.filter((p) => !!p.hors === !!page.hors);
    const i = l.findIndex((p) => p.id === page.id);
    return { avant: l[i - 1] ?? null, apres: l[i + 1] ?? null };
  });

  /** texte arabe découpé selon sa mise en couleur (le texte n'est jamais modifié) */
  function morceaux(e: El): Array<{ t: string; c: string }> {
    if (!e.c?.length) return [{ t: e.ar, c: '' }];
    const out: Array<{ t: string; c: string }> = [];
    let pos = 0;
    for (const [d, l, c] of [...e.c].sort((a, b) => a[0] - b[0])) {
      if (d > pos) out.push({ t: e.ar.slice(pos, d), c: '' });
      out.push({ t: e.ar.slice(d, d + l), c });
      pos = d + l;
    }
    if (pos < e.ar.length) out.push({ t: e.ar.slice(pos), c: '' });
    return out;
  }
  /** virgule arabe (U+060C) entre les mots manqués */
  const SEP_AR = String.fromCharCode(0x60c) + ' ';
  const classeBloc = (b: Bloc) =>
    b.type === 'mots' && b.el.length > 12
      ? 'mots serres'
      : b.type === 'cellules3'
        ? 'cellules trois'
        : b.type;
</script>

<!-- arabe tel qu'écrit, découpé seulement pour la couleur ; texte coranique (muṣḥaf) rendu brut dans quran-text -->
{#snippet arabe(e: El)}{#if e.a === 'q'}<span class="ar quran-text" lang="ar" dir="rtl"
      >{#each morceaux(e) as m, i (i)}{#if m.c}<span class="c-{m.c}">{m.t}</span
          >{:else}{m.t}{/if}{/each}</span
    >{:else}<span class="ar" lang="ar" dir="rtl"
      >{#each morceaux(e) as m, i (i)}{#if m.c}<span class="c-{m.c}"
            ><Bidi text={m.t} base="ar" /></span
          >{:else}<Bidi text={m.t} base="ar" />{/if}{/each}</span
    >{/if}{/snippet}

{#snippet element(cle: string, e: El, cls = 'el')}
  <button
    type="button"
    class={cls}
    class:actif={actif === cle}
    class:rate={bilan && rangMot[cle] !== undefined && manques.includes(rangMot[cle]!)}
    class:q={e.a === 'q'}
    data-k={cle}
    aria-pressed={bilan && rangMot[cle] !== undefined && !bilanFini
      ? manques.includes(rangMot[cle]!)
      : undefined}
    onclick={() => ecouter(cle, e)}
    >{@render arabe(e)}{#if e.d && !bilan}<span class="tag"><Bidi text={e.d} /></span
      >{/if}{#if bilan && rangMot[cle] !== undefined && manques.includes(rangMot[cle]!)}<span
        class="tag"><Bidi text={t('cahier.bilan_rate')} /></span
      >{/if}{#if e.lecon}<span class="tag"><Bidi text={e.lecon} /></span
      >{/if}{#if e.ref && e.a === 'q' && !e.sep}<span class="ref"><Bidi text={e.ref} /></span
      >{/if}</button
  >
{/snippet}

<!-- eslint-disable svelte/no-navigation-without-resolve -- chemin résolu (resolve), suivi du paramètre de page -->
<article class="page-cahier" data-page={page.id} data-type={page.type}>
  <p class="nav"><a href={base}>{t('cahier.sommaire')}</a></p>
  <header class="bandeau">
    <p class="sur">
      <span><Bidi text={page.partie} /></span>
      <span class="puce"
        ><Bidi
          text={page.n === 0 ? t('cahier.avant') : t('cahier.apres', { lecon: page.lecon ?? '' })}
        /></span
      >
    </p>
    <h1><Bidi text={page.titre} /></h1>
    <p class="numero"><Bidi text={t('cahier.page', { n: page.num })} /></p>
  </header>
  {#if avenir}<p class="avertissement">
      <Bidi text={t('cahier.avenir', { lecon: page.lecon ?? '' })} />
    </p>{/if}

  {#if page.consigne}
    <section class="consigne">
      <p><Bidi text={bilan ? t('cahier.bilan_consigne') : page.consigne} /></p>
      {#if page.cases === 6}
        <div class="cases" role="group" aria-label={page.consigne}>
          {#each [0, 1] as g (g)}
            <div class="rang">
              <span class="lib"
                ><Bidi text={g === 0 ? t('cahier.avec_modele') : t('cahier.seul')} /></span
              >
              {#each [0, 1, 2] as j (j)}
                {@const i = g * 3 + j}
                <button
                  type="button"
                  class="case"
                  class:or={g === 1}
                  aria-pressed={cases[i]}
                  aria-label={t('cahier.case', { n: i + 1 })}
                  data-case={i}
                  onclick={() => basculer(i)}
                  ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg
                  ></button
                >
              {/each}
            </div>
          {/each}
        </div>
        <div class="actions">
          {#if guide}
            <button type="button" class="bouton plein" data-testid="arreter" onclick={arreter}
              >{t('cahier.arreter')}</button
            >
          {:else}
            <button
              type="button"
              class="bouton plein"
              data-testid="lire-modele"
              onclick={lireAvecModele}
              ><Bidi text={coran ? t('cahier.coran_ecouter') : t('cahier.lire_modele')} /></button
            >
          {/if}
          <button
            type="button"
            class="bouton"
            data-testid="lu-seul"
            onclick={() => cocherSuivante(1)}>{t('cahier.lire_seul')}</button
          >
        </div>
        <p class="etat-cases">
          <Bidi text={t('cahier.lectures', { n: cases.filter(Boolean).length })} />
        </p>
        {#if message}<p class="message" role="status"><Bidi text={message} /></p>{/if}
      {/if}
    </section>
  {/if}
  {#if voirVideo}
    <p class="video-ligne">
      <button
        type="button"
        class="bouton"
        data-testid="voir-video-cahier"
        aria-busy={videoCharge}
        onclick={regarder}
        ><svg viewBox="0 0 24 24" aria-hidden="true" class="ico-video"
          ><path d="M8 5v14l11-7z" /></svg
        ><Bidi text={t('cahier.regarder')} /></button
      >
    </p>
    {#if videoEchec}<p class="avertissement" role="alert">
        <Bidi text={t('cahier.video_erreur')} />
      </p>{/if}
  {/if}
  {#if coran}<p class="note"><Bidi text={t('cahier.coran_note')} /></p>{/if}
  {#if indispo}<p class="avertissement" role="status">
      <Bidi text={t('cahier.coran_indispo')} />
    </p>{/if}
  {#if sansAudio && !bilan}<p class="note"><Bidi text={t('cahier.sans_audio')} /></p>{/if}

  {#if page.guide}
    <section class="bloc guide">
      {#each page.guide as g, i (i)}<p><Bidi text={g} /></p>{/each}
    </section>
  {/if}

  {#each page.blocs as b, bi (bi)}
    <section class="bloc" data-bloc={b.type}>
      <h2><Bidi text={b.titre} /></h2>
      {#if b.type === 'grille'}
        <div class="grille">
          {#each b.el as r, ri (ri)}
            {@const rang = r as Rang}
            <div class="lib"><b><Bidi text={ri + 1} /></b><Bidi text={rang.titre ?? ''} /></div>
            <div class="cellules-grille">
              {#if rang.el.length}
                {#each rang.el as e, ci (ci)}{@render element(
                    `${bi}.${ri}.${ci}`,
                    e,
                    'el cel',
                  )}{/each}
              {:else}
                <p class="vide"><Bidi text={rang.note ?? ''} /></p>
              {/if}
            </div>
            {#if rang.note && rang.el.length}<p class="noterang"><Bidi text={rang.note} /></p>{/if}
          {/each}
        </div>
      {:else if b.type === 'table' || b.type === 'formes'}
        <div class="table" class:formes={b.type === 'formes'}>
          {#each b.el as r, ri (ri)}
            {@const rang = r as Rang}
            <div class="ligne-table">
              <span class="let" lang="ar" dir="rtl"><Bidi text={rang.lettre} base="ar" /></span>
              {#each rang.el as e, ci (ci)}{@render element(
                  `${bi}.${ri}.${ci}`,
                  e,
                  'el cel',
                )}{/each}
            </div>
          {/each}
        </div>
      {:else if b.type === 'paires'}
        <div class="paires">
          {#each b.el as x, i (i)}
            {#if estPaire(x)}
              <div class="paire">
                {@render element(`${bi}.${i}.0`, x.p[0])}<span class="barre" aria-hidden="true"
                  >/</span
                >{@render element(`${bi}.${i}.1`, x.p[1])}
              </div>
            {/if}
          {/each}
        </div>
      {:else if b.type === 'lier'}
        <div class="lier">
          {#each b.el as x, i (i)}
            {@const e = x as El}
            <div class="l">
              <span class="sep" dir="rtl"
                >{#each e.sep ?? [] as s, j (j)}{@render element(
                    `${bi}.${i}.s${j}`,
                    { ar: s, a: 's' },
                    'el syl',
                  )}{/each}</span
              >
              <span class="fl" aria-hidden="true">←</span>
              {@render element(`${bi}.${i}`, e, 'el tout')}
            </div>
          {/each}
        </div>
      {:else if b.type === 'atelier_mot'}
        {#if atelierOuvert}
          <Atelier
            mots={ateliers[bi] as AtelierMot[]}
            consigne={b.consigne ?? ''}
            {audio}
            {profil}
            onreussi={atelierReussi}
          />
          <button type="button" class="bouton" onclick={() => (atelierOuvert = false)}
            >{t('cahier.atelier_fermer')}</button
          >
        {:else}
          <button
            type="button"
            class="bouton"
            data-testid="atelier-ouvrir"
            onclick={() => (atelierOuvert = true)}>{t('cahier.atelier_ouvrir')}</button
          >
        {/if}
      {:else if b.type === 'sourate'}
        <div class="sourate">
          {#if b.basmala}<p class="basmala">
              {@render element(`${bi}.b`, { ar: b.basmala, a: 'q', ref: '1:1' }, 'el verset')}
            </p>{/if}
          {#each b.el as x, i (i)}{@render element(`${bi}.${i}`, x as El, 'el verset')}{/each}
        </div>
      {:else if b.type === 'groupes' || b.type === 'phrases'}
        <div class={b.type}>
          {#each b.el as x, i (i)}{@render element(`${bi}.${i}`, x as El)}{/each}
        </div>
      {:else}
        <div class={classeBloc(b)} class:mushaf={b.type === 'mots_mushaf'}>
          {#each b.el as x, i (i)}{@render element(`${bi}.${i}`, x as El)}{/each}
        </div>
      {/if}
      {#if b.note}<p class="note"><Bidi text={b.note} /></p>{/if}
    </section>
  {/each}

  {#if page.texte}
    <section class="bloc">
      <div class="texte" class:serre={bilan}>
        {#if page.texte.titre}
          {@render element('t.t', { ar: page.texte.titre, a: page.texte.a }, 'el titre-texte')}
        {/if}
        {#each page.texte.lignes as _, i (i)}{@render element(
            `t.${i}`,
            ligneTexte(page.texte, i),
            'el ligne',
          )}{/each}
      </div>
      {#if !bilan}
        <Mesure
          mode="chrono"
          total={page.texte.nb}
          seuil={null}
          historique={progres.minutes[page.id] ?? []}
          onenregistrer={enregistrer}
        />
      {/if}
    </section>
  {/if}

  {#if bilan && resultat}
    <section class="bloc resultat" data-testid="bilan">
      {#if !bilanFini}
        {#if dernier}<p class="note">
            <Bidi
              text={t('cahier.bilan_dernier', { justes: dernier.justes, total: dernier.total })}
            />
          </p>{/if}
        <button type="button" class="bouton plein" data-testid="bilan-fini" onclick={finirBilan}
          >{t('cahier.bilan_fini')}</button
        >
      {:else}
        <p class="score" class:reussi={resultat.reussi} data-testid="bilan-resultat">
          <Bidi
            text={t('cahier.bilan_resultat', { justes: resultat.justes, total: resultat.total })}
          />
        </p>
        <p><Bidi text={resultat.reussi ? t('cahier.bilan_reussi') : t('cahier.bilan_echec')} /></p>
        {#if resultat.rattrapages.length}
          <ul class="rattrapages">
            {#each resultat.rattrapages as r (r.page)}
              <li>
                <a class="bouton" href={`${base}?p=${r.page}`} data-rattrapage={r.page}
                  ><Bidi
                    text={t('cahier.bilan_rattrapage', {
                      difficulte: r.difficulte || titreDe(r.page),
                    })}
                  /></a
                >
                <span class="ar" lang="ar" dir="rtl"
                  ><Bidi text={r.mots.join(SEP_AR)} base="ar" /></span
                >
              </li>
            {/each}
          </ul>
        {/if}
        <p class="note"><Bidi text={t('cahier.bilan_ecouter')} /></p>
        <button type="button" class="bouton" onclick={refaireBilan}
          >{t('cahier.bilan_refaire')}</button
        >
      {/if}
      {#if page.texte}
        <p class="note"><Bidi text={t('cahier.bilan_texte')} /></p>
        <Mesure
          mode="chrono"
          total={page.texte.nb}
          seuil={null}
          historique={progres.minutes[page.id] ?? []}
          onenregistrer={enregistrer}
        />
      {/if}
    </section>
  {/if}

  {#if page.type === 'minute'}
    <section class="bloc">
      {#if page.renvoi}<p class="note"><Bidi text={page.renvoi} /></p>{/if}
      {#if page.blocs.length}
        <Mesure
          mode="minute"
          total={elementsMinute}
          seuil={page.seuil ?? null}
          historique={progres.minutes[page.id] ?? []}
          onenregistrer={enregistrer}
        />
      {:else}
        <Mesure
          mode="lecture"
          total={0}
          seuil={page.seuil ?? null}
          historique={mesuresTextes}
          onenregistrer={enregistrer}
        />
      {/if}
    </section>
  {/if}

  {#if page.critere && !bilan}<p class="note"><Bidi text={page.critere.reussite} /></p>{/if}
  {#each page.notes ?? [] as n, i (i)}<p class="note"><Bidi text={n} /></p>{/each}

  <nav class="voisines">
    {#if voisines.avant}<a class="bouton" href={`${base}?p=${voisines.avant.id}`} rel="prev"
        >{t('cahier.precedente')}</a
      >{/if}
    {#if voisines.apres}<a class="bouton plein" href={`${base}?p=${voisines.apres.id}`} rel="next"
        >{t('cahier.suivante')}</a
      >{/if}
  </nav>
</article>

<style>
  .page-cahier {
    padding-bottom: 2rem;
  }
  .nav {
    margin: 0 0 0.5rem;
  }
  .nav a {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    font-weight: 700;
  }
  .bandeau {
    position: relative;
    overflow: hidden;
    background: linear-gradient(160deg, var(--bande-1), var(--bande-2));
    color: var(--bande-texte);
    border-radius: var(--radius-lg, 20px);
    padding: 1rem 1.25rem 0.9rem;
  }
  .bandeau::before {
    content: '';
    position: absolute;
    right: -60px;
    top: -60px;
    width: 130px;
    height: 130px;
    border-radius: 50%;
    border: 2px solid var(--gold);
    opacity: 0.8;
  }
  .bandeau::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: var(--motif-etoile);
    pointer-events: none;
  }
  .sur {
    position: relative;
    z-index: 1;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.4rem;
    margin: 0;
    font: 600 0.72rem/1.3 var(--font-title);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .puce {
    background: var(--gold);
    color: var(--sur-or);
    border-radius: 999px;
    padding: 0.2rem 0.6rem;
    letter-spacing: 0.03em;
    text-transform: none;
    font-family: var(--font-ui);
    font-weight: 700;
  }
  h1 {
    position: relative;
    z-index: 1;
    margin: 0.5rem 0 0;
    font: 600 1.3rem/1.3 var(--font-title);
    color: inherit;
  }
  .numero {
    position: relative;
    z-index: 1;
    margin: 0.35rem 0 0;
    font-size: 0.85rem;
  }
  .consigne {
    margin: 0.8rem 0 0;
    padding: 0.8rem 1rem;
    background: var(--cah-carte);
    border: 1px solid var(--line);
    border-radius: var(--radius-md, 14px);
  }
  .consigne > p {
    margin: 0 0 0.5rem;
    color: var(--ink2);
  }
  .cases {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .cases .rang {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .cases .lib {
    min-width: 7.5rem;
    font: 700 0.78rem/1.2 var(--font-ui);
    color: var(--ink2);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .case {
    width: 2.75rem;
    height: 2.75rem;
    display: grid;
    place-items: center;
    border: 2px solid var(--primary);
    border-radius: 9px;
    background: var(--cah-papier);
    cursor: pointer;
    padding: 0;
  }
  .case.or {
    border-color: var(--cah-or);
  }
  .case svg {
    width: 1.4rem;
    height: 1.4rem;
    fill: none;
    stroke: transparent;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .case[aria-pressed='true'] {
    background: var(--primary);
    border-color: var(--primary);
  }
  .case[aria-pressed='true'] svg {
    stroke: var(--on-primary);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.7rem;
  }
  .etat-cases,
  .message {
    margin: 0.5rem 0 0;
    font-size: 0.85rem;
    color: var(--ink2);
  }
  .bouton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 2.75rem;
    padding: 0.4rem 1.1rem;
    border-radius: 999px;
    border: 1.5px solid var(--primary);
    background: transparent;
    color: var(--primary);
    font-weight: 700;
    text-decoration: none;
    cursor: pointer;
  }
  .video-ligne {
    margin: 0.5rem 0;
  }
  .ico-video {
    width: 1.1rem;
    height: 1.1rem;
    fill: currentColor;
  }
  .bouton.plein {
    background: var(--primary);
    color: var(--on-primary);
  }
  .bloc {
    margin: 1rem 0 0;
  }
  .bloc h2 {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font: 600 1rem/1.3 var(--font-title);
    color: var(--navy, var(--ink));
    margin: 0 0 0.6rem;
  }
  .bloc h2::after {
    content: '';
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, var(--cah-or), transparent);
  }
  .note {
    font-size: 0.85rem;
    color: var(--ink2);
    line-height: 1.6;
  }
  .avertissement {
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius-md, 14px);
    background: var(--warn-bg);
    color: var(--warn-ink);
  }
  .guide p {
    margin: 0 0 0.7rem;
  }
  /* éléments lus : chaque case et chaque mot se touche */
  .el {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 3rem;
    min-width: 2.75rem;
    padding: 0.2rem 0.45rem;
    background: var(--cah-carte);
    border: 1.5px solid var(--line);
    border-radius: 12px;
    color: var(--ink);
    cursor: pointer;
    font: inherit;
    transition:
      background var(--motion-fast, 120ms),
      border-color var(--motion-fast, 120ms);
  }
  .el .ar {
    font-family: var(--font-ar);
    font-size: 1.75rem;
    line-height: 1.7;
    unicode-bidi: isolate;
  }
  .el .tag {
    font: 700 0.7rem/1.2 var(--font-ui);
    color: var(--or-ink, var(--ink2));
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .el .ref {
    font: 700 0.72rem var(--font-ui);
    color: var(--or-ink, var(--ink2));
    direction: ltr;
  }
  .el.actif {
    border-color: var(--gold);
    background: var(--or-soft);
    box-shadow: 0 0 0 3px var(--gold);
  }
  .el.rate {
    border-color: var(--bad-ink);
    background: var(--bad-bg);
  }
  .el:focus-visible,
  .case:focus-visible,
  .bouton:focus-visible {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }
  .c-cible {
    color: var(--cah-cible);
  }
  .c-muet {
    color: var(--cah-muet);
  }
  .q .ar,
  .mushaf .el .ar,
  .verset .ar {
    font-family: var(--font-quran);
  }
  /* grille de 15 cases */
  .grille {
    display: grid;
    grid-template-columns: 5.6rem 1fr;
    gap: 0.5rem;
  }
  .grille .lib {
    display: flex;
    flex-direction: column;
    justify-content: center;
    font: 700 0.72rem/1.25 var(--font-ui);
    color: var(--ink2);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding-right: 0.3rem;
    border-right: 3px solid var(--cah-or);
  }
  .grille .lib b {
    font: 600 1.2rem/1 var(--font-title);
    color: var(--or-ink, var(--ink));
    margin-bottom: 0.2rem;
  }
  .cellules-grille {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.4rem;
    direction: rtl;
  }
  .cel {
    min-height: 4.2rem;
    border-radius: 14px;
  }
  .cel .ar {
    font-size: 2.3rem;
    line-height: 1.4;
  }
  .grille .vide {
    grid-column: 1 / -1;
    margin: 0;
    padding: 0.4rem;
    border: 1.5px dashed var(--line);
    border-radius: 12px;
    font-size: 0.8rem;
    color: var(--ink2);
    direction: ltr;
  }
  .noterang {
    grid-column: 2;
    margin: -0.2rem 0 0.2rem;
    font-size: 0.78rem;
    color: var(--ink2);
  }
  /* tableaux */
  .table {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .ligne-table {
    display: grid;
    grid-template-columns: 2.6rem repeat(3, 1fr);
    gap: 0.3rem;
    direction: rtl;
  }
  .formes .ligne-table {
    grid-template-columns: 2.6rem repeat(4, 1fr);
  }
  .let {
    display: grid;
    place-items: center;
    background: var(--primary);
    color: var(--on-primary);
    border-radius: 9px;
    font: 700 1.3rem var(--font-ar);
  }
  .table .cel {
    min-height: 3rem;
  }
  .table .cel .ar {
    font-size: 1.6rem;
  }
  /* listes de mots et de syllabes */
  .mots,
  .ligne_mots,
  .cellules,
  .alphabet,
  .mots_mushaf {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
    gap: 0.45rem;
    direction: rtl;
  }
  .serres {
    grid-template-columns: repeat(auto-fill, minmax(5.6rem, 1fr));
  }
  .serres .el .ar {
    font-size: 1.5rem;
  }
  .cellules,
  .alphabet {
    grid-template-columns: repeat(auto-fill, minmax(3.6rem, 1fr));
  }
  .trois {
    grid-template-columns: repeat(3, 1fr);
  }
  .groupes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    direction: rtl;
  }
  .phrases {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .phrases .el,
  .texte .ligne {
    align-items: flex-end;
    width: 100%;
    text-align: right;
    border-right: 3px solid var(--cah-or);
  }
  .paires {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .paire {
    display: flex;
    align-items: center;
    justify-content: space-around;
    gap: 0.4rem;
    direction: rtl;
    padding: 0.2rem;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--cah-papier);
  }
  .barre {
    color: var(--cah-or);
    font-weight: 700;
  }
  .lier {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .l {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem;
    direction: rtl;
  }
  .l .sep {
    display: inline-flex;
    gap: 0.25rem;
  }
  .syl .ar {
    font-size: 1.4rem;
  }
  .fl {
    color: var(--cah-or);
    font-size: 1.2rem;
  }
  .tout .ar {
    font-size: 2rem;
  }
  .texte {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.8rem;
    background: var(--cah-carte);
    border: 1px solid var(--line);
    border-radius: 18px;
  }
  .texte .el {
    border-color: transparent;
    border-right-color: var(--cah-or);
  }
  .titre-texte {
    align-self: center;
  }
  .titre-texte .ar {
    font-weight: 700;
    color: var(--navy, var(--ink));
  }
  .serre .el .ar {
    font-size: 1.5rem;
  }
  .sourate {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .sourate .verset {
    align-items: flex-end;
    width: 100%;
  }
  .basmala {
    margin: 0;
    text-align: center;
  }
  .basmala .verset {
    align-items: center;
  }
  .resultat .score {
    font: 700 1.3rem var(--font-title);
    color: var(--warn-ink);
  }
  .resultat .score.reussi {
    color: var(--ok-ink);
  }
  .rattrapages {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .rattrapages .ar {
    display: block;
    font-family: var(--font-ar);
    font-size: 1.3rem;
    margin-top: 0.2rem;
  }
  .voisines {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    margin-top: 1.5rem;
  }
</style>
