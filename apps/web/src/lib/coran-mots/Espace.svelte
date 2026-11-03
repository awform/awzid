<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { demoProfileFor } from '$lib/attempts';
  import { fn } from '$lib/fonctions.svelte';
  import { fmtNumber, localeInfo, t } from '$lib/i18n';
  import { mesurerTout, pourcent, type Mesure } from './calcul';
  import { chargerFrequences } from './donnees';
  import { etat, initialiser } from './etat.svelte';
  import Recherche from './Recherche.svelte';

  /**
   * Espace « Mots du Coran » (tuile de l'accueil du Coran, 3/11/2026 ; interrupteur `coran_mots`) : regroupe
   *  - « Je reconnais X % des mots du Coran » : le Coran entier, calculé SUR L'APPAREIL comme la bande du lecteur (mêmes
   *    règles, mêmes leçons faites), à partir des formes de mots regroupées ; rien si la fonction n'est pas disponible pour
   *    cet élève (autre filière que les livres Adultes, aucun niveau) ;
   *  - l'accès aux Familles de mots (`racines_coran`) ;
   *  - « Chercher un mot ou une racine » : la recherche existante (celle du panneau « Outils » du lecteur), telle quelle.
   */
  let mesure = $state<Mesure | null>(null);
  onMount(async () => {
    if (!(await initialiser().catch(() => false))) return;
    const p = await demoProfileFor('').catch(() => null);
    const f = await chargerFrequences(p?.id);
    if (f && etat.connus) mesure = mesurerTout(f, etat.connus);
  });
  const pct = $derived(mesure ? Math.round(pourcent(mesure.compris, mesure.mots)) : 0);
  const phrase = $derived(t('cm.reconnais_coran', { pct: fmtNumber(pct) }));
</script>

<div class="cm-espace" data-testid="cm-espace" lang={localeInfo().code} dir={localeInfo().dir}>
  <h1>{t('cm.espace_titre')}</h1>
  {#if mesure && mesure.mots > 0}
    <section class="cm-carte" data-testid="cm-coran" aria-label={phrase}>
      <p class="cm-titre" data-testid="cm-coran-titre"><Bidi text={phrase} /></p>
      <div
        class="cm-barre"
        role="progressbar"
        aria-label={phrase}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={pct}
      >
        <span style:inline-size={`${pct}%`}></span>
      </div>
      <p class="cm-petit">{t('cm.note')}</p>
    </section>
  {/if}
  {#if fn('racines_coran')}
    <a class="cm-carte cm-acces" href={resolve('/coran/familles')} data-testid="cm-espace-familles"
      ><strong>{t('cm.familles')}</strong><span aria-hidden="true">›</span></a
    >
  {/if}
</div>
<div id="chercher"><Recherche imbrique /></div>

<style>
  .cm-espace {
    display: grid;
    gap: 10px;
    max-inline-size: 44rem;
    margin-inline: auto;
    padding: var(--space-m, 12px) var(--space-m, 12px) 0;
    color: var(--ink);
  }
  h1,
  p {
    margin: 0;
  }
  .cm-carte {
    display: grid;
    gap: 6px;
    padding: 12px 14px;
    color: var(--ink);
    background: var(--card);
    border: 1px solid var(--line);
    border-inline-start: 4px solid var(--or-line);
    border-radius: var(--radius-md);
  }
  .cm-titre {
    font-weight: 800;
    font-size: 1.05rem;
  }
  .cm-barre {
    block-size: 10px;
    overflow: hidden;
    background: var(--surface);
    border-radius: var(--radius-pill);
  }
  .cm-barre span {
    display: block;
    block-size: 100%;
    background: var(--primary);
    border-radius: inherit;
  }
  .cm-petit {
    font-size: 0.92rem;
    color: var(--ink2);
  }
  .cm-acces {
    grid-template-columns: 1fr auto;
    align-items: center;
    min-block-size: var(--target);
    color: var(--primary);
    text-decoration: none;
  }
</style>
