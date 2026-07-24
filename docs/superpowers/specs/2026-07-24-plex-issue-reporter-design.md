# Plex Issue Reporter — Design

**Date:** 2026-07-24
**Status:** Approved design, pending implementation plan

## Context

Plex users of this library need a way to report problems with requested media.
Overseerr supports issue reporting for media that already exists, but has a
significant gap: it cannot report issues on **missing** media (monitored items
that never got a good download), which is a frequent complaint from this
library's users.

This app fills that gap. A whitelisted Plex user logs in, browses the monitored
movies and shows tracked by Radarr and Sonarr, and reports an issue on a movie,
episode, or whole season. The report immediately drives a remediation action in
Radarr/Sonarr: if a (bad) file already exists, its grab is marked failed —
blocklisting it and triggering a fresh download; if the media is missing, a
search is kicked off.

## Goals

- Let only Plex users with access to this library sign in.
- Browse monitored movies (Radarr) and shows (Sonarr), drilling shows into
  season → episode, with a "report whole season" option.
- Report an issue with an optional free-text note; no issue-type taxonomy.
- Auto-fire the correct Radarr/Sonarr action based on whether a file exists.
- Notify the owner via Discord webhook on each report.
- Distinct, non-generic **neobrutalist** UI.

## Non-goals

- No admin approval queue — reports fire immediately.
- No database / persistence — the app is stateless (Radarr/Sonarr history is the
  paper trail; Discord is the activity feed).
- No manual allowlist — access strictly mirrors Plex sharing.
- No issue categorization, no per-user rate limiting (may revisit later).

## Architecture

**Single full-stack SvelteKit app (Svelte 5, `adapter-node`)**, packaged as one
container. The server layer holds all credentials and performs all third-party
calls; the browser only ever talks to this app's own server.

- **Namespace / exposure:** `media` namespace, `Deployment` + `ClusterIP`
  Service, fronted by nginx ingress at `issues.tseruga.com` with a cert-manager
  Let's Encrypt TLS secret — mirroring the existing Overseerr deployment.
- **GitOps layout** (mirrors existing repo conventions, reconciled by Flux):
  - `plex-issue-reporter/` — app source + Dockerfile
  - `charts/plex-issue-reporter/` — Helm chart (modeled on `charts/ranked-choice-vote`)
  - `clusters/home-server/media/plex-issue-reporter-hr.yaml` — HelmRelease
- **Trust boundary:** Radarr (`192.168.1.211`), Sonarr (`192.168.1.207`), and the
  Plex owner token are reached only server-side over the LAN. No secrets reach
  the client; no CORS concerns (server-to-server).
- **State:** none. Sessions live in a signed cookie.

### Configuration (k8s Secret, `infra/secrets/`, uncommitted)

| Var | Purpose |
|-----|---------|
| `RADARR_URL` / `RADARR_API_KEY` | Radarr proxy |
| `SONARR_URL` / `SONARR_API_KEY` | Sonarr proxy |
| `PLEX_OWNER_TOKEN` | List accounts the library is shared with (whitelist) |
| `PLEX_MACHINE_IDENTIFIER` | Identify this server when listing shared users |
| `PLEX_CLIENT_ID` | Stable client identifier for the Plex OAuth flow |
| `PUBLIC_APP_URL` | `https://issues.tseruga.com` (OAuth forward URL) |
| `DISCORD_WEBHOOK_URL` | Report notifications |
| `SESSION_SECRET` | Signs the session cookie |

## Components & data flow

### 1. Authentication & whitelist

Plex OAuth **PIN flow** (standard for third-party Plex apps):

1. Server creates a PIN: `POST https://plex.tv/api/v2/pins?strong=true` (with
   product + `PLEX_CLIENT_ID` headers) → `{ id, code }`.
2. Redirect browser to
   `https://app.plex.tv/auth#?clientID=…&code=<code>&forwardUrl=<PUBLIC_APP_URL>/auth/callback`.
3. User authorizes on plex.tv (we never see their password).
4. Callback polls `GET https://plex.tv/api/v2/pins/<id>` until `authToken`
   returns, then `GET https://plex.tv/api/v2/user` → identity
   (`id`, `uuid`, `username`, `email`).

**Whitelist (auto from Plex sharing):**

5. Using `PLEX_OWNER_TOKEN`, fetch the set of accounts the library is shared
   with (plus the owner), keyed by Plex account `id`. Cache in memory ~5 min.
6. Logged-in user's `id` in the set → allowed; else → explicit access-denied
   page. No auto-provisioning.

**Session:**

7. Mint a signed, HttpOnly, Secure, SameSite=Lax cookie (signed with
   `SESSION_SECRET`) holding `{ plexUserId, username, exp }`, ~7-day lifetime.
8. **The user's Plex token is discarded after the whitelist check** — never
   stored. All later work uses the owner-side Radarr/Sonarr keys.
9. A SvelteKit `hooks.server.ts` guard validates the cookie on every request;
   invalid/expired → redirect to login.

