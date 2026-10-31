<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import { call } from '$lib/session';
  import { onMount } from 'svelte';

  /**
   * V2-3 : accès d'un enfant (identifiant + mot de passe) depuis sa fiche, pour le parent.
   *  - sans identifiant : le parent en crée un (mêmes règles qu'à la création du profil) ;
   *  - avec identifiant : « Nouveau mot de passe » (deux touchers : ouvrir, enregistrer) et « Débloquer » (un toucher).
   */
  let { profile, onferme }: { profile: { id: string; pseudonym: string }; onferme: () => void } =
    $props();

  let identifiant = $state<string | null | undefined>(undefined);
  let nouveau = $state(false);
  let motDePasse = $state('');
  /** mot de passe DU PARENT, ressaisi à chaque action (création, nouveau mot de passe, déblocage) */
  let mdpParent = $state('');
  let login = $state('');
  let declaration = $state(false);
  let dispo = $state<{ forme: boolean; disponible: boolean; propositions: string[] } | null>(null);
  let message = $state('');
  let erreur = $state('');
  let busy = $state(false);

  onMount(async () => {
    const r = await call<{ identifiant: string | null }>('GET', `/profiles/${profile.id}/acces`);
    if (r.ok) identifiant = r.data?.identifiant ?? null;
    else erreur = t(`erreur.${r.code ?? 'reseau'}`);
  });

  async function verifier() {
    if (!login) return (dispo = null);
    const r = await call<NonNullable<typeof dispo>>(
      'GET',
      `/profiles/login-disponible?login=${encodeURIComponent(login)}&prenom=${encodeURIComponent(profile.pseudonym)}`,
    );
    dispo = r.ok ? (r.data ?? null) : null;
  }

  async function envoyer(corps: object, ok: string) {
    busy = true;
    erreur = message = '';
    const r = await call<{ identifiant?: string }>('POST', `/profiles/${profile.id}/acces`, {
      ...corps,
      password: mdpParent,
    });
    busy = false;
    mdpParent = '';
    if (!r.ok) {
      erreur = t(`erreur.${r.code ?? 'reseau'}`);
      return false;
    }
    message = ok;
    return r.data ?? {};
  }

  async function creer(e: SubmitEvent) {
    e.preventDefault();
    const r = await envoyer(
      { identifiant: login.trim().toLowerCase(), motDePasse, declaration },
      t('profils.acces_cree'),
    );
    if (r) {
      identifiant = login.trim().toLowerCase();
      motDePasse = '';
    }
  }
  async function changerMotDePasse(e: SubmitEvent) {
    e.preventDefault();
    if (await envoyer({ motDePasse }, t('profils.acces_mdp_ok'))) {
      nouveau = false;
      motDePasse = '';
    }
  }
  const debloquer = () => envoyer({ debloquer: true }, t('profils.acces_debloque'));
</script>

