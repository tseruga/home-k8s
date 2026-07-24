# Plex Issue Reporter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public, Plex-authenticated web app that lets whitelisted users report issues on monitored movies/episodes/seasons, auto-firing the correct Radarr/Sonarr remediation and notifying the owner via Discord.

**Architecture:** A single full-stack SvelteKit (Svelte 5, `adapter-node`) app. All third-party credentials and calls live server-side; the browser only talks to this app's own server. Core domain logic (remediation decision, API clients, session, Discord, whitelist) is written as dependency-injected modules under `src/lib/server/` so it is unit-testable without a live network. Routes/form actions wire those modules to the neobrutalist UI.

**Tech Stack:** SvelteKit 2 + Svelte 5, `@sveltejs/adapter-node`, TypeScript, Tailwind 3, Bits UI (headless components), lucide-svelte, Vitest (unit/integration with injected `fetch`), Docker (node:20-alpine), Helm + Flux CD.

**Design doc:** `docs/superpowers/specs/2026-07-24-plex-issue-reporter-design.md`

## Global Constraints

- Svelte `^5`, `@sveltejs/kit` `^2`, `@sveltejs/adapter-node` `^5`, Vite `^5`, TypeScript `^5`, Tailwind `^3`. `@sveltejs/vite-plugin-svelte` `^4`, `svelte-check` `^4`.
- All server-only code lives under `src/lib/server/`. Never import server modules or secrets into client code. Secrets are read via `process.env` in one place (`config.ts`); domain modules receive config as parameters (dependency injection).
- Domain modules (`plex.ts`, `radarr.ts`, `sonarr.ts`, `discord.ts`) accept an injected `fetch` so tests never hit the network. No real Radarr/Sonarr/Plex calls in the test suite.
- Registry/image convention: Docker Hub `tseruga/plex-issue-reporter`. Built and pushed **manually** (no CI). Container listens on port `3000` (adapter-node default).
- Public host: `issues.tseruga.com`. Ingress uses `cert-manager.io/cluster-issuer: letsencrypt-prod`, nginx, TLS secret `plex-issue-reporter-tls` (cert-manager auto-provisions it).
- Radarr base `http://192.168.1.211`, Sonarr base `http://192.168.1.207` (values come from env, not hardcoded).
- Neobrutalist visual language: `border-2 border-black`, hard offset shadow `shadow-[4px_4px_0_0_#000]`, no rounded corners, saturated accents (`#ffde59` yellow, `#ff5c8a` pink, `#a0e7ff` cyan), heavy type.
- Reports auto-fire immediately. No database. No admin queue.
- Commit after every green test / self-contained change.

---

### Task 1: Scaffold the SvelteKit app (Svelte 5 + adapter-node + Tailwind + Vitest)

**Files:**
- Create: `plex-issue-reporter/package.json`
- Create: `plex-issue-reporter/svelte.config.js`
- Create: `plex-issue-reporter/vite.config.ts`
- Create: `plex-issue-reporter/tsconfig.json`
- Create: `plex-issue-reporter/tailwind.config.js`
- Create: `plex-issue-reporter/postcss.config.js`
- Create: `plex-issue-reporter/.npmrc`
- Create: `plex-issue-reporter/.gitignore`
- Create: `plex-issue-reporter/.env.example`
- Create: `plex-issue-reporter/src/app.html`
- Create: `plex-issue-reporter/src/app.css`
- Create: `plex-issue-reporter/src/app.d.ts`
- Create: `plex-issue-reporter/src/routes/+layout.svelte`
- Create: `plex-issue-reporter/src/routes/healthz/+server.ts`
- Test: `plex-issue-reporter/src/lib/smoke.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a working dev/build/test toolchain. `npm run dev`, `npm run build`, `npm run test` all function.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "plex-issue-reporter",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "start": "node build",
    "prepare": "svelte-kit sync || echo ''",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@sveltejs/adapter-node": "^5.2.0",
    "@sveltejs/kit": "^2.5.0",
    "@sveltejs/vite-plugin-svelte": "^4.0.0",
    "autoprefixer": "^10.4.21",
    "postcss": "^8.5.6",
    "svelte": "^5.0.0",
    "svelte-check": "^4.0.0",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  },
  "dependencies": {
    "bits-ui": "^1.0.0",
    "lucide-svelte": "^0.400.0"
  }
}
```

- [ ] **Step 2: Create config files**

`svelte.config.js`:
```js
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter()
  }
};
export default config;
```

`vite.config.ts`:
```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}']
  }
});
```

`tsconfig.json`:
```json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "strict": true,
    "moduleResolution": "bundler"
  }
}
```

`tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        nb: { yellow: '#ffde59', pink: '#ff5c8a', cyan: '#a0e7ff', green: '#b6ff9e', cream: '#f5f0e8' }
      },
      boxShadow: { nb: '4px 4px 0 0 #000', 'nb-sm': '2px 2px 0 0 #000', 'nb-lg': '6px 6px 0 0 #000' }
    }
  },
  plugins: []
};
```

`postcss.config.js`:
```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} }
};
```

`.npmrc`:
```
engine-strict=true
```

`.gitignore`:
```
node_modules
/build
/.svelte-kit
/package
.env
.env.*
!.env.example
vite.config.ts.timestamp-*
```

- [ ] **Step 3: Create `.env.example` (documents every required var, no values)**

```
# Radarr / Sonarr (LAN, API keys required)
RADARR_URL=http://192.168.1.211
RADARR_API_KEY=
SONARR_URL=http://192.168.1.207
SONARR_API_KEY=

# Plex
PLEX_OWNER_TOKEN=
PLEX_MACHINE_IDENTIFIER=
PLEX_CLIENT_ID=plex-issue-reporter

# App
PUBLIC_APP_URL=http://localhost:5173
DISCORD_WEBHOOK_URL=
SESSION_SECRET=
```

- [ ] **Step 4: Create app shell files**

`src/app.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%sveltekit.assets%/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover" class="bg-nb-cream text-black">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

`src/app.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body { font-family: system-ui, -apple-system, sans-serif; }
  h1, h2, .nb-heading { font-family: 'Arial Black', system-ui, sans-serif; font-weight: 900; letter-spacing: -0.02em; }
}
```

`src/app.d.ts`:
```ts
import type { SessionUser } from '$lib/server/session';

declare global {
  namespace App {
    interface Locals {
      user: SessionUser | null;
    }
  }
}

export {};
```

`src/routes/+layout.svelte`:
```svelte
<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

{@render children()}
```

- [ ] **Step 5: Create the health route**

`src/routes/healthz/+server.ts`:
```ts
import { text } from '@sveltejs/kit';

export function GET() {
  return text('healthy\n');
}
```

- [ ] **Step 6: Write a smoke test**

`src/lib/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 7: Install and verify**

Run:
```bash
cd plex-issue-reporter && npm install && npm run test && npm run check
```
Expected: `npm install` succeeds; `vitest run` shows 1 passing test; `svelte-check` reports 0 errors.

- [ ] **Step 8: Verify dev server boots**

Run: `cd plex-issue-reporter && timeout 15 npm run dev -- --port 5173 || true`
Expected: Vite prints `Local: http://localhost:5173/` with no startup errors (the `timeout` stops it).

- [ ] **Step 9: Commit**

```bash
git add plex-issue-reporter
git commit -m "feat(issue-reporter): scaffold SvelteKit 5 + adapter-node + tailwind + vitest"
```

---

### Task 2: Config loader

**Files:**
- Create: `plex-issue-reporter/src/lib/server/config.ts`
- Test: `plex-issue-reporter/src/lib/server/config.test.ts`

**Interfaces:**
- Consumes: `process.env`.
- Produces:
  - `type AppConfig = { radarrUrl: string; radarrApiKey: string; sonarrUrl: string; sonarrApiKey: string; plexOwnerToken: string; plexMachineIdentifier: string; plexClientId: string; publicAppUrl: string; discordWebhookUrl: string; sessionSecret: string }`
  - `function loadConfig(env?: Record<string, string | undefined>): AppConfig` — throws `Error` listing every missing required var.

- [ ] **Step 1: Write the failing test**

`src/lib/server/config.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from './config';

const full = {
  RADARR_URL: 'http://r', RADARR_API_KEY: 'rk',
  SONARR_URL: 'http://s', SONARR_API_KEY: 'sk',
  PLEX_OWNER_TOKEN: 'ot', PLEX_MACHINE_IDENTIFIER: 'mid', PLEX_CLIENT_ID: 'cid',
  PUBLIC_APP_URL: 'http://localhost:5173', DISCORD_WEBHOOK_URL: 'http://d', SESSION_SECRET: 'secret'
};

describe('loadConfig', () => {
  it('maps env vars to a typed config', () => {
    const c = loadConfig(full);
    expect(c.radarrUrl).toBe('http://r');
    expect(c.sessionSecret).toBe('secret');
  });

  it('throws listing all missing required vars', () => {
    expect(() => loadConfig({ ...full, RADARR_API_KEY: undefined, SESSION_SECRET: undefined }))
      .toThrowError(/RADARR_API_KEY.*SESSION_SECRET|SESSION_SECRET.*RADARR_API_KEY/s);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plex-issue-reporter && npx vitest run src/lib/server/config.test.ts`
