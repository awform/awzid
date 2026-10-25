<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { demoProfileFor } from '$lib/attempts';
  import { fmtNumber, localeInfo, t } from '$lib/i18n';
  import { tanwinDisplay } from '@awform/content/text';
  import { niveauDe } from './calcul';
  import { ficheRacine, rechercher, type FicheRacine, type Recherche } from './donnees';
  import { etat, initialiser } from './etat.svelte';

  /**
   * Recherche dans le Coran par MOT arabe (avec ou sans voyelles) et par RACINE, et fiche racine (interrupteur `coran_mots`).
   * La saisie n'est comparée qu'à un index de comparaison : les versets affichés sont ceux de Tanzil, tels quels, avec le mot
   * trouvé repéré par sa place. La fiche racine montre la famille de mots, leur fréquence et ce que l'élève en connaît ; le
   * SENS de la racine n'est affiché que si le serveur l'envoie (sens validé), jamais un sens « à vérifier ».
   */
  let saisie = $state('');
  let mode = $state<'mot' | 'racine'>('mot');
  let res = $state<Recherche | null>(null);
  let items = $state<Recherche['items']>([]);
  let fiche = $state<FicheRacine | null>(null);
  let filtre = $state<string | null>(null);
  let etatReq = $state<'repos' | 'charge' | 'reseau' | 'ferme'>('repos');
  let dernier = $state<{ q: string; mode: 'mot' | 'racine' } | null>(null);
  let profil: string | undefined;

  onMount(async () => {
    const p = page.url.searchParams;
    const q = p.get('q');
    if (p.get('mode') === 'racine') mode = 'racine';
    profil = (await demoProfileFor('').catch(() => null))?.id;
    void initialiser();
    if (q) {
      saisie = q.slice(0, 60);
      await lancer();
    }
  });

  async function lancer(pageNum = 1, lemme: string | null = filtre) {
    const q = saisie.trim();
    if (!q) return;
    etatReq = 'charge';
    const r = await rechercher(q, mode, pageNum, lemme ?? undefined, profil);
    if (r === 'reseau') return void (etatReq = 'reseau');
    if (!r) return void (etatReq = 'ferme');
    etatReq = 'repos';
    dernier = { q, mode };
    res = r;
    items = pageNum === 1 ? r.items : [...items, ...r.items];
    if (pageNum === 1) {
      fiche = null;
      if (r.racine) {
        const f = await ficheRacine(r.racine, profil);
        fiche = f && f !== 'reseau' ? f : null;
      }
    }
  }
  function soumettre(e: SubmitEvent) {
    e.preventDefault();
    filtre = null;
    void lancer(1, null);
  }
  function versRacine(racine: string) {
    mode = 'racine';
    saisie = racine;
    filtre = null;
    void lancer(1, null);
  }
  function filtrer(bw: string | null) {
    filtre = bw;
    void lancer(1, bw);
  }
  const jetons = (texte: string) => texte.split(' ');
  const statut = (rang: number | null, unite: string | null) =>
    !etat.pret || !etat.connus
      ? null
      : rang && etat.connus.has(rang)
        ? { sait: true, niveau: 0 }
        : unite
          ? { sait: false, niveau: niveauDe(unite) }
          : { sait: false, niveau: 0 };
</script>