**Edge cases:** abandoned PIN → timeout + retry; user removed from Plex sharing
→ next login fails, existing session expires at `exp`.

### 2. Browse

All server-side proxy, live (with a light ~30–60s in-memory cache of the list
endpoints):

- **Movies (Radarr):** `GET /api/v3/movie` → `{ id, title, year, monitored,
  hasFile, images, tmdbId }`, defaulting to `monitored: true`.
- **Shows (Sonarr):** `GET /api/v3/series` for the list; on drill-down,
  `GET /api/v3/episode?seriesId=<id>` for `{ id, seasonNumber, episodeNumber,
  title, monitored, hasFile }`; `series.seasons` gives season rollups.
- **UI flow:** Movies / TV tabs → title search → results are **just title +
  Report** (no status chips) → for a show, drill into season → episode, with a
  "report whole season" action.

### 3. Report → remediation

The report payload is just the target item + an **optional free-text note**. The
action is decided silently server-side by whether a file exists:

| Situation | Detected by | Action |
|-----------|-------------|--------|
| Existing but bad | `hasFile: true` | Mark grab failed → blocklist + auto re-grab |
| Missing | `hasFile: false` | Trigger a search |

- **Mark failed:** find the most recent `grabbed` history record
  (Radarr `GET /api/v3/history/movie?movieId=`, Sonarr
  `GET /api/v3/history?episodeId=`) → `POST /api/v3/history/failed/<historyId>`.
  Radarr/Sonarr then blocklist the release and auto-search.
- **Search:**
  - Radarr movie → `POST /api/v3/command {"name":"MoviesSearch","movieIds":[id]}`
  - Sonarr episode(s) → `POST /api/v3/command {"name":"EpisodeSearch","episodeIds":[…]}`
  - Sonarr season → `POST /api/v3/command {"name":"SeasonSearch","seriesId":…,"seasonNumber":…}`
- **Season report** fans out per-episode (failed vs search), then a single
  `SeasonSearch` for the missing ones.
- **Fallback — file exists but no grab history** (manual import, rotated
  history): delete the existing file (`DELETE /api/v3/moviefile/<id>` or
  `episodefile`), add to blocklist if applicable, then trigger a search.

### 4. Notification

After a successful action, best-effort `POST` to `DISCORD_WEBHOOK_URL` (embed
styled like the existing Overseerr alerts):

- Who reported (Plex username)
- What: `Movie — Title (Year)` or `Show — Title · S02E05` / `S02 (full season)`
- Their note (if any)
- Action taken: `Blocklisted + re-grabbing` or `Searching (missing)`
- Timestamp

A Discord failure is logged but does **not** fail the report — the
Radarr/Sonarr action has already fired.

## UI / screens

Svelte 5 + Tailwind + **Bits UI** (headless behavior) with a hand-authored
neobrutalist layer (thick `border-2 border-black`, hard `shadow-[4px_4px_0_0_#000]`,
no rounded corners, saturated accents, heavy type). `lucide-svelte` for icons.

1. **Login** — "Sign in with Plex" CTA; access-denied page for non-whitelisted.
2. **Browse** — Movies / TV tabs, search, results = title + Report only.
3. **Show drill-down** — show → season (with "report whole season") → episodes.
4. **Report modal** — optional note, Cancel / Submit. No issue type, no
   "what will happen" hint.
5. **Confirmation toast** — reflects the action taken ("blocklisted the old file
   and is grabbing a new copy" / "searching for a copy").

## Error handling

- Radarr/Sonarr unreachable or non-2xx → friendly "couldn't reach the media
  service" to the user; detail logged server-side; never leak keys or raw
  upstream errors to the browser.
- No grab history for a bad item → delete-file + search fallback.
- plex.tv down during login → friendly retry page.
- Not whitelisted → explicit access-denied page (not a bare 403).
- Session expired mid-flow → guard redirects to login.

## Testing

- **Unit:** the `hasFile → action` decision, season fan-out, history-record
  selection, Discord embed construction (no network).
- **Integration:** Radarr/Sonarr/Plex clients against mocked HTTP (fixtures of
  real API shapes) — missing movie → search, bad movie → mark-failed, bad
  episode, full-season mix, no-history fallback.
- **Auth:** whitelisted vs non-whitelisted; expired/tampered cookie rejected.
- Test-first (TDD). No live calls to the real Radarr/Sonarr in the suite.

## Deployment notes

- SvelteKit `adapter-node` requires a Node runtime container (not the existing
  static-nginx pattern used by `plex-movie-randomizer`). Multi-stage Dockerfile,
  non-root, `/healthz` for liveness/readiness probes (per repo convention).
- New custom Helm chart under `charts/plex-issue-reporter/` (modeled on
  `charts/ranked-choice-vote/`), HelmRelease at
  `clusters/home-server/media/plex-issue-reporter-hr.yaml`.
- Secret in `infra/secrets/` (uncommitted), injected via env.
- Ingress + TLS mirror `clusters/home-server/media/overseerr-hr.yaml`.
