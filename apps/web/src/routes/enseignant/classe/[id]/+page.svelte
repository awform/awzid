<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { note, suraName, type Counters } from '@awform/hifz';
  import type { RenderedDoc } from '@awform/school';
  import { localIso } from '$lib/hifz';
  import { fmtDate, fmtNumber, t } from '$lib/i18n';
  import { call, fetchMe, type Me } from '$lib/session';
  import CorrectionsClasse from '$lib/CorrectionsClasse.svelte';
  import EpreuvesClasse from '$lib/EpreuvesClasse.svelte';

  /**
   * Espace ÉCOLE d'une classe (lot 13) : élèves et groupes, devoirs avec échéance, tableau de suivi,
   * « classe papier » (résultats des bilans des livres papier, récitations), certificats et attestations
   * (modèles des livres ; jamais une ijāza), export CSV et pages imprimables (PDF).
   * Réservé à l'enseignant de la classe (second facteur) ; apparence : jetons du thème seulement.
   */
  interface Cls {
    id: string;
    name: string;
    joinCode: string;
    levelCode: string | null;
    schoolName: string | null;
    schoolNameAr: string | null;
    place: string | null;
    placeAr: string | null;
    schoolYear: string | null;
    recitationDays?: number;
  }
  interface Group {
    id: string;
    name: string;
  }
  interface Pupil {
    id: string;
    displayName: string;
    nameAr: string | null;
    gender: 'm' | 'f' | null;
    groupId: string | null;
    profileId: string | null;
  }
  interface Assignment {
    id: string;
    kind: 'lecon' | 'hifz' | 'lecture';
    target: string;
    dueDay: string;
    groupId: string | null;
    note: string | null;
  }
  interface Row {
    pupil: Pupil;
    lessonsDone: number | null;
    bilans: Array<number | null>;
    result: {
      status: string;
      missing: string[];
      cc: number | null;
      ccPartiel: boolean;
      examenPct: number | null;
      nf: number | null;
      decision: { code: string; fr: string } | null;
      conditionManquante: string | null;
      certificat: boolean;
    } | null;
    lastHifz: { part: string; day: string; total: number; mention: string } | null;
    assignments: Array<{ id: string; done: boolean; late: boolean; manual: boolean }>;
  }
  interface Tableau {
    level: { code: string; track: string; rank: number; titleFr: string | null } | null;
    lessons: number;
    bilans: Array<{ id: string; n: number | null; titleFr: string }>;
    examen: { id: string; titleFr: string } | null;
    assignments: Assignment[];
    rows: Row[];
  }
  interface Cert {
    id: string;
    number: string;
    kind: string;
    pupilId: string | null;
    subject: string;
    issuedAt: string;
  }

  const TABS = [
    'eleves',
    'devoirs',
    'corrections',
    'epreuves',
    'tableau',
    'ecoute',
    'certificats',
  ] as const;
  let tab = $state<(typeof TABS)[number]>('eleves');
  let me = $state<Me | null>(null);
  let loaded = $state(false);
  let cls = $state<Cls | null>(null);
  let groups = $state<Group[]>([]);
  let pupils = $state<Pupil[]>([]);
  let levels = $state<Array<{ code: string; titleFr: string | null; codeFr: string | null }>>([]);
  let units = $state<Array<{ id: string; kind: string; numLecon: number | null; titleFr: string }>>(
    [],
  );
  let tb = $state<Tableau | null>(null);
  let certs = $state<Cert[]>([]);
  let msg = $state('');
  let error = $state('');
  const id = $derived(page.params.id ?? '');
  const blocked = $derived(!!me && me.mfaRequired && !me.mfaVerified);
  const isTeacher = $derived(me?.account.kind === 'enseignant');

  // réglages
  let settings = $state({
    name: '',
    levelCode: '',
    schoolName: '',
    schoolNameAr: '',
    place: '',
    placeAr: '',
    schoolYear: '',
    recitationDays: 14,
  });
  let newGroup = $state('');
  let newPupil = $state({ displayName: '', gender: '', groupId: '' });
  let confirmRemove = $state<string | null>(null);
  // devoirs
  let asg = $state({ kind: 'lecon', target: '', dueDay: localIso(), groupId: '', note: '' });
  let openMarks = $state<string | null>(null);
  // classe papier
  let entry = $state<Pupil | null>(null);
  let scores = $state<
    Array<{ item: string; label: string; hint: string; score: string; max: string }>
  >([]);
  let recit = $state<Pupil | null>(null);
  let recitPart = $state('');
  let counters: Counters = $state({
    aides: 0,
    hesitations: 0,
    sauts: 0,
    oublis: 0,
    claires: 0,
    discretes: 0,
    fluidite: 4,
  });
  const live = $derived(note(counters));
  const FIELDS = ['aides', 'hesitations', 'sauts', 'oublis', 'claires', 'discretes'] as const;
  // certificats
  let cert = $state({ pupilId: '', kind: 'niveau', part: '', gender: '' });
  let extra = $state<Record<string, string>>({});
  let preview = $state<{
    eligible: { ok: boolean; raison?: string };
    document: RenderedDoc;
  } | null>(null);

  onMount(async () => {
    me = await fetchMe();
    if (isTeacher && !blocked) await load();
    loaded = true;
  });

  async function load() {
    const r = await call<{ class: Cls; groups: Group[]; pupils: Pupil[]; levels: typeof levels }>(
      'GET',
      `/ecole/classes/${id}`,
    );
    if (!r.ok) return (error = t(`erreur.${r.code ?? 'reseau'}`));
    cls = r.data!.class;
    groups = r.data!.groups;
    pupils = r.data!.pupils;
    levels = r.data!.levels;
    settings = {
      name: cls.name,
      levelCode: cls.levelCode ?? '',
      schoolName: cls.schoolName ?? '',
      schoolNameAr: cls.schoolNameAr ?? '',
      place: cls.place ?? '',
      placeAr: cls.placeAr ?? '',
      schoolYear: cls.schoolYear ?? '',
      recitationDays: cls.recitationDays ?? 14,
    };
    if (cls.levelCode) {
      const u = await call<{ units: typeof units }>('GET', `/levels/${cls.levelCode}/units`);
      units = u.data?.units ?? [];
    } else units = [];
    await loadTableau();
    await loadRecs();
    const c = await call<{ certificates: Cert[] }>('GET', `/ecole/classes/${id}/certificats`);
    certs = c.data?.certificates ?? [];
  }
  async function loadTableau() {
    const r = await call<Tableau>('GET', `/ecole/classes/${id}/tableau`);
    tb = r.data;
  }
  function done(ok: boolean, code: string | null | undefined, text: string) {
    if (!ok) {
      error = t(`erreur.${code ?? 'reseau'}`);
      msg = '';
      return false;
    }
    msg = text;
    error = '';
    return true;
  }

  // ---------------------------------------------------------------- élèves et groupes
  async function saveSettings(e: SubmitEvent) {
    e.preventDefault();
    const r = await call('PATCH', `/ecole/classes/${id}`, {
      ...settings,
      levelCode: settings.levelCode || null,
    });
    if (done(r.ok, r.code, t('classe.enregistre'))) await load();
  }
  async function addGroup(e: SubmitEvent) {
    e.preventDefault();
    const r = await call('POST', `/ecole/classes/${id}/groups`, { name: newGroup });
    if (done(r.ok, r.code, t('classe.groupe_cree'))) {
      newGroup = '';
      await load();
    }
  }
  async function delGroup(g: Group) {
    const r = await call('DELETE', `/ecole/classes/${id}/groups/${g.id}`);
    if (done(r.ok, r.code, t('classe.groupe_supprime'))) await load();
  }
  async function addPupil(e: SubmitEvent) {
    e.preventDefault();
    const r = await call('POST', `/ecole/classes/${id}/pupils`, {
      displayName: newPupil.displayName,
      gender: newPupil.gender || null,
      groupId: newPupil.groupId || null,
    });
    if (done(r.ok, r.code, t('classe.eleve_ajoute'))) {
      newPupil = { displayName: '', gender: '', groupId: '' };
      await load();
    }
  }
  async function patchPupil(p: Pupil, body: Record<string, string | null>) {
    const r = await call('PATCH', `/ecole/pupils/${p.id}`, body);
    if (done(r.ok, r.code, t('classe.enregistre'))) await load();
  }
  async function removePupil(p: Pupil) {
    const r = await call('DELETE', `/ecole/pupils/${p.id}`);
    confirmRemove = null;
    if (done(r.ok, r.code, t('classe.eleve_retire'))) await load();
  }

  // ---------------------------------------------------------------- devoirs
  let projUnit = $state('');
  const lessonUnits = $derived(units.filter((u) => u.kind === 'lecon'));
  function assignmentLabel(a: Pick<Assignment, 'kind' | 'target'>): string {
    if (a.kind === 'lecon') {
      const u = units.find((x) => x.id === a.target);
      return u ? t('classe.lecon_n', { n: u.numLecon ?? 0, titre: u.titleFr }) : a.target;
    }
    if (a.kind === 'hifz') {
      const m = /^(\d+):/.exec(a.target);
      return m ? `${suraName(Number(m[1]))} (${a.target})` : a.target;
    }
    return t('classe.livret', { code: a.target });
  }
  async function addAssignment(e: SubmitEvent) {
    e.preventDefault();
    const r = await call('POST', `/ecole/classes/${id}/assignments`, {
      kind: asg.kind,
      target: asg.target,
      dueDay: asg.dueDay,
      groupId: asg.groupId || null,
      ...(asg.note ? { note: asg.note } : {}),
    });
    if (done(r.ok, r.code, t('classe.devoir_cree'))) {
      asg = { ...asg, target: '', note: '' };
      await loadTableau();
    }
  }
  async function delAssignment(a: Assignment) {
    const r = await call('DELETE', `/ecole/assignments/${a.id}`);
    if (done(r.ok, r.code, t('classe.devoir_supprime'))) await loadTableau();
  }
  async function mark(a: Assignment, p: Pupil, value: boolean) {
    const r = await call('PUT', `/ecole/assignments/${a.id}/marks/${p.id}`, { done: value });
    if (r.ok) await loadTableau();
    else done(false, r.code, '');
  }
  const statusOf = (row: Row, a: Assignment) => row.assignments.find((x) => x.id === a.id);
  const doneCount = (a: Assignment) => (tb?.rows ?? []).filter((r) => statusOf(r, a)?.done).length;
  const concerned = (a: Assignment) => (tb?.rows ?? []).filter((r) => statusOf(r, a)).length;

  // ---------------------------------------------------------------- classe papier
  function openEntry(p: Pupil) {
    entry = p;
    recit = null;
    scores = [
      ...(tb?.bilans ?? []).map((b, i) => ({
        item: `bilan:${b.id}`,
        label: t('classe.bilan_n', { n: b.n ?? i + 1 }),
        hint: b.titleFr,
        score: '',
        max: '20',
      })),
      ...['examen', 'recitations', 'productions'].map((k) => ({
        item: k,
        label: t(`classe.item_${k}`),
        hint: '',
        score: '',
        max: k === 'examen' ? '20' : '100',
      })),
    ];
  }
  async function saveEntry(e: SubmitEvent) {
    e.preventDefault();
    if (!entry || !cls?.levelCode) return;
    const items = scores
      .filter((v) => v.score !== '' && v.score !== null && v.score !== undefined)
      .map((v) => ({ item: v.item, score: Number(v.score), max: Number(v.max) }));
    const r = await call('PUT', `/ecole/pupils/${entry.id}/resultats`, {
      levelCode: cls.levelCode,
      day: localIso(),
      items,
    });
    if (done(r.ok, r.code, t('classe.resultats_ok', { nom: entry.displayName }))) {
      entry = null;
      await loadTableau();
    }
  }
  function openRecit(p: Pupil) {
    recit = p;
    entry = null;
    recitPart = '';
    counters = {
      aides: 0,
      hesitations: 0,
      sauts: 0,
      oublis: 0,
      claires: 0,
      discretes: 0,
      fluidite: 4,
    };
  }
  async function saveRecit(e: SubmitEvent) {
    e.preventDefault();
    if (!recit) return;
    const r = await call<{ note: { total: number; mention: string } }>(
      'POST',
      `/ecole/pupils/${recit.id}/hifz`,
      { part: recitPart.trim(), day: localIso(), counters },
    );
    if (
      done(
        r.ok,
        r.code,
        t('ens.validation_ok', {
          nom: recit.displayName,
          note: fmtNumber(r.data?.note.total ?? 0),
          mention: t(`hifz.mention_${r.data?.note.mention ?? 'bien'}`),
        }),
      )
    ) {
      recit = null;
      await loadTableau();
    }
  }
  const pct = (x: number | null | undefined) =>
    x === null || x === undefined ? '—' : fmtNumber(x);

  // ---------------------------------------------------------------- écoute des récitations (lot 16)
  interface Rec {
    id: string;
    pseudonym: string;
    part: string;
    createdAt: string;
    grade: { note: { total: number } } | null;
  }
  let recs = $state<Rec[]>([]);
  let ecouteJours = $state(14);
  let audioUrl = $state<Record<string, string>>({});
  let noteFor = $state<string | null>(null);
  async function loadRecs() {
    const r = await call<{ jours: number; recitations: Rec[] }>(
      'GET',
      `/ecole/classes/${id}/recitations`,
    );
    recs = r.data?.recitations ?? [];
    ecouteJours = r.data?.jours ?? 14;
  }
  /** l'audio est déchiffré par le serveur pour l'enseignant de la classe seulement, jamais mis en cache */
  async function ecouter(rid: string) {
    const r = await fetch(`/api/v1/ecole/recitations/${rid}/audio`, { credentials: 'same-origin' });
    if (!r.ok) return done(false, 'introuvable', '');
    audioUrl = { ...audioUrl, [rid]: URL.createObjectURL(await r.blob()) };
  }
  function ouvrirNote(rid: string) {
    noteFor = rid;
    counters = {
      aides: 0,
      hesitations: 0,
      sauts: 0,
      oublis: 0,
      claires: 0,
      discretes: 0,
      fluidite: 4,
    };
  }
  async function noter(e: SubmitEvent, rid: string) {
    e.preventDefault();
    const r = await call<{ note: { total: number; mention: string } }>(
      'POST',
      `/ecole/recitations/${rid}/note`,
      { counters },
    );
    if (done(r.ok, r.code, t('ecoute.note_ok', { note: fmtNumber(r.data?.note.total ?? 0) }))) {
      noteFor = null;
      await loadRecs();
    }
  }
  // ---------------------------------------------------------------- certificats
  const certPupil = $derived(pupils.find((p) => p.id === cert.pupilId) ?? null);
  async function certCall(apercu: boolean) {
    if (!cert.pupilId) return;
    const body = {
      kind: cert.kind,
      ...(cert.kind === 'hifz' ? { part: cert.part.trim() } : {}),
      ...(cert.gender ? { gender: cert.gender } : {}),
      fields: Object.fromEntries(Object.entries(extra).filter(([, v]) => v.trim())),
      apercu,
    };
    return call<{
      eligible: { ok: boolean; raison?: string };
      document: RenderedDoc;
      certificate: Cert;
    }>('POST', `/ecole/pupils/${cert.pupilId}/certificats`, body);
  }
  async function doPreview(e?: SubmitEvent) {
    e?.preventDefault();
    const r = await certCall(true);
    if (!r) return;
    if (!r.ok) return done(false, r.code, '');
    preview = { eligible: r.data!.eligible, document: r.data!.document };
    for (const k of preview.document.missing) if (!(k in extra)) extra[k] = '';
    error = '';
  }
  async function issue() {
    const r = await certCall(false);
    if (!r) return;
    if (
      done(r.ok, r.code, t('classe.certificat_ok', { numero: r.data?.certificate.number ?? '' }))
    ) {
      preview = null;
      extra = {};
      const c = await call<{ certificates: Cert[] }>('GET', `/ecole/classes/${id}/certificats`);
      certs = c.data?.certificates ?? [];
    }
  }
  const pupilName = (pid: string | null) =>
    pupils.find((p) => p.id === pid)?.displayName ?? t('classe.retire_de_la_classe');
  /** libellé d'un champ de modèle (clé brute si le libellé n'existe pas encore) */
  const champ = (k: string) => {
    const s = t(`classe.champ_${k}`);
    return s.startsWith('⟦') ? k : s;
  };
  const segText = (l: Array<{ t: string }>) => l.map((s) => s.t).join('');
  /** export CSV (tableur) : téléchargé par l'application (cookie de session, aucun lien public) */
  async function download(quoi: string) {
    const r = await fetch(`/api/v1/ecole/classes/${id}/export.csv?quoi=${quoi}`, {
      credentials: 'same-origin',
    });
    if (!r.ok) return done(false, 'export', '');
    const name =
      /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1] ??
      `awform-${quoi}.csv`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await r.blob());
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('classe.titre')}</title></svelte:head>

