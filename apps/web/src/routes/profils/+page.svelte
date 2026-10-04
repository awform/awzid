<script lang="ts">
  import { onMount } from 'svelte';
  import { levelFitsProfile, levelLabel } from '$lib/levels';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { activeProfile, setActiveProfile, type DevProfile } from '$lib/attempts';
  import { t } from '$lib/i18n';
  import { call, fetchMe, type Me } from '$lib/session';
  import Sym from '$lib/Sym.svelte';
  import { SYMBOLS } from '$lib/symbols';
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
  let error = $state('');
  let info = $state('');
  const YEAR = new Date().getFullYear();
  let form = $state({
    pseudonym: '',
    birthYear: YEAR - 7,
    avatar: 'etoile',
    levelCode: 'en1',
    password: '',
    suivi: false,
    coppa: false,
  });
  const age = $derived(YEAR - 1 - Number(form.birthYear));
  const needCoppa = $derived(me?.account.country === 'US' && age < 13);

  /** livres publiés de l'édition (hors aperçus) */
  let levels = $state<string[]>(['en1']);
  onMount(async () => {
    const lv = await call<{ levels: Array<{ code: string; apercu: boolean }> }>('GET', '/levels');
    if (lv.ok) levels = lv.data!.levels.filter((l) => !l.apercu).map((l) => l.code);
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

  async function addChild(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    const consents = [
      form.suivi && 'compte_suivi',
      needCoppa && form.coppa && 'coppa_parent',
    ].filter(Boolean);
    const r = await call<{ id: string }>('POST', '/profiles', {
      pseudonym: form.pseudonym,
      birthYear: Number(form.birthYear),
      avatar: form.avatar,
      levelCode: form.levelCode,
      password: form.password,
      consents,
    });
    if (!r.ok) {
      error = t(`erreur.${r.code ?? 'reseau'}`);
      return;
    }
    info = t('profils.ajoute', { nom: form.pseudonym });
    form = { ...form, pseudonym: '', password: '', suivi: false, coppa: false };
    adding = false;
    me = await fetchMe();
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
    {#if pinError}<p class="error" role="alert">{pinError}</p>{/if}
    <button type="submit" class="primary">{t('commun.valider')}</button>
  </form>
{:else if me}
  <h1>{t('profils.titre')}</h1>
  {#if me?.account.kind === 'parent'}<Onboarding audience="parent" />{/if}
  {#if info}<p class="card ok" role="status">{info}</p>{/if}
  <div class="grid" data-testid="profils">
    {#each me.profiles as p (p.id)}
      <button type="button" class="kid" onclick={() => choose(p)} data-profile={p.id}>
        <Sym id={p.avatar ?? 'etoile'} size={56} />
        <span>{p.pseudonym}</span>
      </button>
    {/each}
  </div>
  {#if me.profiles.length === 0}<p class="muted">{t('profils.aucun')}</p>{/if}

  {#if me.account.kind === 'parent'}
    {#if !adding}
      <p>
        <button
          type="button"
          class="primary"
          onclick={() => (adding = true)}
          data-testid="ajouter-enfant">{t('profils.ajouter')}</button
        >
      </p>
    {:else}
      <form class="card form" onsubmit={addChild}>
        <h2>{t('profils.ajouter')}</h2>
        <p class="muted small">{t('profils.minimisation')}</p>
        <label for="pseudonym">{t('champ.pseudonyme')}</label>
        <input id="pseudonym" required maxlength="40" bind:value={form.pseudonym} />
        <label for="birthYear">{t('champ.annee_naissance')}</label>
        <input
          id="birthYear"
          type="number"
          min={YEAR - 17}
          max={YEAR - 3}
          required
          bind:value={form.birthYear}
        />
        <label for="level">{t('profils.niveau')}</label>
        <select id="level" bind:value={form.levelCode}>
          {#each levels.filter((c) => levelFitsProfile(c, 'enfant')) as c (c)}<option value={c}
              >{levelLabel(c)}</option
            >{/each}
        </select>
        <fieldset>
          <legend>{t('profils.avatar')}</legend>
          <div class="avatars">
            {#each SYMBOLS as s (s.id)}
              <label class="av" class:sel={form.avatar === s.id}>
                <input type="radio" name="avatar" value={s.id} bind:group={form.avatar} />
                <Sym id={s.id} size={36} /><span class="sr">{t(`symbole.${s.id}`)}</span>
              </label>
            {/each}
          </div>
        </fieldset>
        <fieldset>
          <legend>{t('profils.consentement')}</legend>
          <label class="check"
            ><input
              id="suivi"
              type="checkbox"
              required
              bind:checked={form.suivi}
              data-testid="consent-suivi"
            />
            <span>{t('consent.compte_suivi')}</span></label
          >
          {#if needCoppa}
            <label class="check"
              ><input
                id="coppa"
                type="checkbox"
                required
                bind:checked={form.coppa}
                data-testid="consent-coppa"
              />
              <span>{t('consent.coppa_parent')}</span></label
            >
          {/if}
        </fieldset>
        <label for="password">{t('profils.mot_de_passe_parent')}</label>
        <input
          id="password"
          type="password"
          autocomplete="current-password"
          required
          bind:value={form.password}
        />
        {#if error}<p class="error" role="alert" data-testid="erreur">{error}</p>{/if}
        <div class="row">
          <button type="submit" class="primary" data-testid="creer-profil"
            >{t('profils.creer')}</button
          >
          <button type="button" onclick={() => (adding = false)}>{t('commun.annuler')}</button>
        </div>
      </form>
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
  .form,
  .pin {
    display: grid;
    gap: 8px;
    max-width: 520px;
  }
  .form input:not([type='checkbox']):not([type='radio']),
  .form select,
  .pin input {
    font: inherit;
    min-height: 48px;
    padding: 6px 10px;
    border: 2px solid var(--line);
    border-radius: 10px;
  }
  fieldset {
    border: 2px solid var(--line);
    border-radius: 12px;
  }
  .avatars {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .av {
    border: 2px solid var(--line);
    border-radius: 12px;
    padding: 6px;
    cursor: pointer;
  }
  .av.sel {
    border-color: var(--teal);
  }
  .av input {
    position: absolute;
    opacity: 0;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  .check {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .check input {
    width: 24px;
    height: 24px;
    flex: none;
  }
  .row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .error {
    color: var(--bad-ink);
    font-weight: 700;
  }
  .ok {
    background: var(--ok-bg);
  }
  .small {
    font-size: 0.9rem;
  }
</style>