Expected: FAIL — cannot find module `./config`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/server/config.ts`:
```ts
export type AppConfig = {
  radarrUrl: string;
  radarrApiKey: string;
  sonarrUrl: string;
  sonarrApiKey: string;
  plexOwnerToken: string;
  plexMachineIdentifier: string;
  plexClientId: string;
  publicAppUrl: string;
  discordWebhookUrl: string;
  sessionSecret: string;
};

const REQUIRED: Array<[keyof AppConfig, string]> = [
  ['radarrUrl', 'RADARR_URL'],
  ['radarrApiKey', 'RADARR_API_KEY'],
  ['sonarrUrl', 'SONARR_URL'],
  ['sonarrApiKey', 'SONARR_API_KEY'],
  ['plexOwnerToken', 'PLEX_OWNER_TOKEN'],
  ['plexMachineIdentifier', 'PLEX_MACHINE_IDENTIFIER'],
  ['plexClientId', 'PLEX_CLIENT_ID'],
  ['publicAppUrl', 'PUBLIC_APP_URL'],
  ['discordWebhookUrl', 'DISCORD_WEBHOOK_URL'],
  ['sessionSecret', 'SESSION_SECRET']
];

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const missing: string[] = [];
  const cfg = {} as AppConfig;
  for (const [key, envName] of REQUIRED) {
    const val = env[envName];
    if (!val) missing.push(envName);
    else (cfg[key] as string) = val;
  }
  if (missing.length) throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  return cfg;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plex-issue-reporter && npx vitest run src/lib/server/config.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add plex-issue-reporter/src/lib/server/config.ts plex-issue-reporter/src/lib/server/config.test.ts
git commit -m "feat(issue-reporter): env config loader with validation"
```

---

### Task 3: Remediation decision logic

**Files:**
- Create: `plex-issue-reporter/src/lib/server/remediation.ts`
- Test: `plex-issue-reporter/src/lib/server/remediation.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type RemediationAction = 'blocklist-and-regrab' | 'search'`
  - `function decideAction(item: { hasFile: boolean }): RemediationAction`
  - `function actionLabel(action: RemediationAction): string` — human copy for the confirmation toast / Discord.

- [ ] **Step 1: Write the failing test**

`src/lib/server/remediation.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { decideAction, actionLabel } from './remediation';

describe('decideAction', () => {
  it('blocklists+regrabs when a file already exists', () => {
    expect(decideAction({ hasFile: true })).toBe('blocklist-and-regrab');
  });
  it('searches when the media is missing', () => {
    expect(decideAction({ hasFile: false })).toBe('search');
  });
});

