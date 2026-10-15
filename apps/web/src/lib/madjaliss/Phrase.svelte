<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { jouerAudio } from './audio';
  import { avecArabe, segments, type NotesEnseignant, type Phrase } from './donnees';

  /**
   * Une phrase du texte : l'arabe vocalisé SUR SA LIGNE (un vers : ses deux hémistiches, chacun sur sa ligne), la
   * traduction dessous, puis les listes et exemples (chacun sur sa ligne), le sens du verset cité et les notes
   * d'explication. Les mots du Coran cités par l'auteur sont affichés tels que Tanzil les donne (police du Coran,
   * entre ﴿﴾, jamais modifiés). Un passage réservé à l'explication de l'enseignant (T7) n'est jamais affiché :
   * seulement la mention « bientôt ». Mode enseignant : vocalisations « à vérifier », variantes des témoins, choix de
   * traduction, sous la phrase.
   */
  let {
    p,
    statut = '',
    note = null,
    audio = null,
    traduction = true,
  }: {
    p: Phrase;
    statut?: string;
    note?: NotesEnseignant['phrases'][number] | null;
    /** lot 9 : audio de la phrase pour ce profil (`audioDe`), ou null : pas de bouton */
    audio?: string | null;
    /**
     * lot 10 : traduction des phrases arabes affichée (bouton « Voir / Cacher la traduction ») ; ne cache que la
     * traduction (phrase, lignes de liste et d'exemples, sens du verset), jamais les notes d'explication
     */
    traduction?: boolean;
  } = $props();
  const titre = $derived(p.t === 'titre' || p.t === 'vers_titre');
  const blocs = $derived([
    { nom: 'liste', lignes: p.liste ?? [] },
    { nom: 'exemples', lignes: p.exemples ?? [] },
  ]);
</script>

