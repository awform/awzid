<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { fmtDate, locale, t } from '$lib/i18n';
  import { call } from '$lib/session';
  import GroupeBeta from './GroupeBeta.svelte';

  /**
   * Bêta — espace de l'administrateur (second facteur) :
   *  - TABLEAU DE BORD : nombre de comptes et plafond, coût estimé du jour, plafonds de consommation par utilisateur,
   *    alertes ;
   *  - MODE D'ACCÈS en UNE action, sans redéploiement : fermé (page de maintenance pour tous sauf les administrateurs),
   *    sur invitation (code requis), ouvert (inscription libre sous un PLAFOND de comptes ; plein, liste d'attente
   *    automatique) ; retour arrière = choisir le mode d'avant ;
   *  - vérification de l'adresse e-mail et protection anti-robots ;
   *  - invitations : création (usage unique ou limité, durée, adresse = invitation personnelle, envoi par e-mail),
   *    liste avec état, révocation. Le code et le lien ne sont montrés qu'UNE fois, à la création ;
   *  - liste d'attente : accepter (une invitation personnelle est créée et envoyée) ou refuser.
   */
  type Mode = 'ferme' | 'invitation' | 'ouvert';
  interface Reglages {
    mode: Mode;
    inscription: 'ouverte' | 'invitation';
    site: 'ouvert' | 'ferme';
    bandeau: 'on' | 'off';
    plafond: number;
    verification: 'requise' | 'souple';
    antibot: 'on' | 'off';
    qf_profils_enfants: 'on' | 'off';
    /** lot 11 : groupe donné en acceptant la liste d'attente pendant la bêta */
    attente_groupe?: 'beta_fermee' | 'aucun';
  }
  interface Invitation {
    id: string;
    fin: string;
    libelle: string | null;
    adresse: string | null;
    max: number;
    usages: number;
    expireLe: string | null;
    etat: 'active' | 'expiree' | 'revoquee' | 'epuisee';
    creeeLe: string;
    groupe?: string | null;
    /** lot 11 : comptes créés avec l'invitation (sans adresse) */
    comptes?: number;
    compteCreeLe?: string | null;
    comptesGroupe?: number;
  }
  interface Demande {
    id: string;
    adresse: string;
    nom: string | null;
    mot: string | null;
    langue: string;
    creeeLe: string;
  }
  interface Cree {
    code: string;
    lien: string | null;
    envoye: boolean;
    expireLe: string | null;
  }
  interface Tableau {
    comptes: {
      total: number;
      plafond: number;
      pourcentPlafond: number;
      dernieres24h: number;
      septJours: number;
      nonVerifies: number;
    };
    attente: { enAttente: number; invitationsActives: number };
    couts: {
      tuteurUsd: number;
      tuteurQuestions: number;
      stockageOctets: number;
      fixeJourEur: number;
      estimeJourEur: number;
    };
    plafonds: Array<{ cle: string; valeur: string }>;
    alertes: Array<{ code: string; niveau: string }>;
  }

  const MODES: Mode[] = ['ferme', 'invitation', 'ouvert'];
  let acces = $state<Reglages | null>(null);
  let tableau = $state<Tableau | null>(null);
  let plafondSaisi = $state(200);
  let invitations = $state<Invitation[]>([]);
  let attente = $state<Demande[]>([]);
  let cree = $state<Cree | null>(null);
  let libelle = $state('');
  let adresse = $state('');
  let max = $state(1);
  let jours = $state(30);
  let envoyer = $state(true);
  // lot 6 : l'invitation inscrit le compte dans le groupe "bêta fermée"
  let groupe = $state(false);
  let erreur = $state('');
  let copie = $state(false);

  async function charger() {
    const r = await call<{ acces: Reglages; invitations: Invitation[] }>('GET', '/admin/acces');
    if (r.ok && r.data) {
      acces = r.data.acces;
      plafondSaisi = r.data.acces.plafond;
      invitations = r.data.invitations;
    }
    const a = await call<{ demandes: Demande[] }>('GET', '/admin/liste-attente?statut=en_attente');
    attente = a.ok && a.data ? a.data.demandes : [];
    const d = await call<Tableau>('GET', '/admin/tableau');
    tableau = d.ok ? d.data : null;
  }
  onMount(charger);

  async function regler(patch: Partial<Reglages>) {
    const r = await call<{ acces: Reglages }>('PUT', '/admin/acces', patch);
    if (r.ok && r.data) {
      acces = r.data.acces;
      plafondSaisi = r.data.acces.plafond;
      const d = await call<Tableau>('GET', '/admin/tableau');
      tableau = d.ok ? d.data : null;
    }
  }
  async function choisirMode(m: Mode) {
    if (!acces || acces.mode === m) return;
    if (m === 'ferme' && !confirm(t('acces.confirmer_fermer'))) return;
    await regler({ mode: m });
  }

  async function creer(e: SubmitEvent) {
    e.preventDefault();
    erreur = '';
    cree = null;
    copie = false;
    const adr = adresse.trim();
    const r = await call<Cree>('POST', '/admin/invitations', {
      ...(libelle.trim() ? { libelle: libelle.trim() } : {}),
      ...(adr ? { adresse: adr, envoyer, langue: locale() } : { max }),
      jours,
      ...(groupe ? { groupe: 'beta_fermee' } : {}),
    });
    if (!r.ok || !r.data) {
      erreur = r.code ?? 'erreur';
      return;
    }
    cree = r.data;
    libelle = '';
    adresse = '';
    await charger();
  }
  async function copier(texte: string) {
    try {
      await navigator.clipboard.writeText(texte);
      copie = true;
    } catch {
      /* copie manuelle */
    }
  }
  async function revoquer(id: string) {
    await call('POST', `/admin/invitations/${id}/revoquer`, {});
    await charger();
  }
  async function accepter(id: string) {
    const r = await call<Cree>('POST', `/admin/liste-attente/${id}/accepter`, {});
    if (r.ok && r.data) cree = r.data;
    await charger();
  }
  async function refuser(id: string) {
    await call('POST', `/admin/liste-attente/${id}/refuser`, {});
    await charger();
  }
  /* droit a l'effacement : efface la demande (journal d'audit attente.effacement, sans adresse) */
  async function effacer(id: string) {
    if (!confirm(t('acces.att_confirmer_effacer'))) return;
    await call('DELETE', `/admin/liste-attente/${id}`);
    await charger();
  }