describe('actionLabel', () => {
  it('describes each action', () => {
    expect(actionLabel('blocklist-and-regrab')).toMatch(/blocklist|re-?grab/i);
    expect(actionLabel('search')).toMatch(/search/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plex-issue-reporter && npx vitest run src/lib/server/remediation.test.ts`
Expected: FAIL — cannot find module `./remediation`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/server/remediation.ts`:
```ts
export type RemediationAction = 'blocklist-and-regrab' | 'search';

export function decideAction(item: { hasFile: boolean }): RemediationAction {
  return item.hasFile ? 'blocklist-and-regrab' : 'search';
}

export function actionLabel(action: RemediationAction): string {
  return action === 'blocklist-and-regrab'
    ? 'Blocklisted the old file and is grabbing a new copy'
    : 'Searching for a copy';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plex-issue-reporter && npx vitest run src/lib/server/remediation.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add plex-issue-reporter/src/lib/server/remediation.ts plex-issue-reporter/src/lib/server/remediation.test.ts
git commit -m "feat(issue-reporter): remediation decision logic"
```

---

### Task 4: Signed session cookie

**Files:**
- Create: `plex-issue-reporter/src/lib/server/session.ts`
- Test: `plex-issue-reporter/src/lib/server/session.test.ts`

**Interfaces:**
- Consumes: Node `crypto`.
- Produces:
  - `type SessionUser = { plexUserId: number; username: string; exp: number }`
  - `function signSession(user: SessionUser, secret: string): string`
  - `function verifySession(token: string, secret: string, now?: number): SessionUser | null` — returns null on bad signature, malformed token, or expiry.
  - `const SESSION_COOKIE = 'pir_session'`
  - `const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7`

- [ ] **Step 1: Write the failing test**

`src/lib/server/session.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { signSession, verifySession, SESSION_TTL_SECONDS } from './session';

const secret = 'test-secret';
const user = { plexUserId: 42, username: 'ada', exp: 2_000_000_000 };

describe('session', () => {
  it('round-trips a signed session', () => {
    const token = signSession(user, secret);
    expect(verifySession(token, secret, 1_000_000_000)).toEqual(user);
  });

  it('rejects a tampered payload', () => {
    const token = signSession(user, secret);
    const [payload, sig] = token.split('.');
    const forged = payload.slice(0, -1) + (payload.endsWith('A') ? 'B' : 'A') + '.' + sig;
    expect(verifySession(forged, secret, 1_000_000_000)).toBeNull();
  });

  it('rejects the wrong secret', () => {
    const token = signSession(user, secret);
    expect(verifySession(token, 'other', 1_000_000_000)).toBeNull();
  });

  it('rejects an expired session', () => {
    const token = signSession(user, secret);
    expect(verifySession(token, secret, user.exp + 1)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifySession('garbage', secret, 1)).toBeNull();
  });

  it('exports a 7-day TTL', () => {
    expect(SESSION_TTL_SECONDS).toBe(604800);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plex-issue-reporter && npx vitest run src/lib/server/session.test.ts`
Expected: FAIL — cannot find module `./session`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/server/session.ts`:
```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export type SessionUser = { plexUserId: number; username: string; exp: number };

export const SESSION_COOKIE = 'pir_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function signSession(user: SessionUser, secret: string): string {
  const payload = b64url(JSON.stringify(user));
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySession(
  token: string,
  secret: string,
  now: number = Math.floor(Date.now() / 1000)
): SessionUser | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = sign(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const user = JSON.parse(Buffer.from(payload, 'base64url').toString()) as SessionUser;
    if (typeof user.exp !== 'number' || user.exp <= now) return null;
    return user;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plex-issue-reporter && npx vitest run src/lib/server/session.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add plex-issue-reporter/src/lib/server/session.ts plex-issue-reporter/src/lib/server/session.test.ts
git commit -m "feat(issue-reporter): HMAC-signed session cookie"
```

---

### Task 5: Discord notifier

**Files:**
- Create: `plex-issue-reporter/src/lib/server/discord.ts`
- Test: `plex-issue-reporter/src/lib/server/discord.test.ts`

**Interfaces:**
- Consumes: `RemediationAction`, `actionLabel` from `remediation.ts`; an injected `fetch`.
- Produces:
  - `type ReportSummary = { username: string; mediaLabel: string; note?: string; action: RemediationAction }`
  - `function buildEmbed(r: ReportSummary): object` — the Discord webhook JSON body.
  - `function notifyDiscord(webhookUrl: string, r: ReportSummary, fetchFn?: typeof fetch): Promise<void>` — best-effort; never throws (logs on failure).

- [ ] **Step 1: Write the failing test**

`src/lib/server/discord.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { buildEmbed, notifyDiscord } from './discord';

const report = { username: 'ada', mediaLabel: 'Dune (2021)', note: 'wrong audio', action: 'blocklist-and-regrab' as const };

describe('buildEmbed', () => {
  it('includes who, what, note and action', () => {
    const body = JSON.stringify(buildEmbed(report));
    expect(body).toContain('ada');
    expect(body).toContain('Dune (2021)');
    expect(body).toContain('wrong audio');
    expect(body).toMatch(/blocklist|re-?grab/i);
  });
});

describe('notifyDiscord', () => {
  it('POSTs the embed to the webhook', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await notifyDiscord('http://webhook', report, fetchFn as unknown as typeof fetch);
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://webhook');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toHaveProperty('embeds');
  });

  it('never throws when the webhook fails', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('down'));
    await expect(notifyDiscord('http://webhook', report, fetchFn as unknown as typeof fetch)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plex-issue-reporter && npx vitest run src/lib/server/discord.test.ts`
Expected: FAIL — cannot find module `./discord`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/server/discord.ts`:
```ts
import { actionLabel, type RemediationAction } from './remediation';

export type ReportSummary = {
  username: string;
  mediaLabel: string;
  note?: string;
  action: RemediationAction;
};

export function buildEmbed(r: ReportSummary): object {
  const fields = [
    { name: 'Reported by', value: r.username, inline: true },
    { name: 'Action', value: actionLabel(r.action), inline: true }
  ];
  if (r.note && r.note.trim()) fields.push({ name: 'Note', value: r.note.trim(), inline: false });
  return {
    embeds: [
      {
        title: `Issue reported: ${r.mediaLabel}`,
        color: r.action === 'blocklist-and-regrab' ? 0xff5c8a : 0xb6ff9e,
        fields
      }
    ]
  };
}

export async function notifyDiscord(
  webhookUrl: string,
  r: ReportSummary,
  fetchFn: typeof fetch = fetch
): Promise<void> {
  try {
    await fetchFn(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildEmbed(r))
    });
  } catch (err) {
    console.error('[discord] notification failed', err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plex-issue-reporter && npx vitest run src/lib/server/discord.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add plex-issue-reporter/src/lib/server/discord.ts plex-issue-reporter/src/lib/server/discord.test.ts
git commit -m "feat(issue-reporter): Discord notification builder + best-effort sender"
```

---

### Task 6: Plex client (PIN auth + whitelist)

**Files:**
- Create: `plex-issue-reporter/src/lib/server/plex.ts`
- Test: `plex-issue-reporter/src/lib/server/plex.test.ts`

**Interfaces:**
- Consumes: injected `fetch`; `plexClientId`, `plexOwnerToken` from config.
- Produces:
  - `type PlexPin = { id: number; code: string }`
  - `type PlexUser = { id: number; username: string; email: string }`
  - `function createPin(clientId: string, fetchFn?: typeof fetch): Promise<PlexPin>`
  - `function buildAuthUrl(clientId: string, code: string, forwardUrl: string): string`
  - `function pollPin(pinId: number, clientId: string, fetchFn?: typeof fetch): Promise<string | null>` — returns authToken or null if not yet authorized.
  - `function getUser(authToken: string, clientId: string, fetchFn?: typeof fetch): Promise<PlexUser>`
  - `function listAllowedUserIds(ownerToken: string, fetchFn?: typeof fetch): Promise<Set<number>>` — accounts the library is shared with (friends), plus caller handles owner separately.
  - `function isWhitelisted(userId: number, allowed: Set<number>, ownerId?: number): boolean`

- [ ] **Step 1: Write the failing test**

`src/lib/server/plex.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { createPin, buildAuthUrl, pollPin, getUser, listAllowedUserIds, isWhitelisted } from './plex';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('plex auth', () => {
  it('creates a pin', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ id: 1, code: 'ABCD' }));
    const pin = await createPin('cid', fetchFn as unknown as typeof fetch);
    expect(pin).toEqual({ id: 1, code: 'ABCD' });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain('plex.tv/api/v2/pins');
    expect(init.headers['X-Plex-Client-Identifier']).toBe('cid');
  });

  it('builds the auth url with forwardUrl and code', () => {
    const url = buildAuthUrl('cid', 'ABCD', 'http://localhost:5173/auth/callback');
    expect(url).toContain('app.plex.tv/auth');
    expect(url).toContain('code=ABCD');
    expect(url).toContain(encodeURIComponent('http://localhost:5173/auth/callback'));
  });

  it('returns authToken when pin is authorized', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ id: 1, authToken: 'tok' }));
    expect(await pollPin(1, 'cid', fetchFn as unknown as typeof fetch)).toBe('tok');
  });

  it('returns null when pin not yet authorized', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ id: 1, authToken: null }));
    expect(await pollPin(1, 'cid', fetchFn as unknown as typeof fetch)).toBeNull();
  });

  it('reads the authenticated user', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ id: 42, username: 'ada', email: 'a@b.c' }));
    expect(await getUser('tok', 'cid', fetchFn as unknown as typeof fetch)).toEqual({ id: 42, username: 'ada', email: 'a@b.c' });
  });
});

describe('plex whitelist', () => {
  it('collects shared user ids', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse([{ id: 7 }, { id: 8 }]));
    const ids = await listAllowedUserIds('ot', fetchFn as unknown as typeof fetch);
    expect(ids.has(7)).toBe(true);
    expect(ids.has(8)).toBe(true);
  });

  it('allows shared users and the owner, rejects others', () => {
    const allowed = new Set([7, 8]);
    expect(isWhitelisted(7, allowed)).toBe(true);
    expect(isWhitelisted(99, allowed, 99)).toBe(true);
    expect(isWhitelisted(100, allowed, 99)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plex-issue-reporter && npx vitest run src/lib/server/plex.test.ts`
Expected: FAIL — cannot find module `./plex`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/server/plex.ts`:
```ts
const PLEX_HEADERS = (clientId: string) => ({
  Accept: 'application/json',
  'X-Plex-Product': 'Plex Issue Reporter',
  'X-Plex-Client-Identifier': clientId
});

export type PlexPin = { id: number; code: string };
export type PlexUser = { id: number; username: string; email: string };

export async function createPin(clientId: string, fetchFn: typeof fetch = fetch): Promise<PlexPin> {
  const res = await fetchFn('https://plex.tv/api/v2/pins?strong=true', {
    method: 'POST',
    headers: PLEX_HEADERS(clientId)
  });
  if (!res.ok) throw new Error(`Plex createPin failed: ${res.status}`);
  const body = (await res.json()) as { id: number; code: string };
  return { id: body.id, code: body.code };
}

export function buildAuthUrl(clientId: string, code: string, forwardUrl: string): string {
  const params = new URLSearchParams({
    clientID: clientId,
    code,
    'context[device][product]': 'Plex Issue Reporter',
    forwardUrl
  });
  return `https://app.plex.tv/auth#?${params.toString()}`;
}

export async function pollPin(pinId: number, clientId: string, fetchFn: typeof fetch = fetch): Promise<string | null> {
  const res = await fetchFn(`https://plex.tv/api/v2/pins/${pinId}`, { headers: PLEX_HEADERS(clientId) });
  if (!res.ok) throw new Error(`Plex pollPin failed: ${res.status}`);
  const body = (await res.json()) as { authToken: string | null };
  return body.authToken ?? null;
}

export async function getUser(authToken: string, clientId: string, fetchFn: typeof fetch = fetch): Promise<PlexUser> {
  const res = await fetchFn('https://plex.tv/api/v2/user', {
    headers: { ...PLEX_HEADERS(clientId), 'X-Plex-Token': authToken }
  });
  if (!res.ok) throw new Error(`Plex getUser failed: ${res.status}`);
  const body = (await res.json()) as PlexUser;
  return { id: body.id, username: body.username, email: body.email };
}

export async function listAllowedUserIds(ownerToken: string, fetchFn: typeof fetch = fetch): Promise<Set<number>> {
  const res = await fetchFn('https://plex.tv/api/v2/friends', {
    headers: { Accept: 'application/json', 'X-Plex-Token': ownerToken }
  });
  if (!res.ok) throw new Error(`Plex listAllowedUserIds failed: ${res.status}`);
  const body = (await res.json()) as Array<{ id: number }>;
  return new Set(body.map((u) => u.id));
}

export function isWhitelisted(userId: number, allowed: Set<number>, ownerId?: number): boolean {
  return allowed.has(userId) || userId === ownerId;
}
```

> **Execution note:** Plex's friends/sharing endpoints have historically shifted (`/api/v2/friends`, `/api/v2/home/users`, legacy `/api/servers/<id>/shared_servers`). If `listAllowedUserIds` returns an unexpected shape at runtime against the real account, adjust *only* the URL and JSON parsing inside this one function — the test pins the contract (`[{id}]` → `Set<number>`), which is the interface the rest of the app depends on.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plex-issue-reporter && npx vitest run src/lib/server/plex.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add plex-issue-reporter/src/lib/server/plex.ts plex-issue-reporter/src/lib/server/plex.test.ts
git commit -m "feat(issue-reporter): Plex PIN auth + whitelist client"
```

---

### Task 7: Radarr client + movie remediation

**Files:**
- Create: `plex-issue-reporter/src/lib/server/radarr.ts`
- Test: `plex-issue-reporter/src/lib/server/radarr.test.ts`

**Interfaces:**
- Consumes: injected `fetch`; `radarrUrl`, `radarrApiKey`; `decideAction`, `RemediationAction` from `remediation.ts`.
- Produces:
  - `type RadarrMovie = { id: number; title: string; year: number; monitored: boolean; hasFile: boolean; movieFileId?: number; tmdbId: number }`
  - `function createRadarrClient(cfg: { baseUrl: string; apiKey: string; fetchFn?: typeof fetch })` returning:
    - `listMovies(): Promise<RadarrMovie[]>` — monitored only.
    - `remediate(movie: RadarrMovie): Promise<RemediationAction>` — searches if missing; if `hasFile`, marks latest grabbed history failed (blocklist+regrab); falls back to deleting the file + search when no grabbed history exists.

- [ ] **Step 1: Write the failing test**

`src/lib/server/radarr.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { createRadarrClient } from './radarr';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const missing = { id: 1, title: 'Sinners', year: 2025, monitored: true, hasFile: false, tmdbId: 100 };
const bad = { id: 2, title: 'Dune', year: 2021, monitored: true, hasFile: true, movieFileId: 55, tmdbId: 200 };

describe('radarr client', () => {
  it('lists only monitored movies', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json([
      missing,
      { id: 3, title: 'Old', year: 1980, monitored: false, hasFile: true, tmdbId: 300 }
    ]));
    const client = createRadarrClient({ baseUrl: 'http://r', apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
    const movies = await client.listMovies();
    expect(movies.map((m) => m.id)).toEqual([1]);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://r/api/v3/movie');
    expect(init.headers['X-Api-Key']).toBe('k');
  });

  it('searches when the movie is missing', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({}));
    const client = createRadarrClient({ baseUrl: 'http://r', apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
    const action = await client.remediate(missing);
    expect(action).toBe('search');
    const call = fetchFn.mock.calls.find(([u]) => u === 'http://r/api/v3/command')!;
    expect(JSON.parse(call[1].body)).toEqual({ name: 'MoviesSearch', movieIds: [1] });
  });

  it('marks the latest grabbed history failed when a file exists', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.startsWith('http://r/api/v3/history/movie')) return json([{ id: 900, eventType: 'grabbed' }]);
      return json({});
    });
    const client = createRadarrClient({ baseUrl: 'http://r', apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
    const action = await client.remediate(bad);
    expect(action).toBe('blocklist-and-regrab');
    expect(fetchFn.mock.calls.some(([u, i]) => u === 'http://r/api/v3/history/failed/900' && i.method === 'POST')).toBe(true);
  });

  it('falls back to delete-file + search when a file exists but no grabbed history', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.startsWith('http://r/api/v3/history/movie')) return json([]);
      return json({});
    });
    const client = createRadarrClient({ baseUrl: 'http://r', apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
    const action = await client.remediate(bad);
    expect(action).toBe('blocklist-and-regrab');
    expect(fetchFn.mock.calls.some(([u, i]) => u === 'http://r/api/v3/moviefile/55' && i.method === 'DELETE')).toBe(true);
    expect(fetchFn.mock.calls.some(([u]) => u === 'http://r/api/v3/command')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plex-issue-reporter && npx vitest run src/lib/server/radarr.test.ts`
Expected: FAIL — cannot find module `./radarr`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/server/radarr.ts`:
```ts
import { decideAction, type RemediationAction } from './remediation';

export type RadarrMovie = {
  id: number;
  title: string;
  year: number;
  monitored: boolean;
  hasFile: boolean;
  movieFileId?: number;
  tmdbId: number;
};

type HistoryRecord = { id: number; eventType: string };

export function createRadarrClient(cfg: { baseUrl: string; apiKey: string; fetchFn?: typeof fetch }) {
  const fetchFn = cfg.fetchFn ?? fetch;
  const base = cfg.baseUrl.replace(/\/$/, '');
  const headers = { 'X-Api-Key': cfg.apiKey, 'content-type': 'application/json' };

  async function req(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetchFn(`${base}${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
    if (!res.ok) throw new Error(`Radarr ${path} failed: ${res.status}`);
    return res;
  }

  async function listMovies(): Promise<RadarrMovie[]> {
    const all = (await (await req('/api/v3/movie')).json()) as RadarrMovie[];
    return all.filter((m) => m.monitored);
  }

  async function searchMovie(movieId: number): Promise<void> {
    await req('/api/v3/command', { method: 'POST', body: JSON.stringify({ name: 'MoviesSearch', movieIds: [movieId] }) });
  }

  async function remediate(movie: RadarrMovie): Promise<RemediationAction> {
    const action = decideAction(movie);
    if (action === 'search') {
      await searchMovie(movie.id);
      return action;
    }
    const history = (await (await req(`/api/v3/history/movie?movieId=${movie.id}`)).json()) as HistoryRecord[];
    const grabbed = history.find((h) => h.eventType === 'grabbed');
    if (grabbed) {
      await req(`/api/v3/history/failed/${grabbed.id}`, { method: 'POST' });
    } else {
      if (movie.movieFileId) await req(`/api/v3/moviefile/${movie.movieFileId}`, { method: 'DELETE' });
      await searchMovie(movie.id);
    }
    return action;
  }

  return { listMovies, remediate };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plex-issue-reporter && npx vitest run src/lib/server/radarr.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add plex-issue-reporter/src/lib/server/radarr.ts plex-issue-reporter/src/lib/server/radarr.test.ts
git commit -m "feat(issue-reporter): Radarr client + movie remediation"
```

---

### Task 8: Sonarr client + episode/season remediation

**Files:**
- Create: `plex-issue-reporter/src/lib/server/sonarr.ts`
- Test: `plex-issue-reporter/src/lib/server/sonarr.test.ts`

**Interfaces:**
- Consumes: injected `fetch`; `sonarrUrl`, `sonarrApiKey`; `decideAction`, `RemediationAction`.
- Produces:
  - `type SonarrSeries = { id: number; title: string; monitored: boolean; seasons: Array<{ seasonNumber: number; monitored: boolean }> }`
  - `type SonarrEpisode = { id: number; seasonNumber: number; episodeNumber: number; title: string; monitored: boolean; hasFile: boolean; episodeFileId?: number }`
  - `function createSonarrClient(cfg: { baseUrl: string; apiKey: string; fetchFn?: typeof fetch })` returning:
    - `listSeries(): Promise<SonarrSeries[]>` — monitored only.
    - `listEpisodes(seriesId: number): Promise<SonarrEpisode[]>`
    - `remediateEpisode(ep: SonarrEpisode): Promise<RemediationAction>` — same failed-vs-search logic as Radarr, using `episodeFile`.
    - `remediateSeason(seriesId: number, seasonNumber: number): Promise<{ perEpisode: RemediationAction[] }>` — fans out per episode, then fires a single `SeasonSearch`.

- [ ] **Step 1: Write the failing test**

`src/lib/server/sonarr.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { createSonarrClient } from './sonarr';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const missingEp = { id: 10, seasonNumber: 2, episodeNumber: 2, title: 'B', monitored: true, hasFile: false };
const badEp = { id: 11, seasonNumber: 2, episodeNumber: 1, title: 'A', monitored: true, hasFile: true, episodeFileId: 77 };

describe('sonarr client', () => {
  it('lists only monitored series', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json([
      { id: 1, title: 'Severance', monitored: true, seasons: [{ seasonNumber: 2, monitored: true }] },
      { id: 2, title: 'Dead', monitored: false, seasons: [] }
    ]));
    const c = createSonarrClient({ baseUrl: 'http://s', apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
    expect((await c.listSeries()).map((s) => s.id)).toEqual([1]);
  });

  it('searches a missing episode', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({}));
    const c = createSonarrClient({ baseUrl: 'http://s', apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
    expect(await c.remediateEpisode(missingEp)).toBe('search');
    const call = fetchFn.mock.calls.find(([u]) => u === 'http://s/api/v3/command')!;
    expect(JSON.parse(call[1].body)).toEqual({ name: 'EpisodeSearch', episodeIds: [10] });
  });

  it('marks a bad episode grabbed-history failed', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.startsWith('http://s/api/v3/history')) return json([{ id: 800, eventType: 'grabbed' }]);
      return json({});
    });
    const c = createSonarrClient({ baseUrl: 'http://s', apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
    expect(await c.remediateEpisode(badEp)).toBe('blocklist-and-regrab');
    expect(fetchFn.mock.calls.some(([u, i]) => u === 'http://s/api/v3/history/failed/800' && i.method === 'POST')).toBe(true);
  });

  it('remediates a whole season then fires SeasonSearch', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.startsWith('http://s/api/v3/episode?seriesId')) return json([missingEp, badEp]);
      if (url.startsWith('http://s/api/v3/history')) return json([{ id: 801, eventType: 'grabbed' }]);
      return json({});
    });
    const c = createSonarrClient({ baseUrl: 'http://s', apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
    const result = await c.remediateSeason(1, 2);
    expect(result.perEpisode).toContain('search');
    expect(result.perEpisode).toContain('blocklist-and-regrab');
    const seasonCall = fetchFn.mock.calls.find(([u, i]) => u === 'http://s/api/v3/command' && JSON.parse(i.body).name === 'SeasonSearch')!;
    expect(JSON.parse(seasonCall[1].body)).toEqual({ name: 'SeasonSearch', seriesId: 1, seasonNumber: 2 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plex-issue-reporter && npx vitest run src/lib/server/sonarr.test.ts`
Expected: FAIL — cannot find module `./sonarr`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/server/sonarr.ts`:
```ts
import { decideAction, type RemediationAction } from './remediation';

export type SonarrSeries = {
  id: number;
  title: string;
  monitored: boolean;
  seasons: Array<{ seasonNumber: number; monitored: boolean }>;
};

export type SonarrEpisode = {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  monitored: boolean;
  hasFile: boolean;
  episodeFileId?: number;
};

type HistoryRecord = { id: number; eventType: string };

export function createSonarrClient(cfg: { baseUrl: string; apiKey: string; fetchFn?: typeof fetch }) {
  const fetchFn = cfg.fetchFn ?? fetch;
  const base = cfg.baseUrl.replace(/\/$/, '');
  const headers = { 'X-Api-Key': cfg.apiKey, 'content-type': 'application/json' };

  async function req(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetchFn(`${base}${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
    if (!res.ok) throw new Error(`Sonarr ${path} failed: ${res.status}`);
    return res;
  }

  async function listSeries(): Promise<SonarrSeries[]> {
    const all = (await (await req('/api/v3/series')).json()) as SonarrSeries[];
    return all.filter((s) => s.monitored);
  }

  async function listEpisodes(seriesId: number): Promise<SonarrEpisode[]> {
    return (await (await req(`/api/v3/episode?seriesId=${seriesId}`)).json()) as SonarrEpisode[];
  }

  async function searchEpisodes(episodeIds: number[]): Promise<void> {
    await req('/api/v3/command', { method: 'POST', body: JSON.stringify({ name: 'EpisodeSearch', episodeIds }) });
  }

  async function remediateEpisode(ep: SonarrEpisode): Promise<RemediationAction> {
    const action = decideAction(ep);
    if (action === 'search') {
      await searchEpisodes([ep.id]);
      return action;
    }
    const history = (await (await req(`/api/v3/history?episodeId=${ep.id}`)).json()) as HistoryRecord[];
    const grabbed = history.find((h) => h.eventType === 'grabbed');
    if (grabbed) {
      await req(`/api/v3/history/failed/${grabbed.id}`, { method: 'POST' });
    } else {
      if (ep.episodeFileId) await req(`/api/v3/episodefile/${ep.episodeFileId}`, { method: 'DELETE' });
      await searchEpisodes([ep.id]);
    }
    return action;
  }

  async function remediateSeason(seriesId: number, seasonNumber: number): Promise<{ perEpisode: RemediationAction[] }> {
    const episodes = (await listEpisodes(seriesId)).filter((e) => e.seasonNumber === seasonNumber && e.monitored);
    const perEpisode: RemediationAction[] = [];
    for (const ep of episodes) perEpisode.push(await remediateEpisode(ep));
    await req('/api/v3/command', { method: 'POST', body: JSON.stringify({ name: 'SeasonSearch', seriesId, seasonNumber }) });
    return { perEpisode };
  }

  return { listSeries, listEpisodes, remediateEpisode, remediateSeason };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plex-issue-reporter && npx vitest run src/lib/server/sonarr.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add plex-issue-reporter/src/lib/server/sonarr.ts plex-issue-reporter/src/lib/server/sonarr.test.ts
git commit -m "feat(issue-reporter): Sonarr client + episode/season remediation"
```

---

### Task 9: Auth guard + Plex login routes

**Files:**
- Create: `plex-issue-reporter/src/hooks.server.ts`
- Create: `plex-issue-reporter/src/routes/login/+page.svelte`
- Create: `plex-issue-reporter/src/routes/login/+page.server.ts`
- Create: `plex-issue-reporter/src/routes/auth/plex/+server.ts`
- Create: `plex-issue-reporter/src/routes/auth/callback/+server.ts`
- Create: `plex-issue-reporter/src/routes/logout/+server.ts`
- Create: `plex-issue-reporter/src/routes/denied/+page.svelte`
- Test: `plex-issue-reporter/src/hooks.server.test.ts`

**Interfaces:**
- Consumes: `loadConfig`, `verifySession`/`signSession`/`SESSION_COOKIE`/`SESSION_TTL_SECONDS`, all `plex.ts` functions.
- Produces: `handle` hook that populates `event.locals.user` and guards non-public routes. Public paths: `/login`, `/auth/*`, `/denied`, `/healthz`.
- Auth flow state: the pending `pinId` is stored in a short-lived `pir_pin` cookie between `/auth/plex` and `/auth/callback`.

- [ ] **Step 1: Write the failing test for the guard's public-path logic**

`src/hooks.server.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isPublicPath } from './hooks.server';

describe('isPublicPath', () => {
  it('allows auth, login, denied, health', () => {
    for (const p of ['/login', '/auth/plex', '/auth/callback', '/denied', '/healthz']) {
      expect(isPublicPath(p)).toBe(true);
    }
  });
  it('guards everything else', () => {
    expect(isPublicPath('/')).toBe(false);
    expect(isPublicPath('/shows/5')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plex-issue-reporter && npx vitest run src/hooks.server.test.ts`
Expected: FAIL — `isPublicPath` not exported.

- [ ] **Step 3: Implement the hook**

`src/hooks.server.ts`:
```ts
import { redirect, type Handle } from '@sveltejs/kit';
import { loadConfig } from '$lib/server/config';
import { SESSION_COOKIE, verifySession } from '$lib/server/session';

const PUBLIC_PREFIXES = ['/login', '/auth', '/denied', '/healthz'];

export function isPublicPath(path: string): boolean {
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));
}

export const handle: Handle = async ({ event, resolve }) => {
  const cfg = loadConfig();
  const token = event.cookies.get(SESSION_COOKIE);
  event.locals.user = token ? verifySession(token, cfg.sessionSecret) : null;

  if (!event.locals.user && !isPublicPath(event.url.pathname)) {
    throw redirect(302, '/login');
  }
  return resolve(event);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plex-issue-reporter && npx vitest run src/hooks.server.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement the login page + start route**

`src/routes/login/+page.server.ts`:
```ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) throw redirect(302, '/');
  return {};
};
```

`src/routes/login/+page.svelte`:
```svelte
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
```

`src/routes/auth/plex/+server.ts`:
```ts
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadConfig } from '$lib/server/config';
import { createPin, buildAuthUrl } from '$lib/server/plex';

export const GET: RequestHandler = async ({ cookies }) => {
  const cfg = loadConfig();
  const pin = await createPin(cfg.plexClientId);
  cookies.set('pir_pin', String(pin.id), { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600 });
  throw redirect(302, buildAuthUrl(cfg.plexClientId, pin.code, `${cfg.publicAppUrl}/auth/callback`));
};
```

- [ ] **Step 6: Implement the callback + logout + denied page**

`src/routes/auth/callback/+server.ts`:
```ts
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadConfig } from '$lib/server/config';
import { pollPin, getUser, listAllowedUserIds, isWhitelisted } from '$lib/server/plex';
import { signSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from '$lib/server/session';

export const GET: RequestHandler = async ({ cookies }) => {
  const cfg = loadConfig();
  const pinId = Number(cookies.get('pir_pin'));
  if (!pinId) throw redirect(302, '/login');

  const authToken = await pollPin(pinId, cfg.plexClientId);
  if (!authToken) throw redirect(302, '/login');

  const user = await getUser(authToken, cfg.plexClientId);
  const allowed = await listAllowedUserIds(cfg.plexOwnerToken);
  if (!isWhitelisted(user.id, allowed)) throw redirect(302, '/denied');

  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = signSession({ plexUserId: user.id, username: user.username, exp }, cfg.sessionSecret);
  cookies.set(SESSION_COOKIE, token, { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: SESSION_TTL_SECONDS });
  cookies.delete('pir_pin', { path: '/' });
  throw redirect(302, '/');
};
```

`src/routes/logout/+server.ts`:
```ts
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SESSION_COOKIE } from '$lib/server/session';

export const POST: RequestHandler = async ({ cookies }) => {
  cookies.delete(SESSION_COOKIE, { path: '/' });
  throw redirect(302, '/login');
};
```

`src/routes/denied/+page.svelte`:
```svelte
<main class="min-h-screen flex items-center justify-center p-6">
  <div class="bg-nb-pink border-2 border-black shadow-nb-lg p-10 max-w-md text-center">
    <h1 class="text-2xl mb-3">NO ACCESS</h1>
    <p class="font-bold">Your Plex account doesn't have access to this library, so you can't report issues here.</p>
    <a href="/login" class="inline-block mt-6 bg-white border-2 border-black shadow-nb px-4 py-2 font-black">← BACK</a>
  </div>
</main>
```

- [ ] **Step 7: Verify the whitelist check and build**

Run: `cd plex-issue-reporter && npm run test && npm run check`
Expected: all tests pass; `svelte-check` 0 errors. (Full OAuth round-trip is verified manually in the final verification section — it needs live Plex.)

- [ ] **Step 8: Commit**

```bash
git add plex-issue-reporter/src/hooks.server.ts plex-issue-reporter/src/hooks.server.test.ts plex-issue-reporter/src/routes/login plex-issue-reporter/src/routes/auth plex-issue-reporter/src/routes/logout plex-issue-reporter/src/routes/denied
git commit -m "feat(issue-reporter): Plex login flow + route auth guard"
```

---

### Task 10: Shared neobrutalist UI components

**Files:**
- Create: `plex-issue-reporter/src/lib/components/NbButton.svelte`
- Create: `plex-issue-reporter/src/lib/components/NbCard.svelte`
- Create: `plex-issue-reporter/src/lib/components/ReportModal.svelte`
- Create: `plex-issue-reporter/src/lib/components/Toast.svelte`

**Interfaces:**
- Consumes: `bits-ui` (`Dialog`), Svelte 5 runes/props.
- Produces:
  - `NbButton` — props `{ variant?: 'yellow'|'pink'|'white', type?, href?, onclick? }`, slotted label.
  - `NbCard` — bordered/shadowed container, slotted content.
  - `ReportModal` — props `{ open: boolean, mediaLabel: string, action: 'submit', onSubmit: (note: string) => void, onClose: () => void }`; a Bits UI `Dialog` with an optional note textarea + Cancel/Submit.
  - `Toast` — props `{ message: string }`; green success card.

- [ ] **Step 1: Implement `NbButton.svelte`**

```svelte
<script lang="ts">
  let { variant = 'pink', type = 'button', href = undefined, onclick = undefined, children } = $props();
  const bg = { yellow: 'bg-nb-yellow', pink: 'bg-nb-pink', white: 'bg-white' }[variant];
  const cls = `inline-block ${bg} border-2 border-black shadow-nb-sm px-4 py-2 font-black text-sm hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all`;
</script>

{#if href}
  <a {href} class={cls}>{@render children()}</a>
{:else}
  <button {type} {onclick} class={cls}>{@render children()}</button>
{/if}
```

- [ ] **Step 2: Implement `NbCard.svelte`**

```svelte
<script lang="ts">
  let { children } = $props();
</script>

<div class="bg-white border-2 border-black shadow-nb p-4">{@render children()}</div>
```

- [ ] **Step 3: Implement `ReportModal.svelte`**

```svelte
<script lang="ts">
  import { Dialog } from 'bits-ui';
  let { open = false, mediaLabel = '', onSubmit, onClose } = $props();
  let note = $state('');

  function submit() {
    onSubmit(note);
    note = '';
  }
</script>

<Dialog.Root bind:open onOpenChange={(v) => { if (!v) onClose(); }}>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 bg-black/40" />
    <Dialog.Content class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,26rem)] bg-nb-cyan border-2 border-black shadow-nb-lg p-5">
      <Dialog.Title class="text-lg font-black mb-3">REPORT ISSUE</Dialog.Title>
      <div class="bg-white border-2 border-black p-2 mb-3 font-black">{mediaLabel}</div>
      <label class="block text-xs font-black uppercase mb-1" for="note">Add a note (optional)</label>
      <textarea id="note" bind:value={note} rows="3"
        class="w-full bg-white border-2 border-black p-2 font-bold text-sm mb-4"></textarea>
      <div class="flex gap-3">
        <Dialog.Close class="flex-1 bg-white border-2 border-black shadow-nb-sm py-2 font-black">CANCEL</Dialog.Close>
        <button onclick={submit} class="flex-1 bg-nb-pink border-2 border-black shadow-nb-sm py-2 font-black">SUBMIT</button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

- [ ] **Step 4: Implement `Toast.svelte`**

```svelte
<script lang="ts">
  let { message = '' } = $props();
</script>

{#if message}
  <div class="fixed bottom-4 left-1/2 -translate-x-1/2 bg-nb-green border-2 border-black shadow-nb-lg p-3 max-w-md">
    <div class="font-black">✓ REPORTED!</div>
    <div class="text-sm font-bold">{message}</div>
  </div>
{/if}
```

- [ ] **Step 5: Verify it type-checks**

Run: `cd plex-issue-reporter && npm run check`
Expected: 0 errors (Bits UI `Dialog` resolves; components compile).

- [ ] **Step 6: Commit**

```bash
git add plex-issue-reporter/src/lib/components
git commit -m "feat(issue-reporter): neobrutalist UI components (button, card, report modal, toast)"
```

---

### Task 11: Browse page (movies + shows) with report action

**Files:**
- Create: `plex-issue-reporter/src/lib/server/media.ts`
- Create: `plex-issue-reporter/src/routes/+page.server.ts`
- Create: `plex-issue-reporter/src/routes/+page.svelte`
- Test: `plex-issue-reporter/src/lib/server/media.test.ts`

**Interfaces:**
- Consumes: `loadConfig`, `createRadarrClient`, `createSonarrClient`, `notifyDiscord`, `actionLabel`, UI components.
- Produces:
  - `src/lib/server/media.ts` — cached client accessors + a `reportMovie`/`reportSeries` orchestration used by both the browse page and the show page:
    - `function getClients()` — builds Radarr/Sonarr clients from `loadConfig()` (memoized module-level, 30s list cache handled by callers).
    - `async function reportMovieIssue(movieId: number, username: string, note: string): Promise<string>` — looks up the movie, remediates, notifies Discord, returns the confirmation label.
    - `async function reportEpisodeIssue(seriesId: number, episodeId: number, username: string, note: string): Promise<string>`
    - `async function reportSeasonIssue(seriesId: number, seasonNumber: number, username: string, note: string): Promise<string>`
  - Browse page `load` returns `{ movies, series }`. A default form action `?/report` handles movie reports.

- [ ] **Step 1: Write the failing test for the media orchestration (movie path)**

`src/lib/server/media.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { makeMovieReporter } from './media';

describe('makeMovieReporter', () => {
  it('remediates then notifies discord and returns the label', async () => {
    const radarr = {
      listMovies: vi.fn().mockResolvedValue([{ id: 1, title: 'Dune', year: 2021, monitored: true, hasFile: true, movieFileId: 5, tmdbId: 1 }]),
      remediate: vi.fn().mockResolvedValue('blocklist-and-regrab')
    };
    const notify = vi.fn().mockResolvedValue(undefined);
    const report = makeMovieReporter(radarr as never, 'http://webhook', notify);
    const label = await report(1, 'ada', 'bad audio');
    expect(radarr.remediate).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('http://webhook', expect.objectContaining({
      username: 'ada', mediaLabel: 'Dune (2021)', note: 'bad audio', action: 'blocklist-and-regrab'
    }));
    expect(label).toMatch(/blocklist|re-?grab/i);
  });

  it('throws when the movie id is unknown', async () => {
    const radarr = { listMovies: vi.fn().mockResolvedValue([]), remediate: vi.fn() };
    const report = makeMovieReporter(radarr as never, 'http://webhook', vi.fn());
    await expect(report(999, 'ada', '')).rejects.toThrow(/not found/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plex-issue-reporter && npx vitest run src/lib/server/media.test.ts`
Expected: FAIL — cannot find module `./media`.

- [ ] **Step 3: Implement `media.ts`**

`src/lib/server/media.ts`:
```ts
import { loadConfig } from './config';
import { createRadarrClient, type RadarrMovie } from './radarr';
import { createSonarrClient, type SonarrEpisode } from './sonarr';
import { notifyDiscord, type ReportSummary } from './discord';
import { actionLabel, type RemediationAction } from './remediation';

type RadarrLike = { listMovies: () => Promise<RadarrMovie[]>; remediate: (m: RadarrMovie) => Promise<RemediationAction> };
type NotifyFn = (url: string, r: ReportSummary) => Promise<void>;

export function makeMovieReporter(radarr: RadarrLike, webhookUrl: string, notify: NotifyFn = notifyDiscord) {
  return async function reportMovie(movieId: number, username: string, note: string): Promise<string> {
    const movie = (await radarr.listMovies()).find((m) => m.id === movieId);
    if (!movie) throw new Error(`Movie ${movieId} not found`);
    const action = await radarr.remediate(movie);
    await notify(webhookUrl, { username, mediaLabel: `${movie.title} (${movie.year})`, note, action });
    return actionLabel(action);
  };
}

export function getClients() {
  const cfg = loadConfig();
  return {
    cfg,
    radarr: createRadarrClient({ baseUrl: cfg.radarrUrl, apiKey: cfg.radarrApiKey }),
    sonarr: createSonarrClient({ baseUrl: cfg.sonarrUrl, apiKey: cfg.sonarrApiKey })
  };
}

export async function reportMovieIssue(movieId: number, username: string, note: string): Promise<string> {
  const { cfg, radarr } = getClients();
  return makeMovieReporter(radarr, cfg.discordWebhookUrl)(movieId, username, note);
}

export async function reportEpisodeIssue(seriesId: number, episodeId: number, username: string, note: string): Promise<string> {
  const { cfg, sonarr } = getClients();
  const episodes = await sonarr.listEpisodes(seriesId);
  const ep = episodes.find((e: SonarrEpisode) => e.id === episodeId);
  if (!ep) throw new Error(`Episode ${episodeId} not found`);
  const series = (await sonarr.listSeries()).find((s) => s.id === seriesId);
  const action = await sonarr.remediateEpisode(ep);
  await notifyDiscord(cfg.discordWebhookUrl, {
    username,
    mediaLabel: `${series?.title ?? 'Show'} · S${ep.seasonNumber}E${ep.episodeNumber}`,
    note,
    action
  });
  return actionLabel(action);
}

export async function reportSeasonIssue(seriesId: number, seasonNumber: number, username: string, note: string): Promise<string> {
  const { cfg, sonarr } = getClients();
  const series = (await sonarr.listSeries()).find((s) => s.id === seriesId);
  const { perEpisode } = await sonarr.remediateSeason(seriesId, seasonNumber);
  const anyRegrab = perEpisode.includes('blocklist-and-regrab');
  const action: RemediationAction = anyRegrab ? 'blocklist-and-regrab' : 'search';
  await notifyDiscord(cfg.discordWebhookUrl, {
    username,
    mediaLabel: `${series?.title ?? 'Show'} · S${seasonNumber} (full season)`,
    note,
    action
  });
  return actionLabel(action);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plex-issue-reporter && npx vitest run src/lib/server/media.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement the browse page load + report action**

`src/routes/+page.server.ts`:
```ts
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getClients, reportMovieIssue } from '$lib/server/media';

export const load: PageServerLoad = async () => {
  const { radarr, sonarr } = getClients();
  const [movies, series] = await Promise.all([radarr.listMovies(), sonarr.listSeries()]);
  return {
    movies: movies.map((m) => ({ id: m.id, title: m.title, year: m.year })),
    series: series.map((s) => ({ id: s.id, title: s.title }))
  };
};

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

`src/routes/+page.svelte`:
```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import { Film, Tv, Search } from 'lucide-svelte';
  import NbButton from '$lib/components/NbButton.svelte';
  import ReportModal from '$lib/components/ReportModal.svelte';
  import Toast from '$lib/components/Toast.svelte';

  let { data, form } = $props();
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
  function doSubmit(note: string) { noteValue = note; modalOpen = false; submitForm?.requestSubmit(); }
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
```

- [ ] **Step 6: Verify build + type-check**

Run: `cd plex-issue-reporter && npm run test && npm run check`
Expected: all tests pass; `svelte-check` 0 errors.

- [ ] **Step 7: Commit**

```bash
git add plex-issue-reporter/src/lib/server/media.ts plex-issue-reporter/src/lib/server/media.test.ts plex-issue-reporter/src/routes/+page.server.ts plex-issue-reporter/src/routes/+page.svelte
git commit -m "feat(issue-reporter): browse page (movies/shows) with movie report action"
```

---

### Task 12: Show drill-down page (season/episode reports)

**Files:**
- Create: `plex-issue-reporter/src/routes/shows/[id]/+page.server.ts`
- Create: `plex-issue-reporter/src/routes/shows/[id]/+page.svelte`

**Interfaces:**
- Consumes: `getClients`, `reportEpisodeIssue`, `reportSeasonIssue`, UI components.
- Produces: `load` returns `{ series: { id, title }, seasons: Array<{ seasonNumber, episodes: Array<{ id, episodeNumber, title }> }> }`; form actions `?/reportEpisode` and `?/reportSeason`.

- [ ] **Step 1: Implement the load + actions**

`src/routes/shows/[id]/+page.server.ts`:
```ts
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getClients, reportEpisodeIssue, reportSeasonIssue } from '$lib/server/media';

export const load: PageServerLoad = async ({ params }) => {
  const seriesId = Number(params.id);
  const { sonarr } = getClients();
  const series = (await sonarr.listSeries()).find((s) => s.id === seriesId);
  if (!series) throw error(404, 'Show not found');
  const episodes = await sonarr.listEpisodes(seriesId);
  const bySeason = new Map<number, Array<{ id: number; episodeNumber: number; title: string }>>();
  for (const e of episodes) {
    if (!bySeason.has(e.seasonNumber)) bySeason.set(e.seasonNumber, []);
    bySeason.get(e.seasonNumber)!.push({ id: e.id, episodeNumber: e.episodeNumber, title: e.title });
  }
  const seasons = [...bySeason.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([seasonNumber, eps]) => ({ seasonNumber, episodes: eps.sort((a, b) => a.episodeNumber - b.episodeNumber) }));
  return { series: { id: series.id, title: series.title }, seasons };
};

export const actions: Actions = {
  reportEpisode: async ({ request, params, locals }) => {
    if (!locals.user) return fail(401, { error: 'Not signed in' });
    const data = await request.formData();
    try {
      const message = await reportEpisodeIssue(Number(params.id), Number(data.get('episodeId')), locals.user.username, String(data.get('note') ?? ''));
      return { success: true, message };
    } catch (err) {
      console.error('[report episode]', err);
      return fail(502, { error: "Couldn't reach the media service. Try again later." });
    }
  },
  reportSeason: async ({ request, params, locals }) => {
    if (!locals.user) return fail(401, { error: 'Not signed in' });
    const data = await request.formData();
    try {
      const message = await reportSeasonIssue(Number(params.id), Number(data.get('seasonNumber')), locals.user.username, String(data.get('note') ?? ''));
      return { success: true, message };
    } catch (err) {
      console.error('[report season]', err);
      return fail(502, { error: "Couldn't reach the media service. Try again later." });
    }
  }
};
```

- [ ] **Step 2: Implement the drill-down UI**

`src/routes/shows/[id]/+page.svelte`:
```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import NbButton from '$lib/components/NbButton.svelte';
  import ReportModal from '$lib/components/ReportModal.svelte';
  import Toast from '$lib/components/Toast.svelte';

  let { data, form } = $props();
  let modalOpen = $state(false);
  let target = $state<{ kind: 'episode' | 'season'; id: number; label: string } | null>(null);
  let toast = $state('');
  let noteValue = $state('');
  let epForm = $state<HTMLFormElement>();
  let seasonForm = $state<HTMLFormElement>();
  let epId = $state<number>(0);
  let seasonNo = $state<number>(0);

  $effect(() => { if (form?.success) { toast = form.message; setTimeout(() => (toast = ''), 5000); } });

  function reportEpisode(id: number, label: string) { target = { kind: 'episode', id, label }; modalOpen = true; }
  function reportSeason(seasonNumber: number, label: string) { target = { kind: 'season', id: seasonNumber, label }; modalOpen = true; }
  function doSubmit(note: string) {
    noteValue = note; modalOpen = false;
    if (target?.kind === 'episode') { epId = target.id; epForm?.requestSubmit(); }
    else if (target?.kind === 'season') { seasonNo = target.id; seasonForm?.requestSubmit(); }
  }
</script>

<main class="max-w-2xl mx-auto p-4">
  <header class="flex justify-between items-center bg-black text-white px-3 py-2 mb-4">
    <a href="/" class="font-black">◀ {data.series.title}</a>
  </header>

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
```

- [ ] **Step 3: Verify build + type-check**

Run: `cd plex-issue-reporter && npm run test && npm run check`
Expected: all tests pass; `svelte-check` 0 errors.

- [ ] **Step 4: Commit**

```bash
git add plex-issue-reporter/src/routes/shows
git commit -m "feat(issue-reporter): show drill-down with episode/season reporting"
```

---

### Task 13: Dockerfile, build script, health verification

**Files:**
- Create: `plex-issue-reporter/Dockerfile`
- Create: `plex-issue-reporter/.dockerignore`
- Create: `plex-issue-reporter/build.sh`

**Interfaces:**
- Consumes: the built app (`npm run build` → `build/`).
- Produces: image `tseruga/plex-issue-reporter:local`, listening on `3000`, `/healthz` returns 200.

- [ ] **Step 1: Create the Dockerfile**

`plex-issue-reporter/Dockerfile`:
```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# Production stage
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
USER node
EXPOSE 3000
CMD ["node", "build"]
```

- [ ] **Step 2: Create `.dockerignore`**

```
node_modules
.svelte-kit
build
.git
.env
.env.*
!.env.example
```

- [ ] **Step 3: Create `build.sh`**

`plex-issue-reporter/build.sh`:
```bash
#!/bin/bash
set -e
IMAGE_NAME="tseruga/plex-issue-reporter"
IMAGE_TAG="${1:-local}"
FULL="${IMAGE_NAME}:${IMAGE_TAG}"

echo "Building ${FULL}"
docker build -t "${FULL}" .
echo "✅ Built ${FULL}"
echo "Test run: docker run --rm -p 3000:3000 --env-file .env ${FULL}"
echo "Then check: curl -s http://localhost:3000/healthz"
echo "Push:       docker push ${FULL}"
```

- [ ] **Step 4: Build the image and verify health**

Run:
```bash
cd plex-issue-reporter && chmod +x build.sh && ./build.sh local
docker run --rm -d -p 3000:3000 --env-file .env --name pir-test tseruga/plex-issue-reporter:local
sleep 3 && curl -s http://localhost:3000/healthz ; echo
docker stop pir-test
```
Expected: build succeeds; `curl` prints `healthy`. (Requires a populated `.env`; if secrets aren't handy, at minimum confirm the container starts and `/healthz` responds — the health route doesn't need valid upstream creds.)

- [ ] **Step 5: Commit**

```bash
git add plex-issue-reporter/Dockerfile plex-issue-reporter/.dockerignore plex-issue-reporter/build.sh
git commit -m "feat(issue-reporter): Dockerfile (adapter-node, port 3000) + build script"
```

---

### Task 14: Helm chart

**Files:**
- Create: `charts/plex-issue-reporter/Chart.yaml`
- Create: `charts/plex-issue-reporter/values.yaml`
- Create: `charts/plex-issue-reporter/templates/_helpers.tpl`
- Create: `charts/plex-issue-reporter/templates/deployment.yaml`
- Create: `charts/plex-issue-reporter/templates/service.yaml`
- Create: `charts/plex-issue-reporter/templates/ingress.yaml`
- Create: `charts/plex-issue-reporter/.helmignore`

**Interfaces:**
- Consumes: the pushed image; a pre-created k8s Secret (`envFrom`).
- Produces: a chart that renders a Deployment (envFrom the Secret + plaintext `PUBLIC_APP_URL`), ClusterIP Service on 3000, and a public TLS ingress. Mirrors `charts/plex-movie-randomizer` conventions.

- [ ] **Step 1: Create `Chart.yaml` + `.helmignore`**

`charts/plex-issue-reporter/Chart.yaml`:
```yaml
apiVersion: v2
name: plex-issue-reporter
description: Plex-authenticated media issue reporter (Radarr/Sonarr remediation)
type: application
version: 0.1.0
appVersion: "0.1.0"
```

`.helmignore` (standard boilerplate):
```
.DS_Store
.git/
*.tmproj
.vscode/
```

- [ ] **Step 2: Create `values.yaml`**

```yaml
namespace: media

app:
  name: plex-issue-reporter
  image:
    repository: tseruga/plex-issue-reporter
    tag: latest
    pullPolicy: Always
  replicas: 1
  containerPort: 3000
  # Name of a pre-created (out-of-band) Secret holding all sensitive env vars.
  secretName: plex-issue-reporter-secrets
  # Non-sensitive env injected as plaintext.
  env:
    PUBLIC_APP_URL: https://issues.tseruga.com
  service:
    type: ClusterIP
    port: 80
  ingress:
    enabled: true
    host: issues.tseruga.com
    annotations:
      kubernetes.io/ingress.class: nginx
      cert-manager.io/cluster-issuer: "letsencrypt-prod"
  resources:
    limits: { cpu: 300m, memory: 256Mi }
    requests: { cpu: 100m, memory: 128Mi }
  healthCheck:
    path: /healthz
    initialDelaySeconds: 15
    periodSeconds: 10
    timeoutSeconds: 5
    failureThreshold: 3
```

- [ ] **Step 3: Create `_helpers.tpl`**

`charts/plex-issue-reporter/templates/_helpers.tpl`:
```
{{- define "plex-issue-reporter.name" -}}
{{ .Values.app.name }}
{{- end -}}
```

- [ ] **Step 4: Create `deployment.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Values.app.name }}
  namespace: {{ .Values.namespace }}
spec:
  replicas: {{ .Values.app.replicas }}
  selector:
    matchLabels:
      app: {{ .Values.app.name }}
  template:
    metadata:
      labels:
        app: {{ .Values.app.name }}
    spec:
      containers:
        - name: {{ .Values.app.name }}
          image: "{{ .Values.app.image.repository }}:{{ .Values.app.image.tag }}"
          imagePullPolicy: {{ .Values.app.image.pullPolicy }}
          ports:
            - name: http
              containerPort: {{ .Values.app.containerPort }}
          envFrom:
            - secretRef:
                name: {{ .Values.app.secretName }}
          env:
            {{- range $k, $v := .Values.app.env }}
            - name: {{ $k }}
              value: {{ $v | quote }}
            {{- end }}
          livenessProbe:
            httpGet:
              path: {{ .Values.app.healthCheck.path }}
              port: http
            initialDelaySeconds: {{ .Values.app.healthCheck.initialDelaySeconds }}
            periodSeconds: {{ .Values.app.healthCheck.periodSeconds }}
            timeoutSeconds: {{ .Values.app.healthCheck.timeoutSeconds }}
            failureThreshold: {{ .Values.app.healthCheck.failureThreshold }}
          readinessProbe:
            httpGet:
              path: {{ .Values.app.healthCheck.path }}
              port: http
            initialDelaySeconds: {{ .Values.app.healthCheck.initialDelaySeconds }}
            periodSeconds: {{ .Values.app.healthCheck.periodSeconds }}
            timeoutSeconds: {{ .Values.app.healthCheck.timeoutSeconds }}
            failureThreshold: {{ .Values.app.healthCheck.failureThreshold }}
          resources:
            {{- toYaml .Values.app.resources | nindent 12 }}
```

- [ ] **Step 5: Create `service.yaml`**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ .Values.app.name }}
  namespace: {{ .Values.namespace }}
spec:
  selector:
    app: {{ .Values.app.name }}
  ports:
    - port: {{ .Values.app.service.port }}
      targetPort: http
  type: {{ .Values.app.service.type }}
```

- [ ] **Step 6: Create `ingress.yaml`**

```yaml
{{- if .Values.app.ingress.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ .Values.app.name }}-ingress
  namespace: {{ .Values.namespace }}
  annotations:
    {{- toYaml .Values.app.ingress.annotations | nindent 4 }}
spec:
  tls:
    - hosts:
        - {{ .Values.app.ingress.host }}
      secretName: {{ .Values.app.name }}-tls
  rules:
    - host: {{ .Values.app.ingress.host }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: {{ .Values.app.name }}
                port:
                  number: {{ .Values.app.service.port }}
{{- end }}
```

- [ ] **Step 7: Lint/template the chart**

Run: `helm template plex-issue-reporter charts/plex-issue-reporter | head -60`
Expected: renders Deployment/Service/Ingress with `containerPort: 3000`, `envFrom` the secret, and the TLS ingress — no template errors.

- [ ] **Step 8: Commit**

```bash
git add charts/plex-issue-reporter
git commit -m "feat(issue-reporter): helm chart (deployment/service/ingress)"
```

---

### Task 15: HelmRelease + deployment README

**Files:**
- Create: `clusters/home-server/media/plex-issue-reporter-hr.yaml`
- Create: `plex-issue-reporter/DEPLOYMENT.md`

**Interfaces:**
- Consumes: the local chart via the `github-repo` GitRepository; the pre-created Secret.
- Produces: a Flux-reconciled HelmRelease. Documented manual steps: create the Secret, build/push the image, bump the tag.

- [ ] **Step 1: Create the HelmRelease**

`clusters/home-server/media/plex-issue-reporter-hr.yaml`:
```yaml
apiVersion: helm.toolkit.fluxcd.io/v2beta1
kind: HelmRelease
metadata:
  name: plex-issue-reporter
  namespace: media
spec:
  releaseName: plex-issue-reporter
  interval: 5m
  chart:
    spec:
      chart: ./charts/plex-issue-reporter
      sourceRef:
        kind: GitRepository
        name: github-repo
        namespace: flux-system
      interval: 1m
  values:
    namespace: media
    app:
      name: plex-issue-reporter
      image:
        repository: tseruga/plex-issue-reporter
        tag: latest
        pullPolicy: Always
      containerPort: 3000
      secretName: plex-issue-reporter-secrets
      env:
        PUBLIC_APP_URL: https://issues.tseruga.com
      service:
        type: ClusterIP
        port: 80
      ingress:
        enabled: true
        host: issues.tseruga.com
        annotations:
          kubernetes.io/ingress.class: nginx
          cert-manager.io/cluster-issuer: "letsencrypt-prod"
```

- [ ] **Step 2: Write `DEPLOYMENT.md`**

`plex-issue-reporter/DEPLOYMENT.md`:
````markdown
# Deploying plex-issue-reporter

No CI — build/push manually, then commit for Flux to reconcile.

## 1. Create the secret (once, out-of-band — never committed)

```bash
kubectl create secret generic plex-issue-reporter-secrets -n media \
  --from-literal=RADARR_URL=http://192.168.1.211 \
  --from-literal=RADARR_API_KEY=... \
  --from-literal=SONARR_URL=http://192.168.1.207 \
  --from-literal=SONARR_API_KEY=... \
  --from-literal=PLEX_OWNER_TOKEN=... \
  --from-literal=PLEX_MACHINE_IDENTIFIER=... \
  --from-literal=PLEX_CLIENT_ID=plex-issue-reporter \
  --from-literal=DISCORD_WEBHOOK_URL=... \
  --from-literal=SESSION_SECRET="$(openssl rand -hex 32)"
```
(`PUBLIC_APP_URL` is injected as plaintext via the HelmRelease, not the secret.)

## 2. Build & push the image

```bash
cd plex-issue-reporter
./build.sh v0.1.0
docker push tseruga/plex-issue-reporter:v0.1.0
```

## 3. Point the release at the tag

Edit `clusters/home-server/media/plex-issue-reporter-hr.yaml` → `app.image.tag: v0.1.0`,
commit, and push to `main`. Flux reconciles within ~5 min.

## 4. DNS

Point `issues.tseruga.com` at the ingress (same as `overseerr.tseruga.com`).
cert-manager provisions the `plex-issue-reporter-tls` cert automatically.
````

- [ ] **Step 3: Verify the HelmRelease references resolve**

Run: `helm template plex-issue-reporter charts/plex-issue-reporter --set app.image.tag=v0.1.0 >/dev/null && echo OK`
Expected: `OK` (chart renders with an overridden tag, mirroring how the HR overrides values).

- [ ] **Step 4: Commit**

```bash
git add clusters/home-server/media/plex-issue-reporter-hr.yaml plex-issue-reporter/DEPLOYMENT.md
git commit -m "feat(issue-reporter): HelmRelease + deployment docs"
```

---

## End-to-end verification

After all tasks, verify the whole system:

1. **Unit/integration suite:** `cd plex-issue-reporter && npm run test` → all green (config, remediation, session, discord, plex, radarr, sonarr, media, hooks).
2. **Type check:** `npm run check` → 0 errors.
3. **Local run with real creds:** populate `plex-issue-reporter/.env` from `.env.example` (real Radarr/Sonarr keys + Plex owner token + a Discord webhook), `npm run dev`, open `http://localhost:5173`:
   - Sign in with Plex → returns to `/`. A non-shared Plex account lands on `/denied`.
   - Browse tab shows monitored movies/shows; search filters live.
   - Report a **missing** movie → Radarr shows a new search; Discord posts "Searching (missing)".
   - Report a movie **with a bad file** → Radarr blocklists + re-grabs; Discord posts "Blocklisted + re-grabbing".
   - Drill into a show → season → report an episode and a whole season; verify Sonarr activity + Discord posts.
4. **Container smoke test:** `./build.sh local` then `docker run --rm -p 3000:3000 --env-file .env tseruga/plex-issue-reporter:local`, `curl http://localhost:3000/healthz` → `healthy`.
5. **Chart render:** `helm template plex-issue-reporter charts/plex-issue-reporter` → valid manifests, port 3000, envFrom secret, TLS ingress on `issues.tseruga.com`.
6. **Cluster deploy:** follow `DEPLOYMENT.md` (create secret → push image → bump tag → commit). Confirm Flux reconciles (`flux get helmrelease -n media plex-issue-reporter`), the pod is Ready, and `https://issues.tseruga.com` serves the login page with a valid cert.
