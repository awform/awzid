<script lang="ts">
  import { draftsAllowed } from '$lib/config';
  import AvisBouton from '$lib/avis/AvisBouton.svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { chargerModule } from '$lib/charger';
  import ConnexionNecessaire from '$lib/ConnexionNecessaire.svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { activeProfile, setActiveProfile } from '$lib/attempts';
  import { getSettings } from '$lib/offline';
  import Icon from '$lib/ui/Icon.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import { loadTexts, locale, LOCALES, t } from '$lib/i18n';
  import { kvGet, kvSet } from '$lib/idb';
  import { call, fetchMe, logout, type Me } from '$lib/session';
  import { flushQueue } from '$lib/sync-core';

  /**
   * Mon compte (D2) : page SOMMAIRE en rubriques nommées (`?r=<rubrique>`, une seule page) — « Changer d'élève »
   * en tête (D1), langue (utilisable hors ligne), notifications, voix et animations, déconnexion. Les rubriques qui
   * ont besoin du réseau (mon compte, sécurité, classe et tuteur, données et suppression, abonnement) sont dans
   * `$lib/compte/CompteEnLigne.svelte`, chargé à la demande (jamais préchargé sur l'appareil de l'élève).
   * L'abonnement reste masqué du sommaire tant qu'il n'est pas ouvert (`ABONNEMENT_OUVERT` ; rubrique joignable).
   */
  let me: Me | null = $state(null);
  let msg = $state('');
  let err = $state('');
  let drafts = $state(false);
  /** le serveur autorise-t-il les langues en préparation (non relues) ? jamais en production */
  let allowDrafts = $state(false);
  const say = (m: string) => ((msg = m), (err = ''));
  const fail = (code: string | null) => ((err = t(`erreur.${code ?? 'reseau'}`)), (msg = ''));
  async function reload() {
    me = await fetchMe();
  }

  const ABONNEMENT_OUVERT = false;
  const kind = $derived((me as Me | null)?.account.kind);
  const famille = $derived(kind === 'parent' || kind === 'adulte');
  const rubriques = $derived(
    [
      { id: 'profil', icon: 'personne', ok: true },
      { id: 'securite', icon: 'cle', ok: true },
      { id: 'notifications', icon: 'cloche', ok: famille },
      { id: 'apprentissage', icon: 'livres', ok: true },
      { id: 'donnees', icon: 'bouclier', ok: true },
      { id: 'abonnement', icon: 'etoile', ok: ABONNEMENT_OUVERT && kind !== 'admin' },
    ].filter((x) => x.ok),
  );
  const rub = $derived(
    [...rubriques, { id: 'abonnement' }].find((x) => x.id === page.url.searchParams.get('r')) ??
      null,
  );

  // modules chargés à la demande selon la rubrique : notifications et rubriques en ligne (réseau nécessaire),
  // voix et animations (réglages de l'appareil) ; nouvelles tentatives, puis « Connexion nécessaire »
  type Comp = typeof import('$lib/compte/CompteEnLigne.svelte').default;
  let EnLigne = $state<Comp | null>(null);
  let Notif = $state<typeof import('$lib/NotificationsReglages.svelte').default | null>(null);
  let Reglages = $state<{
    V: typeof import('$lib/vivante/VivanteReglages.svelte').default;
    C: typeof import('$lib/conversation/ConversationReglages.svelte').default;
  } | null>(null);
  let echec = $state(false);
  function charger() {
    echec = false;
    const id = rub?.id;
    const p: Array<Promise<unknown>> = [];
    if (id && id !== 'notifications' && !EnLigne)
      p.push(
        // textes des modules en ligne : dans `fr-rares` (jamais préchargés, comme ces modules)
        Promise.all([
          chargerModule(() => import('$lib/compte/CompteEnLigne.svelte')),
          loadTexts('rares'),
        ]).then(([m]) => (EnLigne = m.default)),
      );
    if (id === 'notifications' && !Notif)
      p.push(
        Promise.all([
          chargerModule(() => import('$lib/NotificationsReglages.svelte')),
          loadTexts('rares'),
        ]).then(([m]) => (Notif = m.default)),
      );
    if (id === 'apprentissage' && !Reglages)
      p.push(
        Promise.all([
          chargerModule(() => import('$lib/vivante/VivanteReglages.svelte')),
          chargerModule(() => import('$lib/conversation/ConversationReglages.svelte')),
        ]).then(([v, c]) => (Reglages = { V: v.default, C: c.default })),
      );
    void Promise.all(p).catch(() => (echec = true));
  }
  $effect(() => {
    if (rub) charger();
  });

  /** D1 : « Changer d'élève » (comptes à plusieurs profils) en tête de « Compte », plus dans l'en-tête */
  let eleveActif = $state<string | null>(null);
  onMount(async () => {
    eleveActif = (await activeProfile().catch(() => null))?.pseudonym ?? null;
  });
  async function changerEleve() {
    const ecole = (await getSettings().catch(() => null))?.ecole;
    await setActiveProfile(null);
    await goto(resolve(ecole ? '/ecole' : '/profils'));
  }
  onMount(async () => {
    // F5 : réponse du serveur attendue ici (la mise en page ne l'attend plus)
    allowDrafts = await draftsAllowed();
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

{#snippet enLigne(id: string, m: Me)}
  {#if EnLigne}<EnLigne rub={id} me={m} {reload} {say} {fail} {out} />{:else if echec}<section
      class="card"
    >
      <ConnexionNecessaire onretry={charger} />
    </section>{:else}<Loading lines={3} />{/if}
{/snippet}

<!-- eslint-disable svelte/no-navigation-without-resolve -- liens « ?r=… » : rubriques de la même page /compte -->
{#if rub}
  <p class="retour">
    <a href={resolve('/compte')} data-testid="compte-retour">← {t('entete.compte')}</a>
  </p>
  <h1><Bidi text={t(`compte.r_${rub.id}`)} /></h1>
{:else}
  <h1>{t('entete.compte')}</h1>
{/if}
{#if msg}<p class="card ok" role="status"><Bidi text={msg} /></p>{/if}
{#if err}<p class="card bad" role="alert"><Bidi text={err} /></p>{/if}

{#if !me}
  <p class="card">
    {t('profils.connexion_requise')} <a href={resolve('/connexion')}>{t('entete.connexion')}</a>
  </p>
{:else if !rub}
  <!-- D2 : SOMMAIRE — « Changer d'élève » en tête (D1), puis les rubriques nommées -->
  {#if me.profiles.length > 1 && eleveActif}
    <section class="card changer" data-testid="changer-eleve-carte">
      <p class="muted"><Bidi text={t('compte.eleve_actif', { nom: eleveActif })} /></p>
      <button type="button" class="changer-btn" onclick={changerEleve} data-testid="changer-eleve"
        ><Icon name="famille" /><span>{t('entete.changer_eleve')}</span></button
      >
    </section>
  {/if}
  {#if me.mfaRequired && !me.mfaVerified}
    <section class="card warnbox" data-testid="mfa-requis">
      <h2>{t('compte.totp_titre')}</h2>
      <p>{t('compte.totp_obligatoire')}</p>
      <a href="?r=securite">{t('compte.r_securite')}</a>
    </section>
  {/if}
  <ul class="nav-liste" data-testid="compte-sommaire">
    {#each rubriques as x (x.id)}
      <li>
        <a href={`?r=${x.id}`} data-rubrique={x.id}
          ><span class="ic"><Icon name={x.icon} /></span><span class="nom"
            ><span><Bidi text={t(`compte.r_${x.id}`)} /></span><small
              ><Bidi text={t(`compte.d_${x.id}`)} /></small
            ></span
          ><span class="chev"><Icon name="chevron" size={20} /></span></a
        >
      </li>
    {/each}
  </ul>
  {#if me.account.kind === 'enseignant' || me.account.kind === 'admin'}
    <p>
      <a class="button primary" href={resolve('/enseignant')} data-testid="lien-enseignant"
        >{t('ens.titre')}</a
      >
    </p>
  {/if}
  {#if me.account.kind === 'admin'}
    <p><a href={resolve('/admin')} data-testid="lien-admin">{t('admin.ouvrir')}</a></p>
  {/if}
  <p>
    <button type="button" onclick={() => out(false)} data-testid="deconnexion"
      ><Icon name="fleche" size={20} />{t('compte.deconnexion')}</button
    >
  </p>
{:else if rub.id === 'profil'}
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
          ><Bidi text={l.label} /><Bidi
            text={l.status === 'preparation' ? ` (${t('compte.langue_preparation')})` : ''}
          /></button
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

  {@render enLigne(rub.id, me)}
{:else if rub.id === 'notifications'}
  {#if Notif}<Notif parent={me.account.kind === 'parent'} />{:else if echec}<section class="card">
      <ConnexionNecessaire onretry={charger} />
    </section>{/if}
{:else if rub.id === 'apprentissage'}
  {#if Reglages}<Reglages.V /><Reglages.C />{/if}
  {@render enLigne(rub.id, me)}
{:else}
  {@render enLigne(rub.id, me)}
{/if}
<!-- eslint-enable svelte/no-navigation-without-resolve -->

<!-- F5 : « Donner mon avis » (chargé à la demande, en ligne) -->
<AvisBouton />

<style>
  .retour {
    margin: 0;
  }
  .retour a {
    display: inline-flex;
    align-items: center;
    min-height: 48px;
    font-weight: 600;
  }
  .changer-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 56px;
    padding: 0 18px;
    font-weight: 700;
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
  .ok {
    background: var(--ok-bg);
  }
  .bad {
    background: var(--bad-bg);
    color: var(--bad-ink);
    font-weight: 700;
  }
</style>
