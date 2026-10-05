<script lang="ts">
  import { onMount } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import { levelLabel } from '$lib/levels';
  import { PILOTES, readVivante, writeVivante, type VivReglage } from './reglage';

  /** Chantier A21 — préférences des leçons vivantes (réglage de l'appareil). */
  const range = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);
  /** livres d'arabe : enfants 1–5, ados 1–4, adultes 1–10 */
  const LEVELS = [...range('en', 5), ...range('ado', 4), ...range('ad', 10)];
  let r: VivReglage = $state({ on: true, levels: [] });
  onMount(() => (r = readVivante()));
  const save = () => writeVivante(r);
  const pilotes = PILOTES.map((u) => levelLabel(u.split('.')[0]!)).join(', ');
</script>

<section class="card viv-reglages" data-testid="vivante-reglages">
  <h2>{t('viv.reglages')}</h2>
  <p class="muted">{t('viv.reglages_intro')}</p>
  <label class="check"
    ><input type="checkbox" bind:checked={r.on} onchange={save} data-testid="vivante-actif" /><span
      >{t('viv.actif')}</span
    ></label
  >
  {#if r.on}
    <p class="muted"><Bidi text={t('viv.pilotes', { liste: pilotes })} /></p>
    <fieldset>
      <legend>{t('viv.niveaux')}</legend>
      <div class="lv">
        {#each LEVELS as l (l)}<label class="check"
            ><input
              type="checkbox"
              checked={r.levels.includes(l)}
              data-viv-level={l}
              onchange={(e) => {
                r.levels = e.currentTarget.checked
                  ? [...r.levels, l]
                  : r.levels.filter((x) => x !== l);
                save();
              }}
            /><span><Bidi text={levelLabel(l)} /></span></label
          >{/each}
      </div>
    </fieldset>
  {/if}
</section>

<style>
  .check {
    display: flex;
    gap: 10px;
    align-items: center;
    min-height: 44px;
  }
  .check input {
    width: 24px;
    height: 24px;
    flex: none;
  }
  fieldset {
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 6px 12px;
  }
  legend {
    font-weight: 700;
    padding: 0 4px;
  }
  .lv {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0 12px;
  }
</style>
