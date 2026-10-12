<script lang="ts">
  import { onMount } from 'svelte';
  import { version } from '$app/environment';
  import { page } from '$app/state';
  import { t } from '$lib/i18n';
  import {
    activiteEnCours,
    appliquerMaj,
    CANAL,
    doitAfficher,
    doitAppliquerSeul,
    EVT_OCCUPATION,
    majRecente,
    mediaEnCours,
    MSG_RECHARGER,
    noterMaj,
    pageEnCours,
    suivreNouvelleVersion,
    surveillerMaj,
  } from '$lib/maj';
  import Icon from '$lib/ui/Icon.svelte';

  /**
   * Mise à jour fiable (incident du 12/10/2026, voir `lib/maj.ts`) — bandeau PERSISTANT « Nouvelle version
   * disponible » avec « Mettre à jour » : un toucher fait passer TOUS les onglets à la nouvelle version. Sans
   * geste, la version s'applique seule au démarrage à froid ou après un délai. Jamais hors ligne, ni pendant une
   * leçon, une récitation, une écoute ou un exercice : l'onglet occupé attend un écran neutre pour se recharger.
   */
  let attente = $state<ServiceWorker | null>(null);
  let dejaLa = $state(false);
  let depuis = $state(0);
  let maintenant = $state(Date.now());
  let enLigne = $state(true);
  let ecoute = $state(false);
  let activite = $state(false);
  let envoi = $state(false);
  let recente = $state(false);
  let aRecharger = $state(false);
  let canal: BroadcastChannel | null = null;
  let recharge = false;
  const occupe = $derived(ecoute || activite || pageEnCours(page.url.pathname));
  const visible = $derived(doitAfficher({ prete: !!attente, occupe, enLigne, recente }));

  /** Rechargement UNE fois ; noté pour ne jamais reproposer la mise à jour en boucle. */
  function recharger() {
    if (recharge) return;
    recharge = true;
    noterMaj();
    location.reload();
  }

  // une nouvelle version a pris la main (autre onglet, application automatique) : rechargement dès l'écran neutre
  $effect(() => {
    if (aRecharger && !occupe) recharger();
  });

  // sans geste de l'élève : au démarrage à froid, ou après le délai, sur un écran neutre seulement
  $effect(() => {
    if (
      attente &&
      !envoi &&
      doitAppliquerSeul({
        prete: true,
        occupe,
        enLigne,
        recente,
        dejaLaAuDemarrage: dejaLa,
        depuisMs: maintenant - depuis,
      })
    )
      appliquer();
  });

  onMount(() => {
    if (!('serviceWorker' in navigator)) return;
    const sw = navigator.serviceWorker;
    enLigne = navigator.onLine;
    recente = majRecente();
    const debutRecent = recente;
    const on = () => (enLigne = true);
    const off = () => (enLigne = false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    try {
      canal = new BroadcastChannel(CANAL);
    } catch {
      canal = null;
    }
    // les événements de lecture ne remontent pas : écoutés en phase de capture sur le document
    const lecture = () => (ecoute = mediaEnCours(document));
    const occupation = () => (activite = activiteEnCours());
    occupation();
    const evts = ['play', 'playing', 'pause', 'ended', 'emptied'];
    for (const e of evts) document.addEventListener(e, lecture, true);
    window.addEventListener(EVT_OCCUPATION, occupation);
    const tic = setInterval(() => {
      maintenant = Date.now();
      recente = majRecente();
    }, 15_000);
    const stop = surveillerMaj(sw, (w, deja) => {
      if (attente === w) return;
      attente = w;
      // juste après une mise à jour (anti-boucle), pas d'application immédiate : le délai s'applique
      dejaLa = deja && !debutRecent;
      depuis = maintenant = Date.now();
    });
    const stopSuivi = suivreNouvelleVersion(sw, version, () => (aRecharger = true), canal);
    return () => {
      for (const e of evts) document.removeEventListener(e, lecture, true);
      window.removeEventListener(EVT_OCCUPATION, occupation);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      clearInterval(tic);
      stop();
      stopSuivi();
      canal?.close();
    };
  });

  function appliquer() {
    if (!attente || envoi) return;
    envoi = true;
    appliquerMaj(attente, navigator.serviceWorker, () => {
      // la nouvelle version a la main : les autres onglets (même non contrôlés) sont prévenus
      try {
        canal?.postMessage({ type: MSG_RECHARGER });
      } catch {
        /* canal fermé */
      }
      recharger();
    });
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
    /* lot lecteur 4 : toujours au PREMIER PLAN (au-dessus de la barre du lecteur et de l'en-tête) */
    position: relative;
    z-index: 40;
  }
  /*
   * lecteur du Coran (téléphone, commandes flottantes) : l'en-tête et la barre du lecteur sont fixés en haut ; le
   * bandeau passait dessous (essai du client, 12/10/2026). Il flotte au-dessus d'eux, lisible et touchable.
   */
  :global(html[data-surcouche]) .maj {
    position: fixed;
    top: calc(env(safe-area-inset-top) + 6px);
    inset-inline: 8px;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg, 16px);
    box-shadow: var(--shadow-float);
  }
  .msg {
    font-weight: 600;
  }
</style>
