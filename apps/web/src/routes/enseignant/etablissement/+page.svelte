<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { fmtDate, t } from '$lib/i18n';
  import { call, fetchMe, isStaff, type Me } from '$lib/session';

  /**
   * Lot F2 (revue E1, E3, E8) — administration minimale de l'école : personnel (direction, enseignant,
   * secrétariat), classes et leur titulaire (transfert), élèves « papier » convertis en profils (consentement
   * PAPIER recueilli par l'école), code de rattachement pour le parent, mode tablette de classe, registre
   * archivé, années scolaires et passage de fin d'année. L'interface complète du parcours viendra avec A27.
   */
  interface School {
    id: string;
    name: string;
    personal: boolean;
    roles: string[];
  }
  interface Detail {
    ecole: { id: string; name: string; personal: boolean };
    roles: string[];
    membres: Array<{ accountId: string; role: string; email: string | null }>;
    classes: Array<{
      id: string;
      name: string;
      kind: string;
      status: string;
      schoolYearId: string | null;
      teacherAccountId: string | null;
      pupils: number;
    }>;
    annees: Array<{ id: string; label: string; status: string; startsOn: string; endsOn: string }>;
  }
  interface Pupil {
    id: string;
    displayName: string;
    profileId: string | null;
  }

  let me = $state<Me | null>(null);
  let loaded = $state(false);
  let schools: School[] = $state([]);
  let d = $state<Detail | null>(null);
  let msg = $state('');
  let error = $state('');
  let newSchool = $state('');
  let member = $state({ email: '', role: 'enseignant' });
  let cls = $state<{ id: string; name: string; pupils: Pupil[] } | null>(null);
  let archives: Array<{ id: string; displayName: string; leftAt: string }> = $state([]);
  let conv = $state<Pupil | null>(null);
  let convForm = $state({ birthYear: 0, date: '', signataire: 'parent', reference: '' });
  let code = $state<{ nom: string; code: string } | null>(null);
  let tabletPin = $state('');
  let closing = $state<{ yearId: string; pupils: Array<Pupil & { className: string }> } | null>(
    null,
  );
  let decisions: Record<string, { outcome: string; nextClassId: string }> = $state({});
  let prep = $state({ label: '', startsOn: '', endsOn: '' });

  const lead = $derived(!!d && d.roles.includes('direction'));
  const blocked = $derived(!!me && me.mfaRequired && !me.mfaVerified);
  const teachers = $derived(
    (d?.membres ?? []).filter((m) => m.role === 'enseignant' || m.role === 'direction'),
  );
  const emailOf = (id: string | null) =>
    d?.membres.find((m) => m.accountId === id)?.email ?? t('etab.sans_titulaire');
  const fail = (c: string | null) => (error = t(`erreur.${c ?? 'reseau'}`));
  const ok = (m: string) => {
    msg = m;
    error = '';
  };

  onMount(async () => {
    me = await fetchMe();
    if (isStaff(me) && !blocked) await loadSchools();
    loaded = true;
  });

  async function loadSchools() {
    const r = await call<{ ecoles: School[] }>('GET', '/ecole/ecoles');
    schools = r.data?.ecoles ?? [];
    if (schools.length && !d) await open(schools[0]!.id);
  }
  async function open(id: string) {
    const r = await call<Detail>('GET', `/ecole/ecoles/${id}`);
    if (!r.ok) return fail(r.code);
    d = r.data;
    cls = null;
    closing = null;
  }
  async function createSchool(e: SubmitEvent) {
    e.preventDefault();
    const r = await call<{ ecole: { id: string } }>('POST', '/ecole/ecoles', { name: newSchool });
    if (!r.ok) return fail(r.code);
    newSchool = '';
    await loadSchools();
    await open(r.data!.ecole.id);
    ok(t('etab.ecole_creee'));
  }
  async function addMember(e: SubmitEvent) {
    e.preventDefault();
    const r = await call('POST', `/ecole/ecoles/${d!.ecole.id}/membres`, member);
    if (!r.ok) return fail(r.code);
    member = { email: '', role: 'enseignant' };
    await open(d!.ecole.id);
    ok(t('etab.membre_ajoute'));
  }
  async function removeMember(accountId: string, role: string) {
    const r = await call('DELETE', `/ecole/ecoles/${d!.ecole.id}/membres/${accountId}/${role}`);
    if (!r.ok) return fail(r.code);
    await open(d!.ecole.id);
  }
  async function transfer(classId: string, accountId: string) {
    if (!accountId) return;
    const r = await call('POST', `/ecole/classes/${classId}/transfert`, { accountId });
    if (!r.ok) return fail(r.code);
    await open(d!.ecole.id);
    ok(t('etab.transfert_ok'));
  }
  async function openClass(id: string, name: string) {
    const r = await call<{ pupils: Pupil[] }>('GET', `/ecole/classes/${id}`);
    if (!r.ok) return fail(r.code);
    cls = { id, name, pupils: r.data!.pupils };
    const a = await call<{ eleves: typeof archives }>('GET', `/ecole/classes/${id}/archives`);
    archives = a.data?.eleves ?? [];
    conv = null;
    code = null;
  }
  function startConv(p: Pupil) {
    conv = p;
    convForm = {
      birthYear: new Date().getFullYear() - 8,
      date: new Date().toISOString().slice(0, 10),
      signataire: 'parent',
      reference: '',
    };
  }
  async function convert(e: SubmitEvent) {
    e.preventDefault();
    if (!conv || !cls) return;
    const r = await call('POST', `/ecole/pupils/${conv.id}/profil`, {
      birthYear: Number(convForm.birthYear),
      consent: {
        date: convForm.date,
        signataire: convForm.signataire,
        reference: convForm.reference.trim() || null,
      },
    });
    if (!r.ok) return fail(r.code);
    ok(t('etab.profil_cree', { nom: conv.displayName }));
    await openClass(cls.id, cls.name);
  }
  async function parentCode(p: Pupil) {
    const r = await call<{ code: string }>('POST', `/ecole/pupils/${p.id}/code-parent`);
    if (!r.ok) return fail(r.code);
    code = { nom: p.displayName, code: r.data!.code };
  }
  async function tablet(classId: string) {
    const r = await call('POST', `/ecole/classes/${classId}/tablette`, {
      ...(tabletPin ? { pin: tabletPin } : {}),
    });
    if (!r.ok) return fail(r.code);
    await goto(resolve('/ecole'));
  }
  async function startClosing(yearId: string) {
    const r = await call<{ eleves: Array<Pupil & { pupilId: string; className: string }> }>(
      'GET',
      `/ecole/annees/${yearId}/eleves`,
    );
    if (!r.ok) return fail(r.code);
    const pupils = r.data!.eleves.map((x) => ({ ...x, id: x.pupilId }));
    decisions = Object.fromEntries(
      pupils.map((p) => [p.id, { outcome: 'admis', nextClassId: '' }]),
    );
    closing = { yearId, pupils };
  }
  async function close(e: SubmitEvent) {
    e.preventDefault();
    if (!closing) return;
    const r = await call<{ admis: number; redouble: number; parti: number }>(
      'POST',
      `/ecole/annees/${closing.yearId}/cloture`,
      {
        decisions: closing.pupils.map((p) => ({
          pupilId: p.id,
          outcome: decisions[p.id]!.outcome,
          nextClassId: decisions[p.id]!.nextClassId || null,
        })),
      },
    );
    if (!r.ok) return fail(r.code);
    closing = null;
    await open(d!.ecole.id);
    ok(t('etab.cloture_ok', r.data!));
  }
  async function prepare(e: SubmitEvent) {
    e.preventDefault();
    const r = await call('POST', `/ecole/ecoles/${d!.ecole.id}/annees`, prep);
    if (!r.ok) return fail(r.code);
    prep = { label: '', startsOn: '', endsOn: '' };
    await open(d!.ecole.id);
  }
  const nextClasses = $derived(
    (d?.classes ?? []).filter(
      (c) =>
        c.status === 'active' &&
        d?.annees.find((y) => y.id === c.schoolYearId)?.status === 'preparation',
    ),
  );
