<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onDestroy, onMount } from 'svelte';
  import { countryName } from '$lib/countries';
  import { locale, t } from '$lib/i18n';
  import { call } from '$lib/session';
  import { indicatifDe, lienWhatsapp, normaliserTelephone, PLANS } from '@awform/school/telephone';

  /**
   * Vérification d'un numéro WhatsApp (18/10/2026), GRATUITE : la personne envoie elle-même, depuis son WhatsApp, un
   * message pré-rempli « AWZID <code> » au numéro d'Awzid ; le serveur reconnaît le numéro de l'expéditeur et valide.
   * La page attend (sondage toutes les 3 s). Validation MANUELLE (bêta) : un administrateur valide sous 48 h ; la
   * vérification est gardée sur l'appareil pour reprendre plus tard. Secours (si l'envoi payant est allumé) : un code
   * à 6 chiffres reçu par WhatsApp. Aucune donnée n'est envoyée ailleurs qu'à l'API d'Awzid.
   */
  type Objet =
    'inscription' | 'reinitialisation' | 'reverification' | 'ajout_numero' | 'liste_attente';
  interface Verifie {
    id: string;
    jeton: string;
    e164: string;
  }
  let {
    objet,
    pays = 'SN',
    numeroInitial = '',
    jetonAntibot = '',
    envoi = false,
    onverifie,
  }: {
    objet: Objet;
    pays?: string;
    numeroInitial?: string;
    jetonAntibot?: string;
    envoi?: boolean;
    onverifie: (v: Verifie) => void;
  } = $props();

  const CLE = $derived(`awzid.verif-numero.${objet}`);
  const paysListe = Object.keys(PLANS).sort((a, b) => countryName(a).localeCompare(countryName(b)));
  let paysSel = $state('SN');
  let numero = $state('');
  let etape = $state<'saisie' | 'attente' | 'code' | 'validee'>('saisie');
  let erreur = $state('');
  let busy = $state(false);
  let defi = $state<{
    id: string;
    jeton: string;
    code?: string;
    numeroAwzid?: string;
    manuel?: boolean;
    expireLe: string;
    e164: string;
  } | null>(null);
  let codeSaisi = $state('');
  let annonce = $state('');
  let minuteur: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    // indicatif proposé : +221 sur un appareil réglé à l'heure de Dakar, sinon celui du pays choisi (Sénégal par défaut)
    const dakar = Intl.DateTimeFormat().resolvedOptions().timeZone === 'Africa/Dakar';
    paysSel = dakar ? 'SN' : PLANS[pays] ? pays : 'SN';
    numero = numeroInitial;
    // validation manuelle : reprise d'une vérification commencée plus tôt sur cet appareil
    try {
      const v = JSON.parse(localStorage.getItem(CLE) ?? 'null');
      if (v && new Date(v.expireLe).getTime() > Date.now()) {
        defi = v;
        etape = 'attente';
        suivre();
      }
    } catch {
      /* stockage indisponible : rien à reprendre */
    }
  });
  onDestroy(() => arreter());

  function arreter() {
    if (minuteur) clearInterval(minuteur);
    minuteur = null;
  }
  function oublier() {
    try {
      localStorage.removeItem(CLE);
    } catch {
      /* rien */
    }
  }

  const message = $derived(defi?.code ? t('id.message_wa', { code: `AWZID ${defi.code}` }) : '');
  const lien = $derived(
    defi?.numeroAwzid && message ? lienWhatsapp(defi.numeroAwzid, message) : '',
  );

  function erreurDe(code: string | null, extra?: Record<string, unknown> | null) {
    return t(`id.erreur.${code ?? 'reseau'}`, { s: (extra?.secondes as number) ?? 60 });
  }

  async function demander(canal: 'entrant' | 'sortant') {
    erreur = '';
    const n = normaliserTelephone(numero, paysSel);
    if (!n.ok) {
      erreur = t(`id.erreur.numero_${n.raison}`);
      return;
    }
    busy = true;
    const r = await call<NonNullable<typeof defi>>('POST', '/tel/defis', {
      numero: n.e164,
      objet,
      canal,
      locale: locale(),
      ...(jetonAntibot ? { jeton: jetonAntibot } : {}),
    });
    busy = false;
    if (!r.ok || !r.data) {
      erreur = erreurDe(r.code, r.error);
      return;
    }
    defi = { ...r.data, e164: n.e164 };
    if (canal === 'sortant') {
      etape = 'code';
      return;
    }
    etape = 'attente';
    if (defi.manuel)
      try {
        localStorage.setItem(CLE, JSON.stringify(defi));
      } catch {
        /* sans stockage : la page doit rester ouverte */
      }
    suivre();
  }

  /** toutes les 3 s pendant 10 minutes, puis toutes les 30 s (validation manuelle : jusqu'à 48 h) */
  function suivre(debut = Date.now()) {
    arreter();
    const lent = Date.now() - debut > 10 * 60_000;
    minuteur = setInterval(
      async () => {
        if (!lent && Date.now() - debut > 10 * 60_000) return suivre(debut);
        if (!defi) return arreter();
        const r = await call<{ etat: string }>('POST', '/tel/defis/etat', {
          id: defi.id,
          jeton: defi.jeton,
        });
        const e = r.data?.etat;
        if (e === 'validee') valide();
        else if (e === 'expiree' || e === 'utilisee' || r.status === 404) {
          arreter();
          oublier();
          etape = 'saisie';
          erreur = t('id.erreur.expire');
        }
      },
      lent ? 30_000 : 3000,
    );
  }

  function valide() {
    arreter();
    oublier();
    etape = 'validee';
    annonce = t('id.verifie');
    if (defi) onverifie({ id: defi.id, jeton: defi.jeton, e164: defi.e164 });
  }

  async function envoyerCode(e: SubmitEvent) {
    e.preventDefault();
    if (!defi) return;
    busy = true;
    const r = await call('POST', '/tel/defis/code', {
      id: defi.id,
      jeton: defi.jeton,
      code: codeSaisi.trim(),
    });
    busy = false;
    if (r.ok) return valide();
    erreur = t(`id.erreur.${r.code ?? 'reseau'}`, { n: (r.error?.restants as number) ?? 0 });
    if (r.code === 'code_expire') etape = 'saisie';
  }

  function recommencer() {
    arreter();
    oublier();
    defi = null;
    etape = 'saisie';
    erreur = '';
  }
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- liens externes (WhatsApp) ou routes de l'API (redirection vers Google) -->

