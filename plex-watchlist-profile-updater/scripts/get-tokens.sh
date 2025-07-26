#!/bin/bash

# Helper script to get and encode API tokens for Kubernetes secrets

echo "🔑 Plex Watchlist Updater - Token Helper"
echo "======================================"
echo ""

echo "This script will help you prepare your API tokens for Kubernetes deployment."
echo ""

# Function to base64 encode
encode_token() {
    echo -n "$1" | base64
}

# Get Plex token
echo "📺 PLEX TOKEN"
echo "-------------"
echo "1. Go to your Plex web interface"
echo "2. Settings → Account → Privacy & Online Services"
echo "3. Find your 'X-Plex-Token' or follow: https://support.plex.tv/articles/204059436/"
echo ""
read -p "Enter your Plex token: " -r PLEX_TOKEN

if [ -n "$PLEX_TOKEN" ]; then
    PLEX_TOKEN_B64=$(encode_token "$PLEX_TOKEN")
    echo "✅ Plex token (base64): $PLEX_TOKEN_B64"
else
    echo "❌ No Plex token provided"
    PLEX_TOKEN_B64=""
fi

echo ""

# Get Radarr API key
echo "🎬 RADARR API KEY"
echo "----------------"
echo "1. Go to your Radarr web interface"
echo "2. Settings → General → Security"
echo "3. Copy the 'API Key' value"
echo ""
read -p "Enter your Radarr API key: " -r RADARR_API_KEY

if [ -n "$RADARR_API_KEY" ]; then
    RADARR_API_KEY_B64=$(encode_token "$RADARR_API_KEY")
    echo "✅ Radarr API key (base64): $RADARR_API_KEY_B64"
else
    echo "❌ No Radarr API key provided"
    RADARR_API_KEY_B64=""
fi

echo ""
echo "📝 KUBERNETES SECRET"
echo "===================="
echo ""
echo "Create the secret in your cluster with:"
echo ""
if [ -n "$PLEX_TOKEN" ] && [ -n "$RADARR_API_KEY" ]; then
    echo "kubectl create secret generic plex-watchlist-updater-secrets \\"
    echo "  --namespace=media \\"
    echo "  --from-literal=PLEX_TOKEN=\"$PLEX_TOKEN\" \\"
    echo "  --from-literal=RADARR_API_KEY=\"$RADARR_API_KEY\""
else
    echo "kubectl create secret generic plex-watchlist-updater-secrets \\"
    echo "  --namespace=media \\"
    echo "  --from-literal=PLEX_TOKEN=\"YOUR_PLEX_TOKEN\" \\"
    echo "  --from-literal=RADARR_API_KEY=\"YOUR_RADARR_API_KEY\""
fi
echo ""
echo "Or use the kubernetes-secret-example.yaml file with these base64 values:"
if [ -n "$PLEX_TOKEN_B64" ]; then
    echo "  PLEX_TOKEN: $PLEX_TOKEN_B64"
else
    echo "  PLEX_TOKEN: YOUR_BASE64_ENCODED_PLEX_TOKEN"
fi
if [ -n "$RADARR_API_KEY_B64" ]; then
    echo "  RADARR_API_KEY: $RADARR_API_KEY_B64"
else
    echo "  RADARR_API_KEY: YOUR_BASE64_ENCODED_RADARR_API_KEY"
fi

echo ""
echo "💡 TIP: You can also test these tokens manually:"
if [ -n "$PLEX_TOKEN" ]; then
    echo "   Plex: curl -H 'X-Plex-Token: $PLEX_TOKEN' 'http://192.168.1.210:32400/'"
fi
if [ -n "$RADARR_API_KEY" ]; then
    echo "   Radarr: curl -H 'X-Api-Key: $RADARR_API_KEY' 'http://192.168.1.211:7878/api/v3/system/status'"
fi

echo ""
echo "🎉 Token preparation complete!" 