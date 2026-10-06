<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { verseRef } from '@awform/content/adab';
  import Ar from '$lib/Ar.svelte';
  import { t } from '$lib/i18n';
  import VersetBloc from '$lib/quran/VersetBloc.svelte';

  /**
   * A37 — chapitre du guide des parents (AW.texteChapitre des livres, ici `gp.c18` « Transmettre les valeurs »),
   * lu tel quel : paragraphes, intertitres, listes, tableaux, encadrés, hadiths (arabe sur sa ligne, traduction et
   * référence dessous), versets en bloc (texte des livres = Tanzil, récitant humain seulement), réponse mālikite,
   * blocs propres à un pays (celui de la famille seulement). Mise en forme `**gras**`, index `[[…]]` et renvois
   * `{{ref:…}}` retirés (texte brut).
   */
  type Obj = Record<string, unknown>;
  let { chapitre, pays = null }: { chapitre: Obj; pays?: string | null } = $props();
  const plain = (s: string) =>
    s
      .replace(/\{\{ref:[^}]*\}\}/g, '')
      .replace(/\[\[([^\]|]*)(\|[^\]]*)?\]\]/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1');
  const paras = (x: unknown): string[] =>
    (Array.isArray(x) ? x : [x]).filter((y): y is string => typeof y === 'string').map(plain);
  const items = (x: unknown): string[] =>
    (Array.isArray(x) ? x : []).flatMap((y) =>
      typeof y === 'string' ? [plain(y)] : y && typeof y === 'object' ? paras((y as Obj).fr) : [],
    );
  const blocs = (x: unknown) => (Array.isArray(x) ? (x as Obj[]) : []);
  const str = (x: unknown) => (typeof x === 'string' ? x : '');
  const shown = (b: Obj) =>
    !Array.isArray(b.pays) || (!!pays && (b.pays as unknown[]).includes(pays));
  const verse = (b: Obj) => {
    const r = verseRef(str(b.src));
    return r ? { i: 0, j: str(b.ar).length, ...r, ref: str(b.ref_fr) || str(b.src) } : null;
  };
</script>

{#snippet bloc(b: Obj)}
  {#if !shown(b)}<!-- bloc propre à un autre pays -->
  {:else if b.t === 'p' || b.t === 'pays'}
    {#each paras(b.fr) as p, i (i)}<p><Bidi text={p} /></p>{/each}
    {#each blocs(b.blocs) as x, i (i)}{@render bloc(x)}{/each}
  {:else if b.t === 'h'}
    <h4><Bidi text={plain(str(b.fr) || str(b.titre_fr))} /></h4>
  {:else if b.t === 'liste'}
    <ul>
      {#each items(b.items) as it, i (i)}<li><Bidi text={it} /></li>{/each}
    </ul>
  {:else if b.t === 'tableau'}
    <div class="table-wrap">
      <table aria-label={plain(str(b.titre_fr)) || str(chapitre.titre_fr)}>
        {#if str(b.titre_fr)}<caption><Bidi text={plain(str(b.titre_fr))} /></caption>{/if}
        <thead
          ><tr
            >{#each paras(b.colonnes) as c, i (i)}<th><Bidi text={c} /></th>{/each}</tr
          ></thead
        >
        <tbody>
          {#each Array.isArray(b.lignes) ? (b.lignes as unknown[]) : [] as l, i (i)}<tr>
              {#each paras(l) as c, j (j)}<td><Bidi text={c} /></td>{/each}
            </tr>{/each}
        </tbody>
      </table>
    </div>
  {:else if b.t === 'encadre'}
    <aside class="warnbox enc" data-genre={str(b.genre)}>
      {#if str(b.titre_fr)}<strong><Bidi text={plain(str(b.titre_fr))} /></strong>{/if}
      {#each paras(b.fr) as p, i (i)}<p><Bidi text={p} /></p>{/each}
      {#if Array.isArray(b.items)}<ul>
          {#each items(b.items) as it, i (i)}<li><Bidi text={it} /></li>{/each}
        </ul>{/if}
      {#each blocs(b.blocs) as x, i (i)}{@render bloc(x)}{/each}
    </aside>
  {:else if b.t === 'verset' && str(b.ar)}
    {@const m = verse(b)}
    {#if m}<VersetBloc ar={str(b.ar)} {m} fr={str(b.fr)} />{/if}
  {:else if b.t === 'hadith' && str(b.ar)}
    <figure class="had">
      <Ar text={str(b.ar)} block />
      {#if str(b.fr)}<p><Bidi text={str(b.fr)} /></p>{/if}
      {#if str(b.ref_fr)}<small class="muted"><Bidi text={str(b.ref_fr)} /></small>{/if}
    </figure>
  {:else if b.t === 'malikite' || b.t === 'faq'}
    <details class="mal">
      <summary><Bidi text={plain(str(b.question_fr))} /></summary>
      {#each paras(b.reponse_fr) as p, i (i)}<p><Bidi text={p} /></p>{/each}
      {#if str(b.divergence_fr)}<p class="muted">
          <Bidi text={plain(str(b.divergence_fr))} />
        </p>{/if}
    </details>
  {/if}
{/snippet}

<article class="card" data-testid="vi-guide" data-guide={str(chapitre.id)}>
  <h2><Bidi text={str(chapitre.titre_fr)} /></h2>
  {#if str(chapitre.titre_ar)}<Ar text={str(chapitre.titre_ar)} block />{/if}
  {#if paras(chapitre.en_bref).length}
    <aside class="card ok">
      <strong>{t('vi.en_bref')}</strong>
      <ul>
        {#each paras(chapitre.en_bref) as p, i (i)}<li><Bidi text={p} /></li>{/each}
      </ul>
    </aside>
  {/if}
  {#each blocs(chapitre.sections) as s, i (i)}
    {#if shown(s)}
      <!-- une section à la fois (écran du parent) : titres d'abord, le texte en ouvrant -->
      <details class="sec" data-section={str(s.id)}>
        <summary><Bidi text={plain(str(s.titre_fr))} /></summary>
        {#each blocs(s.blocs) as b, j (j)}{@render bloc(b)}{/each}
      </details>
    {/if}
  {/each}
</article>

<style>
  .enc {
    margin: var(--space-s) 0;
  }
  .had {
    margin: var(--space-s) 0;
  }
  .had p {
    margin: 4px 0;
  }
  .mal {
    margin: var(--space-s) 0;
  }
  .sec {
    border-top: 1px solid var(--line);
    padding: var(--space-s) 0;
  }
  .sec summary {
    min-height: 44px;
    font-weight: 800;
    color: var(--navy);
  }
  caption {
    text-align: start;
    font-weight: 700;
  }
</style>
