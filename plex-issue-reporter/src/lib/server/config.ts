export type AppConfig = {
  radarrUrl: string;
  radarrApiKey: string;
  sonarrUrl: string;
  sonarrApiKey: string;
  plexOwnerToken: string;
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
