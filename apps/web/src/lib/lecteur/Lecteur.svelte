<script lang="ts">
  import { tick } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import Bidi from '$lib/Bidi.svelte';
  import { fmtNumber, t } from '$lib/i18n';
  import { dansExercice, garderDeplie, lireDeplie } from './affichage';
  import { horloge, MAX_REPETITIONS, SAUT_S, VITESSES, type Moteur } from './moteur.svelte';
  import type { PisteDom } from './pistes';
  import { brancherSession, etatSession } from './session';

  /**
   * Lecteur audio discret : apparaît APRÈS un appui sur « Écouter », se fixe en bas de l'écran au-dessus de la barre de
   * navigation, se ferme. RÉDUIT par défaut (21/10/2026, retour du client : le panneau cachait les questions des
   * exercices) : une pastille dans le coin, lecture / pause et « Régler » ; « Régler » le déplie (choix gardé sur
   * l'appareil), « × », Échap ou un toucher ailleurs le replient. Dans un exercice : pastille seule, visible
   * seulement pendant la lecture. Déplié : pause / lecture (reprise au même endroit), reculer et avancer de 5 s, barre de progression
   * glissable (seulement si l'audio dure plus de 20 s), phrase précédente et suivante, boucle (10 répétitions au
   * plus), vitesse 0,75 / 1 / 1,25 / 1,5 / 1,75 (voix à la même hauteur), lecture continue. Boutons de 44 px au moins, libellés
   * accessibles, couleurs des jetons du thème (clair et sombre). Les commandes restent de gauche à droite (usage
   * des lecteurs audio), même dans une interface en arabe.
   */
  let {
    moteur,
    titre,
    onfermer,
  }: { moteur: Moteur<PisteDom>; titre: string; onfermer: () => void } = $props();

  let bas = $state(0);
  let barre: HTMLElement | undefined = $state();
  let ouvert = $state(lireDeplie());
  const exercice = $derived(dansExercice(moteur.courante?.declencheur));
  const deplie = $derived(ouvert && !exercice);
  // dans un exercice, la pastille n'existe que pendant la lecture (une erreur reste dite)
  const cache = $derived(exercice && !moteur.lecture && !moteur.charge && !moteur.erreur);

  async function regler(v: boolean, garder = true) {
    ouvert = v;
    if (garder) garderDeplie(v);
    await tick();
    barre?.querySelector<HTMLElement>(v ? '.replier' : '.regler')?.focus();
  }
  // 26/10/2026 : un APPUI LONG sur la pastille ouvre les réglages (comme l'indice « ⋯ »), sans lancer ni arrêter le son
  let appui = 0;
  let long = false;
  const debutAppui = () => {
    // un nouvel appui annule toujours le « appui long » précédent : si le relâchement n'a pas produit de clic sur le lecteur
    // (la pastille s'est dépliée sous le pointeur), le premier toucher suivant (vitesse, ±5 s…) ne doit pas être avalé
    long = false;
    if (deplie || exercice) return;
    clearTimeout(appui);
    appui = window.setTimeout(() => {
      long = true;
      void regler(true);
    }, 550);
  };
  const finAppui = () => clearTimeout(appui);
  // un toucher hors du lecteur le replie (sans changer le choix gardé)
  $effect(() => {
    if (!deplie) return;
    const ailleurs = (e: PointerEvent) => {
      if (barre && !barre.contains(e.target as Node)) ouvert = false;
    };
    document.addEventListener('pointerdown', ailleurs, true);
    return () => document.removeEventListener('pointerdown', ailleurs, true);
  });

  // au-dessus de la barre de navigation quand elle est fixée en bas (téléphone), sinon au bord de l'écran
  function mesurer() {
    const nav = document.querySelector('nav.tabs');
    bas =
      nav && getComputedStyle(nav).position === 'fixed'
        ? Math.max(0, Math.round(window.innerHeight - nav.getBoundingClientRect().top))
        : 0;
  }
  $effect(() => {
    mesurer();
    window.addEventListener('resize', mesurer);
    return () => window.removeEventListener('resize', mesurer);
  });
  // le contenu de la page ne reste jamais caché derrière le lecteur
  $effect(() => {
    if (!barre || cache) return;
    const ro = new ResizeObserver(() => {
      document.body.style.paddingBottom = `${Math.ceil(barre!.offsetHeight + 12)}px`;
    });
    ro.observe(barre);
    return () => {
      ro.disconnect();
      document.body.style.paddingBottom = '';
    };
  });
  // commandes de l'écran verrouillé et des écouteurs
  $effect(() => brancherSession(moteur, titre));
  $effect(() => etatSession(moteur.lecture));
  // le bouton « Écouter » de la phrase en cours se montre « en lecture »
  $effect(() => {
    const el = moteur.courante?.declencheur;
    if (!el) return;
    el.classList.toggle('playing', moteur.lecture);
    el.setAttribute('aria-pressed', String(moteur.lecture));
    return () => {
      el.classList.remove('playing');
      el.removeAttribute('aria-pressed');
    };
  });
  // la page change : le lecteur se ferme (ses phrases ne sont plus à l'écran)
  afterNavigate((n) => {
    if (n.from && n.to && n.from.url.pathname !== n.to.url.pathname) onfermer();
  });

  const total = $derived(moteur.pistes.length);
  const position = $derived(
    t('lec.position', { n: fmtNumber(moteur.index + 1), total: fmtNumber(total) }),
  );
  const repetition = $derived(
    t('lec.repetition', {
      n: fmtNumber(moteur.repetitions),
      max: fmtNumber(MAX_REPETITIONS),
    }),
  );
  const fmtV = (v: number) => `${fmtNumber(v)}×`;
