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
