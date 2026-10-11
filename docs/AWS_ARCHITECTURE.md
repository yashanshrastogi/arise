# Arise — AWS Architecture Overview

## 1. Architecture Summary

Arise is built as a cloud-native, serverless environmental intelligence platform deployed in AWS Region `us-east-1`. The architecture decouples static client hosting, API request handling, background ingestion pipelines, persistent user storage, and AI inference.

```
                           +------------------------------------------+
                           |          User Browser / Client           |
                           +--------------------+---------------------+
                                                |
                        1. Static Assets (HTTPS)| 2. API Requests (HTTPS)
                                                v
                    +---------------------------+---------------------------+
                    |                                                       |
                    v                                                       v
+---------------------------------------+       +---------------------------------------+
|           AWS Amplify Hosting         |       |         Amazon API Gateway            |
|   (dqmsa8e2klyso.amplifyapp.com)      |       |  (HTTP API - Stage: /prod)            |
| - Global CDN Distribution             |       | - CORS Preflight & Allowlist          |
| - SPA 404 -> /index.html Rewrites     |       | - Route Proxy to Lambda               |
+---------------------------------------+       +-------------------+-------------------+
                                                                    |
                                                                    v
                                                +---------------------------------------+
                                                |       ApiFunction (AWS Lambda)        |
                                                |       - Runtime: Python 3.12          |
                                                |       - Framework: FastAPI + Mangum   |
                                                |       - Grounded Multi-Day Forecast   |
                                                +---------+-----------+-----------+-----+
                                                          |           |           |
                              +---------------------------+           |           +---------------------------+
                              |                                       |                                       |
                              v                                       v                                       v
              +-------------------------------+       +-------------------------------+       +-------------------------------+
              |      AWS Secrets Manager      |       |     Amazon DynamoDB Cache     |       |       Amazon Cognito          |
              |     (arise/gemini-api-key)    |       |      (arise-cache-prod)       |       |    (us-east-1_qm2818Iul)      |
              | - Secure Gemini API Key       |       | - Real-time Air Telemetry     |       | - OAuth 2.0 / OIDC Identity   |
              +---------------+---------------+       | - 14-day Weather Horizon      |       | - JWT Token Verification      |
                              |                       | - TTL-based Auto Expiration   |       +-------------------------------+
                              v                       +---------------+---------------+
              +-------------------------------+                       ^
              |   Google Gemini AI & Critic   |                       |
              |    (gemini-3.5-flash-lite)    |                       | Writes Ingested Telemetry
              | - 2-Stage Synthesis & Critic  |                       |
              | - Guardrails & Safe Horizons  |       +---------------+---------------+
              +-------------------------------+       | IngestionFunction (Lambda)    |
                                                      | - Scheduled Hourly Ingest     |
                                                      | - OpenAQ, CPCB, NASA FIRMS    |
                                                      +---------------+---------------+
                                                                      ^
                                                                      | Hourly Trigger
                                                      +---------------+---------------+
                                                      |   Amazon EventBridge Schedule |
                                                      | (arise-ingestion-schedule-prod)|
                                                      +-------------------------------+
```

---

## 2. Component Descriptions

### 2.1. Frontend Tier: AWS Amplify Hosting
- **App ID:** `dqmsa8e2klyso`
- **Branch:** `frontend`
- **URL:** `https://frontend.dqmsa8e2klyso.amplifyapp.com/`
- **Role:** Delivers the pre-built React 19 / Vite single-page application (SPA).
- **Features:** Global CDN edge distribution, automatic TLS certificates, instant cache invalidation, and custom rewrite rules (`/<*> -> /index.html`, status 404-200) ensuring client-side hash and history routing functions seamlessly.

### 2.2. API Tier: Amazon API Gateway (HTTP API v2)
- **API ID:** `ll84ry8heh`
- **Base URL:** `https://ll84ry8heh.execute-api.us-east-1.amazonaws.com/prod`
- **Role:** High-performance, low-latency API entry point for all frontend requests.
- **CORS Handling:** Enforces allowed origins (`https://frontend.dqmsa8e2klyso.amplifyapp.com` and `http://localhost:5173`) and methods (`GET`, `POST`, `PATCH`, `OPTIONS`).
- **Proxy Integration:** Routes all incoming paths (`/{proxy+}`) directly to the `ApiFunction` Lambda via AWS Lambda proxy integration.

