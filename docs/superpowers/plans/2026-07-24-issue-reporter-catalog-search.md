# Catalog Search + Season Accordion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the plex-issue-reporter home page paint instantly and search titles only as the user types, and collapse the TV season/episode view into an accordion.

**Architecture:** Move the movie/series list fetch out of the blocking page `load` into a cached JSON endpoint (`/api/catalog`) that the browser fetches after mount. The home page filters an in-memory copy client-side and shows an "indexing" note if the user types before the fetch resolves. The show-detail page keeps its server load unchanged but renders each season as a collapsed, single-open accordion drawer.

**Tech Stack:** SvelteKit 2 (Svelte 5 runes), TypeScript, Vitest, adapter-node.

## Global Constraints

- Working directory for all paths: `plex-issue-reporter/`.
- Svelte 5 runes syntax only (`$state`, `$derived`, `$props`, `$effect`) — match existing files.
- Test runner: `npm test` (vitest, `vitest run`). Single file: `npx vitest run <path>`.
- Type-check gate: `npm run check` must report `0 ERRORS`.
- Preserve the existing neobrutalist styling classes (`border-2 border-black`, `shadow-nb`, `shadow-nb-sm`, `bg-nb-yellow`, `bg-nb-pink`, `font-black`).
- Env vars are read via SvelteKit `$env` modules (already fixed); do not reintroduce `process.env`.
- Commit messages end with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.
- Branch: `issue-reporter`.

---

## File Structure

- **Create** `src/lib/server/catalog.ts` — TTL-cached catalog fetch (movies+series titles), one responsibility: provide `getCatalog()`.
- **Create** `src/lib/server/catalog.test.ts` — unit tests for the cache behavior.
- **Create** `src/routes/api/catalog/+server.ts` — GET endpoint returning the catalog JSON.
- **Modify** `src/routes/+page.server.ts` — drop the blocking `load`; keep the `report` action.
- **Modify** `src/routes/+page.svelte` — async catalog fetch, type-to-search, empty/indexing/error states.
- **Modify** `src/routes/shows/[id]/+page.svelte` — single-open season accordion, collapsed by default.

---

### Task 1: Catalog cache module

**Files:**
- Create: `src/lib/server/catalog.ts`
- Test: `src/lib/server/catalog.test.ts`

**Interfaces:**
- Consumes: `getClients()` from `src/lib/server/media.ts` (returns `{ radarr: { listMovies() }, sonarr: { listSeries() } }`).
- Produces:
  - `type CatalogMovie = { id: number; title: string; year: number }`
  - `type CatalogSeries = { id: number; title: string }`
  - `type Catalog = { movies: CatalogMovie[]; series: CatalogSeries[] }`
  - `createCatalogCache(opts: { fetchCatalog: () => Promise<Catalog>; now?: () => number; ttlMs?: number }): () => Promise<Catalog>`
  - `getCatalog: () => Promise<Catalog>` (default instance wired to real clients + `Date.now`, 60s TTL)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/server/catalog.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createCatalogCache, type Catalog } from './catalog';

const sample: Catalog = {
  movies: [{ id: 1, title: 'Dune', year: 2021 }],
  series: [{ id: 2, title: 'Severance' }]
};

