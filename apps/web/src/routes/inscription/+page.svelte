<script lang="ts">
  import { fn } from '$lib/fonctions.svelte';
  import Bidi from '$lib/Bidi.svelte';
  import Brand from '$lib/ui/Brand.svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { setActiveProfile } from '$lib/attempts';
  import { COUNTRIES, countryName, needsTransferConsent } from '$lib/countries';
  import { locale, t } from '$lib/i18n';
  import { call, fetchMe, type Me } from '$lib/session';
  import { onMount } from 'svelte';
  import { chargerStatut, type AccesStatut } from '$lib/acces';
  import ListeAttente from './ListeAttente.svelte';

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
  // F5 : interrupteur « Mode serein » coupé → « Avec vérification » seulement
  const modesInscription = $derived<Array<'verification' | 'serein'>>(
    fn('mode_serein') ? ['verification', 'serein'] : ['verification'],
  );
  $effect(() => {
    if (!fn('mode_serein') && evalMode === 'serein') evalMode = 'verification';
  });
  let cgu = $state(false);
  /** lot F3 (revue E10) : accord explicite « article 9 », nécessaire, jamais coché d'avance */
  let art9 = $state(false);
  /** lot F3 (revue M9) : province (Canada : âge du consentement au Québec) */
  let region = $state('');
  let transfert = $state(false);
  let rappels = $state(false);
  let error = $state('');
  let busy = $state(false);
  /**
   * Bêta fermée sur invitation : en mode « invitation », le formulaire n'apparaît qu'avec un code reconnu (saisi ou
   * arrivé par le lien personnel, dans le fragment `#code=…` : jamais envoyé au serveur ni gardé dans les journaux).
   */
  let acces = $state<AccesStatut | null>(null);
  let code = $state('');
  let codeOk = $state(false);
  let codePerso = $state(false);
  let codeErreur = $state('');
  let codeBusy = $state(false);
  let demande = $state(false);
  /** anti-robots (réglage « antibot ») : jeton signé reçu à l'ouverture + champ piège que seul un robot remplit */
  let jeton = $state('');
  let piege = $state('');
  // « invitation » : code requis ; « attente » : plafond du mode ouvert atteint, liste d'attente (un code reste valable)
  const porteFermee = $derived(
    (acces?.inscription === 'invitation' || acces?.inscription === 'attente') && !codeOk,
  );
  async function verifierCode() {
    codeBusy = true;
    codeErreur = '';
    const r = await call<{ valide: boolean; personnelle: boolean }>('POST', '/acces/invitation', {
      code: code.trim(),
    });
    codeBusy = false;
    codeOk = r.ok && r.data?.valide === true;
    codePerso = codeOk && r.data?.personnelle === true;
    if (!codeOk) codeErreur = t(`erreur.${r.code ?? 'reseau'}`);
  }
  onMount(async () => {
    acces = await chargerStatut();
    // plafond atteint, ou lien « Demander une invitation » de l'accueil de la bêta (#attente) : la demande est déjà ouverte
    if (acces?.inscription === 'attente' || location.hash === '#attente') demande = true;
    if (acces?.antibot === 'on') {
      const j = await call<{ jeton: string }>('GET', '/acces/jeton');
      jeton = j.ok && j.data ? j.data.jeton : '';
    }
    const m = /(?:^|[#&])code=([^&]+)/.exec(location.hash);
    if (m) {
      code = decodeURIComponent(m[1] ?? '');
      // le code quitte la barre d'adresse et l'historique
      history.replaceState(null, '', location.pathname);
      await verifierCode();
    }
  });
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
      ...(codeOk ? { invitation: code.trim() } : {}),
      ...(jeton ? { jeton } : {}),
      ...(piege ? { site_web: piege } : {}),
    });
    busy = false;
    if (!r.ok) {
      error = t(`erreur.${r.code ?? 'reseau'}`, { age: (r.error?.age as number) ?? 15 });
      // plafond atteint pendant la saisie : on passe à la liste d'attente ; jeton trop récent : nouveau jeton
      if (r.code === 'plafond_atteint') acces = await chargerStatut(true);
      if (r.code === 'antibot_echec' && acces?.antibot === 'on') {
        const j = await call<{ jeton: string }>('GET', '/acces/jeton');
        jeton = j.ok && j.data ? j.data.jeton : '';
      }
      return;
    }
    const me = await fetchMe();
    if (me?.profiles.length === 1) await setActiveProfile(me.profiles[0] ?? null);
    // adresse e-mail à vérifier avant d'utiliser le compte
    if (acces?.verification === 'requise') await goto(resolve('/acces/verification'));
    else await goto(resolve(kind === 'parent' ? '/profils' : '/'));
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('inscription.titre')}</title></svelte:head>

<!-- D2 : bloc marque sobre (comme la connexion), puis le formulaire en trois temps : qui, identifiants, accords -->
<div class="accueil-marque" data-testid="inscription-marque">
  <Brand slogan surPage size={48} />
