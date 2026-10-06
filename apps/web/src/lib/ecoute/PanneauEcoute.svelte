<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import RecitationEnvoi from '$lib/RecitationEnvoi.svelte';
  import { loadMeta, loadVerses } from '$lib/hifz';
  import { loadTexts, t } from '$lib/i18n';
  import Feuille from '$lib/quran/lecture/Feuille.svelte';
  import { recordingAllowed, saveRecording } from '$lib/recordings';
  import { call } from '$lib/session';
  import { motsAttendus, type EtatMot, type MotAttendu, type ResultatEcoute } from '@awform/hifz';
  import { garderBilan } from './bilans';
  import TexteEcoute from './TexteEcoute.svelte';
  import type { EtatEcoute } from './etat';
  import {
    MAX_S,
    SuiviDirect,
    bilanDe,
    coupe,
    donnerAccord,
    Enregistreur,
    micro,
    verifier,
    type EtatDirect,
    type Portion,
  } from './ecoute';

  /**
   * A5 — PANNEAU « Réciter et vérifier » (chargé à la demande). L'IA ne repère que des MOTS (oubliés, ajoutés,
   * remplacés, dans le désordre, verset sauté) ; en cas de doute elle se tait ; jamais de note, jamais de
   * tajwīd, jamais « valide » : « seul ton maître juge ta récitation ». Enfant : présentation très simple,
   * encouragements. La voix n'est jamais gardée par le serveur ; ici, l'enregistrement reste en mémoire le
   * temps du panneau (pour « Envoyer au maître », qui passe par l'envoi du lot 16).
   */
  let {
    profileId,
    kind,
    portion,
    memoriser = false,
    etat,
    ouvert = $bindable(false),
  }: {
    profileId: string;
    kind: string;
    portion: Portion;
    memoriser?: boolean;
    etat: EtatEcoute;
    ouvert?: boolean;
  } = $props();

  type Etape = 'charge' | 'accord' | 'pret' | 'ecoute' | 'direct' | 'analyse' | 'resultat';
  let etape = $state<Etape>('charge');
  let accord = $state(untrack(() => etat.accord === true));
  const enfant = $derived(kind === 'enfant' || etat.enfant === true);
  let pin = $state('');
  let erreur = $state('');
  let versets = $state<Array<{ s: number; a: number; text: string }>>([]);
  let att = $state<MotAttendu[]>([]);
  let masque = $state(untrack(() => memoriser));
  let modeDirect = $state(false);
  let secondes = $state(0);
  let resultat = $state<ResultatEcoute | null>(null);
  let direct = $state<EtatDirect | null>(null);
  /** enregistrement EN MÉMOIRE seulement (pour « Envoyer au maître »), abandonné à la fermeture */
  let audio = $state.raw<Blob | null>(null);
  let envoi = $state<'non' | 'pret' | 'refuse'>('non');
  let flux: MediaStream | null = null;
  let rec: Enregistreur | null = null;
  let suivi: SuiviDirect | null = null;
  let horloge: ReturnType<typeof setInterval> | null = null;

  /** rang dans `att` de chaque mot affiché (sourate:verset:rang du jeton) */
  const index = $derived(new Map(att.map((m) => [`${m.s}:${m.a}:${m.k}`, m.i])));
  const etats = $derived<EtatMot[]>(direct ? direct.resultat.mots : (resultat?.mots ?? []));
  const ajouts = $derived(
    new Set(
      (direct?.resultat ?? resultat)?.ecarts.filter((e) => e.type === 'ajoute').map((e) => e.i) ??
        [],
    ),
  );
  const sautes = $derived(
    new Set(
      (resultat?.ecarts ?? []).filter((e) => e.type === 'verset_saute').map((e) => `${e.s}:${e.a}`),
    ),
  );
  const nbARevoir = $derived(
    (resultat?.ecarts ?? []).reduce((s, e) => s + (e.type === 'ajoute' ? 1 : e.fin - e.i + 1), 0),
  );

  onMount(async () => {
    await loadTexts('ecoute');
    const [vs, meta] = await Promise.all([
      loadVerses(portion.s, portion.from, portion.to),
      loadMeta(),
    ]);
    versets = vs;
    att = motsAttendus(vs, meta?.basmala ?? '');
    etape = accord ? 'pret' : 'accord';
  });
  onDestroy(arretTout);

  function arretTout() {
    if (horloge) clearInterval(horloge);
    horloge = null;
    rec?.arreter();
    void suivi?.arreter();
    coupe(flux);
    flux = null;
    // l'enregistrement en mémoire est abandonné à la fermeture
    audio = null;
  }

  const MESSAGES: Record<string, string> = {
    ecoute_indisponible: 'ec.err_indisponible',
    ecoute_occupee: 'ec.err_occupee',
    audio_trop_long: 'ec.err_trop_long',
    audio_invalide: 'ec.err_audio',
    micro: 'ec.err_micro',
    trop_de_demandes: 'ec.err_quota',
    portion_invalide: 'ec.err_portion',
    reseau: 'ec.err_reseau',
    fonction_fermee: 'ec.err_indisponible',
  };
  function message(code: string): string {
    if (MESSAGES[code]) return t(MESSAGES[code]!);
    const m = t(`erreur.${code}`);
    return m.startsWith('⟦') ? t('ec.err_reseau') : m;
  }

  async function accepter() {
    erreur = '';
    const e = await donnerAccord(profileId, pin);
    if (e) return void (erreur = message(e));
    accord = true;
    pin = '';
    etape = 'pret';
  }
  async function retirer() {
    await call('DELETE', `/profiles/${profileId}/ecoute/accord`).catch(() => null);
    accord = false;
    etape = 'accord';
  }

  async function commencer(enDirect: boolean) {
    erreur = '';
    signale = false;
    resultat = null;
    direct = null;
    envoi = 'non';
    audio = null;
    modeDirect = enDirect;
    try {
      flux = await micro();
    } catch {
      return void (erreur = message('micro'));
    }
    rec = new Enregistreur();
    secondes = 0;
    horloge = setInterval(
      () => (secondes = Math.round((Date.now() - (rec?.debut ?? Date.now())) / 1000)),
      500,
    );
    if (enDirect) {
      suivi = new SuiviDirect(
        profileId,
        portion,
        att,
        (e) => (direct = e),
        (code) => (erreur = message(code)),
      );
      if (!(await suivi.demarrer(flux))) {
        arretTout();
        return;
      }
      direct = suivi.etat();
    }
    // l'enregistrement (en mémoire) sert à la vérification, ou au maître en mode direct
    await rec.demarrer(flux, (b) => void fini(b));
    etape = enDirect ? 'direct' : 'ecoute';
  }

  function terminer() {
    if (horloge) clearInterval(horloge);
    horloge = null;
    rec?.arreter();
  }

  async function fini(b: Blob) {
    coupe(flux);
    flux = null;
    audio = b;
    etape = 'analyse';
    // suivi en direct : la séance est close (son audio effacé du serveur) ; le BILAN, lui, vient toujours de la
    // vérification de tout l'enregistrement (plus sûre que les passages du direct, ECOUTE_IA.md § 4)
    if (modeDirect && suivi) {
      await suivi.arreter();
      suivi = null;
      direct = null;
    }
    const v = await verifier(profileId, portion, b);
    if (!v.ok) {
      erreur = message(v.code);
      etape = 'pret';
      return;
    }
    const r: ResultatEcoute = v.v.resultat;
    resultat = r;
    etape = 'resultat';
    // bilan de séance (positions des mots à revoir, jamais l'audio) : repris par le carnet
    await garderBilan(profileId, bilanDe(portion, att, r));
  }

  /** « L'IA s'est trompée » : un compteur pour mesurer les fausses alertes en bêta (ni voix, ni mots) */
  let signale = $state(false);
  async function signaler() {
    if (!resultat) return;
    await call('POST', `/profiles/${profileId}/ecoute/signalement`, {
      ecarts: resultat.ecarts.length,
      statut: resultat.statut,
    }).catch(() => null);
    signale = true;
  }

  async function versMaitre() {
    if (!audio) return;
    if (kind !== 'adulte' && !(await recordingAllowed(profileId))) return void (envoi = 'refuse');
    await saveRecording(profileId, `${portion.s}:${portion.from}-${portion.to}`, audio);
    envoi = 'pret';
  }

  const mmss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  const titre = $derived(t(enfant ? 'ec.titre_enfant' : 'ec.titre'));
  const fini_ = $derived(resultat?.statut === 'resultat');
  /** le premier mot attendu (hors basmala, lettres isolées) n'a pas été entendu : dit sans le compter en erreur */
  const debutNonEntendu = $derived(
    !!resultat &&
      resultat.statut === 'resultat' &&
      resultat.debut > (att.find((m) => !m.facultatif && !m.lettres)?.i ?? 0),
  );
  const nonRecite = $derived(
    resultat && resultat.statut === 'resultat' && resultat.finRecitee < att.length - 1
      ? att[resultat.finRecitee + 1]?.a
      : undefined,
  );
