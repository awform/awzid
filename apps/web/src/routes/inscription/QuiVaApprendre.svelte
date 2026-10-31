<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';

  export type Intention = 'moi' | 'enfants' | 'famille' | 'eleves';

  let { onchoisir }: { onchoisir: (i: Intention) => void } = $props();

  const CARTES: { id: Intention; cle: string }[] = [
    { id: 'moi', cle: 'moi' },
    { id: 'enfants', cle: 'enfants' },
    { id: 'famille', cle: 'famille' },
    { id: 'eleves', cle: 'eleves' },
  ];
</script>

<section class="qui" data-testid="qui-ecran" aria-labelledby="qui-t">
  <h2 id="qui-t">{t('ins.qui_titre')}</h2>
  <p class="aide"><Bidi text={t('ins.qui_aide')} /></p>
  <ul class="cartes">
    {#each CARTES as c (c.id)}
      <li>
        <button
          type="button"
          class="carte-qui"
          data-testid={`qui-${c.id}`}
          onclick={() => onchoisir(c.id)}
        >
          <strong><Bidi text={t(`ins.qui_${c.cle}`)} /></strong>
          <span class="detail"><Bidi text={t(`ins.qui_${c.cle}_aide`)} /></span>
        </button>
      </li>
    {/each}
  </ul>
</section>

<style>
  .qui {
    display: grid;
    gap: 12px;
  }
  h2 {
    margin: 0;
    font-family: var(--font-title);
  }
  .aide {
    margin: 0;
    color: var(--ink2);
  }
  .cartes {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .carte-qui {
    display: grid;
    gap: 2px;
    width: 100%;
    min-height: 64px;
    padding: 14px 16px;
    border: 2px solid var(--line);
    border-radius: 14px;
    background: var(--card);
    color: var(--ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: border-color var(--motion-fast) ease;
  }
  .carte-qui:hover {
    border-color: var(--ink2);
  }
  .carte-qui:focus-visible {
    outline: 3px solid var(--primary);
    outline-offset: 2px;
    border-color: var(--primary);
    background: var(--primary-soft);
  }
  .carte-qui strong {
    font-family: var(--font-title);
    font-weight: 600;
  }
  .detail {
    color: var(--ink2);
    font-size: 0.92rem;
  }
  @media (min-width: 640px) {
    .cartes {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
