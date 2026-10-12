<script lang="ts">
  /**
   * ۞ (U+06DE, début de rubʿ al-ḥizb) dans le texte FLUIDE (essai du client, 12/10/2026, « Grand texte », page 5) :
   * la police coranique de l'application (Amiri Quran) le dessine comme une petite étoile qui ressemble à un
   * astérisque « * ». À l'AFFICHAGE seulement, il est remplacé par un ornement (étoile à huit pointes et cercle,
   * comme dans le muṣḥaf imprimé) ; le caractère reste dans le texte (copie, lecteurs d'écran, contrôles
   * « affiché = Tanzil »), simplement non dessiné. L'ornement est décoratif (aria-hidden).
   */
  let { sign }: { sign: string } = $props();
</script>

<span class="hizb"
  ><span class="hizb-t">{sign}</span><svg
    viewBox="-12 -12 24 24"
    aria-hidden="true"
    focusable="false"
    ><path
      d="M0-10.6L3.1-7.5H7.5V-3.1L10.6 0L7.5 3.1V7.5H3.1L0 10.6L-3.1 7.5H-7.5V3.1L-10.6 0L-7.5-3.1V-7.5H-3.1Z"
    /><circle r="3.2" /></svg
  ></span
>

<style>
  .hizb {
    position: relative;
    display: inline-block;
    width: 0.9em;
    height: 0.9em;
    vertical-align: -0.12em;
  }
  .hizb-t {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  path,
  circle {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linejoin: round;
  }
</style>
