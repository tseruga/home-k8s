#!/bin/bash

# Build and push script for plex-watchlist-updater
set -e

# Configuration
REGISTRY="${REGISTRY:-ghcr.io}"
USERNAME="${USERNAME:-your-username}"
IMAGE_NAME="plex-watchlist-updater"
TAG="${TAG:-latest}"

FULL_IMAGE_NAME="${REGISTRY}/${USERNAME}/${IMAGE_NAME}:${TAG}"

echo "🏗️  Building Docker image: ${FULL_IMAGE_NAME}"

# Build the image
docker build -t "${FULL_IMAGE_NAME}" .

echo "✅ Build completed: ${FULL_IMAGE_NAME}"

# Ask if user wants to push
read -p "Push image to registry? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "📤 Pushing image to registry..."
    docker push "${FULL_IMAGE_NAME}"
    echo "✅ Push completed: ${FULL_IMAGE_NAME}"
else
    echo "⏭️  Skipping push"
fi

echo "🎉 Done!"
echo ""
echo "To deploy, update the image in your HelmRelease:"
echo "  image:"
echo "    repository: ${REGISTRY}/${USERNAME}/${IMAGE_NAME}"
echo "    tag: ${TAG}" 