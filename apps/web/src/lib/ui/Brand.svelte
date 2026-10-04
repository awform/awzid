<script lang="ts">
  import { t } from '$lib/i18n';
  /** Lot 26 — marque : étoile géométrique à huit branches (ornement, sans figuration) et nom. */
</script>

<span class="brand-in">
  <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" focusable="false">
    <g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
      <rect x="7" y="7" width="18" height="18" rx="2" />
      <rect x="7" y="7" width="18" height="18" rx="2" transform="rotate(45 16 16)" />
    </g>
    <circle cx="16" cy="16" r="3.2" fill="var(--accent)" />
  </svg>
  <span class="word">{t('app.nom')}</span>
</span>

<style>
  .brand-in {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  svg {
    flex: none;
  }
  .word {
    font-family: var(--font-title);
    font-weight: 700;
    letter-spacing: 0.06em;
  }
  /* très petit écran : la marque seule */
  @media (max-width: 359px) {
    .word {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  }
</style>
