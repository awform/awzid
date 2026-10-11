<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { tanwinDisplay } from '@awform/content/text';
  import { splitBasmala } from '@awform/hifz';
  import { fmtNumber, localeInfo, t } from '$lib/i18n';
  import { visibleWords } from './player';
  import { suraTitleAr } from './sura-names-ar';
  import { verseRuns, type Run, type TajwidSura } from './tajwid';
  import TajwidRuns from './TajwidRuns.svelte';
  import type { TranslatedVerse } from './translation';
  import { pauseGroups } from './pause';

  /**
   * Texte du Muṣḥaf EN VERSETS (Tanzil, octet par octet, découpé aux espaces seulement) — vue « versets » de
   * l'écran de lecture (Coran épuré) : surlignage du verset entendu (règle de riwāya), verset choisi, plage
   * écoutée, masquage progressif (mémoriser : mots VOILÉS à l'affichage, jamais retirés ni modifiés),
   * traduction du sens sous chaque verset (à part, jamais sur la ligne du texte arabe).
   */
  type Verse = { s: number; a: number; text: string };
  let {
    sura,
    verses,
    basmala,
    current = null,
    selected = null,
    from = 0,
    to = 0,
    mask = 0,
    maskFrom = 1,
    revealed = new Set<string>(),
    onpick,
    tajwid = null,
    motifs = false,
    riwaya = null,
    trad = null,
    tradLang = 'fr',
    readOnly = false,
    word = null,
  }: {
    /** lecture guidée sans son : mot allumé */
    word?: { a: number; w: number } | null;
    /**
     * A8 — autre riwāya que Ḥafṣ : famille de la police du Complexe ; le texte du Complexe est affiché TEL QUEL
     * (signe de fin de verset numéroté compris), sans basmala séparée, tanwīn, tajwid ni masquage.
     */
    riwaya?: string | null;
    sura: number;
    verses: Verse[];
    basmala: string;
    current?: number | null;
    selected?: number | null;
    from?: number;
    to?: number;
    mask?: number;
    /** masquage appliqué à partir de ce verset (versets déjà appris : 1) */
    maskFrom?: number;
    /** versets dévoilés (« s:a ») pendant le masquage */
    revealed?: Set<string>;
    onpick?: (aya: number, el: HTMLElement) => void;
    /** lot 29 : annotations du tajwid de la sourate (null : texte sans couleur) */
    tajwid?: TajwidSura | null;
    /** soulignés en plus des couleurs (daltonisme) */
    motifs?: boolean;
    /** traduction du sens d'un verset (null : pas de traduction) */
    trad?: ((a: number) => TranslatedVerse | undefined) | null;
    tradLang?: string;
    readOnly?: boolean;
  } = $props();

  $effect(() => {
    if (current)
      document
        .querySelector(`[data-testid="texte-coran"] [data-aya="${current}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  const pick = (a: number, e: Event) => {
    if (readOnly || !onpick) return;
    onpick(a, e.currentTarget as HTMLElement);
  };
</script>

<!-- un mot Tanzil (tel quel ; tajwid en enveloppes ; voile du masquage ; mot entendu) -->
{#snippet mot(w: string, i: number, voile: boolean, on: boolean, runs: Run[] | null)}<span
    class="w"
    class:voile
    class:on
    data-w={i}
    ><span class="t"
      >{#if runs}<TajwidRuns {runs} />{:else}{tanwinDisplay(w)}{/if}</span
    ></span
  >{/snippet}

<section
  class="mushaf"
  class:tajwid={!!tajwid}
  class:motifs={!!tajwid && motifs}
  class:riwaya={!!riwaya}
  style:--rw-font={riwaya ?? undefined}
  lang="ar"
  dir="rtl"
  data-testid="texte-coran"
>
  <h2 class="titre"><Bidi text={suraTitleAr(sura)} base="ar" /></h2>
  {#each verses as v (v.a)}
    {@const parts = riwaya
      ? { basmala: '', rest: v.text }
      : splitBasmala(v.s, v.a, v.text, basmala)}
    {@const ws = parts.rest.split(' ')}
    {@const m = riwaya || revealed.has(`${v.s}:${v.a}`) || v.a < maskFrom ? 0 : mask}
    {@const vis = visibleWords(ws.length, m)}
    {@const tv = tajwid && !riwaya ? verseRuns(v, basmala, tajwid) : null}
    {@const tr = trad?.(v.a)}
    {#if parts.basmala}<!-- svelte-ignore a11y_no_noninteractive_tabindex (rôle « button » posé seulement quand la basmala est choisissable) -->
      <p
        class="basmala"
        class:now={current === 0}
        class:sel={selected === 0}
        data-bsm={v.s}
        aria-current={current === 0 ? 'true' : undefined}
        role={onpick && !readOnly ? 'button' : undefined}
        aria-haspopup={onpick && !readOnly ? 'dialog' : undefined}
        tabindex={onpick && !readOnly ? 0 : undefined}
        onclick={(e) => pick(0, e)}
        onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick(0, e))}
      >
        <span class="quran-text" data-basmala={`${v.s}:${v.a}`}
          >{#if tv?.basmala}{#each tv.basmala as bw, i (i)}{i > 0 ? ' ' : ''}<TajwidRuns
                runs={bw}
              />{/each}{:else}{tanwinDisplay(parts.basmala)}{/if}</span
        >
      </p>{/if}
    <div class="row" class:range={v.a >= from && v.a <= to}>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (rôle « button » posé seulement quand le verset est choisissable) -->
      <div
        class="aya"
        class:now={current === v.a}
        class:sel={selected === v.a}
        data-aya={v.a}
        aria-current={current === v.a ? 'true' : undefined}
        role={onpick && !readOnly ? 'button' : undefined}
        aria-haspopup={onpick && !readOnly ? 'dialog' : undefined}
        tabindex={onpick && !readOnly ? 0 : undefined}
        onclick={(e) => pick(v.a, e)}
        onkeydown={(e) =>
          (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick(v.a, e))}
      >
        {#if riwaya}<span class="quran-text rw-text" data-verse={`${v.s}:${v.a}`}>{v.text}</span
          >{:else}<span class="quran-text" data-verse={`${v.s}:${v.a}`}
            >{#each pauseGroups(ws) as gr, gi (gi)}{gi > 0 ? ' ' : ''}{#if gr.length > 1}<span
                  class="wg"
                  >{#each gr as i, k (i)}{k > 0 ? ' ' : ''}{@render mot(
                      ws[i]!,
                      i,
                      !vis[i],
                      word?.a === v.a && word?.w === i,
                      tv ? (tv.words[i] ?? []) : null,
                    )}{/each}</span
                >{:else}{@render mot(
                  ws[gr[0]!]!,
                  gr[0]!,
                  !vis[gr[0]!],
                  word?.a === v.a && word?.w === gr[0],
                  tv ? (tv.words[gr[0]!] ?? []) : null,
                )}{/if}{/each}</span
          ><span class="n" aria-label={t('ca.verset_n', { n: v.a })}
            >{fmtNumber(v.a, { useGrouping: false })}</span
          >{/if}
      </div>
      {#if tr}
        <p class="tr" lang={tradLang} dir="ltr" data-trad={`${v.s}:${v.a}`}>
          <span class="tref" lang={localeInfo().code} dir={localeInfo().dir}
            ><Bidi text={fmtNumber(v.a, { useGrouping: false })} /></span
          >
          <Bidi text={tr.text} />
        </p>
      {/if}
    </div>
  {/each}
</section>

<style>
  .mushaf {
    padding: var(--space-m) clamp(10px, 3vw, 28px);
    color: var(--mp-ink);
    background: var(--mp-paper);
    border: 1px solid var(--mp-mint2);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
  }
  .titre {
    margin: 0 0 var(--space-s);
    text-align: center;
    font-family: var(--font-quran);
    font-weight: 400;
    font-size: 1.6rem;
    color: var(--mp-green);
  }
  .basmala {
    width: fit-content;
    margin: 4px auto;
    padding: 0 10px;
    text-align: center;
    font-family: var(--font-quran);
    font-size: 1.6rem;
    border-radius: var(--radius-md);
    transition: background-color var(--motion) ease;
  }
  .basmala[role='button'] {
    cursor: pointer;
  }
  .basmala:focus-visible {
    outline: 2px solid var(--mp-green);
    outline-offset: 2px;
  }
  .basmala.sel {
    background: var(--mp-mark);
  }
  .basmala.now {
    background: var(--mark);
  }
  /* A8 : police fournie par le Complexe pour la riwāya affichée */
  .mushaf.riwaya .quran-text {
    font-family: var(--rw-font), var(--font-quran);
  }
  .row {
    padding: 2px 0;
    border-bottom: 1px solid color-mix(in srgb, var(--mp-mint2) 70%, transparent);
  }
  .row:last-child {
    border-bottom: 0;
  }
  .row.range {
    background: color-mix(in srgb, var(--mp-mint) 70%, transparent);
  }
  .aya {
    font-family: var(--font-quran);
    font-size: calc(max(1.7rem, var(--ar-size)) * var(--qz, 1));
    line-height: 2.3;
    margin: 2px 0;
    padding: 0 8px;
    border-radius: var(--radius-md);
    scroll-margin: 140px;
    transition: background-color var(--motion) ease;
  }
  .aya[role='button'] {
    cursor: pointer;
  }
  .aya:focus-visible {
    outline: 2px solid var(--mp-green);
    outline-offset: 2px;
  }
  .aya.sel {
    background: var(--mp-mark);
  }
  .aya.now {
    background: var(--mark);
  }
  .w.on {
    background: var(--mark);
    border-radius: 6px;
  }
  /* mot + signe(s) de pause : insécables, jamais séparés par un retour à la ligne */
  .wg {
    white-space: nowrap;
  }
  .w.voile {
    background: var(--mp-mint2);
    border-radius: 6px;
    user-select: none;
  }
  .w.voile .t {
    visibility: hidden;
  }
  .n {
    display: inline-grid;
    place-items: center;
    min-width: 1.9em;
    height: 1.9em;
    margin-inline-start: 6px;
    border: 1px solid var(--or-line);
    border-radius: 50%;
    font-size: 0.8rem;
    line-height: 1;
    color: var(--mp-green);
    font-family: var(--font-ui);
  }
  .tr {
    margin: 0 0 8px;
    padding: 0 8px;
    font-family: var(--font-ui);
    font-size: 0.98rem;
    line-height: 1.6;
    color: var(--mp-ink2);
    text-align: start;
  }
  .tref {
    display: inline-block;
    min-width: 1.6em;
    margin-inline-end: 6px;
    padding: 0 6px;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--or-ink);
    background: var(--or-soft);
    border-radius: var(--radius-pill);
    text-align: center;
  }
  @media (max-width: 400px) {
    .aya {
      font-size: calc(max(1.45rem, var(--ar-size)) * var(--qz, 1));
    }
  }
</style>
