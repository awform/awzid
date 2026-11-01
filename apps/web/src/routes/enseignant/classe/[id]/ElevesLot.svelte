<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { locale, t } from '$lib/i18n';
  import { call } from '$lib/session';
  import { lireListeEleves, LOT_MAX, type ColonneAmbigue } from '@awform/school/eleves-lot';

  /**
   * V2-5 : l'enseignant crée les comptes de ses élèves en liste (saisie, ou collage depuis un tableur), imprime la
   * fiche de la classe (PDF, une étiquette par élève) et envoie l'identifiant aux parents par WhatsApp (jamais le mot
   * de passe). Les mots de passe ne vivent que dans cet écran : ils ne sont ni gardés sur l'appareil ni renvoyés par
   * le serveur après la création ; l'enseignant peut en recréer un à tout moment.
   * Chargé à la demande (page de l'enseignant seulement).
   */
  let {
    classeId,
    onferme,
    onchange,
  }: { classeId: string; onferme: () => void; onchange: () => void } = $props();

  interface Ligne {
    prenom: string;
    annee: string;
  }
  interface Compte {
    pupilId: string;
    prenom: string;
    identifiant: string | null;
    whatsapp: string | null;
    /** présent seulement juste après la création ou la recréation */
    motDePasse?: string;
  }

  let lignes = $state<Ligne[]>([
    { prenom: '', annee: '' },
    { prenom: '', annee: '' },
    { prenom: '', annee: '' },
  ]);
  let collerOuvert = $state(false);
  let collage = $state('');
  /** plusieurs colonnes de texte, aucune reconnue comme « prénom » : l'enseignant choisit */
  let ambigu = $state<ColonneAmbigue | null>(null);
  let colonne = $state('0');
  /** clé d'idempotence du lot : un double envoi (ou un nouvel essai après coupure) ne crée qu'un lot */
  let cle = $state(crypto.randomUUID());
  let rejets = $state<string[]>([]);
  let accord = $state(false);
  let motDePasse = $state('');
  let erreur = $state('');
  let info = $state('');
  let busy = $state(false);
  let comptes = $state<Compte[]>([]);
  /** vrai après la création : la fiche (avec les mots de passe) est à l'écran */
  let fiche = $state(false);

  const remplies = $derived(lignes.filter((l) => l.prenom.trim() || l.annee.trim()));

  async function charger() {
    const r = await call<{ eleves: Compte[] }>(
      'GET',
      `/ecole/classes/${classeId}/eleves/acces?langue=${locale()}`,
    );
    if (r.ok && r.data) {
      // les mots de passe déjà affichés restent tant que l'écran est ouvert
      const gardes = new Map(comptes.map((c) => [c.pupilId, c.motDePasse]));
      comptes = r.data.eleves.map((c) => ({ ...c, motDePasse: gardes.get(c.pupilId) }));
    }
  }
  onMount(charger);

  function motif(code: string): string {
    return t(`elv.motif_${code}`);
  }

  /** choix de l'enseignant quand le collage est ambigu (colonne du prénom, ordre nom / prénom) */
  let colonneChoisie: number | undefined;
  let ordreChoisi: 'nom-prenom' | 'prenom-nom' | undefined;
  let ordre = $state<'nom-prenom' | 'prenom-nom'>('nom-prenom');

  function lireCollage() {
    colonneChoisie = undefined;
    ordreChoisi = undefined;
    lire();
  }
  function confirmerChoix() {
    if (ambigu?.ordre) ordreChoisi = ordre;
    else colonneChoisie = Number(colonne);
    lire();
  }
  function lire() {
    const r = lireListeEleves(collage, undefined, colonneChoisie, ordreChoisi);
    if (r.ambigu) {
      ambigu = r.ambigu;
      colonne = String(r.ambigu.colonnes[0]?.index ?? 0);
      rejets = [];
      info = '';
      return;
    }
    ambigu = null;
    const neuves = r.eleves.map((e) => ({ prenom: e.prenom, annee: String(e.annee) }));
    lignes = [...lignes.filter((l) => l.prenom.trim() || l.annee.trim()), ...neuves].slice(
      0,
      LOT_MAX,
    );
    rejets = r.rejets.map((x) => t('elv.coller_rejet', { ligne: x.ligne, motif: motif(x.code) }));
    info = t('elv.coller_n', { n: neuves.length });
    if (!rejets.length) {
      collage = '';
      collerOuvert = false;
    }
  }

  async function creer(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    erreur = '';
    info = '';
    if (!remplies.length) return void (erreur = t('elv.erreur_vide'));
    const eleves = remplies.map((l) => ({ prenom: l.prenom.trim(), annee: Number(l.annee) }));
    if (eleves.some((x) => !x.prenom || !Number.isInteger(x.annee)))
      return void (erreur = t('elv.erreur_incomplet'));
    if (!accord) return void (erreur = t('elv.accord_requis'));
    if (!motDePasse) return void (erreur = t('elv.mdp_requis'));
    busy = true;
    const r = await call<{
      eleves: Array<{
        pupilId: string;
        prenom: string;
        identifiant: string;
        motDePasse: string;
        whatsapp: string;
      }>;
    }>('POST', `/ecole/classes/${classeId}/eleves/lot`, {
      eleves,
      accordParents: true,
      password: motDePasse,
      langue: locale(),
      cle,
    });
    busy = false;
    motDePasse = '';
    if (!r.ok || !r.data) {
      const lignesKo =
        (r.error?.lignes as Array<{ ligne: number; code: string }> | undefined) ?? [];
      erreur = lignesKo.length
        ? lignesKo
            .map((x) => t('elv.coller_rejet', { ligne: x.ligne, motif: t(`erreur.${x.code}`) }))
            .join(' · ')
        : t(`erreur.${r.code ?? 'reseau'}`);
      return;
    }
    comptes = [
      ...r.data.eleves.map((x) => ({
        pupilId: x.pupilId,
        prenom: x.prenom,
        identifiant: x.identifiant,
        whatsapp: x.whatsapp,
        motDePasse: x.motDePasse,
      })),
    ];
    fiche = true;
    cle = crypto.randomUUID();
    lignes = [
      { prenom: '', annee: '' },
      { prenom: '', annee: '' },
      { prenom: '', annee: '' },
    ];
    accord = false;
    onchange();
  }

  /** étiquettes PDF : POST (les mots de passe viennent de cet écran, jamais d'une adresse) */
  async function imprimer(liste: Compte[]) {
    erreur = '';
    const eleves = liste
      .filter((c) => c.motDePasse)
      .map((c) => ({ pupilId: c.pupilId, motDePasse: c.motDePasse }));
    if (!eleves.length) return;
    try {
      const rep = await fetch(`/api/v1/ecole/classes/${classeId}/fiche.pdf`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-awform': '1' },
        credentials: 'same-origin',
        body: JSON.stringify({ eleves }),
      });
      if (rep.status === 422) return void (erreur = t('elv.pdf_non_imprimable'));
      if (!rep.ok) return void (erreur = t('elv.pdf_erreur'));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await rep.blob());
      a.download = 'fiche-classe.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch {
      erreur = t('elv.pdf_erreur');
    }
  }

  async function recreer(c: Compte) {
    erreur = '';
    info = '';
    if (!motDePasse) return void (erreur = t('elv.mdp_requis'));
    const r = await call<{ motDePasse: string }>(
      'POST',
      `/ecole/pupils/${c.pupilId}/mot-de-passe`,
      {
        password: motDePasse,
      },
    );
    motDePasse = '';
    if (!r.ok || !r.data) return void (erreur = t(`erreur.${r.code ?? 'reseau'}`));
    comptes = comptes.map((x) =>
      x.pupilId === c.pupilId ? { ...x, motDePasse: r.data!.motDePasse } : x,
    );
    info = t('elv.mdp_recree', { nom: c.prenom });
  }

  async function debloquer(c: Compte) {
    erreur = '';
    info = '';
    if (!motDePasse) return void (erreur = t('elv.mdp_requis'));
    const r = await call('POST', `/ecole/pupils/${c.pupilId}/mot-de-passe`, {
      password: motDePasse,
      debloquer: true,
    });
    motDePasse = '';
    if (!r.ok) return void (erreur = t(`erreur.${r.code ?? 'reseau'}`));
    info = t('elv.debloque', { nom: c.prenom });
  }

  function terminer() {
    // les mots de passe quittent l'écran
    comptes = comptes.map((c) => ({ ...c, motDePasse: undefined }));
    fiche = false;
    onferme();
  }
  const avecMdp = $derived(comptes.filter((c) => c.motDePasse));
