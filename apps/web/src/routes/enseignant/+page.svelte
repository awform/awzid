<script lang="ts">
  import { onMount } from 'svelte';
  import { carnetLabel } from '$lib/levels';
  import { resolve } from '$app/paths';
  import { CYCLES, defaultCycle, entryKey, note, suraName, type Counters } from '@awform/hifz';
  import { loadBook, localIso } from '$lib/hifz';
  import { fmtDate, fmtNumber, t } from '$lib/i18n';
  import Sym from '$lib/Sym.svelte';
  import { uuidv7 } from '$lib/sync-core';
  import { call, fetchMe, type Me } from '$lib/session';

  /**
   * Espace enseignant (lot 5 : suivi du hifẓ) : classes avec un code à donner aux familles (le parent inscrit
   * lui-même son enfant), élèves et leur carnet, VALIDATION OFFICIELLE d'une récitation : le maître relève
   * aides, hésitations, versets sautés ou oubliés, fautes de tajwid et fluidité → note /20 du barème des
   * carnets. Second facteur obligatoire.
   */
  interface ClassRow {
    id: string;
    name: string;
    joinCode: string;
    members?: number;
  }
  interface Member {
    id: string;
    pseudonym: string;
    avatar: string | null;
    levelCode: string | null;
    plan: {
      mode: string;
      bookCode: string | null;
      rhythmYears: number | null;
      cycleDays: number | null;
      suraOrder: string;
      startDate: string;
      trial: boolean;
    } | null;
    events: Array<{
      id: string;
      day: string;
      part: string;
      kind: string;
      source: string;
      details: { note?: { total: number; mention: string } } | null;
    }>;
  }

  let me = $state<Me | null>(null);
  let loaded = $state(false);
  let classes: ClassRow[] = $state([]);
  let current = $state<{ class: ClassRow; members: Member[] } | null>(null);
  let newName = $state('');
  let error = $state('');
  let msg = $state('');
  let target = $state<Member | null>(null);
  let part = $state('');
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

  const isTeacher = $derived(me?.account.kind === 'enseignant' || me?.account.kind === 'admin');
  const blocked = $derived(!!me && me.mfaRequired && !me.mfaVerified);

  onMount(async () => {
    me = await fetchMe();
    if (isTeacher && !blocked) await loadClasses();
    loaded = true;
  });

  async function loadClasses() {
    const r = await call<{ classes: ClassRow[] }>('GET', '/teacher/classes');
    classes = r.data?.classes ?? [];
  }
  async function create(e: SubmitEvent) {
    e.preventDefault();
    const r = await call<{ class: ClassRow }>('POST', '/teacher/classes', { name: newName });
    if (!r.ok) return (error = t(`erreur.${r.code ?? 'reseau'}`));
    newName = '';
    msg = t('ens.classe_creee', { code: r.data!.class.joinCode });
    await loadClasses();
  }
  async function openClass(id: string) {
    const r = await call<{ class: ClassRow; members: Member[] }>('GET', `/teacher/classes/${id}`);
    current = r.data;
    target = null;
  }
  let bookParts: string[] = $state([]);
  /** passages : ceux du carnet de l'élève, puis ceux qu'il a déclarés appris */
  function partsOf(m: Member): string[] {
    const learned = m.events.filter((e) => e.kind === 'appris').map((e) => e.part);
    return [...new Set([...(m === target ? bookParts : []), ...learned])];
  }
  function partLabel(key: string): string {
    const m = /^(\d+):(.+)$/.exec(key);
    return m ? `${suraName(Number(m[1]))} ${key}` : key;
  }
  async function choose(m: Member) {
    target = m;
    bookParts = [];
    if (m.plan?.mode === 'carnet' && m.plan.bookCode) {
      const pack = await loadBook(m.plan.bookCode);
      if (pack)
        bookParts = [...pack.book.parcours.socle, ...(pack.book.parcours.renforce ?? [])].map(
          entryKey,
        );
    }
    part = partsOf(m)[0] ?? '';
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
  async function validate(e: SubmitEvent) {
    e.preventDefault();
    if (!target || !part) return;
    const r = await call<{ note: { total: number; mention: string } }>(
      'POST',
      '/teacher/hifz/validations',
      {
        id: uuidv7(),
        profileId: target.id,
        day: localIso(),
        part,
        counters,
      },
    );
    if (!r.ok) return (error = t(`erreur.${r.code ?? 'reseau'}`));
    msg = t('ens.validation_ok', {
      nom: target.pseudonym,
      note: fmtNumber(r.data!.note.total),
      mention: t(`hifz.mention_${r.data!.note.mention}`),
    });
    await openClass(current!.class.id);
  }
  /** cycle de la roue réglé par l'enseignant : la charge quotidienne de l'élève est recalculée */
  async function setCycle(m: Member, cy: number) {
    if (!m.plan || m.plan.mode !== 'rythme') return;
    const r = await call('PUT', `/hifz/profiles/${m.id}/plan`, {
      mode: 'rythme',
      rhythmYears: m.plan.rhythmYears ?? 7,
      suraOrder: m.plan.suraOrder,
      trial: m.plan.trial,
      startDate: m.plan.startDate,
      cycleDays: cy || null,
    });
    if (!r.ok) return (error = t(`erreur.${r.code ?? 'reseau'}`));
    msg = t('hifz.cycle_ok');
    await openClass(current!.class.id);
  }
  const lastNote = (m: Member) =>
    [...m.events].reverse().find((e) => e.source === 'enseignant')?.details?.note;
</script>

<svelte:head><title>{t('app.nom')} — {t('ens.titre')}</title></svelte:head>

<h1>{t('ens.titre')}</h1>
<p>
  <a href={resolve('/enseignant/questions')} data-testid="lien-questions">{t('ens.questions')}</a>
  · <a href={resolve('/enseignant/ecole')} data-testid="lien-synthese">{t('eco.lien')}</a>
</p>
{#if msg}<p class="card ok" role="status" data-testid="ens-message">{msg}</p>{/if}
{#if error}<p class="card bad" role="alert">{error}</p>{/if}

{#if loaded && !isTeacher}
  <p class="card">{t('ens.reserve')}</p>
{:else if blocked}
  <p class="card warnbox">
    {t('compte.totp_obligatoire')} <a href={resolve('/compte')}>{t('entete.compte')}</a>
  </p>
{:else if loaded}
  <section class="card">
    <h2>{t('ens.classes')}</h2>
    <ul class="classes">
      {#each classes as c (c.id)}
        <li>
          <button type="button" onclick={() => openClass(c.id)}>{c.name}</button>
          <a
            class="button small"
            href={resolve('/enseignant/classe/[id]', { id: c.id })}
            data-testid="espace-ecole-{c.name}">{t('classe.espace')}</a
          >
          <span class="muted small"
            >{t('ens.code', { code: c.joinCode })} · {t('ens.eleves', { n: c.members ?? 0 })}</span
          >
        </li>
      {:else}
        <li class="muted">{t('ens.aucune_classe')}</li>
      {/each}
    </ul>
    <form class="row" onsubmit={create}>
      <label for="cname" class="sr">{t('ens.nom_classe')}</label>
      <input
        id="cname"
        required
        maxlength="60"
        bind:value={newName}
        placeholder={t('ens.nom_classe')}
      />
      <button type="submit" class="primary">{t('ens.creer_classe')}</button>
    </form>
    <p class="muted small">{t('ens.code_aide')}</p>
  </section>

  {#if current}
    <section class="card" data-testid="classe">
      <h2>{current.class.name}</h2>
      <ul class="members">
        {#each current.members as m (m.id)}
          {@const n = lastNote(m)}
          <li>
            <Sym id={m.avatar ?? 'etoile'} size={32} />
            <strong>{m.pseudonym}</strong>
            <span class="muted small">
              {#if m.plan}{m.plan.mode === 'carnet'
                  ? carnetLabel(m.plan.bookCode ?? '')
                  : t('hifz.rythme_actuel', { n: m.plan.rhythmYears ?? 7 })}{:else}{t(
                  'ens.sans_plan',
                )}{/if}
              · {t('ens.parts', { n: partsOf(m).length })}
              {#if n}· {t('hifz.note', { n: fmtNumber(n.total) })}{/if}
            </span>
            <button
              type="button"
              class="small"
              onclick={() => choose(m)}
              data-testid="valider-{m.pseudonym}">{t('ens.ecouter')}</button
            >
            {#if m.plan?.mode === 'rythme'}
              <label class="small"
                >{t('hifz.cycle')}
                <select
                  value={m.plan.cycleDays ?? 0}
                  onchange={(e) => setCycle(m, Number(e.currentTarget.value))}
                  data-testid="cycle-{m.pseudonym}"
                >
                  <option value={0}
                    >{t('hifz.cycle_defaut', { n: defaultCycle(m.plan.rhythmYears ?? 7) })}</option
                  >
                  {#each CYCLES as cy (cy)}<option value={cy}>{t('hifz.cycle_n', { n: cy })}</option
                    >{/each}
                </select></label
              >
            {/if}
          </li>
        {:else}
          <li class="muted">{t('ens.aucun_eleve')}</li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if target}
    <form class="card form" onsubmit={validate} data-testid="validation">
      <h2>{t('ens.validation_de', { nom: target.pseudonym })}</h2>
      <label for="part">{t('ens.passage')}</label>
      <select id="part" bind:value={part} required>
        {#each partsOf(target) as p (p)}<option value={p}>{partLabel(p)}</option>{/each}
      </select>
      <fieldset>
        <legend>{t('ens.releves')}</legend>
        {#each FIELDS as f (f)}
          <label class="count"
            ><span>{t(`ens.c_${f}`)}</span>
            <input
              type="number"
              min="0"
              max="50"
              bind:value={counters[f]}
              data-testid="c-{f}"
            /></label
          >
        {/each}
        <label class="count"
          ><span>{t('ens.c_fluidite')}</span>
          <input
            type="number"
            min="0"
            max="4"
            bind:value={counters.fluidite}
            data-testid="c-fluidite"
          /></label
        >
      </fieldset>
      <p class="live" data-testid="note-calculee">
        {t('ens.note_calculee', {
          memo: fmtNumber(live.memorisation),
          tajwid: fmtNumber(live.tajwid),
          fluidite: fmtNumber(live.fluidite),
          total: fmtNumber(live.total),
          mention: t(`hifz.mention_${live.mention}`),
        })}
      </p>
      {#if counters.oublis >= 2}<p class="warn small">{t('ens.regle_oubli')}</p>{/if}
      <div class="row">
        <button type="submit" class="primary" data-testid="enregistrer-validation"
          >{t('ens.enregistrer')}</button
        >
        <button type="button" onclick={() => (target = null)}>{t('commun.annuler')}</button>
      </div>
      <p class="muted small">
        {t('hifz.maitre_seul_juge')}
        {fmtDate(new Date(), { dateStyle: 'long' })}
      </p>
    </form>
  {/if}
{/if}

<style>
  .classes,
  .members {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .members li,
  .classes li {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .form {
    display: grid;
    gap: 8px;
    max-width: 560px;
  }
  input,
  select {
    font: inherit;
    min-height: 44px;
    padding: 4px 8px;
    border: 2px solid var(--line);
    border-radius: 10px;
  }
  fieldset {
    border: 2px solid var(--line);
    border-radius: 12px;
    display: grid;
    gap: 6px;
  }
  .count {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
  }
  .count input {
    width: 6em;
  }
  .live {
    font-weight: 700;
  }
  .warn {
    color: var(--warn-ink);
  }
  .ok {
    background: var(--ok-bg);
  }
  .bad {
    background: var(--bad-bg);
    color: var(--bad-ink);
  }
  .warnbox {
    background: var(--warn-bg);
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
