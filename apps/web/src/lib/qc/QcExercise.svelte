<script lang="ts">
  import { t } from '$lib/i18n';
  import { orderOk, shuffle } from '$lib/religion/check';
  import QcText from './QcText.svelte';
  import { chasseTargets, choiceOk, ordreOk, qcWords, repererExpected, sameSet } from './check';

  /**
   * Un exercice d'un livret « Lecture du Coran » (lot 28). Entraînement : corrigé sur l'appareil avec le
   * corrigé du livret (comme le guide papier), jamais de note. Bilan / examen (`evaluation`) : aucun corrigé
   * reçu (D7) — l'élève s'exerce, l'adulte ou l'enseignant corrige avec le guide.
   */
  type Obj = Record<string, unknown>;
  let {
    ex,
    n,
    lettres = [],
    evaluation = false,
  }: {
    ex: Obj;
    n: number;
    lettres?: ReadonlyArray<{ l: string }>;
    evaluation?: boolean;
  } = $props();

  const type = $derived(String(ex.type));
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const arr = (v: unknown) => (Array.isArray(v) ? (v as Obj[]) : []);
  const strs = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map((x) => String(x)) : []);
  const items = $derived(arr(ex.items));
  const isQuran = (it: Obj) => str(it.src).startsWith('Q:');

  /** options d'un exercice à choix : { valeur, libellé arabe, libellé français } */
  const options = $derived.by(() => {
    if (type === 'paire')
      return arr(ex.sons).map((s, i) => ({
        v: i as number | string,
        ar: str(s.ar),
        fr: str(s.fr),
      }));
    if (type === 'regle')
      return arr(ex.regles).map((r) => ({
        v: str(r.c) as number | string,
        ar: str(r.ar),
        fr: str(r.fr),
      }));
    if (type === 'duree' || type === 'arret') {
      const o = Array.isArray(ex.options)
        ? (ex.options as unknown[]).map((x) =>
            x && typeof x === 'object'
              ? { v: str((x as Obj).v) as number | string, ar: '', fr: str((x as Obj).fr) }
              : { v: String(x) as number | string, ar: '', fr: String(x) },
          )
        : (type === 'duree' ? ['2', '4-5', '6'] : ['arret', 'suite', 'choix']).map((v) => ({
            v: v as number | string,
            ar: '',
            fr: v,
          }));
      return o;
    }
    return [];
  });

  // réponses de l'élève
  let picked: Record<string, number | string | boolean> = $state({});
  let touched: Record<string, boolean> = $state({});
  let checkedItems: Record<number, boolean> = $state({});
  let sequences: Record<number, number[]> = $state({});
  let relierLeft: number | null = $state(null);
  let relierPairs: Record<number, number> = $state({});

  const verdict = (ok: boolean) => (ok ? t('rel.juste') : t('rel.essaie'));
  const relierRight = $derived(
    shuffle(
      items.map((_, i) => i),
      items.length + 5,
    ),
  );
  const etapesPool = $derived(
    shuffle(
      items.map((_, i) => i),
      items.length + 3,
    ),
  );
  const chasseGoal = $derived(chasseTargets(strs(ex.grille), str(ex.cible)));
  const chasseFound = $derived(chasseGoal.filter((i) => touched[`c${i}`]).length);
  const arretWords = $derived(qcWords(str(ex.ar)));

  function seqAdd(i: number, k: number) {
    const s = sequences[i] ?? [];
    if (!s.includes(k)) sequences[i] = [...s, k];
  }
</script>

<section
  class="qex"
  data-type={type}
  data-exercise={str(ex.id) || String(n)}
  data-testid="qc-exercice"
