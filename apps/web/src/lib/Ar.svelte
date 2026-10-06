<script lang="ts">
  import { letterColorIndex, splitMarked, tanwinDisplay } from '@awform/content/text';
  import { arabicWords, bidiSegments, LONG_WORDS } from './bidi/segments';

  /**
   * Texte arabe tel qu'écrit dans le livre. Le balisage `[..]` colore la lettre étudiée selon sa position
   * dans `lettres` (rouge, bleu, vert, or — règle du moteur des livres). Seul l'affichage des tanwins suit le
   * Muṣḥaf de Médine (tanwinDisplay, comme awform.js) ; le texte lui-même n'est jamais modifié.
   * Un fragment latin dans le texte arabe (« نَعْبُدُ : نَـ = nous ») est isolé de gauche à droite
   * (bidi/segments.ts) ; jamais pour le texte coranique, rendu tel quel.
   * Règle du client : une phrase arabe (3 mots ou plus) n'est jamais sur la même ligne que le français ; elle
   * passe sur sa propre ligne (`block`, ou automatiquement à partir de 3 mots).
   */
  let {
    text,
    lettres = [],
    quran = false,
    tag = 'span',
    block = false,
    sep = false,
  }: {
    text: string;
    lettres?: ReadonlyArray<{ l: string }>;
    quran?: boolean;
    tag?: 'span' | 'p' | 'h1' | 'h2' | 'div';
    block?: boolean;
    /** « — » après un terme resté dans la ligne ; jamais après une phrase passée sur sa ligne */
    sep?: boolean;
  } = $props();
  // phrase arabe (3 mots ou plus), texte coranique ou `block` : sur sa propre ligne (`.ar-long`, app.css)
  const long = $derived(block || quran || arabicWords(String(text ?? '')) >= LONG_WORDS);
  const cls = $derived((quran ? 'quran-text' : 'ar') + (long ? ' ar-long' : ''));

  // tanwins du Muṣḥaf de Médine : AFFICHAGE seulement (le texte reçu, stocké et comparé reste celui du livre / Tanzil)
  const segments = $derived(
    splitMarked(tanwinDisplay(text)).map((s) => ({
      ...s,
      parts: quran || s.marked ? null : bidiSegments(s.text, 'ar'),
    })),
  );
</script>

<svelte:element this={tag} class={cls} lang="ar" dir="rtl"
  >{#each segments as s, i (i)}{#if s.marked}<span class="c{letterColorIndex(s.text, lettres)}"
        >{s.text}</span
      >{:else if s.parts}{#each s.parts as p, j (j)}{#if p.kind === 'ltr'}<bdi dir="ltr" class="ltr"
            >{p.text}</bdi
          >{:else}{p.text}{/if}{/each}{:else}{s.text}{/if}{/each}</svelte:element
>{#if sep && !long}<span class="sep">—</span>{/if}

<style>
  .sep {
    margin-inline: 0.3em;
  }
  /* fragment latin dans l'arabe : police de l'interface, taille du texte courant */
  .ltr {
    font-family: var(--font-ui);
    font-size: 0.8em;
    unicode-bidi: isolate;
  }
</style>
