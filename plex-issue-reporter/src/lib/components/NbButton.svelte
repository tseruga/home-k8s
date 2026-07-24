<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    variant = 'pink',
    type = 'button',
    href = undefined,
    onclick = undefined,
    children
  }: {
    variant?: 'yellow' | 'pink' | 'white';
    type?: 'button' | 'submit' | 'reset';
    href?: string;
    onclick?: () => void;
    children: Snippet;
  } = $props();

  const bg = $derived({ yellow: 'bg-nb-yellow', pink: 'bg-nb-pink', white: 'bg-white' }[variant]);
  const cls = $derived(
    `inline-block ${bg} border-2 border-black shadow-nb-sm px-4 py-2 font-black text-sm hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all`
  );
</script>

{#if href}
  <a {href} class={cls}>{@render children()}</a>
{:else}
  <button {type} {onclick} class={cls}>{@render children()}</button>
{/if}
