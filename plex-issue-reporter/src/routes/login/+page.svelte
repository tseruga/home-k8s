<script lang="ts">
  import { Film } from 'lucide-svelte';
</script>

<main class="min-h-screen flex items-center justify-center p-6">
  <div class="bg-white border-2 border-black shadow-nb-lg p-10 max-w-md text-center">
    <Film class="mx-auto mb-4" size={40} />
    <h1 class="text-3xl mb-2">REPORT A MEDIA ISSUE</h1>
    <p class="text-sm font-bold text-gray-600 mb-8">Plex users of this library only.</p>
    <a href="/auth/plex"
       class="inline-block bg-nb-yellow border-2 border-black shadow-nb px-6 py-3 font-black hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-nb-sm transition-all">
      ▶ SIGN IN WITH PLEX
    </a>
    <p class="text-xs font-bold text-gray-500 mt-6">You'll authorize on plex.tv — we never see your password.</p>
  </div>
</main>
