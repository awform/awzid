<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { chargerStatut, type AccesStatut } from '$lib/acces';
  import { t } from '$lib/i18n';
  import { call, type Me } from '$lib/session';
  import CodesSecours from './CodesSecours.svelte';
  import VerifTelephone from './VerifTelephone.svelte';

  /**
   * Compte (18/10/2026) — numéro WhatsApp (ajout ou changement VÉRIFIÉ, retrait s'il reste une adresse), codes de
   * récupération (régénérés : les anciens ne valent plus), liaison Google (après connexion, jamais silencieuse ;
   * retrait avec le mot de passe). Chaque action sensible demande le mot de passe.
   */
  let {
    me,
    say,
    fail,
    reload,
  }: {
    me: Me;
    say: (m: string) => void;
    fail: (code: string | null) => void;
    reload: () => Promise<void>;
  } = $props();
  let acces = $state<AccesStatut | null>(null);
  let infos = $state<{ numero: string | null; codesRestants: number; disponible: boolean } | null>(
    null,
  );
  let ajout = $state(false);
  let defi = $state<{ id: string; jeton: string } | null>(null);
  let mdp = $state('');
  let mdpCodes = $state('');
  let mdpGoogle = $state('');
  let codes = $state<string[] | null>(null);

  async function charger() {
    const r = await call<typeof infos>('GET', '/account/telephone');
    infos = r.data;
  }
  onMount(async () => {
    acces = await chargerStatut();
    await charger();
    const g = new URLSearchParams(location.search).get('google');
    if (g) {
      // l'avis de Google quitte la barre d'adresse ; la rubrique reste ouverte
      history.replaceState(history.state, '', `${location.pathname}?r=securite`);
      say(t(`id.google_${g}`));
      await reload();
    }
  });

  async function enregistrerNumero(e: SubmitEvent) {
    e.preventDefault();
    const r = await call('POST', '/account/telephone', { password: mdp, defi });
    if (!r.ok) return fail(r.code);
    ajout = false;
    defi = null;
    mdp = '';
    say(t('id.numero_enregistre'));
    await charger();
    await reload();
  }
  async function retirerNumero() {
    const password = prompt(t('id.confirmer_mdp')) ?? '';
    if (!password) return;
    const r = await call('POST', '/account/telephone/retirer', { password });
    if (!r.ok) return fail(r.code);
    await charger();
    await reload();
  }
  async function regenerer(e: SubmitEvent) {
    e.preventDefault();
    const r = await call<{ codes: string[] }>('POST', '/account/codes-secours', {
      password: mdpCodes,
    });
    if (!r.ok || !r.data) return fail(r.code);
    codes = r.data.codes;
    mdpCodes = '';
    await charger();
  }
  async function retirerGoogle(e: SubmitEvent) {
    e.preventDefault();
    const r = await call('POST', '/account/google/retirer', { password: mdpGoogle });
    if (!r.ok) return fail(r.code);
    mdpGoogle = '';
    await reload();
  }
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- liens externes (WhatsApp) ou routes de l'API (redirection vers Google) -->

<!-- eslint-disable svelte/no-navigation-without-resolve -- liens externes (WhatsApp) ou routes de l'API (redirection vers Google) -->

{#if infos?.disponible || infos?.numero}
  <section class="card" data-testid="compte-telephone">
    <h2><Bidi text={t('id.compte_numero')} /></h2>
    <p>
      <Bidi
        text={infos?.numero
          ? t('id.compte_numero_actuel', { numero: infos.numero })
          : t('id.compte_sans_numero')}
      />
    </p>
    {#if infos?.disponible}
      {#if !ajout}
        <div class="row">
          <button type="button" onclick={() => (ajout = true)} data-testid="numero-ajouter"
            ><Bidi text={infos?.numero ? t('id.numero_changer') : t('id.numero_ajouter')} /></button
          >
          {#if infos?.numero && me.account.email}<button type="button" onclick={retirerNumero}
              ><Bidi text={t('id.numero_retirer')} /></button
            >{/if}
        </div>
      {:else if !defi}
        <VerifTelephone
          objet="ajout_numero"
          pays={me.account.country ?? 'SN'}
          envoi={acces?.telephoneEnvoi === true}
          onverifie={(v) => (defi = { id: v.id, jeton: v.jeton })}
        />
      {:else}
        <form class="form" onsubmit={enregistrerNumero}>
          <label for="tel-mdp">{t('champ.mot_de_passe')}</label>
          <input
            id="tel-mdp"
            type="password"
            autocomplete="current-password"
            required
            bind:value={mdp}
          />
          <button type="submit" class="primary" data-testid="numero-enregistrer"
            ><Bidi text={t('id.numero_enregistrer')} /></button
          >
        </form>
      {/if}
    {/if}
  </section>
{/if}

<section class="card" data-testid="compte-codes">
  <h2><Bidi text={t('id.codes_titre')} /></h2>
  <p class="muted small"><Bidi text={t('id.codes_compte', { n: infos?.codesRestants ?? 0 })} /></p>
  {#if codes}
    <CodesSecours {codes} />
  {:else if me.account.motDePasse !== false}
    <form class="form" onsubmit={regenerer}>
      <label for="codes-mdp">{t('champ.mot_de_passe')}</label>
      <input
        id="codes-mdp"
        type="password"
        autocomplete="current-password"
        required
        bind:value={mdpCodes}
      />
      <button type="submit" data-testid="codes-generer"
        ><Bidi text={t('id.codes_generer')} /></button
      >
    </form>
  {/if}
</section>

{#if acces?.google || me.account.google}
  <section class="card" data-testid="compte-google">
    <h2><Bidi text={t('id.google_titre')} /></h2>
    {#if me.account.google}
      <p><Bidi text={t('id.google_lie')} /></p>
      {#if me.account.motDePasse}
        <form class="form" onsubmit={retirerGoogle}>
          <label for="google-mdp">{t('champ.mot_de_passe')}</label>
          <input
            id="google-mdp"
            type="password"
            autocomplete="current-password"
            required
            bind:value={mdpGoogle}
          />
          <button type="submit"><Bidi text={t('id.google_retirer')} /></button>
        </form>
      {:else}
        <p class="muted small"><Bidi text={t('id.google_sans_mdp')} /></p>
      {/if}
    {:else}
      <p class="muted small"><Bidi text={t('id.google_lier_aide')} /></p>
      <a
        class="button"
        href="/api/v1/auth/google/start?intent=liaison"
        data-sveltekit-reload
        data-testid="google-lier"><Bidi text={t('id.google_lier')} /></a
      >
    {/if}
  </section>
{/if}

<style>
  .form {
    display: grid;
    gap: 8px;
    max-width: 460px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  button,
  .button {
    min-height: 44px;
  }
  .small {
    font-size: 0.9rem;
  }
</style>
