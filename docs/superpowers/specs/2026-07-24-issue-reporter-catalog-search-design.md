# plex-issue-reporter: catalog search + season accordion

**Date:** 2026-07-24
**Status:** Approved design
**Scope:** `plex-issue-reporter/` (SvelteKit app on branch `issue-reporter`)

## Problem

Two UX issues with the current app:

1. **Slow startup / everything shown.** The home page `load` blocks on fetching
   the entire Radarr movie list *and* the full Sonarr series list before the page
   renders, ships all of them to the browser, and renders every row when the
   search box is empty. Startup is slow and the screen is a wall of titles.

2. **All episodes auto-expanded.** The show-detail page renders every episode of
   every season expanded by default, making it hard to scan and drill down.

## Goals

- Home page paints fast, independent of library size.
- Titles appear only as the user searches; nothing is dumped on an empty query.
- If the user types before the catalog has loaded, tell them it is still indexing.
- Season/episode view starts collapsed; drilling into a season is an obvious,
  intuitive interaction.

## Non-goals

- Server-side per-keystroke search (rejected: adds latency and load on
  Radarr/Sonarr; the library is bounded, so a one-time async client fetch is
  simpler and snappier).
- Changing the report/remediation flow, auth, or Discord notification behavior.
- Lazy-loading episodes per season (the per-series episode fetch is already
  bounded and fast).

## Design

### Issue #1 — Async catalog loading + type-to-search

**New module `src/lib/server/catalog.ts`** — a 60-second in-memory TTL cache.

- `getCatalog(): Promise<{ movies: CatalogMovie[]; series: CatalogSeries[] }>`
  - `CatalogMovie = { id: number; title: string; year: number }`
  - `CatalogSeries = { id: number; title: string }`
- Internally calls `getClients()` then `radarr.listMovies()` /
  `sonarr.listSeries()` in parallel and trims to the shapes above.
- Memoizes the resolved result for 60s. After expiry the next call refetches.
- For testability, the module exposes a factory
  `createCatalogCache({ fetchCatalog, now, ttlMs })` where:
  - `fetchCatalog` returns the untrimmed/trimmed lists (fake in tests),
  - `now()` returns a millisecond timestamp (injected clock in tests),
  - `ttlMs` defaults to 60000.
  The default `getCatalog` is `createCatalogCache(...)` wired to the real
  clients and `Date.now`.
- Concurrent calls while a fetch is in flight share the same promise (store the
  in-flight promise, not just the resolved value) so a burst of loads triggers
  one upstream fetch.

**New endpoint `src/routes/api/catalog/+server.ts`**

- `GET` handler returns `json(await getCatalog())`.
- Not listed in `hooks.server.ts` `PUBLIC_PREFIXES`, so an unauthenticated
  request redirects to `/login` — acceptable because the page that fetches it is
  only reachable when signed in.

**`src/routes/+page.server.ts`**

- `load` no longer fetches movies/series. It returns nothing heavy (an empty
  object or minimal payload). The page renders immediately.
- The `report` action is unchanged.

**`src/routes/+page.svelte`**

- On mount, fetch `/api/catalog` in the background. Track:
  - `catalog: { movies; series } | null`
  - `status: 'loading' | 'ready' | 'error'`
- Filtering is `$derived` from `query` + `catalog`:
  - `query.trim() === ''` → results are empty; render the hint
    "🔍 Start typing to search your library".
  - `query` non-empty:
    - `status === 'loading'` → render an "Indexing your library…" note under the
      search bar. When the fetch resolves, the derived results update
      automatically and the note disappears.
    - `status === 'ready'` → filter the active tab's list (case-insensitive
      substring, same as today). Zero matches → existing "No movies/shows match."
    - `status === 'error'` → render an error line with a "Retry" button that
      re-runs the fetch.
- Both tabs (movies / shows) are served from the single catalog fetch; switching
  tabs stays instant.

### Issue #2 — Season accordion (show detail)

`src/routes/shows/[id]/+page.server.ts` is **unchanged**.

`src/routes/shows/[id]/+page.svelte`:

- `openSeason = $state<number | null>(null)` — all seasons collapsed by default.
- The season header becomes a toggle `<button>`:
  - Rotating chevron affordance: `▶` when collapsed, `▼` when expanded.
  - Label "SEASON {n}".
  - `aria-expanded` bound to whether this season is open.
  - Single-open behavior: clicking a season sets `openSeason` to its number and
    thereby collapses any other; clicking the currently-open season sets
    `openSeason = null`.
- Episodes for a season render only when `openSeason === season.seasonNumber`.
- "REPORT WHOLE SEASON" remains a separate button inside the header; its click
  handler calls `stopPropagation()` (or is structured outside the toggle button)
  so reporting a season does not toggle the drawer.
- The episode "REPORT" buttons and their hidden forms are unchanged.

## Testing

- **Unit tests for `catalog.ts`** (vitest):
  - returns the trimmed shape from the injected fetcher,
  - second call within TTL does not refetch (fetcher called once),
  - call after `now()` advances past `ttlMs` refetches,
  - concurrent calls during an in-flight fetch share one upstream call.
- **Manual dev-server verification:**
  - home page paints before the catalog resolves; empty box shows the hint;
    typing immediately shows the indexing note, then results;
  - show page starts fully collapsed; clicking a season expands only it;
    reporting a whole season does not toggle the drawer.
- Existing server-lib tests remain green; no changes to config/media/etc.

## Files touched

- add `src/lib/server/catalog.ts`
- add `src/lib/server/catalog.test.ts`
- add `src/routes/api/catalog/+server.ts`
- edit `src/routes/+page.server.ts`
- edit `src/routes/+page.svelte`
- edit `src/routes/shows/[id]/+page.svelte`
