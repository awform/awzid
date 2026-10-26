<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount, tick } from 'svelte';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { activeProfile } from '$lib/attempts';
  import { t } from '$lib/i18n';
  import { fetchMe, type ProfileInfo } from '$lib/session';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import DouaEcouter from './DouaEcouter.svelte';
  import Ecouter from '$lib/Ecouter.svelte';
  import DouaTexte from './DouaTexte.svelte';
  import {
    FICHE_INVOQUER,
    forChild,
    groupOf,
    inRubrique,
    loadDouas,
    loadFavorites,
    toggleFavorite,
    type DouasData,
    type FichePoint,
  } from './douas';

  /**
   * Onglet « Douas » de « Vivre l'islam » (chargé à la demande, gardé au premier usage) : douas RETENUES par le
   * référent seulement, classées par rubriques ; pour chacune, l'arabe vocalisé sur sa ligne, le moment où on la
   * dit, la traduction (« en préparation » tant qu'elle n'est pas fournie) ; source et degré derrière « Source » ;
   * favoris sur l'appareil. Profil enfant : seulement la liste courte du quotidien, sans rubriques.
   * Phase 2 : groupes du référent (quotidien, moments de la vie, besoins, Coran), fiche « Comment invoquer », renvois
   * « Voir aussi » (sans dupliquer le texte), sens en français, voix de synthèse PROVISOIRE pour les hadiths seulement
   * (jamais un verset : `audio` est vide pour le Coran et pour les hadiths qui citent un verset).
   * Phase 3 : groupe « Le temps de l'année », points « À savoir » et « Ce que nous n'ajoutons pas »
   * après les douas (chacun avec sa source lue), fiche « L'aumône » en fin de rangée, avec renvois vers la zakāt des Madjaliss.
   */
  let data = $state<DouasData | null>(null);
  let offline = $state(false);
  let loaded = $state(false);
  let profile = $state<ProfileInfo | null>(null);
  let favoris = $state<string[]>([]);
  let ouverte = $state<string | null>(null);
  let choix = $state<string | null>(page.url.searchParams.get('r'));

  const enfant = $derived(profile?.kind === 'enfant');
  const rubrique = $derived(
    choix === 'favoris' ||
      (choix && data?.fiches?.[choix]) ||
      data?.rubriques.some((r) => r.id === choix)
      ? choix
      : (data?.rubriques[0]?.id ?? null),
  );
  /** fiche ouverte (« Comment invoquer », « L'aumône »), sinon null */
  const fiche = $derived((rubrique && data?.fiches?.[rubrique]) || null);
  /** fiches : « Comment invoquer » en tête de la rangée, les autres (« L'aumône ») en fin */
  const fiches = $derived(Object.entries(data?.fiches ?? {}));
  const rub = $derived(data?.rubriques.find((r) => r.id === rubrique) ?? null);
  const liste = $derived<string[]>(
    !data
      ? []
      : enfant
        ? forChild(data)
        : fiche
          ? []
          : rubrique === 'favoris'
            ? favoris.filter((id) => data!.douas[id])
            : inRubrique(data, rubrique ?? ''),
  );

  onMount(async () => {
    const me = await fetchMe().catch(() => null);
    profile =
      (await activeProfile().catch(() => null)) ??
      (me?.account.kind === 'adulte' ? (me.profiles[0] ?? null) : null);
    const [r, f] = await Promise.all([loadDouas(), loadFavorites(profile?.id ?? null)]);
    data = r.data;
    offline = r.offline;
    favoris = f;
    loaded = true;
  });

  // rubrique choisie (lien `?r=…`) : sa pastille visible dans la rangée défilante
  let cats = $state<HTMLElement | null>(null);
  $effect(() => {
    const r = rubrique;
    cats
      ?.querySelector(`[data-rubrique="${r}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  const voirAussi = $derived(enfant ? [] : (rub?.voir_aussi ?? []));
  const groupe = $derived(data && rubrique ? groupOf(data, rubrique) : null);
  /** rubriques par groupe (architecture du référent), sinon une seule liste */
  const blocs = $derived(
    !data
      ? []
      : data.groupes?.length
        ? data.groupes.map((g) => ({
            id: g.id as string | null,
            rubriques: data!.rubriques.filter((r) => g.rubriques.includes(r.id)),
          }))
        : [{ id: null as string | null, rubriques: data.rubriques }],
  );
  const ADHKAR = '/quotidien/adhkar';
  const MADJALISS = '/madjaliss';
  const lienSource = (l: string) =>
    l.startsWith('https://dorar.net/') ? t('do.voir_dorar') : t('do.voir_sunnah');

  /** « Voir aussi » : ouvre la rubrique de la doua et l'amène à l'écran */
  async function allerA(id: string) {
    const r = data?.douas[id]?.rubrique;
    if (!r) return;
    choix = r;
    await tick();
    const el = document.querySelector<HTMLElement>(
      `[data-testid="douas-liste"] [data-doua="${id}"]`,
    );
    el?.scrollIntoView({ block: 'start' });
    el?.focus({ preventScroll: true });
  }

  async function basculer(id: string) {
    favoris = await toggleFavorite(profile?.id ?? null, favoris, id);
  }
</script>

{#snippet pastilleFiche(id: string, titre: string)}<button
    type="button"
    class:on={rubrique === id}
    aria-pressed={rubrique === id}
    onclick={() => (choix = id)}
    data-rubrique={id}><Bidi text={titre} /></button
  >{/snippet}

<!-- points sourcés (fiches, « À savoir », « Ce que nous n'ajoutons pas ») : le français, puis la source lue -->
{#snippet points(ps: FichePoint[])}<ul>
    {#each ps as p, i (i)}
      <li>
        <Bidi text={p.texte} />
        {#if p.sources.length}<span class="fiche-src muted small">
            {#each p.sources as src, j (j)}{#if j}
                ;
              {/if}{#if src.lien}<a
                  href={src.lien}
                  target="_blank"
                  rel="noopener noreferrer external"><Bidi text={src.recueil} /></a
                >{:else}<Bidi text={src.recueil} />{/if}{#if src.degre}&#160;(<Bidi
                  text={src.degre}
                />{#if src.juge}, <Bidi text={src.juge} />{/if}){/if}{/each}
          </span>{/if}
      </li>
    {/each}
  </ul>{/snippet}

<p class="bandeau" role="note" data-testid="douas-bandeau">
  <Icon name="coche" size={18} />
  <span>{t('do.bandeau')}</span>
</p>

{#if !loaded}
  <Loading />
{:else if !data}
  <EmptyState icon="horsligne" title={t('do.absentes_titre')} text={t('do.absentes_texte')} />
{:else}
  {#if offline}<p class="muted small" role="status" data-testid="douas-hors-ligne">
      {t('do.hors_ligne')}
    </p>{/if}
  {#if enfant}
    <h2 class="titre-enfant">{t('do.enfant_titre')}</h2>
  {:else}
    <div
      class="cats"
      bind:this={cats}
      role="group"
      aria-label={t('do.rubriques')}
      data-testid="douas-rubriques"
    >
      <button
        type="button"
        class:on={rubrique === 'favoris'}
        aria-pressed={rubrique === 'favoris'}
        onclick={() => (choix = 'favoris')}
        data-rubrique="favoris"
        ><Icon name="etoile" size={18} />
        <Bidi text={t('do.favoris_n', { n: favoris.length })} /></button
      >
      {#each fiches.filter(([id]) => id === FICHE_INVOQUER) as [id, f] (id)}{@render pastilleFiche(
          id,
          f.titre,
        )}{/each}
      {#each blocs as b (b.id ?? '-')}
        {#if b.id}<span class="groupe" data-groupe={b.id}><Bidi text={t(`do.g.${b.id}`)} /></span
          >{/if}
        {#each b.rubriques as r (r.id)}
          <button
            type="button"
            class:on={rubrique === r.id}
            aria-pressed={rubrique === r.id}
            onclick={() => (choix = r.id)}
            data-rubrique={r.id}><Bidi text={t(`do.r.${r.id}`)} /></button
          >
        {/each}
      {/each}
      {#each fiches.filter(([id]) => id !== FICHE_INVOQUER) as [id, f] (id)}{@render pastilleFiche(
          id,
          f.titre,
        )}{/each}
    </div>
    {#if groupe && rubrique !== 'favoris'}<p class="sur-titre muted" data-testid="douas-groupe">
        <Bidi text={t(`do.g.${groupe}`)} />
      </p>{/if}
    <h2 data-testid="douas-titre-rubrique">
      <Bidi
        text={rubrique === 'favoris'
          ? t('do.favoris')
          : fiche
            ? fiche.titre
            : t(`do.r.${rubrique}`)}
      />
    </h2>
  {/if}

  {#if !enfant && fiche}
    <article class="card fiche" data-testid="douas-fiche">
      <p><Bidi text={fiche.intro} /></p>
      {#each fiche.sections as s (s.titre)}
        <h3><Bidi text={s.titre} /></h3>
        {@render points(s.points)}
      {/each}
      {#if fiche.renvois?.length}<ul class="renvois">
          {#each fiche.renvois as v (v.lien)}
            <!-- eslint-disable svelte/no-navigation-without-resolve -- chemin résolu ; lien vérifié par scripts/douas.mjs -->
            <li>
              <a
                class="btn-ligne"
                href={`${resolve('/madjaliss')}${v.lien.slice(MADJALISS.length)}`}
                data-renvoi-lecon={v.lien}><Bidi text={v.titre} /></a
              >
            </li>
            <!-- eslint-enable svelte/no-navigation-without-resolve -->
          {/each}
        </ul>{/if}
    </article>
  {:else}
    {#if !liste.length}
      {#if rubrique === 'favoris'}<EmptyState
          icon="etoile"
          title={t('do.favoris_vide_titre')}
          text={t('do.favoris_vide')}
        />{/if}
    {:else}
      <ul class="liste" data-testid="douas-liste" data-enfant={enfant ? '1' : undefined}>
        {#each liste as id (id)}
          {@const d = data.douas[id]!}
          {@const fav = favoris.includes(id)}
          <li class="card doua" class:facultatif={d.facultatif} data-doua={id} tabindex="-1">
            <h3><Bidi text={d.titre} /></h3>
            {#if d.facultatif}<span class="pill">{t('do.facultatif')}</span>{/if}
            {#if d.compagnon}<span class="pill" data-testid="douas-compagnon"
                >{t('do.compagnon')}</span
              >{/if}
            <DouaTexte doua={d} />
            <!-- voix de synthèse provisoire : hadiths seulement (jamais un verset ni un hadith qui en cite un) -->
            {#if d.audio && !d.coran && !d.coran_cite}<DouaEcouter src={d.audio} {id} />{/if}
            <!-- 26/10/2026 : doua tirée du Coran ou qui le cite : récitation de Muḥammad Ayyūb (table des récitations) -->
            {#if d.coran?.length}<Ecouter
                text=""
                versets={d.coran.map((v) => `${v.s}:${v.a}`)}
              />{:else if d.coran_cite && d.ar}<Ecouter text={d.ar} />{/if}
            {#if d.coran_cite}<p class="cite muted" data-testid="douas-coran-cite">
                {t('do.contient_coran')}
              </p>{/if}
            {#if d.moment}<p class="moment"><Bidi text={d.moment} /></p>{/if}
            {#if d.traduction}
              <p class="sens"><Bidi text={d.traduction} /></p>
            {:else}
              <p class="sens muted" data-testid="douas-traduction-prep">
                {t('do.traduction_prep')}
              </p>
            {/if}
            <div class="actions">
              <button
                type="button"
                class="btn-ligne"
                aria-expanded={ouverte === id}
                aria-controls={`src-${id}`}
                onclick={() => (ouverte = ouverte === id ? null : id)}
                data-testid="douas-source"><Icon name="info" size={18} /> {t('do.source')}</button
              >
              <button
                type="button"
                class="btn-ligne"
                class:on={fav}
                aria-pressed={fav}
                onclick={() => basculer(id)}
                data-testid="douas-favori"
                ><Icon name="etoile" size={18} filled={fav} />
                <Bidi text={fav ? t('do.retirer_favori') : t('do.ajouter_favori')} /></button
              >
            </div>
            {#if ouverte === id}
              <dl class="source" id={`src-${id}`} data-testid="douas-source-detail">
                {#if d.compagnon}<dd class="compagnon"><Bidi text={d.compagnon} /></dd>{/if}
                <!-- parole de Compagnon : seulement qui l'a dite et qui la rapporte, et le lien (le degré viendra
                   après vérification sur l'édition) -->
                {#if !d.compagnon}
                  <dt>{t('do.recueil')}</dt>
                  <dd><Bidi text={d.source.recueil} /></dd>
                  {#if d.source.degre}<dt>{t('do.degre')}</dt>
                    <dd><Bidi text={d.source.degre} /></dd>{/if}
                  {#if d.source.juge}<dt>{t('do.juge_par')}</dt>
                    <dd><Bidi text={d.source.juge} /></dd>{/if}
                  {#if d.note}<dd class="note"><Bidi text={d.note} /></dd>{/if}
                {/if}
                {#if d.source.lien}<dd class="lien">
                    <a href={d.source.lien} target="_blank" rel="noopener noreferrer external"
                      ><Bidi text={lienSource(d.source.lien)} /></a
                    >
                  </dd>{/if}
              </dl>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    <!-- la doua d'abord (contenu en héros), puis « À savoir », puis « Ce que nous n'ajoutons pas » -->
    {#if !enfant && rub?.a_savoir}<section class="card fiche" data-testid="douas-a-savoir">
        <h3>{t('do.a_savoir')}</h3>
        {@render points(rub.a_savoir)}
      </section>{/if}
    {#if !enfant && rub?.non_ajoute}<section class="card fiche" data-testid="douas-non-ajoute">
        <h3>{t('do.non_ajoute')}</h3>
        {@render points(rub.non_ajoute)}
      </section>{/if}
  {/if}
  {#if voirAussi.length}
    <section class="voir-aussi" data-testid="douas-voir-aussi">
      <h3>{t('do.voir_aussi')}</h3>
      <ul>
        {#each voirAussi as v, i (i)}
          <li>
            {#if 'doua' in v}
              {@const cible = data.douas[v.doua]}
              {#if cible}<button
                  type="button"
                  class="btn-ligne"
                  data-renvoi={v.doua}
                  onclick={() => allerA(v.doua)}
                  ><Bidi text={`${cible.titre} — ${t(`do.r.${cible.rubrique}`)}`} /></button
                >{/if}
            {:else}
              <!-- lien vérifié par scripts/douas.mjs : toujours /quotidien/adhkar, éventuellement ?c=… -->
              <!-- eslint-disable svelte/no-navigation-without-resolve -- chemin résolu, suivi d'un paramètre -->
              <a
                class="btn-ligne"
                href={`${resolve('/quotidien/adhkar')}${v.lien.slice(ADHKAR.length)}`}
                data-renvoi-adhkar={v.adhkar}><Bidi text={v.titre} /></a
              >
              <!-- eslint-enable svelte/no-navigation-without-resolve -->
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
{/if}

<style>
  .bandeau {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 var(--space-s);
    padding: 8px 12px;
    border-radius: var(--radius-md);
    background: var(--info-bg);
    color: var(--ink);
    font-size: 0.9rem;
    font-weight: 700;
  }
  .cats {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding: 2px 2px 6px;
    scrollbar-width: thin;
  }
  .cats button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
    min-height: 44px;
    padding: 0 14px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--line);
    background: var(--card);
    color: var(--ink);
    font-weight: 700;
    white-space: nowrap;
  }
  .cats button.on {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--on-primary);
  }
  .titre-enfant {
    margin-top: var(--space-s);
  }
  .liste {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .doua h3 {
    margin: 0;
    font-size: 1.02rem;
  }
  .doua.facultatif {
    margin-top: calc(-1 * var(--space-xs));
    border-inline-start: 4px solid var(--line);
  }
  .doua :global(.ar),
  .doua :global(.quran-text) {
    font-size: var(--ar-size);
  }
  .doua :global(.quran-text) {
    font-size: calc(var(--ar-size) + 4px);
  }
  .moment {
    margin: 0;
    font-weight: 700;
    color: var(--primary);
  }
  .sens {
    margin: 4px 0;
    white-space: pre-line;
  }
  .groupe {
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    padding: 0 2px 0 8px;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--muted, inherit);
    white-space: nowrap;
  }
  .sur-titre {
    margin: var(--space-s) 0 0;
    font-size: 0.85rem;
    font-weight: 700;
  }
  .sur-titre + h2 {
    margin-top: 0;
  }
  .fiche h3,
  .voir-aussi h3 {
    margin: var(--space-s) 0 4px;
    font-size: 1rem;
  }
  .fiche ul,
  .voir-aussi ul {
    margin: 0;
    padding-inline-start: 1.2em;
  }
  .voir-aussi ul {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .fiche li {
    margin: 6px 0;
  }
  .fiche .renvois {
    list-style: none;
    padding: 0;
    margin-top: var(--space-s);
  }
  .fiche-src {
    display: block;
  }
  .fiche-src a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
  }
  .voir-aussi .btn-ligne {
    text-align: start;
    text-decoration: none;
  }
  .cite {
    margin: 0 0 4px;
    font-size: 0.85rem;
  }
  .source .lien a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 6px;
  }
  .btn-ligne {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 12px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--line);
    background: var(--card);
    color: var(--ink);
    font-weight: 700;
  }
  .btn-ligne.on {
    border-color: var(--accent);
    color: var(--ink);
  }
  .source {
    margin: 8px 0 0;
    padding: 8px 12px;
    border-radius: var(--radius-md);
    background: var(--surface);
    font-size: 0.9rem;
  }
  .source dt {
    font-weight: 700;
    margin-top: 4px;
  }
  .source dd {
    margin: 0;
  }
  .source .compagnon,
  .source .note {
    margin-top: 6px;
    font-style: italic;
  }
  .pill {
    display: inline-block;
    margin: 4px 6px 0 0;
  }
  .small {
    font-size: 0.9rem;
  }
</style>
