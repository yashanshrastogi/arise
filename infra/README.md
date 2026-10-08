# Arise — Infrastructure as Code (AWS SAM)

This directory contains the AWS Serverless Application Model (SAM) definitions for Arise Phase 3 deployment.

## Architecture

```text
INTERNET
   │
   ├─► CloudFront / S3 (React/Vite Frontend)
   │
   └─► AWS API Gateway (HTTP API)
           │
           ▼
       FastAPI + Mangum (ApiFunction Lambda)
           │
           ├─► DynamoDB Cache (arise-cache-prod)
           │      ▲
           │      │ (Every 30 min)
           │   EventBridge Scheduler ──► IngestionFunction Lambda
           │
           └─► Amazon Bedrock (Nova Model / Strands Copilot)
```

## Prerequisites

- AWS CLI v2 (`aws --version`)
- AWS SAM CLI (`sam --version`)
- Docker (`docker --version`)
- Python 3.12+

## Common Commands

### 1. Validate SAM Template
```bash
cd infra
sam validate --lint
```

### 2. Build Serverless Artifacts
```bash
cd infra
sam build
```

### 3. Run Locally with SAM CLI
```bash
cd infra
sam local start-api --port 8000
```

### 4. Deploy to AWS
```bash
cd infra
sam deploy --guided
# Or with saved configurations:
sam deploy --stack-name arise-production --region us-east-1 --capabilities CAPABILITY_IAM
```

## Security & Secrets
- Never commit AWS credentials or private API keys to source control.
- Pass `OpenAQAKey` and `FirmsMapKey` via SAM parameter overrides or AWS Systems Manager (SSM) Parameter Store.
- DynamoDB TTL handles storage cleanup; application freshness is governed strictly by `fetched_at` and `expires_at`.
