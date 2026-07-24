<script lang="ts">
  import { enhance } from '$app/forms';
  import { flushSync } from 'svelte';
  import { Film, Tv, Search } from 'lucide-svelte';
  import NbButton from '$lib/components/NbButton.svelte';
  import ReportModal from '$lib/components/ReportModal.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  let tab = $state<'movies' | 'shows'>('movies');
  let query = $state('');
  let modalOpen = $state(false);
  let selected = $state<{ id: number; label: string } | null>(null);
  let toast = $state('');

  const movies = $derived(data.movies.filter((m) => m.title.toLowerCase().includes(query.toLowerCase())));
  const shows = $derived(data.series.filter((s) => s.title.toLowerCase().includes(query.toLowerCase())));

  $effect(() => { if (form?.success) { toast = form.message; setTimeout(() => (toast = ''), 5000); } });

  let submitForm = $state<HTMLFormElement>();
  let noteValue = $state('');

  function openReport(id: number, label: string) { selected = { id, label }; modalOpen = true; }
  function doSubmit(note: string) {
    flushSync(() => { noteValue = note; modalOpen = false; });
    submitForm?.requestSubmit();
  }
</script>

<main class="max-w-2xl mx-auto p-4">
  <header class="flex justify-between items-center bg-nb-yellow border-2 border-black shadow-nb px-3 py-2 mb-4">
    <span class="text-lg">MEDIA ISSUES</span>
    <form method="POST" action="/logout"><button class="text-xs font-black bg-black text-white px-2 py-1">LOG OUT</button></form>
  </header>

  <div class="flex gap-2 mb-3">
    <button onclick={() => (tab = 'movies')} class="border-2 border-black px-3 py-1 font-black text-sm {tab==='movies' ? 'bg-nb-yellow shadow-nb-sm' : 'bg-white'}"><Film size={14} class="inline" /> MOVIES</button>
    <button onclick={() => (tab = 'shows')} class="border-2 border-black px-3 py-1 font-black text-sm {tab==='shows' ? 'bg-nb-yellow shadow-nb-sm' : 'bg-white'}"><Tv size={14} class="inline" /> TV SHOWS</button>
  </div>

  <div class="flex items-center gap-2 bg-white border-2 border-black shadow-nb px-3 py-2 mb-4">
    <Search size={16} />
    <input bind:value={query} placeholder="search titles…" class="flex-1 outline-none font-bold" />
  </div>

  {#if tab === 'movies'}
    {#each movies as m (m.id)}
      <div class="flex items-center gap-3 bg-white border-2 border-black shadow-nb p-3 mb-3">
        <div class="flex-1 font-black">{m.title} ({m.year})</div>
        <NbButton onclick={() => openReport(m.id, `${m.title} (${m.year})`)}>REPORT</NbButton>
      </div>
    {:else}
      <p class="font-bold text-gray-600">No movies match.</p>
    {/each}
  {:else}
    {#each shows as s (s.id)}
      <a href={`/shows/${s.id}`} class="flex items-center gap-3 bg-white border-2 border-black shadow-nb p-3 mb-3">
        <div class="flex-1 font-black">{s.title}</div>
        <span class="font-black text-sm">→</span>
      </a>
    {:else}
      <p class="font-bold text-gray-600">No shows match.</p>
    {/each}
  {/if}

  {#if form?.error}<p class="bg-nb-pink border-2 border-black p-2 font-black mt-3">{form.error}</p>{/if}
</main>

<ReportModal open={modalOpen} mediaLabel={selected?.label ?? ''} onSubmit={doSubmit} onClose={() => (modalOpen = false)} />

<form method="POST" action="?/report" use:enhance bind:this={submitForm} class="hidden">
  <input type="hidden" name="movieId" value={selected?.id ?? ''} />
  <input type="hidden" name="note" value={noteValue} />
</form>

<Toast message={toast} />
