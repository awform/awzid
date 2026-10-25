<script lang="ts">
  import { untrack, type Component } from 'svelte';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import Bidi from '$lib/Bidi.svelte';
  import ConnexionNecessaire from '$lib/ConnexionNecessaire.svelte';
  import { CAHIER_NIVEAUX } from '$lib/cahier-pages';
  import { chargerModule } from '$lib/charger';
  import { fn, fonctionsEtat } from '$lib/fonctions.svelte';
  import { t } from '$lib/i18n';
  import { noter } from '$lib/usage';
  import type { OuvrirCahierOptions } from '$lib/video/lecteur-cahier';

  /**
   * Cahier de lecture (20/10/2026) — page du cahier d'un niveau (`?p=P047` : une page ; sans paramètre : le sommaire).
   * Derrière l'interrupteur `cahier_lecture`. Tout le cahier (rendu, lecture guidée, minutes, bilans, atelier) est
   * chargé À LA DEMANDE (`$lib/cahier`, liste `/_app/cahier.json`, garde de poids dédiée) : jamais préchargé, gardé
   * au premier usage et au téléchargement du niveau.
   */
  const niveau = $derived(page.params.niveau ?? '');
  const ouvert = $derived(fn('cahier_lecture') && CAHIER_NIVEAUX.includes(niveau));
  /**
   * « Regarder la vidéo » (25/10/2026) : proposé seulement si `video_v2` est ouvert aussi ; le lecteur et son générateur
   * (groupe `/_app/video.json`) ne sont chargés qu'au premier appui, avec les nouvelles tentatives des modules à la demande.
   */
  const ouvrirVideo = $derived(
    fn('video_v2')
      ? (o: OuvrirCahierOptions) =>
          chargerModule(() => import('$lib/video/lecteur-cahier')).then((m) => m.ouvrir(o))
      : null,
  );
  let Vue = $state<Component<{
    niveau: string;
    pageId: string | null;
    unite?: string | null;
    ouvrirVideo?: ((o: OuvrirCahierOptions) => Promise<void>) | null;
  }> | null>(null);
  let echec = $state(false);
  function charger() {
    echec = false;
    chargerModule(() => import('$lib/cahier'))
      .then((m) => {
        Vue = m.Cahier;
        noter('cahier_lecture');
      })
      .catch(() => (echec = true));
  }
  $effect(() => {
    if (ouvert && !Vue && !untrack(() => echec)) charger();
  });
</script>

<svelte:head><title>{t('app.nom')} — {t('cahier.titre')}</title></svelte:head>

{#if ouvert && Vue}
  <Vue
    {niveau}
    pageId={page.url.searchParams.get('p')}
    unite={page.url.searchParams.get('u')}
    {ouvrirVideo}
  />
{:else if ouvert && echec}
  <ConnexionNecessaire onretry={charger} />
{:else if !ouvert && fonctionsEtat.qui}
  <section class="card info" data-testid="cahier-ferme">
    <p><Bidi text={t('cahier.ferme')} /></p>
    <a href={resolve('/')}>{t('niveau.retour')}</a>
  </section>
{:else}
  <p class="muted" aria-busy="true">…</p>
{/if}

<style>
  .info {
    background: var(--info-bg);
  }
</style>
