# Plex Movie Randomizer - Deployment Guide

This guide covers containerizing and deploying the Plex Movie Randomizer to Kubernetes using the provided Helm chart.

## Overview

The app has been containerized using Docker and includes a Helm chart for easy deployment to your Kubernetes cluster.

## Prerequisites

- Docker
- A container registry (Docker Hub, GitHub Container Registry, etc.)
- Kubernetes cluster with Flux CD configured
- Helm 3.x

## Building and Publishing the Container

### 1. Build the Docker Image

```bash
cd plex-movie-randomizer
./build.sh
```

This will:
- Build the SvelteKit app into static files
- Create a Docker image with nginx serving the static files
- Start a test container on http://localhost:8080

### 2. Tag and Push to Registry

```bash
# Tag the image for your registry
docker tag plex-movie-randomizer:latest your-registry/plex-movie-randomizer:v1.0.0

# Push to registry
docker push your-registry/plex-movie-randomizer:v1.0.0
```

## Kubernetes Deployment

### 1. Update Image Repository

Edit `clusters/home-server/media/plex-movie-randomizer-hr.yaml`:

```yaml
app:
  image:
    repository: your-registry/plex-movie-randomizer  # Update this
    tag: v1.0.0  # Update this
```

### 2. Configure Domain

Update the ingress host in the same file:

```yaml
app:
  ingress:
    host: plex-randomizer.your-domain.com  # Update this
```

### 3. Deploy with Flux

The app will be automatically deployed by Flux CD when you commit the changes to your repository.

## Helm Chart Structure

```
charts/plex-movie-randomizer/
├── Chart.yaml                 # Chart metadata
├── values.yaml               # Default values
├── .helmignore              # Files to ignore
└── templates/
    ├── _helpers.tpl         # Template helpers
    ├── deployment.yaml      # App deployment
    ├── service.yaml         # Kubernetes service
    ├── ingress.yaml         # Ingress for external access
    └── namespace.yaml       # Namespace creation
```

## Configuration Options

Key configuration options in `values.yaml`:

```yaml
namespace: media              # Kubernetes namespace
app:
  name: plex-movie-randomizer
  image:
    repository: your-registry/plex-movie-randomizer
    tag: latest
    pullPolicy: Always
  
  replicas: 1                 # Number of replicas
  
  resources:
    limits:
      cpu: 200m
      memory: 256Mi
    requests:
      cpu: 100m
      memory: 128Mi
  
  ingress:
    enabled: true
    host: plex-randomizer.your-domain.com
    tls: true                 # Enable HTTPS
  
  healthCheck:
    enabled: true
    path: /health
```

## Health Monitoring

The container includes a health check endpoint at `/health` that returns "healthy" when the nginx server is running properly.

## Networking

- **Internal Port**: 80 (nginx)
- **Service Port**: 80
- **Ingress**: HTTPS via cert-manager with Let's Encrypt

## Security Features

- Security headers configured in nginx
- HTTPS redirect via ingress
- Non-root container execution
- Minimal attack surface (static files only)

## Troubleshooting

### Check Pod Status
```bash
kubectl get pods -n media
kubectl logs -n media deployment/plex-movie-randomizer
```

### Check Ingress
```bash
kubectl get ingress -n media
kubectl describe ingress plex-movie-randomizer-ingress -n media
```

### Test Health Endpoint
```bash
kubectl port-forward -n media svc/plex-movie-randomizer 8080:80
curl http://localhost:8080/health
```

## Manual Helm Deployment

If not using Flux CD, you can deploy manually:

```bash
# Install the chart
helm install plex-movie-randomizer ./charts/plex-movie-randomizer \
  --namespace media \
  --create-namespace \
  --set app.image.repository=your-registry/plex-movie-randomizer \
  --set app.image.tag=v1.0.0 \
  --set app.ingress.host=plex-randomizer.your-domain.com

# Upgrade the deployment
helm upgrade plex-movie-randomizer ./charts/plex-movie-randomizer \
  --namespace media \
  --set app.image.tag=v1.0.1
```

## Resource Requirements

- **CPU**: 100m request, 200m limit
- **Memory**: 128Mi request, 256Mi limit
- **Storage**: No persistent storage required (stateless app)

The app is lightweight and suitable for resource-constrained environments. 