<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import {
    cerclesFor,
    countBy,
    inGroup,
    lieuxFor,
    splitEntryId,
    visibleEntries,
    visibleFiches,
    weeklyChallenge,
    type Defi,
  } from '@awform/content/adab';
  import Ar from '$lib/Ar.svelte';
  import { activeProfile } from '$lib/attempts';
  import { fmtNumber, t } from '$lib/i18n';
  import { levelLabel } from '$lib/levels';
  import { localUnit } from '$lib/offline';
  import { fetchMe, type Me, type ProfileInfo } from '$lib/session';
  import { maskLocal } from '$lib/signaler';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Icon, { vIcon } from '$lib/ui/Icon.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import FicheVue from '$lib/vivre/FicheVue.svelte';
  import TexteGuide from '$lib/vivre/TexteGuide.svelte';
  import VivreTabs from '$lib/vivre/VivreTabs.svelte';
  import {
    blockAt,
    learnerOf,
    loadCatalogue,
    loadFiche,
    loadGuide,
    TILE_TONES,
    type Catalogue,
    type Fiche,
    type Learner,
  } from '$lib/vivre/vivre';

  /**
   * A37 — « Vivre l'islam », onglet Bon comportement (une seule page, vues par paramètres) :
   *  - accueil : le défi de la semaine, puis les rubriques par cercle (« avec qui ? ») ou par lieu (« où ? »),
   *    filtrées par l'âge et ce que les livres de l'élève ont déjà enseigné (enfants : grandes tuiles) ;
   *  - `?c=<cercle>` / `?l=<lieu>` : fiches et rubriques des livres du groupe ;
   *  - `?f=<fiche>` / `?e=<rubrique>` : une fiche, ou une rubrique lue dans sa leçon ;
   *  - `?parents` (espace Famille) : « Transmettre les valeurs » — chapitre du guide des parents (gp.c18) et défi
   *    de la semaine de chaque enfant.
   */
  type Obj = Record<string, unknown>;
  type KidDefi = { p: ProfileInfo; defi: Defi | null };
  let cat = $state<Catalogue | null>(null);
  let offline = $state(false);
  let loaded = $state(false);
  let who = $state<Learner>({ kind: null, units: null });
  let profile = $state<ProfileInfo | null>(null);
  let me = $state<Me | null>(null);
  let unit = $state<{ id: string; block: Obj | null; madhhab: string | null } | null>(null);
  let kids = $state<KidDefi[] | null>(null);
  let guide = $state<Obj | null>(null);
  let loadedFiche = $state<{ id: string; fiche: Fiche | null } | null>(null);

  const q = $derived(page.url.searchParams);
  const par = $derived<'cercle' | 'lieu'>(
    q.get('l') || q.get('par') === 'lieu' ? 'lieu' : 'cercle',
  );
  const groupe = $derived(q.get('c') ?? q.get('l'));
  const ficheId = $derived(q.get('f'));
  const entryId = $derived(q.get('e'));
  const parents = $derived(q.has('parents'));
  const entries = $derived(cat ? visibleEntries(cat.entrees, who) : []);
  // fiches d'essai : servies par l'API de TEST seulement (jamais en démonstration), signalées « Fiche d'essai »
  const fiches = $derived(cat ? visibleFiches(cat.fiches, who, true) : []);
  const defi = $derived(weeklyChallenge(entries, fiches, new Date(), profile?.id ?? '', who.kind));
  const counts = $derived(countBy([...fiches, ...entries], par));
  const tiles = $derived(
    (par === 'cercle' ? cerclesFor(who.kind) : lieuxFor(who.kind)).filter((g) => counts[g.id]),
  );
  const enfant = $derived(who.kind === 'enfant');
  const parentAccount = $derived(!profile && me?.account.kind === 'parent');
  const titres = $derived(Object.fromEntries((cat?.fiches ?? []).map((f) => [f.id, f.titre_fr])));
  const entry = $derived(entryId ? (cat?.entrees.find((e) => e.id === entryId) ?? null) : null);
  const label = (by: 'cercle' | 'lieu', id: string) => t(`vi.${by === 'cercle' ? 'c' : 'l'}.${id}`);

  onMount(async () => {
    me = await fetchMe().catch(() => null);
    profile =
      (await activeProfile().catch(() => null)) ??
      (me?.account.kind === 'adulte' ? (me.profiles[0] ?? null) : null);
    const [c, w] = await Promise.all([loadCatalogue(), learnerOf(profile)]);
    cat = c.data;
    offline = c.offline;
    who = w;
    loaded = true;
  });

  // rubrique d'un livre : lue dans sa leçon (appareil si le niveau est téléchargé, sinon réseau)
  $effect(() => {
    const at = entryId ? splitEntryId(entryId) : null;
    if (!at || unit?.id === entryId) return;
    void (async () => {
      const local = await localUnit(at.unit).catch(() => null);
      const u = (
        local
          ? await maskLocal(local.unit)
          : await fetch(`/api/v1/units/${encodeURIComponent(at.unit)}`)
              .then((r) => (r.ok ? r.json() : null))
              .then((r: { unit?: unknown } | null) => r?.unit ?? null)
              .catch(() => null)
      ) as { lesson?: unknown; madhhab?: Record<string, string> } | null;
      unit = {
        id: entryId!,
        block: u ? blockAt(u.lesson, at.path) : null,
        madhhab: u?.madhhab?.[at.path] ?? null,
      };
    })();
  });

  // fiche du livret : chargée à l'ouverture (gardée sur l'appareil)
  $effect(() => {
    const id = ficheId;
    if (!id || loadedFiche?.id === id) return;
    void loadFiche(id).then((fiche) => (loadedFiche = { id, fiche }));
  });

  // espace Famille : défi de la semaine de chaque enfant (le même que celui qu'il voit)
  $effect(() => {
    if (!parents || !loaded || kids) return;
    void (async () => {
      const out: KidDefi[] = [];
      for (const p of (me?.profiles ?? []).filter((x) => x.kind !== 'adulte')) {
        const w = await learnerOf(p);
        const es = cat ? visibleEntries(cat.entrees, w) : [];
        const fs = cat ? visibleFiches(cat.fiches, w, true) : [];
        out.push({ p, defi: weeklyChallenge(es, fs, new Date(), p.id, w.kind) });
      }
      kids = out;
      guide = await loadGuide();
    })();
  });
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- liens « ?… » : vues de la même page /vivre -->
{#snippet defiCard(d: Defi | null, titre: string)}
  <h2 class="dt"><Icon name="etoile" /> <Bidi text={titre} /></h2>
  {#if d}
    {#if d.kind === 'rubrique' && d.ar}<Ar text={d.ar} block />{/if}
    <p class="df"><Bidi text={d.fr} /></p>
    <a href={d.kind === 'fiche' ? `?f=${d.fiche}` : `?e=${d.entry}`} class="muted"
      ><Bidi text={t('vi.defi_de', { titre: d.titre_fr })} /></a
    >
  {:else}
    <p class="muted">{t('vi.defi_vide')}</p>
  {/if}
{/snippet}

<svelte:head><title>{t('app.nom')} — {t('nav.vivre')}</title></svelte:head>

<h1>{t('nav.vivre')}</h1>
<VivreTabs current="comportement" />

{#if !loaded}
  <Loading />
{:else if !cat}
  <EmptyState icon="horsligne" title={t('vi.absent_titre')} text={t('vi.absent_texte')} />
{:else if parents}
  <a class="back" href="?" data-testid="vi-retour">← {t('vi.toutes')}</a>
  <h2>{t('vi.transmettre')}</h2>
  {#if guide}<TexteGuide chapitre={guide} pays={me?.account.country ?? null} />{:else}<p
      class="muted"
    >
      {t('vi.transmettre_texte')}
    </p>{/if}
  <h2>{t('vi.ensemble')}</h2>
  {#if !kids}
    <Loading />
  {:else if !kids.length}
    <EmptyState icon="famille" title={t('vi.aucun_enfant')} />
  {:else}
    {#each kids as k (k.p.id)}
      <section class="card defi" data-testid="vi-defi-enfant" data-profil={k.p.id}>
        {@render defiCard(k.defi, t('vi.defi_enfant', { nom: k.p.pseudonym }))}
      </section>
    {/each}
  {/if}
{:else if ficheId || entryId}
  <a class="back" href="?" data-testid="vi-retour">← {t('vi.toutes')}</a>
  {#if ficheId && loadedFiche?.id !== ficheId}
    <Loading />
  {:else if ficheId && loadedFiche?.fiche}
    <FicheVue
      fiche={loadedFiche.fiche}
      kind={who.kind}
      pays={me?.account.country ?? null}
      {titres}
    />
  {:else if entry && unit?.id === entryId && unit.block}
    <FicheVue {entry} block={unit.block} madhhab={unit.madhhab} kind={who.kind} {titres} />
  {:else if entry && unit?.id !== entryId}
    <Loading />
  {:else}
    <EmptyState icon="info" title={t('vi.introuvable')} />
  {/if}
{:else if groupe}
  {@const fs = inGroup(fiches, par, groupe)}
  {@const es = inGroup(entries, par, groupe)}
  <a class="back" href={`?par=${par}`} data-testid="vi-retour">← {t('vi.toutes')}</a>
  <h2 data-testid="vi-groupe" data-groupe={groupe}><Bidi text={label(par, groupe)} /></h2>
  {#if !fs.length && !es.length}<p class="muted">{t('vi.groupe_vide')}</p>{/if}
  {#if fs.length}
    <h3>{t('vi.fiches')}</h3>
    {#each fs as f (f.id)}
      <a class="card item" href={`?f=${f.id}`} data-fiche={f.id}>
        <strong><Bidi text={f.titre_fr} /></strong>
        {#if f.test}<span class="soon">{t('vi.essai')}</span>{/if}
      </a>
    {/each}
  {/if}
  {#if es.length}
    <h3>{t('vi.dans_livres')}</h3>
    {#each es as e (e.id)}
      <a class="card item" href={`?e=${e.id}`} data-entree={e.id}>
        <strong><Bidi text={e.titre_fr} /></strong>
        <small class="muted"
          ><Bidi
            text={t(e.bilan ? 'vi.bilan' : 'vi.lecon', { niveau: levelLabel(e.level), n: e.n })}
          /></small
        >
        {#if e.situations && !enfant}<span class="pill"
            >{t('vi.que_fais_tu')} · {fmtNumber(e.situations)}</span
          >{/if}
      </a>
    {/each}
  {/if}
{:else}
  {#if offline}<p class="muted" data-testid="vi-hors-ligne">{t('vi.hors_ligne')}</p>{/if}
  {#if parentAccount}
    <a class="card item" href="?parents" data-testid="vi-transmettre">
      <strong>{t('vi.transmettre')}</strong><small class="muted">{t('vi.transmettre_lien')}</small>
    </a>
  {/if}
  <section class="card defi" data-testid="vi-defi" data-defi={defi?.kind ?? ''}>
    {@render defiCard(defi, t('vi.defi_titre'))}
  </section>
  <div class="par" role="group" aria-label={t('vi.choix')}>
    {#each ['cercle', 'lieu'] as const as p (p)}
      <a
        href={`?par=${p}`}
        class:on={par === p}
        aria-current={par === p ? 'true' : undefined}
        data-par={p}><Bidi text={t(`vi.par_${p}`)} /></a
      >
    {/each}
  </div>
  {#if tiles.length}
    <ul class="tiles" data-testid="vi-tuiles" data-par={par}>
      {#each tiles as g, i (g.id)}<li>
          <a class="tile" href={`?${par === 'cercle' ? 'c' : 'l'}=${g.id}`} data-groupe={g.id}>
            <span
              class="tile-ic"
              style:background={`var(--${TILE_TONES[i % TILE_TONES.length]})`}
              style:color="var(--ink)"><Icon name={vIcon(g.id)} size={enfant ? 40 : 24} /></span
            >
            <strong><Bidi text={label(par, g.id)} /></strong>
            {#if !enfant}<small><Bidi text={t('vi.nombre', { n: counts[g.id] ?? 0 })} /></small
              >{/if}
          </a>
        </li>{/each}
    </ul>
  {:else}
    <EmptyState icon="etoile" title={t('vi.vide_titre')} text={t('vi.vide_texte')} />
  {/if}
{/if}

<!-- eslint-enable svelte/no-navigation-without-resolve -->

<style>
  .back {
    display: inline-block;
    min-height: 44px;
    padding: var(--space-s) 0;
  }
  .defi {
    border-inline-start: 6px solid var(--accent);
  }
  .dt {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: 1.1rem;
  }
  .df {
    margin: var(--space-xs) 0;
    font-size: 1.05rem;
    font-weight: 700;
  }
  .item {
    display: grid;
    gap: 2px;
    justify-items: start;
    margin: var(--space-s) 0;
    color: var(--ink);
    text-decoration: none;
  }
  .par {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    padding: 4px;
    border-radius: var(--radius-pill);
    background: var(--surface);
  }
  .par a {
    display: grid;
    place-items: center;
    min-height: 44px;
    border-radius: var(--radius-pill);
    color: var(--ink2);
    font-weight: 700;
    text-decoration: none;
  }
  .par a.on {
    background: var(--card);
    color: var(--primary);
    box-shadow: var(--shadow-card);
  }
</style>
