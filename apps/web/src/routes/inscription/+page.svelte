<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { setActiveProfile } from '$lib/attempts';
  import { COUNTRIES, countryName, needsTransferConsent } from '$lib/countries';
  import { locale, t } from '$lib/i18n';
  import { call, fetchMe, type Me } from '$lib/session';

  /**
   * Inscription d'un PARENT (il créera ensuite les profils de ses enfants, sans e-mail) ou d'un ADULTE
   * autonome. Consentements séparés, jamais cochés d'avance ; données hébergées dans l'Union européenne.
   */
  let kind: 'parent' | 'adulte' = $state('parent');
  let email = $state('');
  let password = $state('');
  let country = $state('FR');
  let birthYear: number | undefined = $state(undefined);
  let pseudonym = $state('');
  /** A39 : façon d'avancer de l'adulte (modifiable ensuite dans son compte) */
  // D-A39 : « Mode serein » présélectionné (ne pas décourager) ; « Avec vérification » reste au choix
  let evalMode: 'verification' | 'serein' = $state('serein');
  let cgu = $state(false);
  /** lot F3 (revue E10) : accord explicite « article 9 », nécessaire, jamais coché d'avance */
  let art9 = $state(false);
  /** lot F3 (revue M9) : province (Canada : âge du consentement au Québec) */
  let region = $state('');
  let transfert = $state(false);
  let rappels = $state(false);
  let error = $state('');
  let busy = $state(false);
  /** règles du pays (loi, autorité, âge, accords) données par le serveur ; à défaut, calcul local */
  type Rules = {
    country: string;
    consentAge: number;
    region?: string | null;
    regions?: string[];
    closedUnder?: number | null;
    transferConsent: boolean;
    law: string;
    authority: string;
  };
  let rules = $state<Rules | null>(null);
  $effect(() => {
    const c = country;
    const reg = region;
    void call<Rules>('GET', `/pays/${c}/regles${reg ? `?region=${reg}` : ''}`).then((r) => {
      if (country === c && region === reg) rules = r.ok ? r.data : null;
    });
  });
  const current = $derived(rules?.country === country ? rules : null);
  const transferNeeded = $derived(current?.transferConsent ?? needsTransferConsent(country));

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    const consents = [
      cgu && 'cgu',
      art9 && 'donnee_religieuse_art9',
      transferNeeded && transfert && 'transfert_hors_pays',
      rappels && 'rappels',
    ].filter(Boolean) as string[];
    const r = await call<Me>('POST', '/auth/signup', {
      kind,
      email,
      password,
      country,
      locale: locale(),
      consents,
      birthYear,
      ...(region && current?.regions?.includes(region) ? { region } : {}),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...(kind === 'adulte' && pseudonym ? { pseudonym } : {}),
      ...(kind === 'adulte' ? { evalMode } : {}),
    });
    busy = false;
    if (!r.ok) {
      error = t(`erreur.${r.code ?? 'reseau'}`, { age: (r.error?.age as number) ?? 15 });
      return;
    }
    const me = await fetchMe();
    if (me?.profiles.length === 1) await setActiveProfile(me.profiles[0] ?? null);
    await goto(resolve(kind === 'parent' ? '/profils' : '/'));
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('inscription.titre')}</title></svelte:head>

