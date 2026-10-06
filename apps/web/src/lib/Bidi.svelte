<script lang="ts">
  import { bidiSegments, type BidiBase } from './bidi/segments';
  import { localeInfo } from './i18n';

  /**
   * Composant commun de tout texte affiché (livres, interface) : isole chaque segment arabe d'un texte
   * français (et chaque segment latin d'un texte arabe), avec la police arabe ; une phrase arabe (3 mots ou
   * plus) passe sur sa propre ligne, alignée à droite, partout (règle du client : jamais une phrase arabe sur
   * la même ligne que le français). Le texte n'est JAMAIS modifié : il est seulement découpé
   * (voir bidi/segments.ts). `base` : écriture du contexte (par défaut, celle de la langue de l'interface).
   */
  let { text, base }: { text: unknown; base?: BidiBase } = $props();

  const segments = $derived(
    bidiSegments(String(text ?? ''), base ?? (localeInfo().dir === 'rtl' ? 'ar' : 'fr')),
  );
</script>

{#each segments as s, i (i)}{#if s.kind === 'plain'}{s.text}{:else if s.kind === 'ltr'}<bdi
      dir="ltr"
      class="bidi-ltr">{s.text}</bdi
    >{:else}<bdi dir="rtl" lang="ar" class="bidi-ar" class:bidi-long={s.kind === 'ar-long'}
      >{s.text}</bdi
    >{/if}{/each}

<style>
  .bidi-ar {
    font-family: var(--font-ar);
    font-size: 1.1em;
    /* la police arabe (signes au-dessus et au-dessous) n'écarte pas les lignes du français */
    line-height: 1.3;
    unicode-bidi: isolate;
  }
  /* phrase arabe longue : sur sa propre ligne, alignée à droite, la traduction en dessous */
  .bidi-long {
    display: block;
    text-align: right;
    font-size: 1.2em;
    line-height: 1.9;
    margin-block: 0.15em;
  }
  .bidi-ltr {
    unicode-bidi: isolate;
  }
</style>
