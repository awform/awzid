<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onDestroy } from 'svelte';
  import { fmtNumber, t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import QuotidienTabs from '$lib/quotidien/QuotidienTabs.svelte';
  import Lieu from '$lib/quotidien/Lieu.svelte';
  import QiblaCarte from '$lib/quotidien/QiblaCarte.svelte';
  import { placeOf } from '$lib/quotidien/lieu';
  import { distanceKm, headingOf, qiblaBearing } from '$lib/quotidien/qibla';
  import { readPrefs, writePrefs, type QuotidienPrefs } from '$lib/quotidien/reglages';

  /**
   * A12 — qibla : angle du grand cercle vers la Kaʿba depuis le nord ; boussole avec l'orientation de l'appareil
   * si elle est disponible (autorisation demandée sur iOS), sinon rose des vents fixe et petite carte schématique.
   */
  let prefs = $state<QuotidienPrefs>(readPrefs());
  const place = $derived(placeOf(prefs.place));
  const bearing = $derived(place ? qiblaBearing(place.lat, place.lng) : null);
  const km = $derived(place ? distanceKm(place.lat, place.lng) : null);

  let heading = $state<number | null>(null);
  let compass = $state<'off' | 'attente' | 'on' | 'indisponible' | 'refus'>('off');
  let listening: ((e: Event) => void) | null = null;
  let evName = '';
  let timeout: ReturnType<typeof setTimeout> | null = null;

  /** angle de la flèche à l'écran : qibla par rapport au haut de l'appareil (ou au nord si rose fixe) */
  const needle = $derived(bearing === null ? 0 : heading === null ? bearing : bearing - heading);
  const aligned = $derived(
    heading !== null && bearing !== null && Math.abs((((needle % 360) + 540) % 360) - 180) < 5,
  );

  type OrientationCtor = { requestPermission?: () => Promise<'granted' | 'denied'> };

  async function startCompass() {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      compass = 'indisponible';
      return;
    }
    const ctor = window.DeviceOrientationEvent as unknown as OrientationCtor;
    if (typeof ctor.requestPermission === 'function') {
      try {
        if ((await ctor.requestPermission()) !== 'granted') {
          compass = 'refus';
          return;
        }
      } catch {
        compass = 'refus';
        return;
      }
    }
    compass = 'attente';
    listening = (e: Event) => {
      const h = headingOf(e as DeviceOrientationEvent & { webkitCompassHeading?: number });
      if (h !== null) {
        heading = h;
        compass = 'on';
      }
    };
    evName =
      'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(evName, listening);
    // aucun cap rapporté au nord après quelques secondes : boussole indisponible (ordinateur, capteur absent)
    timeout = setTimeout(() => {
      if (compass === 'attente') {
        stopCompass();
        compass = 'indisponible';
      }
    }, 4000);
  }
  function stopCompass() {
    if (listening && evName) window.removeEventListener(evName, listening);
    listening = null;
    heading = null;
    if (timeout) clearTimeout(timeout);
    if (compass === 'on' || compass === 'attente') compass = 'off';
  }
  onDestroy(stopCompass);

  const deg = (n: number) => fmtNumber(n, { maximumFractionDigits: 0 });
  const TICKS = Array.from({ length: 72 }, (_, i) => i * 5);
</script>

<svelte:head><title>{t('app.nom')} — {t('qt.qibla_titre')}</title></svelte:head>

<h1>{t('qt.titre')}</h1>
<QuotidienTabs current="qibla" />

