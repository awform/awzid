<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { resolve } from '$app/paths';
  import Ar from '$lib/Ar.svelte';
  import Illus from '$lib/Illus.svelte';
  import { t } from '$lib/i18n';
  import FreeAnswerSend from '$lib/FreeAnswerSend.svelte';
  import CarnetPratique from '$lib/CarnetPratique.svelte';
  import { calculOk, holes, orderOk, qcmOk, shuffle } from './check';

  /**
   * Un exercice des livres de religion : interactif quand le livre donne le corrigé (QCM, vrai/faux,
   * classer, trous, relier, ordre, frise, cas, calcul, tableau) ; sinon consigne et renvoi au cahier
   * (coloriage, dessin, carnet) ou à l'outil de l'application (tracer, mémoriser). Jamais de note.
   */
  type Obj = Record<string, unknown>;
  let {
    ex,
    n,
    profile = null,
    exerciseId = '',
  }: {
    ex: Obj;
    n: number;
    /** profil actif : réponse libre envoyable à l'enseignant de sa classe (lot 18) */
    profile?: { id: string; kind: string } | null;
    exerciseId?: string;
  } = $props();

  const items = $derived((Array.isArray(ex.items) ? ex.items : []) as Obj[]);
  const type = $derived(String(ex.type));
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const arr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]) : []);

  // réponses de l'élève (par item)
  let picked: Record<number, number> = $state({});
  let text: Record<number, string> = $state({});
  let shown: Record<number, boolean> = $state({});
  let order: number[] = $state([]);
  let blanks: Record<string, string> = $state({});
  let checkedBlanks = $state(false);

  const orderPool = $derived(
    shuffle(
      items.map((_, i) => i),
      items.length + 3,
    ),
  );
  const orderDone = $derived(order.length === items.length && items.length > 0);
  const bank = $derived(
    (arr(ex.banque).length ? arr(ex.banque) : arr(ex.reponses)).map((x) => String(x)),
  );
  const trous = $derived(holes(str(ex.texte_fr) || str(ex.texte_ar)));
  const relierRight = $derived(
    shuffle(
      items.map((it) => str(it.fr)),
      items.length + 5,
    ),
  );
  const cellHole = (r: number, c: number) =>
    arr(ex.trous).findIndex((p) => Array.isArray(p) && p[0] === r && p[1] === c);

  function pickOrder(i: number) {
    if (!order.includes(i)) order = [...order, i];
  }
  const verdict = (ok: boolean) => (ok ? t('rel.juste') : t('rel.essaie'));
</script>

