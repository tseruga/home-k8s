# Kubernetes Deployment Guide

This guide covers building and deploying the Plex Watchlist Updater to your Kubernetes cluster using Helm.

## 🏗️ Building the Docker Image

### Option 1: Build Locally

```bash
# Build the Docker image
cd plex-watchlist-profile-updater
docker build -t plex-watchlist-updater:latest .

# Tag for your registry (replace with your registry)
docker tag plex-watchlist-updater:latest ghcr.io/your-username/plex-watchlist-updater:latest

# Push to registry
docker push ghcr.io/your-username/plex-watchlist-updater:latest
```

### Option 2: GitHub Actions (Recommended)

Create `.github/workflows/build.yml` to automatically build and push:

```yaml
name: Build and Push Docker Image

on:
  push:
    branches: [ main ]
    paths: [ 'plex-watchlist-profile-updater/**' ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Login to GitHub Container Registry
      uses: docker/login-action@v2
      with:
        registry: ghcr.io
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}
    
    - name: Build and push
      uses: docker/build-push-action@v4
      with:
        context: ./plex-watchlist-profile-updater
        push: true
        tags: ghcr.io/${{ github.repository_owner }}/plex-watchlist-updater:latest
```

## 🔑 Setting Up API Credentials

### 1. Get Your API Tokens

#### Plex Token
```bash
# Method 1: From Plex Web UI
# Settings → Account → Privacy & Online Services → Find "X-Plex-Token"

# Method 2: Command line (if you have curl and credentials)
curl -X POST 'https://plex.tv/users/sign_in.xml' \
  -H 'X-Plex-Client-Identifier: your-app-id' \
  -d 'username=your-username&password=your-password'
```

#### Radarr API Key
```bash
# From Radarr Web UI: Settings → General → Security → API Key
```

### 2. Base64 Encode the Tokens

```bash
# Encode your tokens
echo -n "your-plex-token-here" | base64
echo -n "your-radarr-api-key-here" | base64
```

### 3. Create the Kubernetes Secret

Create the secret manually in your cluster:

```bash
# Option 1: Using kubectl with base64 encoded values
kubectl create secret generic plex-watchlist-updater-secrets \
  --namespace=media \
  --from-literal=PLEX_TOKEN="your-plex-token" \
  --from-literal=RADARR_API_KEY="your-radarr-api-key"

# Option 2: Using the example manifest
# Edit kubernetes-secret-example.yaml with your tokens, then:
kubectl apply -f kubernetes-secret-example.yaml
```

## 📦 Deploying to Kubernetes

### 1. Install Helm Chart Dependencies

```bash
# Navigate to the chart directory
cd charts/plex-watchlist-updater

# Update dependencies
helm dependency update
```

### 2. Test the Helm Chart

```bash
# Dry run to check for issues (make sure secret exists first)
helm install plex-watchlist-updater . --dry-run --debug --namespace=media
```

### 3. Deploy with Flux (Recommended)

Since you're using Flux, just commit the changes:

```bash
# Make sure your HelmRelease is configured
git add clusters/home-server/media/plex-watchlist-updater-hr.yaml
git commit -m "Add plex-watchlist-updater deployment"
git push
```

Flux will automatically deploy the application.

### 4. Manual Helm Install (Alternative)

```bash
# Create the secret first
kubectl create secret generic plex-watchlist-updater-secrets \
  --namespace=media \
  --from-literal=PLEX_TOKEN="your-plex-token" \
  --from-literal=RADARR_API_KEY="your-radarr-api-key"

# Install directly with Helm
helm install plex-watchlist-updater ./charts/plex-watchlist-updater \
  --namespace media \
  --create-namespace \
  --set image.repository=ghcr.io/your-username/plex-watchlist-updater \
  --set image.tag=latest
```

## 🔧 Configuration Options

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PLEX_URL` | Plex server URL | `http://plex.media.svc.cluster.local:32400` |
| `RADARR_URL` | Radarr server URL | `http://radarr.media.svc.cluster.local:7878` |
| `TARGET_PROFILE` | Quality profile name | `HD-1080p` |
| `TZ` | Timezone | `UTC` |

### Helm Values

```yaml
# Custom configuration example
config:
  interval: 30  # Check every 30 minutes
  targetProfile: "Ultra-HD"

env:
  TARGET_PROFILE: "Ultra-HD"
  TZ: "America/New_York"

resources:
  limits:
    cpu: 200m
    memory: 256Mi
  requests:
    cpu: 100m
    memory: 128Mi
```

## 📊 Monitoring

### View Logs

```bash
# Get pod name
kubectl get pods -n media -l app.kubernetes.io/name=plex-watchlist-updater

# View logs
kubectl logs -n media -l app.kubernetes.io/name=plex-watchlist-updater -f
```

### Check Health

```bash
# Port forward to access health endpoint
kubectl port-forward -n media svc/plex-watchlist-updater 8080:8080

# Check health (in another terminal)
curl http://localhost:8080/health
```

### Describe Resources

```bash
# Check deployment status
kubectl describe deployment -n media plex-watchlist-updater

# Check pod status
kubectl describe pod -n media -l app.kubernetes.io/name=plex-watchlist-updater
```

## 🐛 Troubleshooting

### Common Issues

1. **Image Pull Errors**
   ```bash
   # Check if image exists and is accessible
   docker pull ghcr.io/your-username/plex-watchlist-updater:latest
   ```

2. **Secret Decoding Issues**
   ```bash
   # Verify base64 encoding
   echo "your-base64-token" | base64 -d
   ```

3. **Network Connectivity**
   ```bash
   # Test from within cluster
   kubectl run -it --rm debug --image=busybox --restart=Never -- sh
   # Then test: wget -qO- http://plex.media.svc.cluster.local:32400
   ```

4. **Permission Issues**
   ```bash
   # Check if service account has proper permissions
   kubectl describe serviceaccount -n media plex-watchlist-updater
   ```

### Debug Mode

Enable debug logging:

```yaml
env:
  LOG_LEVEL: "DEBUG"
```

## 🔄 Updates

### Updating the Image

```bash
# Build and push new version
docker build -t ghcr.io/your-username/plex-watchlist-updater:v1.1.0 .
docker push ghcr.io/your-username/plex-watchlist-updater:v1.1.0

# Update HelmRelease
# Edit clusters/home-server/media/plex-watchlist-updater-hr.yaml
# Change: tag: v1.1.0
```

### Updating Configuration

Just update the HelmRelease file and commit - Flux will handle the rest:

```bash
git add clusters/home-server/media/plex-watchlist-updater-hr.yaml
git commit -m "Update plex-watchlist-updater config"
git push
```

## 🚀 Production Recommendations

1. **Use specific image tags** instead of `latest`
2. **Set resource limits** to prevent resource exhaustion
3. **Configure persistent storage** for logs if needed
4. **Set up monitoring** with Prometheus/Grafana
5. **Use external secrets** management (like Sealed Secrets or External Secrets Operator)
6. **Enable network policies** for security
7. **Configure backup** for any persistent data 