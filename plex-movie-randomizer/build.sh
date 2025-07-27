#!/bin/bash

# Build script for Plex Movie Randomizer

# Set the image tag
IMAGE_NAME="plex-movie-randomizer"
IMAGE_TAG="latest"
FULL_IMAGE_NAME="${IMAGE_NAME}:${IMAGE_TAG}"

echo "Building Docker image: ${FULL_IMAGE_NAME}"

# Build the Docker image
docker build -t ${FULL_IMAGE_NAME} .

if [ $? -eq 0 ]; then
    echo "✅ Docker build successful!"
    echo "Image: ${FULL_IMAGE_NAME}"
    
    # Optional: Test the container
    echo ""
    echo "Testing the container..."
    docker run --rm -d -p 8080:80 --name plex-randomizer-test ${FULL_IMAGE_NAME}
    
    echo "Container started on http://localhost:8080"
    echo "Health check: http://localhost:8080/health"
    echo ""
    echo "To stop the test container:"
    echo "docker stop plex-randomizer-test"
    
else
    echo "❌ Docker build failed!"
    exit 1
fi 