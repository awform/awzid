<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { resolve } from '$app/paths';
  import Bidi from '$lib/Bidi.svelte';
  import RecitationEnvoi from '$lib/RecitationEnvoi.svelte';
  import { fn } from '$lib/fonctions.svelte';
  import { loadMeta, loadVerses } from '$lib/hifz';
  import { loadTexts, t, texteExiste } from '$lib/i18n';
  import Feuille from '$lib/quran/lecture/Feuille.svelte';
  import { recordingAllowed, saveRecording } from '$lib/recordings';
  import { call } from '$lib/session';
  import { motsAttendus, type EtatMot, type MotAttendu, type ResultatEcoute } from '@awform/hifz';
  import { occuper } from '$lib/occupation';
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
    causeMicro,
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
  // mise à jour de l'application : jamais appliquée ni rechargée tant que ce panneau est ouvert (lib/maj.ts)
  let libererOccupation = () => {};
  onMount(() => {
    libererOccupation = occuper();
  });
  onDestroy(() => {
    libererOccupation();
    arretTout();
  });

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
    micro_https: 'ec.err_micro_https',
    micro_refuse: 'ec.err_micro_refuse',
    micro_absent: 'ec.err_micro_absent',
    trop_de_demandes: 'ec.err_quota',
    portion_invalide: 'ec.err_portion',
    reseau: 'ec.err_reseau',
    fonction_fermee: 'ec.err_indisponible',
  };
  function message(code: string): string {
    if (MESSAGES[code]) return t(MESSAGES[code]!);
    // pas `startsWith('⟦')` : en production, une clé manquante rend un texte vide (lib/i18n)
    return texteExiste(`erreur.${code}`) ? t(`erreur.${code}`) : t('ec.err_reseau');
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
    } catch (e) {
      // lot lecteur 4 : message selon la cause (adresse non sécurisée, refus, aucun micro)
      return void (erreur = message(causeMicro(e)));
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
        // shazam_coran : suivi de la récitation, erreurs signalées pendant qu'on récite
        etat.shazam === true,
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

  /** suivi de la récitation : dernier écart signalé pendant la récitation, avec le texte attendu (Tanzil exact) */
  const dernierEcart = $derived(
    etape === 'direct' && direct?.resultat.ecarts.length
      ? direct.resultat.ecarts[direct.resultat.ecarts.length - 1]!
      : null,
  );
  const attendu = $derived(
    dernierEcart && dernierEcart.type !== 'ajoute'
      ? att.slice(dernierEcart.i, Math.min(dernierEcart.fin, dernierEcart.i + 5) + 1)
      : [],
  );

  /** suivi (shazam_coran) : nombre d'écarts signalés et % des mots récités jusqu'ici qui ont été reconnus */
  const compteur = $derived.by(() => {
    if (etape !== 'direct' || !etat.shazam || !direct || direct.courant < 1) return null;
    const vus = direct.resultat.mots.slice(0, direct.courant);
    const ok = vus.filter((m) => m === 'ok').length;
    return {
      n: direct.resultat.ecarts.length,
      p: Math.round((100 * ok) / Math.max(1, vus.length)),
    };
  });

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
              data-testid="ecoute-direct"
              >{t(etat.shazam ? 'ec.mode_suivi' : 'ec.mode_direct')}</button
            >
            {#if etat.shazam}<p class="small muted" data-testid="suivi-aide">
                <Bidi text={t('ec.suivi_aide')} />
              </p>{/if}
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

      {#if compteur}
        <!-- suivi de la récitation : erreurs signalées et part des mots récités reconnus (jamais une note) -->
        <p class="small muted" data-testid="suivi-compteur">
          <Bidi text={t('ec.compteur', compteur)} />
        </p>
      {/if}
      <!-- suivi de la récitation : l'écart est dit avec le mot attendu (annoncé poliment aux lecteurs d'écran) -->
      <div
        class="attendu"
        class:plein={!!dernierEcart}
        role="status"
        aria-live="polite"
        data-testid="suivi-ecart"
      >
        {#if dernierEcart}
          <p class="small">
            <Bidi text={t(`ec.type_${dernierEcart.type}`, { n: dernierEcart.a })} />
          </p>
          {#if attendu.length}
            <p class="small muted">{t('ec.attendu', { n: attendu.length })}</p>
            <p class="att quran-text" lang="ar" dir="rtl" data-testid="suivi-attendu">
              {attendu.map((m) => m.texte).join(' ')}
            </p>
          {/if}
        {/if}
      </div>

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
            <li>
              <Bidi text={t(`ec.type_${e.type}`, { n: e.a })} />
              {#if etat.shazam}
                <!-- suivi (shazam_coran) : réécouter le verset juste, récité par Muḥammad Ayyūb -->
                <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- chemin résolu, suivi de paramètres -->
                <a
                  href={`${resolve('/coran/lecteur')}?s=${e.s}&a=${e.a}&r=ayyoub-hafs&lire=1`}
                  data-testid="ecoute-ecart-ecouter"><Bidi text={t('rv.ecouter_ayyoub')} /></a
                >
              {/if}
            </li>
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
        <!-- 25/10/2026 : indication des madd longs (adultes, bêta fermée, un seul verset) ; module chargé à la demande -->
        {#if fn('tajwid_madd') && kind === 'adulte' && !enfant && audio && portion.from === portion.to && portion.from > 1 && versets.length === 1}
          {#await import('$lib/tajwid-madd') then m}<m.Madd
              {profileId}
              verset={versets[0]!}
              {audio}
            />{/await}
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
  .attendu.plein {
    border-inline-start: 3px solid var(--warn-ink);
    background: var(--warn-bg);
    border-radius: 8px;
    padding: 6px 10px;
  }
  .attendu p {
    margin: 0;
  }
  .att {
    font-family: var(--font-quran);
    font-size: 1.5rem;
    line-height: 2;
    text-align: right;
  }
  .bad {
    color: var(--bad-ink);
  }
  .small {
    font-size: 0.9rem;
  }
</style>
