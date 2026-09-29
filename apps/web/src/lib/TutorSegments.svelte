<script lang="ts">
  import Ar from '$lib/Ar.svelte';
  import { t } from '$lib/i18n';
  import type { Segment } from '$lib/tutor';

  /** Rendu d'une réponse du tuteur : texte, versets (Tanzil rendu par le serveur), hadith du registre, explication validée. */
  let { segments }: { segments: Segment[] } = $props();
</script>

{#each segments as s, i (i)}
  {#if s.t === 'texte'}
    <p>{s.v.trim()}</p>
  {:else if s.t === 'coran'}
    <blockquote class="coran" lang="ar" dir="rtl">
      <span class="quran-text" data-ref={s.ref}>{s.text}</span>
      <footer class="src">{t('tuteur.source_coran', { ref: s.ref })}</footer>
    </blockquote>
  {:else if s.t === 'registre'}
    <blockquote class="reg" data-registre={s.id}>
      {#if s.texteAr}<Ar text={s.texteAr} tag="p" />{/if}
      <footer class="src">
        {t('tuteur.source_hadith', {
          recueil: s.recueil ?? '',
          numero: s.numero ?? '',
        })}{#if s.degre}
          — {s.degre}{/if}
      </footer>
    </blockquote>
  {:else}
    <div class="expl" data-explication={s.id}>
      {#if s.ar}<Ar text={s.ar} tag="p" />{/if}
      <p>{s.texteFr}</p>
      <p class="src">{t('tuteur.source_lecon', { source: s.source })}</p>
    </div>
  {/if}
{/each}

<style>
  p {
    margin: 4px 0;
  }
  .coran {
    margin: 6px 0;
    padding: 8px 10px;
    background: #f6f2e8;
    border-radius: 8px;
    font-size: 1.5rem;
    line-height: 2.1;
  }
  .reg,
  .expl {
    margin: 6px 0;
    padding: 8px 10px;
    border-inline-start: 4px solid var(--teal, #1f7a8c);
    background: #f3f8f9;
    border-radius: 6px;
  }
  .src {
    font-size: 0.8rem;
    color: var(--ink2);
    direction: ltr;
    text-align: start;
  }
</style>
