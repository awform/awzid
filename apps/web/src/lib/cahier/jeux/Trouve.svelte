<script lang="ts">
  import { onDestroy } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import type { LevelAudio } from '$lib/lecons-audio';
  import type { Manche } from '../donnees';
  import { arreterSon, jouerElement } from '../audio';
  import Medaille from './Medaille.svelte';
  import {
    PALIERS_CHRONO,
    PENALITE_S,
    gagnantDuel,
    medailleChrono,
    medailleScore,
    melanger,
    paliersDuel,
    secondesChrono,
    type ModeTrouve,
    type Public,
    type ResultatTrouve,
  } from './modele';

  /**
   * « Trouve la syllabe » (et « Trouve le mot ») : on entend une syllabe, on touche la bonne parmi 3 ou 4. Trois façons de
   * jouer avec les mêmes manches :
   *  - `doux` (enfants) : grandes cibles, une animation douce quand c'est réussi, aucune pénalité, « Réessaie » ;
   *  - `chrono` (ados) : défi chrono, chaque erreur ajoute 2 secondes, médailles de bronze, d'argent et d'or ;
   *  - `duel` (ados) : à deux sur le même appareil, chacun son tour, 1 point par bonne réponse du premier coup.
   */
  let {
    manches,
    mode,
    pub,
    audio,
    profil,
    onfini,
    onrejouer,
  }: {
    manches: Manche[];
    mode: ModeTrouve;
    pub: Public;
    audio: LevelAudio | null;
    profil: string | null;
    onfini: (r: ResultatTrouve) => void;
    onrejouer: () => void;
  } = $props();

  const nChoix = $derived(pub === 'enfant' ? 3 : 4);
  let i = $state(0);
  const manche = $derived(manches[i]!);
  let choix = $state<string[]>([]);
  let bon = $state<string | null>(null);
  let mauvais = $state<string[]>([]);
  let revele = $state<string | null>(null);
  let ferme = $state(false);
  let erreurs = $state(0);
  let erreurManche = $state(false);
  let justes = $state<number[]>([0, 0]);
  let fini = $state<ResultatTrouve | null>(null);
  let secondesAffichees = $state(0);
  let debut = 0;
  let tic: ReturnType<typeof setInterval> | null = null;
  let minuteurs: Array<ReturnType<typeof setTimeout>> = [];
  const joueur = $derived(mode === 'duel' ? i % 2 : 0);

  function arreterTic() {
    if (tic) clearInterval(tic);
    tic = null;
  }
  onDestroy(() => {
    arreterTic();
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

  const ecouter = () =>
    jouerElement({ ar: manche.cible, a: manche.k === 's' ? 's' : 't' }, audio, profil).catch(
      () => null,
    );
  function lancer() {
    choix = melanger(manche.choix.slice(0, nChoix));
    bon = null;
    mauvais = [];
    revele = null;
    ferme = false;
    erreurManche = false;
    if (i === 0 && mode === 'chrono') {
      debut = Date.now();
      tic = setInterval(() => (secondesAffichees = (Date.now() - debut) / 1000), 100);
    }
    void ecouter();
  }
  lancer();

  function terminer() {
    arreterTic();
    const ms = mode === 'chrono' ? Date.now() - debut : 0;
    const total = manches.length;
    let r: ResultatTrouve;
    if (mode === 'chrono') {
      const s = secondesChrono(ms, erreurs);
      r = { mode, total, justes: [justes[0]!], erreurs, ms, secondes: s, med: medailleChrono(s) };
    } else if (mode === 'duel') {
      const par = total / 2;
      const meilleur = Math.max(justes[0]!, justes[1]!);
      r = {
        mode,
        total,
        justes: [...justes],
        erreurs,
        ms,
        med: medailleScore(meilleur, paliersDuel(par)),
      };
    } else r = { mode, total, justes: [justes[0]!], erreurs, ms, med: 0 };
    fini = r;
    onfini(r);
  }
  function suite() {
    if (i + 1 < manches.length) {
      i++;
      lancer();
    } else terminer();
  }

  function repondre(c: string) {
    if (ferme || bon !== null) return;
    const cible = manche.cible;
    if (c === cible) {
      bon = c;
      ferme = true;
      if (!erreurManche) justes[joueur] = justes[joueur]! + 1;
      apres(mode === 'doux' ? 1100 : 600, suite);
      return;
    }
    erreurManche = true;
    if (mode === 'duel') {
      // un seul essai par manche : on montre la bonne réponse, puis on passe à l'autre joueur
      mauvais = [c];
      revele = cible;
      ferme = true;
      apres(1300, suite);
      return;
    }
    if (!mauvais.includes(c)) mauvais = [...mauvais, c];
    // chrono : +2 s par erreur ; enfants : comptée pour information seulement, jamais une pénalité
    erreurs++;
  }
  const medChrono = $derived(fini?.med ?? 0);
  const gagnant = $derived(
    fini && mode === 'duel' ? gagnantDuel(fini.justes[0]!, fini.justes[1]!) : 0,
  );
</script>

<section class="trouve" data-testid="trouve" data-mode={mode} data-public={pub}>
  {#if !fini}
    {#if mode === 'duel'}
      <p class="joueur" data-testid="duel-joueur" data-joueur={joueur + 1}>
        <Bidi text={t('cahier.duel_joueur', { n: joueur + 1 })} /> ·
        <Bidi text={t('cahier.duel_score', { a: justes[0], b: justes[1] })} />
      </p>
    {/if}
    <p class="entete">
      <span data-testid="trouve-manche"
        ><Bidi text={t('cahier.trouve_manche', { i: i + 1, n: manches.length })} /></span
      >
      {#if mode === 'chrono'}<span class="chrono" data-testid="chrono-temps" aria-live="off"
          ><Bidi
            text={t('cahier.chrono_temps', {
              s: Math.round((secondesAffichees + erreurs * PENALITE_S) * 10) / 10,
            })}
          /></span
        >{/if}
    </p>
    <p class="consigne">
      <Bidi
        text={manche.k === 's' ? t('cahier.trouve_consigne_s') : t('cahier.trouve_consigne_m')}
      />
    </p>
    <div class="ecoute">
      <button type="button" class="haut-parleur" data-testid="trouve-ecouter" onclick={ecouter}>
        <svg viewBox="0 0 24 24" aria-hidden="true"
          ><path d="M4 9v6h4l5 4V5L8 9zM16 8a5 5 0 0 1 0 8M18.5 5.5a9 9 0 0 1 0 13" /></svg
        ><Bidi text={t('cahier.trouve_ecouter')} />
      </button>
    </div>
    <div class="choix" class:quatre={nChoix === 4} dir="rtl">
      {#each choix as c (c)}
        <button
          type="button"
          class="choix-bouton"
          class:bon={bon === c || revele === c}
          class:mauvais={mauvais.includes(c)}
          data-testid="trouve-choix"
          disabled={ferme && bon !== c && revele !== c && !mauvais.includes(c)}
          onclick={() => repondre(c)}
          ><span class="ar" lang="ar" dir="rtl"><Bidi text={c} base="ar" /></span></button
        >
      {/each}
    </div>
    <p class="retour" role="status" data-testid="trouve-retour">
      {#if bon !== null}<Bidi
          text={t('cahier.trouve_juste')}
        />{:else if mauvais.length && mode !== 'duel'}<Bidi
          text={mode === 'chrono'
            ? t('cahier.chrono_erreur', { s: PENALITE_S })
            : t('cahier.reessaie')}
        />{:else if revele}<Bidi text={t('cahier.duel_rate')} />{/if}
    </p>
  {:else}
    <div class="fin" data-testid="trouve-fin" data-med={medChrono}>
      {#if mode === 'doux'}
        <p class="bravo">
          <Bidi text={t('cahier.trouve_fin', { n: fini.justes[0], total: fini.total })} />
        </p>
        <div class="etoiles" aria-hidden="true">
          {#each manches as _, k (k)}<span class:pleine={k < fini.justes[0]!}></span>{/each}
        </div>
      {:else if mode === 'chrono'}
        <p class="bravo" data-testid="chrono-resultat">
          <Bidi text={t('cahier.chrono_resultat', { s: fini.secondes })} />
        </p>
        <p>
          <Bidi text={t('cahier.chrono_erreurs', { n: fini.erreurs })} />
        </p>
        {#if medChrono > 0}
          <Medaille med={medChrono} grand />
        {:else}
          <p><Bidi text={t('cahier.chrono_vise', { s: PALIERS_CHRONO.bronze })} /></p>
        {/if}
      {:else}
        <p class="bravo" data-testid="duel-resultat">
          <Bidi
            text={gagnant === 0 ? t('cahier.duel_egalite') : t('cahier.duel_gagne', { n: gagnant })}
          />
        </p>
        <p><Bidi text={t('cahier.duel_score', { a: fini.justes[0], b: fini.justes[1] })} /></p>
        {#if fini.med > 0}<Medaille med={fini.med} grand />{/if}
      {/if}
      <button type="button" class="bouton plein" data-testid="trouve-rejouer" onclick={onrejouer}
        ><Bidi text={t('cahier.jeu_rejouer')} /></button
      >
    </div>
  {/if}
</section>

<style>
  .trouve {
    padding: 0.9rem;
    background: var(--cah-carte, var(--card));
    border: 2px dashed var(--cah-or, var(--line));
    border-radius: 18px;
  }
  .joueur {
    margin: 0 0 0.4rem;
    padding: 0.35rem 0.7rem;
    border-radius: 999px;
    background: var(--primary-soft);
    color: var(--ink);
    font-weight: 700;
    text-align: center;
  }
  .entete {
    display: flex;
    justify-content: space-between;
    margin: 0 0 0.3rem;
    color: var(--ink2);
    font-weight: 700;
  }
  .chrono {
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  .consigne {
    margin: 0 0 0.5rem;
    font-weight: 700;
  }
  .ecoute {
    display: flex;
    justify-content: center;
    margin: 0.3rem 0 0.7rem;
  }
  .haut-parleur {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 3.4rem;
    padding: 0.4rem 1.4rem;
    border-radius: 999px;
    border: 2px solid var(--primary);
    background: var(--primary);
    color: var(--on-primary);
    font: 700 1.05rem var(--font-ui);
    cursor: pointer;
  }
  .haut-parleur svg {
    width: 1.6rem;
    height: 1.6rem;
    fill: currentColor;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    fill-opacity: 0.25;
  }
  .choix {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.6rem;
  }
  .choix.quatre {
    grid-template-columns: repeat(2, 1fr);
  }
  .choix-bouton {
    min-height: 5.2rem;
    min-width: 2.75rem;
    display: grid;
    place-items: center;
    border-radius: 18px;
    border: 2px solid var(--line);
    background: var(--cah-papier, var(--paper));
    color: var(--ink);
    cursor: pointer;
    transition:
      transform var(--motion-fast, 120ms),
      background var(--motion-fast, 120ms);
  }
  .quatre .choix-bouton {
    min-height: 4.4rem;
  }
  .choix-bouton .ar {
    font: 400 2.8rem/1.5 var(--font-ar);
  }
  .quatre .choix-bouton .ar {
    font-size: 2.3rem;
  }
  .choix-bouton.bon {
    background: var(--ok-bg);
    border-color: var(--ok-ink);
    animation: pop 0.45s ease-out;
  }
  .choix-bouton.mauvais {
    background: var(--warn-bg);
    border-color: var(--warn-ink);
    opacity: 0.8;
  }
  .choix-bouton:disabled {
    cursor: default;
  }
  .choix-bouton:focus-visible,
  .haut-parleur:focus-visible,
  .bouton:focus-visible {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }
  .retour {
    min-height: 1.6rem;
    margin: 0.6rem 0 0;
    text-align: center;
    font-weight: 700;
    color: var(--ink2);
  }
  .fin {
    display: grid;
    justify-items: center;
    gap: 0.5rem;
    text-align: center;
  }
  .bravo {
    margin: 0;
    font: 700 1.3rem var(--font-title);
    color: var(--ok-ink);
  }
  .etoiles {
    display: flex;
    gap: 0.35rem;
  }
  .etoiles span {
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 50%;
    border: 2px solid var(--gold);
  }
  .etoiles span.pleine {
    background: var(--gold);
  }
  .bouton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.75rem;
    padding: 0.3rem 1.2rem;
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
  }
  @keyframes pop {
    40% {
      transform: scale(1.07);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .choix-bouton {
      transition: none;
    }
    .choix-bouton.bon {
      animation: none;
    }
  }
</style>
