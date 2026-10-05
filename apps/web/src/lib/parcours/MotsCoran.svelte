<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { fmtNumber, t } from '$lib/i18n';
  import type { ProfileInfo } from '$lib/session';
  import Icon from '$lib/ui/Icon.svelte';
  import { tanwinDisplay } from '@awform/content/text';
  import { acquerirMots, motsCoran, type MotCoran, type MotsCoran } from './parcours';

  /**
   * A27 — mots du Coran du niveau du LIVRE (données des livres : ordre, sens, racine, verset d'exemple) :
   * acquis / à découvrir, petit jeu (le sens parmi ceux du livre) qui valide un mot, et couverture « tu
   * reconnais X % des mots du Coran » calculée par le serveur (jamais estimée ici). `jeu` : le jeu seul (enfants,
   * dans les révisions).
   */
  let { profile, jeu = false }: { profile: ProfileInfo; jeu?: boolean } = $props();
  let m = $state<MotsCoran | null>(null);
  let open = $state<number | null>(null);
  let verse = $state<Record<number, string>>({});
  let q = $state<{ mot: MotCoran; options: string[] } | null>(null);
  let picked = $state<string | null>(null);
  let gained = $state(0);

  async function load() {
    const r = await motsCoran(profile.id);
    if (r.ok) m = r.data;
  }
  onMount(load);

  const todo = $derived((m?.mots ?? []).filter((x) => !x.acquis && x.sens));
  function shuffle<T>(a: T[]): T[] {
    const b = [...a];
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [b[i], b[j]] = [b[j]!, b[i]!];
    }
    return b;
  }
  function ask() {
    picked = null;
    const pool = todo.length ? todo : (m?.mots ?? []).filter((x) => x.sens);
    const mot = pool[Math.floor(Math.random() * pool.length)];
    if (!mot) return void (q = null);
    const others = shuffle(
      (m?.mots ?? []).filter((x) => x.sens && x.sens !== mot.sens).map((x) => x.sens!),
    ).slice(0, 2);
    q = { mot, options: shuffle([mot.sens!, ...others]) };
  }
  async function choose(o: string) {
    if (!q || picked) return;
    picked = o;
    if (o === q.mot.sens && !q.mot.acquis) {
      const r = await acquerirMots(profile.id, [q.mot.rang]);
      if (r.ok && r.data?.ajoutes) {
        gained++;
        await load();
      }
    }
  }
  async function example(x: MotCoran) {
    open = open === x.rang ? null : x.rang;
    if (!x.ref || verse[x.rang]) return;
    const [s, a] = x.ref.split(':');
    const r = await fetch(`/api/v1/quran/verses?s=${s}&from=${a}&to=${a}`).catch(() => null);
    if (r?.ok) {
      const j = (await r.json()) as { verses: Array<{ text: string }> };
      if (j.verses[0]) verse = { ...verse, [x.rang]: j.verses[0].text };
    }
  }
</script>

