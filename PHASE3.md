# Phase 3 — AWS Serverless Production Deployment & Infrastructure

**Arise — Delhi-NCR Air & Weather Intelligence Platform**

---

## 1. Executive Summary

Phase 3 transitions the validated Phase 2 architecture into an enterprise-grade AWS Serverless platform without altering product behavior, frontend visual design, or environmental calculations.

### Core Architecture Highlights
- **FastAPI + Mangum:** Wraps existing FastAPI application cleanly for execution inside AWS Lambda behind an Amazon API Gateway HTTP API.
- **DynamoDB Cache:** Serverless key-value caching table with epoch TTL for storage cleanup and strict application-level freshness verification (`fetched_at`, `expires_at`).
- **Scheduled Telemetry Ingestion:** Amazon EventBridge Scheduler invokes a dedicated `IngestionFunction` Lambda every 30 minutes to fetch, normalize, and pre-cache live data across OpenAQ, Open-Meteo, and NASA FIRMS.
- **Strands + Amazon Bedrock:** Enterprise AI copilot powered by Amazon Bedrock (Nova model) with graceful deterministic fallback.
- **Observability:** AWS Lambda Powertools for structured JSON logging, correlation IDs, and request tracing.
- **Frontend Hosting:** React/Vite SPA hosted via Amazon S3 and CloudFront CDN.

---

## 2. Target Architecture

```text
                     INTERNET
                        │
         ┌──────────────┴──────────────┐
         ▼                             ▼
  [ Amazon CloudFront ]        [ Amazon API Gateway ]
  (CDN & TLS Termination)       (HTTP API v2.0 Proxy)
         │                             │
         ▼                             ▼
  [ Amazon S3 Bucket ]        [ ApiFunction (Lambda) ]
  (React / Vite SPA)          FastAPI + Mangum Adapter
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
 [ DynamoDB Cache ]         [ Strands Copilot ]            [ External Providers ]
 (arise-cache-prod)         (Amazon Bedrock Nova)          - OpenAQ v3
        ▲                                                  - Open-Meteo
        │                                                  - NASA FIRMS
        │ (Every 30 mins)
 [ IngestionFunction ]
 (Lambda Pipeline)
        ▲
        │
 [ EventBridge Scheduler ]
 (AWS::Scheduler::Schedule)
```

---

## 3. Serverless Resources (AWS SAM)

All infrastructure is defined declaratively in `infra/template.yaml` and managed via AWS SAM CLI.

| Logical ID | AWS Type | Configuration / Purpose |
|---|---|---|
| `CacheTable` | `AWS::DynamoDB::Table` | On-Demand (PAY_PER_REQUEST), HASH key `pk` (String), TTL attribute `ttl_epoch`. |
| `HttpApi` | `AWS::Serverless::HttpApi` | HTTP API Gateway with CORS support for deployed frontend origin. |
| `ApiFunction` | `AWS::Serverless::Function` | Python 3.12, 512 MB, 30s timeout, Mangum handler `app.main_lambda.handler`. |
| `IngestionFunction` | `AWS::Serverless::Function` | Python 3.12, 512 MB, 60s timeout, handler `app.lambdas.ingestion.handler`. |
| `SchedulerRole` | `AWS::IAM::Role` | Least-privilege IAM execution role for Amazon EventBridge Scheduler. |
| `IngestionSchedule` | `AWS::Scheduler::Schedule` | Modern EventBridge Scheduler triggering `IngestionFunction` every 30 minutes. |

---

## 4. DynamoDB Schema & Freshness Strategy

### Table Definition
- **Table Name:** `arise-cache-${Stage}` (e.g. `arise-cache-prod`)
- **Partition Key:** `pk` (String)
- **Billing Mode:** Pay-Per-Request (Serverless)

### Item Schema
| Attribute | Type | Description |
|---|---|---|
| `pk` | String | Deterministic spatial/provider key (e.g. `env:28.61:77.21`, `openaq:28.61:77.21`). |
| `data` | String | Serialized JSON snapshot or observation dictionary. |
| `source` | String | Telemetry provider identifier (`OpenAQ`, `Open-Meteo`, `NASA FIRMS`, `ingestion_scheduler`). |
| `fetched_at` | String | UTC ISO 8601 timestamp of data retrieval. |
| `expires_at` | String | UTC ISO 8601 timestamp of application freshness expiry. |
| `status` | String | Item freshness state (`fresh` or `stale`). |
| `version` | String | Schema version (`1.0`). |
| `ttl_seconds` | Number | Configured retention lifespan (default: 1800s). |
| `ttl_epoch` | Number | Unix epoch timestamp for DynamoDB automatic background cleanup. |

### Critical TTL Rule
> [!IMPORTANT]
> **DynamoDB TTL is for automatic storage cleanup, NOT application freshness.**  
> DynamoDB TTL background deletion can take hours or days to purge expired items. The Arise application code explicitly inspects `expires_at` versus current UTC time:
> - If `now < expires_at`: returned as **fresh**.
> - If `now >= expires_at` and `allow_stale=True`: returned as **stale** with warning metadata.
> - If `now >= expires_at` and `allow_stale=False`: treated as cache miss.