{#snippet champMdpParent(id: string)}
  <label for={id}>{t('profils.mot_de_passe_parent')}</label>
  <input
    {id}
    type="password"
    required
    autocomplete="current-password"
    bind:value={mdpParent}
    data-testid="acces-mdp-parent"
  />
{/snippet}

<section class="card acces" data-testid="acces-enfant" aria-labelledby="acces-t">
  <h2 id="acces-t"><Bidi text={t('profils.acces_titre', { nom: profile.pseudonym })} /></h2>
  {#if message}<p class="ok" role="status" data-testid="acces-message">
      <Bidi text={message} />
    </p>{/if}
  {#if erreur}<p class="error" role="alert" data-testid="acces-erreur">
      <Bidi text={erreur} />
    </p>{/if}

  {#if identifiant === undefined}
    <p class="muted">{t('etat.chargement')}</p>
  {:else if identifiant}
    <p>
      {t('profils.id_label')} :
      <strong data-testid="acces-identifiant"><Bidi text={identifiant} /></strong>
    </p>
    {#if nouveau}
      <form class="form" onsubmit={changerMotDePasse}>
        <label for="acces-mdp">{t('profils.mdp_enfant')}</label>
        <input
          id="acces-mdp"
          type="password"
          minlength="8"
          required
          autocomplete="new-password"
          bind:value={motDePasse}
          data-testid="acces-mdp"
        />
        <p class="muted small"><Bidi text={t('profils.mdp_enfant_aide')} /></p>
        {@render champMdpParent('acces-mdp-parent-nouveau')}
        <div class="row">
          <button type="submit" class="primary" disabled={busy} data-testid="acces-enregistrer"
            >{t('profils.acces_enregistrer')}</button
          >
          <button type="button" onclick={() => (nouveau = false)}>{t('commun.annuler')}</button>
        </div>
      </form>
    {:else}
      <div class="form">
        <!-- le déblocage et le nouveau mot de passe exigent le mot de passe du parent -->
        {@render champMdpParent('acces-mdp-parent-debloquer')}
      </div>
      <div class="row">
        <button type="button" onclick={() => (nouveau = true)} data-testid="acces-nouveau-mdp"
          >{t('profils.acces_nouveau_mdp')}</button
        >
        <button
          type="button"
          disabled={busy || !mdpParent}
          onclick={debloquer}
          data-testid="acces-debloquer">{t('profils.acces_debloquer')}</button
        >
      </div>
    {/if}
  {:else}
    <form class="form" onsubmit={creer}>
      <p class="muted small"><Bidi text={t('profils.acces_aucun')} /></p>
      <label for="acces-login">{t('profils.id_label')}</label>
      <input
        id="acces-login"
        required
        minlength="3"
        maxlength="24"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        bind:value={login}
        onblur={verifier}
        data-testid="acces-login"
      />
      {#if dispo}
        <p class={dispo.disponible ? 'ok' : 'error'} role="status" data-testid="acces-login-etat">
          <Bidi
            text={dispo.disponible
              ? t('profils.id_dispo')
              : dispo.forme
                ? t('profils.id_pris')
                : t('profils.id_forme')}
          />
        </p>
        {#if !dispo.disponible && dispo.propositions.length}
          <p class="small">
            {t('profils.id_propositions')}
            {#each dispo.propositions as p (p)}
              <button
                type="button"
                class="lien"
                onclick={() => {
                  login = p;
                  void verifier();
                }}><Bidi text={p} /></button
              >
            {/each}
          </p>
        {/if}
      {/if}
      <label for="acces-mdp-nouveau">{t('profils.mdp_enfant')}</label>
      <input
        id="acces-mdp-nouveau"
        type="password"
        minlength="8"
        required
        autocomplete="new-password"
        bind:value={motDePasse}
        data-testid="acces-mdp"
      />
      {@render champMdpParent('acces-mdp-parent-creer')}
      <label class="check"
        ><input
          type="checkbox"
          required
          bind:checked={declaration}
          data-testid="acces-declaration"
        />
        <span><Bidi text={t('profils.declaration')} /></span></label
      >
      <div class="row">
        <button type="submit" class="primary" disabled={busy} data-testid="acces-creer"
          >{t('profils.acces_creer')}</button
        >
      </div>
    </form>
  {/if}
  <p><button type="button" class="lien" onclick={onferme}>{t('profils.acces_fermer')}</button></p>
</section>

<style>
  .acces {
    display: grid;
    gap: 10px;
    max-width: 32rem;
  }
  h2 {
    margin: 0;
    font-family: var(--font-title);
  }
  .form {
    display: grid;
    gap: 10px;
  }
  .row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .row button,
  input {
    min-height: 48px;
  }
  .error {
    color: var(--bad-ink);
    font-weight: 700;
  }
  .ok {
    background: var(--ok-bg);
    padding: 8px 12px;
    border-radius: 10px;
  }
  .small {
    font-size: 0.9rem;
  }
</style>
