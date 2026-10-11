# Arise — Beginner's Guide to Every AWS Service Used

This guide explains each AWS service deployed in the Arise project in simple terms, why we use it, how it works, what it costs, and how to maintain it.

---

## 1. AWS Amplify Hosting

- **What it is:** A managed hosting service designed for modern web applications (React, Vite, Next.js).
- **Why Arise needs it:** Arise is a fast Single Page Application (SPA). Amplify provides global content delivery (CDN), automatic HTTPS/SSL, and handles routing rewrites so that page reloads don't cause 404 errors.
- **Role in Arise:** Serves the HTML, CSS, JavaScript, icons, and map assets to users worldwide.
- **Resource created:** Amplify App `dqmsa8e2klyso`, Branch `frontend`.
- **How it was deployed:** Deployed via the AWS CLI using a packaged zip of the Vite production build (`artifacts/arise-frontend-dist.zip`).
- **Configuration needed:** Rewrite rule (`/<*> -> /index.html` with status `404-200`) to support client-side hash routing.
- **Verification:** Navigating to [https://frontend.dqmsa8e2klyso.amplifyapp.com/](https://frontend.dqmsa8e2klyso.amplifyapp.com/) returns HTTP 200 with the full interactive dashboard.
- **Cost considerations:** Generous free tier (15 GB served/month, 1000 build minutes/month). Minimal cost thereafter based on bandwidth.
- **What happens if it stops:** Users cannot open the website.
- **Where to view in AWS Console:** Open the **AWS Amplify** console → Select app **arise** → Branch **frontend**.

---

## 2. Amazon API Gateway (HTTP API v2)

- **What it is:** A managed doorway (reverse proxy) that accepts incoming HTTP requests from the internet and forwards them to backend code.
- **Why Arise needs it:** Browsers cannot directly run Python backend code in the cloud. API Gateway receives incoming REST calls (like `/environment` or `/chat`), handles CORS security policies, and invokes Lambda.
- **Role in Arise:** Connects the React frontend to the FastAPI backend.
- **Resource created:** HTTP API `ll84ry8heh`, Stage `prod`.
- **How it was deployed:** Managed declaratively through AWS SAM in [`infra/template.yaml`](../infra/template.yaml).
- **Configuration needed:** CORS origins list (`https://frontend.dqmsa8e2klyso.amplifyapp.com` and `http://localhost:5173`) and route mapping `/{proxy+}`.
- **Verification:** Sending a `GET /health` request returns HTTP 200 with system status.
- **Cost considerations:** Extremely cheap. 1 million HTTP API calls cost ~$1.00; free tier includes 1 million requests/month.
- **What happens if it stops:** The frontend loads, but live air quality data, forecasts, and AI answers fail to load.
- **Where to view in AWS Console:** Open the **API Gateway** console → Select **arise-production-HttpApi**.

---

## 3. AWS Lambda (Serverless Compute)

- **What it is:** A compute service that runs code only when requested, without keeping servers running 24/7.
- **Why Arise needs it:** Arise only needs to process requests when users visit the site or when hourly telemetry is ingested. Serverless Lambda scales to zero when idle, eliminating idle server costs.
- **Role in Arise:**
  1. `ApiFunction`: Runs our FastAPI application (Mangum adapter) to compute AQI verdicts, serve 14-day forecasts, and manage user profiles.
  2. `IngestionFunction`: Periodically polls satellite and station APIs to refresh Delhi-NCR telemetry.
- **Resources created:**
  - `arise-production-ApiFunction-f8UwTPbldWrk`
  - `arise-production-IngestionFunction-2HRliyVNn9ZL`
- **How it was deployed:** Packaged and deployed via AWS SAM (`sam build` + `sam deploy`).
- **Configuration needed:** Python 3.12 runtime, memory 512 MB, timeout 30s, environment variables for DynamoDB table names and secret IDs.
- **Verification:** Both Lambda functions invoked successfully with HTTP 200 responses.
- **Cost considerations:** Free tier includes 1 million free invocations and 3.2 million seconds of compute time per month.
- **What happens if it stops:** API endpoints return 500 or 504 errors.
- **Where to view in AWS Console:** Open the **AWS Lambda** console → Select **Functions**.

---

## 4. Amazon DynamoDB (NoSQL Database)

- **What it is:** A fast, managed key-value database that stores information in milliseconds.
- **Why Arise needs it:** Arise needs fast storage to cache incoming air quality telemetry (so we don't bombard third-party APIs on every user click) and store user profiles.
- **Role in Arise:**
  1. `arise-cache-prod`: Stores the latest air quality readings and hourly forecasts with automated time-to-live (TTL) expiration.
  2. `arise-users-prod`: Stores registered user settings, health profiles (e.g. asthma, senior), and saved locations.
- **Resources created:**
  - Table `arise-cache-prod`
  - Table `arise-users-prod`
- **How it was deployed:** Defined in `infra/template.yaml` and deployed via SAM CloudFormation.
- **Configuration needed:** On-demand capacity mode (`PAY_PER_REQUEST`), TTL attribute `ttl_epoch`, partition keys.
- **Verification:** Backend `/health` reports `cache: connected` and user profile endpoints interact with DynamoDB successfully.
- **Cost considerations:** On-Demand billing means you only pay for reads and writes performed. 25 GB of storage is free.
- **What happens if it stops:** Cached telemetry lookups fail, and user profile saving will error.
- **Where to view in AWS Console:** Open the **DynamoDB** console → Select **Tables**.

---

## 5. Amazon EventBridge Scheduler

- **What it is:** A cloud cron service that triggers actions at scheduled times.
- **Why Arise needs it:** Air pollution conditions in Delhi change constantly. EventBridge wakes up the ingestion system every hour to fetch the latest readings.
- **Role in Arise:** Triggers `IngestionFunction` every hour (`rate(1 hour)`).
- **Resource created:** `arise-ingestion-schedule-prod`.
- **How it was deployed:** Deployed via AWS SAM in `infra/template.yaml`.
- **Configuration needed:** Schedule expression `rate(1 hour)` with an IAM role granting invocation rights to Lambda.
- **Verification:** Schedule status verified as active in CloudFormation.
- **Cost considerations:** Free tier includes 14 million scheduled invocations per month.
- **What happens if it stops:** Telemetry data stops auto-refreshing in the background, though live fallback fetching still operates.
- **Where to view in AWS Console:** Open **Amazon EventBridge** → Select **Schedules**.

---

## 6. AWS Secrets Manager

- **What it is:** A secure vault for storing sensitive API keys and database credentials.
- **Why Arise needs it:** Storing API keys in code or Git repositories is a critical security vulnerability. Secrets Manager keeps the Google Gemini API key encrypted at rest and in transit.
- **Role in Arise:** Holds the Gemini API key used by the Ask Arise AI copilot.
- **Resource created:** Secret `arise/gemini-api-key`.
- **How it was deployed:** Pre-provisioned and managed securely in AWS Secrets Manager.
- **Configuration needed:** Lambda execution role has an IAM policy allowing `secretsmanager:GetSecretValue` on `arise/gemini-api-key*`.
- **Verification:** The live `/chat` endpoint successfully read the key and performed Gemini generation.
- **Cost considerations:** $0.40 per secret per month, plus $0.05 per 10,000 API calls (cached by Lambda in memory to minimize lookups).
- **What happens if it stops:** Ask Arise falls back gracefully to the built-in rule-based verdict engine.
- **Where to view in AWS Console:** Open **Secrets Manager** → Select **Secrets**.

---

## 7. Amazon Cognito

- **What it is:** A user identity and access management service supporting user sign-up, sign-in, and OAuth tokens.
- **Why Arise needs it:** Provides secure authentication without requiring us to build custom password hashing, email verification, or session storage.
- **Role in Arise:** Manages registered user accounts and issues JWT tokens used to protect the `/profile` endpoint and unlock the Ask Arise Copilot.
- **Resources created:**
  - User Pool `us-east-1_qm2818Iul`
  - App Client `32g687pdc6dulejhh4tcvd69m7`
- **How it was deployed:** Pre-provisioned Cognito User Pool with Hosted UI and OIDC endpoints.
- **Configuration needed:** Allowed callback/logout URLs pointing to `https://frontend.dqmsa8e2klyso.amplifyapp.com/`.
- **Verification:** Verified OIDC discovery endpoint and confirmed unauthenticated access to `/profile` is rejected with HTTP 401.
- **Cost considerations:** Free tier includes 50,000 monthly active users (MAUs).
- **What happens if it stops:** Users cannot sign in or access profile features, but public views (Today, Map, More) remain accessible.
- **Where to view in AWS Console:** Open **Amazon Cognito** → Select **User pools**.

---

## 8. Summary of File Types in the Deployment

| Category | What it contains | Where it lives |
|---|---|---|
| **Source Code** | Human-readable React JSX and Python scripts | `frontend/src/`, `backend/app/` |
| **Build Artifacts** | Minified JavaScript, CSS, HTML generated by Vite | `frontend/dist/` |
| **Frontend Deployment ZIP** | Root-level static asset package uploaded to Amplify | `artifacts/arise-frontend-dist.zip` |
| **Lambda Deployment Package** | Python code and dependencies compiled by SAM | `.aws-sam/build/` |
| **Infrastructure Templates** | Declarative YAML defining AWS resources | `infra/template.yaml`, `infra/samconfig.toml` |
| **Environment Variables** | Public configuration keys (`VITE_*`, `API_URL`) | `frontend/.env.production`, Lambda environment |
| **Secrets Manager** | Encrypted private API keys (Gemini) | AWS Secrets Manager (`arise/gemini-api-key`) |

---

## 9. How to Redeploy in the Future

### To Redeploy the Frontend:
1. In `frontend/`, run:
   ```bash
   npm run build -- --mode production
   cd dist && zip -r ../../artifacts/arise-frontend-dist.zip . && cd ../..
   python3 artifacts/deploy_amplify.py
   ```

### To Redeploy the Backend:
1. In `infra/`, run:
   ```bash
   sam build
   sam deploy --config-file samconfig.toml --profile arise-dev --region us-east-1 --no-confirm-changeset
   ```

### How to Inspect CloudWatch Logs:
- Run:
  ```bash
  aws logs tail /aws/lambda/arise-production-ApiFunction-f8UwTPbldWrk --profile arise-dev --region us-east-1 --follow
  ```