</div>
<h1>{t('inscription.titre')}</h1>
{#if porteFermee}
  <!-- bêta fermée : code d'invitation, ou demande d'invitation (liste d'attente validée à la main) -->
  <section class="card form" data-testid="porte-invitation">
    <h2><Bidi text={t('inv.titre')} /></h2>
    <p>
      <Bidi text={t(acces?.inscription === 'attente' ? 'inv.complet' : 'inv.intro')} />
    </p>
    <form
      class="porte"
      onsubmit={(e) => {
        e.preventDefault();
        void verifierCode();
      }}
    >
      <label for="code-invitation"><Bidi text={t('inv.code')} /></label>
      <input
        id="code-invitation"
        autocomplete="off"
        autocapitalize="characters"
        spellcheck="false"
        dir="ltr"
        aria-describedby="code-exemple"
        required
        bind:value={code}
        data-testid="code-invitation"
      />
      <p class="muted small" id="code-exemple"><Bidi text={t('inv.exemple')} /></p>
      {#if codeErreur}<p class="error" role="alert" data-testid="erreur-code">
          <Bidi text={codeErreur} />
        </p>{/if}
      <button type="submit" class="primary go" disabled={codeBusy}
        ><Bidi text={t('inv.verifier')} /></button
      >
    </form>
    <p class="muted">
      <Bidi text={t('inv.sans_code')} />
      <button
        type="button"
        class="lien"
        onclick={() => (demande = !demande)}
        aria-expanded={demande}><Bidi text={t('inv.demander')} /></button
      >
    </p>
    {#if demande}<ListeAttente />{/if}
  </section>
{:else}
  {#if codeOk}
    <p class="card ok" role="status" data-testid="invitation-reconnue">
      <Bidi text={t('inv.reconnue')} />
      {#if codePerso}<br /><Bidi text={t('inv.perso')} />{/if}
    </p>
  {/if}
  <form class="card form" onsubmit={submit}>
    <!-- champ piège anti-robots : invisible et hors du parcours au clavier, seul un robot le remplit -->
    <div class="piege" aria-hidden="true">
      <input
        name="site_web"
        type="text"
        tabindex="-1"
        autocomplete="off"
        bind:value={piege}
        data-testid="piege"
      />
    </div>
    <fieldset>
      <legend>{t('inscription.qui')}</legend>
      <label class="radio"
        ><input
          type="radio"
          name="kind"
          value="parent"
          bind:group={kind}
          data-testid="type-parent"
        />
        <span><strong>{t('inscription.parent')}</strong> — {t('inscription.parent_aide')}</span
        ></label
      >
      <label class="radio"
        ><input
          type="radio"
          name="kind"
          value="adulte"
          bind:group={kind}
          data-testid="type-adulte"
        />
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
        {#each modesInscription as m (m)}
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
          <span
            ><Bidi text={t('consent.transfert_hors_pays', { pays: countryName(country) })} /></span
          ></label
        >
      {/if}
      <label class="check"
        ><input id="rappels" type="checkbox" bind:checked={rappels} />
        <span>{t('consent.rappels')} <em class="muted">({t('commun.facultatif')})</em></span></label
      >
    </fieldset>

    {#if error}<p class="error" role="alert" data-testid="erreur"><Bidi text={error} /></p>{/if}
    <button type="submit" class="primary go" disabled={busy}>{t('inscription.bouton')}</button>
  </form>
{/if}
<p class="deja">
  {t('inscription.deja')} <a href={resolve('/connexion')}>{t('connexion.titre')}</a>
</p>

<style>
  .accueil-marque {
    display: grid;
    justify-items: center;
    gap: 12px;
    margin: 12px 0 4px;
  }
  .accueil-marque::after {
    content: '';
    width: 72px;
    height: 2px;
    border-radius: 2px;
    background: var(--gold);
  }
  h1 {
    text-align: center;
    font-size: 1.4rem;
  }
  .form {
    display: grid;
    gap: 8px;
    max-width: 560px;
    margin-inline: auto;
    border-radius: 16px;
  }
  .go {
    min-height: 56px;
    font-size: 1.05rem;
  }
  .deja {
    text-align: center;
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
  .piege {
    position: absolute;
    inset-inline-start: -10000px;
    width: 1px;
    height: 1px;
    overflow: hidden;
  }
  .porte {
    display: grid;
    gap: 8px;
  }
  .porte input {
    font: inherit;
    min-height: 48px;
    padding: 6px 10px;
    border: 2px solid var(--line);
    border-radius: 10px;
    letter-spacing: 0.06em;
  }
  .ok {
    max-width: 560px;
    margin-inline: auto;
    background: var(--primary-soft);
  }
  .lien {
    background: none;
    border: 0;
    padding: 0;
    min-height: 44px;
    color: var(--link, inherit);
    text-decoration: underline;
    font: inherit;
    cursor: pointer;
  }
  .small {
    font-size: 0.9rem;
    margin: 0;
  }
</style>
