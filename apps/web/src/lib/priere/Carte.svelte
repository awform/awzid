<script lang="ts">
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n';
</script>

<a class="card entree" href={resolve('/vivre/priere')} data-testid="vi-priere">
  <strong>{t('priere.carte_titre')}</strong><small class="muted">{t('priere.carte_texte')}</small>
</a>

<style>
  .entree {
    display: grid;
    gap: 2px;
    justify-items: start;
    margin: var(--space-s) 0;
    min-height: 44px;
    color: var(--ink);
    text-decoration: none;
    border-inline-start: 6px solid var(--gold);
  }
</style>
