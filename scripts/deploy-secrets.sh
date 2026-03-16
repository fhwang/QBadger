#!/bin/bash
set -euo pipefail

STACK_NAME="qbadger-secrets"

if [ $# -lt 4 ]; then
  echo "Usage: $0 <cloudflare-token> <anthropic-key> <github-token> <webhook-secret>"
  exit 1
fi

aws cloudformation deploy \
  --stack-name "$STACK_NAME" \
  --template-file cloudformation/secrets.yaml \
  --parameter-overrides \
    CloudflareTunnelToken="$1" \
    AnthropicApiKey="$2" \
    GitHubBotToken="$3" \
    GitHubWebhookSecret="$4" \
  --no-fail-on-empty-changeset

echo "Secrets stack deployed: $STACK_NAME"
