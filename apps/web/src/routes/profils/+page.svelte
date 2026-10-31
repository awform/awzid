<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { activeProfile, setActiveProfile, type DevProfile } from '$lib/attempts';
  import { loadTexts, t } from '$lib/i18n';
  import { call, fetchMe, type Me } from '$lib/session';
  import Sym from '$lib/Sym.svelte';
  import Onboarding from '$lib/ui/Onboarding.svelte';

  /**
   * « Qui apprend ? » : choix du profil sur un appareil familial. Le parent ajoute ici le profil d'un
   * enfant (pseudonyme, ANNÉE de naissance, avatar sans visage — aucune adresse e-mail) avec son
   * consentement, après avoir ressaisi son mot de passe. Retour à cet écran protégé par le code parent.
   */
  let me = $state<Me | null>(null);
  let loaded = $state(false);
  let gate = $state(false);
  let pin = $state('');
  let pinError = $state('');
  let adding = $state(false);
  /** V2-3 : fiche d'accès (identifiant, mot de passe) ouverte pour cet enfant */
  let accesOuvert = $state<string | null>(null);
  // écrans qui écrivent sur le serveur (en ligne seulement) : chargés à la demande, hors de la coquille de l'élève
  let AccesEnfant = $state<(typeof import('./AccesEnfant.svelte'))['default'] | null>(null);
  let MonEspace = $state<(typeof import('./MonEspace.svelte'))['default'] | null>(null);
  $effect(() => {
    if (accesOuvert && !AccesEnfant)
      void import('./AccesEnfant.svelte').then((m) => (AccesEnfant = m.default));
  });
  $effect(() => {
    if (me?.account.kind === 'parent' && !me.profiles.some((p) => p.isOwner) && !MonEspace)
      void import('./MonEspace.svelte').then((m) => (MonEspace = m.default));
  });
  let info = $state('');
  onMount(async () => {
    me = await fetchMe();
    loaded = true;
    const active = await activeProfile();
    gate = !!(
      me?.account.kind === 'parent' &&
      me.account.hasPin &&
      active &&
      active.kind !== 'adulte'
    );
  });

  async function checkPin(e: SubmitEvent) {
    e.preventDefault();
    const r = await call('POST', '/account/pin/verify', { pin });
    if (r.ok) {
      gate = false;
      pin = '';
    } else pinError = t(`erreur.${r.code ?? 'reseau'}`);
  }

  async function choose(p: DevProfile) {
    await setActiveProfile(p);
    await goto(resolve('/'));
  }

  /** ajout d'un enfant : écran qui écrit sur le serveur, chargé à la demande (hors de la coquille de l'élève) */
  let AjoutEnfant = $state<(typeof import('./AjoutEnfant.svelte'))['default'] | null>(null);
  async function ouvrirAjout() {
    // lot F3 : textes de l'accord « article 9 » (hors de la coquille) chargés avant le formulaire
    await loadTexts('acces');
    AjoutEnfant = (await import('./AjoutEnfant.svelte')).default;
    adding = true;
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('profils.titre')}</title></svelte:head>

{#if loaded && !me}
  <h1>{t('profils.titre')}</h1>
  <p class="card">
    {t('profils.connexion_requise')} <a href={resolve('/connexion')}>{t('entete.connexion')}</a>
  </p>
{:else if gate}
  <h1>{t('profils.espace_parent')}</h1>
  <form class="card pin" onsubmit={checkPin}>
    <label for="pin">{t('profils.code_parent')}</label>
    <input
      id="pin"
      inputmode="numeric"
      pattern={'[0-9]{4}'}
      maxlength="4"
      autocomplete="off"
      bind:value={pin}
    />
    {#if pinError}<p class="error" role="alert"><Bidi text={pinError} /></p>{/if}
    <button type="submit" class="primary">{t('commun.valider')}</button>
  </form>
{:else if me}
  <h1>{t('profils.titre')}</h1>
  {#if me?.account.kind === 'parent'}<Onboarding audience="parent" />{/if}
  {#if info}<p class="card ok" role="status"><Bidi text={info} /></p>{/if}
  <div class="grid" data-testid="profils">
    {#each me.profiles as p (p.id)}
      <button type="button" class="kid" onclick={() => choose(p)} data-profile={p.id}>
        <Sym id={p.avatar ?? 'etoile'} size={56} />
        <span><Bidi text={p.pseudonym} /></span>
      </button>
    {/each}
  </div>
  {#if me.profiles.length === 0}<p class="muted">{t('profils.aucun')}</p>{/if}
  {#if me.account.kind === 'parent' && !me.profiles.some((p) => p.isOwner)}
    {#if MonEspace}<MonEspace oncree={async () => (me = await fetchMe())} />{/if}
  {/if}
  {#if me.account.kind === 'parent'}
    <ul class="acces-liste" aria-label={t('profils.acces_liste')}>
      {#each me.profiles.filter((p) => p.kind !== 'adulte') as p (p.id)}
        <li>
          <button
            type="button"
            class="lien"
            aria-expanded={accesOuvert === p.id}
            onclick={() => (accesOuvert = accesOuvert === p.id ? null : p.id)}
            data-testid="acces-{p.id}"
            ><Bidi text={t('profils.acces_ouvrir', { nom: p.pseudonym })} /></button
          >
        </li>
      {/each}
    </ul>
    {#each me.profiles.filter((p) => p.id === accesOuvert) as p (p.id)}
      {#if AccesEnfant}<AccesEnfant profile={p} onferme={() => (accesOuvert = null)} />{/if}
    {/each}
  {/if}
  {#if me.account.kind === 'parent' || me.account.kind === 'adulte'}
    <p><a href={resolve('/famille')} data-testid="lien-famille">{t('fam.lien')}</a></p>
  {/if}
  <!-- A37 : « Transmettre les valeurs » (guide des parents, défis de la semaine à faire avec l'enfant) -->
  {#if me.account.kind === 'parent' && me.profiles.length}
    <p>
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- chemin résolu, suivi d'un paramètre -->
      <a href={`${resolve('/vivre')}?parents`} data-testid="lien-transmettre"
        >{t('vi.transmettre')}</a
      >
    </p>
  {/if}

  {#if me.account.kind === 'parent'}
    {#if !adding}
      <p>
        <button type="button" class="primary" onclick={ouvrirAjout} data-testid="ajouter-enfant"
          >{t('profils.ajouter')}</button
        >
      </p>
    {:else}
      {#if AjoutEnfant}
        <AjoutEnfant
          pays={me.account.country}
          onajoute={async (nom) => {
            info = t('profils.ajoute', { nom });
            adding = false;
            me = await fetchMe();
          }}
          onannule={() => (adding = false)}
        />
      {/if}
    {/if}
  {/if}
  <p><a href={resolve('/compte')}>{t('entete.compte')}</a></p>
{/if}

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
    margin: 12px 0;
  }
  .kid {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 14px;
    min-height: 120px;
  }
  .pin {
    display: grid;
    gap: 8px;
    max-width: 520px;
  }
  .pin input {
    font: inherit;
    min-height: 48px;
    padding: 6px 10px;
    border: 2px solid var(--line);
    border-radius: 10px;
  }
  .error {
    color: var(--bad-ink);
    font-weight: 700;
  }
  .ok {
    background: var(--ok-bg);
  }
  .acces-liste {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    margin: 0 0 12px;
    padding: 0;
    list-style: none;
  }
  .acces-liste button {
    min-height: 44px;
  }
</style>
