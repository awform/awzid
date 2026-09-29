<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';

  /**
   * « Construire un mot à partir de sa racine » (lot 15, inspiré de l'étude comparative) : racine + schème
   * → quel mot ? Racines, schèmes et mots EXTRAITS des livres gelés (vérifiés mot pour mot à l'import),
   * jamais inventés ; aucune racine coranique non vérifiée. Aucune note : un essai de plus si besoin.
   */
  interface Item {
    id: string;
    source: string;
    level: string;
    root: string;
    scheme: string;
    singular: string;
    plural: string;
    distractors: string[];
  }
  let items = $state<Item[]>([]);
  let loaded = $state(false);
  let i = $state(0);
  let chosen = $state<string | null>(null);
  let done = $state(0);

  onMount(async () => {
    try {
      const r = await fetch('/api/v1/activites/racines');
      if (r.ok) items = ((await r.json()) as { items: Item[] }).items;
    } catch {
      items = [];
    }
    loaded = true;
  });
  const item = $derived(items[i] ?? null);
  /** ordre des propositions fixé par l'élément (pas de hasard : même écran pour toute la classe) */
  const options = $derived(
    item ? [item.plural, ...item.distractors].sort((a, b) => a.localeCompare(b, 'ar')) : [],
  );
  const ok = $derived(!!item && chosen === item.plural);
  function next() {
    if (ok) done++;
    chosen = null;
    i++;
  }
  const src = (s: string) => {
    const [lv, l] = s.split('.');
    return t('rac.source', { livre: (lv ?? '').toUpperCase(), n: Number((l ?? '').slice(1)) });
  };
</script>

<svelte:head><title>{t('app.nom')} — {t('rac.titre')}</title></svelte:head>

<h1>{t('rac.titre')}</h1>
<p>{t('rac.intro')}</p>

{#if loaded && !items.length}
  <p class="card">{t('rac.aucun')}</p>
{:else if item}
  <section class="card jeu" data-testid="racine" data-item={item.id}>
    <p class="muted small">{t('rac.progression', { n: i + 1, total: items.length })}</p>
    <div class="grid">
      <div>
        <p class="lbl">{t('rac.racine')}</p>
        <p class="root" dir="rtl" lang="ar" data-testid="racine-lettres">{item.root}</p>
      </div>
      <div>
        <p class="lbl">{t('rac.scheme')}</p>
        <p class="ar big" dir="rtl" lang="ar">{item.scheme}</p>
      </div>
      <div>
        <p class="lbl">{t('rac.singulier')}</p>
        <p class="ar big" dir="rtl" lang="ar">{item.singular}</p>
      </div>
    </div>
    <p><strong>{t('rac.question')}</strong></p>
    <div class="opts" role="group" aria-label={t('rac.question')}>
      {#each options as o (o)}
        <button
          type="button"
          class="opt ar"
          class:good={chosen === o && o === item.plural}
          class:bad={chosen === o && o !== item.plural}
          dir="rtl"
          lang="ar"
          disabled={ok}
          onclick={() => (chosen = o)}
          data-option={o}>{o}</button
        >
      {/each}
    </div>
    {#if chosen}
      <p role="status" class:okmsg={ok} data-testid="racine-retour">
        {ok ? t('rac.bravo', { racine: item.root }) : t('rac.essaie')}
      </p>
    {/if}
    {#if ok}<button type="button" class="primary" onclick={next} data-testid="racine-suivant"
        >{t('rac.suivant')}</button
      >{/if}
    <p class="muted small">{src(item.source)}</p>
  </section>
{:else if loaded}
  <p class="card okmsg" role="status" data-testid="racine-fin">{t('rac.fini', { n: done })}</p>
{/if}

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 12px;
    text-align: center;
  }
  .lbl {
    font-size: 0.9rem;
    color: var(--ink2);
    margin: 0;
  }
  .root {
    font-family: var(--font-ar);
    font-size: 2.2rem;
    letter-spacing: 0.4em;
    margin: 4px 0;
  }
  .ar {
    font-family: var(--font-ar);
  }
  .big {
    font-size: 1.8rem;
    margin: 4px 0;
  }
  .opts {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin: 8px 0;
  }
  .opt {
    font-size: 1.6rem;
    min-width: 120px;
    min-height: 56px;
  }
  .opt.good {
    background: var(--ok-bg);
    color: var(--ok-ink);
  }
  .opt.bad {
    background: var(--bad-bg);
    color: var(--bad-ink);
  }
  .okmsg {
    color: var(--ok-ink);
    font-weight: 700;
  }
  .small {
    font-size: 0.9rem;
  }
</style>