</script>

<section class="card" data-testid="admin-acces">
  <h2><Bidi text={t('acces.titre')} /></h2>
  <p class="muted"><Bidi text={t('acces.intro')} /></p>

  {#if tableau}
    <div class="tableau" data-testid="admin-tableau">
      <h3><Bidi text={t('tab.titre')} /></h3>
      <dl>
        <dt><Bidi text={t('tab.comptes')} /></dt>
        <dd data-testid="tab-comptes">
          <Bidi
            text={t('tab.comptes_val', {
              n: tableau.comptes.total,
              max: tableau.comptes.plafond,
              pct: tableau.comptes.pourcentPlafond,
            })}
          />
          · <Bidi
            text={t('tab.nouveaux', {
              h: tableau.comptes.dernieres24h,
              j: tableau.comptes.septJours,
            })}
          />
          · <Bidi text={t('tab.non_verifies', { n: tableau.comptes.nonVerifies })} />
        </dd>
        <dd>
          <Bidi
            text={t('tab.attente', {
              n: tableau.attente.enAttente,
              i: tableau.attente.invitationsActives,
            })}
          />
        </dd>
        <dt><Bidi text={t('tab.cout')} /></dt>
        <dd data-testid="tab-cout">
          <Bidi
            text={t('tab.cout_val', {
              eur: tableau.couts.estimeJourEur,
              fixe: tableau.couts.fixeJourEur,
              tuteur: tableau.couts.tuteurUsd,
              q: tableau.couts.tuteurQuestions,
            })}
          />
          · <Bidi
            text={t('tab.stockage', { mo: Math.round(tableau.couts.stockageOctets / 1048576) })}
          />
        </dd>
        <dt><Bidi text={t('tab.plafonds')} /></dt>
        <dd>
          <ul class="plafonds">
            {#each tableau.plafonds as p (p.cle)}
              <li>
                <strong><Bidi text={t(`tab.p_${p.cle}`)} /></strong> : <Bidi text={p.valeur} />
              </li>
            {/each}
          </ul>
        </dd>
      </dl>
      <ul class="alertes" data-testid="tab-alertes">
        {#each tableau.alertes as a (a.code)}
          <li data-niveau={a.niveau} data-code={a.code}><Bidi text={t(`tab.al_${a.code}`)} /></li>
        {:else}
          <li class="muted"><Bidi text={t('tab.aucune_alerte')} /></li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if acces}
    <fieldset class="modes" data-testid="acces-modes" data-mode={acces.mode}>
      <legend><Bidi text={t('acces.mode')} /></legend>
      {#each MODES as m (m)}
        <label class="mode" class:actif={acces.mode === m}
          ><input
            type="radio"
            name="mode-acces"
            value={m}
            checked={acces.mode === m}
            onchange={() => choisirMode(m)}
            data-testid={`mode-${m}`}
          />
          <span
            ><strong><Bidi text={t(`acces.mode_${m}`)} /></strong><br /><span class="muted"
              ><Bidi text={t(`acces.mode_aide_${m}`)} /></span
            ></span
          ></label
        >
      {/each}
    </fieldset>

    <form
      class="ligne"
      onsubmit={(e) => {
        e.preventDefault();
        void regler({ plafond: plafondSaisi });
      }}
    >
      <label for="acces-plafond"><Bidi text={t('acces.plafond')} /></label>
      <input
        id="acces-plafond"
        type="number"
        min="0"
        max="1000000"
        required
        bind:value={plafondSaisi}
        data-testid="acces-plafond"
      />
      <button type="submit" data-testid="acces-plafond-ok"
        ><Bidi text={t('acces.plafond_enregistrer')} /></button
      >
    </form>

    <p class="ligne">
      <strong><Bidi text={t('acces.verification')} /></strong> :
      <span data-testid="acces-verification"
        ><Bidi
          text={acces.verification === 'requise' ? t('acces.requise') : t('acces.souple')}
        /></span
      >
      <button
        type="button"
        onclick={() =>
          regler({ verification: acces?.verification === 'requise' ? 'souple' : 'requise' })}
        data-testid="acces-basculer-verification"><Bidi text={t('acces.changer')} /></button
      >
    </p>
    <p class="ligne">
      <strong><Bidi text={t('acces.antibot')} /></strong> :
      <span data-testid="acces-antibot"
        ><Bidi text={acces.antibot === 'on' ? t('acces.active') : t('acces.desactive')} /></span
      >
      <button
        type="button"
        onclick={() => regler({ antibot: acces?.antibot === 'on' ? 'off' : 'on' })}
        data-testid="acces-basculer-antibot"><Bidi text={t('acces.changer')} /></button
      >
    </p>
    <p class="ligne">
      <strong><Bidi text={t('acces.qf_enfants')} /></strong> :
      <span data-testid="acces-qf-enfants"
        ><Bidi
          text={acces.qf_profils_enfants === 'on' ? t('acces.active') : t('acces.desactive')}
        /></span
      >
      <button
        type="button"
        onclick={() =>
          regler({ qf_profils_enfants: acces?.qf_profils_enfants === 'on' ? 'off' : 'on' })}
        data-testid="acces-basculer-qf-enfants"><Bidi text={t('acces.changer')} /></button
      >
    </p>
    <p class="muted"><Bidi text={t('acces.qf_enfants_aide')} /></p>
    <p class="ligne">
      <strong><Bidi text={t('acces.attente_groupe')} /></strong> :
      <span data-testid="acces-attente-groupe"
        ><Bidi
          text={acces.attente_groupe === 'aucun' ? t('acces.desactive') : t('acces.active')}
        /></span
      >
      <button
        type="button"
        onclick={() =>
          regler({ attente_groupe: acces?.attente_groupe === 'aucun' ? 'beta_fermee' : 'aucun' })}
        data-testid="acces-basculer-attente-groupe"><Bidi text={t('acces.changer')} /></button
      >
    </p>
    <p class="muted"><Bidi text={t('acces.attente_groupe_aide')} /></p>
    <p class="ligne">
      <strong><Bidi text={t('acces.bandeau')} /></strong> :
      <span data-testid="acces-bandeau"
        ><Bidi
          text={acces.bandeau === 'on' ? t('acces.bandeau_on') : t('acces.bandeau_off')}
        /></span
      >
      <button
        type="button"
        onclick={() => regler({ bandeau: acces?.bandeau === 'on' ? 'off' : 'on' })}
        data-testid="acces-basculer-bandeau"><Bidi text={t('acces.changer')} /></button
      >
    </p>
  {/if}

  <h3><Bidi text={t('acces.inv_titre')} /></h3>
  <form class="creation" onsubmit={creer}>
    <label for="inv-libelle"><Bidi text={t('acces.inv_libelle')} /></label>
    <input id="inv-libelle" maxlength="80" bind:value={libelle} data-testid="inv-libelle" />
    <label for="inv-adresse"><Bidi text={t('acces.inv_adresse')} /></label>
    <input
      id="inv-adresse"
      type="email"
      maxlength="254"
      bind:value={adresse}
      data-testid="inv-adresse"
    />
    {#if !adresse.trim()}
      <label for="inv-max"><Bidi text={t('acces.inv_max')} /></label>
      <input id="inv-max" type="number" min="1" max="1000" bind:value={max} data-testid="inv-max" />
    {:else}
      <label class="check"
        ><input type="checkbox" bind:checked={envoyer} />
        <span><Bidi text={t('acces.inv_envoyer')} /></span></label
      >
    {/if}
    <label for="inv-jours"><Bidi text={t('acces.inv_jours')} /></label>
    <input id="inv-jours" type="number" min="0" max="365" bind:value={jours} />
    <label class="check"
      ><input type="checkbox" bind:checked={groupe} data-testid="inv-groupe" />
      <span><Bidi text={t('gb.invitation')} /></span></label
    >
    {#if erreur}<p class="error" role="alert"><Bidi text={erreur} /></p>{/if}
    <button type="submit" class="primary" data-testid="inv-creer"
      ><Bidi text={t('acces.inv_creer')} /></button
    >
  </form>

  {#if cree}
    <div class="card cree" role="status" data-testid="inv-cree">
      <p><strong><Bidi text={t('acces.inv_unique')} /></strong></p>
      <p><code dir="ltr" data-testid="inv-code"><Bidi text={cree.code} /></code></p>
      {#if cree.lien}<p>
          <code dir="ltr" class="lien" data-testid="inv-lien"><Bidi text={cree.lien} /></code>
        </p>{/if}
      <p>
        <button type="button" onclick={() => copier(cree?.lien ?? cree?.code ?? '')}
          ><Bidi text={copie ? '✓' : ''} /> <Bidi text={t('acces.inv_copier')} /></button
        >
      </p>
      <p class="muted">
        <Bidi text={cree.envoye ? t('acces.inv_envoyee') : t('acces.inv_non_envoyee')} />
      </p>
    </div>
  {/if}

  <ul class="stack" data-testid="inv-liste">
    {#each invitations as i (i.id)}
      <li class="card" data-etat={i.etat}>
        <p>
          <strong><Bidi text={i.libelle ?? i.adresse ?? '—'} /></strong>
          · <Bidi text={t(`acces.inv_etat_${i.etat}`)} /> ·
          <Bidi text={t('acces.inv_usages', { n: i.usages, max: i.max })} />
          · <span class="muted"><Bidi text={t('acces.inv_fin', { fin: i.fin })} /></span>
          {#if i.expireLe}<span class="muted"> · {fmtDate(i.expireLe)}</span>{/if}
        </p>
        {#if i.comptes && i.compteCreeLe}<p class="muted small" data-testid="inv-comptes">
            <Bidi
              text={i.comptes === 1
                ? t('acces.inv_compte_cree', { date: fmtDate(i.compteCreeLe) })
                : t('acces.inv_comptes_crees', { n: i.comptes, date: fmtDate(i.compteCreeLe) })}
            />
            ·
            <Bidi
              text={i.comptes === 1
                ? i.comptesGroupe
                  ? t('acces.inv_dans_groupe')
                  : t('acces.inv_hors_groupe')
                : t('acces.inv_comptes_groupe', { n: i.comptesGroupe ?? 0 })}
            />
          </p>{/if}
        {#if i.etat === 'active'}
          <button type="button" class="ghost" onclick={() => revoquer(i.id)}
            ><Bidi text={t('acces.inv_revoquer')} /></button
          >
        {/if}
      </li>
    {:else}
      <li class="muted"><Bidi text={t('acces.inv_aucune')} /></li>
    {/each}
  </ul>

  <GroupeBeta />

  <h3>
    <Bidi text={t('acces.att_titre')} />
    <span class="muted">· <Bidi text={t('acces.att_en_attente', { n: attente.length })} /></span>
  </h3>
  <ul class="stack" data-testid="attente-liste">
    {#each attente as d (d.id)}
      <li class="card" data-testid="attente-demande">
        <p>
          <strong><Bidi text={d.adresse} /></strong>
          {#if d.nom}
            · <Bidi text={d.nom} />{/if} · <span class="muted">{fmtDate(d.creeeLe)}</span>
        </p>
        {#if d.mot}<p><Bidi text={d.mot} /></p>{/if}
        <p>
          <button
            type="button"
            class="primary"
            onclick={() => accepter(d.id)}
            data-testid="attente-accepter"><Bidi text={t('acces.att_accepter')} /></button
          >
          <button type="button" class="ghost" onclick={() => refuser(d.id)}
            ><Bidi text={t('acces.att_refuser')} /></button
          >
          <button
            type="button"
            class="ghost"
            onclick={() => effacer(d.id)}
            data-testid="attente-effacer"><Bidi text={t('acces.att_effacer')} /></button
          >
        </p>
      </li>
    {:else}
      <li class="muted"><Bidi text={t('acces.att_aucune')} /></li>
    {/each}
  </ul>
</section>

<style>
  .creation {
    display: grid;
    gap: 8px;
    max-width: 520px;
  }
  .creation input:not([type='checkbox']),
  .ligne input {
    font: inherit;
    min-height: 44px;
    padding: 6px 10px;
    border: 2px solid var(--line);
    border-radius: 10px;
  }
  .check {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .stack {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .cree code {
    font-size: 1.1rem;
    word-break: break-all;
  }
  .cree .lien {
    font-size: 0.9rem;
  }
  .error {
    color: var(--bad-ink);
    font-weight: 700;
  }
  .ligne {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .modes {
    display: grid;
    gap: 8px;
    border: 2px solid var(--line);
    border-radius: 12px;
    margin: 12px 0;
  }
  .mode {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    min-height: 48px;
    padding: 6px;
    border-radius: 10px;
  }
  .mode.actif {
    background: var(--primary-soft);
  }
  .mode input {
    width: 24px;
    height: 24px;
    flex: none;
  }
  .tableau dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 4px 12px;
  }
  .tableau dt {
    font-weight: 700;
  }
  .tableau dd {
    margin: 0;
  }
  .plafonds,
  .alertes {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .alertes li {
    padding: 6px 8px;
    border-radius: 8px;
    margin: 4px 0;
    background: var(--primary-soft);
  }
  .alertes li[data-niveau='attention'] {
    background: var(--warn-bg);
    color: var(--warn-ink);
  }
  .alertes li[data-niveau='critique'] {
    background: var(--bad-bg, var(--warn-bg));
    color: var(--bad-ink);
    font-weight: 700;
  }
</style>
