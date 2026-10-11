<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { t } from '$lib/i18n';
  import {
    appliquerMaj,
    doitAfficher,
    majRecente,
    mediaEnCours,
    pageEnCours,
    surveillerMaj,
  } from '$lib/maj';
  import Icon from '$lib/ui/Icon.svelte';

  /**
   * Bêta-support — bandeau discret « Une nouvelle version est prête » avec le bouton « Mettre à jour ».
   * Jamais pendant une écoute ou une leçon en cours (il attend la fin), jamais hors ligne, jamais en boucle,
   * et « Plus tard » le range jusqu'au prochain démarrage. La version ne s'applique JAMAIS toute seule.
   */
  let attente = $state<ServiceWorker | null>(null);
  let enLigne = $state(true);
  let ecoute = $state(false);
  let plusTard = $state(false);
  let envoi = $state(false);
  let recente = $state(false);
  const occupe = $derived(ecoute || pageEnCours(page.url.pathname));
  const visible = $derived(doitAfficher({ prete: !!attente, occupe, enLigne, plusTard, recente }));

  onMount(() => {
    if (!('serviceWorker' in navigator)) return;
    enLigne = navigator.onLine;
    recente = majRecente();
    const on = () => (enLigne = true);
    const off = () => (enLigne = false);
    // les événements de lecture ne remontent pas : écoutés en phase de capture sur le document
    const lecture = () => (ecoute = mediaEnCours(document));
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const evts = ['play', 'playing', 'pause', 'ended', 'emptied'];
    for (const e of evts) document.addEventListener(e, lecture, true);
    const stop = surveillerMaj(navigator.serviceWorker, (w) => (attente = w));
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      for (const e of evts) document.removeEventListener(e, lecture, true);
      stop();
    };
  });

  function appliquer() {
    if (!attente || envoi) return;
    envoi = true;
    appliquerMaj(attente, navigator.serviceWorker, () => location.reload());
  }
</script>

{#if visible}
  <p class="maj" role="status" data-testid="maj-bandeau">
    <Icon name="rafraichir" size={20} />
    <span class="msg">{t('maj.pret')}</span>
    <button
      type="button"
      class="primary"
      data-testid="maj-appliquer"
      disabled={envoi}
      onclick={appliquer}>{t('maj.bouton')}</button
    >
    <button
      type="button"
      class="ghost"
      data-testid="maj-plus-tard"
      onclick={() => (plusTard = true)}>{t('maj.plus_tard')}</button
    >
  </p>
{/if}

<style>
  .maj {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px 12px;
    margin: 0;
    padding: 6px 16px;
    background: var(--primary-soft);
    color: var(--ink);
    font-size: 0.95rem;
    border-bottom: 1px solid var(--line);
  }
  .msg {
    font-weight: 600;
  }
</style>
