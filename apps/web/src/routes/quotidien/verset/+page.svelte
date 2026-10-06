<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount, tick } from 'svelte';
  import { page } from '$app/state';
  import { suraName } from '@awform/hifz';
  import { loadMeta, loadVerses } from '$lib/hifz';
  import { fmtNumber, locale, t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import QuotidienTabs from '$lib/quotidien/QuotidienTabs.svelte';
  import { loadTranslation, translationInfo } from '$lib/quran/translation';
  // F5 : dessin de l'image chargé à la demande (gardé pour le hors ligne avec la coquille)
  import { H, W } from '$lib/quotidien/partage-taille';

  /**
   * A12 — partager un verset en image : texte Tanzil tel quel (police Amiri Quran), référence et traduction du
   * sens de QuranEnc (source et version écrites sur l'image). Aucun visage, aucun décor figuratif.
   * Image fabriquée sur l'appareil ; partage par la feuille de partage du système, sinon enregistrement.
   */
  const q = page.url.searchParams;
  let sura = $state(clampInt(q.get('s'), 1, 114, 1));
  let aya = $state(clampInt(q.get('a'), 1, 286, 1));
  let counts = $state<number[]>([]);
  let withTr = $state(true);
  let mushafStyle = $state(true);
  let text = $state('');
  let translation = $state('');
  let status = $state<'' | 'charge' | 'hors_ligne' | 'trop_long'>('');
  let canvas = $state<HTMLCanvasElement | null>(null);
  let shared = $state('');
  const trKey = $derived(locale() === 'fr' ? 'french_rashid' : 'english_rwwad');
  const trInfo = $derived(translationInfo(trKey));
  const max = $derived(counts[sura - 1] ?? 286);

  function clampInt(v: string | null, lo: number, hi: number, d: number) {
    const n = Number(v);
    return Number.isInteger(n) && n >= lo && n <= hi ? n : d;
  }

  async function load() {
    status = 'charge';
    shared = '';
    if (aya > max) aya = max;
    const [v] = await loadVerses(sura, aya, aya).catch(() => []);
    text = v?.text ?? '';
    const tr = withTr ? await loadTranslation(trKey, sura).catch(() => null) : null;
    translation = tr?.verses.get(aya)?.text ?? '';
    status = text ? '' : 'hors_ligne';
    await tick();
    await render();
  }

  async function render() {
    if (!canvas || !text) return;
    try {
      await document.fonts.load(`48px 'Amiri Quran'`, text);
      await document.fonts.load(`700 34px 'Nunito'`);
    } catch {
      /* police déjà là ou indisponible : le rendu attend quand même la police du Coran ci-dessous */
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { colorsFrom, drawVerse } = await import('$lib/quotidien/partage');
    const r = drawVerse(
      ctx,
      {
        arabic: text,
        reference: t('qt.image_ref', { sourate: suraName(sura), s: sura, a: aya }),
        translation: withTr ? translation : '',
        translationLang: trInfo?.lang ?? 'fr',
        credit:
          withTr && translation && trInfo
            ? t('qt.image_credit', { traducteur: t(trInfo.label), version: trInfo.version })
            : '',
        brand: t('app.nom'),
      },
      colorsFrom(getComputedStyle(document.documentElement), mushafStyle),
    );
    status = r.arabicFits && r.translationFits ? '' : 'trop_long';
  }

  async function blob(): Promise<Blob | null> {
    return new Promise((res) => canvas?.toBlob((b) => res(b), 'image/png') ?? res(null));
  }
  const fileName = () => `awzid-verset-${sura}-${aya}.png`;

  async function share() {
    const b = await blob();
    if (!b) return;
    const file = new File([b], fileName(), { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({
          files: [file],
          title: t('qt.image_ref', { sourate: suraName(sura), s: sura, a: aya }),
        });
        shared = t('qt.image_partagee');
      } catch {
        /* partage annulé */
      }
    } else save(b);
  }
  function save(b: Blob) {
    const url = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    shared = t('qt.image_enregistree');
  }

  onMount(async () => {
    const meta = await loadMeta().catch(() => null);
    counts = (meta?.weights ?? []).map((w) => w.length);
    await load();
  });
</script>

<svelte:head><title>{t('app.nom')} — {t('qt.verset_titre')}</title></svelte:head>

<h1>{t('qt.titre')}</h1>
<QuotidienTabs current="verset" />

<section class="card" aria-labelledby="qt-verset-h">
  <h2 id="qt-verset-h">{t('qt.verset_titre')}</h2>
  <p class="muted">{t('qt.verset_intro')}</p>
  <form
    class="choix"
    onsubmit={(e) => {
      e.preventDefault();
      void load();
    }}
  >
    <label class="field">
      <span>{t('qt.sourate')}</span>
      <select bind:value={sura} data-testid="qt-sourate">
        {#each Array.from({ length: 114 }, (_, i) => i + 1) as s (s)}
          <option value={s}>{fmtNumber(s)}. {suraName(s)}</option>
        {/each}
      </select>
    </label>
    <label class="field num">
      <span>{t('qt.verset')}</span>
      <input
        type="number"
        min="1"
        {max}
        bind:value={aya}
        inputmode="numeric"
        data-testid="qt-aya"
      />
    </label>
    <button type="submit" class="primary" data-testid="qt-afficher">{t('qt.afficher')}</button>
  </form>
  <div class="options">
    <label class="opt"
      ><input type="checkbox" bind:checked={withTr} onchange={() => void load()} /><span
        >{t('qt.avec_traduction')}</span
      ></label
    >
    <label class="opt"
      ><input type="checkbox" bind:checked={mushafStyle} onchange={() => void render()} /><span
        >{t('qt.style_mushaf')}</span
      ></label
    >
  </div>
</section>

<div class="apercu">
  <canvas
    bind:this={canvas}
    width={W}
    height={H}
    aria-hidden="true"
    data-testid="qt-canvas"
    class:vide={!text}
  ></canvas>
  <p class="sr"><Bidi text={t('qt.image_aria', { sourate: suraName(sura), s: sura, a: aya })} /></p>
  {#if text}
    <!-- texte du verset pour les lecteurs d'écran : Tanzil tel quel -->
    <p class="sr quran-text" lang="ar" dir="rtl" data-testid="qt-verset-texte">{text}</p>
  {/if}
</div>
{#if status === 'hors_ligne'}
  <p class="warnbox" role="status">{t('qt.verset_hors_ligne')}</p>
{:else if status === 'trop_long'}
  <p class="warnbox" role="status">{t('qt.verset_trop_long')}</p>
{/if}
<div class="actions">
  <button type="button" class="primary" onclick={share} disabled={!text} data-testid="qt-partager"
    ><Icon name="partager" size={20} />{t('qt.partager')}</button
  >
  <button
    type="button"
    class="button"
    onclick={async () => {
      const b = await blob();
      if (b) save(b);
    }}
    disabled={!text}><Icon name="telecharger" size={20} />{t('qt.enregistrer')}</button
  >
</div>
{#if shared}<p class="muted" role="status"><Bidi text={shared} /></p>{/if}
<p class="muted small">{t('qt.verset_regles')}</p>

<style>
  .choix {
    display: grid;
    grid-template-columns: 1fr 7em auto;
    gap: 8px;
    align-items: end;
  }
  .field {
    display: grid;
    gap: 4px;
  }
  select,
  input[type='number'] {
    min-height: 48px;
    width: 100%;
  }
  .options {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 20px;
    margin-top: 8px;
  }
  .opt {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 48px;
  }
  .apercu {
    margin: var(--space-m) auto;
    max-width: 420px;
  }
  canvas {
    width: 100%;
    height: auto;
    display: block;
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    background: var(--surface);
  }
  canvas.vide {
    aspect-ratio: 4 / 5;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }
  .small {
    font-size: 0.88rem;
    text-align: center;
  }
  @media (max-width: 520px) {
    .choix {
      grid-template-columns: 1fr 6em;
    }
    .choix button {
      grid-column: 1 / -1;
    }
  }
</style>
