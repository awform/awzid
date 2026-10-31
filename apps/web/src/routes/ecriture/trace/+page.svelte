<script lang="ts">
  import { onMount, type Component } from 'svelte';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import ConnexionNecessaire from '$lib/ConnexionNecessaire.svelte';
  import { chargerModule } from '$lib/charger';
  import { t } from '$lib/i18n';

  /**
   * « Voir le tracé » (31/10/2026) : le tracé animé de chaque lettre et de chacune de ses formes, et la planche de toutes
   * les lettres. La page ne contient presque rien : le composant et ses textes (5 langues) sont chargés À LA DEMANDE,
   * hors de la coquille (`lib/video/`, groupe des vidéos vivantes) ; les tracés sont `/video/traits.json`.
   */
  type Planche = Component<{ lettre?: string | null; forme?: string | null }>;
  let Planche = $state<Planche | null>(null);
  let echec = $state(false);

  function charger() {
    echec = false;
    void chargerModule(() => import('$lib/video/TracePlanche.svelte'))
      .then((m) => (Planche = m.default as unknown as Planche))
      .catch(() => (echec = true));
  }
  onMount(charger);
</script>

<svelte:head><title>{t('app.nom')} — {t('trace.voir_trace')}</title></svelte:head>

<p><a href={resolve('/ecriture')}>{t('commun.retour')}</a></p>
<h1>{t('trace.voir_trace')}</h1>
{#if Planche}
  <Planche
    lettre={page.url.searchParams.get('lettre')}
    forme={page.url.searchParams.get('forme')}
  />
{:else if echec}
  <ConnexionNecessaire onretry={charger} />
{/if}
