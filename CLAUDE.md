# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A personal home Kubernetes cluster managed via **Flux CD** (GitOps). Changes pushed to `main` are automatically reconciled by Flux every 1-5 minutes. The repo contains:
- Helm chart definitions (custom + wrappers) in `charts/`
- Cluster state declarations in `clusters/home-server/` (one subdirectory per namespace)
- Infrastructure primitives (PVs/PVCs) in `infra/`
- Two custom applications with source code: `plex-movie-randomizer/` and `plex-watchlist-profile-updater/`

## Deployment Model

**No manual `kubectl apply` is needed.** Merging to `main` triggers Flux to apply changes. HelmRelease files follow the naming convention `*-hr.yaml`.

To manually force reconciliation:
```bash
flux reconcile source git flux-system
flux reconcile kustomization flux-system
```

## plex-movie-randomizer (SvelteKit App)

```bash
cd plex-movie-randomizer
npm install
npm run dev          # Dev server with HMR
npm run build        # Static site → build/
npm run check        # Type-check with svelte-check
./build.sh           # Build Docker image and run test on localhost:8080
```

Deployed as a static site (SvelteKit adapter-static) served by nginx. No backend — all Plex API calls are client-side.

## Architecture

### Namespaces & Services

| Namespace | Key Services |
|-----------|-------------|
| `media` | Plex (192.168.1.210), Radarr, Sonarr, Jellyfin, Jackett, Deluge, Bazarr, Overseerr, Grocy, Mealie, Tautulli, ErsatzTV (192.168.1.223), plex-meta-manager, plex-movie-randomizer |
| `ai` | AnythingLLM (192.168.1.217) |
| `downloads` | qBittorrent |
| `networking` | ingress-nginx, cert-manager (Let's Encrypt), CNPG |
| `assetto` | Assetto Server Manager |
| `factorio` | Factorio server |
| `pihole` | Pi-hole DNS |
| `vpn` | pod-gateway |
| `vote` | ranked-choice-vote |

### Storage

Static PVs in `infra/` mount NAS paths from the host node:
- Movies: `/mnt/nas/Data/Movies` (1000Gi)
- TV: `/mnt/nas/Data/TV Shows`
- Downloads: `/mnt/nas/Downloads`

Storage class is `manual` (no dynamic provisioning).

### Custom Charts

`charts/` contains Helm charts for apps without good upstream charts:
- `plex-movie-randomizer/` — wraps the custom Docker image
- `ersatztv/` — wraps ErsatzTV with k8s-at-home/common dependency
- `plex-meta-manager/` — Plex metadata automation
- `ranked-choice-vote/` — custom voting app
- `assetto-server-manager/` — racing server management

### Flux CD Structure

- `clusters/home-server/flux-system/` — Flux bootstrap files; source points to `git@github.com:tseruga/home-k8s`
- Each namespace directory contains HelmRepository and HelmRelease manifests
- `clusters/home-server/networking/kustomization.yaml` gates cert-manager/ingress ordering

## Key Patterns

- HelmRelease files are named `*-hr.yaml`
- LoadBalancer services use manually assigned IPs in the 192.168.1.x range
- All services should include liveness/readiness probes
- Secrets live in `infra/secrets/` (not committed)