</script>

<svelte:head><title>{t('app.nom')} — {t('etab.titre')}</title></svelte:head>

<h1>{t('etab.titre')}</h1>
<p><a href={resolve('/enseignant')}>{t('ens.titre')}</a></p>
{#if msg}<p class="card ok" role="status" data-testid="etab-message"><Bidi text={msg} /></p>{/if}
{#if error}<p class="card bad" role="alert" data-testid="etab-erreur"><Bidi text={error} /></p>{/if}

{#if loaded && !isStaff(me)}
  <p class="card">{t('ens.reserve')}</p>
{:else if blocked}
  <p class="card">{t('compte.totp_obligatoire')}</p>
{:else if loaded}
  <section class="card">
    <h2>{t('etab.mes_ecoles')}</h2>
    <div class="row">
      {#each schools as s (s.id)}
        <button
          type="button"
          class:primary={d?.ecole.id === s.id}
          onclick={() => open(s.id)}
          data-testid="etab-ecole"
        >
          <Bidi text={s.name} />
        </button>
      {/each}
    </div>
    <form class="row" onsubmit={createSchool}>
      <label for="sname" class="sr">{t('etab.nom_ecole')}</label>
      <input
        id="sname"
        required
        maxlength="120"
        bind:value={newSchool}
        placeholder={t('etab.nom_ecole')}
      />
      <button type="submit">{t('etab.creer_ecole')}</button>
    </form>
  </section>

  {#if d}
    <section class="card" data-testid="etab-detail">
      <h2><Bidi text={d.ecole.name} /></h2>
      <p class="muted small">
        <Bidi
          text={t('etab.mes_roles', { roles: d.roles.map((r) => t(`etab.role_${r}`)).join(', ') })}
        />
      </p>
      {#if d.membres.length}
        <h3>{t('etab.personnel')}</h3>
        <ul class="list">
          {#each d.membres as m (m.accountId + m.role)}
            <li>
              <Bidi text={`${m.email ?? ''} — ${t(`etab.role_${m.role}`)}`} />
              {#if lead && m.accountId !== me?.account.id}
                <button
                  type="button"
                  class="small"
                  onclick={() => removeMember(m.accountId, m.role)}>{t('etab.retirer')}</button
                >
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
      {#if lead}
        <form class="row" onsubmit={addMember}>
          <label for="memail" class="sr">{t('champ.email')}</label>
          <input
            id="memail"
            type="email"
            required
            bind:value={member.email}
            placeholder={t('champ.email')}
            data-testid="etab-email"
          />
          <label for="mrole" class="sr">{t('etab.role')}</label>
          <select id="mrole" bind:value={member.role} data-testid="etab-role">
            <option value="enseignant">{t('etab.role_enseignant')}</option>
            <option value="direction">{t('etab.role_direction')}</option>
            <option value="secretariat">{t('etab.role_secretariat')}</option>
          </select>
          <button type="submit" data-testid="etab-ajouter">{t('etab.ajouter_membre')}</button>
        </form>
      {/if}

      <h3>{t('etab.classes')}</h3>
      <ul class="list">
        {#each d.classes as c (c.id)}
          <li data-testid="etab-classe-{c.name}">
            <button type="button" onclick={() => openClass(c.id, c.name)}
              ><Bidi text={c.name} /></button
            >
            <span class="muted small"
              ><Bidi
                text={t('etab.classe_info', {
                  titulaire: emailOf(c.teacherAccountId),
                  n: c.pupils,
                  statut: t(`etab.statut_${c.status}`),
                })}
              /></span
            >
            {#if lead && c.status === 'active' && teachers.length > 1}
              <label class="small"
                >{t('etab.transferer')}
                <select onchange={(e) => transfer(c.id, e.currentTarget.value)}>
                  <option value="">—</option>
                  {#each teachers.filter((m) => m.accountId !== c.teacherAccountId) as m (m.accountId + m.role)}
                    <option value={m.accountId}>{m.email}</option>
                  {/each}
                </select></label
              >
            {/if}
          </li>
        {:else}
          <li class="muted">{t('ens.aucune_classe')}</li>
        {/each}
      </ul>

      <h3>{t('etab.annees')}</h3>
      <ul class="list">
        {#each d.annees as y (y.id)}
          <li>
            <Bidi text={`${y.label} — ${t(`etab.annee_${y.status}`)}`} />
            {#if lead && y.status === 'en_cours'}
              <button
                type="button"
                class="small"
                onclick={() => startClosing(y.id)}
                data-testid="etab-cloturer">{t('etab.cloturer')}</button
              >
            {/if}
          </li>
        {/each}
      </ul>
      {#if lead}
        <form class="row" onsubmit={prepare}>
          <label for="plabel" class="sr">{t('etab.annee_libelle')}</label>
          <input
            id="plabel"
            required
            pattern={'\\d{4}-\\d{4}'}
            bind:value={prep.label}
            placeholder={t('etab.annee_exemple')}
            dir="ltr"
          />
          <label for="pstart" class="sr">{t('etab.annee_debut')}</label>
          <input id="pstart" type="date" required bind:value={prep.startsOn} />
          <label for="pend" class="sr">{t('etab.annee_fin')}</label>
          <input id="pend" type="date" required bind:value={prep.endsOn} />
          <button type="submit">{t('etab.preparer_annee')}</button>
        </form>
      {/if}
    </section>
  {/if}

  {#if closing}
    <form class="card form" onsubmit={close} data-testid="etab-cloture">
      <h2>{t('etab.cloturer')}</h2>
      <p class="muted small">{t('etab.cloture_aide')}</p>
      {#each closing.pupils as p (p.id)}
        <div class="row">
          <span><Bidi text={`${p.displayName} (${p.className})`} /></span>
          <select bind:value={decisions[p.id]!.outcome} aria-label={t('etab.decision')}>
            <option value="admis">{t('etab.admis')}</option>
            <option value="redouble">{t('etab.redouble')}</option>
            <option value="parti">{t('etab.parti')}</option>
          </select>
          {#if nextClasses.length}
            <select
              bind:value={decisions[p.id]!.nextClassId}
              aria-label={t('etab.classe_suivante')}
            >
              <option value="">—</option>
              {#each nextClasses as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
            </select>
          {/if}
        </div>
      {/each}
      <div class="row">
        <button type="submit" class="primary" data-testid="etab-confirmer-cloture"
          >{t('etab.cloturer')}</button
        >
        <button type="button" onclick={() => (closing = null)}>{t('commun.annuler')}</button>
      </div>
    </form>
  {/if}

  {#if cls}
    <section class="card" data-testid="etab-eleves">
      <h2><Bidi text={cls.name} /></h2>
      <div class="row">
        <label for="tpin">{t('etab.tablette_code')}</label>
        <input
          id="tpin"
          inputmode="numeric"
          pattern={'[0-9]{4}'}
          maxlength="4"
          bind:value={tabletPin}
        />
        <button type="button" onclick={() => tablet(cls!.id)} data-testid="etab-tablette"
          >{t('etab.tablette')}</button
        >
      </div>
      <p class="muted small">{t('etab.tablette_aide')}</p>
      {#if code}
        <p class="card ok" data-testid="etab-code">
          <Bidi text={t('etab.code_parent', { nom: code.nom })} />
          <strong><Bidi text={code.code} /></strong>
        </p>
      {/if}
      <ul class="list">
        {#each cls.pupils as p (p.id)}
          <li>
            <Bidi text={p.displayName} />
            {#if p.profileId}
              <span class="muted small">{t('etab.a_un_profil')}</span>
              <button
                type="button"
                class="small"
                onclick={() => parentCode(p)}
                data-testid="etab-code-{p.displayName}">{t('etab.code_parent_bouton')}</button
              >
            {:else}
              <button
                type="button"
                class="small"
                onclick={() => startConv(p)}
                data-testid="etab-profil-{p.displayName}">{t('etab.creer_profil')}</button
              >
            {/if}
          </li>
        {/each}
      </ul>
      {#if conv}
        <form class="form" onsubmit={convert} data-testid="etab-conversion">
          <h3><Bidi text={t('etab.profil_de', { nom: conv.displayName })} /></h3>
          <p class="muted small">{t('etab.consentement_papier')}</p>
          <label for="cyear">{t('champ.annee_naissance')}</label>
          <input
            id="cyear"
            type="number"
            min="1990"
            max="2100"
            required
            bind:value={convForm.birthYear}
          />
          <label for="cdate">{t('etab.date_formulaire')}</label>
          <input id="cdate" type="date" required bind:value={convForm.date} />
          <label for="csign">{t('etab.signataire')}</label>
          <select id="csign" bind:value={convForm.signataire}>
            <option value="parent">{t('etab.sign_parent')}</option>
            <option value="tuteur">{t('etab.sign_tuteur')}</option>
            <option value="autre">{t('etab.sign_autre')}</option>
          </select>
          <label for="cref">{t('etab.reference')}</label>
          <input id="cref" maxlength="60" bind:value={convForm.reference} />
          <div class="row">
            <button type="submit" class="primary" data-testid="etab-convertir"
              >{t('etab.creer_profil')}</button
            >
            <button type="button" onclick={() => (conv = null)}>{t('commun.annuler')}</button>
          </div>
        </form>
      {/if}
      {#if archives.length}
        <h3>{t('etab.archives')}</h3>
        <ul class="list muted">
          {#each archives as a (a.id)}
            <li>
              <Bidi
                text={t('etab.parti_le', {
                  nom: a.displayName,
                  date: fmtDate(a.leftAt, { dateStyle: 'medium' }),
                })}
              />
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
{/if}

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-block: 6px;
  }
  .form {
    display: grid;
    gap: 8px;
    max-width: 560px;
  }
  .list {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .list li {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  input,
  select {
    font: inherit;
    min-height: 44px;
    padding: 4px 8px;
    border: 2px solid var(--line);
    border-radius: 10px;
  }
  .ok {
    background: var(--ok-bg);
  }
  .bad {
    background: var(--bad-bg);
    color: var(--bad-ink);
  }
  .small {
    font-size: 0.9rem;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
</style>