<!-- eslint-disable svelte/no-navigation-without-resolve -- liens externes (WhatsApp) ou routes de l'API (redirection vers Google) -->

<div class="verif" data-testid="verif-telephone" data-etape={etape}>
  <p class="sr" aria-live="polite"><Bidi text={annonce} /></p>
  {#if etape === 'saisie'}
    <form
      class="saisie"
      onsubmit={(e) => {
        e.preventDefault();
        void demander('entrant');
      }}
    >
      <div class="ligne">
        <div class="champ indicatif">
          <label for="tel-pays"><Bidi text={t('id.indicatif')} /></label>
          <select id="tel-pays" bind:value={paysSel} data-testid="tel-pays">
            {#each paysListe as p (p)}<option value={p}>{countryName(p)} (+{indicatifDe(p)})</option
              >{/each}
          </select>
        </div>
        <div class="champ numero">
          <label for="tel-numero"><Bidi text={t('id.numero')} /></label>
          <input
            id="tel-numero"
            type="tel"
            inputmode="tel"
            autocomplete="tel-national"
            dir="ltr"
            required
            bind:value={numero}
            aria-describedby="tel-numero-aide"
            data-testid="tel-numero"
          />
        </div>
      </div>
      <p class="aide" id="tel-numero-aide"><Bidi text={t('id.numero_aide')} /></p>
      {#if erreur}<p class="alerte" role="alert" data-testid="tel-erreur">
          <Bidi text={erreur} />
        </p>{/if}
      <button type="submit" class="primary grand" disabled={busy} data-testid="tel-verifier"
        ><Bidi text={t('id.verifier_wa')} /></button
      >
    </form>
  {:else if etape === 'attente' && defi}
    <div class="attente">
      <p><Bidi text={t(defi.manuel ? 'id.etape_envoyer_manuel' : 'id.etape_envoyer')} /></p>
      <p class="message" dir="ltr" data-testid="tel-message"><Bidi text={message} /></p>
      <a
        class="button primary grand"
        href={lien}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="tel-ouvrir-wa"><Bidi text={t('id.ouvrir_wa')} /></a
      >
      <p class="statut" role="status" data-testid="tel-statut">
        <span class="point" aria-hidden="true"></span>
        <Bidi text={t(defi.manuel ? 'id.attente_manuelle' : 'id.attente')} />
      </p>
      <details class="aide-envoi">
        <summary><Bidi text={t('id.pas_recu')} /></summary>
        <p><Bidi text={t('id.pas_recu_aide', { numero: defi.numeroAwzid ?? '' })} /></p>
        <div class="actions">
          <button type="button" onclick={recommencer} data-testid="tel-recommencer"
            ><Bidi text={t('id.recommencer')} /></button
          >
          {#if envoi}
            <button
              type="button"
              onclick={() => demander('sortant')}
              disabled={busy}
              data-testid="tel-code-sms"><Bidi text={t('id.recevoir_code')} /></button
            >
          {/if}
        </div>
      </details>
      {#if erreur}<p class="alerte" role="alert"><Bidi text={erreur} /></p>{/if}
    </div>
  {:else if etape === 'code'}
    <form class="saisie" onsubmit={envoyerCode}>
      <label for="tel-code"><Bidi text={t('id.code_recu')} /></label>
      <input
        id="tel-code"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="6"
        pattern={'[0-9]{6}'}
        dir="ltr"
        required
        bind:value={codeSaisi}
        data-testid="tel-code"
      />
      {#if erreur}<p class="alerte" role="alert"><Bidi text={erreur} /></p>{/if}
      <button type="submit" class="primary grand" disabled={busy}
        ><Bidi text={t('id.valider_code')} /></button
      >
      <button type="button" class="lien" onclick={recommencer}
        ><Bidi text={t('id.recommencer')} /></button
      >
    </form>
  {:else}
    <p class="ok" role="status" data-testid="tel-verifie"><Bidi text={t('id.verifie')} /></p>
  {/if}
</div>

<style>
  .verif,
  .saisie,
  .attente {
    display: grid;
    gap: 12px;
  }
  .ligne {
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
    gap: 10px;
  }
  .champ {
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  label {
    font-family: var(--font-title);
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--navy);
  }
  input,
  select {
    width: 100%;
    min-height: 50px;
    padding: 8px 12px;
    border-radius: 12px;
    box-sizing: border-box;
    font: inherit;
  }
  .aide {
    margin: 0;
    font-size: 0.9rem;
    color: var(--ink2);
  }
  .grand {
    min-height: 54px;
    border-radius: 14px;
    font-family: var(--font-title);
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
  }
  .message {
    margin: 0;
    padding: 14px;
    border-radius: 12px;
    background: var(--surface);
    border: 1px dashed var(--line);
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .statut {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    color: var(--ink2);
  }
  .point {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--primary);
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.3;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .point {
      animation: none;
    }
  }
  .aide-envoi summary {
    min-height: 44px;
    display: flex;
    align-items: center;
    cursor: pointer;
    font-weight: 700;
    color: var(--teal);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .actions button {
    min-height: 44px;
  }
  .alerte {
    margin: 0;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--bad-bg);
    color: var(--bad-ink);
    font-weight: 700;
  }
  .ok {
    margin: 0;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--ok-bg);
    color: var(--ok-ink);
    font-weight: 700;
  }
  .lien {
    background: none;
    border: 0;
    min-height: 44px;
    color: var(--teal);
    text-decoration: underline;
    font: inherit;
    cursor: pointer;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  @media (max-width: 30rem) {
    .ligne {
      grid-template-columns: 1fr;
    }
  }
</style>