</script>

<Feuille id="ecoute-ia" title={titre} bind:open={ouvert} testid="panneau-ecoute">
  <div class="pan" class:enfant>
    {#if etape === 'charge'}
      <p class="muted">{t('ec.chargement')}</p>
    {:else if etape === 'accord'}
      <section data-testid="ecoute-accord">
        <h3>{t('ec.accord_titre')}</h3>
        <p><Bidi text={t(enfant ? 'ec.accord_texte_enfant' : 'ec.accord_texte')} /></p>
        <p class="small muted"><Bidi text={t('ec.accord_garanties')} /></p>
        {#if enfant}
          <p class="small"><Bidi text={t('ec.accord_parent')} /></p>
          <label class="pin"
            >{t('profils.code_parent')}
            <input
              type="password"
              inputmode="numeric"
              maxlength="8"
              autocomplete="off"
              bind:value={pin}
              data-testid="ecoute-pin"
            /></label
          >
        {/if}
        <button type="button" class="primary" onclick={accepter} data-testid="ecoute-accepter"
          >{t('ec.accord_ok')}</button
        >
      </section>
    {:else}
      {#if etape === 'pret'}
        <div class="choix" data-testid="ecoute-pret">
          <p><Bidi text={t(enfant ? 'ec.consigne_enfant' : 'ec.consigne')} /></p>
          <button
            type="button"
            class="primary grand"
            onclick={() => commencer(false)}
            data-testid="ecoute-commencer">{t('ec.mode_enregistrer')}</button
          >
          {#if etat.direct}
            <button
              type="button"
              class="grand"
              onclick={() => commencer(true)}
              data-testid="ecoute-direct">{t('ec.mode_direct')}</button
            >
            <label class="small"
              ><input type="checkbox" bind:checked={masque} data-testid="ecoute-masque" />
              {t('ec.masquer')}</label
            >
          {/if}
        </div>
      {:else if etape === 'ecoute' || etape === 'direct'}
        <div class="enreg" role="status" data-testid="ecoute-en-cours">
          <span class="point" aria-hidden="true"></span>
          <span><Bidi text={t(enfant ? 'ec.je_t_ecoute_enfant' : 'ec.je_t_ecoute')} /></span>
          <span class="temps"><Bidi text={`${mmss(secondes)} / ${mmss(MAX_S)}`} /></span>
          <button type="button" class="primary" onclick={terminer} data-testid="ecoute-terminer"
            >{t('ec.terminer')}</button
          >
        </div>
      {:else if etape === 'analyse'}
        <p role="status" class="muted" data-testid="ecoute-analyse">{t('ec.analyse')}</p>
      {/if}

      {#if etape === 'resultat' && resultat}
        <div class="bilan" role="status" data-testid="ecoute-resultat">
          {#if resultat.statut === 'pas_compris'}
            <p class="doux" data-testid="ecoute-pas-compris"><Bidi text={t('ec.pas_compris')} /></p>
          {:else if nbARevoir === 0}
            <p class="bien" data-testid="ecoute-aucun">
              <Bidi text={t(enfant ? 'ec.aucun_enfant' : 'ec.aucun')} />
            </p>
          {:else}
            <p class="doux" data-testid="ecoute-a-revoir">
              <Bidi text={t(enfant ? 'ec.a_revoir_enfant' : 'ec.a_revoir', { n: nbARevoir })} />
            </p>
          {/if}
          {#if fini_ && resultat.doutes > 0 && !enfant}
            <p class="small muted"><Bidi text={t('ec.doutes', { n: resultat.doutes })} /></p>
          {/if}
          {#if debutNonEntendu}
            <p class="small muted"><Bidi text={t('ec.debut_non_entendu')} /></p>
          {/if}
          {#if nonRecite !== undefined}
            <p class="small muted"><Bidi text={t('ec.suite_non_entendue', { n: nonRecite })} /></p>
          {/if}
        </div>
      {/if}

      {#if versets.length}
        <TexteEcoute
          {versets}
          {index}
          {etats}
          {ajouts}
          {sautes}
          courant={direct?.courant ?? -1}
          masque={masque && etape === 'direct'}
        />
      {/if}

      {#if etape === 'resultat' && resultat && resultat.ecarts.length}
        <ul class="ecarts small" data-testid="ecoute-ecarts">
          {#each resultat.ecarts as e (`${e.type}${e.i}`)}
            <li><Bidi text={t(`ec.type_${e.type}`, { n: e.a })} /></li>
          {/each}
        </ul>
        <p class="legende small muted" aria-hidden="true">
          <span class="mot oublie">{t('ec.l_oublie')}</span>
          <span class="mot remplace">{t('ec.l_remplace')}</span>
          <span class="mot ordre">{t('ec.l_ordre')}</span>
          <span><span class="ajout">+</span> {t('ec.l_ajoute')}</span>
        </p>
      {/if}

      {#if erreur}<p role="alert" class="bad" data-testid="ecoute-erreur">
          <Bidi text={erreur} />
        </p>{/if}

      <p class="maitre small" data-testid="ecoute-maitre-juge">
        <Bidi text={t('ec.maitre_juge')} />
      </p>

      {#if etape === 'resultat'}
        <div class="actions">
          <button
            type="button"
            class="primary"
            onclick={() => (etape = 'pret')}
            data-testid="ecoute-encore">{t('ec.reessayer')}</button
          >
          {#if audio && envoi === 'non'}
            <button type="button" onclick={versMaitre} data-testid="ecoute-envoyer-maitre"
              >{t('ec.envoyer_maitre')}</button
            >
          {/if}
        </div>
        {#if signale}
          <p class="small muted" role="status"><Bidi text={t('ec.merci_signalement')} /></p>
        {:else}
          <button
            type="button"
            class="link small"
            onclick={signaler}
            data-testid="ecoute-ia-trompee">{t('ec.ia_trompee')}</button
          >
        {/if}
        {#if envoi === 'refuse'}
          <p class="small muted"><Bidi text={t('ec.envoi_reglage')} /></p>
        {:else if envoi === 'pret'}
          <RecitationEnvoi {profileId} {kind} />
        {/if}
      {/if}
      {#if !enfant && etape === 'pret'}
        <button type="button" class="link small" onclick={retirer} data-testid="ecoute-retirer"
          >{t('ec.retirer')}</button
        >
      {/if}
    {/if}
  </div>
</Feuille>

<style>
  .pan {
    display: grid;
    gap: 12px;
  }
  .choix {
    display: grid;
    gap: 10px;
  }
  .grand {
    min-height: 48px;
    font-size: 1.05rem;
  }
  .enfant .grand,
  .enfant .primary {
    min-height: 56px;
    font-size: 1.15rem;
  }
  .enreg {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  .point {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--bad-ink);
    animation: pulse 1.2s ease-in-out infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .point {
      animation: none;
    }
  }
  @keyframes pulse {
    50% {
      opacity: 0.3;
    }
  }
  .temps {
    font-variant-numeric: tabular-nums;
  }
  /* légende : mêmes marques que le texte (TexteEcoute) */
  .mot {
    border-radius: 6px;
    padding: 0 4px;
  }
  .mot.oublie {
    background: var(--warn-bg);
    text-decoration: underline dotted var(--warn-ink);
    text-underline-offset: 4px;
  }
  .mot.remplace {
    background: var(--bad-bg);
    color: var(--bad-ink);
  }
  .mot.ordre {
    background: var(--warn-bg);
    text-decoration: underline wavy var(--warn-ink);
    text-underline-offset: 4px;
  }
  .ajout {
    color: var(--bad-ink);
    font-weight: 700;
  }
  .bien {
    color: var(--ok-ink);
    font-weight: 600;
  }
  .doux {
    font-weight: 600;
  }
  .maitre {
    border-left: 3px solid var(--accent);
    padding-left: 8px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .legende {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .ecarts {
    margin: 0;
    padding-inline-start: 18px;
  }
  .pin {
    display: grid;
    gap: 4px;
    max-width: 220px;
  }
  .bad {
    color: var(--bad-ink);
  }
  .small {
    font-size: 0.9rem;
  }
</style>
