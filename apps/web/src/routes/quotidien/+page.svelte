<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onDestroy, onMount } from 'svelte';
  import { fmtDate, fmtNumber, locale, t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import QuotidienTabs from '$lib/quotidien/QuotidienTabs.svelte';
  import Lieu from '$lib/quotidien/Lieu.svelte';
  import { hijriOf, isRamadan } from '$lib/quotidien/hijri';
  import {
    civilDay,
    computeDay,
    fmtTime,
    loadAdhan,
    methodInfo,
    METHODS,
    nextDay,
    nextPrayer,
    remaining,
    settingsOf,
    type Adhan,
    type DayTimes,
  } from '$lib/quotidien/priere';
  import {
    ADJUST_MAX,
    defaultMethod,
    FRANCE_CHOICES,
    PRAYER_KEYS,
    readPrefs,
    writePrefs,
    type MethodId,
    type PrayerKey,
    type QuotidienPrefs,
  } from '$lib/quotidien/reglages';
  import { placeOf } from '$lib/quotidien/lieu';

  /**
   * A12 — « Au quotidien » : horaires des prières calculés sur l'appareil (hors ligne), prochaine prière,
   * calendrier hégirien. Rien n'est envoyé au serveur : lieu et réglages restent dans le navigateur.
   */
  const AR: Record<PrayerKey, string> = {
    fajr: 'الفجر',
    sunrise: 'الشروق',
    dhuhr: 'الظهر',
    asr: 'العصر',
    maghrib: 'المغرب',
    isha: 'العشاء',
  };

  let prefs = $state<QuotidienPrefs>(readPrefs());
  let A = $state<Adhan | null>(null);
  let failed = $state(false);
  let now = $state(new Date());
  let timer: ReturnType<typeof setInterval> | null = null;
  let reminderMsg = $state('');

  const place = $derived(placeOf(prefs.place));
  const method = $derived<MethodId | null>(
    prefs.method ?? (place ? defaultMethod(place.country) : null),
  );
  const mustChoose = $derived(!!place && !method);
  const settings = $derived(method ? settingsOf({ ...prefs, method }) : null);
  const today = $derived(place ? civilDay(now, place.tz) : null);
  const times = $derived<DayTimes | null>(
    A && place && settings && today ? computeDay(A, place.lat, place.lng, today, settings) : null,
  );
  const tomorrowTimes = $derived<DayTimes | null>(
    A && place && settings && today
      ? computeDay(A, place.lat, place.lng, nextDay(today), settings)
      : null,
  );
  const next = $derived(times && tomorrowTimes ? nextPrayer(now, times, tomorrowTimes) : null);
  const left = $derived(next ? remaining(now, next.at) : null);
  const hijri = $derived(hijriOf(now, prefs.hijriOffset, locale(), place?.tz));
  const info = $derived(method ? methodInfo(method) : null);

  function save(p: Partial<QuotidienPrefs>) {
    prefs = { ...prefs, ...p };
    writePrefs(prefs);
  }
  function setAdjust(k: PrayerKey, v: number) {
    const n = Math.max(-ADJUST_MAX, Math.min(ADJUST_MAX, Math.round(v) || 0));
    save({ adjust: { ...prefs.adjust, [k]: n } });
  }
  const num = (n: number) => fmtNumber(n, { signDisplay: 'exceptZero' });

  async function toggleReminders(on: boolean) {
    reminderMsg = '';
    const m = await import('$lib/quotidien/rappels');
    if (!on) {
      m.stopReminders();
      save({ reminders: false });
      return;
    }
    const r = await m.askPermission();
    if (r !== 'ok') {
      reminderMsg = t(`qt.rappels_${r}`);
      save({ reminders: false });
      return;
    }
    save({ reminders: true });
    void m.startReminders();
  }

  onMount(() => {
    loadAdhan()
      .then((m) => (A = m))
      .catch(() => (failed = true));
    timer = setInterval(() => (now = new Date()), 20_000);
  });
  onDestroy(() => {
    if (timer) clearInterval(timer);
  });
</script>

<svelte:head><title>{t('app.nom')} — {t('qt.titre')}</title></svelte:head>

<h1>{t('qt.titre')}</h1>
<QuotidienTabs current="horaires" />

{#if !place}
  <Lieu onchange={(p) => save({ place: p, method: prefs.method })} />
{:else}
  <section class="hero card" data-testid="qt-hero" aria-labelledby="qt-lieu">
    <div class="hero-top">
      <p class="lieu" id="qt-lieu">
        <Icon name="lieu" size={18} /><Bidi text={place.label} />
      </p>
      <p class="dates">
        <span
          ><Bidi
            text={fmtDate(now, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              timeZone: place.tz,
            })}
          /></span
        >
        {#if hijri}
          <span class="hijri" data-testid="qt-hijri"
            ><Bidi
              text={t('qt.hijri_date', {
                jour: hijri.day,
                mois: t(`qt.hijri_m${hijri.month}`),
                annee: String(hijri.year),
              })}
            /></span
          >
        {/if}
      </p>
    </div>
    {#if mustChoose}
      <div class="choose" data-testid="qt-choisir-methode">
        <h2>{t('qt.methode_choisir')}</h2>
        <p class="muted">{t('qt.methode_france')}</p>
        <div class="choices">
          {#each FRANCE_CHOICES as m (m)}
            {@const mi = methodInfo(m)}
            <button
              type="button"
              class="choice"
              onclick={() => save({ method: m })}
              data-methode={m}
            >
              <strong><Bidi text={t(`qt.methode_${m}`)} /></strong>
              <small
                ><Bidi
                  text={t('qt.angles', {
                    fajr: fmtNumber(mi.fajr),
                    isha: fmtNumber(mi.isha as number),
                  })}
                /></small
              >
            </button>
          {/each}
        </div>
      </div>
    {:else if failed}
      <p class="error" role="alert">{t('qt.erreur_calcul')}</p>
    {:else if !times}
      <p class="muted" aria-busy="true">{t('qt.calcul')}</p>
    {:else}
      {#if next && left}
        <div class="next" data-testid="qt-prochaine" aria-live="polite">
          <span class="next-label">{t('qt.prochaine')}</span>
          <strong class="next-name"
            ><Bidi text={t(`qt.p_${next.key}`)} />
            <span lang="ar" dir="rtl" class="ar-inline"><Bidi text={AR[next.key]} base="ar" /></span
            ></strong
          >
          <span class="next-time"><Bidi text={fmtTime(next.at, place.tz, locale())} /></span>
          <span class="next-left"
            ><Bidi
              text={left.h > 0
                ? t('qt.dans_h', { h: left.h, min: left.min })
                : t('qt.dans_min', { min: left.min })}
            /></span
          >
        </div>
      {/if}
      <ol class="times" data-testid="qt-horaires">
        {#each PRAYER_KEYS as k (k)}
          <li
            class:sunrise={k === 'sunrise'}
            class:is-next={next?.key === k && !next.tomorrow}
            data-priere={k}
          >
            <span class="pn"
              ><Bidi text={t(`qt.p_${k}`)} /><span lang="ar" dir="rtl" class="ar-small"
                ><Bidi text={AR[k]} base="ar" /></span
              ></span
            >
            <span class="pt"><Bidi text={fmtTime(times[k], place.tz, locale())} /></span>
            {#if prefs.adjust[k] !== 0}<span class="adj" title={t('qt.ajuste')}
                ><Bidi text={t('qt.min_signe', { n: num(prefs.adjust[k]) })} /></span
              >{/if}
          </li>
        {/each}
      </ol>
      <p class="honest" data-testid="qt-mention">
        <Icon name="info" size={18} /><span>{t('qt.mention')}</span>
      </p>
      {#if info}
        <p class="method-line muted">
          <Bidi
            text={t('qt.methode_ligne', {
              methode: t(`qt.methode_${info.id}`),
              asr: t(`qt.asr_${prefs.asr}`),
            })}
          />
        </p>
      {/if}
    {/if}
  </section>

  {#if hijri}
    <section class="card hijri-card" aria-labelledby="qt-hijri-titre">
      <h2 id="qt-hijri-titre">{t('qt.hijri_titre')}</h2>
      <p class="big-hijri">
        <Bidi
          text={t('qt.hijri_date', {
            jour: hijri.day,
            mois: t(`qt.hijri_m${hijri.month}`),
            annee: String(hijri.year),
          })}
        />
      </p>
      <p class="muted" class:warnbox={isRamadan(hijri)}>{t('qt.hijri_observation')}</p>
      <div class="stepper" role="group" aria-label={t('qt.hijri_decalage')}>
        <span>{t('qt.hijri_decalage')}</span>
        <span class="ctrl"
          ><button
            type="button"
            class="icon-step"
            aria-label={t('qt.moins_jour')}
            disabled={prefs.hijriOffset <= -2}
            onclick={() => save({ hijriOffset: prefs.hijriOffset - 1 })}
            ><Icon name="moins" /></button
          >
          <output data-testid="qt-hijri-decalage"
            ><Bidi text={t('qt.jours_signe', { n: num(prefs.hijriOffset) })} /></output
          >
          <button
            type="button"
            class="icon-step"
            aria-label={t('qt.plus_jour')}
            disabled={prefs.hijriOffset >= 2}
            onclick={() => save({ hijriOffset: prefs.hijriOffset + 1 })}
            ><Icon name="ajouter" /></button
          ></span
        >
      </div>
    </section>
  {/if}

  <details class="card reglages" data-testid="qt-reglages">
    <summary>{t('qt.reglages')}</summary>
    <div class="stack">
      <div class="row">
        <span><Bidi text={t('qt.lieu_actuel', { lieu: place.label })} /></span>
        <button type="button" class="button ghost" onclick={() => save({ place: null })}
          >{t('qt.lieu_changer')}</button
        >
      </div>
      <label class="field">
        <span>{t('qt.methode')}</span>
        <select
          value={method ?? ''}
          onchange={(e) => save({ method: (e.currentTarget.value || null) as MethodId | null })}
          data-testid="qt-methode"
        >
          {#if !method}<option value="">{t('qt.methode_choisir')}</option>{/if}
          {#each METHODS as m (m.id)}
            <option value={m.id}>{t(`qt.methode_${m.id}`)}</option>
          {/each}
        </select>
      </label>
      <fieldset>
        <legend>{t('qt.asr')}</legend>
        <label class="radio"
          ><input
            type="radio"
            name="asr"
            checked={prefs.asr === 'majorite'}
            onchange={() => save({ asr: 'majorite' })}
          /><span>{t('qt.asr_majorite_long')}</span></label
        >
        <label class="radio"
          ><input
            type="radio"
            name="asr"
            checked={prefs.asr === 'hanafite'}
            onchange={() => save({ asr: 'hanafite' })}
          /><span>{t('qt.asr_hanafite_long')}</span></label
        >
      </fieldset>
      <label class="field">
        <span>{t('qt.hautes_latitudes')}</span>
        <select
          value={prefs.highLat}
          onchange={(e) => save({ highLat: e.currentTarget.value as QuotidienPrefs['highLat'] })}
        >
          <option value="auto">{t('qt.hl_auto')}</option>
          <option value="milieu">{t('qt.hl_milieu')}</option>
          <option value="septieme">{t('qt.hl_septieme')}</option>
          <option value="angle">{t('qt.hl_angle')}</option>
        </select>
        <small class="muted">{t('qt.hautes_latitudes_aide')}</small>
      </label>
      <fieldset class="adjusts">
        <legend>{t('qt.ajustements')}</legend>
        <p class="muted small">{t('qt.ajustements_aide')}</p>
        {#each PRAYER_KEYS as k (k)}
          <div class="adj-row" data-ajuste={k}>
            <span><Bidi text={t(`qt.p_${k}`)} /></span>
            <span class="ctrl"
              ><button
                type="button"
                class="icon-step"
                aria-label={t('qt.moins_minute', { priere: t(`qt.p_${k}`) })}
                disabled={prefs.adjust[k] <= -ADJUST_MAX}
                onclick={() => setAdjust(k, prefs.adjust[k] - 1)}><Icon name="moins" /></button
              >
              <output><Bidi text={t('qt.min_signe', { n: num(prefs.adjust[k]) })} /></output>
              <button
                type="button"
                class="icon-step"
                aria-label={t('qt.plus_minute', { priere: t(`qt.p_${k}`) })}
                disabled={prefs.adjust[k] >= ADJUST_MAX}
                onclick={() => setAdjust(k, prefs.adjust[k] + 1)}><Icon name="ajouter" /></button
              ></span
            >
          </div>
        {/each}
      </fieldset>
      <fieldset>
        <legend>{t('qt.rappels')}</legend>
        <label class="radio">
          <input
            type="checkbox"
            checked={prefs.reminders}
            onchange={(e) => void toggleReminders(e.currentTarget.checked)}
            data-testid="qt-rappels"
          /><span>{t('qt.rappels_activer')}</span>
        </label>
        <p class="muted small">{t('qt.rappels_aide')}</p>
        {#if reminderMsg}<p class="warnbox" role="status"><Bidi text={reminderMsg} /></p>{/if}
      </fieldset>
      <p class="muted small"><Icon name="bouclier" size={16} /> {t('qt.vie_privee')}</p>
    </div>
  </details>
{/if}

<style>
  .hero {
    background:
      radial-gradient(120% 90% at 100% 0%, var(--primary-soft) 0%, transparent 60%), var(--card);
  }
  .hero-top {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 4px 16px;
    align-items: baseline;
  }
  .lieu {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-weight: 800;
    color: var(--primary);
  }
  .dates {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 2px 10px;
    color: var(--ink2);
    font-size: 0.95rem;
  }
  .hijri {
    font-weight: 700;
    color: var(--ink);
  }
  .ar-inline,
  .ar-small {
    font-family: var(--font-ar);
  }
  .ar-small {
    color: var(--ink2);
    font-size: 0.95em;
  }
  .pn {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 10px;
  }
  .ctrl {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .next {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: end;
    gap: 2px 12px;
    margin: var(--space-m) 0;
    padding: var(--space-m);
    border-radius: var(--radius-lg);
    background: var(--primary);
    color: var(--on-primary);
  }
  .next-label {
    grid-column: 1 / -1;
    font-size: 0.85rem;
    font-weight: 700;
    opacity: 0.9;
  }
  .next-name {
    font-size: 1.6rem;
    line-height: 1.2;
  }
  .next-time {
    font-size: 2rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    grid-row: 2 / 4;
    grid-column: 2;
    align-self: center;
  }
  .next-left {
    font-weight: 600;
    opacity: 0.95;
  }
  .times {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 4px;
  }
  .times li {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 8px;
    min-height: 48px;
    padding: 6px 12px;
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  .times li.sunrise {
    background: transparent;
    color: var(--ink2);
    font-size: 0.93rem;
  }
  .times li.is-next {
    outline: 2px solid var(--primary);
    background: var(--primary-soft);
    font-weight: 800;
  }
  .pt {
    font-variant-numeric: tabular-nums;
    font-weight: 800;
    font-size: 1.15rem;
  }
  .adj {
    font-size: 0.78rem;
    color: var(--accent);
    font-weight: 700;
  }
  .honest {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    margin: var(--space-m) 0 0;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    background: var(--info-bg);
    color: var(--info);
    font-weight: 600;
  }
  .method-line {
    font-size: 0.88rem;
    margin: 8px 0 0;
  }
  .choose h2 {
    font-size: 1.15rem;
    margin: var(--space-m) 0 4px;
  }
  .choices {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
    gap: 8px;
    margin-top: var(--space-s);
  }
  .choice {
    display: grid;
    gap: 2px;
    text-align: start;
    min-height: 64px;
    padding: 10px 14px;
    border-radius: var(--radius-md);
    border: 2px solid var(--line);
    background: var(--card);
    color: var(--ink);
  }
  .choice:hover {
    border-color: var(--primary);
  }
  .choice small {
    color: var(--ink2);
  }
  .big-hijri {
    font-size: 1.35rem;
    font-weight: 800;
    margin: 0 0 6px;
  }
  .stepper,
  .adj-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .stepper > span:first-child,
  .adj-row > span:first-child {
    flex: 1 1 6em;
  }
  .adj-row {
    min-height: 48px;
    border-bottom: 1px solid var(--line);
  }
  .icon-step {
    display: inline-grid;
    place-items: center;
    min-width: 48px;
    min-height: 48px;
    padding: 0;
    border-radius: var(--radius-pill);
  }
  output {
    min-width: 4em;
    text-align: center;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .field {
    display: grid;
    gap: 4px;
  }
  .radio {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 48px;
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
  }
  legend {
    font-weight: 700;
    margin-bottom: 4px;
  }
  .small {
    font-size: 0.88rem;
  }
  @media (max-width: 420px) {
    .next-name {
      font-size: 1.3rem;
    }
    .next-time {
      font-size: 1.6rem;
    }
  }
</style>
