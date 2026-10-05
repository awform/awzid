<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { unitLabel, type UnitDetail } from '$lib/api';
  import { t } from '$lib/i18n';
  import { localUnit } from '$lib/offline';
  import Icon from '$lib/ui/Icon.svelte';

  /**
   * A27 — fiche d'écriture de la leçon, à imprimer ou à enregistrer en PDF (pour qui n'a pas le cahier papier) :
   * le contenu du livre seulement — mots à repasser (lettres en creux), lettres à relier, phrases à recopier,
   * production, lignes de dictée. L'impression du navigateur donne le PDF.
   */
  type Obj = Record<string, unknown>;
  let unit = $state<UnitDetail | null>(null);
  let failed = $state(false);
  const id = $derived(page.url.searchParams.get('lecon') ?? '');
  onMount(async () => {
    if (!/^[a-z]{2,3}\d{1,2}\.l\d{2}$/.test(id)) return void (failed = true);
    const local = await localUnit(id).catch(() => null);
    if (local) unit = local.unit;
    else {
      const r = await fetch(`/api/v1/units/${encodeURIComponent(id)}`).catch(() => null);
      if (r?.ok) unit = ((await r.json()) as { unit: UnitDetail }).unit;
      else failed = true;
    }
  });
  const E = $derived(((unit?.lesson as Obj | undefined)?.ecriture ?? {}) as Obj);
  const strs = (v: unknown) =>
    Array.isArray(v) ? v.map((x) => String(x).replace(/[[\]]/g, '')) : [];
  const mots = $derived(strs(E.mots));
  const copie = $derived(strs(E.copie));
  const lier = $derived(
    (Array.isArray(E.lier) ? (E.lier as Array<{ lettres?: string[] }>) : []).map((x) =>
      (x.lettres ?? []).join(' + '),
    ),
  );
  const P = $derived(E.production as { consigne_fr?: string; lignes?: number } | undefined);
  const dictee = $derived(
    Number(E.dictee_n ?? (Array.isArray(E.dictee) ? E.dictee.length : 0)) || 0,
  );
</script>

<svelte:head><title>{t('app.nom')} — {t('parc.fiche')}</title></svelte:head>

<p class="noprint">
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- chemin résolu, suivi d'un paramètre -->
  <a href={`${resolve('/')}?onglet=ecriture`}>{t('commun.retour')}</a>
</p>

{#if failed}
  <p class="card">{t('erreur.introuvable')}</p>
{:else if unit}
  <article class="sheet" data-testid="fiche-ecriture" data-lecon={unit.id}>
    <header>
      <h1><Bidi text={`${unitLabel(unit)} — ${unit.titleFr}`} /></h1>
      <p class="ar-title" lang="ar" dir="rtl"><Bidi text={unit.titleAr} base="ar" /></p>
      <p class="name">
        {t('parc.fiche_nom')} ____________________ · {t('parc.fiche_date')} ____________
      </p>
    </header>
    <button
      type="button"
      class="primary noprint"
      onclick={() => window.print()}
      data-testid="imprimer"
      ><Icon name="telecharger" size={18} /><Bidi text={t('parc.imprimer')} /></button
    >
    {#if mots.length}
      <h2>{t('lecon.ecris_mots')}</h2>
      {#each mots as m, i (i)}
        <div class="trace-line" lang="ar" dir="rtl">
          {#each [0, 1, 2] as k (k)}<span class="ghost" class:first={k === 0}
              ><Bidi text={m} base="ar" /></span
            >{/each}
        </div>
      {/each}
    {/if}
    {#if lier.length}
      <h2>{t('lecon.relie_lettres')}</h2>
      {#each lier as l, i (i)}
        <div class="row-line">
          <span class="ar" lang="ar" dir="rtl"><Bidi text={l} base="ar" /></span><span class="rule"
          ></span>
        </div>
      {/each}
    {/if}
    {#if copie.length}
      <h2>{t('lecon.recopie')}</h2>
      {#each copie as c, i (i)}
        <p class="model" lang="ar" dir="rtl"><Bidi text={c} base="ar" /></p>
        <div class="rule tall"></div>
        <div class="rule tall"></div>
      {/each}
    {/if}
    {#if P?.consigne_fr}
      <h2>{t('lecon.ecris_moi')}</h2>
      <p><Bidi text={P.consigne_fr} /></p>
      {#each Array.from({ length: Math.min(8, P.lignes ?? 3) }) as _, i (i)}<div
          class="rule tall"
        ></div>{/each}
    {/if}
    {#if dictee}
      <h2>{t('lecon.dictee')}</h2>
      <p class="muted small">{t('parc.fiche_dictee')}</p>
      {#each Array.from({ length: Math.min(10, dictee) }) as _, i (i)}<div class="rule tall">
          <span class="num"><Bidi text={`${i + 1}.`} /></span>
        </div>{/each}
    {/if}
    <footer class="muted small">{t('parc.fiche_pied')}</footer>
  </article>
{/if}

<style>
  .sheet {
    background: var(--card);
    color: var(--ink);
    padding: var(--space-l);
    border-radius: var(--radius-md);
    border: 1px solid var(--line);
  }
  h1 {
    font-size: 1.2rem;
    margin: 0;
  }
  h2 {
    font-size: 1rem;
    margin: 18px 0 6px;
    border-bottom: 1px solid var(--line);
  }
  .ar-title,
  .model,
  .ar {
    font-family: var(--font-ar);
    font-size: 1.6rem;
  }
  .model {
    margin: 6px 0;
  }
  .name {
    color: var(--ink2);
  }
  .trace-line {
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
    font-family: var(--font-ar);
    font-size: 2.6rem;
    border-bottom: 1px dashed var(--line);
    padding: 4px 0;
  }
  .ghost {
    color: transparent;
    -webkit-text-stroke: 1px var(--ink2);
  }
  .ghost.first {
    color: var(--ink);
    -webkit-text-stroke: 0;
  }
  .row-line {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 12px;
    align-items: end;
  }
  .rule {
    border-bottom: 1px solid var(--ink2);
    min-height: 44px;
  }
  .rule.tall {
    min-height: 46px;
    position: relative;
  }
  .num {
    position: absolute;
    inset-inline-start: 0;
    bottom: 2px;
    font-size: 0.8rem;
    color: var(--ink2);
  }
  footer {
    margin-top: 16px;
  }
  .primary {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    margin: 8px 0;
  }
  .small {
    font-size: 0.85rem;
  }
  @media print {
    .noprint {
      display: none !important;
    }
    .sheet {
      border: 0;
      padding: 0;
    }
  }
</style>