{#if m}
  {#if !jeu}
    <section class="card cover" data-testid="couverture">
      {#if m.couverture.pct !== null}
        <p class="big">
          <Bidi text={t('parc.couverture', { pct: fmtNumber(m.couverture.pct) })} />
        </p>
        <p class="muted small">
          <Bidi text={t('parc.couverture_detail', { n: m.couverture.acquis })} />
        </p>
      {/if}
      <p class="muted small">
        <Bidi
          text={t('parc.mots_niveau', {
            n: m.mots.length,
            acquis: m.mots.filter((x) => x.acquis).length,
          })}
        />
      </p>
    </section>
  {/if}

  <section class="card jeu" data-testid="jeu-mots">
    <h2><Icon name="etoile" /> {t('parc.jeu_titre')}</h2>
    {#if !q}
      <button type="button" class="primary" onclick={ask} data-testid="jouer-mots"
        >{t('parc.jeu_commencer')}</button
      >
    {:else}
      <p class="mot" lang="ar" dir="rtl"><Bidi text={q.mot.ar} base="ar" /></p>
      <div class="opts" role="group" aria-label={t('parc.jeu_consigne')}>
        {#each q.options as o (o)}
          <button
            type="button"
            class:good={picked !== null && o === q.mot.sens}
            class:bad={picked === o && o !== q.mot.sens}
            onclick={() => choose(o)}
            data-sens={o}><Bidi text={o} /></button
          >
        {/each}
      </div>
      {#if picked}
        <p role="status" class:okmsg={picked === q.mot.sens}>
          <Bidi text={picked === q.mot.sens ? t('parc.jeu_bravo') : t('parc.jeu_encore')} />
        </p>
        <button type="button" onclick={ask} data-testid="mot-suivant"
          >{t('parc.jeu_suivant')}</button
        >
      {/if}
      {#if gained}<p class="muted small">
          <Bidi text={t('parc.jeu_gagnes', { n: gained })} />
        </p>{/if}
    {/if}
  </section>

  {#if !jeu}
    <ul class="mots" data-testid="mots-du-coran">
      {#each m.mots as x (x.rang)}
        <li class:acquis={x.acquis} data-rang={x.rang} data-acquis={x.acquis}>
          <button
            type="button"
            class="mot-row"
            onclick={() => example(x)}
            aria-expanded={open === x.rang}
          >
            <span class="ar" lang="ar" dir="rtl"><Bidi text={x.ar} base="ar" /></span>
            <span class="sens"><Bidi text={x.sens ?? ''} /></span>
            <span class="etat"
              ><Bidi text={x.acquis ? t('parc.acquis') : t('parc.a_decouvrir')} /></span
            >
          </button>
          {#if open === x.rang}
            <div class="detail">
              {#if x.racine}<p>
                  {t('parc.racine')} :
                  <span class="racine" lang="ar" dir="rtl"><Bidi text={x.racine} base="ar" /></span>
                </p>{/if}
              {#if x.ref}
                {#if verse[x.rang]}<p class="q" lang="ar" dir="rtl">
                    <span class="quran-text">{tanwinDisplay(verse[x.rang]!)}</span>
                  </p>{/if}
                <p class="muted small"><Bidi text={t('parc.verset_ref', { ref: x.ref })} /></p>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
    <p class="muted small">{t('parc.mots_source')}</p>
  {/if}
{/if}

<style>
  .cover .big {
    font-size: 1.3rem;
    font-weight: 800;
    color: var(--primary);
    margin: 0;
  }
  .mot {
    font-family: var(--font-quran);
    font-size: 2.2rem;
    text-align: center;
    margin: 8px 0;
  }
  .opts {
    display: grid;
    gap: 8px;
  }
  .opts button {
    min-height: var(--target);
  }
  .good {
    background: var(--ok-bg);
    color: var(--ok-ink);
    border-color: var(--ok-ink);
  }
  .bad {
    background: var(--bad-bg);
    color: var(--bad-ink);
  }
  .okmsg {
    color: var(--ok-ink);
    font-weight: 700;
  }
  .mots {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .mots li {
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--card);
  }
  .mots li.acquis {
    border-inline-start: 5px solid var(--good);
  }
  .mot-row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 10px;
    align-items: center;
    width: 100%;
    min-height: var(--target);
    background: transparent;
    border: 0;
    color: var(--ink);
    text-align: start;
  }
  .ar {
    font-family: var(--font-quran);
    font-size: 1.5rem;
  }
  .etat {
    font-size: 0.8rem;
    color: var(--ink2);
  }
  .detail {
    padding: 0 12px 10px;
  }
  .racine {
    color: var(--accent);
    font-weight: 800;
    font-size: 1.2rem;
  }
  .q {
    font-family: var(--font-quran);
    font-size: 1.3rem;
    line-height: 2;
  }
  .small {
    font-size: 0.9rem;
  }
</style>
