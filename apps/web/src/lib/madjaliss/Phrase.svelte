<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { segments, type NotesEnseignant, type Phrase } from './donnees';

  /**
   * Une phrase du texte : l'arabe vocalisé SUR SA LIGNE, la traduction dessous. Les mots du Coran cités par
   * l'auteur sont affichés tels que Tanzil les donne (police du Coran, entre ﴿﴾, jamais modifiés). Un passage
   * réservé à l'explication de l'enseignant (T7) n'est jamais affiché : seulement la mention « bientôt ».
   * Mode enseignant : vocalisations « à vérifier » et variantes des témoins, sous la phrase.
   */
  let { p, note = null }: { p: Phrase; note?: NotesEnseignant['phrases'][number] | null } =
    $props();
  const titre = $derived(p.t === 'titre');
</script>

<article class="phrase" class:titre data-phrase={p.id} data-statut={p.statut}>
  {#if p.explication}
    <p class="reserve" data-testid="explication-bientot">
      <Icon name="info" size={20} /><Bidi text={t('mj.explication_bientot')} />
    </p>
  {:else}
    <p class="ar matn" lang="ar" dir="rtl">
      {#each segments(p) as s, i (i)}{#if typeof s === 'string'}<Bidi
            text={s}
            base="ar"
          />{:else}<span class="coran"
            ><span class="orn" aria-hidden="true">﴿</span><span
              class="quran-text"
              data-coran={s.ref}>{s.q}</span
            ><span class="orn" aria-hidden="true">﴾</span></span
          >{/if}{/each}
    </p>
    {#if p.fr}<p class="fr"><Bidi text={p.fr} /></p>{/if}
    {#if p.sens}
      <div class="sens" data-sens={p.sens.ref}>
        <small class="muted"
          ><Bidi
            text={t('mj.sens_verset', { ref: p.sens.ref, source: t(`mp.trad_${p.sens.source}`) })}
          /></small
        >
        <p><Bidi text={p.sens.texte} /></p>
      </div>
    {/if}
  {/if}
  {#if note}
    <div class="ens" data-testid="note-enseignant">
      {#each note.a_verifier as a, i (i)}<p>
          <strong><Bidi text={t('mj.ens_a_verifier')} /></strong>
          <Bidi text={a} />
        </p>{/each}
      {#each note.variantes as v, i (i)}<p>
          <strong><Bidi text={t('mj.ens_variante', { id: v.id ?? '' })} /></strong>
          {#each Object.entries(v).filter(([k]) => k !== 'id' && k !== 'phrase') as [k, x] (k)}<span
              class="var"><Bidi text={`${k} : ${x}`} /></span
            >{/each}
        </p>{/each}
    </div>
  {/if}
</article>

<style>
  .phrase {
    display: grid;
    gap: 4px;
    padding: var(--space-s) 0;
    border-bottom: 1px solid var(--line);
  }
  .phrase:last-child {
    border-bottom: 0;
  }
  .matn {
    margin: 0;
    display: block;
    text-align: right;
    line-height: 2.1;
  }
  .titre .matn {
    font-family: var(--font-ar-titre);
    font-weight: 700;
    text-align: center;
  }
  .titre .fr {
    text-align: center;
    font-weight: 700;
  }
  .coran .quran-text {
    font-size: calc(var(--ar-size) + 2px);
  }
  .orn {
    font-family: var(--font-quran);
    color: var(--gold-ink, var(--ink2));
    padding: 0 2px;
  }
  .fr {
    margin: 0;
  }
  .sens {
    border-inline-start: 3px solid var(--gold);
    padding-inline-start: var(--space-s);
  }
  .sens p {
    margin: 2px 0 0;
  }
  .reserve {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    margin: 0;
    padding: var(--space-s) var(--space-m);
    border-radius: var(--radius-md);
    background: var(--warn-bg);
    color: var(--ink);
  }
  .ens {
    font-size: 0.9rem;
    border-radius: var(--radius-md);
    background: var(--surface);
    padding: var(--space-s);
  }
  .ens p {
    margin: 2px 0;
  }
  .var {
    display: block;
  }
</style>