<p><a href={resolve('/enseignant')}>{t('classe.retour')}</a></p>
<h1>
  {t('classe.titre')}{#if cls}{` — ${cls.name}`}{/if}
</h1>
{#if msg}<p class="card ok" role="status" data-testid="ecole-message">{msg}</p>{/if}
{#if error}<p class="card bad" role="alert" data-testid="ecole-erreur">{error}</p>{/if}

{#if loaded && !isTeacher}
  <p class="card">{t('classe.reserve')}</p>
{:else if blocked}
  <p class="card warnbox">
    {t('compte.totp_obligatoire')} <a href={resolve('/compte')}>{t('entete.compte')}</a>
  </p>
{:else if cls}
  <p class="muted small">{t('classe.protection')}</p>
  <div class="tabs" role="tablist">
    {#each TABS as k (k)}
      <button
        type="button"
        role="tab"
        aria-selected={tab === k}
        class:active={tab === k}
        onclick={() => (tab = k)}
        data-testid="onglet-{k}">{t(`classe.onglet_${k}`)}</button
      >
    {/each}
  </div>

  {#if tab === 'eleves'}
    <form class="card form" onsubmit={saveSettings} data-testid="reglages">
      <h2>{t('classe.reglages')}</h2>
      <label
        >{t('ens.nom_classe')} <input bind:value={settings.name} required maxlength="60" /></label
      >
      <label
        >{t('classe.niveau')}
        <select bind:value={settings.levelCode} data-testid="niveau-classe">
          <option value="">{t('classe.niveau_aucun')}</option>
          {#each levels as l (l.code)}<option value={l.code}
              >{l.codeFr ?? l.code} — {l.titleFr}</option
            >{/each}
        </select></label
      >
      <label
        >{t('classe.etablissement')}
        <input
          bind:value={settings.schoolName}
          maxlength="120"
          data-testid="etablissement"
        /></label
      >
      <label
        >{t('classe.etablissement_ar')}
        <input bind:value={settings.schoolNameAr} maxlength="120" dir="rtl" lang="ar" /></label
      >
      <label
        >{t('classe.lieu')}
        <input bind:value={settings.place} maxlength="80" data-testid="lieu" /></label
      >
      <label
        >{t('classe.lieu_ar')}
        <input bind:value={settings.placeAr} maxlength="80" dir="rtl" lang="ar" /></label
      >
      <label>{t('classe.annee')} <input bind:value={settings.schoolYear} maxlength="20" /></label>
      <label
        >{t('ecoute.jours')}
        <input
          type="number"
          min="1"
          max="30"
          bind:value={settings.recitationDays}
          data-testid="jours-recitations"
        /></label
      >
      <button type="submit" class="primary" data-testid="enregistrer-reglages"
        >{t('commun.enregistrer')}</button
      >
    </form>

    <section class="card">
      <h2>{t('classe.groupes')}</h2>
      <ul class="plain">
        {#each groups as g (g.id)}
          <li>
            {g.name}
            <button type="button" class="small" onclick={() => delGroup(g)}
              >{t('commun.supprimer')}</button
            >
          </li>
        {:else}
          <li class="muted">{t('classe.aucun_groupe')}</li>
        {/each}
      </ul>
      <form class="row" onsubmit={addGroup}>
        <label class="sr" for="ng">{t('classe.nom_groupe')}</label>
        <input
          id="ng"
          bind:value={newGroup}
          required
          maxlength="40"
          placeholder={t('classe.nom_groupe')}
        />
        <button type="submit" data-testid="ajouter-groupe">{t('classe.ajouter_groupe')}</button>
      </form>
    </section>

    <section class="card">
      <h2>{t('classe.eleves')}</h2>
      <p class="muted small">{t('classe.code_familles', { code: cls.joinCode })}</p>
      <div class="tw">
        <table data-testid="liste-eleves">
          <thead>
            <tr>
              <th>{t('classe.eleve')}</th>
              <th>{t('classe.inscription')}</th>
              <th>{t('classe.groupe')}</th>
              <th>{t('classe.genre')}</th>
              <th>{t('classe.nom_ar')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each pupils as p (p.id)}
              <tr data-eleve={p.displayName}>
                <td>{p.displayName}</td>
                <td>{p.profileId ? t('classe.inscrit_appli') : t('classe.inscrit_papier')}</td>
                <td>
                  <select
                    value={p.groupId ?? ''}
                    onchange={(e) => patchPupil(p, { groupId: e.currentTarget.value || null })}
                    aria-label={t('classe.groupe')}
                  >
                    <option value="">—</option>
                    {#each groups as g (g.id)}<option value={g.id}>{g.name}</option>{/each}
                  </select>
                </td>
                <td>
                  <select
                    value={p.gender ?? ''}
                    onchange={(e) => patchPupil(p, { gender: e.currentTarget.value || null })}
                    aria-label={t('classe.genre')}
                  >
                    <option value="">—</option>
                    <option value="f">{t('classe.genre_f')}</option>
                    <option value="m">{t('classe.genre_m')}</option>
                  </select>
                </td>
                <td>
                  <input
                    value={p.nameAr ?? ''}
                    dir="rtl"
                    lang="ar"
                    maxlength="80"
                    aria-label={t('classe.nom_ar')}
                    onchange={(e) => patchPupil(p, { nameAr: e.currentTarget.value || null })}
                  />
                </td>
                <td>
                  {#if confirmRemove === p.id}
                    <button type="button" class="small danger" onclick={() => removePupil(p)}
                      >{t('classe.confirmer_retrait')}</button
                    >
                  {:else}
                    <button type="button" class="small" onclick={() => (confirmRemove = p.id)}
                      >{t('classe.retirer')}</button
                    >
                  {/if}
                </td>
              </tr>
            {:else}
              <tr><td colspan="6" class="muted">{t('ens.aucun_eleve')}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
      <form class="row" onsubmit={addPupil} data-testid="ajout-eleve">
        <label class="sr" for="np">{t('classe.prenom_initiale')}</label>
        <input
          id="np"
          bind:value={newPupil.displayName}
          required
          maxlength="60"
          placeholder={t('classe.prenom_initiale')}
          data-testid="nom-eleve"
        />
        <select bind:value={newPupil.gender} aria-label={t('classe.genre')}>
          <option value="">{t('classe.genre')}</option>
          <option value="f">{t('classe.genre_f')}</option>
          <option value="m">{t('classe.genre_m')}</option>
        </select>
        <select bind:value={newPupil.groupId} aria-label={t('classe.groupe')}>
          <option value="">{t('classe.groupe')}</option>
          {#each groups as g (g.id)}<option value={g.id}>{g.name}</option>{/each}
        </select>
        <button type="submit" class="primary" data-testid="ajouter-eleve"
          >{t('classe.ajouter_eleve')}</button
        >
      </form>
      <p class="muted small">{t('classe.minimisation')}</p>
    </section>
  {:else if tab === 'devoirs'}
    <form class="card form" onsubmit={addAssignment} data-testid="nouveau-devoir">
      <h2>{t('classe.nouveau_devoir')}</h2>
      <label
        >{t('classe.type')}
        <select bind:value={asg.kind} onchange={() => (asg.target = '')} data-testid="devoir-type">
          <option value="lecon">{t('classe.type_lecon')}</option>
          <option value="hifz">{t('classe.type_hifz')}</option>
          <option value="lecture">{t('classe.type_lecture')}</option>
        </select></label
      >
      {#if asg.kind === 'lecon'}
        <label
          >{t('classe.type_lecon')}
          <select bind:value={asg.target} required data-testid="devoir-lecon">
            <option value="" disabled>{cls.levelCode ? '—' : t('classe.niveau_requis')}</option>
            {#each lessonUnits as u (u.id)}<option value={u.id}
                >{t('classe.lecon_n', { n: u.numLecon ?? 0, titre: u.titleFr })}</option
              >{/each}
          </select></label
        >
      {:else if asg.kind === 'hifz'}
        <label
          >{t('classe.passage_aide')}
          <input
            bind:value={asg.target}
            required
            pattern={'\\d{1,3}:\\d{1,3}(-\\d{1,3})?'}
            data-testid="devoir-cible"
          /></label
        >
        {#if /^\d+:/.test(asg.target)}<span class="muted small"
            >{suraName(Number(asg.target.split(':')[0]))}</span
          >{/if}
      {:else}
        <label
          >{t('classe.livret_aide')}
          <input
            bind:value={asg.target}
            required
            pattern={'[a-z]{2,3}\\d{1,2}-\\d{2}'}
            data-testid="devoir-cible"
          /></label
        >
      {/if}
      <label
        >{t('classe.echeance')}
        <input type="date" bind:value={asg.dueDay} required data-testid="devoir-echeance" /></label
      >
      <label
        >{t('classe.pour')}
        <select bind:value={asg.groupId}>
          <option value="">{t('classe.toute_la_classe')}</option>
          {#each groups as g (g.id)}<option value={g.id}>{g.name}</option>{/each}
        </select></label
      >
      <label>{t('classe.consigne')} <input bind:value={asg.note} maxlength="200" /></label>
      <button type="submit" class="primary" data-testid="creer-devoir"
        >{t('classe.donner_devoir')}</button
      >
    </form>

    <section class="card">
      <h2>{t('classe.devoirs')}</h2>
      <ul class="plain" data-testid="liste-devoirs">
        {#each tb?.assignments ?? [] as a (a.id)}
          <li class="devoir" data-devoir={a.target}>
            <div>
              <strong>{assignmentLabel(a)}</strong>
              <span class="muted small">
                · {t('classe.pour_le', { date: fmtDate(a.dueDay, { dateStyle: 'medium' }) })}
                · {a.groupId
                  ? groups.find((g) => g.id === a.groupId)?.name
                  : t('classe.toute_la_classe')}
                · {t('classe.faits', { n: doneCount(a), total: concerned(a) })}
              </span>
              {#if a.note}<p class="small">{a.note}</p>{/if}
            </div>
            <div class="row">
              <button
                type="button"
                class="small"
                onclick={() => (openMarks = openMarks === a.id ? null : a.id)}
                >{t('classe.cocher')}</button
              >
              <button type="button" class="small" onclick={() => delAssignment(a)}
                >{t('commun.supprimer')}</button
              >
            </div>
            {#if openMarks === a.id}
              <ul class="plain marks">
                {#each (tb?.rows ?? []).filter((r) => statusOf(r, a)) as r (r.pupil.id)}
                  {@const s = statusOf(r, a)!}
                  <li>
                    <label
                      ><input
                        type="checkbox"
                        checked={s.done}
                        onchange={(e) => mark(a, r.pupil, e.currentTarget.checked)}
                        data-testid="coche-{r.pupil.displayName}"
                      />
                      {r.pupil.displayName}</label
                    >
                    {#if s.late}<span class="warn small">{t('classe.en_retard')}</span>{/if}
                    {#if !s.manual && s.done}<span class="muted small"
                        >{t('classe.suivi_auto')}</span
                      >{/if}
                  </li>
                {/each}
              </ul>
            {/if}
          </li>
        {:else}
          <li class="muted">{t('classe.aucun_devoir')}</li>
        {/each}
      </ul>
      <p class="muted small">{t('classe.devoirs_aide')}</p>
    </section>
    {#if units.length}
      <section class="card" data-testid="projeter">
        <h2>{t('projection.titre')}</h2>
        <p class="muted small">{t('projection.aide')}</p>
        <label
          >{t('projection.choisir')}
          <select bind:value={projUnit}>
            {#each units as u (u.id)}<option value={u.id}>{u.numLecon ?? '·'} — {u.titleFr}</option
              >{/each}
          </select></label
        >
        {#if projUnit}
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- chemin résolu avec son paramètre -->
          <a class="button" href={resolve('/enseignant/projection/[unit]', { unit: projUnit })}
            >{t('projection.ouvrir')}</a
          >
        {/if}
      </section>
    {/if}
  {:else if tab === 'corrections'}
    <CorrectionsClasse classId={id} />
  {:else if tab === 'epreuves'}
    <EpreuvesClasse classId={id} {units} />
  {:else if tab === 'tableau'}
    <section class="card">
      <h2>{t('classe.suivi')}</h2>
      {#if !cls.levelCode}<p class="warnbox small">{t('classe.niveau_requis')}</p>{/if}
      <div class="tw">
        <table data-testid="tableau">
          <thead>
            <tr>
              <th>{t('classe.eleve')}</th>
              <th>{t('classe.lecons')}</th>
              {#each tb?.bilans ?? [] as b, i (b.id)}<th
                  >{t('classe.bilan_n', { n: b.n ?? i + 1 })}</th
                >{/each}
              <th>{t('classe.examen')}</th>
              <th>{t('classe.cc')}</th>
              <th>{t('classe.nf')}</th>
              <th>{t('classe.decision')}</th>
              <th>{t('classe.hifz')}</th>
              <th>{t('classe.devoirs')}</th>
            </tr>
          </thead>
          <tbody>
            {#each tb?.rows ?? [] as r (r.pupil.id)}
              <tr data-eleve={r.pupil.displayName}>
                <td>
                  {r.pupil.displayName}
                  <div class="actions">
                    {#if cls.levelCode}<button
                        type="button"
                        class="small"
                        onclick={() => openEntry(r.pupil)}
                        data-testid="saisir-{r.pupil.displayName}">{t('classe.saisir')}</button
                      >{/if}
                    {#if !r.pupil.profileId}<button
                        type="button"
                        class="small"
                        onclick={() => openRecit(r.pupil)}
                        data-testid="recitation-{r.pupil.displayName}"
                        >{t('classe.recitation')}</button
                      >{/if}
                  </div>
                </td>
                <td>{r.lessonsDone === null ? '—' : `${r.lessonsDone}/${tb?.lessons ?? 0}`}</td>
                {#each r.bilans as b, i (i)}<td class="num">{pct(b)}</td>{/each}
                <td class="num">{pct(r.result?.examenPct)}</td>
                <td class="num"
                  >{pct(r.result?.cc)}{#if r.result?.ccPartiel && r.result.cc !== null}*{/if}</td
                >
                <td class="num" data-testid="nf-{r.pupil.displayName}">{pct(r.result?.nf)}</td>
                <td data-testid="decision-{r.pupil.displayName}"
                  >{r.result?.decision
                    ? t(`classe.decision_${r.result.decision.code}`)
                    : r.result
                      ? t('classe.incomplet')
                      : '—'}{#if r.result?.conditionManquante}<br /><span class="warn small"
                      >{t('classe.examen_plancher')}</span
                    >{/if}</td
                >
                <td
                  >{#if r.lastHifz}{r.lastHifz.part} · {fmtNumber(
                      r.lastHifz.total,
                    )}{:else}—{/if}</td
                >
                <td
                  >{t('classe.faits', {
                    n: r.assignments.filter((a) => a.done).length,
                    total: r.assignments.length,
                  })}{#if r.assignments.some((a) => a.late)}<br /><span class="warn small"
                      >{t('classe.retards', {
                        n: r.assignments.filter((a) => a.late).length,
                      })}</span
                    >{/if}</td
                >
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="muted small">{t('classe.tableau_aide')}</p>
      <p class="row">
        <button type="button" onclick={() => download('tableau')} data-testid="export-tableau"
          >{t('classe.export_tableau')}</button
        >
        <button type="button" onclick={() => download('devoirs')} data-testid="export-devoirs"
          >{t('classe.export_devoirs')}</button
        >
        <a
          class="button"
          href={resolve('/enseignant/classe/[id]/imprimer', { id })}
          data-testid="imprimer-tableau">{t('classe.imprimer_tableau')}</a
        >
      </p>
    </section>

    {#if entry}
      <form class="card form" onsubmit={saveEntry} data-testid="saisie">
        <h2>{t('classe.saisie_de', { nom: entry.displayName })}</h2>
        <p class="muted small">{t('classe.saisie_aide')}</p>
        {#each scores as s, i (s.item)}
          <label class="count"
            ><span>{s.label} <small class="muted">{s.hint}</small></span>
            <span class="pair"
              ><input
                type="number"
                min="0"
                step="0.5"
                bind:value={s.score}
                data-testid="score-{i}"
              />
              / <input type="number" min="1" step="1" bind:value={s.max} /></span
            ></label
          >
        {/each}
        <div class="row">
          <button type="submit" class="primary" data-testid="enregistrer-saisie"
            >{t('commun.enregistrer')}</button
          >
          <button type="button" onclick={() => (entry = null)}>{t('commun.annuler')}</button>
        </div>
      </form>
    {/if}

    {#if recit}
      <form class="card form" onsubmit={saveRecit} data-testid="recitation">
        <h2>{t('ens.validation_de', { nom: recit.displayName })}</h2>
        <label
          >{t('classe.passage_aide')}
          <input
            bind:value={recitPart}
            required
            pattern={'\\d{1,3}:\\d{1,3}(-\\d{1,3})?'}
            data-testid="recit-passage"
          /></label
        >
        <fieldset>
          <legend>{t('ens.releves')}</legend>
          {#each FIELDS as f (f)}
            <label class="count"
              ><span>{t(`ens.c_${f}`)}</span>
              <input type="number" min="0" max="50" bind:value={counters[f]} /></label
            >
          {/each}
          <label class="count"
            ><span>{t('ens.c_fluidite')}</span>
            <input type="number" min="0" max="4" bind:value={counters.fluidite} /></label
          >
        </fieldset>
        <p class="live">
          {t('ens.note_calculee', {
            memo: fmtNumber(live.memorisation),
            tajwid: fmtNumber(live.tajwid),
            fluidite: fmtNumber(live.fluidite),
            total: fmtNumber(live.total),
            mention: t(`hifz.mention_${live.mention}`),
          })}
        </p>
        <div class="row">
          <button type="submit" class="primary" data-testid="enregistrer-recitation"
            >{t('ens.enregistrer')}</button
          >
          <button type="button" onclick={() => (recit = null)}>{t('commun.annuler')}</button>
        </div>
      </form>
    {/if}
  {:else if tab === 'ecoute'}
    <section class="card" data-testid="ecoute">
      <h2>{t('ecoute.titre')}</h2>
      <p class="muted small">{t('ecoute.aide', { n: ecouteJours })}</p>
      <ul class="plain">
        {#each recs as r (r.id)}
          <li class="devoir" data-recitation={r.id}>
            <div>
              <strong>{r.pseudonym}</strong> · {r.part} ·
              <span class="muted small">{fmtDate(r.createdAt, { dateStyle: 'medium' })}</span>
              {#if r.grade}· {t('envoi.note', { n: r.grade.note.total })}{/if}
            </div>
            {#if audioUrl[r.id]}
              <audio controls src={audioUrl[r.id]} data-testid="ecoute-audio"></audio>
            {:else}
              <button
                type="button"
                class="small"
                onclick={() => ecouter(r.id)}
                data-testid="ecoute-ecouter">{t('ecoute.ecouter')}</button
              >
            {/if}
            {#if noteFor === r.id}
              <form class="form" onsubmit={(e) => noter(e, r.id)} data-testid="ecoute-note">
                {#each FIELDS as f (f)}
                  <label class="count"
                    ><span>{t(`ens.c_${f}`)}</span>
                    <input type="number" min="0" max="50" bind:value={counters[f]} /></label
                  >
                {/each}
                <label class="count"
                  ><span>{t('ens.c_fluidite')}</span>
                  <input type="number" min="0" max="4" bind:value={counters.fluidite} /></label
                >
                <p class="live">
                  {t('ens.note_calculee', {
                    memo: fmtNumber(live.memorisation),
                    tajwid: fmtNumber(live.tajwid),
                    fluidite: fmtNumber(live.fluidite),
                    total: fmtNumber(live.total),
                    mention: t(`hifz.mention_${live.mention}`),
                  })}
                </p>
                <button type="submit" class="primary" data-testid="ecoute-enregistrer"
                  >{t('ens.enregistrer')}</button
                >
              </form>
            {:else}
              <button
                type="button"
                class="small"
                onclick={() => ouvrirNote(r.id)}
                data-testid="ecoute-noter">{t('ecoute.noter')}</button
              >
            {/if}
          </li>
        {:else}
          <li class="muted">{t('ecoute.aucune')}</li>
        {/each}
      </ul>
    </section>
  {:else}
    <form class="card form" onsubmit={doPreview} data-testid="certificat-form">
      <h2>{t('classe.delivrer')}</h2>
      <p class="muted small">{t('classe.certificat_aide')}</p>
      <label
        >{t('classe.eleve')}
        <select
          bind:value={cert.pupilId}
          required
          data-testid="cert-eleve"
          onchange={() => (preview = null)}
        >
          <option value="" disabled>—</option>
          {#each pupils as p (p.id)}<option value={p.id}>{p.displayName}</option>{/each}
        </select></label
      >
      <label
        >{t('classe.type')}
        <select bind:value={cert.kind} data-testid="cert-type" onchange={() => (preview = null)}>
          <option value="niveau">{t('classe.cert_niveau')}</option>
          <option value="hifz">{t('classe.cert_hifz')}</option>
        </select></label
      >
      {#if cert.kind === 'hifz'}
        <label
          >{t('classe.passage_aide')}
          <input bind:value={cert.part} required data-testid="cert-passage" /></label
        >
      {/if}
      <label
        >{t('classe.genre')}
        <select bind:value={cert.gender}>
          <option value="">{certPupil?.gender ? t(`classe.genre_${certPupil.gender}`) : '—'}</option
          >
          <option value="f">{t('classe.genre_f')}</option>
          <option value="m">{t('classe.genre_m')}</option>
        </select></label
      >
      <label
        >{t('classe.nom_complet')}
        <input bind:value={extra.prenom_nom} maxlength="120" data-testid="cert-nom" /></label
      >
      {#each Object.keys(extra).filter((k) => k !== 'prenom_nom') as k (k)}
        <label>{champ(k)} <input bind:value={extra[k]} maxlength="200" data-champ={k} /></label>
      {/each}
      <button type="submit" data-testid="cert-apercu">{t('classe.apercu')}</button>
    </form>

    {#if preview}
      <section class="card" data-testid="cert-preview">
        {#if !preview.eligible.ok}
          <p class="warnbox" data-testid="cert-non-eligible">
            {t('classe.non_eligible', { raison: preview.eligible.raison ?? '' })}
          </p>
        {/if}
        {#if preview.document.missing.length}
          <p class="warnbox small">
            {t('classe.champs_manquants', { champs: preview.document.missing.join(', ') })}
          </p>
        {/if}
        {#if preview.document.aValider}<p class="muted small">
            {t('classe.modele_a_valider')}
          </p>{/if}
        <div class="doc">
          <div>
            <h3>{preview.document.titleFr}</h3>
            {#each preview.document.fr as l, i (i)}<p>{segText(l)}</p>{/each}
          </div>
          {#if preview.document.titleAr}
            <div dir="rtl" lang="ar" class="ar">
              <h3>{preview.document.titleAr}</h3>
              {#each preview.document.ar as l, i (i)}<p>{segText(l)}</p>{/each}
            </div>
          {/if}
        </div>
        <button
          type="button"
          class="primary"
          disabled={!preview.eligible.ok || preview.document.missing.length > 0}
          onclick={issue}
          data-testid="cert-delivrer">{t('classe.delivrer_numero')}</button
        >
      </section>
    {/if}

    <section class="card">
      <h2>{t('classe.registre')}</h2>
      <ul class="plain" data-testid="registre">
        {#each certs as c (c.id)}
          <li>
            <strong>{c.number}</strong> · {pupilName(c.pupilId)} · {c.kind === 'hifz'
              ? c.subject
              : c.subject.toUpperCase()} · {fmtDate(c.issuedAt, { dateStyle: 'medium' })}
            <a
              href={resolve('/enseignant/certificat/[id]', { id: c.id })}
              data-testid="imprimer-{c.number}">{t('classe.imprimer')}</a
            >
          </li>
        {:else}
          <li class="muted">{t('classe.aucun_certificat')}</li>
        {/each}
      </ul>
      <button type="button" onclick={() => download('certificats')} data-testid="export-registre"
        >{t('classe.export_registre')}</button
      >
    </section>
  {/if}
{/if}

<style>
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 8px 0 12px;
  }
  .tabs button.active {
    background: var(--primary);
    color: var(--on-primary);
  }
  .form {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    max-width: 640px;
  }
  .form label > input,
  .form label > select {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }
  .row > input,
  .row > select {
    max-width: 100%;
    min-width: 0;
  }
  .form label {
    display: grid;
    gap: 4px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .plain {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .devoir {
    display: grid;
    gap: 6px;
    border-bottom: 1px solid var(--line);
    padding-bottom: 8px;
  }
  .marks {
    padding-left: 12px;
  }
  input,
  select {
    font: inherit;
    min-height: 44px;
    padding: 4px 8px;
    border: 2px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--card);
    color: var(--ink);
  }
  /* la mise en page de l'application est une grille : une largeur absolue empêche un tableau large
     d'élargir toute la page sur téléphone (il défile dans son cadre) */
  .tw {
    overflow-x: auto;
    max-width: calc(100vw - 72px);
  }
  select,
  input {
    max-width: calc(100vw - 72px);
  }
  section,
  form {
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
  }
  td input,
  td select {
    min-width: 6em;
    max-width: 12em;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.95rem;
  }
  th,
  td {
    border-bottom: 1px solid var(--line);
    padding: 6px;
    text-align: left;
    vertical-align: top;
  }
  td.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }
  .count {
    display: flex !important;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }
  .count input,
  .pair input {
    width: 6em;
  }
  fieldset {
    border: 2px solid var(--line);
    border-radius: var(--radius-md);
    display: grid;
    gap: 6px;
  }
  .live {
    font-weight: 700;
  }
  .doc {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 16px;
    border: 2px solid var(--gold);
    border-radius: var(--radius-md);
    padding: 12px;
    margin: 8px 0;
  }
  .ar {
    font-family: var(--font-ar);
    font-size: 1.15rem;
    line-height: 2;
  }
  .warn {
    color: var(--warn-ink);
  }
  .warnbox {
    background: var(--warn-bg);
    padding: 6px 8px;
    border-radius: var(--radius-sm);
  }
  .ok {
    background: var(--ok-bg);
  }
  .bad {
    background: var(--bad-bg);
    color: var(--bad-ink);
  }
  .danger {
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
