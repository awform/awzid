<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import type { LevelAudio } from '$lib/lecons-audio';
  import type { JeuPage, Manche, MotJeu, SigneJeu } from '../donnees';
  import { idSynthese } from '../audio';
  import { enregistrerJeu, type ProgresCahier } from '../progres';
  import Chasse from './Chasse.svelte';
  import Construis from './Construis.svelte';
  import Medaille from './Medaille.svelte';
  import Trouve from './Trouve.svelte';
  import {
    JEUX_DU_PUBLIC,
    MANCHES,
    MOTS_PARTIE,
    colorieJouable,
    jeuxOuverts,
    manchesJouables,
    medailleScore,
    motsJouables,
    paliersConstruis,
    publicDe,
    signesOuverts,
    tirer,
    type ContexteJeu,
    type JeuId,
    type Med,
    type ResultatTrouve,
  } from './modele';

  /**
   * Jeux de fin de grille (cahiers des enfants et des ados, 25/10/2026) : ils REMPLACENT la version papier dans
   * l'application (le PDF garde la sienne). Chargés à la demande avec le cahier. Les données (mots, syllabes, signes) sont
   * générées depuis le cahier et le livre (scripts/cahier-jeux.mjs) : rien que du déjà vu, chaque mot et chaque syllabe a son
   * audio. Enfants : « Construis le mot », « Trouve la syllabe », « Je colorie » (grandes cibles, aucune pénalité).
   * Ados : « Défi chrono », « Construis le mot » (plus rapide) et « Duel » à deux, avec score et médailles.
   */
  let {
    jeu,
    pageId,
    niveau,
    audio,
    profil,
    atteinte,
    lecon,
    progres,
    sauver,
  }: {
    jeu: JeuPage;
    pageId: string;
    niveau: string;
    audio: LevelAudio | null;
    profil: string | null;
    atteinte: number | null;
    /** libellé de la prochaine leçon qui ouvre d'autres jeux de cette grille (sinon rien) */
    lecon?: string | null;
    progres: ProgresCahier;
    sauver: (p: ProgresCahier) => void;
  } = $props();

  const pub = $derived(publicDe(niveau));
  const ctx = $derived<ContexteJeu>({
    atteinte,
    audioOk: (ar, a) => !!idSynthese({ ar, a }, audio),
  });
  const ouverts = $derived(audio ? jeuxOuverts(jeu, ctx, pub) : []);
  const tous = $derived(JEUX_DU_PUBLIC[pub]);

  let actif = $state<JeuId | null>(null);
  let partie = $state(0);
  let mots = $state<MotJeu[]>([]);
  let signes = $state<SigneJeu[]>([]);
  let manches = $state<Manche[]>([]);
  let bilan = $state<{ total: number; premierCoup: number; erreurs: number; med: Med } | null>(
    null,
  );

  function lancer(j: JeuId) {
    actif = j;
    partie++;
    bilan = null;
    if (j === 'construis') {
      mots = tirer(motsJouables(jeu, ctx, pub), MOTS_PARTIE[pub]);
      signes = signesOuverts(jeu, ctx);
    } else if (j === 'trouve') {
      const s = manchesJouables(jeu, ctx, 's');
      manches = tirer(s.length >= 4 ? s : manchesJouables(jeu, ctx), MANCHES.trouve);
    } else if (j === 'chrono') manches = tirer(manchesJouables(jeu, ctx), MANCHES.chrono);
    else if (j === 'duel') {
      const toutes = manchesJouables(jeu, ctx);
      const n = Math.min(MANCHES.duelParJoueur * 2, toutes.length - (toutes.length % 2));
      manches = tirer(toutes, n);
    }
  }
  const cle = (j: JeuId) => `${pageId}:${j}`;
  function noter(j: JeuId, med: Med, valeur?: number, moinsEstMieux = false) {
    sauver(enregistrerJeu(progres, cle(j), med, valeur, moinsEstMieux));
  }
  function constructionFinie(r: { total: number; premierCoup: number; erreurs: number }) {
    // enfants : une étoile à chaque partie terminée, jamais de médaille ni de pénalité ; ados : médailles
    const med: Med = pub === 'ado' ? medailleScore(r.premierCoup, paliersConstruis(r.total)) : 3;
    bilan = { ...r, med };
    noter('construis', med, r.premierCoup);
  }
  function trouveFini(j: JeuId, r: ResultatTrouve) {
    if (j === 'chrono') noter('chrono', r.med, r.secondes, true);
    else if (j === 'duel') noter('duel', r.med, Math.max(...r.justes));
    else noter('trouve', 3, r.justes[0]);
  }
  const resultat = (j: JeuId) => progres.jeux[cle(j)];
  const jeuDuel = $derived(actif === 'duel');
</script>