{#if !place || bearing === null}
  <Lieu
    onchange={(p) => {
      prefs = { ...prefs, place: p };
      writePrefs(prefs);
    }}
  />
{:else}
  <section class="card qibla" aria-labelledby="qt-qibla-h" data-testid="qt-qibla">
    <h2 id="qt-qibla-h">{t('qt.qibla_titre')}</h2>
    <p class="angle" data-testid="qt-qibla-angle">
      <strong><Bidi text={t('qt.degres', { n: deg(bearing) })} /></strong>
      <span class="muted">{t('qt.depuis_nord')}</span>
    </p>
    <p class="muted small">
      <Bidi text={t('qt.qibla_lieu', { lieu: place.label, km: fmtNumber(Math.round(km ?? 0)) })} />
    </p>

    <div class="dial-wrap" class:aligned>
      <svg
        class="dial"
        viewBox="-110 -110 220 220"
        role="img"
        aria-label={t('qt.qibla_rose', { n: deg(bearing) })}
      >
        <g transform={`rotate(${heading === null ? 0 : -heading})`}>
          <circle r="100" class="ring" />
          {#each TICKS as a (a)}
            <line
              x1="0"
              y1="-100"
              x2="0"
              y2={a % 90 === 0 ? -86 : a % 30 === 0 ? -91 : -95}
              transform={`rotate(${a})`}
              class:major={a % 90 === 0}
              class="tick"
            />
          {/each}
          <text y="-70" class="cardinal north">{t('qt.c_n')}</text>
          <text x="72" y="2" class="cardinal">{t('qt.c_e')}</text>
          <text y="74" class="cardinal">{t('qt.c_s')}</text>
          <text x="-72" y="2" class="cardinal">{t('qt.c_o')}</text>
          <!-- direction de la qibla : losange géométrique (aucune figuration) -->
          <g transform={`rotate(${bearing})`}>
            <line y1="0" y2="-78" class="needle" />
            <path d="M0 -96 L7 -82 L0 -68 L-7 -82 Z" class="kaaba" />
          </g>
        </g>
        <circle r="6" class="hub" />
        {#if heading !== null}<path d="M0 -108 L6 -100 L-6 -100 Z" class="top" />{/if}
      </svg>
    </div>

    {#if compass === 'on'}
      <p class="state" role="status">
        <Bidi text={aligned ? t('qt.boussole_alignee') : t('qt.boussole_tourner')} />
      </p>
      <button type="button" class="ghost" onclick={stopCompass}>{t('qt.boussole_arreter')}</button>
    {:else}
      <p class="muted small">{t('qt.rose_fixe')}</p>
      <button
        type="button"
        class="button"
        onclick={startCompass}
        disabled={compass === 'attente'}
        data-testid="qt-boussole"
        ><Icon name="boussole" size={20} />{t('qt.boussole_activer')}</button
      >
      {#if compass === 'indisponible' || compass === 'refus'}
        <p class="warnbox" role="status"><Bidi text={t(`qt.boussole_${compass}`)} /></p>
      {/if}
    {/if}
    <p class="warn" data-testid="qt-qibla-aimants">
      <Icon name="alerte" size={18} /><span>{t('qt.aimants')}</span>
    </p>
  </section>

  <section class="card" aria-labelledby="qt-carte-h">
    <h2 id="qt-carte-h">{t('qt.carte_titre')}</h2>
    <QiblaCarte lat={place.lat} lng={place.lng} label={place.label} />
    <p class="muted small">{t('qt.carte_aide')}</p>
  </section>
{/if}

<style>
  .angle {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
    margin: 0;
  }
  .angle strong {
    font-size: 2.6rem;
    line-height: 1.1;
    color: var(--primary);
    font-variant-numeric: tabular-nums;
  }
  .small {
    font-size: 0.9rem;
  }
  .dial-wrap {
    display: grid;
    place-items: center;
    margin: var(--space-m) auto;
    max-width: 320px;
    border-radius: 50%;
    transition: box-shadow var(--motion-fast) ease;
  }
  .dial-wrap.aligned {
    box-shadow: 0 0 0 6px var(--ok-bg);
  }
  .dial {
    width: 100%;
    height: auto;
  }
  .dial g {
    transition: transform 0.2s linear;
  }
  .ring {
    fill: var(--surface);
    stroke: var(--line);
    stroke-width: 2;
  }
  .tick {
    stroke: var(--ink2);
    stroke-width: 1;
  }
  .tick.major {
    stroke: var(--ink);
    stroke-width: 2.5;
  }
  .cardinal {
    font: 700 15px var(--font-ui);
    fill: var(--ink2);
    text-anchor: middle;
    dominant-baseline: middle;
  }
  .cardinal.north {
    fill: var(--bad-ink);
  }
  .needle {
    stroke: var(--primary);
    stroke-width: 4;
    stroke-linecap: round;
  }
  .kaaba {
    fill: var(--primary);
  }
  .hub {
    fill: var(--card);
    stroke: var(--primary);
    stroke-width: 3;
  }
  .top {
    fill: var(--accent);
  }
  .state {
    text-align: center;
    font-weight: 700;
  }
  .warn {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    margin: var(--space-m) 0 0;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    background: var(--warn-bg);
    color: var(--warn-ink);
    font-weight: 600;
  }
  @media (prefers-reduced-motion: reduce) {
    .dial g {
      transition: none;
    }
  }
</style>
