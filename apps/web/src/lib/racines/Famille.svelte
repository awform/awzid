<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { fmtNumber, t } from '$lib/i18n';
  import { chargerFamille, type Etat } from './donnees';
  import {
    auDessus,
    decoupeVerset,
    lettresRacine,
    pastille,
    plagesRacine,
    questions,
    refVerset,
    segments,
    type EntreeIndex,
    type Famille,
    type Index,
    type Mot,
  } from './logique';

  /**
   * Une famille de mots en 7 étapes (maquette MAQUETTE_ECRAN.md) : accroche · racine · moule · cousins · vérifier · ancrer · suite.
   * Profil enfant : 6 étapes (pas de moule), seulement les 2 ou 3 mots marqués. Une seule idée par écran, un seul gros bouton en bas.
   * La racine est toujours en or ; le texte du Coran est celui de Tanzil tel quel ; l'écoute est le récitateur humain de l'application.
   */
  let {
    entree,
    idx,
    profil,
    niveau,
    connus,
    enfant,
    suivante,
    onchoisir,
    onretour,
  }: {
    entree: EntreeIndex;
    idx: Index;
    profil: string | null;
    niveau: number | null;
    connus: ReadonlySet<number> | null;
    enfant: boolean;
    suivante: (id: number | undefined) => EntreeIndex | null;
    onchoisir: (f: EntreeIndex) => void;
    onretour: () => void;
  } = $props();

  let fam = $state<Famille | null>(null);
  let etatF = $state<Etat | 'attente'>('attente');
  let etape = $state(0);
  let k = $state(0);
  let moulePose = $state<number | null>(null);
  let reponses = $state<Array<number | undefined>>([]);

  async function charger() {
    etatF = 'attente';
    const r = await chargerFamille(entree.i, profil, enfant);
    fam = r.data;
    etatF = r.etat;
  }
  onMount(() => void charger());

  const par = $derived(new Map((fam?.mots ?? []).map((m) => [m.n, m])));
  /** les mots dans l'ordre de l'écran (accroche en premier) */
  const mots = $derived(fam ? fam.o.map((n) => par.get(n)).filter((m): m is Mot => !!m) : []);
  const accroche = $derived(fam ? (par.get(fam.a) ?? mots[0]) : undefined);
  /** le premier cousin qui a un moule (étape « Le moule ») ; aucun : l'étape est sautée */
  const moulant = $derived(mots.find((m) => m.m !== '' && m.ml.length > 0));
  const etapes = $derived([
    'accroche',
    'racine',
    ...(!enfant && moulant ? ['moule'] : []),
    'cousins',
    'verifier',
    'ancrer',
    'suite',
  ] as string[]);
  const nom = (e: string | undefined) => (e ? t(`rc.e_${e}`) : '');
  const courante = $derived(etapes[etape] ?? 'accroche');
  const qs = $derived(fam ? questions(fam, idx, mots) : []);
  const bonnes = $derived(qs.filter((q, i) => reponses[i] === q.bon).length);
  const pastilleData = $derived(connus && !enfant ? pastille(idx, entree, connus) : null);
  const suiv = $derived(fam ? suivante(fam.u) : null);
  const pts = (x: number) => fmtNumber(Math.round(x * 100) / 100, { maximumFractionDigits: 2 });

  function continuer() {
    arreter();
    if (courante === 'suite') {
      if (suiv) {
        onchoisir(suiv);
        return;
      }
      onretour();
      return;
    }
    etape = Math.min(etape + 1, etapes.length - 1);
  }
  const peutContinuer = $derived(
    courante !== 'verifier' || qs.every((_, i) => reponses[i] !== undefined),
  );

  // ---- écoute : récitateur humain (le même qu'ailleurs dans l'application), jamais de voix de synthèse
  let son: HTMLAudioElement | null = null;
  let joue = $state(false);
  let indispo = $state(false);
  function arreter() {
    son?.pause();
    joue = false;
  }
  async function ecouter(ref: string) {
    if (joue) return arreter();
    indispo = false;
    const m = await import('$lib/recitation/ayyub');
    const src = await m.sourceRecitation(ref).catch(() => null);
    if (!src) return void (indispo = true);
    son ??= new Audio();
    const a = son;
    a.onended = () => (joue = false);
    a.onpause = () => (joue = false);
    a.onplay = () => (joue = true);
    a.src = src.url;
    try {
      await a.play();
      void import('$lib/lecteur/ouvrir').then((o) => o.piloter(a)).catch(() => {});
    } catch {
      indispo = true;
    }
  }
  onDestroy(arreter);

  const cle = (m: Mot) => m.n;
  function repondre(q: number, c: number) {
    if (reponses[q] === undefined) reponses[q] = c;
  }
  const freqTexte = (n: number) => (n === 1 ? t('rc.freq_une') : t('rc.freq', { n: fmtNumber(n) }));