>
  <h3>
    <span class="n">{n}</span>
    {#if str(ex.titre_ar)}<QcText text={str(ex.titre_ar)} {lettres} />{/if}
    <span>{str(ex.titre_fr)}</span>
  </h3>
  {#if str(ex.consigne_fr)}<p class="consigne">{str(ex.consigne_fr)}</p>{/if}
  {#if evaluation}<p class="muted small" data-testid="qc-correction-adulte">
      {t('qc.correction_adulte')}
    </p>{/if}

  {#if type === 'chasse'}
    <div class="grille" dir="rtl">
      {#each strs(ex.grille) as g, i (i)}
        {@const on = !!touched[`c${i}`]}
        <button
          type="button"
          class="cell"
          class:ok={on && !evaluation && chasseGoal.includes(i)}
          class:ko={on && !evaluation && !chasseGoal.includes(i)}
          class:on={on && evaluation}
          aria-pressed={on}
          data-testid="qc-case"
          onclick={() => (touched[`c${i}`] = !on)}><QcText text={g} {lettres} /></button
        >
      {/each}
    </div>
    {#if !evaluation}<p class="score" data-testid="qc-score">
        {t('qc.trouve', { n: chasseFound, total: chasseGoal.length })}
      </p>{/if}
  {:else if type === 'contient'}
    <div class="mots">
      {#each arr(ex.mots) as m, i (i)}
        {@const on = !!touched[`m${i}`]}
        <button
          type="button"
          class="mot"
          class:ok={on && !evaluation && m.oui === true}
          class:ko={on && !evaluation && m.oui !== true}
          class:on={on && evaluation}
          aria-pressed={on}
          data-testid="qc-mot"
          onclick={() => (touched[`m${i}`] = !on)}><QcText text={str(m.ar)} {lettres} /></button
        >
      {/each}
    </div>
  {:else if type === 'arret'}
    <p class="extrait"><QcText text={str(ex.ar)} quran {lettres} /></p>
    {#if str(ex.ref_fr)}<p class="ref">{str(ex.ref_fr)}</p>{/if}
    <ol class="items">
      {#each arr(ex.emplacements) as p, i (i)}
        <li>
          <span>{t('qc.apres_mot', { n: Number(p.apres) })}</span>
          <QcText text={arretWords[Number(p.apres) - 1] ?? ''} quran />
          <span class="choix">
            {#each options as o (o.v)}
              <button
                type="button"
                class:sel={picked[`a${i}`] === o.v}
                data-testid="qc-choix"
                onclick={() => (picked[`a${i}`] = o.v)}>{o.fr}</button
              >
            {/each}
          </span>
          {#if picked[`a${i}`] !== undefined && !evaluation}
            {@const ok = choiceOk(p, picked[`a${i}`] as string)}
            <span class="verdict" class:ok class:ko={!ok} data-testid="qc-verdict"
              >{verdict(ok)}</span
            >
            {#if ok && str(p.fr)}<span class="expl">{str(p.fr)}</span>{/if}
          {/if}
        </li>
      {/each}
    </ol>
  {:else if type === 'relier' && !Array.isArray(ex.gauche)}
    <div class="relier">
      <ul>
        {#each items as it, i (i)}
          <li>
            <button
              type="button"
              class:sel={relierLeft === i}
              class:ok={relierPairs[i] === i}
              data-testid="qc-relier-g"
              onclick={() => (relierLeft = i)}
              ><QcText text={str(it.ar)} quran={isQuran(it)} {lettres} /></button
            >
          </li>
        {/each}
      </ul>
      <ul>
        {#each relierRight as r (r)}
          {@const done = Object.values(relierPairs).includes(r)}
          <li>
            <button
              type="button"
              class:ok={done}
              data-testid="qc-relier-d"
              onclick={() => {
                if (relierLeft === null) return;
                if (relierLeft === r) relierPairs[r] = r;
                else picked.relierKo = r;
                relierLeft = null;
              }}>{str(items[r]?.fr)}</button
            >
          </li>
        {/each}
      </ul>
    </div>
    {#if Object.keys(relierPairs).length > 0 || picked.relierKo !== undefined}
      {@const ok = Object.keys(relierPairs).length === items.length}
      <p class="verdict" class:ok data-testid="qc-verdict">
        {ok
          ? verdict(true)
          : t('qc.trouve', { n: Object.keys(relierPairs).length, total: items.length })}
      </p>
    {/if}
  {:else if type === 'relier'}
    <!-- épreuve : deux colonnes décalées, sans corrigé -->
    <div class="relier">
      <ul>
        {#each arr(ex.gauche) as g, i (i)}<li>
            <QcText text={str(g.ar)} quran={str(g.src).startsWith('Q:')} {lettres} />
          </li>{/each}
      </ul>
      <ul>
        {#each arr(ex.droite) as d, i (i)}<li>{str(d.fr)}</li>{/each}
      </ul>
    </div>
  {:else if type === 'chrono'}
    <p class="muted">{t('qc.chrono')}</p>
    <ol class="items">
      {#each Array.from({ length: Number(ex.essais ?? 3) }, (_, i) => i) as i (i)}<li>
          {t('qc.essai', { n: i + 1 })}
        </li>{/each}
    </ol>
  {:else if type === 'lecture_notee'}
    {#if str(ex.passage_fr)}<p><strong>{str(ex.passage_fr)}</strong></p>{/if}
    <p class="muted">{t('qc.lecture_notee')}</p>
  {:else if type === 'etapes'}
    {@const seq = sequences[0] ?? []}
    <div class="pool">
      {#each etapesPool as k (k)}
        <button
          type="button"
          disabled={seq.includes(k)}
          data-testid="qc-etape"
          onclick={() => seqAdd(0, k)}
          >{#if str(items[k]?.ar)}<QcText text={str(items[k]?.ar)} />{/if}
          {str(items[k]?.fr)}</button
        >
      {/each}
    </div>
    <ol class="seq">
      {#each seq as k (k)}<li>{str(items[k]?.fr)}</li>{/each}
    </ol>
    {#if seq.length === items.length && items.length > 0}
      {@const ok = orderOk(items as Array<{ rang?: number }>, seq)}
      <p class="verdict" class:ok class:ko={!ok} data-testid="qc-verdict">{verdict(ok)}</p>
      {#if !ok}<button type="button" onclick={() => (sequences[0] = [])}
          >{t('qc.recommencer')}</button
        >{/if}
    {/if}
  {:else}
    <ol class="items">
      {#each items as it, i (i)}
        <li data-testid="qc-item">
          {#if type === 'paire'}
            <span class="dit">
              {t('qc.adulte_lit')}
              {#if str(it.dit)}
                {#if picked[`v${i}`]}<QcText text={str(it.dit)} {lettres} />{/if}
                <button type="button" onclick={() => (picked[`v${i}`] = !picked[`v${i}`])}
                  >{picked[`v${i}`] ? t('qc.cacher') : t('qc.montrer')}</button
                >
              {/if}
            </span>
          {:else if type === 'qcm'}
            <span>{str(it.q_fr)}</span>
          {:else if type === 'complete'}
            <span class="frise" dir="rtl"
              ><QcText text={str(it.avant)} /> <span class="trou">…</span>
              <QcText text={str(it.apres)} /></span
            >
          {:else if type === 'ordre'}
            {#if str(it.fr)}<span>{str(it.fr)}</span>{/if}
          {:else if str(it.ar)}
            <span class="extrait"><QcText text={str(it.ar)} quran={isQuran(it)} {lettres} /></span>
            {#if str(it.ref_fr)}<span class="ref">{str(it.ref_fr)}</span>{/if}
          {/if}

          {#if type === 'paire' || type === 'regle' || type === 'duree'}
            <span class="choix">
              {#each options as o (o.v)}
                <button
                  type="button"
                  class:sel={picked[i] === o.v}
                  data-testid="qc-choix"
                  onclick={() => (picked[i] = o.v)}
                  >{#if o.ar}<QcText text={o.ar} {lettres} />{/if}
                  {o.fr}</button
                >
              {/each}
            </span>
          {:else if type === 'qcm' || type === 'complete'}
            <span class="choix">
              {#each strs(it.options) as o, k (k)}
                <button
                  type="button"
                  class:sel={picked[i] === (type === 'qcm' ? k : o)}
                  data-testid="qc-choix"
                  onclick={() => (picked[i] = type === 'qcm' ? k : o)}
                  ><QcText text={o} {lettres} /></button
                >
              {/each}
            </span>
          {:else if type === 'vrai_faux'}
            <span class="enonce">{str(it.fr)}</span>
            <span class="choix">
              <button
                type="button"
                class:sel={picked[i] === true}
                data-testid="qc-vrai"
                onclick={() => (picked[i] = true)}>{t('qc.vrai')}</button
              >
              <button
                type="button"
                class:sel={picked[i] === false}
                data-testid="qc-faux"
                onclick={() => (picked[i] = false)}>{t('qc.faux')}</button
              >
            </span>
          {:else if type === 'classer'}
            <span class="choix">
              {#each arr(ex.colonnes) as c, k (k)}
                <button
                  type="button"
                  class:sel={picked[i] === k}
                  data-testid="qc-choix"
                  onclick={() => (picked[i] = k)}
                  >{#if str(c.ar)}<QcText text={str(c.ar)} />{/if}
                  {str(c.fr)}</button
                >
              {/each}
            </span>
          {:else if type === 'reperer'}
            <span class="mots" dir="rtl">
              {#each qcWords(str(it.ar)) as w, k (k)}
                <button
                  type="button"
                  class="mot"
                  class:on={!!touched[`${i}.${k}`]}
                  aria-pressed={!!touched[`${i}.${k}`]}
                  data-testid="qc-mot"
                  onclick={() => {
                    touched[`${i}.${k}`] = !touched[`${i}.${k}`];
                    checkedItems[i] = false;
                  }}><QcText text={w} quran={isQuran(it)} /></button
                >
              {/each}
            </span>
            {#if !evaluation}<button
                type="button"
                data-testid="qc-verifier"
                onclick={() => (checkedItems[i] = true)}>{t('qc.verifier')}</button
              >{/if}
          {:else if type === 'ordre'}
            {@const seq = sequences[i] ?? []}
            <span class="mots" dir="rtl">
              {#each strs(it.mots) as m, k (k)}
                <button
                  type="button"
                  class="mot"
                  disabled={seq.includes(k)}
                  data-testid="qc-syllabe"
                  onclick={() => seqAdd(i, k)}><QcText text={m} /></button
                >
              {/each}
            </span>
            <span class="assemble" dir="rtl"
              ><QcText text={seq.map((k) => strs(it.mots)[k]).join('')} /></span
            >
            {#if seq.length}<button type="button" onclick={() => (sequences[i] = [])}
                >{t('qc.recommencer')}</button
              >{/if}
          {/if}

          {#if !evaluation}
            {#if type === 'reperer' && checkedItems[i]}
              {@const touchedK = Object.keys(touched)
                .filter((x) => x.startsWith(`${i}.`) && touched[x])
                .map((x) => Number(x.split('.')[1]))}
              {@const ok = sameSet(touchedK, repererExpected(it as { ar?: string }, str(ex.cible)))}
              <span class="verdict" class:ok class:ko={!ok} data-testid="qc-verdict"
                >{verdict(ok)}</span
              >
            {:else if type === 'ordre' && (sequences[i]?.length ?? 0) === strs(it.mots).length && strs(it.mots).length}
              {@const ok = ordreOk(it as { mots?: string[]; phrase?: string }, sequences[i] ?? [])}
              <span class="verdict" class:ok class:ko={!ok} data-testid="qc-verdict"
                >{verdict(ok)}</span
              >
            {:else if picked[i] !== undefined && type !== 'reperer' && type !== 'ordre'}
              {@const ok =
                type === 'vrai_faux'
                  ? it.vrai === picked[i]
                  : type === 'classer'
                    ? it.col === picked[i]
                    : choiceOk(it, picked[i] as number | string)}
              <span class="verdict" class:ok class:ko={!ok} data-testid="qc-verdict"
                >{verdict(ok)}</span
              >
              {#if ok && str(it.fr) && type !== 'vrai_faux'}<span class="expl">{str(it.fr)}</span
                >{/if}
            {/if}
          {/if}
        </li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  .qex {
    border-top: 1px solid var(--line);
    padding-top: 10px;
  }
  h3 {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: baseline;
    margin: 0 0 6px;
  }
  .n {
    font-weight: 800;
    color: var(--accent);
  }
  .consigne {
    font-style: italic;
    margin: 0 0 8px;
  }
  .items {
    display: grid;
    gap: 10px;
    padding-inline-start: 1.4em;
  }
  .items li {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
    align-items: center;
  }
  .choix,
  .mots,
  .pool {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .grille {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
    gap: 6px;
  }
  button {
    min-height: 44px;
    min-width: 44px;
  }
  .sel,
  .on {
    outline: 3px solid var(--accent);
  }
  .ok {
    border-color: var(--ok-ink);
    color: var(--ok-ink);
  }
  .ko {
    border-color: var(--bad-ink);
    color: var(--bad-ink);
  }
  .verdict {
    font-weight: 700;
  }
  .ref,
  .expl {
    color: var(--ink2);
    font-size: 0.9rem;
  }
  .relier {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .relier ul {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .trou {
    font-weight: 800;
  }
  .small {
    font-size: 0.9rem;
  }
</style>