<article class="phrase" class:titre data-phrase={p.id} data-statut={statut}>
  {#if p.explication}
    <p class="reserve" data-testid="explication-bientot">
      <Icon name="info" size={20} /><Bidi text={t('mj.explication_bientot')} />
    </p>
  {:else if p.masque}
    <!-- vers dont la voyelle n'est pas confirmée : ni son arabe ni sa traduction ne sont dans les fichiers -->
    {#if p.titre}<p class="inter ar" lang="ar" dir="rtl" data-testid="mj-intertitre">
        <Bidi text={p.titre} base="ar" />
      </p>{/if}
    <p class="reserve" data-testid="vers-masque">
      <Icon name="info" size={20} /><Bidi text={t('mj.vers_masque')} />
    </p>
  {:else}
    {#if p.titre}<p class="inter ar" lang="ar" dir="rtl" data-testid="mj-intertitre">
        <Bidi text={p.titre} base="ar" />
      </p>{/if}
    <p class="ar matn" class:vers={!!p.h} lang="ar" dir="rtl">
      {#if p.h}<span class="hem"><Bidi text={p.h[0]} base="ar" /></span><span class="hem"
          ><Bidi text={p.h[1]} base="ar" /></span
        >{:else}{#each segments(p) as s, i (i)}{#if typeof s === 'string'}<Bidi
              text={s}
              base="ar"
            />{:else}<span class="coran"
              ><span class="orn" aria-hidden="true">﴿</span><span
                class="quran-text"
                data-coran={s.ref}>{s.q}</span
              ><span class="orn" aria-hidden="true">﴾</span></span
            >{/if}{/each}{/if}
    </p>
    {#if audio}
      <!-- lot 9 : voix de synthèse provisoire (fiqh des cycles 1 et 2 ; jamais le Coran) -->
      <p class="ecoute">
        <button
          type="button"
          class="ghost"
          data-testid="mj-ecouter-lire"
          data-audio={audio}
          onclick={() => void jouerAudio(audio).catch(() => false)}
          ><Icon name="oreille" size={18} /><Bidi text={t('audio.ecouter')} /></button
        >
      </p>
    {/if}
    {#if p.nc}
      <!-- lot 6 : vers dont la lecture n'est pas confirmée, montré au groupe « bêta fermée » et au personnel seulement -->
      <p class="reserve" data-testid="vers-nc">
        <Icon name="info" size={20} /><Bidi text={t('mj.non_confirme')} />
      </p>
    {/if}
    {#if p.fr && traduction}<p class="fr" data-testid="mj-fr">
        <Bidi text={avecArabe(p.fr, p.ma)} />
      </p>{/if}
    {#each p.q ?? [] as q, i (i)}<p
        class="cit coranique"
        lang="ar"
        dir="rtl"
        data-testid="mj-verset-hadith"
      >
        <span class="orn" aria-hidden="true">﴿</span><span class="quran-text" data-coran={q.ref}
          >{q.q}</span
        ><span class="orn" aria-hidden="true">﴾</span>
      </p>{/each}
    {#if p.hadith}
      <div class="hadith" data-testid="mj-hadith">
        {#if p.hadith.tk}
          <div class="tk" data-testid="mj-takhrij">
            {#if p.hadith.tk.ar}<p class="cit" lang="ar" dir="rtl">
                <Bidi text={p.hadith.tk.ar} base="ar" />
              </p>{/if}
            <p class="fr"><Bidi text={avecArabe(p.hadith.tk.fr.texte, p.hadith.tk.fr.ma)} /></p>
          </div>
        {/if}
        <p class="deg" data-testid="mj-degre">
          <strong><Bidi text={t('mj.hadith_degre')} /></strong>
          <Bidi text={avecArabe(p.hadith.deg.texte, p.hadith.deg.ma)} />
        </p>
        {#each p.hadith.v ?? [] as v, i (i)}
          <div class="version" data-testid="mj-version-recueil">
            <p class="version-titre"><Bidi text={`${t('mj.hadith_version')} ${v.r}`} /></p>
            <p class="cit" lang="ar" dir="rtl"><Bidi text={v.ar} base="ar" /></p>
            {#each v.d ?? [] as d, j (j)}<p class="diff">
                <Bidi text={avecArabe(d.texte, d.ma)} />
              </p>{/each}
          </div>
        {/each}
      </div>
    {/if}
    {#each blocs as b (b.nom)}
      {#if b.lignes.length}
        <div class="lignes" data-testid={`mj-${b.nom}`}>
          <p class="lignes-titre"><Bidi text={t(`mj.${b.nom}`)} /></p>
          <ul>
            {#each b.lignes as l, i (i)}<li>
                <span class="ar" lang="ar" dir="rtl"><Bidi text={l.ar} base="ar" /></span>
                {#if traduction}<span class="fr"><Bidi text={l.fr} /></span>{/if}
              </li>{/each}
          </ul>
        </div>
      {/if}
    {/each}
    {#each traduction ? (p.sens ?? []) : [] as s (s.ref)}
      <div class="sens" data-sens={s.ref}>
        <p class="sens-titre"><Bidi text={`${t('mj.sens_verset')} (${s.ref})`} /></p>
        <p class="sens-texte"><Bidi text={s.texte} /></p>
      </div>
    {/each}
    {#each p.notes ?? [] as n, k (k)}
      <div class="note" data-testid="note-explication" data-genre={n.k ?? 'explication'}>
        <p class="note-titre">
          <Bidi
            text={t(
              n.k === 'malikite'
                ? 'mj.note_malikite'
                : n.k === 'ecart'
                  ? 'mj.note_ecart'
                  : n.k === 'degre'
                    ? 'mj.hadith_degre'
                    : 'mj.note',
            )}
          />
        </p>
        <p class="note-texte"><Bidi text={avecArabe(n.texte, n.ma)} /></p>
        {#each n.q ?? [] as q, i (i)}<p class="cit coranique" lang="ar" dir="rtl">
            <span class="orn" aria-hidden="true">﴿</span><span class="quran-text" data-coran={q.ref}
              >{q.q}</span
            ><span class="orn" aria-hidden="true">﴾</span>
          </p>{/each}
        {#if n.sources?.length || n.ar?.length}
          <details class="note-sources">
            <summary><Bidi text={t('mj.note_sources')} /></summary>
            {#each n.sources ?? [] as s, i (i)}<p class="src"><Bidi text={s} /></p>{/each}
            {#each n.ar ?? [] as a, i (i)}<p class="cit" lang="ar" dir="rtl">
                <Bidi text={a} base="ar" />
              </p>{/each}
          </details>
        {/if}
      </div>
    {/each}
  {/if}
  {#if note}
    <div class="ens" data-testid="note-enseignant">
      {#each note.a_verifier as a, i (i)}<p>
          <strong><Bidi text={t('mj.ens_a_verifier')} /></strong>
          <Bidi text={a} />
        </p>{/each}
      {#each note.info ?? [] as a, i (i)}<p data-testid="note-info">
          <strong><Bidi text={t('mj.ens_info')} /></strong>
          <Bidi text={a} />
        </p>{/each}
      {#each note.variantes as v, i (i)}<p>
          <strong><Bidi text={t('mj.ens_variante', { id: v.id ?? '' })} /></strong>
          {#each Object.entries(v).filter(([k]) => k !== 'id' && k !== 'phrase') as [k, x] (k)}<span
              class="var"><Bidi text={`${k} : ${x}`} /></span
            >{/each}
        </p>{/each}
      {#if note.traduction}<p data-testid="note-traduction">
          <strong><Bidi text={t('mj.ens_traduction')} /></strong>
          <Bidi text={note.traduction} />
        </p>{/if}
      {#each note.notes_internes ?? [] as a, i (i)}<p><Bidi text={a} /></p>{/each}
      {#each note.ar ?? [] as a, i (i)}<p class="cit" lang="ar" dir="rtl">
          <Bidi text={a} base="ar" />
        </p>{/each}
    </div>
  {/if}
</article>

<style>
  .ecoute {
    margin: 0;
  }
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
  .hem {
    display: block;
  }
  .vers .hem + .hem {
    padding-inline-end: 2.5em;
  }
  .inter {
    margin: var(--space-s) 0 0;
    text-align: center;
    font-family: var(--font-ar-titre);
    font-weight: 700;
    line-height: 2;
    /* deux intertitres de suite (Lāmiyya) : l'un sous l'autre */
    white-space: pre-line;
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
  .lignes ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  .lignes li {
    display: grid;
    gap: 0;
  }
  .lignes li .ar {
    display: block;
    text-align: right;
    line-height: 1.9;
  }
  .lignes-titre {
    margin: 4px 0 2px;
    font-weight: 600;
    font-size: 0.88rem;
    color: var(--ink2);
  }
  .hadith {
    display: grid;
    gap: 6px;
    border-inline-start: 3px solid var(--line);
    padding-inline-start: var(--space-s);
    font-size: 0.9rem;
    color: var(--ink2);
  }
  .hadith p {
    margin: 0;
  }
  .version-titre {
    font-weight: 600;
  }
  .diff {
    font-size: 0.85rem;
  }
  .sens {
    border-inline-start: 3px solid var(--gold);
    padding-inline-start: var(--space-s);
  }
  .sens p {
    margin: 2px 0 0;
    font-size: 0.88rem;
    color: var(--ink2);
  }
  .sens-titre {
    font-weight: 600;
  }
  .note {
    border-inline-start: 3px solid var(--line);
    padding-inline-start: var(--space-s);
    font-size: 0.88rem;
    color: var(--ink2);
  }
  .note p {
    margin: 2px 0 0;
  }
  .note-titre {
    font-weight: 600;
  }
  .note-sources summary {
    cursor: pointer;
    margin-top: 4px;
  }
  .note-sources .src {
    font-size: 0.82rem;
  }
  .cit {
    display: block;
    text-align: right;
    line-height: 1.9;
    font-size: var(--ar-size);
  }
  .coranique .quran-text {
    font-size: calc(var(--ar-size) + 2px);
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