<section class="rex" data-type={type} data-exercise={String(ex.id ?? n)}>
  <h3>
    <span class="n"><Bidi text={n} /></span>
    {#if str(ex.titre_ar)}<Ar text={str(ex.titre_ar)} />{/if}
    <span><Bidi text={str(ex.titre_fr)} /></span>
  </h3>
  {#if str(ex.consigne_fr)}<p class="consigne"><Bidi text={str(ex.consigne_fr)} /></p>{/if}

  {#if type === 'qcm' || type === 'cas' || type === 'ecoute'}
    {#each items as it, i (i)}
      {@const opts = arr(it.options).map(String)}
      <div class="item" data-item={i}>
        {#if str(it.situation_fr)}<p class="situation"><Bidi text={str(it.situation_fr)} /></p>{/if}
        {#if it.img}<Illus k={str(it.img)} cls="mini" />{/if}
        <p class="q">
          <Bidi
            text={str(it.q_fr) ||
              str(it.question_fr) ||
              (type === 'ecoute' ? t('rel.adulte_dit') : '')}
          />
        </p>
        {#if opts.length}
          <div class="opts">
            {#each opts as o, k (k)}
              {@const ok =
                type === 'ecoute'
                  ? o === str(it.dit)
                  : qcmOk(it as { options: unknown[]; reponse: unknown }, k)}
              <button
                type="button"
                class:good={picked[i] === k && ok}
                class:bad={picked[i] === k && !ok}
                onclick={() => (picked[i] = k)}
                data-k={k}><Ar text={o} /></button
              >
            {/each}
          </div>
          {#if picked[i] !== undefined}
            {@const ok =
              type === 'ecoute'
                ? opts[picked[i]!] === str(it.dit)
                : qcmOk(it as { options: unknown[]; reponse: unknown }, picked[i]!)}
            <p class="fb" class:ok role="status"><Bidi text={verdict(ok)} /></p>
            {#if ok && str(it.justification_fr)}<p class="just">
                <Bidi text={str(it.justification_fr)} />
              </p>{/if}
            {#if ok && str(it.source_fr)}<p class="src"><Bidi text={str(it.source_fr)} /></p>{/if}
          {/if}
        {:else}
          <button type="button" onclick={() => (shown[i] = !shown[i])}
            >{t('rel.voir_reponse')}</button
          >
          {#if shown[i]}
            {#each arr(it.etapes_fr) as e, k (k)}<p class="just">
                <Bidi text={String(e)} />
              </p>{/each}
            {#if str(it.justification_fr)}<p class="just">
                <Bidi text={str(it.justification_fr)} />
              </p>{/if}
          {/if}
        {/if}
      </div>
    {/each}
  {:else if type === 'vrai_faux'}
    {#each items as it, i (i)}
      <div class="item" data-item={i}>
        {#if str(it.ar)}<Ar text={str(it.ar)} tag="p" />{/if}
        <p><Bidi text={str(it.fr)} /></p>
        <div class="opts">
          {#each [true, false] as v, k (k)}
            <button
              type="button"
              class:good={picked[i] === k && it.vrai === v}
              class:bad={picked[i] === k && it.vrai !== v}
              onclick={() => (picked[i] = k)}
              data-v={k}><Bidi text={v ? t('rel.vrai') : t('rel.faux')} /></button
            >
          {/each}
        </div>
        {#if picked[i] !== undefined}
          <p class="fb" class:ok={(picked[i] === 0) === it.vrai} role="status">
            <Bidi text={verdict((picked[i] === 0) === it.vrai)} />
          </p>
          {#if (picked[i] === 0) === it.vrai && str(it.correction_ar)}<Ar
              text={str(it.correction_ar)}
              tag="p"
            />{/if}
        {/if}
      </div>
    {/each}
  {:else if type === 'classer'}
    {@const cols = arr(ex.colonnes) as Obj[]}
    {#each items as it, i (i)}
      <div class="item row" data-item={i}>
        {#if it.img}<Illus k={str(it.img)} cls="mini" />{/if}
        <span class="lbl"
          >{#if str(it.ar)}<Ar text={str(it.ar)} />
          {/if}<Bidi text={str(it.fr)} /></span
        >
        {#each cols as c, k (k)}
          <button
            type="button"
            class:good={picked[i] === k && it.col === k}
            class:bad={picked[i] === k && it.col !== k}
            onclick={() => (picked[i] = k)}
            data-k={k}><Bidi text={str(c.fr)} /></button
          >
        {/each}
      </div>
    {/each}
  {:else if type === 'trous'}
    <p class="texte" dir={str(ex.texte_ar) ? 'rtl' : 'ltr'}>
      {#each trous as seg, i (i)}<Bidi text={seg} />{#if i < trous.length - 1}<select
            bind:value={blanks[`t${i}`]}
            class:good={checkedBlanks && blanks[`t${i}`] === String(arr(ex.reponses)[i])}
            class:bad={checkedBlanks && blanks[`t${i}`] !== String(arr(ex.reponses)[i])}
            aria-label={t('rel.trou', { n: i + 1 })}
            data-trou={i}
            ><option value=""></option>{#each bank as b (b)}<option value={b}>{b}</option
              >{/each}</select
          >{/if}{/each}
    </p>
    <button type="button" onclick={() => (checkedBlanks = true)} data-testid="verifier-trous"
      >{t('rel.verifier')}</button
    >
  {:else if type === 'tableau'}
    {@const cols = arr(ex.colonnes) as Obj[]}
    <div class="tw">
      <table>
        <thead
          ><tr
            >{#each cols as c, k (k)}<th><Bidi text={str(c.fr)} /></th>{/each}</tr
          ></thead
        >
        <tbody>
          {#each arr(ex.lignes) as row, r (r)}
            <tr>
              {#each arr(row) as cell, c (c)}
                {@const h = cellHole(r, c)}
                <td>
                  {#if h >= 0}
                    <select
                      bind:value={blanks[`c${h}`]}
                      class:good={checkedBlanks && blanks[`c${h}`] === String(arr(ex.reponses)[h])}
                      class:bad={checkedBlanks && blanks[`c${h}`] !== String(arr(ex.reponses)[h])}
                      aria-label={t('rel.trou', { n: h + 1 })}
                      ><option value=""></option>{#each bank as b (b)}<option value={b}>{b}</option
                        >{/each}</select
                    >
                  {:else if cell && typeof cell === 'object'}
                    {#if str((cell as Obj).ar)}<Ar text={str((cell as Obj).ar)} />{/if}
                    <Bidi text={str((cell as Obj).fr)} />
                  {:else}<Bidi text={String(cell ?? '')} />{/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if arr(ex.trous).length}<button type="button" onclick={() => (checkedBlanks = true)}
        >{t('rel.verifier')}</button
      >{/if}
  {:else if type === 'relier'}
    {#each items as it, i (i)}
      <div class="item row" data-item={i}>
        <span class="lbl"
          >{#if str(it.ar)}<Ar text={str(it.ar)} />{/if}{#if it.img}<Illus
              k={str(it.img)}
              cls="mini"
            />{/if}</span
        >
        <select bind:value={blanks[`r${i}`]} aria-label={t('rel.relier_avec')} data-relier={i}>
          <option value=""></option>
          {#each relierRight as f (f)}<option value={f}>{f}</option>{/each}
        </select>
        {#if blanks[`r${i}`]}<span class="fb" class:ok={blanks[`r${i}`] === str(it.fr)}
            ><Bidi text={verdict(blanks[`r${i}`] === str(it.fr))} /></span
          >{/if}
      </div>
    {/each}
  {:else if type === 'etapes' || type === 'frise'}
    <p class="muted small">{t('rel.ordre_consigne')}</p>
    <div class="opts col">
      {#each orderPool as i (i)}
        {@const it = items[i]!}
        <button
          type="button"
          disabled={order.includes(i)}
          onclick={() => pickOrder(i)}
          data-ordre={i}
          >{#if order.includes(i)}<b><Bidi text={order.indexOf(i) + 1} />.</b>
          {/if}{#if str(it.ar)}<Ar text={str(it.ar)} />{/if}
          <Bidi text={str(it.fr)} /></button
        >
      {/each}
    </div>
    {#if orderDone}
      <p class="fb" class:ok={orderOk(items as Array<{ rang?: number }>, order)} role="status">
        <Bidi text={verdict(orderOk(items as Array<{ rang?: number }>, order))} />
      </p>
    {/if}
    {#if order.length}<button type="button" onclick={() => (order = [])}
        >{t('rel.recommencer')}</button
      >{/if}
  {:else if type === 'qui_suis_je'}
    {#each items as it, i (i)}
      <div class="item" data-item={i}>
        <ul>
          {#each arr(it.indices_fr) as c, k (k)}<li><Bidi text={String(c)} /></li>{/each}
        </ul>
        <button type="button" onclick={() => (shown[i] = !shown[i])}>{t('rel.voir_reponse')}</button
        >
        {#if shown[i]}<p class="just">
            {#if str(it.reponse_ar)}<Ar text={str(it.reponse_ar)} /> —
            {/if}<Bidi text={str(it.reponse_fr)} />
          </p>{/if}
      </div>
    {/each}
  {:else if type === 'calcul'}
    {#each items as it, i (i)}
      <div class="item" data-item={i}>
        <p class="q"><Bidi text={str(it.enonce_fr)} /></p>
        {#if str(it.donnees_fr)}<p class="muted small"><Bidi text={str(it.donnees_fr)} /></p>{/if}
        <div class="row">
          <input
            inputmode="decimal"
            bind:value={text[i]}
            aria-label={t('rel.ma_reponse')}
            data-calcul={i}
          />
          <span><Bidi text={str(it.unite)} /></span>
          <button type="button" onclick={() => (shown[i] = true)}>{t('rel.verifier')}</button>
        </div>
        {#if shown[i]}
          <p
            class="fb"
            class:ok={calculOk(it as { reponse: unknown }, text[i] ?? '')}
            role="status"
          >
            <Bidi text={verdict(calculOk(it as { reponse: unknown }, text[i] ?? ''))} />
          </p>
          {#each arr(it.etapes_fr) as e, k (k)}<p class="just"><Bidi text={String(e)} /></p>{/each}
        {/if}
      </div>
    {/each}
  {:else if type === 'question'}
    {#each items as it, i (i)}
      <div class="item" data-item={i}>
        <p class="q"><Bidi text={str(it.q_fr)} /></p>
        <textarea
          rows={Number(it.lignes ?? 3)}
          bind:value={text[i]}
          aria-label={t('rel.ma_reponse')}></textarea>
        {#if profile && exerciseId}
          <FreeAnswerSend {profile} {exerciseId} itemIndex={i} text={text[i] ?? ''} />
        {/if}
        {#if str(it.reponse_fr)}
          <button type="button" onclick={() => (shown[i] = !shown[i])}
            >{t('rel.reponse_possible')}</button
          >
          {#if shown[i]}<p class="just"><Bidi text={str(it.reponse_fr)} /></p>{/if}
        {/if}
      </div>
    {/each}
  {:else if type === 'ouverte'}
    {#each items as it, i (i)}
      <div class="item" data-item={i}>
        {#if str(it.ar)}<Ar text={str(it.ar)} tag="p" />{/if}
        <p class="muted small"><Bidi text={str(it.fr)} /></p>
        {#if profile && exerciseId}
          <textarea rows="3" bind:value={text[i]} aria-label={t('rel.ma_reponse')}></textarea>
          <FreeAnswerSend {profile} {exerciseId} itemIndex={i} text={text[i] ?? ''} />
        {/if}
        <button type="button" onclick={() => (shown[i] = !shown[i])}
          >{t('rel.reponse_possible')}</button
        >
        {#if shown[i]}<p class="just">
            {#if str(it.reponse_ar)}<Ar text={str(it.reponse_ar)} />{/if}
            <Bidi text={str(it.reponse_fr)} />
          </p>{/if}
      </div>
    {/each}
  {:else if type === 'tracer'}
    <p class="links">
      {#each arr(ex.formules) as f, k (k)}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- chemin résolu, suivi d'un paramètre -->
        <a class="button" href={`${resolve('/ecriture')}?mot=${encodeURIComponent(String(f))}`}
          ><Ar text={String(f)} /></a
        >
      {/each}
    </p>
  {:else if type === 'memo'}
    <p>
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- chemin résolu, suivi d'un paramètre -->
      <a class="button" href={`${resolve('/coran/lecteur')}?s=${Number(ex.sourate)}`}
        >{t('rel.ouvrir_lecteur')}</a
      >
      {#each arr(ex.versets) as v, k (k)}<span class="chip"
          ><Bidi text={t('rel.seance', { n: k + 1, v: String(v) })} /></span
        >{/each}
    </p>
  {:else if type === 'carnet' && profile && exerciseId}
    <CarnetPratique {profile} {exerciseId} />
  {:else if type === 'carnet'}
    <ul class="carnet">
      {#each arr(ex.lignes) as l, k (k)}<li>
          {#if str((l as Obj).ar)}<Ar text={str((l as Obj).ar)} /> —
          {/if}<Bidi text={str((l as Obj).fr)} />
        </li>{/each}
    </ul>
    <p class="muted small">{t('rel.dans_cahier')}</p>
  {:else}
    {#if ex.img}<Illus k={str(ex.img)} cls="mini" />{/if}
    <p class="muted small">{t('rel.dans_cahier')}</p>
  {/if}
</section>

<style>
  .rex {
    border-top: 1px solid var(--line);
    padding-top: 10px;
    margin-top: 12px;
  }
  .rex h3 {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: baseline;
    margin: 0 0 4px;
  }
  .n {
    background: var(--teal);
    color: var(--on-primary);
    border-radius: 999px;
    padding: 0 8px;
    font-size: 0.85rem;
  }
  .consigne {
    font-style: italic;
  }
  .item {
    margin: 8px 0;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .opts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .opts.col {
    flex-direction: column;
    align-items: stretch;
  }
  button.good,
  select.good {
    border-color: var(--ok-ink);
    background: var(--ok-bg);
  }
  button.bad,
  select.bad {
    border-color: var(--bad-ink);
    background: var(--bad-bg);
  }
  .fb {
    font-weight: 700;
    color: var(--warn-ink);
  }
  .fb.ok {
    color: var(--ok-ink);
  }
  .just {
    background: var(--sand);
    border-radius: 8px;
    padding: 6px 8px;
  }
  .src {
    font-size: 0.85rem;
    color: var(--ink2);
  }
  .situation {
    background: var(--warn-bg);
    border-radius: 8px;
    padding: 6px 8px;
  }
  select,
  input,
  textarea {
    font: inherit;
    border: 2px solid var(--line);
    border-radius: 8px;
    padding: 4px 6px;
  }
  textarea {
    width: 100%;
  }
  .tw {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
  }
  th,
  td {
    border: 1px solid var(--line);
    padding: 4px 6px;
    text-align: start;
  }
  .lbl {
    min-width: 8em;
  }
  .chip {
    display: inline-block;
    margin: 0 4px;
    padding: 1px 8px;
    border-radius: 99px;
    background: var(--ok-bg);
    font-size: 0.85rem;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  :global(.rex .mini) {
    width: 56px;
    height: 56px;
  }
  .small {
    font-size: 0.9rem;
  }
</style>
