#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

IMAGE_NAME="${IMAGE_NAME:-qbadger-worker}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

echo "Building worker image: ${IMAGE_NAME}:${IMAGE_TAG}"
docker build -t "${IMAGE_NAME}:${IMAGE_TAG}" "$REPO_ROOT"
echo "Build complete: ${IMAGE_NAME}:${IMAGE_TAG}"
