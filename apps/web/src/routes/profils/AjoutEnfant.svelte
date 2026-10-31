<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { levelFitsProfile, levelLabel } from '$lib/levels';
  import { t } from '$lib/i18n';
  import { call } from '$lib/session';
  import Sym from '$lib/Sym.svelte';
  import { SYMBOLS } from '$lib/symbols';

  /**
   * Ajout du profil d'un enfant (pseudonyme, ANNÉE de naissance, avatar sans visage, identifiant et mot de passe de
   * l'enfant, mot de passe du parent) : il écrit sur le serveur, donc chargé à la demande (EN_LIGNE_MODULES de
   * scripts/groupes.mjs), hors de la coquille de l'élève.
   */
  let {
    pays,
    onajoute,
    onannule,
  }: {
    pays: string | null | undefined;
    onajoute: (nom: string) => void | Promise<void>;
    onannule: () => void;
  } = $props();
  let error = $state('');
  const YEAR = new Date().getFullYear();
  let form = $state({
    pseudonym: '',
    birthYear: YEAR - 7,
    avatar: 'etoile',
    levelCode: 'en1',
    identifiant: '',
    motDePasseEnfant: '',
    /** mot de passe DU PARENT, ressaisi pour créer l'identifiant de l'enfant */
    mdpParent: '',
    declaration: false,
  });
  /** V2-3 : identifiant de l'enfant « prénom-NNN », disponibilité vérifiée, trois propositions */
  let idEtat = $state<{ forme: boolean; disponible: boolean; propositions: string[] } | null>(null);
  let idMinuteur: ReturnType<typeof setTimeout> | null = null;
  async function verifierIdentifiant() {
    const r = await call<{ forme: boolean; disponible: boolean; propositions: string[] }>(
      'GET',
      `/profiles/login-disponible?login=${encodeURIComponent(form.identifiant)}&prenom=${encodeURIComponent(form.pseudonym)}`,
    );
    idEtat = r.ok ? (r.data ?? null) : null;
  }
  function identifiantChange() {
    idEtat = null;
    if (idMinuteur) clearTimeout(idMinuteur);
    if (form.identifiant) idMinuteur = setTimeout(verifierIdentifiant, 350);
  }
  /** proposition au prénom saisi (modifiable) : demandée quand le champ est vide */
  async function proposer() {
    if (form.identifiant || !form.pseudonym.trim()) return;
    await verifierIdentifiant();
    if (idEtat?.propositions[0]) {
      form.identifiant = idEtat.propositions[0];
      await verifierIdentifiant();
    }
  }
  const age = $derived(YEAR - 1 - Number(form.birthYear));
  // lot F3 (revue G3) : États-Unis, moins de 13 ans : fermé au lancement (dit avant l'envoi)
  const closed = $derived(pays === 'US' && age < 13);
  /** livres publiés de l'édition (hors aperçus) */
  let levels = $state<string[]>(['en1']);
  onMount(async () => {
    const lv = await call<{ levels: Array<{ code: string; apercu: boolean }> }>('GET', '/levels');
    if (lv.ok) levels = lv.data!.levels.filter((l) => !l.apercu).map((l) => l.code);
  });

  async function addChild(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    // une seule case : « Je suis son parent ou son tuteur et j'accepte ces conditions pour lui »
    const consents = ['compte_suivi', 'donnee_religieuse_art9'];
    const r = await call<{ id: string }>('POST', '/profiles', {
      pseudonym: form.pseudonym,
      birthYear: Number(form.birthYear),
      avatar: form.avatar,
      levelCode: form.levelCode,
      identifiant: form.identifiant.trim().toLowerCase(),
      motDePasseEnfant: form.motDePasseEnfant,
      password: form.mdpParent,
      declaration: form.declaration,
      consents,
    });
    if (!r.ok) {
      error = t(`erreur.${r.code ?? 'reseau'}`);
      return;
    }
    await onajoute(form.pseudonym);
  }
</script>

<form class="card form" onsubmit={addChild}>
  <h2>{t('profils.ajouter')}</h2>
  <p class="muted small">{t('profils.minimisation')}</p>
  <label for="pseudonym">{t('champ.pseudonyme')}</label>
  <input id="pseudonym" required maxlength="40" bind:value={form.pseudonym} onblur={proposer} />
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
          <Sym id={s.id} size={36} /><span class="sr"><Bidi text={t(`symbole.${s.id}`)} /></span>
        </label>
      {/each}
    </div>
  </fieldset>
  <label for="identifiant">{t('profils.id_label')}</label>
  <input
    id="identifiant"
    required
    minlength="3"
    maxlength="24"
    autocomplete="off"
    autocapitalize="none"
    spellcheck="false"
    bind:value={form.identifiant}
    oninput={identifiantChange}
    aria-describedby="identifiant-aide"
    data-testid="identifiant-enfant"
  />
  <p class="muted small" id="identifiant-aide"><Bidi text={t('profils.id_aide')} /></p>
  {#if idEtat}
    <p class={idEtat.disponible ? 'ok' : 'error'} role="status" data-testid="identifiant-etat">
      <Bidi
        text={idEtat.disponible
          ? t('profils.id_dispo')
          : idEtat.forme
            ? t('profils.id_pris')
            : t('profils.id_forme')}
      />
    </p>
    {#if !idEtat.disponible && idEtat.propositions.length}
      <p class="small">
        {t('profils.id_propositions')}
        {#each idEtat.propositions as p (p)}
          <button
            type="button"
            class="lien"
            onclick={() => {
              form.identifiant = p;
              identifiantChange();
            }}><Bidi text={p} /></button
          >
        {/each}
      </p>
    {/if}
  {/if}
  <label for="mdp-enfant">{t('profils.mdp_enfant')}</label>
  <input
    id="mdp-enfant"
    type="password"
    minlength="8"
    required
    autocomplete="new-password"
    bind:value={form.motDePasseEnfant}
    aria-describedby="mdp-enfant-aide"
    data-testid="mdp-enfant"
  />
  <p class="muted small" id="mdp-enfant-aide"><Bidi text={t('profils.mdp_enfant_aide')} /></p>
  <label for="mdp-parent">{t('profils.mot_de_passe_parent')}</label>
  <input
    id="mdp-parent"
    type="password"
    required
    autocomplete="current-password"
    bind:value={form.mdpParent}
    data-testid="mdp-parent"
  />
  <label class="check"
    ><input
      id="declaration"
      type="checkbox"
      required
      bind:checked={form.declaration}
      data-testid="declaration-parent"
    />
    <span><Bidi text={t('profils.declaration')} /></span></label
  >
  {#if closed}<p class="warnbox" role="note" data-testid="ferme-moins-13">
      <Bidi text={t('inscription.ferme_moins_13')} />
    </p>{/if}
  {#if error}<p class="error" role="alert" data-testid="erreur"><Bidi text={error} /></p>{/if}
  <div class="row">
    <button type="submit" class="primary" data-testid="creer-profil">{t('profils.creer')}</button>
    <button type="button" onclick={onannule}>{t('commun.annuler')}</button>
  </div>
</form>

<style>
  .form {
    display: grid;
    gap: 8px;
    max-width: 520px;
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
