<script lang="ts">
  import { onDestroy, setContext } from 'svelte';
  import { resolve } from '$app/paths';
  import Bidi from '$lib/Bidi.svelte';
  import { TYPO_FR } from '$lib/bidi/typo-fr';
  import { demoProfileFor } from '$lib/attempts';
  import { levelAudio, stopLessonAudio, type LevelAudio } from '$lib/lecons-audio';
  import { t } from '$lib/i18n';
  import {
    chargerParler,
    ecrireProgres,
    etapeFranchie,
    lireProgres,
    progresVide,
    type CahierParler,
    type Etape,
    type ProgresParler,
  } from './donnees';
  import EtapeVue from './EtapeVue.svelte';
  import Picto from './Picto.svelte';

  /**
   * Cahier « Je parle » (24/10/2026) — « carnet de voyageur » (DESIGN_CAHIERS_PARLER.md) : sans `?e`, la carte du
   * voyage (parties, étapes reliées par un chemin pointillé) ; `?e=e02` : l'ouverture d'une étape ; `&p=P019` : une
   * de ses pages ; `&p=antiseche` : ses phrases utiles. Hors ligne d'abord : le cahier, sa progression (6 cases,
   * bilans) et l'audio téléchargé du niveau sont lus sur l'appareil.
   */
  setContext(TYPO_FR, true); // typographie française à l'affichage (jamais dans l'arabe)
  let {
    niveau,
    etapeId,
    pageId,
  }: { niveau: string; etapeId: string | null; pageId: string | null } = $props();
  let cahier = $state<CahierParler | null>(null);
  let nouveau = $state<CahierParler | null>(null);
  let erreur = $state(false);
  let audio = $state<LevelAudio | null>(null);
  let profil = $state<string | null>(null);
  let progres = $state<ProgresParler>(progresVide());

  async function charger() {
    erreur = false;
    const n = niveau;
    const [c, p] = await Promise.all([
      chargerParler(n, (x) => (nouveau = x)),
      demoProfileFor(n).catch(() => null),
    ]);
    if (n !== niveau) return;
    if (!c) {
      erreur = true;
      return;
    }
    cahier = c;
    profil = p?.id ?? null;
    progres = await lireProgres(n, profil);
    void levelAudio(n).then((a) => {
      if (n === niveau) audio = a;
    });
  }
  $effect(() => {
    void niveau;
    void charger();
  });
  // une autre page : la page commence en haut
  $effect(() => {
    void etapeId;
    void pageId;
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  });
  onDestroy(stopLessonAudio);

  function sauver(p: ProgresParler) {
    progres = p;
    void ecrireProgres(niveau, profil, p);
  }
  const base = $derived(resolve('/cahier-parler/[niveau]', { niveau }));
  const etape = $derived(cahier?.etapes.find((e) => e.id === etapeId) ?? null);
  const parParties = $derived(
    (cahier?.parties ?? []).map((pa) => ({
      pa,
      etapes: cahier!.etapes.filter((e) => e.partie === pa.n),
    })),
  );
  const finale = $derived(cahier?.etapes.filter((e) => e.partie === 0) ?? []);
  /** série du niveau : "ad" (adultes), "en" (enfants), "ado" (ados) */
  const serie = $derived(niveau.replace(/\d+$/, ''));
  const quand = (e: Etape) => (e.n ? t('parler.apres', { n: e.n }) : t('parler.avant'));
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- chemin résolu (resolve), suivi des paramètres d'étape et de page -->
<div class="parler serie-{serie}" data-serie={serie} data-testid="parler">
  {#if nouveau}
    <p class="maj" role="status">
      <Bidi text={t('parler.nouvelle_version')} />
      <button
        type="button"
        class="bouton"
        onclick={() => {
          cahier = nouveau;
          nouveau = null;
        }}>{t('parler.mettre_a_jour')}</button
      >
    </p>
  {/if}
  {#if erreur}
    <section class="carte" role="alert">
      <p><Bidi text={t('parler.erreur')} /></p>
      <button type="button" class="bouton" onclick={charger}>{t('parler.reessayer')}</button>
    </section>
  {:else if !cahier}
    <p class="attente" aria-busy="true"><Bidi text={t('parler.charge')} /></p>
  {:else if etape}
    {#key `${etape.id}/${pageId}`}
      <EtapeVue {cahier} {etape} {pageId} {audio} {progres} {sauver} {base} />
    {/key}
  {:else}
    <p class="nav">
      <a href={resolve('/niveaux/[code]', { code: niveau })}>{t('parler.retour_livre')}</a>
    </p>
    <header class="bandeau">
      <p class="sur"><Bidi text={t('parler.sur')} /></p>
      <h1><Bidi text={cahier.titre} /></h1>
    </header>
    <section class="intro carte">
      <h2><Bidi text={t('parler.intro_titre')} /></h2>
      <ul>
        {#each [1, 2, 3, 4] as i (i)}<li>
            <Bidi
              text={t(i === 3 && serie !== 'ad' ? 'parler.intro_3_jeune' : `parler.intro_${i}`)}
            />
          </li>{/each}
      </ul>
    </section>
    {#each parParties as { pa, etapes } (pa.n)}
      <section class="partie" style={`--acc: var(--acc-${pa.n})`} data-partie={pa.n}>
        <h2 class="bande-partie">
          <span class="sur"
            ><Bidi text={t('parler.partie', { n: pa.n })} /> · <Bidi text={pa.lecons} /></span
          >
          <span class="nom"><Bidi text={pa.nom} /></span>
        </h2>
        <ol class="chemin">
          {#each etapes as e (e.id)}
            <li>
              <a
                class="etape"
                class:franchie={etapeFranchie(e, progres)}
                class:fin={e.fin}
                href={`${base}?e=${e.id}`}
                data-etape={e.id}
              >
                <span class="rond" aria-hidden="true"
                  >{#if e.fin}<Picto nom="etoile" taille={22} />{:else}<Bidi
                      text={e.num ?? ''}
                    />{/if}</span
                >
                <span class="corps">
                  <span class="titre"
                    >{#if e.fin}<Bidi text={t('parler.fin', { n: pa.n })} />{:else}<Bidi
                        text={t('parler.etape', { n: e.num ?? '' })}
                      /> · <Bidi text={e.titre} />{/if}</span
                  >
                  <span class="quand"
                    >{#if etapeFranchie(e, progres)}<Bidi text={t('parler.franchie')} />{:else}<Bidi
                        text={quand(e)}
                      />{/if}</span
                  >
                </span>
                {#if !e.fin}<span class="picto-mini"><Picto nom={e.picto} taille={30} /></span>{/if}
              </a>
            </li>
          {/each}
        </ol>
      </section>
    {/each}
    {#each finale as e (e.id)}
      <a class="etape fin finale" href={`${base}?e=${e.id}`} data-etape={e.id}>
        <span class="rond" aria-hidden="true"><Picto nom="etoile" taille={22} /></span>
        <span class="corps"
          ><span class="titre"><Bidi text={e.pages[0]?.titre ?? t('parler.finale')} /></span></span
        >
      </a>
    {/each}
  {/if}
</div>

<style>
  /* charte « carnet de voyageur » sur les jetons du thème (clair et sombre suivent l'application) ; une couleur d'accent
     par partie (bandeau et cercle de numéro seulement), texte ivoire dessus : contraste AA dans les deux modes */
  .parler {
    --acc-1: #1f5e47;
    --acc-2: #7a5c1c;
    --acc-3: #2c4a6e;
    --acc-4: #9a5636;
    --acc-5: #5a6830;
    --acc: var(--acc-1);
    --sur-acc: #fffdf7;
    --pa-or: var(--or-line, var(--gold));
    max-width: 52rem;
    margin: 0 auto;
    padding-bottom: 1rem;
  }
  /* variantes de style (25/10/2026) : gros caractères pour les enfants, un peu plus gros pour les ados */
  .serie-en {
    --parler-ar: 2.15rem;
    --parler-ar-grand: 2.6rem;
    --parler-ar-ligne: 1.85rem;
  }
  .serie-ado {
    --parler-ar: 1.8rem;
    --parler-ar-grand: 2.15rem;
    --parler-ar-ligne: 1.6rem;
  }
  .parler :global(.nav) {
    margin: 0 0 0.5rem;
  }
  .parler :global(.nav a) {
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
    padding: 1.1rem 1.25rem 1rem;
    margin-bottom: 0.75rem;
  }
  .bandeau::after,
  .bande-partie::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: var(--motif-etoile);
    pointer-events: none;
  }
  .sur {
    display: block;
    margin: 0;
    font: 600 0.75rem/1.3 var(--font-title);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .bandeau h1 {
    margin: 0.35rem 0 0;
    font: 600 1.35rem/1.25 var(--font-title);
    color: inherit;
  }
  .parler :global(.carte) {
    padding: 0.9rem 1rem;
    border-radius: var(--radius-md, 14px);
    background: var(--card);
    border: 1px solid var(--line);
    margin: 0.6rem 0;
  }
  .intro h2 {
    margin: 0 0 0.4rem;
    font: 600 1.05rem/1.3 var(--font-title);
    color: var(--ink);
  }
  .intro ul {
    margin: 0;
    padding-inline-start: 1.2rem;
    color: var(--ink2);
  }
  .intro li {
    margin: 0.3rem 0;
  }
  .partie {
    margin: 1.2rem 0 0.4rem;
  }
  .bande-partie {
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    margin: 0 0 0.5rem;
    padding: 0.7rem 1rem;
    border-radius: var(--radius-md, 14px);
    background: var(--acc);
    color: var(--sur-acc);
  }
  .bande-partie .nom {
    font: 600 1.05rem/1.3 var(--font-title);
  }
  .chemin {
    position: relative;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  /* le chemin pointillé qui relie les étapes de la partie */
  .chemin::before {
    content: '';
    position: absolute;
    inset-inline-start: 1.85rem;
    top: 1.2rem;
    bottom: 1.2rem;
    border-inline-start: 2px dashed var(--pa-or);
  }
  .etape {
    position: relative;
    display: grid;
    grid-template-columns: 2.6rem 1fr auto;
    gap: 0 0.7rem;
    align-items: center;
    min-height: 3.25rem;
    padding: 0.5rem 0.75rem;
    margin: 0.4rem 0;
    background: var(--card);
    border: 1.5px solid var(--line);
    border-radius: var(--radius-md, 14px);
    color: var(--ink);
    text-decoration: none;
  }
  .rond {
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 999px;
    background: var(--acc);
    color: var(--sur-acc);
    border: 2px solid var(--pa-or);
    font: 700 0.95rem var(--font-title);
  }
  .etape.fin .rond {
    background: var(--card);
    color: var(--ink);
  }
  .corps {
    display: flex;
    flex-direction: column;
  }
  .titre {
    font-weight: 700;
  }
  .quand {
    font-size: 0.82rem;
    color: var(--ink2);
  }
  .picto-mini {
    color: var(--pa-or);
    display: grid;
  }
  .etape.franchie {
    border-color: var(--primary);
    background: var(--primary-soft);
  }
  .etape.franchie .quand {
    color: var(--ok-ink);
    font-weight: 700;
  }
  .finale {
    margin-top: 1.2rem;
  }
  .parler :global(.bouton) {
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
    font: inherit;
    font-weight: 700;
    text-decoration: none;
    cursor: pointer;
  }
  .parler :global(.bouton.plein) {
    background: var(--primary);
    color: var(--on-primary);
  }
  .maj {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius-md, 14px);
    background: var(--info-bg);
  }
</style>
