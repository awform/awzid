<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { fn } from '$lib/fonctions.svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { setActiveProfile } from '$lib/attempts';
  import { countryName } from '$lib/countries';
  import { fmtDate, setTimeZone, t } from '$lib/i18n';
  import ModeProfil from '$lib/parcours/ModeProfil.svelte';
  import { recordingAllowed, setRecordingAllowed } from '$lib/recordings';
  import { call, logout, type Me } from '$lib/session';

  /**
   * D2 — rubriques de « Compte » qui ont BESOIN DU RÉSEAU (chargées à la demande, en ligne, jamais préchargées sur
   * l'appareil de l'élève : scripts/groupes.mjs) : mon compte (adresse, fuseau, mode, profils, code parent),
   * connexion et sécurité, classe de hifẓ et tuteur, données et confidentialité (accords, export, suppression en
   * deux temps), abonnement. La page /compte garde le sommaire, « Changer d'élève », la langue et la déconnexion.
   */
  interface Consent {
    id: string;
    type: string;
    profileId: string | null;
    textVersion: string;
    givenAt: string;
    withdrawnAt: string | null;
    optional: boolean;
    /** lot F3 : facultatifs + accord « article 9 » (son retrait met en pause) */
    retirable?: boolean;
  }
  let {
    rub,
    me,
    reload,
    say,
    fail,
    out,
  }: {
    rub: string;
    me: Me;
    reload: () => Promise<void>;
    say: (m: string) => void;
    fail: (code: string | null) => void;
    out: (all?: boolean) => Promise<void>;
  } = $props();
  let consents: Consent[] = $state([]);
  let pinForm = $state({ pin: '', password: '' });
  let pwForm = $state({ current: '', next: '' });
  let delPassword = $state('');
  let delChild: { id: string; password: string } | null = $state(null);
  let totp: { secret: string; uri: string } | null = $state(null);
  /** lot F3 : changement d'adresse, fuseau, abonnements de boutique (avant la suppression) */
  let emailForm = $state({ email: '', password: '' });
  let tzSel = $state('');
  let boutiques: Array<{ boutique: string }> = $state([]);
  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zones: string[] = (() => {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      return [deviceTz];
    }
  })();
  const STORE: Record<string, string> = { apple: 'App Store', google: 'Google Play' };
  let totpCode = $state('');
  /** suppression du compte : deuxième temps (mot de passe et confirmation) */
  let suppr = $state(false);
  /** hifẓ : classes de chaque profil, code saisi, consentement, enregistrement local autorisé */
  let hifz: Record<
    string,
    {
      classes: Array<{ id: string; name: string }>;
      code: string;
      pin: string;
      consent: boolean;
      rec: boolean;
    }
  > = $state({});

  async function charge() {
    tzSel = me.account.tz ?? '';
    const r = await call<{ consents: Consent[] }>('GET', '/account/consents');
    consents = r.data?.consents ?? [];
    const sup = await call<{ abonnementsBoutique: Array<{ boutique: string }> }>(
      'GET',
      '/account/suppression',
    );
    boutiques = sup.data?.abonnementsBoutique ?? [];
    if (me.account.kind === 'parent' || me.account.kind === 'adulte') {
      const next: typeof hifz = {};
      for (const p of me.profiles) {
        const h = await call<{ classes: Array<{ id: string; name: string }> }>(
          'GET',
          `/hifz/profiles/${p.id}`,
        );
        next[p.id] = {
          classes: h.data?.classes ?? [],
          code: '',
          pin: '',
          consent: false,
          rec: await recordingAllowed(p.id),
        };
      }
      hifz = next;
    }
  }
  onMount(charge);
  /** après une modification : compte relu (page) puis rubriques */
  async function relire() {
    await reload();
    await charge();
  }

  async function joinClass(e: SubmitEvent, profileId: string) {
    e.preventDefault();
    const h = hifz[profileId]!;
    // audit SEC-3 : accord donné pour un mineur → code parent exigé par le serveur
    const r = await call<{ class: { name: string } }>(
      'POST',
      `/profiles/${profileId}/classes`,
      { code: h.code, consent: h.consent },
      h.pin ? { 'x-parent-pin': h.pin } : undefined,
    );
    if (!r.ok) return fail(r.code);
    say(t('compte.classe_ok', { nom: r.data!.class.name }));
    await relire();
  }
  async function leaveClass(profileId: string, classId: string) {
    const r = await call('DELETE', `/profiles/${profileId}/classes/${classId}`);
    if (!r.ok) return fail(r.code);
    say(t('compte.classe_quittee'));
    await relire();
  }
  async function toggleRec(profileId: string, v: boolean) {
    await setRecordingAllowed(profileId, v);
    hifz[profileId]!.rec = v;
  }
  async function savePin(e: SubmitEvent) {
    e.preventDefault();
    const r = await call('POST', '/account/pin', pinForm);
    if (r.ok) {
      say(t('compte.pin_ok'));
      pinForm = { pin: '', password: '' };
      await relire();
    } else fail(r.code);
  }
  async function changePw(e: SubmitEvent) {
    e.preventDefault();
    const r = await call('POST', '/auth/password', pwForm);
    if (r.ok) {
      say(t('compte.mdp_ok'));
      pwForm = { current: '', next: '' };
    } else fail(r.code);
  }
  async function withdraw(c: Consent) {
    if (c.type === 'donnee_religieuse_art9' && !confirm(t('compte.retirer_art9'))) return;
    const r = await call('POST', `/account/consents/${c.id}/withdraw`);
    if (r.ok) {
      say(t('compte.retrait_ok'));
      await relire();
    } else fail(r.code);
  }
  async function resend() {
    const r = await call('POST', '/auth/email/verify/resend');
    if (r.ok) say(t('compte.lien_envoye'));
    else fail(r.code);
  }
  async function changeEmail(e: SubmitEvent) {
    e.preventDefault();
    const r = await call('POST', '/account/email', emailForm);
    if (!r.ok) return fail(r.code);
    emailForm = { email: '', password: '' };
    say(t('compte.lien_envoye'));
  }
  async function saveTz() {
    const r = await call('PATCH', '/account/reglages', { tz: tzSel || null });
    if (!r.ok) return fail(r.code);
    setTimeZone(tzSel || null);
    await relire();
  }
  async function exportData() {
    const r = await fetch('/api/v1/account/export', { credentials: 'same-origin' });
    if (!r.ok) return fail('export');
    const blob = new Blob([await r.text()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'awform-mes-donnees.json';
    a.click();
    URL.revokeObjectURL(a.href);
    say(t('compte.export_ok'));
  }
  async function removeChild(e: SubmitEvent) {
    e.preventDefault();
    if (!delChild) return;
    const r = await call('DELETE', `/profiles/${delChild.id}`, { password: delChild.password });
    if (r.ok) {
      say(t('compte.profil_supprime'));
      delChild = null;
      await setActiveProfile(null);
      await relire();
    } else fail(r.code);
  }
  async function deleteAccount(e: SubmitEvent) {
    e.preventDefault();
    const r = await call<{ effacementDefinitif: string }>('POST', '/account/delete', {
      password: delPassword,
    });
    if (!r.ok) return fail(r.code);
    await logout();
    await goto(resolve('/connexion'));
  }
  async function totpSetup() {
    const r = await call<{ secret: string; uri: string }>('POST', '/auth/totp/setup');
    if (r.ok && r.data) totp = r.data;
    else fail(r.code);
  }
  async function totpConfirm(e: SubmitEvent) {
    e.preventDefault();
    const r = await call('POST', '/auth/totp/confirm', { code: totpCode });
    if (r.ok) {
      totp = null;
      say(t('compte.totp_ok'));
      await relire();
    } else fail(r.code);
  }
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- liens internes résolus -->
{#if rub === 'profil'}
  <section class="card">
    <h2>{t('compte.mon_compte')}</h2>
    <p>
      <Bidi text={t(`compte.type.${me.account.kind}`)} /> — <Bidi text={me.account.email} /> — <Bidi
        text={countryName(me.account.country ?? 'FR')}
      />
    </p>
    {#if me.account.email && me.account.kind !== 'ecole'}
      <p class="small" data-testid="email-statut">
        {#if me.account.emailVerified}{t('compte.email_verifiee')}{:else}<Bidi
            text={t('compte.email_non_verifiee')}
          />
          <button type="button" class="small" onclick={resend} data-testid="renvoyer-lien"
            >{t('compte.renvoyer_lien')}</button
          >{/if}
      </p>
    {/if}
    <p class="muted small" data-testid="cree-le">
      <Bidi
        text={t('compte.cree_le', {
          date: fmtDate(me.account.createdAt, { dateStyle: 'long', timeStyle: 'short' }),
        })}
      />
    </p>
    <p class="muted small">{t('compte.donnees_ue')}</p>
    <label for="tz">{t('compte.fuseau')}</label>
    <select id="tz" bind:value={tzSel} onchange={saveTz} data-testid="fuseau">
      <option value="">{t('compte.fuseau_appareil', { tz: deviceTz })}</option>
      {#each zones as z (z)}<option value={z}>{z}</option>{/each}
    </select>
    <p class="muted small">{t('compte.fuseau_aide')}</p>
  </section>

  {#if me.account.kind === 'adulte' && me.profiles[0]}
    <!-- A39 : « Avec vérification » ou « Mode serein », choisi par l'adulte lui-même -->
    <section class="card">
      <ModeProfil pid={me.profiles[0].id} />
      {#if fn('certificats')}<p>
          <a href={resolve('/certificats')} data-testid="lien-certificats">{t('cert.titre')}</a>
        </p>{/if}
    </section>
  {/if}

  {#if me.account.kind === 'parent'}
    <section class="card">
      <h2>{t('compte.profils')}</h2>
      <ul>
        {#each me.profiles as p (p.id)}
          <li>
            <Bidi text={p.pseudonym} /> (<Bidi text={p.birthYear} />)
            <button
              type="button"
              class="small"
              onclick={() => (delChild = { id: p.id, password: '' })}
              >{t('commun.supprimer')}</button
            >
          </li>
        {/each}
      </ul>
      <p><a href={resolve('/profils')}>{t('profils.ajouter')}</a></p>
      {#if delChild}
        <form class="form" onsubmit={removeChild}>
          <p>{t('compte.supprimer_profil_confirmer')}</p>
          <label for="delchild">{t('champ.mot_de_passe')}</label>
          <input id="delchild" type="password" required bind:value={delChild.password} />
          <div class="row">
            <button type="submit" class="danger">{t('commun.supprimer')}</button>
            <button type="button" onclick={() => (delChild = null)}>{t('commun.annuler')}</button>
          </div>
        </form>
      {/if}
    </section>
  {/if}

  {#if me.account.kind !== 'admin'}
    <section class="card">
      <h2>{t('compte.code_parent')}</h2>
      <p class="muted small">
        <Bidi text={me.account.hasPin ? t('compte.pin_defini') : t('compte.pin_aide')} />
      </p>
      <form class="form" onsubmit={savePin}>
        <label for="pin">{t('compte.nouveau_code')}</label>
        <input
          id="pin"
          inputmode="numeric"
          pattern={'[0-9]{4}'}
          maxlength="4"
          required
          bind:value={pinForm.pin}
        />
        <label for="pinpw">{t('champ.mot_de_passe')}</label>
        <input
          id="pinpw"
          type="password"
          autocomplete="current-password"
          required
          bind:value={pinForm.password}
        />
        <button type="submit" class="primary">{t('commun.enregistrer')}</button>
      </form>
    </section>
  {/if}
{:else if rub === 'securite'}
  <section class="card">
    {#if me.account.email}
      <h2>{t('compte.email_titre')}</h2>
      <p class="muted small">{t('compte.email_aide')}</p>
      <form class="form" onsubmit={changeEmail} data-testid="changer-email">
        <label for="newmail">{t('compte.email_nouvelle')}</label>
        <input
          id="newmail"
          type="email"
          autocomplete="email"
          required
          bind:value={emailForm.email}
        />
        <label for="mailpw">{t('champ.mot_de_passe')}</label>
        <input
          id="mailpw"
          type="password"
          autocomplete="current-password"
          required
          bind:value={emailForm.password}
        />
        <button type="submit">{t('compte.email_bouton')}</button>
      </form>
    {/if}
  </section>
  <section class="card">
    <h2>{t('compte.securite')}</h2>
    <form class="form" onsubmit={changePw}>
      <label for="cur">{t('compte.mdp_actuel')}</label>
      <input
        id="cur"
        type="password"
        autocomplete="current-password"
        required
        bind:value={pwForm.current}
      />
      <label for="next">{t('compte.mdp_nouveau')}</label>
      <input
        id="next"
        type="password"
        autocomplete="new-password"
        minlength="12"
        required
        bind:value={pwForm.next}
      />
      <button type="submit">{t('compte.changer_mdp')}</button>
    </form>
    {#if me.mfaRequired}
      <h3>{t('compte.totp_titre')}</h3>
      {#if me.account.totpEnabled && me.mfaVerified}<p data-testid="totp-actif">
          {t('compte.totp_actif')}
        </p>
      {:else if !totp}<button
          type="button"
          class="primary"
          onclick={totpSetup}
          data-testid="totp-configurer">{t('compte.totp_configurer')}</button
        >
      {:else}
        <p>{t('compte.totp_instructions')}</p>
        <p class="secret"><code data-testid="totp-secret"><Bidi text={totp.secret} /></code></p>
        <p class="muted small break"><Bidi text={totp.uri} /></p>
        <form class="form" onsubmit={totpConfirm}>
          <label for="code">{t('champ.code_totp')}</label>
          <input
            id="code"
            inputmode="numeric"
            pattern={'[0-9]{6}'}
            maxlength="6"
            required
            bind:value={totpCode}
          />
          <button type="submit" class="primary">{t('commun.valider')}</button>
        </form>
      {/if}
    {/if}
    <div class="row">
      <button type="button" onclick={() => out(true)} data-testid="deconnexion-partout"
        >{t('compte.deconnexion_partout')}</button
      >
    </div>
  </section>
{:else if rub === 'apprentissage'}
  {#if me.account.kind === 'parent' || me.account.kind === 'adulte'}
    <section class="card">
      <h2>{t('compte.tuteur_titre')}</h2>
      <p class="muted small">{t('compte.tuteur_aide')}</p>
      {#if fn('tuteur')}<p>
          <a href={resolve('/compte/tuteur')} data-testid="lien-tuteur">{t('compte.tuteur_lien')}</a
          >
        </p>{/if}
      <p><a href={resolve('/suivi')} data-testid="lien-objectifs">{t('onglets.suivi')}</a></p>
      <p><a href={resolve('/messages')} data-testid="lien-messages">{t('msg.titre')}</a></p>
      <p><a href={resolve('/sourates')} data-testid="lien-sourates">{t('sour.titre')}</a></p>
      {#if me.account.kind === 'adulte'}<p>
          <a href={resolve('/carnet')} data-testid="lien-carnet">{t('carnetp.titre')}</a>
        </p>{/if}
      <p><a href={resolve('/recital')} data-testid="lien-recital">{t('rec.titre')}</a></p>
      {#if me.account.kind === 'parent'}<p>
          <a href={resolve('/compte/protections')} data-testid="lien-protections"
            >{t('prot.titre')}</a
          >
        </p>{/if}
      <p><a href={resolve('/garanties')}>{t('gar.titre')}</a></p>
    </section>

    <section class="card" data-testid="hifz-compte">
      <h2>{t('compte.hifz_titre')}</h2>
      <p class="muted small">{t('compte.hifz_aide')}</p>
      {#each me.profiles as p (p.id)}
        {@const h = hifz[p.id]}
        {#if h}
          <div class="hp">
            <h3><Bidi text={p.pseudonym} /></h3>
            {#each h.classes as c (c.id)}
              <p>
                <Bidi text={t('compte.classe_de', { nom: c.name })} />
                <button type="button" class="small" onclick={() => leaveClass(p.id, c.id)}
                  >{t('compte.quitter_classe')}</button
                >
              </p>
            {/each}
            <form class="form" onsubmit={(e) => joinClass(e, p.id)}>
              <label for="code-{p.id}">{t('compte.code_classe')}</label>
              <input
                id="code-{p.id}"
                autocomplete="off"
                maxlength="12"
                bind:value={h.code}
                data-testid="code-classe"
              />
              <label class="check"
                ><input
                  type="checkbox"
                  bind:checked={h.consent}
                  required
                  data-testid="consent-partage"
                />
                <span>{t('compte.consent_partage')}</span></label
              >
              {#if p.kind !== 'adulte'}
                <label
                  >{t('libre.code_parent')}
                  <input
                    type="password"
                    inputmode="numeric"
                    autocomplete="off"
                    maxlength="8"
                    bind:value={h.pin}
                    data-testid="pin-classe"
                  /></label
                >
              {/if}
              <button type="submit">{t('compte.rejoindre')}</button>
            </form>
            {#if p.kind !== 'adulte'}
              <label class="check"
                ><input
                  type="checkbox"
                  checked={h.rec}
                  onchange={(e) => toggleRec(p.id, e.currentTarget.checked)}
                  data-testid="enreg-autorise"
                />
                <span>{t('compte.enreg_autorise')}</span></label
              >
            {/if}
          </div>
        {/if}
      {/each}
    </section>
  {/if}
{:else if rub === 'abonnement'}
  <section class="card" data-testid="abonnement-compte">
    <p class="muted small">{t('compte.abo_aide')}</p>
    <p>
      <a href={resolve('/abonnement')} data-testid="lien-abonnement">{t('compte.abo_lien')}</a> ·
      <a href={resolve('/offres')} data-testid="lien-offres">{t('compte.offres_lien')}</a>
    </p>
  </section>
{:else if rub === 'donnees'}
  <section class="card">
    <h2>{t('compte.consentements')}</h2>
    <ul class="consents" data-testid="consentements">
      {#each consents as c (c.id)}
        <li>
          <strong><Bidi text={t(`consent.nom.${c.type}`)} /></strong>
          <span class="muted small">
            — <Bidi
              text={t('compte.donne_le', {
                date: fmtDate(c.givenAt, { dateStyle: 'medium' }),
                version: c.textVersion,
              })}
            />
            {#if c.withdrawnAt}— <Bidi
                text={t('compte.retire_le', {
                  date: fmtDate(c.withdrawnAt, { dateStyle: 'medium' }),
                })}
              />{/if}
          </span>
          {#if (c.retirable ?? c.optional) && !c.withdrawnAt}<button
              type="button"
              class="small"
              onclick={() => withdraw(c)}>{t('compte.retirer')}</button
            >{/if}
        </li>
      {/each}
    </ul>
    <p class="muted small">{t('compte.consentements_aide')}</p>
  </section>

  <section class="card">
    <h2>{t('compte.mes_donnees')}</h2>
    <p>{t('compte.export_aide')}</p>
    <button type="button" onclick={exportData} data-testid="exporter">{t('compte.exporter')}</button
    >
  </section>

  <!-- D2 : suppression ISOLÉE tout en bas, confirmation en deux temps (jamais à côté d'une action courante) -->
  <section class="card zone-sensible" data-testid="zone-suppression">
    <h2>{t('compte.supprimer_titre')}</h2>
    <p>{t('compte.supprimer_aide')}</p>
    <!-- lot F3 (revue F8) : la suppression du compte n'arrête pas un abonnement pris dans une boutique -->
    {#each boutiques as b, i (i)}
      <p class="warnbox" role="alert" data-testid="boutique-actif">
        <Bidi text={t('compte.boutique_actif', { boutique: STORE[b.boutique] ?? b.boutique })} />
      </p>
    {/each}
    <p class="muted small"><Bidi text={t('compte.boutique_rappel')} /></p>
    {#if !suppr}
      <button type="button" onclick={() => (suppr = true)} data-testid="supprimer-etape1"
        >{t('compte.supprimer_bouton')}</button
      >
    {:else}
      <form class="form" onsubmit={deleteAccount}>
        <p><strong>{t('compte.supprimer_etape2')}</strong></p>
        <label for="delpw">{t('champ.mot_de_passe')}</label>
        <input
          id="delpw"
          type="password"
          autocomplete="current-password"
          required
          bind:value={delPassword}
        />
        <div class="row">
          <button type="submit" class="danger" data-testid="supprimer-compte"
            >{t('compte.supprimer_definitif')}</button
          >
          <button type="button" onclick={() => ((suppr = false), (delPassword = ''))}
            >{t('commun.annuler')}</button
          >
        </div>
      </form>
    {/if}
  </section>
{/if}

<!-- eslint-enable svelte/no-navigation-without-resolve -->
<style>
  /* zone sensible : séparée du reste, jamais à côté d'une action courante */
  .zone-sensible {
    margin-top: var(--space-xl);
    border-color: var(--bad-ink);
    border-radius: 16px;
  }
  .form {
    display: grid;
    gap: 6px;
    max-width: 460px;
    margin: 8px 0;
  }
  .form input:not([type='checkbox']) {
    font: inherit;
    min-height: 44px;
    padding: 6px 10px;
    border: 2px solid var(--line);
    border-radius: 10px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 8px 0;
  }
  .check {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-top: 8px;
  }
  .hp {
    border-top: 1px solid var(--line);
    padding-top: 8px;
  }
  .consents li {
    margin: 6px 0;
  }
  .small {
    font-size: 0.88rem;
  }
  button.small {
    min-height: 44px; /* audit A11Y-1 */
    padding: 2px 10px;
  }
  button.danger {
    background: var(--bad-ink);
    border-color: var(--bad-ink);
    color: var(--bad-bg);
    font-weight: 700;
  }
  .warnbox {
    background: var(--warn-bg);
  }
  .secret code {
    font-size: 1.1rem;
    letter-spacing: 0.1em;
    word-break: break-all;
  }
  .break {
    word-break: break-all;
  }
</style>