</script>

{#snippet arabe(m: Mot, avecRacine: boolean, taille: string)}
  <span class="ar" style:font-size={taille} lang="ar" dir="rtl"
    >{#each avecRacine ? segments(m.f, plagesRacine(m)) : [{ t: m.f, r: false }] as s, j (j)}{#if s.r}<span
          class="r"><Bidi text={s.t} base="ar" /></span
        >{:else}<Bidi text={s.t} base="ar" />{/if}{/each}</span
  >
{/snippet}

{#snippet verset(m: Mot)}
  {@const d = decoupeVerset(m.x)}
  {@const [sr, ay] = refVerset(m.x.r)}
  <div class="verset" data-testid="rc-verset">
    <p class="q quran-text" lang="ar" dir="rtl">
      {#if m.x.x}…{/if}{d.avant}<span class="c">{d.mot}</span>{d.apres}{#if m.x.x}…{/if}
    </p>
    <div class="bas">
      <span class="src"><Bidi text={t(m.x.x ? 'rc.extrait' : 'rc.verset', { ref: m.x.r })} /></span>
      <button
        type="button"
        class="ecoute"
        aria-pressed={joue}
        onclick={() => void ecouter(`${sr}:${ay}`)}
        data-testid="rc-ecouter"
      >
        <Bidi text={joue ? t('rc.arreter') : t('rc.ecouter')} />
      </button>
    </div>
    {#if indispo}<p class="petit" role="status"><Bidi text={t('rc.ecoute_indispo')} /></p>{/if}
  </div>
{/snippet}

{#snippet notes(m: Mot)}
  {#each m.ln as n, j (j)}<p class="note"><Bidi text={n} /></p>{/each}
{/snippet}

<div class="famille" data-testid="rc-famille-vue" data-etape={courante}>
  {#if etatF === 'attente'}
    <p class="petit" aria-busy="true"><Bidi text={t('rc.chargement')} /></p>
  {:else if etatF !== 'ok' || !fam || !accroche}
    <p class="petit" role="status">
      <Bidi text={t(etatF === 'hors_ligne' ? 'rc.hors_ligne' : 'rc.indisponible')} />
    </p>
    <button type="button" class="go" onclick={() => void charger()}
      ><Bidi text={t('rc.reessayer')} /></button
    >
    <button type="button" class="lien" onclick={onretour}><Bidi text={t('rc.retour')} /></button>
  {:else}
    <header>
      <button type="button" class="lien" onclick={onretour} data-testid="rc-retour"
        ><Bidi text={t('rc.retour')} /></button
      >
      <div class="fil" role="img" aria-label={t('rc.fil', { i: etape + 1, n: etapes.length })}>
        {#each etapes as _, j (j)}<i class:fait={j < etape} class:ici={j === etape}></i>{/each}
      </div>
      <div class="ou" data-testid="rc-ou">
        <b><Bidi text={t('rc.etape', { i: etape + 1, n: etapes.length, nom: nom(courante) })} /></b>
        <span
          ><Bidi
            text={etape < etapes.length - 1
              ? t('rc.ensuite', { nom: nom(etapes[etape + 1]) })
              : t('rc.dernier')}
          /></span
        >
      </div>
    </header>

    <main aria-live="polite">
      {#if courante === 'accroche'}
        <h2><Bidi text={nom('accroche')} /></h2>
        <div class="panneau allume">{@render arabe(accroche, true, '64px')}</div>
        <p class="sens"><Bidi text={accroche.s} /></p>
        {@render verset(accroche)}
      {:else if courante === 'racine'}
        <h2><Bidi text={nom('racine')} /></h2>
        <div class="panneau">{@render arabe(accroche, true, '48px')}</div>
        <div
          class="tuiles"
          role="img"
          aria-label={t('rc.racine_lettres', { lettres: lettresRacine(fam.r).join(', ') })}
        >
          {#each lettresRacine(fam.r) as l, j (j)}<span class="tuile"
              ><span class="ar" lang="ar"><Bidi text={l} base="ar" /></span></span
            >{/each}
        </div>
        <p class="petit"><Bidi text={t('rc.racine_idee', { sens: fam.s })} /></p>
        {@render notes(accroche)}
      {:else if courante === 'moule' && moulant}
        <h2><Bidi text={nom('moule')} /></h2>
        <p class="petit"><Bidi text={t('rc.moule_intro')} /></p>
        <div class="eq">
          <div class="tuiles">
            {#each lettresRacine(fam.r) as l, j (j)}<span class="tuile petite"
                ><span class="ar" lang="ar"><Bidi text={l} base="ar" /></span></span
              >{/each}
          </div>
          <span class="plus" aria-hidden="true">+</span>
          <span class="moule"
            ><span class="ar" lang="ar" dir="rtl"
              >{#each segments(moulant.m, moulant.ml) as s, j (j)}{#if s.r}<span class="r2"
                    ><Bidi text={s.t} base="ar" /></span
                  >{:else}<Bidi text={s.t} base="ar" />{/if}{/each}</span
            ></span
          >
        </div>
        <div class="panneau allume">{@render arabe(moulant, true, '64px')}</div>
        <p class="sens"><Bidi text={moulant.s} /></p>
        <p class="explic" data-testid="rc-moule"><Bidi text={moulant.me} /></p>
      {:else if courante === 'cousins'}
        {@const m = mots[k]!}
        <h2><Bidi text={nom('cousins')} /></h2>
        <div class="cousins" role="group" aria-label={t('rc.cousins_liste')}>
          {#each mots as c, j (cle(c))}
            <button
              type="button"
              class:ici={j === k}
              class:vu={j < k}
              aria-pressed={j === k}
              onclick={() => (k = j)}
              data-testid="rc-cousin"
            >
              {@render arabe(c, false, '22px')}
            </button>
          {/each}
        </div>
        <p class="petit"><b><Bidi text={t('rc.mot_n', { i: k + 1, n: mots.length })} /></b></p>
        <div class="puces">
          {#if !enfant}<span class="puce"><Bidi text={m.e} /></span>{/if}
          {#if !enfant && auDessus(m, niveau, entree)}
            <span class="puce niv" data-testid="rc-niveau-sup"
              ><Bidi text={t('rc.niveau_sup', { n: m.na })} /></span
            >
          {/if}
          {#if m.d?.includes('LOIN')}<span class="puce niv"><Bidi text={t('rc.loin')} /></span>{/if}
          {#if m.d?.includes('DISC')}<span class="puce niv"><Bidi text={t('rc.disc')} /></span>{/if}
        </div>
        <div class="panneau allume">{@render arabe(m, true, '64px')}</div>
        <p class="sens"><Bidi text={m.s} /></p>
        {#if !enfant && m.m}
          <button
            type="button"
            class="puce moulebtn"
            aria-expanded={moulePose === m.n}
            onclick={() => (moulePose = moulePose === m.n ? null : m.n)}
            data-testid="rc-moule-btn"
          >
            <Bidi text={t('rc.moule_de', { moule: m.m })} />
          </button>
          {#if moulePose === m.n}<p class="explic"><Bidi text={m.me} /></p>{/if}
        {/if}
        {#if m.h?.length}<p class="note"><Bidi text={t('rc.homographe')} /></p>{/if}
        {@render verset(m)}
        <p class="freq"><Bidi text={freqTexte(m.fr)} /></p>
        {@render notes(m)}
      {:else if courante === 'verifier'}
        <h2><Bidi text={nom('verifier')} /></h2>
        <div class="minuteur" aria-hidden="true"><i></i></div>
        {#each qs as q, i (i)}
          {#if i === 0 || reponses[i - 1] !== undefined}
            <section class="quiz" data-testid="rc-question">
              <p class="petit"><Bidi text={t('rc.q_nombre', { i: i + 1 })} /></p>
              <p class="q">
                <Bidi text={q.genre === 'racine' ? t('rc.q_racine') : t('rc.q_sens')} />
              </p>
              {#if q.mot}<div class="panneau">{@render arabe(q.mot, false, '48px')}</div>{/if}
              <div class="choix">
                {#each q.choix as c, j (j)}
                  <button
                    type="button"
                    class:bon={reponses[i] !== undefined && j === q.bon}
                    class:non={reponses[i] === j && j !== q.bon}
                    disabled={reponses[i] !== undefined}
                    onclick={() => repondre(i, j)}
                    data-testid="rc-choix"
                  >
                    {#if q.genre === 'racine'}<span class="ar" lang="ar" dir="rtl"
                        ><Bidi text={c} base="ar" /></span
                      >{:else}<Bidi text={c} />{/if}
                  </button>
                {/each}
              </div>
              {#if reponses[i] !== undefined}
                <p
                  class="retour"
                  class:ok={reponses[i] === q.bon}
                  class:ko={reponses[i] !== q.bon}
                  role="status"
                  data-testid="rc-retour-q"
                >
                  <b><Bidi text={t(reponses[i] === q.bon ? 'rc.bravo' : 'rc.presque')} /></b>
                  {#if reponses[i] !== q.bon}<Bidi text={t('rc.bonne_reponse')} />{/if}
                </p>
              {/if}
            </section>
          {/if}
        {/each}
        {#if qs.every((_, i) => reponses[i] !== undefined)}
          <p class="petit" data-testid="rc-bilan">
            <Bidi text={t(bonnes === 2 ? 'rc.fin_2' : bonnes === 1 ? 'rc.fin_1' : 'rc.fin_0')} />
          </p>
        {/if}
      {:else if courante === 'ancrer'}
        <h2><Bidi text={nom('ancrer')} /></h2>
        <p class="petit"><Bidi text={t('rc.recap')} /></p>
        <div class="grille">
          {#each mots as c (cle(c))}
            <div class="cel">
              {@render arabe(c, true, '30px')}<span class="fr"><Bidi text={c.s} /></span>
            </div>
          {/each}
        </div>
        {#if pastilleData}
          <div class="pastille" data-testid="rc-pastille">
            <div class="anneau" style:--p={Math.min(100, Math.round(pastilleData.apres))}>
              <b>{fmtNumber(Math.round(pastilleData.apres))} %</b>
            </div>
            <p>
              <Bidi
                text={t('rc.pastille', {
                  pct: fmtNumber(Math.round(pastilleData.apres * 10) / 10, {
                    maximumFractionDigits: 1,
                  }),
                })}
              />
              {#if pastilleData.gain > 0}<b
                  ><Bidi text={t('rc.gain', { pts: pts(pastilleData.gain) })} /></b
                >{/if}
            </p>
          </div>
        {/if}
      {:else}
        <h2><Bidi text={nom('suite')} /></h2>
        {#if suiv}
          <div class="panneau">
            <span class="ar" style:font-size="48px" lang="ar" dir="rtl"
              ><span class="r"><Bidi text={suiv.r} base="ar" /></span></span
            >
          </div>
          <p class="sens"><Bidi text={suiv.s} /></p>
          {#if fam.l?.length}<p class="explic">
              <Bidi text={t('rc.suite_lien', { moule: fam.l[0]! })} />
            </p>{/if}
        {:else}
          <p class="sens"><Bidi text={t('rc.suite_fin')} /></p>
        {/if}
      {/if}
      <p class="petit src-note"><Bidi text={t('rc.note_source')} /></p>
    </main>

    <footer>
      <button
        type="button"
        class="go"
        disabled={!peutContinuer}
        onclick={continuer}
        data-testid="rc-continuer"
      >
        <Bidi
          text={courante === 'suite' && suiv
            ? t('rc.commencer')
            : courante === 'suite'
              ? t('rc.retour')
              : t('rc.continuer')}
        />
      </button>
    </footer>
  {/if}
</div>

<style>
  .famille {
    --fond: #fbf7ee;
    --carte: #f2ebda;
    --vert: #0b6e4f;
    --vert-pf: rgb(8 76 56);
    --nuit: #063a2b;
    --or: rgb(201 162 39);
    --or-fonce: #8a6a0b;
    --texte: #1e2b25;
    --doux: #4a5a52;
    color: var(--texte);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  main {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-block: 8px;
  }
  h2 {
    font-size: 1.35rem;
    line-height: 1.25;
    color: var(--vert-pf);
    text-align: center;
    margin: 0;
  }
  .petit,
  .freq {
    font-size: 0.95rem;
    line-height: 1.4;
    color: var(--doux);
    text-align: center;
    margin: 0;
  }
  .src-note {
    font-size: 0.8rem;
    margin-block-start: 8px;
  }
  .lien {
    background: none;
    border: 0;
    color: var(--vert-pf);
    text-decoration: underline;
    min-block-size: 44px;
    cursor: pointer;
    padding: 0;
    font-size: 0.95rem;
  }
  .fil {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: 4px;
  }
  .fil i {
    block-size: 6px;
    border-radius: 3px;
    background: #e3dbc6;
    display: block;
  }
  .fil i.fait {
    background: var(--or);
  }
  .fil i.ici {
    background: var(--vert);
  }
  .ou {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-block-start: 6px;
    font-size: 0.85rem;
    color: var(--doux);
  }
  .ou b {
    color: var(--vert-pf);
  }
  .ar {
    font-family: 'Noto Naskh Arabic', 'Amiri', serif;
    font-weight: 700;
    direction: rtl;
    unicode-bidi: isolate;
    white-space: nowrap;
  }
  .r {
    color: var(--or);
    transition: color 0.4s;
  }
  .r2 {
    color: var(--or-fonce);
  }
  .panneau {
    background: var(--vert-pf);
    color: var(--fond);
    border-radius: 22px;
    padding: 4px 16px 14px;
    text-align: center;
    line-height: 1.6;
  }
  .panneau :global(.ar) {
    display: block;
    line-height: 1.6;
  }
  .allume .r {
    animation: allume 0.9s ease both;
  }
  @keyframes allume {
    0%,
    100% {
      text-shadow: none;
    }
    45% {
      text-shadow:
        0 0 16px rgba(227, 193, 90, 0.95),
        0 0 4px rgba(255, 236, 170, 0.9);
    }
  }
  .sens {
    font-size: 1.5rem;
    font-weight: 600;
    line-height: 1.2;
    color: var(--vert-pf);
    text-align: center;
    margin: 0;
  }
  .tuiles {
    display: flex;
    gap: 10px;
    justify-content: center;
    direction: rtl;
  }
  .tuile {
    inline-size: 72px;
    block-size: 80px;
    border-radius: 16px;
    background: var(--nuit);
    border: 2.5px solid var(--or);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: tombe 0.6s cubic-bezier(0.2, 1.4, 0.4, 1) both;
  }
  .tuile:nth-child(2) {
    animation-delay: 0.25s;
  }
  .tuile:nth-child(3) {
    animation-delay: 0.5s;
  }
  .tuile .ar {
    font-size: 44px;
    line-height: 1;
    color: var(--or);
    padding-block-end: 8px;
  }
  .tuile.petite {
    inline-size: 46px;
    block-size: 54px;
    border-radius: 12px;
    animation: none;
  }
  .tuile.petite .ar {
    font-size: 28px;
    padding-block-end: 5px;
  }
  @keyframes tombe {
    from {
      transform: translateY(-60px);
      opacity: 0;
    }
    to {
      transform: none;
      opacity: 1;
    }
  }
  .eq {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    direction: ltr;
  }
  .plus {
    font-size: 1.75rem;
    font-weight: 600;
    color: var(--or-fonce);
  }
  .moule {
    background: var(--carte);
    border: 2px dashed var(--or);
    border-radius: 16px;
    padding: 0 12px 6px;
  }
  .moule .ar {
    font-size: 40px;
    line-height: 1.6;
  }
  .note {
    background: #fff8e6;
    border-inline-start: 4px solid var(--or);
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 0.9rem;
    line-height: 1.45;
    margin: 0;
  }
  .explic {
    background: var(--carte);
    border-radius: 12px;
    padding: 10px 12px;
    line-height: 1.45;
    margin: 0;
  }
  .puces {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
  }
  .puce {
    display: inline-flex;
    align-items: center;
    background: var(--carte);
    border: 1.5px solid var(--or);
    border-radius: 16px;
    padding: 4px 12px;
    font-size: 0.9rem;
    min-block-size: 34px;
    color: var(--vert-pf);
  }
  .puce.niv {
    background: #fff3d6;
    border-color: #d9a400;
    color: #6b4e00;
  }
  button.puce {
    min-block-size: 44px;
    cursor: pointer;
    align-self: center;
  }
  .cousins {
    display: flex;
    gap: 6px;
    justify-content: center;
    flex-wrap: wrap;
    direction: rtl;
  }
  .cousins button {
    border: 2px solid transparent;
    background: var(--vert-pf);
    border-radius: 12px;
    padding: 0 8px 4px;
    min-block-size: 44px;
    min-inline-size: 44px;
    cursor: pointer;
    opacity: 0.75;
    color: var(--fond);
  }
  .cousins button.ici {
    border-color: var(--or);
    opacity: 1;
  }
  .cousins button.vu {
    opacity: 1;
  }
  .verset {
    background: #fffdf7;
    border: 1.5px solid var(--or);
    border-radius: 18px;
    padding: 10px 14px 12px;
  }
  .verset .q {
    font-family: 'Amiri Quran', 'Amiri', serif;
    font-size: 26px;
    line-height: 2.1;
    text-align: center;
    margin: 0;
  }
  .verset .q .c {
    color: var(--vert);
    background: rgba(201, 162, 39, 0.22);
    border-radius: 8px;
    padding: 0 3px;
  }
  .bas {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-block-start: 6px;
  }
  .src {
    font-size: 0.8rem;
    color: var(--doux);
  }
  .ecoute {
    border: 0;
    background: var(--vert);
    color: var(--fond);
    border-radius: 22px;
    padding: 10px 16px;
    font-weight: 600;
    min-block-size: 44px;
    cursor: pointer;
  }
  .minuteur {
    block-size: 6px;
    border-radius: 3px;
    background: #e3dbc6;
    overflow: hidden;
  }
  .minuteur i {
    display: block;
    block-size: 100%;
    background: var(--vert);
    animation: temps 30s linear both;
  }
  @keyframes temps {
    from {
      inline-size: 100%;
    }
    to {
      inline-size: 0;
    }
  }
  .quiz {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .quiz .q {
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--vert-pf);
    text-align: center;
    margin: 0;
  }
  .choix {
    display: grid;
    gap: 10px;
  }
  .choix button {
    border: 2px solid var(--or);
    background: var(--carte);
    border-radius: 16px;
    min-block-size: 56px;
    padding: 4px 14px;
    cursor: pointer;
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--texte);
  }
  .choix button .ar {
    font-size: 30px;
    line-height: 1.5;
  }
  .choix button.bon {
    background: #fff3c8;
    border-color: var(--or);
    border-width: 3px;
    color: #5a4300;
  }
  .choix button.non {
    background: #efe7d2;
    border-color: #b9a98a;
  }
  .choix button:disabled {
    cursor: default;
  }
  .retour {
    border-radius: 14px;
    padding: 12px 14px;
    line-height: 1.45;
    margin: 0;
  }
  .retour.ok {
    background: #ddf0e6;
    color: #07432f;
  }
  .retour.ko {
    background: #fff3d6;
    color: #5a4300;
  }
  .grille {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .cel {
    background: var(--vert-pf);
    border-radius: 14px;
    color: var(--fond);
    text-align: center;
    padding: 0 6px 8px;
  }
  .cel :global(.ar) {
    display: block;
    line-height: 1.6;
  }
  .fr {
    font-size: 0.8rem;
    line-height: 1.25;
    color: #d8e6df;
  }
  .pastille {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--vert-pf);
    color: var(--fond);
    border-radius: 18px;
    padding: 12px 14px;
  }
  .anneau {
    inline-size: 58px;
    block-size: 58px;
    border-radius: 50%;
    background: conic-gradient(var(--or) calc(var(--p) * 1%), rgba(255, 255, 255, 0.18) 0);
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
  }
  .anneau b {
    inline-size: 44px;
    block-size: 44px;
    border-radius: 50%;
    background: var(--vert-pf);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
  }
  .pastille p {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.4;
  }
  .pastille p b {
    color: #e3c15a;
  }
  footer {
    position: sticky;
    inset-block-end: 0;
    padding: 12px 0 8px;
    background: linear-gradient(rgba(251, 247, 238, 0), var(--fond) 30%);
  }
  .go {
    inline-size: 100%;
    min-block-size: 56px;
    border: 0;
    border-radius: 18px;
    background: var(--vert-pf);
    color: var(--fond);
    font-size: 1.1rem;
    font-weight: 600;
    cursor: pointer;
  }
  .go:disabled {
    background: #6f8a7e;
  }
  button:focus-visible {
    outline: 3px solid var(--or);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      animation: none !important;
      transition: none !important;
    }
  }
</style>
