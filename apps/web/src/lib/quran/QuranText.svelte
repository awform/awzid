<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { tanwinDisplay } from '@awform/content/text';
  import { splitBasmala, suraName } from '@awform/hifz';
  import { fmtNumber, localeInfo, t } from '$lib/i18n';
  import { visibleWords } from './player';
  import { verseRuns, type TajwidSura } from './tajwid';
  import TajwidRuns from './TajwidRuns.svelte';

  /**
   * Lot 27 — texte du Muṣḥaf (Tanzil, octet par octet, découpé aux espaces seulement) avec, au choix :
   * surlignage du verset entendu (Ḥafṣ seulement), plage choisie, masquage progressif (mémorisation :
   * les mots sont VOILÉS à l'affichage, jamais retirés ni modifiés).
   */
  type Verse = { s: number; a: number; text: string };
  let {
    sura,
    verses,
    basmala,
    current = null,
    from = 0,
    to = 0,
    mask = 0,
    maskFrom = 1,
    onpick,
    tajwid = null,
    motifs = false,
    riwaya = null,
  }: {
    /**
     * A8 — autre riwāya que Ḥafṣ : famille de la police du Complexe ; le texte du Complexe est affiché TEL QUEL
     * (signe de fin de verset numéroté compris), sans basmala séparée, tanwīn, tajwid ni masquage.
     */
    riwaya?: string | null;
    sura: number;
    verses: Verse[];
    basmala: string;
    current?: number | null;
    from?: number;
    to?: number;
    mask?: number;
    /** masquage appliqué à partir de ce verset (versets déjà appris : 1) */
    maskFrom?: number;
    onpick?: (aya: number) => void;
    /** lot 29 : annotations du tajwid de la sourate (null : texte sans couleur) */
    tajwid?: TajwidSura | null;
    /** soulignés en plus des couleurs (daltonisme) */
    motifs?: boolean;
  } = $props();

  let hidden = $state<Record<string, boolean>>({});
  $effect(() => {
    if (current)
      document
        .querySelector(`[data-aya="${current}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
</script>

<section
  class="mushaf card"
  class:tajwid={!!tajwid}
  class:motifs={!!tajwid && motifs}
  class:riwaya={!!riwaya}
  style:--rw-font={riwaya ?? undefined}
  lang="ar"
  dir="rtl"
  data-testid="texte-coran"
>
  <h2 class="titre"><Bidi text={suraName(sura)} base="ar" /></h2>
  {#if riwaya}
    {#each verses as v (v.a)}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (rôle « button » posé seulement quand le verset est choisissable) -->
      <div
        class="aya"
        class:range={v.a >= from && v.a <= to}
        class:now={current === v.a}
        data-aya={v.a}
        aria-current={current === v.a ? 'true' : undefined}
        role={onpick ? 'button' : undefined}
        tabindex={onpick ? 0 : undefined}
        onclick={() => onpick?.(v.a)}
        onkeydown={(e) => e.key === 'Enter' && onpick?.(v.a)}
      >
        <span class="quran-text rw-text" data-verse={`${v.s}:${v.a}`}>{v.text}</span>
      </div>
    {/each}
  {:else}
    {#each verses as v (v.a)}
      {@const parts = splitBasmala(v.s, v.a, v.text, basmala)}
      {@const ws = parts.rest.split(' ')}
      {@const vis = visibleWords(ws.length, v.a >= maskFrom ? mask : 0)}
      {@const tv = tajwid ? verseRuns(v, basmala, tajwid) : null}
      {#if parts.basmala}<p class="basmala">
          <span class="quran-text"
            >{#if tv?.basmala}{#each tv.basmala as bw, i (i)}{i > 0 ? ' ' : ''}<TajwidRuns
                  runs={bw}
                />{/each}{:else}{tanwinDisplay(parts.basmala)}{/if}</span
          >
        </p>{/if}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (rôle « button » posé seulement quand le verset est choisissable) -->
      <div
        class="aya"
        class:range={v.a >= from && v.a <= to}
        class:now={current === v.a}
        data-aya={v.a}
        aria-current={current === v.a ? 'true' : undefined}
        role={onpick ? 'button' : undefined}
        tabindex={onpick ? 0 : undefined}
        onclick={() => onpick?.(v.a)}
        onkeydown={(e) => e.key === 'Enter' && onpick?.(v.a)}
      >
        <span class="quran-text" data-verse={`${v.s}:${v.a}`}
          >{#each ws as w, i (i)}{i > 0 ? ' ' : ''}<span
              class="w"
              class:voile={!vis[i] && !hidden[`${v.a}:${i}`]}
              ><span class="t"
                >{#if tv}<TajwidRuns runs={tv.words[i] ?? []} />{:else}{tanwinDisplay(w)}{/if}</span
              ></span
            >{/each}</span
        >
        <span class="n" aria-label={t('ca.verset_n', { n: v.a })}
          >{fmtNumber(v.a, { useGrouping: false })}</span
        >
        {#if mask > 0 && v.a >= maskFrom}
          <button
            type="button"
            class="ghost peek"
            onclick={(e) => {
              e.stopPropagation();
              for (let i = 0; i < ws.length; i++) hidden[`${v.a}:${i}`] = !hidden[`${v.a}:${i}`];
            }}
            lang={localeInfo().code}
            dir={localeInfo().dir}>{t('ca.voir')}</button
          >
        {/if}
      </div>
    {/each}
  {/if}
</section>

<style>
  .mushaf {
    background: var(--card);
  }
  .titre {
    text-align: center;
    font-family: var(--font-ar);
  }
  .basmala {
    text-align: center;
  }
  /* A8 : police fournie par le Complexe pour la riwāya affichée */
  .mushaf.riwaya .quran-text {
    font-family: var(--rw-font), var(--font-quran);
  }
  .aya {
    font-size: 1.7rem;
    line-height: 2.3;
    margin: 2px 0;
    padding: 0 8px;
    border-radius: var(--radius-md);
    scroll-margin: 120px;
  }
  .aya[role='button'] {
    cursor: pointer;
  }
  .aya.range {
    background: var(--sand);
  }
  .aya.now {
    background: var(--mark);
  }
  .w.voile {
    background: var(--line);
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
    border: 1px solid var(--accent);
    border-radius: 50%;
    font-size: 0.8rem;
    line-height: 1;
    font-family: var(--font-ui);
  }
  .peek {
    min-height: 44px;
    font-size: 0.8rem;
    font-family: var(--font-ui);
    padding: 0 8px;
    vertical-align: middle;
  }
  @media (max-width: 400px) {
    .aya {
      font-size: 1.45rem;
    }
  }
</style>
