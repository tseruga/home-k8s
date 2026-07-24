<script lang="ts">
  import { enhance } from '$app/forms';
  import { flushSync } from 'svelte';
  import NbButton from '$lib/components/NbButton.svelte';
  import ReportModal from '$lib/components/ReportModal.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  let modalOpen = $state(false);
  let target = $state<{ kind: 'episode' | 'season'; id: number; label: string } | null>(null);
  let toast = $state('');
  let noteValue = $state('');
  let epForm = $state<HTMLFormElement>();
  let seasonForm = $state<HTMLFormElement>();
  let epId = $state<number>(0);
  let seasonNo = $state<number>(0);
  let openSeason = $state<number | null>(null);
  function toggleSeason(n: number) { openSeason = openSeason === n ? null : n; }

  $effect(() => { if (form?.success) { toast = form.message; setTimeout(() => (toast = ''), 5000); } });

  function reportEpisode(id: number, label: string) { target = { kind: 'episode', id, label }; modalOpen = true; }
  function reportSeason(seasonNumber: number, label: string) { target = { kind: 'season', id: seasonNumber, label }; modalOpen = true; }
  function doSubmit(note: string) {
    if (target?.kind === 'episode') {
      flushSync(() => { noteValue = note; modalOpen = false; epId = target!.id; });
      epForm?.requestSubmit();
    } else if (target?.kind === 'season') {
      flushSync(() => { noteValue = note; modalOpen = false; seasonNo = target!.id; });
      seasonForm?.requestSubmit();
    }
  }
</script>

<main class="max-w-2xl mx-auto p-4">
  <header class="flex justify-between items-center bg-black text-white px-3 py-2 mb-4">
    <a href="/" class="font-black">◀ {data.series.title}</a>
  </header>

  {#each data.seasons as season (season.seasonNumber)}
    <div class="flex justify-between items-center bg-nb-yellow border-2 border-black shadow-nb px-3 py-2 mb-2">
      <button
        type="button"
        onclick={() => toggleSeason(season.seasonNumber)}
        aria-expanded={openSeason === season.seasonNumber}
        class="flex items-center gap-2 font-black"
      >
        <span class="inline-block transition-transform {openSeason === season.seasonNumber ? 'rotate-90' : ''}">▶</span>
        SEASON {season.seasonNumber}
        <span class="text-xs font-bold text-gray-700">({season.episodes.length} eps)</span>
      </button>
      <NbButton variant="white" onclick={() => reportSeason(season.seasonNumber, `${data.series.title} · S${season.seasonNumber} (full season)`)}>REPORT WHOLE SEASON</NbButton>
    </div>
    {#if openSeason === season.seasonNumber}
      {#each season.episodes as ep (ep.id)}
        <div class="flex items-center gap-3 bg-white border-2 border-black shadow-nb-sm p-2 mb-2 ml-3">
          <div class="flex-1 font-black text-sm">S{season.seasonNumber}E{ep.episodeNumber} · {ep.title}</div>
          <NbButton onclick={() => reportEpisode(ep.id, `${data.series.title} · S${season.seasonNumber}E${ep.episodeNumber}`)}>REPORT</NbButton>
        </div>
      {/each}
    {/if}
  {/each}

  {#if form?.error}<p class="bg-nb-pink border-2 border-black p-2 font-black mt-3">{form.error}</p>{/if}
</main>

<ReportModal open={modalOpen} mediaLabel={target?.label ?? ''} onSubmit={doSubmit} onClose={() => (modalOpen = false)} />

<form method="POST" action="?/reportEpisode" use:enhance bind:this={epForm} class="hidden">
  <input type="hidden" name="episodeId" value={epId} />
  <input type="hidden" name="note" value={noteValue} />
</form>
<form method="POST" action="?/reportSeason" use:enhance bind:this={seasonForm} class="hidden">
  <input type="hidden" name="seasonNumber" value={seasonNo} />
  <input type="hidden" name="note" value={noteValue} />
</form>

<Toast message={toast} />
