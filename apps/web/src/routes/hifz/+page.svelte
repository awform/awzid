<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import {
    CYCLES,
    defaultCycle,
    forecast,
    MANZIL,
    RHYTHMS,
    STEPS,
    suraName,
    type Quality,
  } from '@awform/hifz';
  import { demoProfileFor, onQueue, type DevProfile } from '$lib/attempts';
  import {
    computeToday,
    loadBook,
    loadMeta,
    loadProfileHifz,
    loadVerses,
    localIso,
    pendingHifz,
    portionParts,
    recordHifz,
    savePlan,
    type BookPack,
    type PlanRow,
    type ProfileHifz,
    type ServerEvent,
    type TodayView,
    type VerseRange,
  } from '$lib/hifz';
  import { fmtDate, fmtNumber, t } from '$lib/i18n';
  import { recordingAllowed } from '$lib/recordings';
  import Recorder from '$lib/Recorder.svelte';
  import { call, fetchMe, type Me } from '$lib/session';
  import VerseText from '$lib/VerseText.svelte';

  /**
   * Mon carnet de hifẓ (ARCHITECTURE_V2 § 2.4) : trois pistes chaque jour (nouveau, récent, ancien),
   * texte Tanzil de la portion avec masquage progressif, auto-évaluation, écoute du parent (protégée par
   * le code parent), validations officielles de l'enseignant, frise J0 → J+30, rythme et mois d'essai.
   */
  type Verse = { s: number; a: number; text: string };

  let profile = $state<DevProfile | null>(null);
  let me = $state<Me | null>(null);
  let loaded = $state(false);
  let data = $state<ProfileHifz | null>(null);
  let pack = $state<BookPack | null>(null);
  let basmala = $state('');
  let view = $state<TodayView | null>(null);
  let texts: Record<string, Verse[]> = $state({});
  let open: Record<string, boolean> = $state({});
  let masked = $state(false);
  let parentMode = $state(false);
  let askPin = $state(false);
  let pin = $state('');
  let pinError = $state('');
  let msg = $state('');
  let editing = $state(false);
  let recAllowed = $state(false);
  let setup = $state({
    mode: 'carnet' as 'carnet' | 'rythme',
    book: 'en1',
    years: 7,
    /** cycle de la roue (jours) ; 0 = défaut du rythme */
    cycle: 0,
    order: 'rebours' as 'rebours' | 'juz30',
    trial: true,
  });

  const isChild = $derived(!!profile && profile.kind !== 'adulte');
  const canManage = $derived(!isChild || parentMode);
  const today = localIso();

  onMount(() => {
    void (async () => {
      me = await fetchMe();
      profile = await demoProfileFor('');
      if (profile) {
        setup.book = profile.levelCode === 'ad1' || profile.kind === 'adulte' ? 'ad1' : 'en1';
        recAllowed = profile.kind === 'adulte' || (await recordingAllowed(profile.id));
        await refresh();
      }
      loaded = true;
    })();
    return onQueue(() => void refresh());
  });

  async function refresh() {
    if (!profile) return;
    data = await loadProfileHifz(profile.id);
    const plan = data?.plan ?? null;
    if (!plan) {
      view = null;
      return;
    }
    const meta = await loadMeta();
    basmala = meta?.basmala ?? '';
    pack = plan.mode === 'carnet' && plan.bookCode ? await loadBook(plan.bookCode) : null;
    const pending = await pendingHifz(profile.id);
    const known = new Set(data!.events.map((e) => e.id));
    const events: ServerEvent[] = [...data!.events, ...pending.filter((e) => !known.has(e.id))];
    view = computeToday(plan, events, meta, pack, today);
    await loadTexts();
  }

  async function versesFor(ranges: VerseRange[]): Promise<Verse[]> {
    const out: Verse[] = [];
    for (const r of ranges) {
      if (pack) {
        for (let a = r.from; a <= r.to; a++) {
          const text = pack.verses[`${r.s}:${a}`];
          if (text !== undefined) out.push({ s: r.s, a, text });
        }
      } else out.push(...(await loadVerses(r.s, r.from, r.to)));
    }
    return out;
  }

  async function loadTexts() {
    if (!view) return;
    const next: Record<string, Verse[]> = {};
    for (const task of view.weekTasks)
      next[`w:${task.part}:${task.from}`] = await versesFor([
        { s: task.sura, from: task.from, to: task.to },
      ]);
    if (view.portion) next.portion = await versesFor(view.portion.refs);
    for (const it of [...view.plan.recent, ...view.plan.manzil])
      next[it.key] = await versesFor(view.parts.get(it.key)?.ref ?? []);
    texts = next;
  }

  function label(key: string): string {
    const p = view?.parts.get(key);
    if (!p) return key;
    return p.ref.map((r) => refLabel(r)).join(' ; ');
  }
  function refLabel(r: VerseRange): string {
    return `${suraName(r.s)} ${r.s}:${r.from}${r.to !== r.from ? `-${r.to}` : ''}`;
  }

  // ---------------------------------------------------------------- actions

  const learned = (part: string, from: number) =>
    !!view?.events.some(
      (e) =>
        e.kind === 'appris' &&
        e.part === part &&
        (e.details as { v?: string } | null)?.v?.startsWith(`${from}`) &&
        view!.week !== null &&
        e.day >= weekStart(),
    );
  function weekStart(): string {
    if (!data?.plan || view?.week === null || view?.week === undefined) return today;
    return addDays(data.plan.startDate, (view.week - 1) * 7);
  }

  async function learnTask(part: string, from: number, to: number) {
    if (!profile) return;
    await recordHifz(profile.id, {
      day: today,
      part,
      kind: 'appris',
      source: 'auto',
      details: { v: from === to ? `${from}` : `${from}-${to}` },
    });
    msg = t('hifz.appris_ok');
    await refresh();
  }

  async function learnPortion() {
    if (!profile || !view?.portion || !data?.plan) return;
    const meta = await loadMeta();
    if (!meta) return;
    for (const part of portionParts(meta, data.plan, view.portion))
      await recordHifz(profile.id, {
        day: today,
        part,
        kind: 'appris',
        source: 'auto',
        pos: view.portion.end,
      });
    msg = t('hifz.appris_ok');
    await refresh();
  }

  async function rate(part: string, q: Quality) {
    if (!profile) return;
    await recordHifz(profile.id, {
      day: today,
      part,
      kind: 'revision',
      q,
      source: parentMode ? 'parent' : 'auto',
    });
    msg = t(parentMode ? 'hifz.ecoute_ok' : 'hifz.revision_ok');
    await refresh();
  }

  async function enterParent() {
    pinError = '';
    if (!me?.account.hasPin) {
      parentMode = true;
      return;
    }
    askPin = true;
  }
  async function checkPin(e: SubmitEvent) {
    e.preventDefault();
    const r = await call('POST', '/account/pin/verify', { pin });
    pin = '';
    if (r.ok) {
      parentMode = true;
      askPin = false;
    } else pinError = t(`erreur.${r.code ?? 'reseau'}`);
  }

  async function startPlan(e: SubmitEvent) {
    e.preventDefault();
    if (!profile) return;
    const r = await savePlan(profile.id, {
      mode: setup.mode,
      startDate: today,
      bookCode: setup.book,
      rhythmYears: setup.years,
      cycleDays: setup.cycle || null,
      suraOrder: setup.order,
      trial: setup.trial,
    });
    if (!r.ok) {
      msg = t(`erreur.${r.code ?? 'reseau'}`);
      return;
    }
    editing = false;
    msg = t('hifz.plan_ok');
    await refresh();
  }

  function addDays(isoDay: string, n: number): string {
    return new Date(Date.parse(`${isoDay}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  }
  const plusDays = (n: number) => addDays(today, n);
  async function relief(factor: 0 | 0.5) {
    if (!profile || !data?.plan) return;
    const p = data.plan;
    await savePlan(profile.id, { ...p, newFactor: factor, reliefUntil: plusDays(7) });
    msg = t('hifz.allegement_ok');
    await refresh();
  }
  async function changeCycle(cy: number) {
    if (!profile || !data?.plan) return;
    await savePlan(profile.id, { ...data.plan, cycleDays: cy || null });
    msg = t('hifz.cycle_ok');
    await refresh();
  }
  async function acceptRhythm(years: number) {
    if (!profile || !data?.plan) return;
    await savePlan(profile.id, { ...data.plan, trial: false, rhythmYears: years });
    msg = t('hifz.rythme_ok', { n: years });
    await refresh();
  }

  const teacherNotes = $derived(
    (view?.events ?? [])
      .filter((e) => e.source === 'enseignant')
      .slice(-5)
      .reverse(),
  );
  const acquiredPages = $derived(
    view
      ? [...view.state.parts.values()]
          .filter((p) => p.learnedDay !== null)
          .reduce((s, p) => s + p.pages, 0)
      : 0,
  );
  const minutesToday = $derived(
    view ? view.plan.minutes.recent + view.plan.minutes.nouveau + view.plan.minutes.manzil : 0,
  );
  const STAR: Record<string, string> = {
    excellent: 'or',
    tres_bien: 'argent',
    bien: 'verte',
    a_consolider: 'cercle',
    a_reprendre: 'reprendre',
  };
  const Q: Quality[] = [3, 2, 1, 0];
</script>

<svelte:head><title>{t('app.nom')} — {t('hifz.titre')}</title></svelte:head>

<h1>{t('hifz.titre')}</h1>
{#if msg}<p class="card ok" role="status">{msg}</p>{/if}

{#if loaded && !profile}
  <p class="card">
    {t('hifz.choisir_profil')} <a href={resolve('/profils')}>{t('suivi.qui_apprend')}</a>
  </p>
{:else if loaded && profile && (!data?.plan || editing)}
  {#if isChild && !parentMode}
    <section class="card">
      <p>{t('hifz.plan_par_parent')}</p>
      <button type="button" onclick={enterParent} data-testid="espace-parent"
        >{t('hifz.espace_parent')}</button
      >
    </section>
  {:else}
    <form class="card setup" onsubmit={startPlan} data-testid="choix-plan">
      <h2>{t('hifz.choisir_plan')}</h2>
      <label class="radio"
        ><input
          type="radio"
          name="mode"
          value="carnet"
          bind:group={setup.mode}
          data-testid="mode-carnet"
        />
        <span><strong>{t('hifz.mode_carnet')}</strong> — {t('hifz.mode_carnet_aide')}</span></label
      >
      {#if setup.mode === 'carnet'}
        <select bind:value={setup.book} aria-label={t('hifz.carnet')}>
          <option value="en1">{t('hifz.carnet_en1')}</option>
          <option value="ad1">{t('hifz.carnet_ad1')}</option>
        </select>
      {/if}
      <label class="radio"
        ><input
          type="radio"
          name="mode"
          value="rythme"
          bind:group={setup.mode}
          data-testid="mode-rythme"
        />
        <span><strong>{t('hifz.mode_rythme')}</strong> — {t('hifz.mode_rythme_aide')}</span></label
      >
      {#if setup.mode === 'rythme'}
        <div class="tw">
          <table class="rhythms">
            <thead
              ><tr
                ><th></th><th>{t('hifz.col_portion')}</th><th>{t('hifz.col_an')}</th><th
                  >{t('hifz.col_seance')}</th
                ></tr
              ></thead
            >
            <tbody>
              {#each RHYTHMS as r (r.years)}
                {@const f = forecast(r, setup.cycle || defaultCycle(r.years))}
                <tr class:sel={setup.years === r.years}>
                  <td
                    ><label
                      ><input type="radio" name="years" value={r.years} bind:group={setup.years} />
                      {t('hifz.rythme_n', { n: r.years })}</label
                    ></td
                  >
                  <td>{t('hifz.lignes', { n: fmtNumber(r.linesPerDay) })}</td>
                  <td>{t('hifz.juz_an', { n: fmtNumber(r.juzPerYear) })}</td>
                  <td data-testid="seance-{r.years}"
                    >{t('hifz.seance_plage', {
                      a: f.startMinutes,
                      b: f.endMinutes,
                      c: f.cycle,
                    })}</td
                  >
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <label for="cycle">{t('hifz.cycle')}</label>
        <select id="cycle" bind:value={setup.cycle} data-testid="cycle">
          <option value={0}>{t('hifz.cycle_defaut', { n: defaultCycle(setup.years) })}</option>
          {#each CYCLES as cy (cy)}<option value={cy}>{t('hifz.cycle_n', { n: cy })}</option>{/each}
        </select>
        <p class="muted small">{t('hifz.rythmes_note')}</p>
        <label for="order">{t('hifz.ordre')}</label>
        <select id="order" bind:value={setup.order}>
          <option value="rebours">{t('hifz.ordre_rebours')}</option>
          <option value="juz30">{t('hifz.ordre_juz30')}</option>
        </select>
        <label class="check"
          ><input type="checkbox" bind:checked={setup.trial} />
          <span>{t('hifz.essai', { n: 28 })}</span></label
        >
      {/if}
      <p class="muted small">{t('hifz.sans_audio')}</p>
      <div class="row">
        <button type="submit" class="primary" data-testid="commencer-plan"
          >{t('hifz.commencer')}</button
        >
        {#if editing}<button type="button" onclick={() => (editing = false)}
            >{t('commun.annuler')}</button
          >{/if}
      </div>
    </form>
  {/if}
{:else if view && data?.plan}
  {@const plan = data.plan as PlanRow}
  <section class="card head">
    <p data-testid="plan-resume">
      {#if plan.mode === 'carnet'}
        {t(`hifz.carnet_${plan.bookCode}`)} — {t('hifz.semaine', {
          n: view.week ?? 1,
          total: pack?.book.semaines ?? 30,
        })}
      {:else if view.trial && !view.trial.done}
        {t('hifz.essai_jour', { n: view.trial.day, total: 28 })}
      {:else}
        {t('hifz.rythme_actuel', { n: plan.rhythmYears ?? 7 })}
      {/if}
    </p>
    <p class="muted small">
      {t('hifz.temps_jour', {
        n: Math.round(minutesToday),
        nouveau: Math.round(view.plan.minutes.nouveau),
        recent: Math.round(view.plan.minutes.recent),
        ancien: Math.round(view.plan.minutes.manzil),
      })}
    </p>
    {#if view.mode === 'rythme' && view.load}
      <p class="small" data-testid="charge">
        {t('hifz.charge', {
          n: view.load.now,
          a: view.load.start,
          b: view.load.end,
          c: view.cycle ?? 45,
        })}
      </p>
      {#if canManage}
        <label class="small"
          >{t('hifz.cycle')}
          <select
            value={plan.cycleDays ?? 0}
            onchange={(e) => changeCycle(Number(e.currentTarget.value))}
            data-testid="cycle-plan"
          >
            <option value={0}
              >{t('hifz.cycle_defaut', { n: defaultCycle(plan.rhythmYears ?? 7) })}</option
            >
            {#each CYCLES as cy (cy)}<option value={cy}>{t('hifz.cycle_n', { n: cy })}</option
              >{/each}
          </select></label
        >
      {/if}
    {/if}
    <div
      class="bar"
      role="img"
      aria-label={t('hifz.progression', {
        n: fmtNumber(acquiredPages, { maximumFractionDigits: 1 }),
      })}
    >
      <span
        style:width={`${Math.min(100, (view.progress.acquiredParts / Math.max(1, view.progress.totalParts)) * 100)}%`}
      ></span>
    </div>
    <p class="small">
      {plan.mode === 'carnet'
        ? t('hifz.acquis_carnet', {
            n: view.progress.acquiredParts,
            total: view.progress.totalParts,
          })
        : t('hifz.progression', { n: fmtNumber(acquiredPages, { maximumFractionDigits: 1 }) })}
    </p>
    <label class="check"
      ><input type="checkbox" bind:checked={masked} data-testid="masquer" />
      <span>{t('hifz.masquer')}</span></label
    >
    {#if isChild && !parentMode}
      <button type="button" class="small" onclick={enterParent} data-testid="espace-parent"
        >{t('hifz.espace_parent')}</button
      >
    {:else if isChild}
      <p class="small parent">
        {t('hifz.mode_parent_actif')}
        <button type="button" class="small" onclick={() => (parentMode = false)}
          >{t('hifz.quitter_parent')}</button
        >
      </p>
    {/if}
    {#if canManage}<button type="button" class="small" onclick={() => (editing = true)}
        >{t('hifz.changer_plan')}</button
      >{/if}
  </section>

  {#if askPin}
    <form class="card pin" onsubmit={checkPin}>
      <label for="pin">{t('profils.code_parent')}</label>
      <input id="pin" inputmode="numeric" maxlength="4" autocomplete="off" bind:value={pin} />
      {#if pinError}<p class="error" role="alert">{pinError}</p>{/if}
      <button type="submit" class="primary">{t('commun.valider')}</button>
    </form>
  {/if}

  {#if view.trial?.done && view.trial.suggestion && canManage}
    <section class="card warnbox" data-testid="fin-essai">
      <h2>{t('hifz.fin_essai')}</h2>
      <p>{t('hifz.proposition', { n: view.trial.suggestion })}</p>
      <div class="row">
        <button type="button" class="primary" onclick={() => acceptRhythm(view!.trial!.suggestion!)}
          >{t('hifz.accepter', { n: view.trial.suggestion })}</button
        >
        <button type="button" onclick={() => (editing = true)}>{t('hifz.autre_rythme')}</button>
      </div>
    </section>
  {/if}

  <!-- ① nouveau -->
  <section class="card track" data-testid="piste-nouveau">
    <h2><span class="num">①</span> {t('hifz.nouveau')}</h2>
    {#if view.plan.stopRule}
      <p class="warn" data-testid="regle-arret">{t('hifz.regle_arret')}</p>
    {/if}
    {#if view.mode === 'carnet'}
      {#each view.weekTasks as task (`${task.part}:${task.from}:${task.kind}`)}
        <article class="task">
          <h3>
            {refLabel({ s: task.sura, from: task.from, to: task.to })}
            <span class="tag"
              >{task.kind === 'nouveau' ? t('hifz.a_apprendre') : t('hifz.a_reciter')}</span
            >
            {#if task.track === 'renforce'}<span class="tag">{t('hifz.renforce')}</span>{/if}
          </h3>
          {#if task.label}<p class="muted small">{task.label}</p>{/if}
          <VerseText verses={texts[`w:${task.part}:${task.from}`] ?? []} {basmala} {masked} />
          {#if task.kind === 'nouveau'}
            {#if learned(task.part, task.from)}
              <p class="done" data-testid="appris">✓ {t('hifz.deja_appris')}</p>
            {:else}
              <button
                type="button"
                class="primary"
                disabled={view.plan.stopRule}
                onclick={() => learnTask(task.part, task.from, task.to)}
                data-testid="je-l-ai-appris">{t('hifz.je_l_ai_appris')}</button
              >
            {/if}
          {:else}
            <div class="rate" role="group" aria-label={t('hifz.comment')}>
              {#each Q as q (q)}<button type="button" onclick={() => rate(task.part, q)} data-q={q}
                  >{t(`hifz.q${q}`)}</button
                >{/each}
            </div>
          {/if}
        </article>
      {:else}
        <p class="muted">{t('hifz.rien_cette_semaine')}</p>
      {/each}
    {:else if view.portion}
      <article class="task">
        <h3>{view.portion.refs.map(refLabel).join(' ; ')}</h3>
        <VerseText verses={texts.portion ?? []} {basmala} {masked} />
        {#if view.learnedToday}
          <p class="done" data-testid="appris">✓ {t('hifz.deja_appris')}</p>
        {:else}
          <button
            type="button"
            class="primary"
            disabled={!view.plan.newAllowed}
            onclick={learnPortion}
            data-testid="je-l-ai-appris">{t('hifz.je_l_ai_appris')}</button
          >
        {/if}
      </article>
    {:else}
      <p class="muted">{t('hifz.pas_de_nouveau')}</p>
    {/if}
    <details class="gestes">
      <summary>{t('hifz.gestes')}</summary>
      <ol>
        {#each [1, 2, 3, 4, 5] as g (g)}<li>{t(`hifz.geste${g}`)}</li>{/each}
      </ol>
    </details>
  </section>

  <!-- ② récent -->
  <section class="card track" data-testid="piste-recent">
    <h2><span class="num">②</span> {t('hifz.recent')}</h2>
    {#each view.plan.recent as it (it.key)}
      <article class="task" data-part={it.key}>
        <h3>{label(it.key)} <span class="tag">{t('hifz.jplus', { n: it.step ?? 0 })}</span></h3>
        <details bind:open={open[it.key]}>
          <summary>{t('hifz.voir_texte')}</summary>
          <VerseText verses={texts[it.key] ?? []} {basmala} {masked} />
        </details>
        <div class="rate" role="group" aria-label={t('hifz.comment')}>
          {#each Q as q (q)}<button type="button" onclick={() => rate(it.key, q)} data-q={q}
              >{t(parentMode ? `hifz.p${q}` : `hifz.q${q}`)}</button
            >{/each}
        </div>
      </article>
    {:else}
      <p class="muted">{t('hifz.rien_recent')}</p>
    {/each}
  </section>

  <!-- ③ ancien -->
  <section class="card track" data-testid="piste-ancien">
    <h2><span class="num">③</span> {t('hifz.ancien')}</h2>
    {#each view.plan.manzil as it (it.key)}
      <article class="task" data-part={it.key}>
        <h3>
          {label(it.key)}
          {#if it.fragile}<span class="tag fragile">{t('hifz.fragile')}</span>{/if}
        </h3>
        <details bind:open={open[it.key]}>
          <summary>{t('hifz.voir_texte')}</summary>
          <VerseText verses={texts[it.key] ?? []} {basmala} {masked} />
        </details>
        <div class="rate" role="group" aria-label={t('hifz.comment')}>
          {#each Q as q (q)}<button type="button" onclick={() => rate(it.key, q)} data-q={q}
              >{t(parentMode ? `hifz.p${q}` : `hifz.q${q}`)}</button
            >{/each}
        </div>
      </article>
    {:else}
      <p class="muted">{t('hifz.rien_ancien')}</p>
    {/each}
    {#if view.plan.overdue.length}
      <p class="warn small" data-testid="dette">
        {t('hifz.dette', {
          n: view.plan.overdue.length,
          minutes: Math.round(view.plan.debtMinutes),
        })}
      </p>
    {/if}
    {#if view.plan.proposeRelief}
      <div class="card warnbox" data-testid="proposition-allegement">
        <p>{t('hifz.proposer_allegement')}</p>
        {#if canManage}
          <div class="row">
            <button type="button" onclick={() => relief(0.5)}>{t('hifz.reduire_moitie')}</button>
            <button type="button" onclick={() => relief(0)}>{t('hifz.suspendre_semaine')}</button>
            <button type="button" onclick={() => (editing = true)}
              >{t('hifz.changer_rythme')}</button
            >
          </div>
        {:else}<p class="muted small">{t('hifz.decision_adulte')}</p>{/if}
      </div>
    {/if}
  </section>

  {#if recAllowed}
    <section class="card">
      <h2>{t('hifz.je_m_enregistre')}</h2>
      <Recorder
        profileId={profile!.id}
        part={view.plan.recent[0]?.key ?? view.weekTasks[0]?.part ?? 'libre'}
      />
    </section>
  {/if}

  <section class="card">
    <h2>{t('hifz.frise')}</h2>
    <ul class="frise">
      {#each [...view.state.parts.values()].filter((p) => p.learnedDay !== null) as p (p.key)}
        <li>
          <span class="lbl">{label(p.key)}</span>
          <span class="steps">
            {#each [0, ...STEPS] as s, i (s)}<span class="st" class:ok={i === 0 || p.stage >= i}
                >{i === 0 ? 'J0' : `J+${s}`}</span
              >{/each}<span class="st" class:ok={p.stage >= MANZIL}>{t('hifz.roue')}</span>
          </span>
        </li>
      {:else}
        <li class="muted">{t('hifz.frise_vide')}</li>
      {/each}
    </ul>
  </section>

  <section class="card" data-testid="validations">
    <h2>{t('hifz.validations')}</h2>
    {#each teacherNotes as e (e.id)}
      {@const n = (e.details as { note?: { total: number; mention: string } } | null)?.note}
      <p>
        <strong>{label(e.part)}</strong> — {fmtDate(e.day, { dateStyle: 'medium' })} —
        {#if isChild && profile && (profile.levelCode === 'en1' || profile.levelCode === 'en2')}
          <span class="star {STAR[n?.mention ?? 'bien']}">★</span>
          {t(`hifz.bravo_${STAR[n?.mention ?? 'bien']}`)}
        {:else if n}
          {t('hifz.note', { n: fmtNumber(n.total) })} · {t(`hifz.mention_${n.mention}`)}
        {/if}
      </p>
    {:else}
      <p class="muted">{t('hifz.pas_de_validation')}</p>
    {/each}
    {#if data.classes.length}<p class="muted small">
        {t('hifz.classes', { noms: data.classes.map((c) => c.name).join(', ') })}
      </p>{/if}
    <p class="muted small">{t('hifz.maitre_seul_juge')}</p>
  </section>
{:else if loaded}
  <p class="card muted">{t('hifz.hors_ligne')}</p>
{/if}

<style>
  .setup,
  .pin {
    display: grid;
    gap: 8px;
  }
  .setup select,
  .pin input {
    font: inherit;
    min-height: 44px;
    padding: 4px 8px;
    border: 2px solid var(--line);
    border-radius: 10px;
  }
  .radio,
  .check {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .radio input,
  .check input {
    width: 22px;
    height: 22px;
    flex: none;
  }
  /* le tableau des rythmes défile seul sur téléphone ; la grille du formulaire ne s'élargit pas */
  .setup > :global(*) {
    min-width: 0;
  }
  .tw {
    overflow-x: auto;
    max-width: 100%;
  }
  .rhythms {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.92rem;
  }
  .rhythms th,
  .rhythms td {
    border-bottom: 1px solid var(--line);
    padding: 6px;
    text-align: start;
  }
  .rhythms tr.sel {
    background: #eaf7f1;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .track h2 .num {
    color: var(--teal);
  }
  .task {
    border-top: 1px solid var(--line);
    padding-top: 10px;
    margin-top: 10px;
    display: grid;
    gap: 6px;
  }
  .task h3 {
    margin: 0;
    font-size: 1.05rem;
  }
  .tag {
    font-size: 0.8rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 1px 8px;
    margin-inline-start: 4px;
  }
  .tag.fragile {
    border-color: #b3261e;
    color: #b3261e;
  }
  .rate {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .rate button {
    min-height: 44px;
  }
  .done {
    color: #1b7f4b;
    font-weight: 700;
  }
  .warn {
    color: #8a5a00;
  }
  .warnbox {
    background: #fff8e1;
  }
  .ok {
    background: #eaf7f1;
  }
  .error {
    color: #b3261e;
  }
  .bar {
    height: 10px;
    background: var(--line);
    border-radius: 999px;
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--teal);
  }
  .small {
    font-size: 0.9rem;
  }
  .frise {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .frise li {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .lbl {
    min-width: 12em;
  }
  .steps {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  .st {
    font-size: 0.75rem;
    padding: 1px 5px;
    border-radius: 6px;
    border: 1px solid var(--line);
    color: var(--muted, #666);
  }
  .st.ok {
    background: var(--teal);
    border-color: var(--teal);
    color: #fff;
  }
  .star {
    font-size: 1.3rem;
  }
  .star.or {
    color: #d4a017;
  }
  .star.argent {
    color: #8a8f98;
  }
  .star.verte {
    color: #1b7f4b;
  }
  .parent {
    color: var(--teal);
  }
</style>
