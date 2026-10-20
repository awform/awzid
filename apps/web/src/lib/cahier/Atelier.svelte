<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import type { LevelAudio } from '$lib/lecons-audio';
  import { t } from '$lib/i18n';
  import type { AtelierMot } from './donnees';
  import { jouerElement } from './audio';
  import {
    atelierJuste,
    caseVoisine,
    CERCLE,
    choixInitiaux,
    cleSigne,
    lettreComposee,
    premiereCase,
    SIGNES,
  } from './outils';

  /**
   * Cahier de lecture (20/10/2026) — atelier « je compose le mot » (facultatif, 2 minutes, validé par le client) :
   * les lettres d'un mot réel des livres (jamais un mot du Coran) s'affichent sans signes ; l'élève touche une lettre,
   * puis un des 7 signes (ou au clavier : flèches, 1 à 7, Entrée, Espace). Juste : il entend le mot entier, puis
   * touche chaque syllabe. Audio embarqué avec le niveau ; aucune synthèse à la volée.
   */
  let {
    mots,
    consigne,
    audio,
    profil,
    onreussi,
  }: {
    mots: AtelierMot[];
    consigne: string;
    audio: LevelAudio | null;
    profil: string | null;
    onreussi: () => void;
  } = $props();

  let i = $state(0);
  let choix = $state<string[][]>([]);
  let actif = $state(0);
  let retour = $state<'juste' | 'faux' | null>(null);
  $effect(() => {
    choix = mots.map(choixInitiaux);
    i = 0;
    actif = mots[0] ? premiereCase(mots[0]) : 0;
    retour = null;
  });
  const m = $derived(mots[i]!);
  const cs = $derived(choix[i] ?? []);

  function choisir(k: string) {
    if (!m.cases[actif]?.choix) return;
    const c = choix.map((x) => [...x]);
    c[i]![actif] = k;
    choix = c;
    retour = null;
    const n = caseVoisine(m, actif, 1);
    if (n >= 0) actif = n;
  }
  function valider() {
    retour = atelierJuste(m, cs) ? 'juste' : 'faux';
    if (retour === 'juste') {
      onreussi();
      void ecouterMot();
    }
  }
  const ecouterMot = () =>
    jouerElement({ ar: m.solution, a: 't' }, audio, profil).catch(() => null);
  const ecouterSyllabe = (s: string) =>
    jouerElement({ ar: s, a: 's' }, audio, profil).catch(() => null);
  function suivant() {
    i = (i + 1) % mots.length;
    actif = premiereCase(mots[i]!);
    retour = null;
  }
  function touche(ev: KeyboardEvent) {
    if ((ev.target as HTMLElement).closest('input, textarea')) return;
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      // écriture de droite à gauche : flèche gauche = lettre suivante
      const n = caseVoisine(m, actif, ev.key === 'ArrowLeft' ? 1 : -1);
      if (n >= 0) actif = n;
      ev.preventDefault();
    } else if (/^[1-7]$/.test(ev.key)) {
      choisir(SIGNES[Number(ev.key) - 1]!.k);
      ev.preventDefault();
    } else if (ev.key === 'Enter') {
      valider();
      ev.preventDefault();
    } else if (ev.key === ' ') {
      void ecouterMot();
      ev.preventDefault();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<section
  class="atelier"
  data-testid="atelier"
  tabindex="0"
  role="group"
  aria-label={t('cahier.atelier_ouvrir')}
  onkeydown={touche}
>
  {#if consigne}<p class="note"><Bidi text={consigne} /></p>{/if}
  <p class="note"><Bidi text={t('cahier.atelier_mot', { i: i + 1, n: mots.length })} /></p>
  <div class="mot" dir="rtl">
    {#each m.cases as c, j (j)}
      <div class="lettre">
        <button
          type="button"
          class="case"
          class:actif={j === actif}
          class:fixe={!c.choix}
          disabled={!c.choix}
          aria-label={t('cahier.atelier_lettre', { n: j + 1 })}
          aria-current={j === actif ? 'true' : undefined}
          data-lettre={j}
          onclick={() => (actif = j)}
          ><span class="ar" lang="ar" dir="rtl">{lettreComposee(m, j, cs)}</span></button
        >
        {#if !c.choix}<span class="prol"><Bidi text={t('cahier.atelier_prolongation')} /></span
          >{/if}
      </div>
    {/each}
  </div>
  <div class="signes">
    {#each SIGNES as s, n (s.k)}
      <button
        type="button"
        class="signe"
        aria-pressed={cs[actif] === s.k}
        data-signe={s.k}
        onclick={() => choisir(s.k)}
        ><span class="ar" lang="ar" dir="rtl">{CERCLE + s.m}</span><span
          >{n + 1} · <Bidi text={t(cleSigne(s.k))} /></span
        ></button
      >
    {/each}
  </div>
  <div class="actions">
    <button type="button" class="bouton plein" data-testid="atelier-valider" onclick={valider}
      >{t('cahier.atelier_valider')}</button
    >
    <button type="button" class="bouton" onclick={ecouterMot}>{t('cahier.atelier_ecouter')}</button>
    {#if mots.length > 1}
      <button type="button" class="bouton" data-testid="atelier-suivant" onclick={suivant}
        >{t('cahier.atelier_suivant')}</button
      >
    {/if}
  </div>
  {#if retour}
    <div
      class="retour"
      class:faux={retour === 'faux'}
      role="status"
      data-testid="atelier-retour"
      data-retour={retour}
    >
      <p>
        <Bidi text={retour === 'juste' ? t('cahier.atelier_juste') : t('cahier.atelier_faux')} />
      </p>
      <p class="solution ar" lang="ar" dir="rtl">{m.solution}</p>
      <div class="syllabes" dir="rtl">
        {#each m.syllabes as s, k (k)}
          <button type="button" class="bouton syl" onclick={() => ecouterSyllabe(s)}
            ><span class="ar" lang="ar" dir="rtl">{s}</span></button
          >
        {/each}
      </div>
    </div>
  {/if}
  <p class="note clavier"><Bidi text={t('cahier.atelier_clavier')} /></p>
</section>

<style>
  .atelier {
    margin: 0.5rem 0;
    padding: 0.9rem;
    background: var(--cah-carte, var(--card));
    border: 2px dashed var(--cah-or, var(--line));
    border-radius: 18px;
  }
  .atelier:focus-visible {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }
  .note {
    font-size: 0.85rem;
    color: var(--ink2);
    margin: 0 0 0.4rem;
  }
  .mot {
    display: flex;
    justify-content: center;
    gap: 0.6rem;
    margin: 0.4rem 0 0.8rem;
  }
  .lettre {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
  }
  .case {
    width: 4.6rem;
    height: 4.6rem;
    display: grid;
    place-items: center;
    border-radius: 16px;
    border: 2px solid var(--line);
    background: var(--cah-papier, var(--paper));
    color: var(--ink);
    cursor: pointer;
  }
  .case .ar {
    font: 400 2.6rem/1 var(--font-ar);
  }
  .case.actif {
    border-color: var(--gold);
    box-shadow: 0 0 0 3px var(--or-soft, #fbf1d3);
  }
  .case.fixe {
    background: var(--surface, var(--card));
    color: var(--ink2);
    cursor: default;
  }
  .prol {
    font-size: 0.72rem;
    color: var(--ink2);
  }
  .signes {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.4rem;
  }
  .signe {
    min-height: 3.2rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.1rem;
    border-radius: 12px;
    border: 1.5px solid var(--line);
    background: var(--cah-papier, var(--paper));
    color: var(--ink);
    font: 700 0.72rem/1.2 var(--font-ui);
    cursor: pointer;
  }
  .signe .ar {
    font: 400 1.5rem/1.2 var(--font-ar);
  }
  .signe[aria-pressed='true'] {
    border-color: var(--primary);
    background: var(--primary-soft);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.8rem;
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
    color: var(--on-primary, #fff);
  }
  .case:focus-visible,
  .signe:focus-visible,
  .bouton:focus-visible {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }
  .retour {
    margin-top: 0.8rem;
    padding: 0.7rem 0.9rem;
    border-radius: 14px;
    background: var(--ok-bg);
  }
  .retour.faux {
    background: var(--warn-bg);
  }
  .retour p {
    margin: 0;
  }
  .solution {
    display: block;
    text-align: center;
    font: 400 2.4rem/1.8 var(--font-ar);
  }
  .syllabes {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.4rem;
  }
  .syl .ar {
    font: 400 1.6rem/1.3 var(--font-ar);
  }
  .clavier {
    margin-top: 0.7rem;
  }
</style>