<h1>{t('inscription.titre')}</h1>
<form class="card form" onsubmit={submit}>
  <fieldset>
    <legend>{t('inscription.qui')}</legend>
    <label class="radio"
      ><input type="radio" name="kind" value="parent" bind:group={kind} data-testid="type-parent" />
      <span><strong>{t('inscription.parent')}</strong> — {t('inscription.parent_aide')}</span
      ></label
    >
    <label class="radio"
      ><input type="radio" name="kind" value="adulte" bind:group={kind} data-testid="type-adulte" />
      <span><strong>{t('inscription.adulte')}</strong> — {t('inscription.adulte_aide')}</span
      ></label
    >
  </fieldset>

  <label for="email">{t('champ.email')}</label>
  <input id="email" type="email" autocomplete="email" required bind:value={email} />
  <label for="password">{t('champ.mot_de_passe')}</label>
  <input
    id="password"
    type="password"
    autocomplete="new-password"
    required
    minlength="12"
    bind:value={password}
  />
  <p class="muted small">{t('inscription.mdp_aide')}</p>

  <label for="country">{t('champ.pays')}</label>
  <select id="country" bind:value={country} onchange={() => (region = '')}>
    {#each COUNTRIES as c (c)}<option value={c}>{countryName(c)}</option>{/each}
  </select>
  {#if current?.regions?.length}
    <label for="region">{t('inscription.region')}</label>
    <select id="region" bind:value={region} required data-testid="region">
      <option value=""></option>
      {#each current.regions as r (r)}<option value={r}>{t(`region.${r}`)}</option>{/each}
    </select>
  {/if}

  {#if current}
    <p class="muted small" data-testid="loi-pays">
      <Bidi
        text={t('inscription.loi_pays', {
          pays: countryName(country),
          loi: t(`pays.loi.${current.law}`),
          autorite: t(`pays.autorite.${current.authority}`),
        })}
      />
      <Bidi text={t('inscription.loi_mineurs', { age: current.consentAge })} />
      {#if current.closedUnder}<Bidi text={t('inscription.ferme_moins_13')} />{/if}
    </p>
  {/if}

  <!-- audit MIN-3 : année de naissance demandée à tout titulaire (un parent doit être majeur) -->
  <label for="birthYear">{t('champ.annee_naissance')}</label>
  <input id="birthYear" type="number" min="1900" max="2100" required bind:value={birthYear} />
  <p class="muted small">{t('inscription.annee_aide')}</p>
  {#if kind === 'adulte'}
    <label for="pseudonym">{t('champ.pseudonyme')}</label>
    <input id="pseudonym" maxlength="40" bind:value={pseudonym} />
    <fieldset data-testid="mode-inscription">
      <legend>{t('ser.titre')}</legend>
      {#each ['verification', 'serein'] as const as m (m)}
        <label class="radio"
          ><input
            type="radio"
            name="evalMode"
            value={m}
            bind:group={evalMode}
            data-mode-choix={m}
          />
          <span
            ><strong><Bidi text={t(`ser.m_${m}`)} /></strong> — <Bidi
              text={t(`ser.a_${m}`)}
            /></span
          ></label
        >
      {/each}
      <p class="muted small">{t('ser.modifiable')}</p>
    </fieldset>
  {/if}

  <fieldset>
    <legend>{t('inscription.consentements')}</legend>
    <label class="check"
      ><input id="cgu" type="checkbox" bind:checked={cgu} required data-testid="consent-cgu" />
      <span>{t('consent.cgu')}</span></label
    >
    <label class="check"
      ><input id="art9" type="checkbox" bind:checked={art9} required data-testid="consent-art9" />
      <span><Bidi text={t('consent.donnee_religieuse_art9')} /></span></label
    >
    {#if transferNeeded}
      <label class="check"
        ><input
          id="transfert"
          type="checkbox"
          bind:checked={transfert}
          required
          data-testid="consent-transfert"
        />
        <span><Bidi text={t('consent.transfert_hors_pays', { pays: countryName(country) })} /></span
        ></label
      >
    {/if}
    <label class="check"
      ><input id="rappels" type="checkbox" bind:checked={rappels} />
      <span>{t('consent.rappels')} <em class="muted">({t('commun.facultatif')})</em></span></label
    >
  </fieldset>

  {#if error}<p class="error" role="alert" data-testid="erreur"><Bidi text={error} /></p>{/if}
  <button type="submit" class="primary" disabled={busy}>{t('inscription.bouton')}</button>
</form>
<p>{t('inscription.deja')} <a href={resolve('/connexion')}>{t('connexion.titre')}</a></p>

<style>
  .form {
    display: grid;
    gap: 8px;
    max-width: 560px;
  }
  .form input:not([type='checkbox']):not([type='radio']),
  .form select {
    font: inherit;
    min-height: 48px;
    padding: 6px 10px;
    border: 2px solid var(--line);
    border-radius: 10px;
  }
  fieldset {
    border: 2px solid var(--line);
    border-radius: 12px;
    display: grid;
    gap: 8px;
  }
  .radio,
  .check {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .radio input,
  .check input {
    width: 24px;
    height: 24px;
    flex: none;
  }
  .error {
    color: var(--bad-ink);
    font-weight: 700;
  }
  .small {
    font-size: 0.9rem;
    margin: 0;
  }
</style>
