<script lang="ts">
  /**
   * Refonte 19/10 : barre en segments (phrases d'une séance, étapes d'une fiche) — faits en vert, celui en cours en
   * or, les suivants en ivoire. Décorative : le texte voisin dit déjà « 2 sur 4 ».
   */
  let { total, faits, ici = -1 }: { total: number; faits: number; ici?: number } = $props();
</script>

<span class="segments" aria-hidden="true" data-testid="v4-segments"
  >{#each { length: total } as _, i (i)}<i class:fait={i < faits} class:ici={i === ici}
    ></i>{/each}</span
>

<style>
  .segments {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  i {
    flex: 1;
    height: 8px;
    border-radius: 99px;
    background: var(--v4-carte-2);
  }
  .fait {
    background: var(--v4-vert-clair);
  }
  .ici {
    background: var(--v4-or);
  }
</style>
