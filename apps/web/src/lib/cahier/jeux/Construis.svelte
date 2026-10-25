<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import type { LevelAudio } from '$lib/lecons-audio';
  import type { MotJeu, SigneCle, SigneJeu } from '../donnees';
  import { arreterSon, jouerElement } from '../audio';
  import '$lib/theme/signes.css';
  import { glisser } from './glisser';
  import {
    CERCLE,
    FAMILLE,
    MARQUES,
    casesASigner,
    pastilleDouble,
    voyelleDe,
    lettresJustes,
    motConstruit,
    signesJustes,
    tuilesDuMot,
    type Public,
    type Tuile,
  } from './modele';

  /**
   * « Construis le mot » (cahiers des enfants et des ados, 25/10/2026) : on fait glisser les LETTRES dans les cases, de
   * droite à gauche, puis on fait glisser le SIGNE sur chaque lettre ; ensuite on écoute le mot construit et on le compare
   * au modèle. Le signe est montré par lui-même (sur un cercle pointillé) et par son son (la syllabe de la grille qui le
   * porte) : jamais une transcription latine. Mode « sans glisser » : on touche la lettre (ou le signe), puis la case ;
   * tout est au clavier (Tab, Entrée). Enfants : on vérifie à chaque dépôt, « réessaie », aucune pénalité, grandes cibles.
   * Ados : on vérifie quand les cases sont pleines, plus rapide, les erreurs comptent pour la médaille.
   */
  let {
    mots,
    signes,
    pub,
    audio,
    profil,
    onfini,
  }: {
    mots: MotJeu[];
    signes: SigneJeu[];
    pub: Public;
    audio: LevelAudio | null;
    profil: string | null;
    onfini: (r: { total: number; premierCoup: number; erreurs: number; ms: number }) => void;
  } = $props();

  type Phase = 'lettres' | 'signes' | 'fini';
  type Selection = { t: 'l'; id: number } | { t: 's'; k: SigneCle } | null;
  const immediat = $derived(pub === 'enfant');
  const debut = Date.now();

  let i = $state(0);
  const mot = $derived(mots[i]!);
  let tuiles = $state<Tuile[]>([]);
  let places = $state<Array<Tuile | null>>([]);
  let poses = $state<Array<SigneCle | null>>([]);
  let verrou = $state<boolean[]>([]);
  let phase = $state<Phase>('lettres');
  let selection = $state<Selection>(null);
  let retour = $state<'' | 'reessaie' | 'bravo'>('');
  let faux = $state<number[]>([]);
  let erreursMot = $state(0);
  let premierCoup = $state(0);
  let erreurs = $state(0);
  let minuteurs: Array<ReturnType<typeof setTimeout>> = [];
  onDestroy(() => {
    minuteurs.forEach(clearTimeout);
    arreterSon();
  });
  const apres = (ms: number, f: () => void) => {
    const m = setTimeout(() => {
      minuteurs = minuteurs.filter((x) => x !== m);
      f();
    }, ms);
    minuteurs.push(m);
  };

  function charger() {
    tuiles = tuilesDuMot(mot);
    places = mot.c.map(() => null);
    poses = mot.c.map(() => null);
    verrou = mot.c.map(() => false);
    phase = 'lettres';
    selection = null;
    retour = '';
    faux = [];
    erreursMot = 0;
  }
  charger();

  const posees = $derived(places.map((p) => p?.l ?? null));
  /** case où va la prochaine lettre : la plus à droite qui est vide */
  const suivante = $derived(places.findIndex((p) => !p));
  const aSigner = $derived(casesASigner(mot));

  const son = (ar: string | undefined, a: 's' | 't') =>
    ar ? jouerElement({ ar, a }, audio, profil).catch(() => null) : Promise.resolve(null);
  const ecouterModele = () => son(mot.ar, 't');
  const signeDe = (k: SigneCle) => signes.find((s) => s.k === k);

  function erreur(j: number | null) {
    erreursMot++;
    erreurs++;
    retour = 'reessaie';
    selection = null;
    if (j !== null) {
      faux = [...faux, j];
      apres(650, () => (faux = faux.filter((x) => x !== j)));
    }
  }

  // ————————————————— lettres
  function poserLettre(id: number, j: number) {
    if (phase !== 'lettres' || places[j] || verrou[j]) return;
    const tu = tuiles.find((x) => x.id === id);
    if (!tu) return;
    if (immediat && tu.l !== mot.c[j]![0]) return erreur(j);
    places[j] = tu;
    tuiles = tuiles.filter((x) => x.id !== id);
    selection = null;
    retour = '';
    void son(tu.l, 's');
    if (immediat) verrou[j] = true;
    if (places.every(Boolean)) verifierLettres();
  }
  function verifierLettres() {
    const justes = lettresJustes(mot, posees);
    if (justes.every(Boolean)) {
      verrou = mot.c.map(() => true);
      phase = aSigner.length ? 'signes' : 'fini';
      retour = '';
      if (phase === 'fini') reussi();
      return;
    }
    // les lettres mal placées retournent sur le plateau
    erreursMot++;
    erreurs++;
    retour = 'reessaie';
    const mauvais = justes.flatMap((ok, j) => (ok ? [] : [j]));
    faux = mauvais;
    apres(650, () => {
      for (const j of mauvais) {
        const tu = places[j];
        if (tu) tuiles = [...tuiles, tu];
        places[j] = null;
      }
      faux = [];
    });
  }
  function reprendreLettre(j: number) {
    if (phase !== 'lettres' || verrou[j] || !places[j]) return;
    tuiles = [...tuiles, places[j]!];
    places[j] = null;
    retour = '';
  }

  // ————————————————— signes
  function poserSigne(k: SigneCle, j: number) {
    if (phase !== 'signes') return;
    const attendu = mot.c[j]![1];
    if (!attendu) {
      // lettre de prolongation : elle n'a pas de signe
      selection = null;
      retour = '';
      return;
    }
    if (immediat && attendu !== k) return erreur(j);
    poses[j] = k;
    selection = null;
    retour = '';
    if (aSigner.every((x) => poses[x])) verifierSignes();
  }
  function verifierSignes() {
    const justes = signesJustes(mot, poses);
    if (justes.every(Boolean)) {
      reussi();
      return;
    }
    erreursMot++;
    erreurs++;
    retour = 'reessaie';
    const mauvais = justes.flatMap((ok, j) => (ok ? [] : [j]));
    faux = mauvais;
    apres(650, () => {
      for (const j of mauvais) poses[j] = null;
      faux = [];
    });
  }
  function reprendreSigne(j: number) {
    if (phase !== 'signes' || !poses[j]) return;
    poses[j] = null;
    retour = '';
  }

  function reussi() {
    phase = 'fini';
    retour = 'bravo';
    if (erreursMot === 0) premierCoup++;
    void ecouterModele();
  }
  function suivant() {
    arreterSon();
    if (i + 1 < mots.length) {
      i++;
      charger();
    } else onfini({ total: mots.length, premierCoup, erreurs, ms: Date.now() - debut });
  }

  // ————————————————— toucher, glisser, clavier
  async function versCase(j: number | null) {
    await tick();
    if (j !== null && j >= 0)
      document.querySelector<HTMLElement>(`[data-testid="cons-case"][data-case="${j}"]`)?.focus();
  }
  function toucherTuile(id: number, clavier: boolean) {
    if (phase !== 'lettres') return;
    selection = selection?.t === 'l' && selection.id === id ? null : { t: 'l', id };
    if (selection) {
      const tu = tuiles.find((x) => x.id === id);
      void son(tu?.l, 's');
      if (clavier) void versCase(suivante);
    }
  }
  function toucherSigne(k: SigneCle, clavier: boolean) {
    if (phase !== 'signes') return;
    selection = selection?.t === 's' && selection.k === k ? null : { t: 's', k };
    if (selection) {
      void son(signeDe(k)?.ar, 's');
      if (clavier) void versCase(aSigner.find((x) => !poses[x]) ?? aSigner[0] ?? null);
    }
  }
  function toucherCase(j: number) {
    if (selection?.t === 'l') poserLettre(selection.id, j);
    else if (selection?.t === 's') poserSigne(selection.k, j);
    else if (phase === 'lettres') reprendreLettre(j);
    else reprendreSigne(j);
  }
  /** cible `data-depot="case:2"` sous le doigt */
  const caseDe = (c: HTMLElement | null): number | null => {
    const m = /^case:(\d+)$/.exec(c?.dataset.depot ?? '');
    return m ? Number(m[1]) : null;
  };
  const deposerLettre = (id: number) => (c: HTMLElement | null) => {
    const j = caseDe(c);
    if (j !== null) poserLettre(id, j);
  };
  const deposerSigne = (k: SigneCle) => (c: HTMLElement | null) => {
    const j = caseDe(c);
    if (j !== null) poserSigne(k, j);
  };
  const glyphe = (k: SigneCle) => CERCLE + MARQUES[k];
  /**
   * Couleur d'une case (jetons `sg-*`) : celle du signe posé ; une lettre de prolongation prend la couleur de la
   * voyelle qui la précède, en version claire (`-l`), avec un trait prolongé. Hamza, ة, ى et lettre nue : encre.
   */
  function sgDe(j: number): string | undefined {
    const k = poses[j];
    if (k) return FAMILLE[k];
    const avant = j > 0 ? poses[j - 1] : null;
    const v = !mot.c[j]![1] && avant ? voyelleDe(avant) : null;
    return v ? `${v}-l` : undefined;
  }
  const construit = $derived(
    motConstruit(
      posees,
      poses.map((p, j) => (mot.c[j]![1] ? p : null)),
    ),
  );
