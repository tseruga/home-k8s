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