describe('createCatalogCache', () => {
  it('returns the catalog from the fetcher', async () => {
    const fetchCatalog = vi.fn().mockResolvedValue(sample);
    const getCatalog = createCatalogCache({ fetchCatalog, now: () => 0 });
    expect(await getCatalog()).toEqual(sample);
    expect(fetchCatalog).toHaveBeenCalledTimes(1);
  });

  it('serves from cache within the TTL without refetching', async () => {
    const fetchCatalog = vi.fn().mockResolvedValue(sample);
    let t = 0;
    const getCatalog = createCatalogCache({ fetchCatalog, now: () => t, ttlMs: 1000 });
    await getCatalog();
    t = 999;
    await getCatalog();
    expect(fetchCatalog).toHaveBeenCalledTimes(1);
  });

  it('refetches after the TTL expires', async () => {
    const fetchCatalog = vi.fn().mockResolvedValue(sample);
    let t = 0;
    const getCatalog = createCatalogCache({ fetchCatalog, now: () => t, ttlMs: 1000 });
    await getCatalog();
    t = 1001;
    await getCatalog();
    expect(fetchCatalog).toHaveBeenCalledTimes(2);
  });

  it('shares a single in-flight fetch across concurrent calls', async () => {
    let resolve!: (c: Catalog) => void;
    const fetchCatalog = vi.fn().mockReturnValue(new Promise<Catalog>((r) => (resolve = r)));
    const getCatalog = createCatalogCache({ fetchCatalog, now: () => 0 });
    const a = getCatalog();
    const b = getCatalog();
    resolve(sample);
    expect(await a).toEqual(sample);
    expect(await b).toEqual(sample);
    expect(fetchCatalog).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/server/catalog.test.ts`
Expected: FAIL — cannot resolve module `./catalog` / `createCatalogCache is not a function`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/server/catalog.ts`:

```ts
import { getClients } from './media';

export type CatalogMovie = { id: number; title: string; year: number };
export type CatalogSeries = { id: number; title: string };
export type Catalog = { movies: CatalogMovie[]; series: CatalogSeries[] };

export function createCatalogCache(opts: {
  fetchCatalog: () => Promise<Catalog>;
  now?: () => number;
  ttlMs?: number;
}): () => Promise<Catalog> {
  const now = opts.now ?? Date.now;
  const ttlMs = opts.ttlMs ?? 60_000;
  let cached: { value: Catalog; expires: number } | null = null;
  let inflight: Promise<Catalog> | null = null;

  return async function getCatalog(): Promise<Catalog> {
    if (cached && now() < cached.expires) return cached.value;
    if (inflight) return inflight;
    inflight = opts
      .fetchCatalog()
      .then((value) => {
        cached = { value, expires: now() + ttlMs };
        return value;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };
}

async function fetchFromClients(): Promise<Catalog> {
  const { radarr, sonarr } = getClients();
  const [movies, series] = await Promise.all([radarr.listMovies(), sonarr.listSeries()]);
  return {
    movies: movies.map((m) => ({ id: m.id, title: m.title, year: m.year })),
    series: series.map((s) => ({ id: s.id, title: s.title }))
  };
}

export const getCatalog = createCatalogCache({ fetchCatalog: fetchFromClients });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/server/catalog.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Type-check**

Run: `npm run check`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/catalog.ts src/lib/server/catalog.test.ts
git commit -m "feat(issue-reporter): cached catalog module for title search

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Catalog API endpoint

**Files:**
- Create: `src/routes/api/catalog/+server.ts`

**Interfaces:**
- Consumes: `getCatalog` from `$lib/server/catalog`.
- Produces: `GET /api/catalog` → `200 application/json` body `{ movies: CatalogMovie[]; series: CatalogSeries[] }`. Requires an authenticated session (enforced by existing `hooks.server.ts`, which is not modified).

- [ ] **Step 1: Write the endpoint**

Create `src/routes/api/catalog/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import { getCatalog } from '$lib/server/catalog';

export async function GET() {
  return json(await getCatalog());
}
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 3: Verify against a running dev server**

Create a scratch `.env` in `plex-issue-reporter/` with any non-empty values for all 9 vars (real Radarr/Sonarr values if reachable, otherwise dummies), then:

```bash
npm run dev   # in one shell
# in another shell:
curl -s -i http://localhost:5173/api/catalog | head -20
```

Expected (auth redirect, because no session cookie): `HTTP/1.1 302` with `location: /login`. This confirms the route exists and is auth-gated. (A signed-in browser fetch returns the JSON body.)

Stop the dev server and delete the scratch `.env` when done.

- [ ] **Step 4: Commit**

```bash
git add src/routes/api/catalog/+server.ts
git commit -m "feat(issue-reporter): GET /api/catalog endpoint

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Home page — async fetch + type-to-search

**Files:**
- Modify: `src/routes/+page.server.ts` (remove `load`, keep `report` action)
- Modify: `src/routes/+page.svelte` (full rewrite of script + list section)

**Interfaces:**
- Consumes: `GET /api/catalog` (Task 2); `reportMovieIssue` from `$lib/server/media`.
- Produces: no new exports. Home page renders no titles until the user types.

- [ ] **Step 1: Replace `+page.server.ts`**

Overwrite `src/routes/+page.server.ts` with (drops the `load` and its `getClients` import):

```ts
import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { reportMovieIssue } from '$lib/server/media';

export const actions: Actions = {
  report: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { error: 'Not signed in' });
    const data = await request.formData();
    const movieId = Number(data.get('movieId'));
    const note = String(data.get('note') ?? '');
    try {
      const message = await reportMovieIssue(movieId, locals.user.username, note);
      return { success: true, message };
    } catch (err) {
      console.error('[report movie]', err);
      return fail(502, { error: "Couldn't reach the media service. Try again later." });
    }
  }
};
```

- [ ] **Step 2: Rewrite `+page.svelte`**

Overwrite `src/routes/+page.svelte` with:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { enhance } from '$app/forms';
  import { flushSync } from 'svelte';
  import { Film, Tv, Search } from 'lucide-svelte';
  import NbButton from '$lib/components/NbButton.svelte';
  import ReportModal from '$lib/components/ReportModal.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import type { ActionData } from './$types';

  type CatalogMovie = { id: number; title: string; year: number };
  type CatalogSeries = { id: number; title: string };

  let { form }: { form: ActionData } = $props();
  let tab = $state<'movies' | 'shows'>('movies');
  let query = $state('');
  let modalOpen = $state(false);
  let selected = $state<{ id: number; label: string } | null>(null);
  let toast = $state('');

  let catMovies = $state<CatalogMovie[]>([]);
  let catSeries = $state<CatalogSeries[]>([]);
  let status = $state<'loading' | 'ready' | 'error'>('loading');

  async function loadCatalog() {
    status = 'loading';
    try {
      const res = await fetch('/api/catalog');
      if (!res.ok) throw new Error(`catalog ${res.status}`);
      const cat = (await res.json()) as { movies: CatalogMovie[]; series: CatalogSeries[] };
      catMovies = cat.movies;
      catSeries = cat.series;
      status = 'ready';
    } catch (e) {
      console.error('[catalog]', e);
      status = 'error';
    }
  }
  onMount(loadCatalog);

  const q = $derived(query.trim().toLowerCase());
  const movies = $derived(q === '' ? [] : catMovies.filter((m) => m.title.toLowerCase().includes(q)));
  const shows = $derived(q === '' ? [] : catSeries.filter((s) => s.title.toLowerCase().includes(q)));

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

  <div class="flex items-center gap-2 bg-white border-2 border-black shadow-nb px-3 py-2 mb-2">
    <Search size={16} />
    <input bind:value={query} placeholder="search titles…" class="flex-1 outline-none font-bold" />
  </div>

  {#if q !== '' && status === 'loading'}
    <p class="font-bold text-gray-600 mb-4">Indexing your library…</p>
  {/if}

  {#if q === ''}
    <p class="flex items-center gap-2 font-bold text-gray-600 mt-6">
      <Search size={16} /> Start typing to search your library
    </p>
  {:else if status === 'error'}
    <div class="bg-nb-pink border-2 border-black p-3 mt-2">
      <p class="font-black mb-2">Couldn't load your library.</p>
      <NbButton variant="white" onclick={loadCatalog}>RETRY</NbButton>
    </div>
  {:else if status === 'ready'}
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
  {/if}

  {#if form?.error}<p class="bg-nb-pink border-2 border-black p-2 font-black mt-3">{form.error}</p>{/if}
</main>

<ReportModal open={modalOpen} mediaLabel={selected?.label ?? ''} onSubmit={doSubmit} onClose={() => (modalOpen = false)} />

<form method="POST" action="?/report" use:enhance bind:this={submitForm} class="hidden">
  <input type="hidden" name="movieId" value={selected?.id ?? ''} />
  <input type="hidden" name="note" value={noteValue} />
</form>

<Toast message={toast} />
```

- [ ] **Step 3: Type-check**

Run: `npm run check`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 4: Verify against a running dev server**

With a scratch `.env` present (as in Task 2), `npm run dev`, then in a browser signed in (or verify visually):

- The page renders immediately; the list area shows "Start typing to search your library" (no titles).
- Typing a query filters results. If you type in the first instant after load, the "Indexing your library…" note appears, then results replace it once the fetch resolves.
- Switching between MOVIES and TV SHOWS tabs is instant and both search.

To sanity-check the empty/indexing states without a real session, confirm `npm run check` passes and the dev server compiles the route with no errors in its log.

Delete the scratch `.env` when done.

- [ ] **Step 5: Commit**

```bash
git add src/routes/+page.server.ts src/routes/+page.svelte
git commit -m "feat(issue-reporter): async catalog fetch + type-to-search home page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Season accordion on the show-detail page

**Files:**
- Modify: `src/routes/shows/[id]/+page.svelte` (script state + season markup only; forms and `doSubmit` unchanged)

**Interfaces:**
- Consumes: existing `data.seasons` (`Array<{ seasonNumber: number; episodes: Array<{ id; episodeNumber; title }> }>`) from the unchanged server `load`.
- Produces: no new exports. Seasons collapsed by default; one open at a time.

- [ ] **Step 1: Add accordion state**

In `src/routes/shows/[id]/+page.svelte`, inside `<script>`, add after the existing `let seasonNo = $state<number>(0);` line:

```ts
  let openSeason = $state<number | null>(null);
  function toggleSeason(n: number) { openSeason = openSeason === n ? null : n; }
```

- [ ] **Step 2: Replace the season loop markup**

Replace this block:

```svelte
  {#each data.seasons as season (season.seasonNumber)}
    <div class="flex justify-between items-center bg-nb-yellow border-2 border-black shadow-nb px-3 py-2 mb-2">
      <span class="font-black">SEASON {season.seasonNumber}</span>
      <NbButton variant="white" onclick={() => reportSeason(season.seasonNumber, `${data.series.title} · S${season.seasonNumber} (full season)`)}>REPORT WHOLE SEASON</NbButton>
    </div>
    {#each season.episodes as ep (ep.id)}
      <div class="flex items-center gap-3 bg-white border-2 border-black shadow-nb-sm p-2 mb-2 ml-3">
        <div class="flex-1 font-black text-sm">S{season.seasonNumber}E{ep.episodeNumber} · {ep.title}</div>
        <NbButton onclick={() => reportEpisode(ep.id, `${data.series.title} · S${season.seasonNumber}E${ep.episodeNumber}`)}>REPORT</NbButton>
      </div>
    {/each}
  {/each}
```

with:

```svelte
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
```

(The toggle button and the REPORT WHOLE SEASON button are siblings, so clicking REPORT does not toggle the drawer — no `stopPropagation` needed.)

- [ ] **Step 3: Type-check**

Run: `npm run check`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 4: Verify against a running dev server**

With a scratch `.env` and `npm run dev`, open a show page:

- All seasons render collapsed (chevron `▶`, episode count shown, no episodes visible).
- Clicking a season header expands only that season (chevron rotates to point down); clicking another season collapses the first and opens the new one; clicking the open one closes it.
- "REPORT WHOLE SEASON" opens the report modal and does not change which season is expanded.
- Expanding a season, then "REPORT" on an episode still opens the modal and submits.

Delete the scratch `.env` when done.

- [ ] **Step 5: Commit**

```bash
git add src/routes/shows/[id]/+page.svelte
git commit -m "feat(issue-reporter): collapse seasons into a single-open accordion

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

- [ ] Run the full suite: `npm test` → all tests pass (existing 36 + 4 new catalog tests = 40).
- [ ] `npm run check` → `0 ERRORS 0 WARNINGS`.
- [ ] Confirm no scratch `.env` remains: `git status` shows only the intended files, and `.env` is absent/untracked.
- [ ] Push: `git push` (branch `issue-reporter`).