<section class="jeux" data-testid="jeux" data-public={pub}>
  {#if !audio}
    <p class="note"><Bidi text={t('cahier.jeu_audio')} /></p>
  {:else if !actif}
    <p class="note"><Bidi text={t('cahier.jeu_choisir')} /></p>
    <div class="tuiles">
      {#each tous as j (j)}
        {@const ok = ouverts.includes(j)}
        {@const r = resultat(j)}
        <button
          type="button"
          class="jeu"
          class:ferme={!ok}
          data-testid="jeu-{j}"
          disabled={!ok}
          onclick={() => lancer(j)}
        >
          <span class="titre"><Bidi text={t(`cahier.jeu_${j}`)} /></span>
          <span class="desc"
            ><Bidi text={ok ? t(`cahier.jeu_${j}_desc`) : t('cahier.jeu_bientot')} /></span
          >
          {#if r && r.med > 0}
            {#if pub === 'ado'}<Medaille med={r.med as Med} />{:else}<span class="etoile"
                ><svg viewBox="0 0 24 24" aria-hidden="true"
                  ><path d="m12 2 3 7 7.5.6-5.7 5 1.8 7.4L12 18l-6.6 4 1.8-7.4-5.7-5L9 9z" /></svg
                ><Bidi text={t('cahier.jeu_fait')} /></span
              >{/if}
          {/if}
        </button>
      {/each}
    </div>
    {#if lecon}<p class="note"><Bidi text={t('cahier.grille_suite', { lecon })} /></p>{/if}
  {:else}
    <div class="barre">
      <h3><Bidi text={t(`cahier.jeu_${actif}`)} /></h3>
      <button
        type="button"
        class="bouton"
        data-testid="jeu-fermer"
        onclick={() => {
          actif = null;
          bilan = null;
        }}>{t('cahier.jeu_fermer')}</button
      >
    </div>
    {#if actif === 'chrono'}<p class="note"><Bidi text={t('cahier.chrono_consigne')} /></p>{/if}
    {#if jeuDuel}<p class="note"><Bidi text={t('cahier.duel_consigne')} /></p>{/if}
    {#key partie}
      {#if actif === 'construis'}
        {#if bilan}
          <div class="fin" data-testid="cons-fin" data-med={bilan.med}>
            <p class="bravo">
              <Bidi
                text={pub === 'ado'
                  ? t('cahier.cons_fin_ado', { n: bilan.premierCoup, total: bilan.total })
                  : t('cahier.cons_fin', { n: bilan.total })}
              />
            </p>
            {#if pub === 'ado'}
              <p><Bidi text={t('cahier.defi_erreurs', { n: bilan.erreurs })} /></p>
              {#if bilan.med > 0}<Medaille med={bilan.med} grand />{/if}
            {/if}
            <button
              type="button"
              class="bouton plein"
              data-testid="jeu-rejouer"
              onclick={() => lancer('construis')}><Bidi text={t('cahier.jeu_rejouer')} /></button
            >
          </div>
        {:else}
          <Construis {mots} {signes} {pub} {audio} {profil} onfini={constructionFinie} />
        {/if}
      {:else if actif === 'colorie'}
        <Chasse
          lettre={jeu.colorie?.lettre ?? jeu.lettre}
          cases={colorieJouable(jeu, ctx)}
          {audio}
          {profil}
          onfini={() => noter('colorie', 3)}
        />
      {:else}
        <Trouve
          {manches}
          mode={actif === 'chrono' ? 'chrono' : actif === 'duel' ? 'duel' : 'doux'}
          {pub}
          {audio}
          {profil}
          onfini={(r) => trouveFini(actif!, r)}
          onrejouer={() => lancer(actif!)}
        />
      {/if}
    {/key}
  {/if}
</section>

<style>
  .jeux {
    margin: 0.5rem 0;
  }
  .note {
    margin: 0 0 0.6rem;
    color: var(--ink2);
  }
  .tuiles {
    display: grid;
    gap: 0.6rem;
  }
  .jeu {
    display: grid;
    gap: 0.2rem;
    grid-template-columns: 1fr;
    justify-items: start;
    width: 100%;
    min-height: 4.4rem;
    padding: 0.7rem 1rem;
    text-align: start;
    border-radius: 16px;
    border: 2px solid var(--primary);
    background: var(--cah-carte, var(--card));
    color: var(--ink);
    cursor: pointer;
  }
  .jeux[data-public='enfant'] .jeu {
    min-height: 5.6rem;
    border-radius: 22px;
  }
  .jeu .titre {
    font: 700 1.1rem var(--font-title);
  }
  .jeux[data-public='enfant'] .jeu .titre {
    font-size: 1.3rem;
  }
  .jeu .desc {
    font-size: 0.85rem;
    color: var(--ink2);
  }
  .jeu.ferme {
    border-style: dashed;
    border-color: var(--line);
    cursor: default;
    opacity: 0.85;
  }
  .jeu:focus-visible,
  .bouton:focus-visible {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }
  .etoile {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-weight: 700;
    color: var(--ink);
  }
  .etoile svg {
    width: 1.3rem;
    height: 1.3rem;
    fill: var(--gold);
    stroke: var(--or-ink, var(--ink));
    stroke-width: 1.2;
  }
  .barre {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .barre h3 {
    margin: 0;
    font: 600 1.05rem var(--font-title);
  }
  .bouton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.75rem;
    padding: 0.3rem 1rem;
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
  .fin {
    display: grid;
    justify-items: center;
    gap: 0.5rem;
    padding: 1rem;
    border-radius: 18px;
    background: var(--ok-bg);
    text-align: center;
  }
  .bravo {
    margin: 0;
    font: 700 1.3rem var(--font-title);
    color: var(--ok-ink);
  }
</style>
