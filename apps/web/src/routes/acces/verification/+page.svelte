<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n';
  import { call, fetchMe, logout } from '$lib/session';

  /**
   * Bêta : adresse e-mail à vérifier avant d'utiliser le compte. La personne ouvre le lien reçu (page /acces, lien à
   * usage unique) ; ici elle peut le renvoyer, constater que c'est fait, ou se déconnecter.
   */
  let renvoye = $state(false);
  let encore = $state(false);
  let busy = $state(false);

  async function renvoyer() {
    busy = true;
    const r = await call('POST', '/auth/email/verify/resend', {});
    busy = false;
    renvoye = r.ok;
  }
  async function fait() {
    busy = true;
    const me = await fetchMe();
    busy = false;
    if (me?.account.emailVerified) await goto(resolve('/'));
    else encore = true;
  }
  async function quitter() {
    await logout();
    await goto(resolve('/connexion'));
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('ver.titre')}</title></svelte:head>

<section class="card" data-testid="verification-adresse">
  <h1><Bidi text={t('ver.titre')} /></h1>
  <p><Bidi text={t('ver.texte')} /></p>
  {#if renvoye}<p role="status" data-testid="ver-renvoye"><Bidi text={t('ver.renvoye')} /></p>{/if}
  {#if encore}<p role="alert" data-testid="ver-encore"><Bidi text={t('ver.pas_encore')} /></p>{/if}
  <p class="actions">
    <button type="button" class="primary" onclick={fait} disabled={busy} data-testid="ver-fait"
      ><Bidi text={t('ver.fait')} /></button
    >
    <button type="button" onclick={renvoyer} disabled={busy} data-testid="ver-renvoyer"
      ><Bidi text={t('ver.renvoyer')} /></button
    >
    <button type="button" class="ghost" onclick={quitter} data-testid="ver-quitter"
      ><Bidi text={t('ver.quitter')} /></button
    >
  </p>
</section>

<style>
  section {
    max-width: 560px;
    margin: 24px auto;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>