</script>

<!-- Échap (focus dans le lecteur) : replie le lecteur déplié, sinon le ferme (sans gêner les autres fenêtres de la page) -->
<svelte:window
  onkeydown={(e) => {
    if (e.key !== 'Escape' || !barre?.contains(document.activeElement)) return;
    if (deplie) void regler(false);
    else onfermer();
  }}
/>

{#snippet jouer()}
  <button
    type="button"
    class="b jouer"
    onclick={() => void moteur.basculer()}
    aria-label={moteur.lecture ? t('lec.pause') : t('lec.lecture')}
    title={moteur.lecture ? t('lec.pause') : t('lec.lecture')}
    aria-busy={moteur.charge}
    data-testid="lecteur-jouer"
    >{#if moteur.lecture}<svg viewBox="0 0 24 24" aria-hidden="true"
        ><path d="M7 5h4v14H7zM13 5h4v14h-4z" class="plein" /></svg
      >{:else}<svg viewBox="0 0 24 24" aria-hidden="true"
        ><path d="M8 5v14l11-7z" class="plein" /></svg
      >{/if}</button
  >
{/snippet}

<!-- appui long : raccourci de « Régler », qui reste un bouton) -->
<div
  class="lecteur"
  class:mini={!deplie}
  onpointerdown={debutAppui}
  onpointerup={finAppui}
  onpointerleave={finAppui}
  onpointercancel={finAppui}
  oncontextmenu={(e) => !deplie && e.preventDefault()}
  onclickcapture={(e) => {
    if (!long) return;
    long = false;
    e.stopPropagation();
    e.preventDefault();
  }}
  hidden={cache}
  role="region"
  aria-label={t('lec.nom')}
  data-testid="lecteur"
  data-deplie={deplie}
  style:bottom="{bas}px"
  bind:this={barre}
>
  <div class="haut" dir={deplie ? undefined : 'ltr'}>
    <p class="etat" class:sr={!deplie} aria-live="polite" data-testid="lecteur-etat">
      {#if moteur.erreur}<span role="alert"><Bidi text={t('lec.erreur')} /></span>{:else}<Bidi
          text={position}
        />{#if moteur.boucle}<span class="rep" data-testid="lecteur-rep">
            · <Bidi text={repetition} /></span
          >{/if}{/if}
    </p>
    {#if deplie}
      <button
        type="button"
        class="b replier"
        onclick={() => void regler(false)}
        aria-label={t('lec.replier')}
        title={t('lec.replier')}
        aria-expanded="true"
        aria-controls="lecteur-reglages"
        data-testid="lecteur-replier"
        ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button
      >
    {:else}
      {@render jouer()}
      {#if !exercice}
        <button
          type="button"
          class="b regler"
          onclick={() => void regler(true)}
          aria-label={t('lec.regler')}
          title={t('lec.regler')}
          aria-expanded="false"
          aria-controls="lecteur-reglages"
          data-testid="lecteur-regler"
          ><svg viewBox="0 0 24 24" aria-hidden="true"
            ><path d="M4 7h9M19 7h1M4 17h3M13 17h7" /><circle cx="16" cy="7" r="2.5" /><circle
              cx="10"
              cy="17"
              r="2.5"
            /></svg
          ><span class="indice" aria-hidden="true">⋯</span></button
        >
      {/if}
    {/if}
  </div>

  {#if deplie}
    <div id="lecteur-reglages">
      <div class="cmd" dir="ltr">
        <button
          type="button"
          class="b"
          onclick={() => void moteur.precedente()}
          disabled={moteur.index <= 0}
          aria-label={t('lec.precedente')}
          title={t('lec.precedente')}
          data-testid="lecteur-precedente"
          ><svg viewBox="0 0 24 24" aria-hidden="true"
            ><path d="M6 5v14" /><path d="M19 5 9 12l10 7z" class="plein" /></svg
          ></button
        >
        <button
          type="button"
          class="b"
          onclick={() => moteur.decaler(-SAUT_S)}
          aria-label={t('lec.recul', { s: fmtNumber(SAUT_S) })}
          title={t('lec.recul', { s: fmtNumber(SAUT_S) })}
          data-testid="lecteur-recul"
          ><svg viewBox="0 0 24 24" aria-hidden="true"
            ><path d="M12 5a7 7 0 1 1-6.7 5M4 4.5v6h6" /><text x="12" y="16" class="n">5</text></svg
          ></button
        >
        {@render jouer()}
        <button
          type="button"
          class="b"
          onclick={() => moteur.decaler(SAUT_S)}
          aria-label={t('lec.avance', { s: fmtNumber(SAUT_S) })}
          title={t('lec.avance', { s: fmtNumber(SAUT_S) })}
          data-testid="lecteur-avance"
          ><svg viewBox="0 0 24 24" aria-hidden="true"
            ><path d="M12 5a7 7 0 1 0 6.7 5M20 4.5v6h-6" /><text x="12" y="16" class="n">5</text
            ></svg
          ></button
        >
        <button
          type="button"
          class="b"
          onclick={() => void moteur.suivante()}
          disabled={moteur.index >= total - 1}
          aria-label={t('lec.suivante')}
          title={t('lec.suivante')}
          data-testid="lecteur-suivante"
          ><svg viewBox="0 0 24 24" aria-hidden="true"
            ><path d="M18 5v14" /><path d="M5 5l10 7-10 7z" class="plein" /></svg
          ></button
        >
      </div>

      {#if moteur.barre}
        <div class="prog" dir="ltr" data-testid="lecteur-barre">
          <span class="h"><Bidi text={horloge(moteur.temps)} /></span>
          <input
            type="range"
            min="0"
            max={moteur.duree}
            step="0.1"
            value={moteur.temps}
            oninput={(e) => moteur.aller(Number(e.currentTarget.value))}
            aria-label={t('lec.progression')}
            aria-valuetext={t('lec.temps', {
              t: horloge(moteur.temps),
              d: horloge(moteur.duree),
            })}
          />
          <span class="h"><Bidi text={horloge(moteur.duree)} /></span>
        </div>
      {/if}

      <div class="options" dir="ltr">
        <button
          type="button"
          class="b opt"
          class:actif={moteur.boucle}
          aria-pressed={moteur.boucle}
          onclick={() => moteur.basculerBoucle()}
          aria-label={t('lec.boucle')}
          title={t('lec.boucle_aide', { max: fmtNumber(MAX_REPETITIONS) })}
          data-testid="lecteur-boucle"
          ><svg viewBox="0 0 24 24" aria-hidden="true"
            ><path
              d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"
            /></svg
          ></button
        >
        <button
          type="button"
          class="b opt"
          class:actif={moteur.continu}
          aria-pressed={moteur.continu}
          onclick={() => moteur.basculerContinu()}
          aria-label={t('lec.continu')}
          title={t('lec.continu_aide')}
          data-testid="lecteur-continu"
          ><svg viewBox="0 0 24 24" aria-hidden="true"
            ><path d="M3 6h11M3 12h11M3 18h7" /><path d="M16 13v8l6-4z" class="plein" /></svg
          ></button
        >
        <span class="vit" role="group" aria-label={t('lec.vitesse')}>
          {#each VITESSES as v (v)}
            <button
              type="button"
              class="b v"
              class:actif={moteur.vitesse === v}
              aria-pressed={moteur.vitesse === v}
              aria-label={t('lec.vitesse_x', { v: fmtNumber(v) })}
              onclick={() => moteur.regler(v)}
              data-testid="lecteur-vitesse-{v}"><Bidi text={fmtV(v)} /></button
            >
          {/each}
        </span>
        <!-- arrêter et fermer : distinct du « × » qui replie seulement -->
        <button
          type="button"
          class="b"
          onclick={onfermer}
          aria-label={t('lec.fermer')}
          title={t('lec.fermer')}
          data-testid="lecteur-fermer"
          ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10H7z" class="plein" /></svg
          ></button
        >
      </div>
    </div>
  {/if}
</div>

<style>
  /* indice visible : la pastille se règle (vitesse, ±5 s…) */
  .indice {
    font-size: 16px;
    line-height: 1;
    margin-inline-start: 1px;
    font-weight: 700;
  }
  .lecteur {
    position: fixed;
    inset-inline: 0;
    z-index: 19;
    box-sizing: border-box;
    max-width: 560px;
    margin-inline: auto;
    padding: 8px 10px 6px;
    background: var(--card);
    color: var(--ink);
    border: 1px solid var(--line);
    border-bottom: 0;
    border-radius: 14px 14px 0 0;
    box-shadow: 0 -8px 24px -14px rgba(0, 0, 0, 0.45);
  }
  @media (min-width: 900px) {
    .lecteur {
      margin-bottom: 12px;
      border-bottom: 1px solid var(--line);
      border-radius: 14px;
    }
  }
  .lecteur[hidden] {
    display: none;
  }
  /* réduit : une pastille dans le coin (lecture / pause et « Régler »), qui ne couvre pas la largeur de la page */
  .lecteur.mini {
    inset-inline: auto 12px;
    margin: 0 0 8px;
    padding: 4px;
    border: 1px solid var(--line);
    border-radius: 30px;
  }
  .mini .haut {
    gap: 4px;
    min-height: 0;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .haut {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 44px;
  }
  .rep {
    margin-inline-start: 0.35em;
  }
  .etat {
    margin: 0;
    font-size: 0.85rem;
    color: var(--ink2);
  }
  .cmd,
  .options {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .options {
    flex-wrap: wrap;
    margin-top: 2px;
  }
  .vit {
    display: inline-flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 4px;
    margin-inline-start: 8px;
  }
  /* un bouton : 44 px au moins, sans le cadre épais des boutons de formulaire */
  .b {
    box-sizing: border-box;
    min-width: 44px;
    min-height: 44px;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 2px solid transparent;
    border-radius: 50%;
    background: transparent;
    color: var(--teal);
  }
  .b:hover:not(:disabled) {
    border-color: var(--primary);
  }
  .b:disabled {
    opacity: 0.4;
  }
  .b:focus-visible,
  input:focus-visible {
    outline: 3px solid var(--gold);
    outline-offset: 2px;
  }
  .b svg {
    width: 24px;
    height: 24px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .b svg .plein {
    stroke: none;
    fill: currentColor;
  }
  .b svg .n {
    fill: currentColor;
    stroke: none;
    font: 700 8px var(--font-ui, sans-serif);
    text-anchor: middle;
  }
  .jouer {
    width: 52px;
    height: 52px;
    background: var(--primary);
    border-color: var(--primary);
    color: var(--on-primary);
  }
  .jouer:hover:not(:disabled) {
    border-color: var(--gold);
  }
  .opt.actif,
  .v.actif {
    background: var(--primary-soft);
    border-color: var(--primary);
    color: var(--primary);
  }
  .v {
    width: auto;
    min-width: 44px;
    padding-inline: 8px;
    border-radius: 22px;
    font-size: 0.85rem;
    font-weight: 700;
  }
  .prog {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .prog input {
    flex: 1;
    min-width: 0;
    min-height: 44px;
    accent-color: var(--primary);
  }
  .h {
    min-width: 2.6em;
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
    color: var(--ink2);
  }
  /* la phrase en cours : fond doux du thème (clair et sombre), jamais la couleur seule : la barre dit « Phrase n sur N » */
  :global(.lecteur-actif) {
    background: var(--primary-soft);
    box-shadow: 0 0 0 4px var(--primary-soft);
    outline: 3px solid var(--primary);
    outline-offset: 4px;
    border-radius: 6px;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
  }
  @media (prefers-reduced-motion: reduce) {
    .b {
      transition: none;
    }
  }
</style>
