<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import type { ProfileInfo } from '$lib/session';
  import { rappelCompte } from './donnees';

  /**
   * Écran de consentement du rappel quotidien (26/10/2026) : dit en français simple ce qui est envoyé et comment
   * l'arrêter. Aucun rappel sans accord : tant que cet écran n'a pas reçu un « J'accepte », rien n'est activé, ni sur
   * l'appareil ni sur le serveur. Pour un enfant ou un ado, c'est un parent ou un responsable qui accepte (case à cocher
   * et, si la famille en a un, le code parent, vérifié par le serveur).
   */
  let {
    profil,
    accepte,
    refuse,
  }: {
    profil: ProfileInfo | null;
    accepte: () => void | Promise<void>;
    refuse: () => void;
  } = $props();

  const mineur = $derived(!!profil && profil.kind !== 'adulte');
  let parentOk = $state(false);
  let pin = $state('');
  let erreur = $state('');
  let envoi = $state(false);

  async function accepter() {
    erreur = '';
    if (mineur && !parentOk) return void (erreur = t('kh.consent_parent_requis'));
    envoi = true;
    try {
      const r = await rappelCompte(true, {
        accord: true,
        ...(profil ? { profileId: profil.id } : {}),
        ...(mineur && pin ? { pin } : {}),
      });
      if (!r.ok) return void (erreur = t(`erreur.${r.code ?? 'reseau'}`));
      await accepte();
    } finally {
      envoi = false;
    }
  }
</script>

<section class="consent" aria-labelledby="kh-consent-titre" data-testid="kh-consentement">
  <h3 id="kh-consent-titre">{t('kh.consent_titre')}</h3>
  <p><Bidi text={t('kh.consent_envoye')} /></p>
  <p><Bidi text={t('kh.consent_limites')} /></p>
  <p><Bidi text={t('kh.consent_arreter')} /></p>

  {#if mineur}
    <div class="parent" data-testid="kh-consent-parent">
      <p><Bidi text={t('kh.consent_enfant')} /></p>
      <label class="choix"
        ><input type="checkbox" bind:checked={parentOk} data-testid="kh-consent-parent-ok" />
        {t('kh.consent_parent_case')}</label
      >
      <label
        >{t('profils.code_parent')}
        <input
          type="password"
          inputmode="numeric"
          maxlength="8"
          autocomplete="off"
          bind:value={pin}
          data-testid="kh-consent-pin"
        /></label
      >
    </div>
  {/if}

  {#if erreur}<p role="alert" class="bad" data-testid="kh-consent-erreur">
      <Bidi text={erreur} />
    </p>{/if}
  <div class="actions">
    <button
      type="button"
      class="primary"
      disabled={envoi}
      onclick={accepter}
      data-testid="kh-consent-accepte">{t('kh.consent_accepte')}</button
    >
    <button type="button" onclick={refuse} data-testid="kh-consent-refuse"
      >{t('kh.consent_refuse')}</button
    >
  </div>
</section>

<style>
  .consent {
    display: grid;
    gap: 10px;
  }
  h3,
  p {
    margin: 0;
  }
  .parent {
    display: grid;
    gap: 8px;
    padding: var(--space-s, 10px);
    border: 1px solid var(--line);
    border-radius: var(--radius, 12px);
  }
  .choix {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
  }
  input[type='password'] {
    font: inherit;
    min-height: 44px;
    width: 100%;
  }
  .bad {
    color: var(--bad-ink);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .actions button {
    min-height: 44px;
  }
</style>
