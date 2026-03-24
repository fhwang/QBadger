# QBadger CloudFormation Infrastructure

Two-stack architecture separating persistent secrets from replaceable EC2 infrastructure.

## Stacks

### Secrets Stack (`secrets.yaml`)
Deploy once. Persists across EC2 instance rebuilds.

Stores in AWS Secrets Manager:
- `qbadger/cloudflare-tunnel-token`
- `qbadger/anthropic-api-key`
- `qbadger/github-bot-token`
- `qbadger/github-webhook-secret`

### Instance Stack (`instance.yaml`)
Replaceable. Can be torn down and recreated without losing secrets.

Creates:
- EC2 instance (Amazon Linux 2023, t3.large default, 50 GB gp3 encrypted EBS)
- Security group (egress-only, no inbound rules)
- IAM role with SSM, CloudWatch Agent, scoped Secrets Manager access
- SNS topic with email alerts
- CloudWatch log group (`/qbadger/service`, 30-day retention)
- CloudWatch alarms: CPU > 80%, memory > 85%, disk > 80%, Docker daemon down, status check failure (auto-recovery)

UserData bootstraps: Node.js 22, pnpm, Docker, GitHub CLI, Cloudflare Tunnel, CloudWatch Agent, QBadger service (systemd), daily Docker cleanup cron.

## Deployment

```bash
# First time: deploy secrets
./scripts/deploy-secrets.sh <cloudflare-token> <anthropic-key> <github-token> <webhook-secret>

# Deploy or update instance
./scripts/deploy-instance.sh your@email.com [instance-type] [volume-size]
```

## Access

- **SSH:** Use SSM Session Manager (`aws ssm start-session --target <instance-id>`)
- **Webhooks:** Via Cloudflare Tunnel (no direct inbound access)
- **Health check:** Cloudflare Tunnel URL → `localhost:3000/health`

## Teardown

```bash
# Instance only (secrets preserved)
aws cloudformation delete-stack --stack-name qbadger-instance

# Full teardown
aws cloudformation delete-stack --stack-name qbadger-instance
aws cloudformation delete-stack --stack-name qbadger-secrets
```
