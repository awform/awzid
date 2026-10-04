<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { tanwinDisplay } from '@awform/content/text';
  import type { Exercise, LanguageExercise, Lettre } from '@awform/content/types';
  import {
    checkItem,
    exerciseTotal,
    isLanguageExercise,
    ordreSeparator,
    plain,
    type ItemResponse,
  } from '@awform/grading';
  import Ar from './Ar.svelte';
  import Illus from './Illus.svelte';
  import { contentText } from './i18n/content-text';
  import { t } from './i18n';

  /**
   * Lecteur d'exercices : les 8 types « langue », corrigés par la bibliothèque PARTAGÉE @awform/grading
   * (même code que le serveur). Règle du livre : un nouvel essai est permis, l'item compte quand il est
   * trouvé ; message doux (« Essaie encore »), jamais de sanction.
   */
  let {
    ex,
    id,
    lettres = [],
    onanswer,
  }: {
    ex: Exercise;
    id: string;
    lettres?: Lettre[];
    onanswer?: (itemIndex: number, response: ItemResponse, correct: boolean) => void;
  } = $props();

  /** consignes arabes du livre (objet d'étude, non traduites) ; le libellé français vient des messages */
  const TITLES: Record<string, string> = {
    premiere_lettre: 'بِأَيِّ حَرْفٍ تَبْدَأُ الْكَلِمَةُ؟',
    chasse: 'أَبْحَثُ عَنِ الْحَرْفِ',
    relier: 'أَصِلُ الْكَلِمَةَ بِالصُّورَةِ',
    ecoute: 'أَسْمَعُ وَأَخْتَارُ',
    vrai_faux: 'صَحِيحٌ أَمْ خَطَأٌ؟',
    complete: 'أُكْمِلُ',
    contient: 'أَيُّ كَلِمَةٍ فِيهَا الْحَرْفُ؟',
    ordre: 'أُرَتِّبُ الْكَلِمَاتِ',
  };

  const lang: LanguageExercise | null = $derived(isLanguageExercise(ex) ? ex : null);
  const total = $derived(lang ? exerciseTotal(lang) : 0);
  const titleAr = $derived(ex.titre_ar ?? TITLES[ex.type] ?? '');
  /** consigne du livre (français ; traduction du contenu si elle existe un jour : mécanisme du lot 15) */
  const consigne = $derived(contentText(ex, 'consigne'));
  const titleFr = $derived(
    (contentText(ex, 'titre')?.text ??
      (TITLES[ex.type] ? t(`exo.titre.${ex.type}`) : t('exo.exercice'))) +
      (!ex.titre_fr && lang?.type === 'chasse' ? ` ${lang.cible}` : '') +
      (!ex.titre_fr && lang?.type === 'contient' ? ` ${lang.cible} ?` : ''),
  );

  /** état par index d'item : trouvé, ou à retenter */
  let found: Record<number, boolean> = $state({});
  let retry: Record<number, boolean> = $state({});
  const score = $derived(Object.values(found).filter(Boolean).length);

  function answer(item: number, r: ItemResponse): boolean {
    if (!lang || found[item]) return !!found[item];
    const ok = checkItem(lang, item, r);
    onanswer?.(item, r, ok);
    if (ok) {
      found[item] = true;
      retry[item] = false;
    } else retry[item] = true;
    return ok;
  }

  // relier : colonne de droite décalée (rotation de n/2, comme le moteur)
  const right = $derived.by(() => {
    if (lang?.type !== 'relier') return [] as number[];
    const n = lang.items.length;
    const idx = [...Array(n).keys()];
    const k = Math.max(1, Math.floor(n / 2)) % n;
    return idx.slice(k).concat(idx.slice(0, k));
  });
  let selLeft: number | null = $state(null);
  let selRight: number | null = $state(null);
  function pick(side: 'a' | 'b', k: number) {
    if (found[k]) return;
    if (side === 'a') selLeft = k;
    else selRight = k;
    if (selLeft !== null && selRight !== null) {
      answer(selLeft, { right: selRight });
      selLeft = null;
      selRight = null;
    }
  }

  // ordre : étiquettes touchées par item
  let seq: Record<number, number[]> = $state({});
  function tapChip(item: number, k: number) {
    if (lang?.type !== 'ordre' || found[item]) return;
    const cur = seq[item] ?? [];
    if (cur.includes(k)) return;
    const next = [...cur, k];
    seq[item] = next;
    if (next.length === (lang.items[item]?.mots.length ?? 0)) {
      if (!answer(item, { sequence: next })) setTimeout(() => (seq[item] = []), 900);
    }
  }
  function ordreText(item: number): string {
    if (lang?.type !== 'ordre') return '';
    const it = lang.items[item];
    if (!it) return '';
    return (seq[item] ?? []).map((k) => plain(it.mots[k])).join(ordreSeparator(it.phrase));
  }
</script>

