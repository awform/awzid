<script lang="ts">
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n';
</script>

<!-- aucune feuille de style propre : la carte ne charge rien d'autre que son code (attributs de style permis par la CSP) -->
<a
  class="card"
  href={resolve('/vivre/priere')}
  data-testid="vi-priere"
  style="display:grid;gap:2px;justify-items:start;min-height:44px;margin:var(--space-s) 0;color:var(--ink);text-decoration:none;border-inline-start:6px solid var(--gold)"
>
  <strong>{t('priere.carte_titre')}</strong><small class="muted">{t('priere.carte_texte')}</small>
</a>
