<script lang="ts">
  import { onMount } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { loadVerses, localIso, recordHifz } from '$lib/hifz';
  import { t } from '$lib/i18n';
  import VerseText from '$lib/VerseText.svelte';
  import { chargerCarnet, cleDe, garderPriere, libelle, lirePriere, type Priere } from './donnees';
  import {
    AUTO_EVALS,
    dansMemorise,
    QUALITE,
    type AutoEval,
    type Passage,
    type Plage,
  } from './outils';

  /**
   * Hifẓ complet — MODE « 2 RAKʿA » : choisir deux passages DÉJÀ MÉMORISÉS à réciter dans la prière (gardés sur
   * l'appareil), puis les réviser juste avant (texte voilé, un toucher le montre ; auto-évaluation enregistrée
   * comme révision du carnet quand le passage est une part entière). Aucune règle de fiqh n'est écrite ici.
   */
  let { profileId }: { profileId: string } = $props();
  type Verse = { s: number; a: number; text: string };
  const RAKAA = ['r1', 'r2'] as const;
  let passages = $state<Passage[]>([]);
  let basmala = $state('');
  let choix = $state<Priere>({ r1: null, r2: null });
  let charge = $state(false);
  let etape = $state<0 | 1 | 2 | 3>(0);
  let textes = $state<Verse[]>([]);

  const options = $derived(
    passages.flatMap((p) =>
      p.ref.map((r, i) => ({ key: p.ref.length === 1 ? p.key : `${p.key}#${i}`, r })),
    ),
  );
  const plages = $derived(passages.flatMap((p) => p.ref));

  onMount(async () => {
    const c = await chargerCarnet(profileId);
    passages = c?.passages ?? [];
    basmala = c?.basmala ?? '';
    const p = await lirePriere(profileId);
    // un passage qui n'est plus mémorisé (plan changé) n'est pas repris
    choix = {
      r1: p.r1 && dansMemorise(p.r1, plages) ? p.r1 : null,
      r2: p.r2 && dansMemorise(p.r2, plages) ? p.r2 : null,
    };
    charge = true;
  });

  function choisir(n: 'r1' | 'r2', key: string) {
    const o = options.find((x) => x.key === key);
    choix[n] = o ? { ...o.r, key: o.key } : null;
    void garderPriere(profileId, choix);
  }
  function borne(n: 'r1' | 'r2', bout: 'from' | 'to', v: number) {
    const c = choix[n];
    if (!c) return;
    const o = options.find((x) => x.key === c.key);
    if (!o) return;
    const p: Plage = { ...c, [bout]: v };
    if (dansMemorise(p, [o.r])) {
      choix[n] = { ...p, key: c.key };
      void garderPriere(profileId, choix);
    }
  }

  async function montrer(n: 1 | 2) {
    etape = n;
    const r = n === 1 ? choix.r1 : choix.r2;
    textes = r ? await loadVerses(r.s, r.from, r.to) : [];
  }
  async function noter(e: AutoEval) {
    const r = etape === 1 ? choix.r1 : choix.r2;
    if (r) {
      // part entière du carnet → sa clé (révision comptée) ; sinon la plage (journal seulement)
      const o = options.find((x) => x.key === r.key);
      const entiere = o && o.r.from === r.from && o.r.to === r.to && !r.key.includes('#');
      await recordHifz(profileId, {
        day: localIso(),
        part: entiere ? r.key : cleDe(r),
        kind: 'revision',
        q: QUALITE[e],
        source: 'auto',
      });
    }
    if (etape === 1) await montrer(2);
    else etape = 3;
  }
  const pret = $derived(!!choix.r1 && !!choix.r2);
</script>

{#if charge && !passages.length}
  <p class="card muted" data-testid="priere-vide">{t('hz.priere_vide')}</p>
{:else if charge && etape === 0}
  <form
    class="card choix"
    data-testid="priere-choix"
    onsubmit={(e) => (e.preventDefault(), montrer(1))}
  >
    {#each RAKAA as n (n)}
      <fieldset>
        <legend><Bidi text={t(`hz.rakaa_${n}`)} /></legend>
        <select
          value={choix[n]?.key ?? ''}
          onchange={(e) => choisir(n, e.currentTarget.value)}
          aria-label={t(`hz.rakaa_${n}`)}
          data-testid={`priere-${n}`}
        >
          <option value="">{t('hz.choisir_passage')}</option>
          {#each options as o (o.key)}<option value={o.key}>{libelle(o.r)}</option>{/each}
        </select>
        {#if choix[n]}
          <div class="bornes">
            <label
              >{t('hz.du_verset')}
              <input
                type="number"
                min="1"
                value={choix[n]!.from}
                onchange={(e) => borne(n, 'from', Number(e.currentTarget.value))}
                data-testid={`priere-${n}-de`}
              /></label
            >
            <label
              >{t('hz.au_verset')}
              <input
                type="number"
                min="1"
                value={choix[n]!.to}
                onchange={(e) => borne(n, 'to', Number(e.currentTarget.value))}
                data-testid={`priere-${n}-a`}
              /></label
            >
          </div>
        {/if}
      </fieldset>
    {/each}
    <button type="submit" class="primary" disabled={!pret} data-testid="reviser-priere"
      >{t('hz.reviser_priere')}</button
    >
  </form>
{:else if etape === 1 || etape === 2}
  {@const r = etape === 1 ? choix.r1 : choix.r2}
  <section class="card" data-testid="priere-revision" data-rakaa={etape}>
    <h2>
      <Bidi text={t(`hz.rakaa_r${etape}`)} /> — <Bidi text={r ? libelle(r) : ''} />
    </h2>
    <p class="muted small">{t('hz.priere_consigne')}</p>
    <VerseText verses={textes} {basmala} masked />
    <div class="row" role="group" aria-label={t('hz.comment')}>
      {#each AUTO_EVALS as e (e)}
        <button type="button" onclick={() => noter(e)} data-eval={e}
          ><Bidi text={t(`hz.eval_${e}`)} /></button
        >
      {/each}
    </div>
  </section>
{:else if etape === 3}
  <p class="card ok" role="status" data-testid="priere-prete">{t('hz.priere_prete')}</p>
  <button type="button" onclick={() => (etape = 0)}>{t('hz.changer_passages')}</button>
{/if}

<style>
  .choix {
    display: grid;
    gap: 10px;
  }
  fieldset {
    border: 1px solid var(--line);
    border-radius: 10px;
    display: grid;
    gap: 6px;
  }
  select,
  input {
    font: inherit;
    min-height: 44px;
    padding: 4px 8px;
    border: 2px solid var(--line);
    border-radius: 10px;
    max-width: 100%;
  }
  input {
    width: 5em;
  }
  .bornes {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .bornes label {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .row button {
    min-height: 44px;
  }
  .ok {
    background: var(--ok-bg);
  }
  .small {
    font-size: 0.9rem;
  }
</style>
