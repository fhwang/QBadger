#!/bin/bash
set -euo pipefail

STACK_NAME="qbadger-instance"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <alert-email> [instance-type] [volume-size]"
  exit 1
fi

ALERT_EMAIL="$1"
INSTANCE_TYPE="${2:-t3.large}"
VOLUME_SIZE="${3:-50}"

aws cloudformation deploy \
  --stack-name "$STACK_NAME" \
  --template-file cloudformation/instance.yaml \
  --parameter-overrides \
    AlertEmail="$ALERT_EMAIL" \
    InstanceType="$INSTANCE_TYPE" \
    VolumeSize="$VOLUME_SIZE" \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset

echo "Instance stack deployed: $STACK_NAME"
echo "Instance ID:"
aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`InstanceId`].OutputValue' \
  --output text
