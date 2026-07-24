# plex-issue-reporter

A Plex-authenticated web app for reporting issues with requested media. Whitelisted
Plex users log in, browse the movies/shows monitored by Radarr and Sonarr, and report
an issue on a movie, episode, or whole season. Each report auto-fires the right
remediation — **blocklist the bad file and re-grab** if a file already exists, or
**trigger a search** if the media is missing — and posts a notification to Discord.
It fills the gap Overseerr leaves around *missing* media.

Built with SvelteKit (Svelte 5, `adapter-node`) + Tailwind + Bits UI. Stateless
(signed-cookie sessions, no database). Neobrutalist UI.

> Deploying to the cluster is a separate doc: see [`DEPLOYMENT.md`](./DEPLOYMENT.md).
> This README covers **local development and testing**.

## Prerequisites

- **Node 20+** and npm.
- For anything that talks to your services (live dev), the machine must be on the
  home LAN so it can reach Radarr (`192.168.1.211`) and Sonarr (`192.168.1.207`)
  directly. The offline tests below need none of this.

```bash
cd plex-issue-reporter
npm install
```

## Testing tiers

### 1. Unit / integration tests — no credentials, no network (start here)

The domain logic (remediation decision, Radarr/Sonarr clients, Plex auth/whitelist,
session signing, Discord embeds, config, route guard) is fully unit-tested with an
injected `fetch`, so nothing hits the real Radarr/Sonarr/Plex.

```bash
npm run test        # run once (36 tests)
npm run test:watch  # watch mode while developing
```

### 2. Type check

```bash
npm run check       # svelte-check, expect 0 errors / 0 warnings
```

### 3. Full local run against your real services

This exercises the real Plex login and live Radarr/Sonarr calls, so it needs real
credentials and LAN access.

1. Copy the example env and fill it in (the file is gitignored):

   ```bash
   cp .env.example .env
   ```

   | Var | What it is |
   |-----|-----------|
   | `RADARR_URL` / `RADARR_API_KEY` | Radarr base URL + API key (Radarr → Settings → General) |
   | `SONARR_URL` / `SONARR_API_KEY` | Sonarr base URL + API key (Sonarr → Settings → General) |
   | `PLEX_OWNER_TOKEN` | Your Plex account token — used to look up who your library is shared with. Grab it from an authenticated plex.tv request, or via the [Plex support article on finding a token](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/). |
   | `PLEX_CLIENT_ID` | Any stable string identifying this app (default `plex-issue-reporter` is fine). |
   | `PUBLIC_APP_URL` | Must be `http://localhost:5173` locally, so the Plex OAuth flow redirects back to the dev server. |
   | `DISCORD_WEBHOOK_URL` | A Discord webhook URL for report notifications. |
   | `SESSION_SECRET` | Secret that signs the session cookie. Generate one: `openssl rand -hex 32`. |

2. Start the dev server (Vite auto-loads `.env`):

   ```bash
   npm run dev
   ```

   Open http://localhost:5173.

3. **Sign in with Plex.** Only accounts your library is shared with — plus you, the
   owner — are allowed; everyone else lands on `/denied`.

4. Browse Movies/TV, drill a show into season → episode, and report something.
   - Reporting a **missing** item triggers a search in Radarr/Sonarr.
   - Reporting an item **with a bad file** blocklists it and re-grabs.
   - Each report posts to your Discord webhook.

> Session cookies use the `Secure` flag; browsers treat `http://localhost` as a
> secure context, so login works over plain HTTP locally without a certificate.

### 4. Production container smoke test (optional)

Verifies the real `adapter-node` image boots and serves `/healthz`. The health route
doesn't call any upstream, but the request guard runs `loadConfig()`, so all env vars
must be **present** (dummy values are fine here):

```bash
./build.sh local        # builds tseruga/plex-issue-reporter:local
docker run --rm -d -p 3000:3000 --name pir-test \
  -e RADARR_URL=http://x -e RADARR_API_KEY=x -e SONARR_URL=http://x -e SONARR_API_KEY=x \
  -e PLEX_OWNER_TOKEN=x -e PLEX_CLIENT_ID=x \
  -e PUBLIC_APP_URL=http://localhost:3000 -e DISCORD_WEBHOOK_URL=http://x -e SESSION_SECRET=x \
  tseruga/plex-issue-reporter:local
sleep 4 && curl -s http://localhost:3000/healthz   # -> healthy
docker stop pir-test
```

## Known items to verify during live testing

Two core paths are covered by unit tests (with mocked responses) but have not yet been
exercised against the real services — confirm them the first time you run tier 3:

1. **Owner login** — the owner must be admitted even though `/api/v2/friends` lists only
   *shared* users, not the owner. (Handled by passing the owner's account id to the
   whitelist check.)
2. **Sonarr history shape** — reporting a bad episode/season depends on Sonarr's paged
   `/api/v3/history` response (`{ records: [...] }`). Confirm a "bad episode" report
   actually blocklists and re-grabs.

## Project layout

```
src/
  hooks.server.ts          # auth guard: verifies session cookie, gates non-public routes
  lib/server/              # server-only domain logic (never imported into .svelte)
    config.ts              # env → typed config (fail-fast on missing vars)
    plex.ts                # Plex PIN OAuth + whitelist lookup
    session.ts             # HMAC-signed session cookie
    radarr.ts / sonarr.ts  # API clients + remediation
    remediation.ts         # decide blocklist-and-regrab vs search
    discord.ts             # notification embed + best-effort send
    media.ts               # orchestration used by the routes
  lib/components/          # neobrutalist UI (NbButton, NbCard, ReportModal, Toast)
  routes/
    login/, auth/, logout/, denied/   # Plex login flow
    +page.*                # browse (movies/shows) + report action
    shows/[id]/+page.*     # season/episode drill-down
    healthz/               # health check for k8s probes
```
