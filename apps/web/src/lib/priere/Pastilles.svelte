<script lang="ts">
  import { t } from '$lib/i18n';
  import { CLASSE_NIVEAU, lignesVoix, listeNiveaux, type Niveau } from './donnees';
  import Picto from './Picto.svelte';

  /**
   * Pastilles d'une parole ou d'une étape : le NIVEAU (obligatoire, sunna, recommandé… : le libellé du référent), la VOIX
   * (haute ou basse, une ligne par cas : l'imam, celui qui prie seul, celui qui suit l'imam) et le nombre de fois.
   * Tout vient des données ; seule la forme courte « haute » / « basse » reçoit un mot de l'interface.
   */
  let {
    niveau,
    voix,
    repetition,
  }: { niveau?: Niveau | Niveau[]; voix?: string; repetition?: string } = $props();
  const niveaux = $derived(listeNiveaux({ niveau }));
  const lignes = $derived(lignesVoix(voix));
  const texteVoix = (x: string) => (x === 'haute' || x === 'basse' ? t(`priere.voix_${x}`) : x);
</script>

{#if niveaux.length || lignes.length || repetition}
  <div class="pastilles">
    {#each niveaux as n (n.code)}
      <span class="pastille {CLASSE_NIVEAU[n.code] ?? 'permis'}" data-niveau={n.code}
        >{n.libelle}</span
      >
    {/each}
    {#if repetition}
      <span class="pastille voix"><Picto nom="repeter" />{repetition}</span>
    {/if}
  </div>
  {#if lignes.length}
    <div class="voix-lignes" data-testid="priere-voix">
      {#each lignes as l, i (i)}
        <span
          class="pastille voix"
          data-voix={l.haute && l.basse ? 'mixte' : l.haute ? 'haute' : 'basse'}
          >{#if l.haute}<Picto nom="voix-haute" />{/if}{#if l.basse || !l.haute}<Picto
              nom="voix-basse"
            />{/if}{texteVoix(l.texte)}</span
        >
      {/each}
    </div>
  {/if}
{/if}