### 2.3. Compute Tier: AWS Lambda
1. **ApiFunction (`arise-production-ApiFunction-f8UwTPbldWrk`):**
   - **Runtime:** Python 3.12 (Architecture: `x86_64`, Memory: 512 MB, Timeout: 30s)
   - **Handler:** `app.main_lambda.handler`
   - **Role:** Runs the FastAPI application with Mangum ASGI adapter. Handles routes for real-time air quality, weather, 14-day forecast horizons, NASA FIRMS thermal anomalies, school sports advisories, and the Ask Arise AI copilot.
2. **IngestionFunction (`arise-production-IngestionFunction-2HRliyVNn9ZL`):**
   - **Runtime:** Python 3.12
   - **Handler:** `app.main_lambda.handler_ingest`
   - **Role:** Periodically pulls CPCB/OpenAQ air quality stations and NASA FIRMS fire signals, computes the synthesized Delhi-NCR AQI and dominant pollutants, and writes the cache record into DynamoDB.

### 2.4. Orchestration: Amazon EventBridge Scheduler
- **Schedule Name:** `arise-ingestion-schedule-prod`
- **Frequency:** `rate(1 hour)`
- **Role:** Triggers `IngestionFunction` automatically to ensure telemetry data remains fresh without incurring continuous server costs.

### 2.5. Persistence Tier: Amazon DynamoDB
1. **`arise-cache-prod`:**
   - **Partition Key:** `pk` (String)
   - **Billing Mode:** Pay-Per-Request (On-Demand)
   - **TTL:** Enabled on `ttl_epoch` for automatic cleanup of stale environmental telemetry.
2. **`arise-users-prod`:**
   - **Partition Key:** `user_id` (String)
   - **Billing Mode:** Pay-Per-Request (On-Demand)
   - **Encryption:** Server-Side Encryption enabled (AWS KMS / Default SSE).
   - **Role:** Stores user preferences, saved locations, and customized persona health settings.

### 2.6. Security & Secrets Management
- **AWS Secrets Manager (`arise/gemini-api-key`):**
  - Holds Google Gemini credentials without hardcoding in templates or environment variables.
  - Accessed at runtime by `ApiFunction` through least-privilege IAM policies (`secretsmanager:GetSecretValue`).
- **Amazon Cognito (`us-east-1_qm2818Iul`):**
  - User Pool and App Client (`32g687pdc6dulejhh4tcvd69m7`) provide OAuth 2.0 / OpenID Connect user authentication.
  - Token verification validates Bearer JWT signatures for protected routes (`/profile`).

---

## 3. End-to-End Request Flow (Ask Arise Copilot)

1. **User Interaction:**
   The user opens `https://frontend.dqmsa8e2klyso.amplifyapp.com/#/ask` and submits:
   *"what will be temp after 2 days"*.
2. **CORS Preflight:**
   The browser sends an `OPTIONS` request to API Gateway. API Gateway validates that the origin is allowed and returns `200 OK` with allowed headers.
3. **API Request Dispatch:**
   The browser issues a `POST` request to `https://ll84ry8heh.execute-api.us-east-1.amazonaws.com/prod/chat` with JSON body:
   `{"question": "what will be temp after 2 days", "lat": 28.6139, "lon": 77.2090}`.
4. **Lambda Execution:**
   - API Gateway invokes `ApiFunction`.
   - Mangum passes the request to FastAPI's `/chat` route.
   - The Arise Agent resolves live telemetry and the 14-day Open-Meteo forecast horizon from the cache/live source.
5. **AI Synthesis & Critic Evaluation:**
   - The agent retrieves the Gemini API key from AWS Secrets Manager.
   - **Stage 1 (Generator):** Calls Google Gemini (`gemini-3.5-flash-lite`) with grounded telemetry to generate a response.
   - **Stage 2 (Critic Evaluator):** A second model evaluation verifies temporal alignment (ensuring future queries provide forecast values rather than current readings) and checks safety guardrails.
6. **Response Delivery:**
   FastAPI returns the verified JSON response (`verdict: STAY IN`, `headline: In two days on Wednesday, the forecasted temperature... 34°C with an AQI of 311...`, `best_window: 5 AM – 7 AM`).
7. **Client Rendering:**
   The React frontend renders the answer with highlighted metrics, source citations, and activity recommendation badges.
