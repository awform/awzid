<script lang="ts">
  import { resolve } from '$app/paths';
  import { tanwinDisplay } from '@awform/content/text';
  import type { VerseMark } from '@awform/content/versets';
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import { recitationQuery } from '$lib/lecons-audio';

  /**
   * Verset cité dans un point de leçon (fiqh, adab, « je retiens », rubriques des sciences…) : bloc à part,
   * texte Tanzil EXACT (la sous-chaîne `ar.slice(i, j)` repérée par le serveur, jamais retapée ni normalisée ;
   * seul l'affichage des tanwins suit le Muṣḥaf de Médine, comme partout), police du Muṣḥaf, ornements ﴿ ﴾
   * hors du texte ; dessous, sur leurs propres lignes : la référence, la traduction du livre et le lien vers
   * la récitation du Complexe. JAMAIS de voix de synthèse sur un verset.
   */
  let { ar, m, fr = '' }: { ar: string; m: VerseMark; fr?: string } = $props();

  const texte = $derived(ar.slice(m.i, m.j));
  const sens = $derived(fr.slice(0, m.k ?? fr.length).trim());
  const q = $derived(m.s && m.a ? recitationQuery(`${m.s}:${m.a}`) : null);
</script>

<figure
  class="verset-bloc"
  data-testid="verset-bloc"
  data-verse={m.s ? `${m.s}:${m.a}${m.a2 ? `-${m.a2}` : ''}` : undefined}
>
  <p class="v" lang="ar" dir="rtl">
    <span class="orn" aria-hidden="true">﴿</span><span class="quran-text" data-testid="verset-texte"
      >{tanwinDisplay(texte)}</span
    ><span class="orn" aria-hidden="true">﴾</span>
  </p>
  <figcaption>
    {#if m.ref}<p class="ref" data-testid="verset-ref"><Bidi text={m.ref} /></p>{/if}
    {#if sens}<p class="fr" data-testid="verset-sens"><Bidi text={sens} /></p>{/if}
    <!-- A3 : jamais de synthèse sur un verset ; renvoi à la récitation du Complexe -->
    <!-- eslint-disable svelte/no-navigation-without-resolve -- chemin résolu, suivi d'un paramètre -->
    {#if q}<a
        class="rec-link"
        data-testid="ecouter-recitation"
        href={`${resolve('/coran/ecouter')}${q}`}>{t('audio.recitation')}</a
      >{/if}
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
  </figcaption>
</figure>

<style>
  .verset-bloc {
    margin: 8px 0;
    padding: 8px 14px;
    background: var(--card);
    border: 1px solid var(--line);
    border-inline-start: 4px solid var(--navy);
    border-radius: 12px;
  }
  p {
    margin: 0;
  }
  .v {
    text-align: center;
  }
  .orn {
    font: calc(var(--ar-size) + 4px) var(--font-quran);
    color: var(--teal);
  }
  .ref,
  .rec-link {
    font-weight: 700;
    color: var(--navy);
  }
  .rec-link {
    color: var(--teal);
  }
</style>