</script>

<section
  class="construis"
  data-testid="construis"
  data-public={pub}
  data-phase={phase}
  data-mot={mot.ar}
>
  <p class="etat">
    <Bidi text={t('cahier.cons_mot_n', { i: i + 1, n: mots.length })} />
  </p>
  <p class="consigne" data-testid="cons-consigne">
    <Bidi
      text={phase === 'lettres'
        ? t('cahier.cons_consigne_lettres')
        : phase === 'signes'
          ? t('cahier.cons_consigne_signes')
          : t('cahier.cons_bravo')}
    />
  </p>

  <div class="mot" dir="rtl">
    {#each mot.c as [lettre, signe], j (j)}
      {@const p = places[j]}
      <button
        type="button"
        class="case"
        class:vide={!p}
        class:courante={phase === 'lettres' && j === suivante}
        class:verrou={verrou[j]}
        class:faux={faux.includes(j)}
        class:asigner={phase === 'signes' && !!signe && !poses[j]}
        class:fixe={phase === 'signes' && !signe}
        data-testid="cons-case"
        data-sg={sgDe(j)}
        data-case={j}
        data-depot={`case:${j}`}
        aria-label={p
          ? t('cahier.cons_case_pleine', { n: j + 1, l: lettre })
          : t('cahier.cons_case', { n: j + 1 })}
        onclick={() => toucherCase(j)}
      >
        {#if p}<span class="ar" lang="ar" dir="rtl"
            ><Bidi text={p.l + (poses[j] ? MARQUES[poses[j]!] : '')} base="ar" /></span
          >{/if}
      </button>
    {/each}
  </div>
  <p class="sens" aria-hidden="true">←</p>

  {#if phase === 'lettres'}
    <div class="plateau" dir="rtl" data-testid="cons-lettres">
      {#each tuiles as tu (tu.id)}
        <button
          type="button"
          class="tuile"
          class:choisie={selection?.t === 'l' && selection.id === tu.id}
          data-testid="cons-tuile"
          data-lettre={tu.l}
          aria-pressed={selection?.t === 'l' && selection.id === tu.id}
          aria-label={t('cahier.cons_lettre', { l: tu.l })}
          onpointerdown={(e) => glisser(e, deposerLettre(tu.id))}
          onclick={(e) => toucherTuile(tu.id, e.detail === 0)}
          ><span class="ar" lang="ar" dir="rtl"><Bidi text={tu.l} base="ar" /></span></button
        >
      {/each}
    </div>
  {:else if phase === 'signes'}
    <div class="plateau signes" dir="rtl" data-testid="cons-signes">
      {#each signes as s (s.k)}
        <button
          type="button"
          class="tuile signe"
          class:double={pastilleDouble(s.k)}
          data-sg={FAMILLE[s.k]}
          class:choisie={selection?.t === 's' && selection.k === s.k}
          data-testid="cons-signe"
          data-signe={s.k}
          aria-pressed={selection?.t === 's' && selection.k === s.k}
          aria-label={t('cahier.cons_signe', { s: glyphe(s.k) })}
          onpointerdown={(e) => glisser(e, deposerSigne(s.k))}
          onclick={(e) => toucherSigne(s.k, e.detail === 0)}
          ><span class="ar" lang="ar" dir="rtl"><Bidi text={glyphe(s.k)} base="ar" /></span></button
        >
      {/each}
    </div>
  {/if}

  <div class="actions">
    <button type="button" class="bouton" data-testid="cons-ecouter" onclick={ecouterModele}
      ><Bidi text={t('cahier.cons_ecouter')} /></button
    >
  </div>

  <div class="retour" role="status" data-testid="cons-retour" data-retour={retour}>
    {#if retour === 'reessaie'}<Bidi text={t('cahier.reessaie')} />{:else if selection}<Bidi
        text={t('cahier.cons_touche_case')}
      />{/if}
  </div>

  {#if phase === 'fini'}
    <div class="compare" data-testid="cons-compare">
      <div>
        <span class="lib"><Bidi text={t('cahier.cons_ton_mot')} /></span>
        <span class="ar grand" lang="ar" dir="rtl" data-testid="cons-ton-mot"
          ><Bidi text={construit} base="ar" /></span
        >
      </div>
      <div>
        <span class="lib"><Bidi text={t('cahier.cons_modele')} /></span>
        <span class="ar grand" lang="ar" dir="rtl" data-testid="cons-modele"
          ><Bidi text={mot.ar} base="ar" /></span
        >
      </div>
    </div>
    <button type="button" class="bouton plein" data-testid="cons-suivant" onclick={suivant}
      ><Bidi
        text={i + 1 < mots.length ? t('cahier.cons_suivant') : t('cahier.jeu_terminer')}
      /></button
    >
  {/if}
  <p class="aide"><Bidi text={t('cahier.cons_aide')} /></p>
</section>

<style>
  .construis {
    --t: clamp(2.75rem, 15vw, 4.6rem);
    padding: 0.9rem;
    background: var(--cah-carte, var(--card));
    border: 2px dashed var(--cah-or, var(--line));
    border-radius: 18px;
  }
  .construis[data-public='ado'] {
    --t: clamp(2.75rem, 12.5vw, 3.4rem);
  }
  .etat,
  .consigne,
  .aide {
    margin: 0 0 0.4rem;
    color: var(--ink2);
  }
  .consigne {
    font-weight: 700;
    color: var(--ink);
  }
  .aide {
    margin-top: 0.7rem;
    font-size: 0.8rem;
  }
  .mot,
  .plateau {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
    margin: 0.4rem 0;
  }
  .sens {
    margin: 0;
    text-align: center;
    color: var(--or-ink, var(--ink2));
    font-size: 1.4rem;
    line-height: 1;
  }
  .case,
  .tuile {
    width: var(--t);
    height: var(--t);
    min-width: 2.75rem;
    min-height: 2.75rem;
    display: grid;
    place-items: center;
    padding: 0;
    border-radius: 16px;
    border: 2px solid var(--line);
    background: var(--cah-papier, var(--paper));
    color: var(--ink);
    cursor: pointer;
    touch-action: none;
    user-select: none;
    transition:
      background var(--motion-fast, 120ms),
      border-color var(--motion-fast, 120ms),
      transform var(--motion-fast, 120ms);
  }
  .case {
    touch-action: manipulation;
    border-style: dashed;
  }
  .case .ar,
  .tuile .ar {
    font: 400 calc(var(--t) * 0.6) / 1.5 var(--font-ar);
  }
  .tuile.signe .ar {
    font-size: calc(var(--t) * 0.7);
  }
  .case.courante {
    border-color: var(--gold);
    box-shadow: 0 0 0 3px var(--or-soft);
  }
  .case.asigner {
    border-color: var(--gold);
    box-shadow: 0 0 0 3px var(--or-soft);
  }
  .case.verrou {
    border-style: solid;
    border-color: var(--ok-ink);
    background: var(--ok-bg);
  }
  .case.fixe {
    background: var(--surface, var(--card));
  }
  .case.faux {
    border-color: var(--warn-ink);
    background: var(--warn-bg);
    animation: secoue 0.4s;
  }
  /* une couleur FIXE par signe (jetons `sg-*`), toujours avec le signe lui-même ; ni le tajwīd ni les lettres étudiées */
  [data-sg='fatha'] {
    --sg: var(--sg-fatha);
  }
  [data-sg='kasra'] {
    --sg: var(--sg-kasra);
  }
  [data-sg='damma'] {
    --sg: var(--sg-damma);
  }
  [data-sg='soukoun'] {
    --sg: var(--sg-soukoun);
  }
  [data-sg='shadda'] {
    --sg: var(--sg-shadda);
  }
  [data-sg='fatha-l'] {
    --sg: var(--sg-fatha-l);
  }
  [data-sg='kasra-l'] {
    --sg: var(--sg-kasra-l);
  }
  [data-sg='damma-l'] {
    --sg: var(--sg-damma-l);
  }
  .tuile.signe[data-sg] {
    color: var(--sg);
    border-color: var(--sg);
    box-shadow: 0 2px 0 var(--sg);
  }
  /* tanwīn : la couleur de sa voyelle, avec une pastille doublée */
  .tuile.signe.double {
    outline: 2px solid var(--sg);
    outline-offset: 3px;
  }
  .case[data-sg] .ar {
    color: var(--sg);
  }
  .case[data-sg] {
    border-bottom: 5px solid var(--sg);
  }
  /* voyelle longue : couleur de la voyelle brève en version claire, avec un trait prolongé */
  .case[data-sg$='-l'] {
    border-bottom-width: 5px;
    border-bottom-style: double;
    background-image: linear-gradient(to left, var(--sg), transparent);
    background-size: 100% 3px;
    background-repeat: no-repeat;
    background-position: bottom;
  }
  .tuile {
    border-style: solid;
    border-color: var(--primary);
    box-shadow: 0 2px 0 var(--primary);
  }
  .tuile.choisie {
    background: var(--primary-soft);
    transform: translateY(-3px);
    border-color: var(--gold);
  }
  :global(.tuile.en-main) {
    opacity: 0.35;
  }
  :global(.tuile.fantome) {
    opacity: 0.95;
    transform-origin: center;
    box-shadow: 0 8px 18px rgb(0 0 0 / 0.25);
  }
  .actions {
    display: flex;
    justify-content: center;
    margin-top: 0.5rem;
  }
  .bouton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.75rem;
    padding: 0.3rem 1.1rem;
    border-radius: 999px;
    border: 1.5px solid var(--primary);
    background: transparent;
    color: var(--primary);
    font-weight: 700;
    cursor: pointer;
  }
  .bouton.plein {
    background: var(--primary);
    color: var(--on-primary);
    margin-top: 0.6rem;
  }
  .case:focus-visible,
  .tuile:focus-visible,
  .bouton:focus-visible {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }
  .retour {
    min-height: 1.6rem;
    margin-top: 0.4rem;
    text-align: center;
    font-weight: 700;
    color: var(--ink2);
  }
  .retour[data-retour='reessaie'] {
    color: var(--warn-ink);
  }
  .compare {
    display: grid;
    gap: 0.4rem;
    margin-top: 0.6rem;
    padding: 0.6rem 0.8rem;
    border-radius: 14px;
    background: var(--ok-bg);
    text-align: center;
  }
  .compare .lib {
    display: block;
    font: 700 0.75rem/1.2 var(--font-ui);
    color: var(--ink2);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .grand {
    display: block;
    font: 400 2.6rem/1.7 var(--font-ar);
  }
  @keyframes secoue {
    25% {
      transform: translateX(-4px);
    }
    75% {
      transform: translateX(4px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .case,
    .tuile {
      transition: none;
    }
    .case.faux {
      animation: none;
    }
    .tuile.choisie {
      transform: none;
    }
  }
</style>
