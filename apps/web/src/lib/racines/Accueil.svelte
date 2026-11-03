<script lang="ts">
  import { onMount } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { demoProfileFor } from '$lib/attempts';
  import { t } from '$lib/i18n';
  import { initialiser, etat } from '$lib/coran-mots/etat.svelte';
  import { chargerIndex, type Etat } from './donnees';
  import Famille from './Famille.svelte';
  import { visible, type EntreeIndex, type Index } from './logique';

  /**
   * « Familles de mots » : la liste des familles du niveau de l'élève et en dessous (l'élève de N3 voit les niveaux 1 à 3), puis la
   * famille choisie en 7 étapes (6 pour l'enfant). Le niveau et les mots connus viennent de « Mots du Coran » (`coran_mots`) ; sans
   * niveau connu, toutes les familles sont montrées et les mots plus avancés sont signalés quand même. `?f=N` ouvre une famille.
   */
  let idx = $state<Index | null>(null);
  let etatDonnees = $state<Etat | 'attente'>('attente');
  let profil = $state<string | null>(null);
  let choisie = $state<EntreeIndex | null>(null);
  let niveau = $state<number | null>(null);
  let kind = $state<string | null>(null);
  let connus = $state<ReadonlySet<number> | null>(null);

  async function charger() {
    etatDonnees = 'attente';
    const p = await demoProfileFor('').catch(() => null);
    profil = p?.id ?? null;
    kind = p?.kind ?? null;
    niveau = /^ad(\d+)/.exec(p?.levelCode ?? '')
      ? Number(/^ad(\d+)/.exec(p?.levelCode ?? '')![1])
      : null;
    const r = await chargerIndex(profil, kind === 'enfant');
    // niveau et mots connus (« Mots du Coran ») : sans attendre, la liste s'affiche d'abord
    void initialiser()
      .then((ok) => {
        if (ok) {
          niveau = etat.niveau ?? niveau;
          connus = etat.connus;
        }
      })
      .catch(() => undefined);
    idx = r.data;
    etatDonnees = r.etat;
    const demande = Number(new URLSearchParams(location.search).get('f'));
    if (idx && demande) choisie = idx.f.find((f) => f.i === demande) ?? null;
  }
  onMount(() => void charger());

  const enfant = $derived(idx?.p === 'enfant');
  const liste = $derived(idx ? idx.f.filter((f) => visible(f, niveau, enfant)) : []);
  const niveaux = $derived([...new Set(liste.map((f) => f.n))].sort((a, b) => a - b));
  const suivante = (id: number | undefined) =>
    id ? (liste.find((f) => f.i === id) ?? null) : null;
</script>

<section class="rc" data-testid="rc-accueil">
  {#if choisie && idx}
    <Famille
      entree={choisie}
      {idx}
      {profil}
      {niveau}
      {connus}
      {enfant}
      {suivante}
      onchoisir={(f) => (choisie = f)}
      onretour={() => (choisie = null)}
    />
  {:else}
    <h1 class="titre"><Bidi text={t('rc.titre')} /></h1>
    {#if etatDonnees === 'attente'}
      <p class="doux" aria-busy="true"><Bidi text={t('rc.chargement')} /></p>
    {:else if etatDonnees === 'ferme'}
      <p class="doux"><Bidi text={t('rc.ferme')} /></p>
    {:else if etatDonnees !== 'ok' || !idx}
      <p class="doux" role="status">
        <Bidi text={t(etatDonnees === 'hors_ligne' ? 'rc.hors_ligne' : 'rc.indisponible')} />
      </p>
      <button type="button" class="bouton" onclick={() => void charger()}>
        <Bidi text={t('rc.reessayer')} />
      </button>
    {:else}
      <p class="doux"><Bidi text={t('rc.intro')} /></p>
      {#if liste.length === 0}
        <p class="doux"><Bidi text={t('rc.vide')} /></p>
      {/if}
      {#each niveaux as n (n)}
        <h2 class="niv"><Bidi text={t('rc.niveau', { n })} /></h2>
        <ul class="liste" data-testid="rc-liste">
          {#each liste.filter((f) => f.n === n) as f (f.i)}
            <li>
              <button
                type="button"
                class="carte"
                onclick={() => (choisie = f)}
                data-testid="rc-famille"
                data-id={f.i}
              >
                <span class="ar" lang="ar" dir="rtl"><Bidi text={f.r} base="ar" /></span>
                <span class="mini"><Bidi text={f.a.s} /></span>
              </button>
            </li>
          {/each}
        </ul>
      {/each}
    {/if}
  {/if}
</section>

<style>
  .rc {
    --fond: #fbf7ee;
    --carte: #f2ebda;
    --vert: #0b6e4f;
    --vert-pf: rgb(8 76 56);
    --or: rgb(201 162 39);
    --texte: #1e2b25;
    --doux: #4a5a52;
    background: var(--fond);
    color: var(--texte);
    border-radius: 18px;
    padding: 16px;
    max-inline-size: 560px;
    margin-inline: auto;
  }
  .titre {
    font-size: 1.35rem;
    color: var(--vert-pf);
    margin: 0 0 8px;
  }
  .niv {
    font-size: 1rem;
    color: var(--vert-pf);
    margin: 16px 0 8px;
  }
  .doux {
    color: var(--doux);
    line-height: 1.45;
  }
  .liste {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .carte {
    inline-size: 100%;
    min-block-size: 80px;
    background: var(--vert-pf);
    border: 2px solid var(--or);
    border-radius: 14px;
    color: var(--fond);
    padding: 4px 8px 8px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .carte .ar {
    font-family: 'Noto Naskh Arabic', 'Amiri', serif;
    font-weight: 700;
    font-size: 30px;
    line-height: 1.6;
    color: var(--or);
  }
  .mini {
    font-size: 0.8rem;
    line-height: 1.25;
    color: #d8e6df;
  }
  .bouton {
    min-block-size: 44px;
    padding: 0 16px;
    border-radius: 14px;
    border: 0;
    background: var(--vert-pf);
    color: var(--fond);
    font-weight: 600;
    cursor: pointer;
  }
  button:focus-visible {
    outline: 3px solid var(--or);
    outline-offset: 2px;
  }
</style>
