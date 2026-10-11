<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Ar from '$lib/Ar.svelte';
  import Bidi from '$lib/Bidi.svelte';
  import Ecouter from '$lib/Ecouter.svelte';
  import Scene from '$lib/Scene.svelte';
  import { t } from '$lib/i18n';
  import type { Scenario } from './scenario';
  import { garderMots } from './mesmots';

  /**
   * A26b, phase 1 — écran « Je parle » (scénario guidé SANS IA, chargé à la demande depuis la leçon).
   *  - décor de la scène du livre (lieu, objets) : AUCUN visage, aucun personnage ; la réplique du partenaire
   *    s'écrit dans le décor (calligraphie animée sobre, coupée si l'appareil demande moins de mouvement) ;
   *  - réplique arabe vocalisée SUR SA PROPRE LIGNE, traduction dessous (bouton « Traduction ») ;
   *  - choix en gros boutons ; bonne réponse → réplique suivante ; erreur → aide douce (jamais de rouge, jamais
   *    de note) ; audio des leçons seulement s'il existe pour la phrase (Ecouter), jamais de synthèse ;
   *  - lecteur d'écran : chaque nouvelle réplique est annoncée (zone « polite »), noms écrits.
   */
  let { scenario, onclose }: { scenario: Scenario; onclose: () => void } = $props();

  type Ligne = { qui: string; qui_ar?: string; ar: string; fr?: string; moi: boolean };
  let pos = $state(0);
  let lignes: Ligne[] = $state([]);
  let traduction = $state(false);
  let erreurs = $state(0);
  let aide: 'presque' | 'reprendre' | null = $state(null);
  let ecartes: number[] = $state([]);
  let motsMsg = $state('');
  const fin = $derived(pos >= scenario.tours.length);
  const tour = $derived(scenario.tours[pos]);
  const etape = $derived(tour?.t === 'eleve' ? tour : null);
  const derniere = $derived(lignes.at(-1));
  let titre: HTMLElement | undefined = $state();

  /** avance jusqu'au prochain tour de l'élève, en ajoutant les répliques du partenaire */
  function avancer() {
    while (pos < scenario.tours.length) {
      const x = scenario.tours[pos]!;
      if (x.t === 'eleve') break;
      lignes.push({ qui: x.qui, qui_ar: x.qui_ar, ar: x.ar, fr: x.fr, moi: false });
      pos++;
    }
  }
  function demarrer() {
    pos = 0;
    lignes = [];
    erreurs = 0;
    aide = null;
    ecartes = [];
    motsMsg = '';
    avancer();
  }
  demarrer();

  async function choisir(i: number) {
    if (!etape) return;
    const c = etape.choix[i]!;
    if (c.kind !== 'bonne') {
      erreurs++;
      aide = c.kind;
      if (!ecartes.includes(i)) ecartes.push(i);
      return;
    }
    lignes.push({ qui: etape.qui, qui_ar: etape.qui_ar, ar: c.ar, fr: c.fr, moi: true });
    pos++;
    erreurs = 0;
    aide = null;
    ecartes = [];
    avancer();
    await tick();
    if (pos >= scenario.tours.length) titre?.focus();
  }

  async function mots() {
    const n = await garderMots(
      scenario.mots
        .filter((m) => m.fr)
        .map((m) => ({ ar: m.ar, fr: m.fr!, img: m.img, unit: scenario.id })),
    ).catch(() => 0);
    motsMsg = t('conv.mots_gardes', { n });
  }
  /** nom français du personnage (clé du livre → libellé : « Grandpere » → « Grand-père ») */
  const PERSOS = ['Grandpere', 'Grandmere', 'Papa', 'Maman', 'Imam', 'Hadj'];
  const persoFr = (qui: string) => (PERSOS.includes(qui) ? t(`conv.perso.${qui}`) : qui);
  const titreFr = $derived(
    scenario.titre_fr ? `${t('conv.titre')} · ${scenario.titre_fr}` : t('conv.titre'),
  );

  // écran plein (fenêtre modale) : la leçon dessous — dont son dialogue — n'est ni visible ni lue tant que
  // l'élève joue (la réplique à choisir n'apparaît jamais avant son choix) ; Échap ferme
  onMount(() => {
    document.body.classList.add('jp-ouvert');
    void tick().then(() => titre?.focus());
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onclose();
    };
    window.addEventListener('keydown', k);
    return () => {
      document.body.classList.remove('jp-ouvert');
      window.removeEventListener('keydown', k);
    };
  });