</script>

<section class="card lot" data-testid="eleves-lot" aria-labelledby="elv-titre">
  <div class="tete">
    <h2 id="elv-titre"><Bidi text={t('elv.titre')} /></h2>
    <button type="button" class="small" onclick={terminer} data-testid="elv-fermer"
      ><Bidi text={t(fiche ? 'elv.termine' : 'elv.fermer')} /></button
    >
  </div>
  {#if erreur}<p class="bad" role="alert" data-testid="elv-erreur"><Bidi text={erreur} /></p>{/if}
  {#if info}<p class="ok" role="status" data-testid="elv-info"><Bidi text={info} /></p>{/if}

  {#if fiche}
    <p class="aide" data-testid="elv-fiche-aide">
      <strong><Bidi text={t('elv.fiche_titre', { n: avecMdp.length })} /></strong>
      <Bidi text={t('elv.fiche_aide')} />
    </p>
    <div class="actions">
      <button
        type="button"
        class="primary"
        onclick={() => imprimer(avecMdp)}
        data-testid="elv-imprimer"><Bidi text={t('elv.imprimer')} /></button
      >
    </div>
  {:else}
    <p class="aide"><Bidi text={t('elv.aide')} /></p>
    <label class="mdp"
      ><span><Bidi text={t('elv.mdp')} /></span>
      <input
        type="password"
        bind:value={motDePasse}
        autocomplete="current-password"
        data-testid="elv-mdp"
      />
    </label>
    <form onsubmit={creer} novalidate>
      <div class="liste" role="table" aria-label={t('elv.titre')}>
        <div class="ligne tete-l petit" role="row">
          <span><Bidi text={t('elv.prenom')} /></span><span><Bidi text={t('elv.annee')} /></span
          ><span></span>
        </div>
        {#each lignes as l, i (i)}
          <div class="ligne" role="row">
            <input
              bind:value={l.prenom}
              maxlength="40"
              autocomplete="off"
              aria-label={t('elv.prenom_n', { n: i + 1 })}
              data-testid="elv-prenom-{i}"
            />
            <input
              bind:value={l.annee}
              inputmode="numeric"
              maxlength="4"
              autocomplete="off"
              aria-label={t('elv.annee_n', { n: i + 1 })}
              data-testid="elv-annee-{i}"
            />
            {#if lignes.length > 1}
              <button
                type="button"
                class="suppr"
                aria-label={t('elv.retirer')}
                onclick={() => (lignes = lignes.filter((_, k) => k !== i))}>×</button
              >
            {:else}<span></span>{/if}
          </div>
        {/each}
      </div>
      <div class="actions">
        <button
          type="button"
          class="lien"
          onclick={() => {
            if (lignes.length < LOT_MAX) lignes = [...lignes, { prenom: '', annee: '' }];
          }}
          data-testid="elv-ajouter-ligne"><Bidi text={t('elv.ajouter_ligne')} /></button
        >
        <button
          type="button"
          class="lien"
          aria-expanded={collerOuvert}
          onclick={() => (collerOuvert = !collerOuvert)}
          data-testid="elv-coller"><Bidi text={t('elv.coller')} /></button
        >
      </div>
      {#if collerOuvert}
        <div class="coller">
          <label for="elv-collage"><Bidi text={t('elv.coller_aide')} /></label>
          <textarea
            id="elv-collage"
            rows="6"
            bind:value={collage}
            data-testid="elv-collage"
            spellcheck="false"
            oninput={() => (ambigu = null)}></textarea>
          {#if ambigu}
            <div class="ambigu" role="group" aria-labelledby="elv-col-t" data-testid="elv-ambigu">
              {#if ambigu.ordre}
                <p id="elv-col-t"><Bidi text={t('elv.ordre_titre')} /></p>
                <p class="petit"><Bidi text={ambigu.apercu[0] ?? ''} /></p>
                <select bind:value={ordre} data-testid="elv-ordre" aria-labelledby="elv-col-t">
                  <option value="nom-prenom" label={t('elv.ordre_nom_prenom')}></option>
                  <option value="prenom-nom" label={t('elv.ordre_prenom_nom')}></option>
                </select>
              {:else}
                <p id="elv-col-t"><Bidi text={t('elv.colonne_titre')} /></p>
                <select bind:value={colonne} data-testid="elv-colonne" aria-labelledby="elv-col-t">
                  {#each ambigu.colonnes as c (c.index)}
                    <option
                      value={String(c.index)}
                      label={`${c.titre} — ${ambigu.apercu[c.index] ?? ''}`}
                    ></option>
                  {/each}
                </select>
              {/if}
              <button type="button" onclick={confirmerChoix} data-testid="elv-colonne-ok"
                ><Bidi text={t('elv.colonne_prendre')} /></button
              >
            </div>
          {/if}
          <button type="button" onclick={lireCollage} data-testid="elv-lire"
            ><Bidi text={t('elv.coller_lire')} /></button
          >
          {#if rejets.length}
            <ul class="bad" data-testid="elv-rejets">
              {#each rejets as r (r)}<li><Bidi text={r} /></li>{/each}
            </ul>
          {/if}
        </div>
      {/if}
      <label class="case">
        <input type="checkbox" bind:checked={accord} data-testid="elv-accord" />
        <span><Bidi text={t('elv.accord')} /></span>
      </label>
      <button type="submit" class="primary" disabled={busy} data-testid="elv-creer"
        ><Bidi text={t('elv.creer', { n: remplies.length })} /></button
      >
    </form>
  {/if}

  {#if comptes.length}
    <h3 id="elv-comptes"><Bidi text={t('elv.comptes_titre')} /></h3>
    {#if fiche || comptes.some((c) => c.identifiant)}
      <p class="petit"><Bidi text={t('elv.whatsapp_aide')} /></p>
    {/if}

    <div class="tab">
      <table aria-labelledby="elv-comptes" data-testid="elv-comptes">
        <thead>
          <tr>
            <th scope="col"><Bidi text={t('elv.col_prenom')} /></th>
            <th scope="col"><Bidi text={t('elv.col_identifiant')} /></th>
            <th scope="col"><Bidi text={t('elv.col_mdp')} /></th>
            <th scope="col"><Bidi text={t('elv.col_actions')} /></th>
          </tr>
        </thead>
        <tbody>
          {#each comptes as c (c.pupilId)}
            <tr data-testid="elv-ligne-{c.prenom}">
              <td><Bidi text={c.prenom} /></td>
              <td class="id" data-testid="elv-id"
                >{#if c.identifiant}<Bidi text={c.identifiant} />{:else}<span class="petit"
                    ><Bidi text={t('elv.sans_acces')} /></span
                  >{/if}</td
              >
              <td class="id" data-testid="elv-mdp-eleve"
                ><Bidi text={c.motDePasse ?? '••••••••'} /></td
              >
              <td class="act">
                {#if c.whatsapp}
                  <!-- eslint-disable svelte/no-navigation-without-resolve -- lien externe (WhatsApp du téléphone de l'enseignant) -->
                  <a
                    class="button small"
                    href={c.whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="elv-whatsapp"><Bidi text={t('elv.whatsapp')} /></a
                  >
                  <!-- eslint-enable svelte/no-navigation-without-resolve -->
                {/if}
                {#if c.identifiant && !fiche}
                  <button
                    type="button"
                    class="small"
                    onclick={() => recreer(c)}
                    data-testid="elv-nouveau"><Bidi text={t('elv.nouveau_mdp')} /></button
                  >
                  <button type="button" class="small" onclick={() => debloquer(c)}
                    ><Bidi text={t('elv.debloquer_court')} /></button
                  >
                {/if}
                {#if c.motDePasse && !fiche}
                  <button type="button" class="small" onclick={() => imprimer([c])}
                    ><Bidi text={t('elv.etiquette')} /></button
                  >
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<style>
  .lot {
    display: grid;
    gap: var(--space-m);
  }
  .tete {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  h2,
  h3 {
    margin: 0;
  }
  .aide,
  .petit {
    margin: 0;
    color: var(--ink2);
  }
  .petit {
    font-size: 0.85rem;
  }
  .liste {
    display: grid;
    gap: 6px;
  }
  .ligne {
    display: grid;
    grid-template-columns: 1fr 6rem 2.5rem;
    gap: 6px;
    align-items: center;
  }
  .ligne input,
  .coller textarea,
  .mdp input {
    font: inherit;
    min-height: 44px;
    padding: 6px 10px;
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--card);
    color: inherit;
  }
  .suppr {
    min-height: 44px;
    min-width: 44px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    margin: 8px 0;
  }
  .coller {
    display: grid;
    gap: 6px;
  }
  .ambigu {
    display: grid;
    gap: 6px;
    padding: 8px;
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
  }
  .ambigu p {
    margin: 0;
    font-weight: 700;
  }
  .ambigu select {
    font: inherit;
    min-height: 44px;
  }
  .case {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin: 10px 0;
  }
  .case {
    min-height: 44px;
  }
  .case input {
    width: 24px;
    height: 24px;
    margin-top: 2px;
  }
  .mdp {
    display: grid;
    gap: 4px;
    max-width: 22rem;
    margin-bottom: 10px;
  }
  .bad {
    color: var(--bad-ink);
    font-weight: 700;
  }
  .ok {
    color: var(--ok-ink, inherit);
    font-weight: 700;
  }
  .tab {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  th,
  td {
    padding: 8px;
    border-bottom: 1px solid var(--line);
    text-align: start;
  }
  td.id {
    font-family: ui-monospace, monospace;
    font-weight: 600;
    white-space: nowrap;
  }
  td.act {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
</style>