<section class="ex" data-exercise={id} data-type={ex.type}>
  <header>
    <h3><Ar text={titleAr} /> <span class="fr"><Bidi text={titleFr} /></span></h3>
    {#if consigne}<p class="consigne" lang={consigne.lang}><Bidi text={consigne.text} /></p>{/if}
    {#if lang}<p class="score" aria-live="polite">
        ★ <Bidi text={score} /> / <Bidi text={total} /><Bidi
          text={score === total && total ? t('exo.bravo_suffixe') : ''}
        />
      </p>{/if}
  </header>

  {#if lang?.type === 'premiere_lettre'}
    <div class="quiz">
      {#each lang.items as it, i (i)}
        <div class="q" class:ok={found[i]} data-item={i}>
          <Illus k={it.img} label={it.fr ?? ''} />
          <div class="blank ar" dir="rtl" lang="ar">
            <u><Bidi text={found[i] ? it.reponse : '?'} base="ar" /></u><Bidi
              text={it.suite}
              base="ar"
            />
          </div>
          <div class="opts" dir="rtl">
            {#each it.options as o, k (k)}
              <button type="button" class="ar" lang="ar" onclick={() => answer(i, { choice: o })}
                ><Bidi text={o} base="ar" /></button
              >
            {/each}
          </div>
          {#if retry[i] && !found[i]}<p class="retry">{t('exo.essaie_encore')}</p>{/if}
        </div>
      {/each}
    </div>
  {:else if lang?.type === 'chasse'}
    <div class="hunt" dir="rtl">
      {#each lang.grille as x, k (k)}
        <button
          type="button"
          class="cell ar"
          class:found={found[k]}
          class:miss={retry[k]}
          lang="ar"
          data-item={k}
          onclick={() => answer(k, { touched: true })}><Bidi text={x} base="ar" /></button
        >
      {/each}
    </div>
  {:else if lang?.type === 'relier'}
    <div class="relier">
      {#each lang.items as it, i (i)}
        {@const j = right[i] ?? i}
        {@const rj = lang.items[j]}
        <button
          type="button"
          class="it"
          class:sel={selLeft === i}
          class:done={found[i]}
          data-side="a"
          data-k={i}
          onclick={() => pick('a', i)}
          ><span class="tag"><Bidi text={i + 1} /></span><Ar text={it.ar} {lettres} /></button
        >
        <button
          type="button"
          class:sel={selRight === j}
          class:done={found[j]}
          data-side="b"
          data-k={j}
          onclick={() => pick('b', j)}
          >{#if rj?.img}<Illus k={rj.img} label={rj.fr ?? ''} />{:else}<span class="fr"
              ><Bidi text={rj?.fr} /></span
            >{/if}</button
        >
      {/each}
    </div>
    {#if Object.values(retry).some(Boolean) && score < total}<p class="retry">
        {t('exo.essaie_encore')}
      </p>{/if}
  {:else if lang?.type === 'ecoute'}
    <ol class="items">
      {#each lang.items as it, i (i)}
        <li class:ok={found[i]} data-item={i}>
          <details class="adulte">
            <summary>{t('exo.pour_adulte')}</summary>
            <Ar text={it.dit} />
          </details>
          <div class="opts" dir="rtl">
            {#each it.options as o, k (k)}
              <button type="button" onclick={() => answer(i, { choice: o })}
                ><Ar text={o} {lettres} /></button
              >
            {/each}
          </div>
          {#if retry[i] && !found[i]}<p class="retry">{t('exo.essaie_encore')}</p>{/if}
        </li>
      {/each}
    </ol>
  {:else if lang?.type === 'vrai_faux'}
    <div class="vfl">
      {#each lang.items as it, i (i)}
        <div class="vfi" class:ok={found[i]} data-item={i}>
          {#if it.img}<Illus k={it.img} />{/if}
          {#if it.ar}<Ar text={it.ar} {lettres} />{/if}
          {#if it.fr}<p class="fr"><Bidi text={it.fr} /></p>{/if}
          <div class="opts">
            <button type="button" data-v="1" onclick={() => answer(i, { value: true })}
              ><span class="ar" lang="ar">صَحِيحٌ</span> ✓</button
            >
            <button type="button" data-v="0" onclick={() => answer(i, { value: false })}
              ><span class="ar" lang="ar">خَطَأٌ</span> ✗</button
            >
          </div>
          {#if found[i] && !it.vrai && it.correction_ar}<p class="corr">
              <Ar text={it.correction_ar} {lettres} />
            </p>{/if}
          {#if retry[i] && !found[i]}<p class="retry">{t('exo.essaie_encore')}</p>{/if}
        </div>
      {/each}
    </div>
  {:else if lang?.type === 'complete'}
    <ol class="items">
      {#each lang.items as it, i (i)}
        <li class:ok={found[i]} data-item={i}>
          <p class="s" dir="rtl">
            <Ar text={it.avant ?? ''} {lettres} />
            <u
              >{#if found[i]}<Ar text={it.reponse} {lettres} />{:else}…{/if}</u
            >
            <Ar text={it.apres ?? ''} {lettres} />
          </p>
          <div class="opts" dir="rtl">
            {#each it.options as o, k (k)}
              <button type="button" onclick={() => answer(i, { choice: o })}
                ><Ar text={o} {lettres} /></button
              >
            {/each}
          </div>
          {#if it.fr}<p class="fr"><Bidi text={it.fr} /></p>{/if}
          {#if retry[i] && !found[i]}<p class="retry">{t('exo.essaie_encore')}</p>{/if}
        </li>
      {/each}
    </ol>
  {:else if lang?.type === 'contient'}
    <div class="contient" dir="rtl">
      {#each lang.mots as m, k (k)}
        <button
          type="button"
          class:found={found[k]}
          class:miss={retry[k]}
          data-item={k}
          onclick={() => answer(k, { touched: true })}><Ar text={m.ar} {lettres} /></button
        >
      {/each}
    </div>
  {:else if lang?.type === 'ordre'}
    <ol class="items">
      {#each lang.items as it, i (i)}
        <li class:ok={found[i]} data-item={i}>
          <div class="chips" dir="rtl">
            {#each it.mots as w, k (k)}
              <button
                type="button"
                disabled={found[i] || (seq[i] ?? []).includes(k)}
                data-w={k}
                onclick={() => tapChip(i, k)}><Ar text={w} {lettres} /></button
              >
            {/each}
          </div>
          <p class="out ar" dir="rtl" lang="ar" class:good={found[i]}>
            <Bidi text={tanwinDisplay(ordreText(i))} base="ar" />
          </p>
          {#if !found[i]}<button type="button" class="reset" onclick={() => (seq[i] = [])}
              >{t('exo.recommencer')}</button
            >{/if}
          {#if it.fr}<p class="fr"><Bidi text={it.fr} /></p>{/if}
          {#if retry[i] && !found[i]}<p class="retry">{t('exo.essaie_encore')}</p>{/if}
        </li>
      {/each}
    </ol>
  {:else}
    <p class="later"><Bidi text={t('exo.plus_tard', { type: ex.type })} /></p>
  {/if}
</section>

<style>
  .ex {
    background: var(--card);
    border: 2px solid var(--line);
    border-radius: 18px;
    padding: 12px 16px;
    margin: 16px 0;
  }
  h3 {
    margin: 0;
    font-size: 1.05rem;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    align-items: baseline;
  }
  .score {
    font-weight: 700;
    color: var(--teal);
    margin: 4px 0;
  }
  .quiz {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
  }
  .q,
  .vfi {
    border: 2px solid var(--line);
    border-radius: 16px;
    padding: 8px;
    text-align: center;
  }
  .q :global(.pic),
  .vfi :global(.pic),
  .relier :global(.pic) {
    width: 72px;
    height: 72px;
  }
  .blank {
    font-size: calc(var(--ar-size) + 4px);
  }
  .blank u {
    color: var(--c0);
    text-decoration: none;
    border-bottom: 3px dashed var(--c0);
    padding: 0 6px;
  }
  .ok {
    background: var(--ok-bg);
    border-color: var(--good) !important;
    border-radius: 14px;
  }
  .opts,
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
    margin: 6px 0;
  }
  .hunt {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
  }
  .contient {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 8px;
  }
  .cell {
    font-size: calc(var(--ar-size) + 2px);
    padding: 0;
  }
  .found {
    background: var(--ok-bg);
    border-color: var(--good);
  }
  .miss:not(.found) {
    animation: shake 0.3s;
    border-color: var(--c3);
  }
  @keyframes shake {
    25% {
      transform: translateX(-3px);
    }
    75% {
      transform: translateX(3px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .miss:not(.found) {
      animation: none;
    }
  }
  .relier {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 24px;
  }
  .relier button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .sel {
    border-color: var(--teal);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 30%, transparent);
  }
  .done {
    background: var(--ok-bg);
    border-color: var(--good);
  }
  .tag {
    font-size: 0.8rem;
    border-radius: 99px;
    padding: 0 7px;
    color: var(--on-primary);
    background: var(--teal);
  }
  .vfl {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 10px;
  }
  .items {
    padding-inline-start: 1.2em;
  }
  .items li {
    margin: 12px 0;
    padding: 6px;
  }
  .s {
    text-align: right;
  }
  .s u {
    text-decoration: none;
    border-bottom: 2px dashed var(--ink2);
    padding: 0 10px;
  }
  .out {
    min-height: 2.4em;
    border-bottom: 2px solid var(--line);
    text-align: right;
  }
  .good {
    color: var(--ok-ink);
  }
  .reset {
    font-size: 0.9rem;
  }
  .fr {
    color: var(--ink2);
    margin: 4px 0;
  }
  .retry {
    color: var(--soon-ink);
    margin: 4px 0;
    font-weight: 700;
  }
  .corr {
    margin: 4px 0;
  }
  .adulte summary {
    color: var(--ink2);
    font-size: 0.9rem;
  }
  .consigne {
    margin: 4px 0;
  }
</style>
