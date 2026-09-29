<script lang="ts">
  import { onMount } from 'svelte';
  import { locale, t } from '$lib/i18n';
  import { call } from '$lib/session';

  /**
   * Notifications (lot 16) : rien n'est activé par défaut ; heures calmes ; les notifications qui concernent
   * un enfant demandent l'accord du parent (code parent). Textes neutres, sans culpabilisation.
   */
  let { parent }: { parent: boolean } = $props();
  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  let prefs = $state({
    devoirs: false,
    rapport: false,
    enfants: false,
    quietStart: 20,
    quietEnd: 8,
    tz: 'Africa/Dakar',
  });
  let disponible = $state(false);
  let key = $state<string | null>(null);
  let appareil = $state(false);
  let pin = $state('');
  let msg = $state('');
  let error = $state('');
  const supported =
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

  onMount(async () => {
    const cfg = await fetch('/api/v1/config')
      .then((r) => r.json() as Promise<{ vapidPublicKey?: string | null }>)
      .catch(() => ({ vapidPublicKey: null }));
    key = cfg.vapidPublicKey ?? null;
    const r = await call<{ disponible: boolean; preferences: typeof prefs; endpoints: string[] }>(
      'GET',
      '/notifications',
    );
    if (r.ok) {
      disponible = r.data!.disponible && !!key && supported;
      prefs = { ...prefs, ...r.data!.preferences };
      if (supported) {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        appareil = !!sub && r.data!.endpoints.includes(sub.endpoint);
      }
    }
  });

  function b64(k: string): Uint8Array {
    const s = atob(k.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (k.length % 4)) % 4));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  }
  async function activer() {
    error = '';
    if ((await Notification.requestPermission()) !== 'granted') return (error = t('notif.refusee'));
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64(key!) as unknown as ArrayBuffer,
    });
    const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    const r = await call('POST', '/notifications/abonnement', {
      endpoint: j.endpoint,
      keys: j.keys,
    });
    if (!r.ok) return (error = t(`erreur.${r.code ?? 'reseau'}`));
    appareil = true;
  }
  async function desactiver() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await call('DELETE', '/notifications/abonnement', { endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
    appareil = false;
  }
  async function enregistrer(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    msg = '';
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || prefs.tz;
    const r = await fetch('/api/v1/notifications', {
      method: 'PUT',
      headers: {
        'x-awform': '1',
        'content-type': 'application/json',
        ...(prefs.enfants && pin ? { 'x-parent-pin': pin } : {}),
      },
      body: JSON.stringify({ ...prefs, tz, locale: locale() === 'en' ? 'en' : 'fr' }),
    });
    if (!r.ok) {
      const code = ((await r.json().catch(() => null)) as { error?: { code?: string } } | null)
        ?.error?.code;
      return (error = t(`erreur.${code ?? 'reseau'}`));
    }
    pin = '';
    msg = t('notif.enregistre');
  }
</script>

<section class="card" data-testid="notifications">
  <h2>{t('notif.titre')}</h2>
  <p class="muted small">{t('notif.principes')}</p>
  {#if !disponible}
    <p class="muted">{t('notif.indisponible')}</p>
  {:else}
    <p>
      {#if appareil}
        {t('notif.appareil_actif')}
        <button type="button" class="small" onclick={desactiver}>{t('notif.desactiver')}</button>
      {:else}
        <button type="button" onclick={activer} data-testid="notif-activer"
          >{t('notif.activer')}</button
        >
      {/if}
    </p>
    <form class="form" onsubmit={enregistrer}>
      <label class="check"
        ><input type="checkbox" bind:checked={prefs.devoirs} data-testid="notif-devoirs" />
        {t('notif.devoirs')}</label
      >
      <label class="check"
        ><input type="checkbox" bind:checked={prefs.rapport} /> {t('notif.rapport')}</label
      >
      {#if parent}
        <label class="check"
          ><input type="checkbox" bind:checked={prefs.enfants} data-testid="notif-enfants" />
          {t('notif.enfants')}</label
        >
        {#if prefs.enfants}
          <label
            >{t('profils.code_parent')}
            <input
              type="password"
              inputmode="numeric"
              maxlength="8"
              bind:value={pin}
              autocomplete="off"
            /></label
          >
        {/if}
      {/if}
      <div class="row">
        <label
          >{t('notif.calme_debut')}
          <select bind:value={prefs.quietStart}>
            {#each HOURS as h (h)}<option value={h}>{t('notif.heure', { h })}</option>{/each}
          </select></label
        >
        <label
          >{t('notif.calme_fin')}
          <select bind:value={prefs.quietEnd}>
            {#each HOURS as h (h)}<option value={h}>{t('notif.heure', { h })}</option>{/each}
          </select></label
        >
      </div>
      <button type="submit" class="primary" data-testid="notif-enregistrer"
        >{t('commun.enregistrer')}</button
      >
    </form>
  {/if}
  {#if msg}<p role="status" class="ok">{msg}</p>{/if}
  {#if error}<p role="alert" class="bad">{error}</p>{/if}
</section>

<style>
  .form {
    display: grid;
    gap: 8px;
  }
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
    min-height: 44px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  select,
  input {
    font: inherit;
    min-height: 44px;
  }
  .ok {
    color: var(--ok-ink);
  }
  .bad {
    color: var(--bad-ink);
  }
  .small {
    font-size: 0.9rem;
  }
</style>