---

## 5. Scheduled Telemetry Ingestion (EventBridge Scheduler)

In accordance with AWS best practices, Arise uses **Amazon EventBridge Scheduler** (`AWS::Scheduler::Schedule`), replacing legacy CloudWatch Events / EventBridge scheduled rules.

### Schedule Properties
- **Schedule Expression:** `rate(30 minutes)`
- **Flexible Time Window:** `OFF`
- **Target:** `IngestionFunction` ARN with asynchronous invocation
- **Retry Policy:** Maximum 2 retries, max event age 300 seconds

### Ingestion Idempotency
- Uses deterministic cache keys based on basin coordinates (`lat=28.61, lon=77.21`).
- Repeated scheduler invocations cleanly overwrite existing records with updated `fetched_at` and `expires_at` timestamps without duplication or state corruption.

---

## 6. Security, Secrets & IAM Least Privilege

1. **No Hardcoded Credentials:**
   - AWS credentials, OpenAQ API keys, and NASA FIRMS keys are never committed to git, logged, or bundled into frontend assets.
2. **IAM Policies:**
   - `ApiFunction`: Scoped to `DynamoDBCrudPolicy` on `CacheTable` and `bedrock:InvokeModel` on foundation models.
   - `IngestionFunction`: Scoped to `DynamoDBCrudPolicy` on `CacheTable`.
   - `SchedulerRole`: Scoped exclusively to `lambda:InvokeFunction` on `IngestionFunction`.
   - Neither function has `AdministratorAccess` or wildcard IAM permissions.
3. **Frontend Google Maps Key:**
   - Stored in `frontend/.env.local` as `VITE_GOOGLE_MAPS_API_KEY`.
   - Restricted in Google Cloud Console to authorized HTTP referrers (e.g. `localhost` and the deployed CloudFront domain).

---

## 7. Amazon Bedrock & AI Graceful Fallback

When operating in AWS mode (`MODE=aws`, `LLM_PROVIDER=bedrock`):
- Strands Copilot executes against Amazon Bedrock utilizing `us.amazon.nova-lite-v1:0`.
- The LLM explains grounded environmental data returned by backend tools; it **never** invents concentrations and **never** overrides the deterministic verdict engine.
- If Bedrock model access is unavailable or encounters rate throttling, Ask Arise gracefully shifts to deterministic grounded structured explanations without failing the request or halting core dashboard APIs.

---

## 8. Frontend Deployment (S3 + CloudFront)

The React / Vite application is built into static assets and distributed globally:

```bash
# 1. Build frontend with production API URL
cd frontend
VITE_API_URL=https://<api-id>.execute-api.us-east-1.amazonaws.com/prod npm run build

# 2. Sync to S3 bucket
aws s3 sync dist/ s3://<arise-frontend-bucket>/ --delete

# 3. Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id <dist-id> --paths "/*"
```

---

## 9. Local vs. AWS Configuration Parity

Arise maintains 100% parity between local development and AWS serverless execution:

| Feature | Local Development (`MODE=local`) | AWS Production (`MODE=aws`) |
|---|---|---|
| Server Framework | FastAPI + Uvicorn | FastAPI + Mangum on AWS Lambda |
| Caching | In-Memory & `data/cache/cache_store.json` | Amazon DynamoDB (`arise-cache-prod`) |
| Scheduler | Manual / Background Thread | Amazon EventBridge Scheduler (every 30m) |
| AI Model | Local Grounded Engine | Amazon Bedrock Nova Lite |
| Observability | Python `logging` | AWS Lambda Powertools structured JSON |
| Frontend API URL | `http://localhost:8000` | `https://<api-id>.execute-api.us-east-1.amazonaws.com/prod` |

---

## 10. Operational Commands & Deployment Guide

### Validate SAM Template
```bash
cd infra
sam validate --lint
```

### Build Artifacts
```bash
cd infra
sam build
```

### Local Testing with SAM CLI
```bash
cd infra
sam local start-api --port 8000
```

### Deploy Stack to AWS
```bash
cd infra
sam deploy \
  --stack-name arise-production \
  --region us-east-1 \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
      Stage=prod \
      CorsOrigins="http://localhost:5173,https://<your-domain>.cloudfront.net"
```

---

## 11. Rollback & Teardown Procedure

If rollback or decommissioning is required:
1. **Disable Ingestion Scheduler:**
   ```bash
   aws scheduler update-schedule --name arise-ingestion-schedule-prod --state DISABLED
   ```
2. **Redeploy Previous CloudFormation Changeset:**
   ```bash
   sam deploy --stack-name arise-production --template-file <previous-template.yaml>
   ```
3. **Clean Teardown of Phase 3 Test Stack:**
   ```bash
   sam delete --stack-name arise-production --region us-east-1 --no-prompts
   ```
