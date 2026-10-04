<script lang="ts">
  import { onMount } from 'svelte';
  import NotificationsReglages from '$lib/NotificationsReglages.svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { setActiveProfile } from '$lib/attempts';
  import { countryName } from '$lib/countries';
  import { fmtDate, locale, LOCALES, t } from '$lib/i18n';
  import { kvGet, kvSet } from '$lib/idb';
  import { call, fetchMe, logout, type Me } from '$lib/session';
  import { recordingAllowed, setRecordingAllowed } from '$lib/recordings';
  import { flushQueue } from '$lib/sync-core';

  /**
   * Mon compte : langue, code parent, profils, consentements (retrait des facultatifs), export de mes
   * données (RGPD art. 15 et 20), mot de passe, second facteur (enseignants), déconnexion, suppression.
   */
  interface Consent {
    id: string;
    type: string;
    profileId: string | null;
    textVersion: string;
    givenAt: string;
    withdrawnAt: string | null;
    optional: boolean;
  }
  let me: Me | null = $state(null);
  let consents: Consent[] = $state([]);
  let msg = $state('');
  let err = $state('');
  let drafts = $state(false);
  /** le serveur autorise-t-il les langues en préparation (non relues) ? jamais en production */
  let allowDrafts = $state(false);
  let pinForm = $state({ pin: '', password: '' });
  let pwForm = $state({ current: '', next: '' });
  let delPassword = $state('');
  let delChild: { id: string; password: string } | null = $state(null);
  let totp: { secret: string; uri: string } | null = $state(null);
  let totpCode = $state('');
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

  const say = (m: string) => ((msg = m), (err = ''));
  const fail = (code: string | null) => ((err = t(`erreur.${code ?? 'reseau'}`)), (msg = ''));

  async function reload() {
    me = await fetchMe();
    if (!me) return;
    const r = await call<{ consents: Consent[] }>('GET', '/account/consents');
    consents = r.data?.consents ?? [];
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
    await reload();
  }
  async function leaveClass(profileId: string, classId: string) {
    const r = await call('DELETE', `/profiles/${profileId}/classes/${classId}`);
    if (!r.ok) return fail(r.code);
    say(t('compte.classe_quittee'));
    await reload();
  }
  async function toggleRec(profileId: string, v: boolean) {
    await setRecordingAllowed(profileId, v);
    hifz[profileId]!.rec = v;
  }
  onMount(async () => {
    allowDrafts = ((await kvGet<boolean>('draftsAllowed').catch(() => false)) ?? false) === true;
    drafts = allowDrafts && ((await kvGet<boolean>('draftLocales').catch(() => false)) ?? false);
    await reload();
  });

  async function setLang(code: string) {
    await kvSet('locale', code);
    location.reload();
  }
  async function toggleDrafts(v: boolean) {
    drafts = v;
    await kvSet('draftLocales', v);
  }
  async function savePin(e: SubmitEvent) {
    e.preventDefault();
    const r = await call('POST', '/account/pin', pinForm);
    if (r.ok) {
      say(t('compte.pin_ok'));
      pinForm = { pin: '', password: '' };
      await reload();
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
    const r = await call('POST', `/account/consents/${c.id}/withdraw`);
    if (r.ok) {
      say(t('compte.retrait_ok'));
      await reload();
    } else fail(r.code);
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
      await reload();
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
      await reload();
    } else fail(r.code);
  }
  async function out(all = false) {
    // appareil partagé (audit OFF-3) : envoi tenté d'abord, puis avertissement s'il reste des réponses
    const f = await flushQueue().catch(() => null);
    const n = f?.remaining ?? 0;
    if (n > 0 && !confirm(t('compte.deconnexion_file', { n }))) return;
    if (all) await call('POST', '/auth/logout-all');
    await logout();
    await goto(resolve('/connexion'));
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('entete.compte')}</title></svelte:head>