<div class="cm-page" data-testid="cm-recherche" lang={localeInfo().code} dir={localeInfo().dir}>
  <h1>{t('cm.titre')}</h1>
  <p class="cm-petit">{t('cm.intro')}</p>
  <form onsubmit={soumettre} role="search" aria-label={t('cm.titre')}>
    <div class="cm-mode" role="group" aria-label={t('cm.mode')}>
      <button
        type="button"
        aria-pressed={mode === 'mot'}
        onclick={() => (mode = 'mot')}
        data-testid="cm-mode-mot">{t('cm.mode_mot')}</button
      >
      <button
        type="button"
        aria-pressed={mode === 'racine'}
        onclick={() => (mode = 'racine')}
        data-testid="cm-mode-racine">{t('cm.mode_racine')}</button
      >
    </div>
    <div class="cm-champ">
      <label for="cm-q">{t('cm.champ')}</label>
      <input
        id="cm-q"
        type="search"
        bind:value={saisie}
        maxlength="60"
        lang="ar"
        dir="rtl"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder={mode === 'mot' ? 'كتاب' : 'كتب'}
        data-testid="cm-q"
      />
      <button type="submit" class="primary" data-testid="cm-aller">{t('cm.aller')}</button>
    </div>
  </form>

  <div role="status" aria-live="polite" class="cm-etat">
    {#if etatReq === 'charge'}<span>…</span>{/if}
    {#if etatReq === 'reseau'}<p data-testid="cm-reseau">{t('cm.reseau')}</p>{/if}
    {#if etatReq === 'ferme'}<p>{t('cm.reseau')}</p>{/if}
  </div>

  {#if res && dernier}
    {#if fiche}
      <section class="fiche" data-testid="cm-fiche" aria-labelledby="cm-racine-titre">
        <h2 id="cm-racine-titre" class="racine" lang="ar" dir="rtl">
          <Bidi text={fiche.racine} base="ar" />
        </h2>
        <p data-testid="cm-frequence">
          <Bidi
            text={fiche.frequence === 1
              ? t('cm.racine_n1')
              : t('cm.racine_n', { n: fmtNumber(fiche.frequence) })}
          />
        </p>
        {#if fiche.sens}
          <p data-testid="cm-sens"><strong>{t('cm.sens')}</strong> : <Bidi text={fiche.sens} /></p>
        {/if}
        <h3>{t('cm.famille')}</h3>
        <ul class="famille" data-testid="cm-famille">
          {#each fiche.famille as l (l.bw)}
            {@const s = statut(l.rang, l.unite)}
            <li>
              <button
                type="button"
                class="lemme"
                aria-pressed={filtre === l.bw}
                onclick={() => filtrer(filtre === l.bw ? null : l.bw)}
                data-lemme={l.bw}
              >
                <span class="ar" class:sait={s?.sait} lang="ar" dir="rtl"
                  ><Bidi text={l.ar} base="ar" /></span
                >
                <span class="cm-petit"><Bidi text={l.nature} /></span>
                <span class="cm-petit"
                  ><Bidi
                    text={l.n === 1 ? t('cm.fois1') : t('cm.fois', { n: fmtNumber(l.n) })}
                  /></span
                >
                {#if s}
                  <span class="cm-petit">
                    <Bidi
                      text={s.sait
                        ? t('cm.sait')
                        : s.niveau
                          ? t('cm.apprendras', { niveau: s.niveau })
                          : t('cm.pas_enseigne')}
                    />
                  </span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
        {#if filtre}
          <button type="button" class="cm-lien" onclick={() => filtrer(null)}>{t('cm.tous')}</button
          >
        {/if}
      </section>
    {:else if res.mode === 'racine' && !res.racine}
      <p data-testid="cm-aucun">{t('cm.racine_inconnue')}</p>
    {/if}

    {#if res.racines.length && res.mode === 'mot'}
      <p class="cm-racines">
        {#each res.racines as r (r)}
          <button type="button" class="cm-lien" onclick={() => versRacine(r)} data-racine={r}
            ><Bidi text={t('cm.voir_racine', { racine: r })} /></button
          >
        {/each}
      </p>
    {/if}
    {#if res.mode === 'mot' && res.lemmes.length > 1}
      <ul class="puces" data-testid="cm-lemmes" aria-label={t('cm.famille')}>
        {#each res.lemmes as l (l.bw)}
          <li>
            <button
              type="button"
              aria-pressed={filtre === l.bw}
              onclick={() => filtrer(filtre === l.bw ? null : l.bw)}
              data-lemme={l.bw}
              ><span class="ar" lang="ar" dir="rtl"><Bidi text={l.ar} base="ar" /></span>
              <span class="cm-petit">{fmtNumber(l.n)}</span></button
            >
          </li>
        {/each}
      </ul>
      {#if filtre}<button type="button" class="cm-lien" onclick={() => filtrer(null)}
          >{t('cm.tous')}</button
        >{/if}
    {/if}

    {#if res.total > 0}
      <p class="cm-total" data-testid="cm-total">
        <Bidi
          text={res.total === 1
            ? t('cm.resultats_un')
            : t('cm.resultats_n', { n: fmtNumber(res.total) })}
        />
      </p>
      {#if res.approx}<p class="cm-petit" data-testid="cm-approx">{t('cm.approx')}</p>{/if}
      <ul class="resultats" data-testid="cm-resultats">
        {#each items as it (`${it.ref}:${it.i}`)}
          <li>
            <!-- eslint-disable svelte/no-navigation-without-resolve -- chemin résolu, suivi de paramètres -->
            <a
              class="ref"
              href={`${resolve('/coran/lecteur')}?s=${it.s}&a=${it.a}`}
              aria-label={t('cm.verset_lien', { ref: it.ref })}><Bidi text={it.ref} /></a
            >
            <!-- eslint-enable svelte/no-navigation-without-resolve -->
            <p class="verset" lang="ar" dir="rtl">
              <span class="quran-text" data-verse={it.ref}
                >{#each jetons(it.texte) as w, k (k)}{k > 0 ? ' ' : ''}<span
                    class="mot"
                    class:hit={k === it.i}>{tanwinDisplay(w)}</span
                  >{/each}</span
              >
            </p>
          </li>
        {/each}
      </ul>
      {#if items.length < res.total}
        <button
          type="button"
          class="cm-plus"
          onclick={() => lancer(Math.floor(items.length / res!.parPage) + 1)}
          data-testid="cm-plus">{t('cm.plus')}</button
        >
      {/if}
    {:else if !(res.mode === 'racine' && !res.racine)}
      <p data-testid="cm-aucun">{t('cm.aucun')}</p>
    {/if}
  {/if}

  <section id="sources" class="sources" data-testid="cm-sources">
    <h2>{t('cm.sources_titre')}</h2>
    <p>
      <Bidi text={t('cm.sources_corpus')} />
      <a href="http://corpus.quran.com" rel="noopener noreferrer" target="_blank"
        ><Bidi text={t('cm.lien_corpus')} /></a
      >
    </p>
    <p>
      <Bidi text={t('cm.sources_tanzil')} />
      <a href="http://tanzil.net" rel="noopener noreferrer" target="_blank"
        ><Bidi text={t('cm.lien_tanzil')} /></a
      >
    </p>
    <p>
      <Bidi text={t('cm.sources_gpl')} />
      <a href="https://www.gnu.org/licenses/gpl-3.0.html" rel="noopener noreferrer" target="_blank"
        ><Bidi text={t('cm.lien_gpl')} /></a
      >
    </p>
  </section>
</div>

<style>
  .cm-page {
    display: grid;
    gap: 10px;
    max-inline-size: 44rem;
    margin-inline: auto;
    padding: var(--space-m, 12px);
    color: var(--ink);
  }
  h1,
  h2,
  h3,
  p {
    margin: 0;
  }
  .cm-petit {
    font-size: 0.92rem;
    color: var(--ink2);
  }
  form {
    display: grid;
    gap: 8px;
  }
  .cm-mode {
    display: flex;
    gap: 8px;
  }
  .cm-mode button {
    min-block-size: var(--target);
    padding-inline: 16px;
    background: var(--card);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: var(--radius-pill);
    font: inherit;
  }
  .cm-mode button[aria-pressed='true'] {
    background: var(--primary);
    color: var(--on-primary);
    border-color: var(--primary);
    font-weight: 700;
  }
  .cm-champ {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px 8px;
  }
  .cm-champ label {
    grid-column: 1 / -1;
    font-weight: 700;
  }
  .cm-champ input {
    min-block-size: var(--target);
    padding: 0 12px;
    font-family: var(--font-quran);
    font-size: 1.4rem;
    color: var(--ink);
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
  }
  .cm-champ button {
    min-block-size: var(--target);
    padding-inline: 18px;
  }
  .cm-lien {
    min-block-size: var(--target);
    padding-inline: 4px;
    background: transparent;
    border: 0;
    color: var(--primary);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
  .cm-racines {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
  }
  .fiche {
    display: grid;
    gap: 8px;
    padding: 12px 14px;
    background: var(--card);
    border: 1px solid var(--line);
    border-inline-start: 4px solid var(--or-line);
    border-radius: var(--radius-md);
  }
  .racine {
    font-family: var(--font-quran);
    font-size: 2.2rem;
    line-height: 1.6;
    text-align: center;
    letter-spacing: 0.2em;
    color: var(--primary);
  }
  .famille {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .lemme {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 12px;
    align-items: center;
    inline-size: 100%;
    min-block-size: var(--target);
    padding: 6px 12px;
    text-align: start;
    color: var(--ink);
    background: var(--surface);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    font: inherit;
  }
  .lemme[aria-pressed='true'] {
    border-color: var(--primary);
  }
  .lemme .ar {
    grid-row: span 3;
    font-family: var(--font-quran);
    font-size: 1.6rem;
    line-height: 1.8;
  }
  .ar.sait {
    text-decoration: underline;
    text-decoration-color: var(--or-line);
    text-decoration-thickness: 2px;
    text-underline-offset: 0.3em;
  }
  .puces {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .puces button {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    min-block-size: var(--target);
    padding: 2px 14px;
    color: var(--ink);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-pill);
    font: inherit;
  }
  .puces button[aria-pressed='true'] {
    border-color: var(--primary);
    font-weight: 700;
  }
  .puces .ar {
    font-family: var(--font-quran);
    font-size: 1.3rem;
  }
  .cm-total {
    font-weight: 700;
  }
  .resultats {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .resultats li {
    display: grid;
    gap: 2px;
    padding: 8px 12px;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
  }
  .ref {
    display: inline-flex;
    align-items: center;
    justify-self: start;
    min-block-size: var(--target);
    color: var(--primary);
    font-weight: 700;
  }
  .verset {
    font-family: var(--font-quran);
    font-size: calc(max(1.5rem, var(--ar-size, 1.5rem)));
    line-height: 2.2;
  }
  .mot.hit {
    padding-inline: 2px;
    background: var(--mark);
    border-radius: 6px;
    text-decoration: underline;
    text-decoration-thickness: 2px;
  }
  .cm-plus {
    min-block-size: var(--target);
    justify-self: center;
    padding-inline: 20px;
  }
  .sources {
    display: grid;
    gap: 6px;
    padding-block-start: 12px;
    border-block-start: 1px solid var(--line);
    font-size: 0.92rem;
    color: var(--ink2);
  }
  .sources a {
    display: inline-block;
    padding-block: 10px;
    color: var(--primary);
  }
</style>
