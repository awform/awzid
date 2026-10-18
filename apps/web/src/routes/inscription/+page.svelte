<script lang="ts">
  import { fn } from '$lib/fonctions.svelte';
  import Bidi from '$lib/Bidi.svelte';
  import Brand from '$lib/ui/Brand.svelte';
  import type { ForceMotDePasse } from '@awform/school/mot-de-passe';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { setActiveProfile } from '$lib/attempts';
  import { COUNTRIES, countryName, needsTransferConsent } from '$lib/countries';
  import { locale, t } from '$lib/i18n';
  import { call, fetchMe, type Me } from '$lib/session';
  import { onMount, tick } from 'svelte';
  import { chargerStatut, type AccesStatut } from '$lib/acces';
  import ListeAttente from './ListeAttente.svelte';
  import { retenirSource } from '$lib/provenance';

  /**
   * Inscription d'un PARENT (il créera ensuite les profils de ses enfants, sans e-mail) ou d'un ADULTE
   * autonome. Consentements séparés, jamais cochés d'avance ; données hébergées dans l'Union européenne.
   *
   * Refonte du 16/10/2026 (page d'entrée publique : vouvoiement, charte de la page d'accueil) : deux colonnes sur
   * ordinateur (panneau vert de la marque + carte du formulaire), une seule sur téléphone (panneau réduit à un
   * en-tête). Le formulaire est en TROIS ÉTAPES — (1) identifiants, (2) profil, (3) accords — dans un seul <form> :
   * les étapes non affichées sont cachées (`hidden`), jamais retirées, donc rien n'est perdu en revenant (ni la
   * confirmation du mot de passe, gardée par son composant). Chaque étape est validée avant la suivante (message
   * sous le champ, résumé annoncé, focus sur le premier champ à corriger) ; le changement d'étape est annoncé
   * (aria-live) et le focus va sur le titre de l'étape. L'envoi final est INCHANGÉ : même appel, mêmes données,
   * mêmes accords, même anti-robots ; une erreur du serveur ramène à l'étape du champ concerné.
   */
  /*
   * 18/10/2026 — trois façons d'entrer à l'étape 1, dans cet ordre, chacune derrière son interrupteur (statut public) :
   * « Continuer avec Google », « Avec mon numéro WhatsApp » (vérification inversée, codes de récupération montrés
   * après la création), « Avec mon adresse e-mail » (formulaire ci-dessous, toujours offert). Les écrans propres au
   * numéro et à Google sont chargés À LA DEMANDE ($lib/identites). Inscription ASSISTÉE : une invitation préparée par
   * un administrateur fixe le type de compte, le pays et le numéro ; la personne choisit Google ou un mot de passe.
   */
  type Mode = 'email' | 'telephone' | 'google';
  let mode = $state<Mode>('email');
  let verifTel = $state<{ id: string; jeton: string; e164: string } | null>(null);
  let googleIdent = $state<{ email: string; nom: string | null } | null>(null);
  let assistee = $state<{
    kind: 'parent' | 'adulte';
    pays: string | null;
    numero: string | null;
  } | null>(null);
  let codesSecours = $state<string[] | null>(null);
  let messageGoogle = $state('');
  const CLE_CODE = 'awzid.inscription.code';
  type Etape = 1 | 2 | 3;
  let etape = $state<Etape>(1);
  /** texte annoncé par la région aria-live au changement d'étape */
  let annonce = $state('');
  /** erreurs de l'étape affichée, par identifiant de champ */
  let erreurs = $state<Record<string, string>>({});
  const nbErreurs = $derived(Object.keys(erreurs).length);

  let kind: 'parent' | 'adulte' = $state('parent');
  let email = $state('');
  let password = $state('');
  /** lot 11 : mot de passe et confirmation identiques */
  let mdpIdentiques = $state(true);
  /** verdict de la règle du mot de passe (donné par le champ : même fonction que le serveur) */
  let niveauMdp = $state<ForceMotDePasse | undefined>(undefined);
  // lot 11 : champ du nouveau mot de passe chargé À LA DEMANDE (partagé par 3 pages rares : statique, il irait dans le
  // morceau commun préchargé sur l'appareil de l'élève)
  const champMdp = import('$lib/compte/ChampMotDePasse.svelte');
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
    const r = await call<{
      valide: boolean;
      personnelle: boolean;
      assistee?: { kind: 'parent' | 'adulte'; pays: string | null; numero: string | null };
    }>('POST', '/acces/invitation', {
      code: code.trim(),
    });
    codeBusy = false;
    codeOk = r.ok && r.data?.valide === true;
    codePerso = codeOk && r.data?.personnelle === true;
    if (!codeOk) codeErreur = t(`erreur.${r.code ?? 'reseau'}`);
    // inscription assistée : type et pays préparés (non modifiables), numéro repris sur le compte
    assistee = codeOk ? (r.data?.assistee ?? null) : null;
    if (assistee) {
      kind = assistee.kind;
      if (assistee.pays) country = assistee.pays;
    }
  }
  /** avant de partir chez Google : le code d'invitation est gardé pour le retour (onglet seulement) */
  function avantGoogle() {
    try {
      if (codeOk) sessionStorage.setItem(CLE_CODE, code.trim());
    } catch {
      /* sans stockage : le code sera redemandé */
    }
  }
  /** retour de Google : identité vérifiée en attente (cookie chiffré côté serveur) */
  async function retourGoogle(params: URLSearchParams) {
    const g = params.get('google');
    if (!g) return;
    history.replaceState(null, '', location.pathname + location.hash);
    if (g !== '1') {
      messageGoogle = t(`id.google_${g}`);
      return;
    }
    const r = await call<{ email: string; nom: string | null }>('GET', '/auth/google/inscription');
    if (r.ok && r.data) {
      googleIdent = r.data;
      mode = 'google';
    } else messageGoogle = t('id.google_expire');
    try {
      const c = sessionStorage.getItem(CLE_CODE);
      sessionStorage.removeItem(CLE_CODE);
      if (c && !code) {
        code = c;
        await verifierCode();
      }
    } catch {
      /* rien */
    }
  }
  async function annulerGoogle() {
    await call('DELETE', '/auth/google/inscription');
    googleIdent = null;
    mode = 'email';
  }
  /** provenance (?src= des affiches, retenue pour la session de l'onglet) envoyée avec l'inscription */
  let source: string | null = null;
  onMount(async () => {
    source = retenirSource(new URLSearchParams(location.search));
    acces = await chargerStatut();
    if (acces?.google) await retourGoogle(new URLSearchParams(location.search));
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

  /** champs de chaque étape, dans l'ordre de l'écran (focus sur le premier à corriger) */
  const CHAMPS: Record<Etape, string[]> = {
    1: ['email', 'telephone', 'password', 'password-confirmer'],
    2: ['region', 'birthYear'],
    3: ['cgu', 'art9', 'transfert'],
  };
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function valider(n: Etape): Record<string, string> {
    const e: Record<string, string> = {};
    if (n === 1 && (mode === 'google' || mode === 'telephone' || assistee?.numero)) {
      // Google : mot de passe facultatif ; numéro : vérification réussie exigée (sauf numéro préparé)
      if (mode === 'telephone' && !verifTel) e.telephone = t('id.err_verifier');
      if (mode !== 'google' && !password) e.password = t('ins.err_mdp_vide');
      else if (password && niveauMdp === 'refuse') e.password = t('ins.err_mdp');
      else if (password && !mdpIdentiques) e['password-confirmer'] = t('ins.err_confirmer');
    } else if (n === 1) {
      const m = email.trim();
      if (!m) e.email = t('ins.err_email_vide');
      else if (!EMAIL.test(m)) e.email = t('ins.err_email');
      if (!password) e.password = t('ins.err_mdp_vide');
      else if (niveauMdp === 'refuse') e.password = t('ins.err_mdp');
      else if (!mdpIdentiques) e['password-confirmer'] = t('ins.err_confirmer');
    } else if (n === 2) {
      const an = Number(birthYear);
      if (!birthYear || !Number.isInteger(an) || an < 1900 || an > new Date().getFullYear())
        e.birthYear = t('ins.err_annee');
      if (current?.regions?.length && !region) e.region = t('ins.err_region');
    } else {
      if (!cgu) e.cgu = t('ins.err_accord');
      if (!art9) e.art9 = t('ins.err_accord');
      if (transferNeeded && !transfert) e.transfert = t('ins.err_accord');
    }
    return e;
  }
  /** le champ est corrigé : son message disparaît */
  function effacer(id: string) {
    if (erreurs[id] === undefined) return;
    const reste = { ...erreurs };
    delete reste[id];
    erreurs = reste;
  }
  // mot de passe ou confirmation retouchés : leurs messages disparaissent (la règle est revue au « Continuer »)
  let mdpVu = '';
  $effect(() => {
    if (password !== mdpVu) {
      mdpVu = password;
      effacer('password');
      effacer('password-confirmer');
    }
    if (mdpIdentiques) effacer('password-confirmer');
  });
  /** attributs d'accessibilité d'un champ validé */
  const invalide = (id: string) => (erreurs[id] ? true : undefined);
  const decrit = (id: string, aide = '') =>
    [erreurs[id] ? `${id}-erreur` : '', aide].filter(Boolean).join(' ') || undefined;

  async function aller(n: Etape) {
    etape = n;
    erreurs = {};
    error = '';
    annonce = t('ins.annonce', { n, titre: t(`ins.e${n}`) });
    await tick();
    document.getElementById(`etape-${n}-t`)?.focus();
  }
  async function avancer(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    const trouvees = valider(etape);
    erreurs = trouvees;
    error = '';
    if (Object.keys(trouvees).length) {
      await tick();
      const id = CHAMPS[etape].find((c) => trouvees[c]);
      if (id) document.getElementById(id)?.focus();
      return;
    }
    if (etape < 3) await aller((etape + 1) as Etape);
    else await envoyer();
  }

  /** refus du serveur → étape du champ concerné (les autres restent sur les accords) */
  const ETAPE_DU_REFUS: Record<string, Etape> = {
    email_indisponible: 1,
    telephone_indisponible: 1,
    verification_invalide: 1,
    google_expire: 1,
    identifiant_requis: 1,
    mot_de_passe_requis: 1,
    google_majeur_requis: 2,
    invitation_autre_adresse: 1,
    pays_inconnu: 2,
    annee_naissance_requise: 2,
    majorite_requise: 2,
    region_inconnue: 2,
    ferme_moins_13: 2,
    age_parent_requis: 2,
  };
  /** messages du serveur écrits au « tu » dans l'application : leur version au « vous » pour cette page publique */
  const VOUS = new Set([
    'email_indisponible',
    'age_parent_requis',
    'annee_naissance_requise',
    'consentement_requis',
    'mot_de_passe_trop_simple',
    'mot_de_passe_trop_courant',
    'mot_de_passe_contient_email',
    'reseau',
    'trop_de_demandes',
    // 18/10/2026 : numéro WhatsApp et Google
    'telephone_indisponible',
    'verification_invalide',
    'google_expire',
    'google_majeur_requis',
    'identifiant_requis',
    'mot_de_passe_requis',
    'telephone_inactif',
  ]);

  async function envoyer() {
    busy = true;
    error = '';
    const consents = [
      cgu && 'cgu',
      art9 && 'donnee_religieuse_art9',
      transferNeeded && transfert && 'transfert_hors_pays',
      rappels && 'rappels',
    ].filter(Boolean) as string[];
    const r = await call<Me & { codesSecours?: string[] }>('POST', '/auth/signup', {
      kind,
      ...(mode === 'google' && googleIdent
        ? { google: true }
        : mode === 'telephone' && verifTel
          ? { defi: { id: verifTel.id, jeton: verifTel.jeton } }
          : assistee?.numero
            ? {}
            : { email }),
      ...(password ? { password } : {}),
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
      ...(source ? { src: source } : {}),
    });
    busy = false;
    if (!r.ok) {
      const c = r.code ?? 'reseau';
      const message = t(VOUS.has(c) ? `ins.erreur.${c}` : `erreur.${c}`, {
        age: (r.error?.age as number) ?? 15,
      });
      const cible = c.startsWith('mot_de_passe_') ? 1 : (ETAPE_DU_REFUS[c] ?? 3);
      if (cible !== etape) await aller(cible);
      error = message;
      // plafond atteint pendant la saisie : on passe à la liste d'attente ; jeton trop récent : nouveau jeton
      if (r.code === 'plafond_atteint') acces = await chargerStatut(true);
      if (r.code === 'antibot_echec' && acces?.antibot === 'on') {
        const j = await call<{ jeton: string }>('GET', '/acces/jeton');
        jeton = j.ok && j.data ? j.data.jeton : '';
      }
      return;
    }
    // numéro : codes de récupération montrés UNE fois avant d'entrer dans l'application
    if (r.data?.codesSecours?.length) {
      codesSecours = r.data.codesSecours;
      await tick();
      document.getElementById('codes-titre')?.focus();
      return;
    }
    await entrer();
  }
  async function entrer() {
    const me = await fetchMe();
    if (me?.profiles.length === 1) await setActiveProfile(me.profiles[0] ?? null);
    // adresse e-mail à vérifier avant d'utiliser le compte (un compte par numéro ou Google est déjà vérifié)
    if (acces?.verification === 'requise' && me?.account.emailVerified === false)
      await goto(resolve('/acces/verification'));
    else await goto(resolve(kind === 'parent' ? '/profils' : '/'));
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('inscription.titre')}</title></svelte:head>

{#snippet coche()}
  <svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"
    ><path d="m5 12.5 4.5 4.5L19 7.5" /></svg
  >
{/snippet}
{#snippet erreurDe(id: string)}
  {#if erreurs[id]}<p id="{id}-erreur" class="champ-erreur" data-testid="erreur-{id}">
      <Bidi text={erreurs[id]} />
    </p>{/if}
{/snippet}

<div class="inscription">
  <!-- panneau de la marque : symbole officiel (fichier de la marque, non redessiné) sur disque crème, promesse,
       trois garanties ; réduit à un en-tête sur téléphone -->
  <aside class="panneau" data-testid="inscription-marque">
    <svg class="motif" aria-hidden="true" focusable="false"
      ><defs
        ><pattern id="ins-motif" width="44" height="44" patternUnits="userSpaceOnUse"
          ><g fill="none" stroke="#FFFFFF" stroke-opacity=".1"
            ><rect x="14" y="14" width="16" height="16" /><rect
              x="14"
              y="14"
              width="16"
              height="16"
              transform="rotate(45 22 22)"
            /></g
          ></pattern
        ></defs
      ><rect width="100%" height="100%" fill="url(#ins-motif)" /></svg
    >
    <!-- marque officielle (symbole pour fond foncé + nom + devise) : le même composant que l'en-tête et la
         connexion — le garder ici le laisse aussi dans le morceau commun (sinon il partirait avec la connexion) -->
    <div class="marque-panneau"><Brand slogan surPage size={44} /></div>
    <div class="panneau-texte">
      <p class="promesse"><Bidi text={t('ins.promesse')} /></p>
      <p class="sous-promesse"><Bidi text={t('ins.sous_promesse')} /></p>
      <ul class="points">
        {#each [1, 2, 3] as n (n)}
          <li><span class="puce">{@render coche()}</span><Bidi text={t(`ins.point_${n}`)} /></li>
        {/each}
      </ul>
    </div>
  </aside>

  <section class="carte" aria-labelledby="titre-inscription">
    <h1 id="titre-inscription">{t('inscription.titre')}</h1>
    {#if codesSecours}
      {#await import('$lib/identites/CodesSecours.svelte') then { default: CodesSecours }}
        <CodesSecours codes={codesSecours} onfini={entrer} />
      {/await}
    {:else if porteFermee}
      <!-- bêta fermée : code d'invitation, ou demande d'invitation (liste d'attente validée à la main) -->
      <div class="porte-bloc" data-testid="porte-invitation">
        <h2><Bidi text={t('inv.titre')} /></h2>
        <p class="aide">
          <Bidi text={t(acces?.inscription === 'attente' ? 'inv.complet' : 'inv.intro')} />
        </p>
        <form
          class="porte"
          onsubmit={(e) => {
            e.preventDefault();
            void verifierCode();
          }}
        >
          <div class="champ">
            <label for="code-invitation"><Bidi text={t('inv.code')} /></label>
            <input
              id="code-invitation"
              class="code"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
              dir="ltr"
              aria-describedby="code-exemple"
              required
              bind:value={code}
              data-testid="code-invitation"
            />
            <p class="aide" id="code-exemple"><Bidi text={t('inv.exemple')} /></p>
          </div>
          {#if codeErreur}<p class="alerte" role="alert" data-testid="erreur-code">
              <Bidi text={codeErreur} />
            </p>{/if}
          <button type="submit" class="primary suivant" disabled={codeBusy}
            ><Bidi text={t('inv.verifier')} /></button
          >
        </form>
        <p class="sans-code">
          <Bidi text={t('inv.sans_code')} />
          <button
            type="button"
            class="lien"
            onclick={() => (demande = !demande)}
            aria-expanded={demande}><Bidi text={t('inv.demander')} /></button
          >
        </p>
        {#if demande}<ListeAttente />{/if}
      </div>
    {:else}
      {#if codeOk}
        <div class="invitation" role="status" data-testid="invitation-reconnue">
          <span class="pastille">{@render coche()}<Bidi text={t('ins.invitation_ok')} /></span>
          {#if codePerso}<p class="aide"><Bidi text={t('inv.perso')} /></p>{/if}
        </div>
      {/if}

      <!-- avancement : « Étape n sur 3 » écrit, trois segments, l'étape en cours marquée (aria-current) -->
      <div class="avancement">
        <p class="etape-n" data-testid="etape-n"><Bidi text={t('ins.etape', { n: etape })} /></p>
        <ol aria-label={t('ins.avancement')}>
          {#each [1, 2, 3] as n (n)}
            <li
              class:fait={n < etape}
              class:actuelle={n === etape}
              aria-current={n === etape ? 'step' : undefined}
            >
              <span class="trait" aria-hidden="true"></span>
              <span class="lib"><Bidi text={t(`ins.e${n}_court`)} /></span>
            </li>
          {/each}
        </ol>
      </div>
      <p class="sr" aria-live="polite" data-testid="annonce-etape"><Bidi text={annonce} /></p>

      <form
        class="form"
        novalidate
        onsubmit={avancer}
        data-testid="inscription-form"
        data-etape={etape}
      >
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

        {#if nbErreurs}<p class="alerte" role="alert" data-testid="erreurs-etape">
            <Bidi text={t('ins.err_resume', { n: nbErreurs })} />
          </p>{/if}
        {#if error}<p class="alerte" role="alert" data-testid="erreur">
            <Bidi text={error} />
          </p>{/if}

        <!-- ÉTAPE 1 : identifiants -->
        <section
          class="etape"
          hidden={etape !== 1}
          data-testid="etape-1"
          aria-labelledby="etape-1-t"
        >
          <h2 id="etape-1-t" tabindex="-1">{t('ins.e1')}</h2>
          {#if messageGoogle}<p class="alerte" role="alert" data-testid="message-google">
              <Bidi text={messageGoogle} />
            </p>{/if}
          {#if mode === 'google' && googleIdent}
            <!-- identité Google vérifiée : adresse tenue pour vérifiée, mot de passe facultatif -->
            <div class="note" data-testid="google-identite">
              <Bidi text={t('id.google_compte', { email: googleIdent.email })} />
              <button type="button" class="lien" onclick={annulerGoogle}
                ><Bidi text={t('id.autre_methode')} /></button
              >
            </div>
            <p class="aide"><Bidi text={t('id.mdp_facultatif')} /></p>
          {:else if assistee?.numero}
            <!-- inscription assistée : numéro préparé par l'équipe ; Google ou un mot de passe -->
            <div class="note" data-testid="assistee-numero">
              <Bidi text={t('id.assistee_numero', { numero: assistee.numero })} />
            </div>
            {#if acces?.google}
              {#await import('$lib/identites/ChoixEntree.svelte') then { default: ChoixEntree }}
                <ChoixEntree
                  google
                  telephone={false}
                  intent="inscription"
                  onTelephone={() => {}}
                  onGoogle={avantGoogle}
                  titreEmail={t('id.ou_mot_de_passe')}
                />
              {/await}
            {/if}
          {:else if mode === 'telephone'}
            {#await import('$lib/identites/VerifTelephone.svelte') then { default: VerifTelephone }}
              <div id="telephone" tabindex="-1" class="champ">
                <VerifTelephone
                  objet="inscription"
                  pays={country}
                  jetonAntibot={jeton}
                  envoi={acces?.telephoneEnvoi === true}
                  onverifie={(v) => {
                    verifTel = v;
                    effacer('telephone');
                  }}
                />
                {@render erreurDe('telephone')}
              </div>
            {/await}
            <button
              type="button"
              class="lien"
              onclick={() => {
                mode = 'email';
                verifTel = null;
              }}
              data-testid="autre-methode"><Bidi text={t('id.autre_methode')} /></button
            >
          {:else}
            {#if acces?.google || acces?.telephone}
              {#await import('$lib/identites/ChoixEntree.svelte') then { default: ChoixEntree }}
                <ChoixEntree
                  google={acces?.google === true}
                  telephone={acces?.telephone === true}
                  intent="inscription"
                  onTelephone={() => {
                    mode = 'telephone';
                    erreurs = {};
                  }}
                  onGoogle={avantGoogle}
                />
              {/await}
            {/if}
            <div class="champ">
              <label for="email">{t('champ.email')}</label>
              <input
                id="email"
                type="email"
                inputmode="email"
                autocomplete="email"
                autocapitalize="none"
                spellcheck="false"
                required
                bind:value={email}
                oninput={() => effacer('email')}
                aria-invalid={invalide('email')}
                aria-describedby={decrit('email', 'email-aide')}
              />
              {@render erreurDe('email')}
              <p class="aide" id="email-aide"><Bidi text={t('ins.email_aide')} /></p>
            </div>
          {/if}
          {#if mode !== 'telephone' || verifTel}
            {#await champMdp then { default: ChampMotDePasse }}
              <div class="champ mdp-bloc">
                <ChampMotDePasse
                  bind:value={password}
                  bind:identiques={mdpIdentiques}
                  bind:niveau={niveauMdp}
                  email={mode === 'email' && !assistee?.numero ? email : ''}
                  erreur={erreurs.password ?? ''}
                  erreurConfirmation={erreurs['password-confirmer'] ?? ''}
                />
              </div>
            {/await}
          {/if}
        </section>

        <!-- ÉTAPE 2 : profil (qui, pays et règles du pays, année, pseudonyme et façon d'avancer de l'adulte) -->
        <section
          class="etape"
          hidden={etape !== 2}
          data-testid="etape-2"
          aria-labelledby="etape-2-t"
        >
          <h2 id="etape-2-t" tabindex="-1">{t('ins.e2')}</h2>
          <fieldset class="choix">
            <legend>{t('inscription.qui')}</legend>
            <label class="option"
              ><input
                type="radio"
                name="kind"
                value="parent"
                bind:group={kind}
                disabled={!!assistee}
                data-testid="type-parent"
              />
              <span class="option-txt"
                ><strong>{t('inscription.parent')}</strong>
                <span class="option-aide">{t('inscription.parent_aide')}</span></span
              ></label
            >
            <label class="option"
              ><input
                type="radio"
                name="kind"
                value="adulte"
                bind:group={kind}
                disabled={!!assistee}
                data-testid="type-adulte"
              />
              <span class="option-txt"
                ><strong>{t('inscription.adulte')}</strong>
                <span class="option-aide">{t('inscription.adulte_aide')}</span></span
              ></label
            >
          </fieldset>

          <div class="champ">
            <label for="country">{t('champ.pays')}</label>
            <select
              id="country"
              bind:value={country}
              disabled={!!assistee?.pays}
              onchange={() => {
                region = '';
                effacer('region');
              }}
            >
              {#each COUNTRIES as c (c)}<option value={c}>{countryName(c)}</option>{/each}
            </select>
          </div>
          {#if current?.regions?.length}
            <div class="champ">
              <label for="region">{t('inscription.region')}</label>
              <select
                id="region"
                bind:value={region}
                required
                data-testid="region"
                onchange={() => effacer('region')}
                aria-invalid={invalide('region')}
                aria-describedby={decrit('region')}
              >
                <option value=""></option>
                {#each current.regions as r (r)}<option value={r}>{t(`region.${r}`)}</option>{/each}
              </select>
              {@render erreurDe('region')}
            </div>
          {/if}

          {#if current}
            <p class="note" data-testid="loi-pays">
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
          <div class="champ">
            <label for="birthYear">{t('champ.annee_naissance')}</label>
            <input
              id="birthYear"
              class="annee"
              type="number"
              inputmode="numeric"
              min="1900"
              max="2100"
              required
              bind:value={birthYear}
              oninput={() => effacer('birthYear')}
              aria-invalid={invalide('birthYear')}
              aria-describedby={decrit('birthYear', 'annee-aide')}
            />
            {@render erreurDe('birthYear')}
            <p class="aide" id="annee-aide">{t('inscription.annee_aide')}</p>
          </div>
          {#if kind === 'adulte'}
            <div class="champ">
              <label for="pseudonym"
                >{t('champ.pseudonyme')}
                <span class="facultatif">({t('commun.facultatif')})</span></label
              >
              <input id="pseudonym" maxlength="40" autocomplete="nickname" bind:value={pseudonym} />
            </div>
            <fieldset class="choix" data-testid="mode-inscription">
              <legend>{t('ser.titre')}</legend>
              {#each modesInscription as m (m)}
                <label class="option"
                  ><input
                    type="radio"
                    name="evalMode"
                    value={m}
                    bind:group={evalMode}
                    data-mode-choix={m}
                  />
                  <span class="option-txt"
                    ><strong><Bidi text={t(`ser.m_${m}`)} /></strong>
                    <span class="option-aide"><Bidi text={t(`ser.a_${m}`)} /></span></span
                  ></label
                >
              {/each}
              <p class="aide">{t('ser.modifiable')}</p>
            </fieldset>
          {/if}
        </section>

        <!-- ÉTAPE 3 : accords — les obligatoires ensemble (textes complets en lien), les facultatifs repliés -->
        <section
          class="etape"
          hidden={etape !== 3}
          data-testid="etape-3"
          aria-labelledby="etape-3-t"
        >
          <h2 id="etape-3-t" tabindex="-1">{t('ins.e3')}</h2>
          <fieldset class="accords">
            <legend>{t('ins.accords_requis')}</legend>
            <p class="aide">{t('ins.accords_aide')}</p>
            <div class="accord">
              <label class="coche"
                ><input
                  id="cgu"
                  type="checkbox"
                  bind:checked={cgu}
                  required
                  data-testid="consent-cgu"
                  onchange={() => effacer('cgu')}
                  aria-invalid={invalide('cgu')}
                  aria-describedby={decrit('cgu')}
                />
                <span>{t('consent.cgu')}</span></label
              >
              {@render erreurDe('cgu')}
            </div>
            <div class="accord">
              <label class="coche"
                ><input
                  id="art9"
                  type="checkbox"
                  bind:checked={art9}
                  required
                  data-testid="consent-art9"
                  onchange={() => effacer('art9')}
                  aria-invalid={invalide('art9')}
                  aria-describedby={decrit('art9')}
                />
                <span><Bidi text={t('consent.donnee_religieuse_art9')} /></span></label
              >
              {@render erreurDe('art9')}
            </div>
            {#if transferNeeded}
              <div class="accord">
                <label class="coche"
                  ><input
                    id="transfert"
                    type="checkbox"
                    bind:checked={transfert}
                    required
                    data-testid="consent-transfert"
                    onchange={() => effacer('transfert')}
                    aria-invalid={invalide('transfert')}
                    aria-describedby={decrit('transfert')}
                  />
                  <span
                    ><Bidi
                      text={t('consent.transfert_hors_pays', { pays: countryName(country) })}
                    /></span
                  ></label
                >
                {@render erreurDe('transfert')}
              </div>
            {/if}
            <p class="liens">
              <span>{t('ins.lire')}</span>
              <a
                href={resolve('/legal/[page]', { page: 'cgu' })}
                target="_blank"
                rel="noopener"
                data-testid="lien-cgu"
                >{t('pied.cgu')}<span class="sr">{t('ins.nouvel_onglet')}</span></a
              >
              <a
                href={resolve('/legal/[page]', { page: 'confidentialite' })}
                target="_blank"
                rel="noopener"
                data-testid="lien-confidentialite"
                >{t('pied.confidentialite')}<span class="sr">{t('ins.nouvel_onglet')}</span></a
              >
            </p>
          </fieldset>
          <details class="options" data-testid="options-facultatives">
            <summary>{t('ins.options')}</summary>
            <label class="coche"
              ><input
                id="rappels"
                type="checkbox"
                bind:checked={rappels}
                data-testid="consent-rappels"
              />
              <span
                >{t('consent.rappels')}
                <em class="facultatif">({t('commun.facultatif')})</em></span
              ></label
            >
          </details>
        </section>

        <div class="actions">
          {#if etape > 1}
            <button
              type="button"
              class="retour"
              data-testid="etape-retour"
              disabled={busy}
              onclick={() => aller((etape - 1) as Etape)}
              ><svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"
                ><path d="M14.5 6 8.5 12l6 6" /></svg
              >{t('ins.retour')}</button
            >
          {/if}
          <button type="submit" class="primary suivant" disabled={busy} data-testid="etape-suivante"
            ><Bidi text={etape < 3 ? t('ins.continuer') : t('inscription.bouton')} /></button
          >
        </div>
      </form>
    {/if}
    <p class="deja">
      {t('inscription.deja')} <a href={resolve('/connexion')}>{t('connexion.titre')}</a>
    </p>
  </section>
</div>

<style>
  /* charte de la page d'accueil publique : crème, vert profond, or ; Lexend (titres), Nunito (texte) ; les couleurs
     viennent des jetons du thème (clair et sombre) */
  .inscription {
    display: grid;
    gap: 16px;
    margin-top: 4px;
  }
  .panneau {
    position: relative;
    isolation: isolate;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 14px 18px 18px;
    border-radius: 22px;
    background: var(--mp-band);
    color: var(--mp-on-band);
    box-shadow:
      inset 0 -4px 0 var(--gold),
      var(--shadow-float);
  }
  /* symbole de la marque pour fond foncé, nom et devise en crème (l'or n'est jamais une couleur de texte) */
  .marque-panneau {
    /* téléphone : la marque est déjà dans l'en-tête de l'application, le panneau ne garde que la promesse */
    display: none;
    --mp-clair: none;
    --mp-sombre: block;
    --mp-nom: var(--mp-on-band);
    --mp-slogan: var(--mp-on-band);
  }
  .motif {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: -1;
    pointer-events: none;
  }
  .promesse {
    margin: 0;
    font-family: var(--font-title);
    font-weight: 600;
    font-size: 1.05rem;
    line-height: 1.3;
    letter-spacing: -0.01em;
  }
  .sous-promesse,
  .points {
    display: none;
  }
  .carte {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 22px;
    padding: 20px 16px 16px;
    box-shadow:
      0 1px 2px rgba(16, 24, 40, 0.05),
      0 10px 30px -12px rgba(8, 76, 56, 0.18);
    min-width: 0;
  }
  h1 {
    margin: 0 0 12px;
    font-size: 1.6rem;
    letter-spacing: -0.02em;
    color: var(--navy);
  }
  h2 {
    margin: 0 0 4px;
    font-size: 1.2rem;
    color: var(--navy);
  }
  h2:focus {
    outline: none;
  }
  h2:focus-visible {
    outline: 3px solid var(--focus);
    outline-offset: 4px;
    border-radius: 6px;
  }
  /* avancement */
  .avancement {
    margin: 4px 0 16px;
  }
  .etape-n {
    margin: 0 0 8px;
    font-family: var(--font-title);
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--ink2);
  }
  .avancement ol {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .avancement li {
    display: grid;
    gap: 6px;
  }
  .trait {
    display: block;
    height: 6px;
    border-radius: 3px;
    background: var(--line);
  }
  .fait .trait,
  .actuelle .trait {
    background: var(--primary);
  }
  .lib {
    font-size: 0.85rem;
    color: var(--ink2);
  }
  .actuelle .lib {
    color: var(--ink);
    font-weight: 700;
  }
  /* formulaire */
  .form,
  .etape,
  .porte {
    display: grid;
    gap: 16px;
  }
  .etape[hidden] {
    display: none;
  }
  .champ {
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  .champ label,
  legend {
    font-family: var(--font-title);
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--navy);
  }
  .carte :global(input:not([type='checkbox']):not([type='radio'])),
  .carte :global(select) {
    width: 100%;
    min-height: 50px;
    padding: 8px 14px;
    border-radius: 12px;
    background: var(--paper);
    box-sizing: border-box;
  }
  .carte :global(input[aria-invalid='true']),
  .carte :global(select[aria-invalid='true']) {
    border-color: var(--bad-ink);
  }
  .carte .annee {
    max-width: 10rem;
  }
  .code {
    letter-spacing: 0.06em;
  }
  /* champ du mot de passe (composant partagé) : mêmes espacements que les autres champs */
  .mdp-bloc :global(label) {
    font-family: var(--font-title);
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--navy);
  }
  .mdp-bloc :global(label:not(:first-child)) {
    margin-top: 10px;
  }
  .mdp-bloc :global(.oeil) {
    border-radius: 12px;
    min-height: 50px;
  }
  .aide,
  .mdp-bloc :global(.muted.small) {
    margin: 0;
    font-size: 0.9rem;
    color: var(--ink2);
  }
  .champ-erreur,
  .mdp-bloc :global(.error.small) {
    display: flex;
    gap: 8px;
    margin: 0;
    font-size: 0.92rem;
    font-weight: 700;
    color: var(--bad-ink);
  }
  .champ-erreur::before,
  .mdp-bloc :global(.error.small)::before {
    content: '';
    flex: none;
    width: 4px;
    border-radius: 2px;
    background: var(--bad-ink);
  }
  .alerte {
    margin: 0;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--bad-bg);
    color: var(--bad-ink);
    font-weight: 700;
  }
  .note {
    margin: 0;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--surface);
    color: var(--ink2);
    font-size: 0.9rem;
  }
  .facultatif {
    font-family: var(--font-ui);
    font-weight: 400;
    font-style: normal;
    color: var(--ink2);
  }
  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }
  .choix {
    display: grid;
    gap: 10px;
  }
  .choix legend {
    margin-bottom: 8px;
    padding: 0;
  }
  .option {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    min-height: 44px;
    padding: 14px 16px;
    border: 2px solid var(--line);
    border-radius: 14px;
    background: var(--card);
    cursor: pointer;
    transition: border-color var(--motion-fast) ease;
  }
  .option:hover {
    border-color: var(--ink2);
  }
  .option:has(input:checked) {
    border-color: var(--primary);
    background: var(--primary-soft);
  }
  .option input,
  .coche input {
    flex: none;
    width: 24px;
    height: 24px;
    margin: 0;
  }
  .option-txt {
    display: grid;
    gap: 2px;
  }
  .option-txt strong {
    font-family: var(--font-title);
    font-weight: 600;
  }
  .option-aide {
    display: block;
    color: var(--ink2);
    font-size: 0.92rem;
  }
  .option-aide::first-letter {
    text-transform: uppercase;
  }
  .accords {
    display: grid;
    gap: 12px;
    padding: 16px;
    border: 2px solid var(--line);
    border-radius: 16px;
    background: var(--surface);
  }
  .accords legend {
    float: left;
    width: 100%;
    padding: 0;
  }
  .accord {
    display: grid;
    gap: 6px;
  }
  .coche {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    min-height: 44px;
    cursor: pointer;
  }
  .liens {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 16px;
    margin: 0;
    font-size: 0.92rem;
    color: var(--ink2);
  }
  .liens span {
    flex-basis: 100%;
  }
  .liens a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    font-weight: 700;
  }
  .options {
    border-top: 1px solid var(--line);
    padding-top: 4px;
  }
  .options summary {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    cursor: pointer;
    font-family: var(--font-title);
    font-weight: 600;
    color: var(--navy);
  }
  /* chevron (le marqueur natif disparaît avec display: flex) : vers la droite fermé, vers le bas ouvert */
  .options summary::before {
    content: '';
    flex: none;
    width: 8px;
    height: 8px;
    border-right: 2.5px solid currentColor;
    border-bottom: 2.5px solid currentColor;
    transform: rotate(-45deg);
    transition: transform var(--motion-fast) ease;
  }
  .options[open] summary::before {
    transform: rotate(45deg);
  }
  .options .coche {
    margin-top: 8px;
  }
  .actions {
    display: flex;
    gap: 10px;
    margin-top: 4px;
  }
  .suivant {
    flex: 1;
    min-height: 54px;
    border-radius: 14px;
    font-family: var(--font-title);
    font-weight: 600;
    font-size: 1.05rem;
    box-shadow: 0 8px 20px -10px rgba(8, 76, 56, 0.55);
  }
  .retour {
    flex: none;
    min-height: 54px;
    padding: 0 16px 0 10px;
    border-radius: 14px;
  }
  .ico {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.25;
    stroke-linecap: round;
    stroke-linejoin: round;
    flex: none;
  }
  .invitation {
    display: grid;
    gap: 6px;
    margin: 0 0 12px;
  }
  .pastille {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px 4px 8px;
    border-radius: 999px;
    background: var(--ok-bg);
    color: var(--ok-ink);
    font-weight: 700;
    font-size: 0.9rem;
  }
  .pastille .ico {
    width: 18px;
    height: 18px;
  }
  .sans-code {
    margin: 4px 0 0;
  }
  .lien {
    background: none;
    border: 0;
    padding: 0;
    min-height: 44px;
    color: var(--teal);
    text-decoration: underline;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .deja {
    margin: 20px 0 0;
    padding-top: 16px;
    border-top: 1px solid var(--line);
    text-align: center;
  }
  .deja a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    font-weight: 700;
  }
  .piege {
    position: absolute;
    inset-inline-start: -10000px;
    width: 1px;
    height: 1px;
    overflow: hidden;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }
  /* ordinateur : deux colonnes, panneau de la marque complet à gauche */
  @media (min-width: 52rem) {
    .marque-panneau {
      display: block;
    }
    .inscription {
      grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);
      gap: 24px;
      align-items: start;
      margin-top: 12px;
    }
    .panneau {
      position: sticky;
      top: 16px;
      gap: 28px;
      min-height: 34rem;
      padding: 32px 32px 40px;
      border-radius: 28px;
    }
    .panneau-texte {
      display: grid;
      gap: 16px;
      margin-top: auto;
    }
    .promesse {
      font-size: 1.65rem;
      line-height: 1.2;
      letter-spacing: -0.02em;
    }
    .sous-promesse {
      display: block;
      margin: 0;
      opacity: 0.95;
    }
    .points {
      display: grid;
      gap: 10px;
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
    }
    .points li {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
    }
    .puce {
      display: grid;
      place-items: center;
      flex: none;
      width: 30px;
      height: 30px;
      border-radius: 10px;
      background: rgba(251, 247, 238, 0.14);
      color: var(--gold);
    }
    .puce .ico {
      width: 18px;
      height: 18px;
    }
    .carte {
      padding: 32px 32px 24px;
      border-radius: 28px;
    }
    h1 {
      font-size: 1.9rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .option {
      transition: none;
    }
  }
</style>
