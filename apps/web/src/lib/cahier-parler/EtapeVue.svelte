<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import { audioIdFor, type LevelAudio } from '$lib/lecons-audio';
  import {
    decouperConsigne,
    etoiles,
    formes,
    phrasesUtiles,
    type Avis,
    type CahierParler,
    type Conversation,
    type Etape,
    type Forme,
    type PageParler,
    type ProgresParler,
  } from './donnees';
  import Phrase from './Phrase.svelte';
  import Picto from './Picto.svelte';

  /**
   * Cahier « Je parle » — une étape du carnet : son ouverture (bandeau de la partie orné d'un motif géométrique,
   * pictogramme d'objet, titre, phrase du jour, accroche) puis ses pages selon les gabarits du design : cartes de
   * phrases (6 cases), conversation en bulles (A en vert à droite, B en doré à gauche), « À toi de parler » (scénario du
   * tuteur), antisèche en tableau, révision floutée, bilan « Je sais dire… » avec une étoile par thème réussi.
   */
  let {
    cahier,
    etape,
    pageId,
    audio,
    progres,
    sauver,
    base,
  }: {
    cahier: CahierParler;
    etape: Etape;
    pageId: string | null;
    audio: LevelAudio | null;
    progres: ProgresParler;
    sauver: (p: ProgresParler) => void;
    base: string;
  } = $props();

  const ANTI = 'antiseche';
  /** suite des écrans de l'étape : ouverture, pages, puis antisèche */
  const suite = $derived([
    null,
    ...etape.pages.map((p) => p.id),
    ...(etape.antiseche?.length ? [ANTI] : []),
  ]);
  const i = $derived(Math.max(0, suite.indexOf(pageId)));
  const page = $derived(etape.pages.find((p) => p.id === pageId) ?? null);
  const lien = (p: string | null) => `${base}?e=${etape.id}${p ? `&p=${p}` : ''}`;
  const partie = $derived(cahier.parties.find((x) => x.n === etape.partie));
  const acc = $derived(`--acc: var(--acc-${etape.partie || 1})`);

  /** nom d'une page dans le sommaire de l'étape */
  function nomPage(p: PageParler): string {
    const conv = cahier.conversations[p.refs[0] ?? ''];
    if (p.type === 'cartes')
      return t('parler.p_cartes', {
        n: etape.pages.filter((x) => x.type === 'cartes').indexOf(p) + 1,
      });
    if (p.type === 'conversation') return t('parler.p_conversation', { t: conv?.titre ?? '' });
    if (p.type === 'tuteur')
      return p.refs.length > 1
        ? t('parler.p_libre')
        : t('parler.p_tuteur', { t: conv?.titre ?? '' });
    return p.titre;
  }
  /** textes de la page qui n'ont pas encore leur fichier audio */
  function sansSon(fs: Forme[]): boolean {
    return !!audio && fs.some((f) => !audioIdFor(f.ar, audio));
  }
  const formesPage = $derived.by((): Forme[] => {
    if (!page) return etape.jour ? [etape.jour] : [];
    if (page.type === 'cartes') return page.refs.flatMap((r) => formes(cahier.phrases[r]!));
    if (page.type === 'conversation') return cahier.conversations[page.refs[0]!]?.r ?? [];
    if (page.type === 'tuteur')
      return page.refs.length > 1 ? [] : phrasesUtiles(cahier.conversations[page.refs[0]!]!);
    return [];
  });

  // ---------------------------------------------------------------- 6 cases
  const cases = $derived(progres.cases[pageId ?? ''] ?? [false, false, false, false, false, false]);
  function basculer(k: number) {
    if (!pageId) return;
    const c = [...cases];
    c[k] = !c[k];
    sauver({ ...progres, cases: { ...progres.cases, [pageId]: c } });
  }

  // ---------------------------------------------------------------- révision et bilan
  let vus = $state<Record<string, boolean>>({});
  function avis(ref: string, a: Avis) {
    if (!pageId) return;
    const b = { ...(progres.bilans[pageId] ?? {}), [ref]: a };
    sauver({ ...progres, bilans: { ...progres.bilans, [pageId]: b } });
  }
  const AVIS: Avis[] = ['oui', 'presque', 'non'];
  const role = (c: Conversation, q: 'A' | 'B') => {
    const qui = c[q];
    return qui === 'homme' || qui === 'femme' ? t(`parler.${qui}`) : qui;
  };
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- chemin résolu par le cahier (base), suivi des paramètres -->
<article class="etape-vue" style={acc} data-etape={etape.id} data-page={pageId ?? 'ouverture'}>
  <p class="nav">
    {#if pageId}<a href={lien(null)}>{t('parler.retour_etape')}</a>{:else}<a href={base}
        >{t('parler.retour_carnet')}</a
      >{/if}
  </p>

  {#if !pageId}
    <!-- ouverture de l'étape -->
    <header class="ouverture">
      <div class="bande">
        <p class="sur">
          <Bidi
            text={partie
              ? `${t('parler.partie', { n: etape.partie })} · ${partie.nom}`
              : t('parler.partie', { n: etape.partie || '' })}
          />
        </p>
        <span class="grand-picto"><Picto nom={etape.picto} taille={64} /></span>
      </div>
      <div class="titres">
        {#if etape.fin}
          <h1>
            <Bidi text={etape.partie ? t('parler.fin', { n: etape.partie }) : t('parler.finale')} />
          </h1>
        {:else}
          <p class="num">
            <span class="rond">{etape.num}</span><Bidi
              text={t('parler.etape', { n: etape.num ?? '' })}
            />
            · <Bidi text={etape.n ? t('parler.apres', { n: etape.n }) : t('parler.avant')} />
          </p>
          <h1><Bidi text={etape.titre} /></h1>
          {#if etape.accroche}<p class="accroche">
              <Bidi text={t('parler.accroche', { x: etape.accroche })} />
            </p>{/if}
        {/if}
      </div>
    </header>
    {#if etape.jour}
      <section class="jour carte" data-testid="parler-jour">
        <h2><Bidi text={t('parler.jour')} /></h2>
        <Phrase forme={etape.jour} {audio} grand />
      </section>
    {/if}
    <section class="carte">
      <h2><Bidi text={t('parler.dans_etape')} /></h2>
      <ol class="liste-pages">
        {#each etape.pages as p (p.id)}
          <li>
            <a class="ligne-page" href={lien(p.id)} data-lien-page={p.id}
              ><Bidi text={nomPage(p)} /></a
            >
          </li>
        {/each}
        {#if etape.antiseche?.length}
          <li>
            <a class="ligne-page or" href={lien(ANTI)} data-testid="parler-lien-antiseche"
              ><Bidi text={t('parler.p_antiseche')} /></a
            >
          </li>
        {/if}
      </ol>
    </section>
    {#if suite.length > 1}
      <p class="actions">
        <a class="bouton plein" href={lien(suite[1] ?? null)} data-testid="parler-commencer"
          >{t('parler.commencer')}</a
        >
      </p>
    {/if}
  {:else if pageId === ANTI}
    <!-- antisèche : tableau à deux colonnes, une ligne touchée se fait entendre -->
    <section class="antiseche" data-testid="parler-antiseche">
      <header class="entete-anti">
        <p class="anti-ar" lang="ar" dir="rtl">{cahier.antiseche_ar}</p>
        <h1><Bidi text={t('parler.p_antiseche')} /> · <Bidi text={etape.titre ?? ''} /></h1>
      </header>
      <p class="aide"><Bidi text={t('parler.antiseche_aide')} /></p>
      <ol class="lignes">
        {#each etape.antiseche ?? [] as [ar, fr], k (k)}
          <li><Phrase forme={{ ar, fr }} {audio} ligne /></li>
        {/each}
      </ol>
    </section>
  {:else if page}
    <h1 class="titre-page"><Bidi text={nomPage(page)} /></h1>
    {#if page.type === 'cartes'}
      <p class="aide"><Bidi text={t('parler.toucher')} /></p>
      {#each page.refs as r, k (r)}
        {@const ph = cahier.phrases[r]!}
        <section class="carte phrase-carte" class:du-jour={k === 0} data-ref={r}>
          {#each formes(ph) as f, j (j)}
            <Phrase forme={f} {audio} grand={k === 0} />
          {/each}
        </section>
      {/each}
      <fieldset class="cases">
        <legend><Bidi text={t('parler.avec_modele')} /> · <Bidi text={t('parler.seul')} /></legend>
        {#each cases as c, k (k)}
          <button
            type="button"
            class="case"
            class:seul={k > 2}
            aria-pressed={c}
            data-case={k}
            aria-label={t('parler.case', { n: k + 1 })}
            onclick={() => basculer(k)}
            >{#if c}<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"
                ><path
                  d="M5 12l5 5 9-10"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                /></svg
              >{/if}</button
          >
        {/each}
      </fieldset>
    {:else if page.type === 'conversation'}
      {@const c = cahier.conversations[page.refs[0]!]!}
      <p class="consigne"><Bidi text={t('parler.conv_consigne')} /></p>
      <ol class="bulles">
        {#each c.r as r, k (k)}
          <li class="bulle {r.q}" data-qui={r.q}>
            <span class="qui"
              ><span class="lettre" aria-hidden="true">{r.q}</span><Bidi
                text={`${r.q} · ${role(c, r.q)}`}
              /></span
            >
            <Phrase forme={r} {audio} />
          </li>
        {/each}
      </ol>
    {:else if page.type === 'tuteur'}
      {#if page.refs.length > 1}
        <section class="tuteur">
          <p><Bidi text={t('parler.libre_intro')} /></p>
          <ul>
            {#each page.refs as r (r)}
              <li><Bidi text={cahier.conversations[r]?.titre ?? ''} /></li>
            {/each}
          </ul>
        </section>
      {:else}
        {@const c = cahier.conversations[page.refs[0]!]!}
        {@const sc = decouperConsigne(c.consigne)}
        <section class="tuteur" data-testid="parler-tuteur">
          <h2><Bidi text={t('parler.scenario')} /></h2>
          <p><Bidi text={sc.fr} base="fr" /></p>
          {#each sc.ar as a (a.m)}
            <p class="consigne-ar" lang="ar" dir="rtl"><span class="marque">{a.m}</span> {a.ar}</p>
          {/each}
          <h2><Bidi text={t('parler.utiles')} /></h2>
          {#each phrasesUtiles(c) as r, k (k)}
            <Phrase forme={r} {audio} />
          {/each}
        </section>
      {/if}
      <!-- 24/10/2026 : le tuteur IA n'a pas encore de point d'entrée qui reçoive une consigne de jeu de rôle (il suit le
           dialogue de la leçon) : bouton désactivé, lien à faire (JOURNAL_DEV) -->
      <p class="actions">
        <button type="button" class="bouton" disabled data-testid="parler-tuteur-bouton"
          >{t('parler.tuteur_bouton')}</button
        >
      </p>
      <p class="aide"><Bidi text={t('parler.tuteur_bientot')} /></p>
    {:else if page.type === 'revision'}
      <p class="consigne"><Bidi text={t('parler.revision_consigne')} /></p>
      <ol class="revision">
        {#each page.refs as r (r)}
          {@const f = formes(cahier.phrases[r]!)[0]!}
          <li class="carte">
            <p class="fr-rev"><Bidi text={f.fr} /></p>
            {#if vus[r]}
              <Phrase forme={{ ar: f.ar, fr: '' }} {audio} />
            {:else}
              <p class="flou" aria-hidden="true" lang="ar" dir="rtl">{f.ar}</p>
              <button
                type="button"
                class="bouton"
                data-testid="parler-voir"
                onclick={() => (vus = { ...vus, [r]: true })}>{t('parler.voir_arabe')}</button
              >
            {/if}
          </li>
        {/each}
      </ol>
    {:else if page.type === 'bilan'}
      {@const et = etoiles(cahier, page, progres)}
      <p class="consigne"><Bidi text={t('parler.bilan_consigne')} /></p>
      <p
        class="etoiles"
        role="img"
        aria-label={t('parler.etoiles', { n: et.filter((x) => x.reussi).length, total: et.length })}
      >
        {#each et as x (x.theme)}<span
            class="etoile"
            class:reussi={x.reussi}
            title={t(x.reussi ? 'parler.etoile_reussie' : 'parler.etoile_a_faire', {
              t: cahier.themes[x.theme] ?? x.theme,
            })}><Picto nom="etoile" taille={26} /></span
          >{/each}
      </p>
      <ol class="bilan">
        {#each page.refs as r (r)}
          {@const ph = cahier.phrases[r]}
          {@const cv = cahier.conversations[r]}
          <li class="carte">
            <fieldset>
              <legend class="vh"><Bidi text={t('parler.je_sais')} /></legend>
              {#if ph}
                <p class="bilan-ar" lang="ar" dir="rtl">{formes(ph)[0]!.ar}</p>
                <p class="fr-rev"><Bidi text={formes(ph)[0]!.fr} /></p>
              {:else if cv}
                <p class="fr-rev"><Bidi text={t('parler.conv_ligne', { t: cv.titre })} /></p>
              {/if}
              <div class="choix">
                {#each AVIS as a (a)}
                  <label class:choisi={progres.bilans[page.id]?.[r] === a}
                    ><input
                      type="radio"
                      name={`${page.id}-${r}`}
                      value={a}
                      checked={progres.bilans[page.id]?.[r] === a}
                      onchange={() => avis(r, a)}
                    /><span>{t(`parler.${a}`)}</span></label
                  >
                {/each}
              </div>
            </fieldset>
          </li>
        {/each}
      </ol>
    {/if}
  {/if}

  {#if sansSon(formesPage)}<p class="aide"><Bidi text={t('parler.sans_audio')} /></p>{/if}

  {#if pageId}
    <nav class="suite" aria-label={t('parler.dans_etape')}>
      <a rel="prev" class="bouton" href={lien(suite[i - 1] ?? null)}>{t('parler.precedent')}</a>
      {#if i < suite.length - 1}
        <a rel="next" class="bouton plein" href={lien(suite[i + 1] ?? null)}
          >{t('parler.suivant')}</a
        >
      {:else}
        <a class="bouton plein" href={base}>{t('parler.retour_carnet')}</a>
      {/if}
    </nav>
  {/if}
</article>

<style>
  .ouverture {
    border-radius: var(--radius-lg, 20px);
    overflow: hidden;
    border: 1px solid var(--line);
    background: var(--card);
  }
  .bande {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 6rem;
    padding: 0.9rem 1.1rem;
    background: var(--acc);
    color: var(--sur-acc);
  }
  /* motif géométrique fin (étoile à huit branches), sans visage ni personnage */
  .bande::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: var(--motif-etoile);
    pointer-events: none;
  }
  .grand-picto {
    flex-shrink: 0;
    position: relative;
    z-index: 1;
    display: grid;
    place-items: center;
    width: 5rem;
    height: 5rem;
    border-radius: 999px;
    border: 2px solid var(--pa-or);
    color: #e9cf8a;
    background: rgba(0, 0, 0, 0.15);
  }
  .sur {
    position: relative;
    z-index: 1;
    margin: 0;
    font: 600 0.78rem/1.3 var(--font-title);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .titres {
    padding: 0.8rem 1.1rem 1rem;
  }
  .num {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0;
    color: var(--ink2);
    font-weight: 700;
  }
  .rond {
    display: inline-grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 999px;
    background: var(--acc);
    color: var(--sur-acc);
    border: 2px solid var(--pa-or);
  }
  h1 {
    margin: 0.3rem 0 0;
    font: 600 1.4rem/1.25 var(--font-title);
    color: var(--ink);
  }
  .titre-page {
    margin: 0.2rem 0 0.6rem;
  }
  .accroche {
    margin: 0.4rem 0 0;
    color: var(--ink2);
  }
  h2 {
    margin: 0 0 0.4rem;
    font: 600 1rem/1.3 var(--font-title);
    color: var(--ink);
  }
  .jour {
    border-color: var(--pa-or);
  }
  .liste-pages {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .ligne-page {
    display: flex;
    align-items: center;
    min-height: 2.75rem;
    padding: 0.35rem 0.75rem;
    margin: 0.3rem 0;
    border-radius: var(--radius-md, 14px);
    border: 1.5px solid var(--line);
    color: var(--ink);
    text-decoration: none;
    font-weight: 600;
  }
  .ligne-page.or {
    border-color: var(--pa-or);
  }
  .actions {
    margin: 0.8rem 0;
  }
  .aide,
  .consigne {
    color: var(--ink2);
  }
  .consigne {
    font-style: italic;
  }
  .phrase-carte {
    padding: 0.4rem;
  }
  .phrase-carte.du-jour {
    border: 2px solid var(--pa-or);
  }
  .phrase-carte :global(.phrase + .phrase) {
    border-top: 1px dashed var(--line);
    border-radius: 0;
  }
  .cases {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    border: 0;
    margin: 0.8rem 0;
    padding: 0;
  }
  .cases legend {
    width: 100%;
    margin-bottom: 0.3rem;
    color: var(--ink2);
    font-size: 0.9rem;
  }
  .case {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 10px;
    border: 2.5px solid var(--primary);
    background: var(--card);
    color: var(--primary);
    cursor: pointer;
  }
  .case.seul {
    border-color: var(--pa-or);
    color: var(--ink);
  }
  .case[aria-pressed='true'] {
    background: var(--primary-soft);
  }
  /* conversation : A en vert à droite, B en doré à gauche (sens de lecture de l'arabe) */
  .bulles {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .bulle {
    max-width: 88%;
    padding: 0.35rem 0.4rem 0.2rem;
    border-radius: 18px;
    border: 1.5px solid;
  }
  .bulle.A {
    align-self: flex-end;
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 10%, var(--card));
    border-end-end-radius: 4px;
  }
  .bulle.B {
    align-self: flex-start;
    border-color: var(--pa-or);
    background: color-mix(in srgb, var(--pa-or) 14%, var(--card));
    border-end-start-radius: 4px;
  }
  .qui {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0 0.5rem;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--ink2);
  }
  .lettre {
    display: inline-grid;
    place-items: center;
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 999px;
    background: var(--card);
    border: 1.5px solid currentColor;
    font-size: 0.75rem;
  }
  /* « À toi de parler » : encadré avec un filet doré à gauche */
  .tuteur {
    border-inline-start: 4px solid var(--pa-or);
    padding: 0.4rem 0 0.4rem 1rem;
    margin: 0.6rem 0;
  }
  .consigne-ar,
  .bilan-ar,
  .flou {
    margin: 0.2rem 0;
    font-family: var(--font-ar);
    font-size: 1.45rem;
    line-height: 2;
    text-align: right;
  }
  .marque {
    font-family: var(--font-ui);
    font-size: 1rem;
    color: var(--ink2);
  }
  button:disabled {
    opacity: 0.75;
    cursor: not-allowed;
    border-style: dashed;
  }
  /* antisèche : en-tête doré, lignes en alternance ivoire et blanc */
  .entete-anti {
    padding: 0.6rem 1rem;
    border-radius: var(--radius-md, 14px) var(--radius-md, 14px) 0 0;
    background: color-mix(in srgb, var(--pa-or) 28%, var(--card));
    border: 1.5px solid var(--pa-or);
  }
  .entete-anti h1 {
    font-size: 1.1rem;
  }
  .anti-ar {
    margin: 0;
    font-family: var(--font-ar-titre, var(--font-ar));
    font-size: 1.6rem;
    line-height: 1.8;
    text-align: right;
    color: var(--ink);
  }
  .lignes {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1.5px solid var(--line);
    border-top: 0;
    border-radius: 0 0 var(--radius-md, 14px) var(--radius-md, 14px);
    overflow: hidden;
  }
  .lignes li {
    background: var(--card);
    border-top: 1px solid var(--line);
  }
  .lignes li:nth-child(odd) {
    background: var(--paper);
  }
  .revision,
  .bilan {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .fr-rev {
    margin: 0;
    font-weight: 600;
  }
  .flou {
    filter: blur(7px);
    user-select: none;
  }
  .etoiles {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    color: var(--line);
  }
  .etoile {
    color: var(--ink2);
  }
  .etoile.reussi {
    color: var(--pa-or);
  }
  .etoile.reussi :global(path) {
    fill: currentColor;
  }
  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
  }
  .choix {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.4rem;
  }
  .choix label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 2.75rem;
    padding: 0 0.8rem;
    border-radius: 999px;
    border: 1.5px solid var(--line);
    cursor: pointer;
  }
  .choix label.choisi {
    border-color: var(--primary);
    background: var(--primary-soft);
  }
  .choix input {
    width: 1.2rem;
    height: 1.2rem;
    accent-color: var(--primary);
  }
  .suite {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    margin: 1.2rem 0 0.5rem;
  }
  .vh {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