<h1>{t('entete.compte')}</h1>
{#if msg}<p class="card ok" role="status">{msg}</p>{/if}
{#if err}<p class="card bad" role="alert">{err}</p>{/if}

{#if !me}
  <p class="card">
    {t('profils.connexion_requise')} <a href={resolve('/connexion')}>{t('entete.connexion')}</a>
  </p>
{:else}
  {#if me.mfaRequired && !me.mfaVerified}
    <section class="card warnbox" data-testid="mfa-requis">
      <h2>{t('compte.totp_titre')}</h2>
      <p>{t('compte.totp_obligatoire')}</p>
    </section>
  {/if}

  <section class="card">
    <h2>{t('compte.mon_compte')}</h2>
    <p>
      {t(`compte.type.${me.account.kind}`)} — {me.account.email} — {countryName(
        me.account.country ?? 'FR',
      )}
    </p>
    <p class="muted small">
      {t('compte.cree_le', { date: fmtDate(me.account.createdAt, { dateStyle: 'long' }) })}
    </p>
    {#if me.account.kind === 'enseignant' || me.account.kind === 'admin'}
      <p>
        <a class="button primary" href={resolve('/enseignant')} data-testid="lien-enseignant"
          >{t('ens.titre')}</a
        >
      </p>
    {/if}
  </section>

  {#if me.account.kind === 'parent' || me.account.kind === 'adulte'}
    <NotificationsReglages parent={me.account.kind === 'parent'} />
  {/if}

  <section class="card">
    <h2>{t('compte.langue')}</h2>
    <div class="row">
      {#each LOCALES.filter((l) => l.status === 'relue' || drafts) as l (l.code)}
        <button
          type="button"
          class:primary={locale() === l.code}
          lang={l.code}
          onclick={() => setLang(l.code)}
          data-locale={l.code}
          >{l.label}{l.status === 'preparation'
            ? ` (${t('compte.langue_preparation')})`
            : ''}</button
        >
      {/each}
    </div>
    {#if allowDrafts}
      <label class="check"
        ><input
          type="checkbox"
          checked={drafts}
          onchange={(e) => toggleDrafts(e.currentTarget.checked)}
          data-testid="langues-preparation"
        />
        <span>{t('compte.langues_preparation')}</span></label
      >
    {/if}
  </section>

  {#if me.account.kind === 'parent'}
    <section class="card">
      <h2>{t('compte.profils')}</h2>
      <ul>
        {#each me.profiles as p (p.id)}
          <li>
            {p.pseudonym} ({p.birthYear})
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

  {#if me.account.kind === 'parent' || me.account.kind === 'adulte'}
    <section class="card" data-testid="hifz-compte">
      <h2>{t('compte.hifz_titre')}</h2>
      <p class="muted small">{t('compte.hifz_aide')}</p>
      {#each me.profiles as p (p.id)}
        {@const h = hifz[p.id]}
        {#if h}
          <div class="hp">
            <h3>{p.pseudonym}</h3>
            {#each h.classes as c (c.id)}
              <p>
                {t('compte.classe_de', { nom: c.name })}
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

  {#if me.account.kind === 'admin'}
    <section class="card">
      <h2>{t('admin.titre')}</h2>
      <p><a href={resolve('/admin')} data-testid="lien-admin">{t('admin.ouvrir')}</a></p>
    </section>
  {/if}

  {#if me.account.kind !== 'admin'}
    <section class="card" data-testid="abonnement-compte">
      <h2>{t('compte.abo_titre')}</h2>
      <p class="muted small">{t('compte.abo_aide')}</p>
      <p>
        <a href={resolve('/abonnement')} data-testid="lien-abonnement">{t('compte.abo_lien')}</a> ·
        <a href={resolve('/offres')} data-testid="lien-offres">{t('compte.offres_lien')}</a>
      </p>
    </section>
  {/if}

  {#if me.account.kind === 'parent' || me.account.kind === 'adulte'}
    <section class="card">
      <h2>{t('compte.tuteur_titre')}</h2>
      <p class="muted small">{t('compte.tuteur_aide')}</p>
      <p>
        <a href={resolve('/compte/tuteur')} data-testid="lien-tuteur">{t('compte.tuteur_lien')}</a>
      </p>
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
  {/if}

  {#if me.account.kind !== 'admin'}
    <section class="card">
      <h2>{t('compte.code_parent')}</h2>
      <p class="muted small">{me.account.hasPin ? t('compte.pin_defini') : t('compte.pin_aide')}</p>
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

  <section class="card">
    <h2>{t('compte.consentements')}</h2>
    <ul class="consents" data-testid="consentements">
      {#each consents as c (c.id)}
        <li>
          <strong>{t(`consent.nom.${c.type}`)}</strong>
          <span class="muted small">
            — {t('compte.donne_le', {
              date: fmtDate(c.givenAt, { dateStyle: 'medium' }),
              version: c.textVersion,
            })}
            {#if c.withdrawnAt}— {t('compte.retire_le', {
                date: fmtDate(c.withdrawnAt, { dateStyle: 'medium' }),
              })}{/if}
          </span>
          {#if c.optional && !c.withdrawnAt}<button
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
        <p class="secret"><code data-testid="totp-secret">{totp.secret}</code></p>
        <p class="muted small break">{totp.uri}</p>
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
      <button type="button" onclick={() => out(false)} data-testid="deconnexion"
        >{t('compte.deconnexion')}</button
      >
      <button type="button" onclick={() => out(true)}>{t('compte.deconnexion_partout')}</button>
    </div>
  </section>

  <section class="card">
    <h2>{t('compte.supprimer_titre')}</h2>
    <p>{t('compte.supprimer_aide')}</p>
    <form class="form" onsubmit={deleteAccount}>
      <label for="delpw">{t('champ.mot_de_passe')}</label>
      <input
        id="delpw"
        type="password"
        autocomplete="current-password"
        required
        bind:value={delPassword}
      />
      <button type="submit" class="danger" data-testid="supprimer-compte"
        >{t('compte.supprimer_bouton')}</button
      >
    </form>
  </section>
{/if}

<style>
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
  .ok {
    background: var(--ok-bg);
  }
  .bad {
    background: var(--bad-bg);
    color: var(--bad-ink);
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