</script>

<div
  class="jeparle"
  data-testid="je-parle"
  role="dialog"
  aria-modal="true"
  aria-labelledby="jp-titre"
>
  <div class="tete">
    <h2 id="jp-titre" tabindex="-1" bind:this={titre}>
      {#if scenario.titre_ar}<Ar text={scenario.titre_ar} block />{/if}
      <span><Bidi text={titreFr} /></span>
    </h2>
    <button type="button" class="fermer" onclick={onclose} data-testid="jp-fermer"
      >{t('conv.fermer')}</button
    >
  </div>
  <p class="role fr">
    <Bidi text={t('conv.tu_joues', { qui: persoFr(scenario.role.qui) })} />
    {#if scenario.role.qui_ar}<span lang="ar" class="ar"
        ><Bidi text={scenario.role.qui_ar} base="ar" /></span
      >{/if}
  </p>
  <p>
    <button
      type="button"
      class="trad"
      aria-pressed={traduction}
      onclick={() => (traduction = !traduction)}
      data-testid="jp-traduction">{t('conv.traduction')}</button
    >
  </p>

  <div class="decor">
    <Scene spec={{ lieu: scenario.scene.lieu, props: scenario.scene.props, decor_seul: true }} />
    {#if derniere && !derniere.moi}
      {#key lignes.length}
        <div class="calli" aria-hidden="true">
          <span class="trait" lang="ar" dir="rtl"><Ar text={derniere.ar} block /></span>
        </div>
      {/key}
    {/if}
  </div>

  <ol class="fil" aria-live="polite" data-testid="jp-fil">
    {#each lignes as l, i (i)}
      <li class="rep" class:moi={l.moi} data-testid={l.moi ? 'jp-moi' : 'jp-partenaire'}>
        <p class="qui">
          {#if l.qui_ar}<span lang="ar"><Bidi text={l.qui_ar} base="ar" /></span><span
              class="sep"
              aria-hidden="true">·</span
            >{/if}<Bidi text={persoFr(l.qui)} />
        </p>
        <Ar text={l.ar} block /><Ecouter text={l.ar} />
        {#if traduction && l.fr}<p class="fr sens"><Bidi text={l.fr} /></p>{/if}
      </li>
    {/each}
  </ol>

  {#if etape}
    <div class="tour" data-testid="jp-tour">
      <p class="consigne fr">
        <Bidi text={t('conv.a_toi', { qui: persoFr(etape.qui) })} />
      </p>
      {#if aide}
        <p class="aide fr" role="status" data-testid="jp-aide">
          <Bidi text={t(aide === 'presque' ? 'conv.presque' : 'conv.reprendre')} />
          {#if erreurs >= 2}<br /><Bidi text={t('conv.aide')} />{/if}
        </p>
      {/if}
      <ul class="choix" aria-label={t('conv.choix')}>
        {#each etape.choix as c, i (i)}
          <li>
            <button
              type="button"
              class="choixbtn"
              class:ecarte={ecartes.includes(i)}
              data-testid="jp-choix"
              data-kind={c.kind}
              onclick={() => choisir(i)}
            >
              <Ar text={c.ar} block />
              {#if (traduction || erreurs >= 2) && c.fr}<span class="fr sens"
                  ><Bidi text={c.fr} /></span
                >{/if}
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if fin}
    <div class="fin" data-testid="jp-fin">
      <p class="bravo fr" role="status"><Bidi text={t('conv.fin')} /></p>
      {#if scenario.mots.length}
        <h3 class="fr">{t('conv.mots')}</h3>
        <ul class="mots">
          {#each scenario.mots as m, i (i)}<li>
              <Ar text={m.ar} /><Ecouter text={m.ar} small />
              {#if m.fr}<span class="fr"><Bidi text={m.fr} /></span>{/if}
            </li>{/each}
        </ul>
        <p>
          <button type="button" onclick={mots} data-testid="jp-garder-mots"
            >{t('conv.garder_mots')}</button
          >
          {#if motsMsg}<span class="fr" role="status" data-testid="jp-mots-msg"
              ><Bidi text={motsMsg} /></span
            >{/if}
        </p>
      {/if}
      <p>
        <button type="button" class="primary" onclick={demarrer} data-testid="jp-rejouer"
          >{t('conv.rejouer')}</button
        >
      </p>
    </div>
  {/if}
</div>

<style>
  .jeparle {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    position: fixed;
    inset: 0;
    z-index: 1000;
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--paper);
    padding: var(--space-m) max(var(--space-m), calc((100vw - 760px) / 2));
  }
  /* leçon dessous : masquée (et hors du lecteur d'écran) pendant la scène */
  :global(body.jp-ouvert) {
    overflow: hidden;
  }
  :global(body.jp-ouvert .dlg),
  :global(body.jp-ouvert .vivante-hote) {
    visibility: hidden;
  }
  .tete {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-s);
  }
  .tete h2 {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .tete h2 span {
    font-size: 1rem;
  }
  .role,
  .consigne {
    margin: 0;
    color: var(--ink2);
  }
  .role .ar {
    font-family: var(--font-ar);
    margin-inline-start: 6px;
  }
  button {
    min-height: var(--target);
  }
  .trad[aria-pressed='true'] {
    background: var(--primary-soft);
    border-color: var(--primary);
  }
  .decor {
    position: relative;
  }
  /* calligraphie vivante, sobre : la réplique s'écrit de droite à gauche dans le décor */
  .calli {
    position: absolute;
    inset-inline: 14%;
    top: 6%;
    padding: 4px 12px;
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--card) 82%, transparent);
    color: var(--navy);
    font-size: 0.9em;
    text-align: center;
    pointer-events: none;
  }
  .calli :global(.ar),
  .calli :global(.ar-long) {
    font-size: 1.15rem;
    margin: 0;
    line-height: 1.6;
  }
  .calli .trait {
    display: block;
    animation: ecrire 1.6s ease-out both;
  }
  .calli::after {
    content: '';
    display: block;
    height: 2px;
    margin: 2px auto 0;
    background: var(--gold);
    border-radius: 2px;
    animation: trait 1.6s ease-out both;
  }
  @keyframes ecrire {
    from {
      clip-path: inset(0 0 0 100%);
      opacity: 0.2;
    }
    to {
      clip-path: inset(0 0 0 0);
      opacity: 1;
    }
  }
  @keyframes trait {
    from {
      width: 0;
    }
    to {
      width: 60%;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .calli .trait,
    .calli::after {
      animation: none;
    }
    .calli::after {
      width: 60%;
    }
  }
  .fil {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
  }
  .rep {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    padding: var(--space-s) var(--space-m);
    margin-inline-end: 12%;
  }
  .rep.moi {
    background: var(--primary-soft);
    margin-inline-end: 0;
    margin-inline-start: 12%;
  }
  .qui .sep {
    margin-inline: 0.35em;
  }
  .qui {
    margin: 0;
    font-size: 0.85rem;
    color: var(--ink2);
    font-weight: 700;
  }
  .sens {
    display: block;
    margin: 4px 0 0;
    color: var(--ink2);
    font-size: 0.95rem;
  }
  .aide {
    margin: 0;
    background: var(--info-bg);
    color: var(--info);
    border-radius: var(--radius-md);
    padding: var(--space-s) var(--space-m);
  }
  .choix {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
  }
  .choixbtn {
    width: 100%;
    /* phrase arabe sur sa ligne, traduction DESSOUS (jamais sur la même ligne) */
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    min-height: 64px;
    text-align: start;
    padding: var(--space-s) var(--space-m);
    border: 2px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--card);
    color: var(--ink);
  }
  .choixbtn:hover,
  .choixbtn:focus-visible {
    border-color: var(--primary);
  }
  /* choix déjà essayé : simplement plus discret (jamais de rouge) */
  .choixbtn.ecarte {
    opacity: 0.6;
    border-style: dashed;
  }
  .bravo {
    font-weight: 700;
    color: var(--ok-ink);
    background: var(--ok-bg);
    border-radius: var(--radius-md);
    padding: var(--space-s) var(--space-m);
  }
  .mots {
    padding-inline-start: 1.2em;
  }
  .jeparle h2,
  .jeparle h3 {
    font-family: var(--font-title);
  }
  [data-testid='jp-mots-msg'] {
    display: block;
    margin-top: 6px;
  }
  .mots li {
    margin: 4px 0;
  }
</style>
