<script lang="ts">
  import '../app.css';
  import { resolve } from '$app/paths';
  let { children } = $props();
</script>

<header class="top">
  <a href={resolve('/')} class="brand">AWFORM</a>
  <span class="tag">bêta de développement</span>
</header>
<main>
  {@render children()}
</main>

<style>
  .top {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    background: var(--navy);
    color: #fff;
  }
  .brand {
    color: #fff;
    font-weight: 700;
    text-decoration: none;
    letter-spacing: 0.08em;
  }
  .tag {
    font-size: 0.8rem;
    opacity: 0.8;
  }
  main {
    max-width: 860px;
    margin: 0 auto;
    padding: 16px;
  }
</style>
