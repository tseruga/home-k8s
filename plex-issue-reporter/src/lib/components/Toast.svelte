<script lang="ts">
  let { message = '' } = $props();
</script>

{#if message}
  <div class="fixed bottom-4 left-1/2 -translate-x-1/2 bg-nb-green border-2 border-black shadow-nb-lg p-3 max-w-md">
    <div class="font-black">✓ REPORTED!</div>
    <div class="text-sm font-bold">{message}</div>
  </div>
{/if}
