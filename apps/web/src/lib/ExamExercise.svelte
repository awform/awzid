<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import Ar from './Ar.svelte';
  import Illus from './Illus.svelte';
  import { t } from './i18n';

  /**
   * Exercice d'ÉPREUVE (lot 19) : la projection d'épreuve ne contient AUCUNE réponse ; ce composant recueille
   * une réponse par item, sans correction immédiate (la copie est corrigée par le serveur). Même forme de
   * réponse que l'entraînement ; « relier » : position affichée de l'élément de droite.
   * Types sans correction automatique : fait sur le cahier ou avec l'enseignant.
   */
  type Obj = Record<string, unknown>;
  let {
    ex,
    n,
    value = $bindable({}),
  }: { ex: Obj; n: number; value: Record<string, unknown> } = $props();
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const arr = (v: unknown) => (Array.isArray(v) ? (v as Obj[]) : []);
  const strs = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map(String) : []);
  const type = $derived(String(ex.type));
  const set = (k: number, r: unknown) => (value = { ...value, [k]: r });
  const toggle = (k: number) => {
    const v = { ...value };
    if (v[k]) delete v[k];
    else v[k] = { touched: true };
    value = v;
  };
  const chosen = (k: number) => (value[k] as { choice?: string } | undefined)?.choice;
  const seq = (k: number) => (value[k] as { sequence?: number[] } | undefined)?.sequence ?? [];
  function tapWord(k: number, w: number, total: number) {
    const s = seq(k);
    if (s.includes(w)) return;
    const next = [...s, w];
    set(k, { sequence: next.length > total ? [w] : next });
  }
</script>

<section class="ex" data-type={type}>
  <h3><Bidi text={t('epreuve.exercice', { n })} /></h3>
  {#if str(ex.consigne_fr)}<p class="consigne"><Bidi text={str(ex.consigne_fr)} /></p>{/if}
  {#if type === 'premiere_lettre' || type === 'ecoute' || type === 'complete' || type === 'qcm'}
    {#each arr(ex.items) as it, k (k)}
      <div class="item">
        {#if it.img}<Illus k={str(it.img)} cls="mini" />{/if}
        <!-- A27 : QCM des livres de sciences (test de positionnement, épreuve de passage) -->
        {#if type === 'qcm'}<span class="q"><Bidi text={str(it.q_fr) || str(it.q_ar)} /></span>{/if}
        {#if type === 'premiere_lettre'}<span class="ar-big">…<Ar text={str(it.suite)} /></span
          >{/if}
        {#if type === 'ecoute'}<span class="muted small">{t('epreuve.ecoute_adulte')}</span>{/if}
        {#if type === 'complete'}<span
            ><Ar text={str(it.avant)} /> ___ <Ar text={str(it.apres)} /></span
          >{/if}
        <div class="opts" role="group">
          {#each strs(it.options) as o (o)}
            <button
              type="button"
              class:on={chosen(k) === o}
              aria-pressed={chosen(k) === o}
              onclick={() => set(k, { choice: o })}
              >{#if type === 'qcm'}<Bidi text={o} />{:else}<Ar text={o} />{/if}</button
            >
          {/each}
        </div>
      </div>
    {/each}
  {:else if type === 'vrai_faux'}
    {#each arr(ex.items) as it, k (k)}
      {@const v = (value[k] as { value?: boolean } | undefined)?.value}
      <div class="item">
        {#if it.img}<Illus k={str(it.img)} cls="mini" />{/if}
        {#if str(it.ar)}<Ar text={str(it.ar)} />{/if}
        {#if str(it.fr)}<span><Bidi text={str(it.fr)} /></span>{/if}
        <div class="opts">
          <button
            type="button"
            class:on={v === true}
            aria-pressed={v === true}
            onclick={() => set(k, { value: true })}>{t('epreuve.vrai')}</button
          >
          <button
            type="button"
            class:on={v === false}
            aria-pressed={v === false}
            onclick={() => set(k, { value: false })}>{t('epreuve.faux')}</button
          >
        </div>
      </div>
    {/each}
  {:else if type === 'chasse' || type === 'contient'}
    <p><Ar text={str(ex.cible)} /></p>
    <div class="opts grid" role="group">
      {#each type === 'chasse' ? strs(ex.grille) : arr(ex.mots).map( (m) => str(m.ar) ) as cell, k (k)}
        <button
          type="button"
          class:on={!!value[k]}
          aria-pressed={!!value[k]}
          onclick={() => toggle(k)}><Ar text={cell} /></button
        >
      {/each}
    </div>
  {:else if type === 'relier'}
    {#each arr(ex.gauche) as g, k (k)}
      <div class="item">
        <Ar text={str(g.ar)} />
        <select
          aria-label={t('epreuve.relier_avec')}
          value={String((value[k] as { right?: number } | undefined)?.right ?? '')}
          onchange={(e) => set(k, { right: Number((e.currentTarget as HTMLSelectElement).value) })}
        >
          <option value="" disabled>—</option>
          {#each arr(ex.droite) as d, j (j)}<option value={String(j)}
              >{str(d.fr) || `#${j + 1}`}</option
            >{/each}
        </select>
      </div>
    {/each}
  {:else if type === 'ordre'}
    {#each arr(ex.items) as it, k (k)}
      {@const mots = strs(it.mots)}
      <div class="item">
        <div class="opts">
          {#each mots as w, j (j)}
            <button
              type="button"
              class:on={seq(k).includes(j)}
              onclick={() => tapWord(k, j, mots.length)}><Ar text={w} /></button
            >
          {/each}
        </div>
        <p class="ar-big" dir="rtl">
          <Bidi
            text={seq(k)
              .map((j) => mots[j])
              .join(' ')}
            base="ar"
          />
        </p>
        <button type="button" onclick={() => set(k, { sequence: [] })}
          >{t('epreuve.effacer')}</button
        >
      </div>
    {/each}
  {:else}
    <p class="muted small">{t('epreuve.hors_application')}</p>
  {/if}
</section>

<style>
  .ex {
    border-top: 1px solid var(--line);
    padding-top: 10px;
  }
  .item {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    margin: 8px 0;
  }
  .opts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .opts button {
    min-width: 48px;
    min-height: 48px;
  }
  .on {
    background: var(--primary);
    color: var(--on-primary);
  }
  .ar-big {
    font-family: var(--font-ar);
    font-size: 1.6rem;
  }
  .small {
    font-size: 0.9rem;
  }
  .consigne {
    font-weight: 700;
  }
  .q {
    flex: 1 1 100%;
    font-weight: 600;
  }
</style>
