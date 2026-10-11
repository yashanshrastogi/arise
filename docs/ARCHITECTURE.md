# Arise — System Architecture & Data Flow

**Delhi-NCR Atmospheric & Environmental Intelligence Platform**

---

## 1. High-Level System Architecture

Arise is a cloud-native, serverless environmental intelligence platform built on AWS and React 19.

```mermaid
flowchart TD
    subgraph Client["Frontend Client (AWS Amplify)"]
        SPA["React 19 + Vite SPA"]
        AuthContext["Cognito Auth (PKCE)"]
        TimeContext["Time Synchronization (Asia/Kolkata)"]
        DualMap["Dual Map Engine: Google Maps + SVG Vector Fallback"]
    end

    subgraph Edge["Edge & Security Layer"]
        AmplifyCDN["Amplify CloudFront Edge CDN"]
        APIGateway["Amazon API Gateway HTTP API (/prod)"]
        CORS["Strict CORS Allowlist"]
    end

    subgraph Compute["AWS Serverless Compute"]
        ApiLambda["ApiFunction (FastAPI + Mangum, Python 3.12)"]
        IngestLambda["IngestionFunction (Scheduled Ingestion)"]
    end

    subgraph Storage["Storage & Secrets"]
        DynamoCache[("DynamoDB arise-cache-prod (TTL)")]
        DynamoUsers[("DynamoDB arise-users-prod (SSE)")]
        SecretsManager["AWS Secrets Manager (arise/gemini-api-key)"]
    end

    subgraph External["External Telemetry Providers"]
        OpenAQ["OpenAQ v3 API (CPCB Delhi Stations)"]
        OpenMeteo["Open-Meteo Weather API (Hourly, Astronomy)"]
        NASAFIRMS["NASA FIRMS Satellite Fire Signals (VIIRS/MODIS)"]
        GeminiAPI["Google Gemini AI API (3.5-flash-lite)"]
    end

    SPA -->|HTTPS| AmplifyCDN
    SPA -->|REST API Requests| APIGateway
    APIGateway --> CORS
    CORS --> ApiLambda

    ApiLambda --> DynamoCache
    ApiLambda --> DynamoUsers
    ApiLambda --> SecretsManager
    ApiLambda --> GeminiAPI
    ApiLambda --> OpenMeteo

    IngestLambda -->|Hourly Ingestion| OpenAQ
    IngestLambda -->|Hourly Ingestion| NASAFIRMS
    IngestLambda --> DynamoCache

    AuthContext <-->|OAuth 2.0 PKCE| Cognito["AWS Cognito User Pool"]
```

---

## 2. Telemetry Ingestion & Synthesis Pipeline

```mermaid
flowchart LR
    subgraph Sources["Live Data Ingestion"]
        CPCB["CPCB / OpenAQ v3 Ground Sensors"]
        Meteo["Open-Meteo Hourly Forecasts"]
        FIRMS["NASA FIRMS Satellite Thermal Signals"]
    end

    subgraph Pipeline["Processing & Mathematics Engine"]
        IDW["Spatial IDW Interpolation Engine (Power = 2)"]
        NAQI["Indian CPCB NAQI Sub-Index Calculator"]
        Verdict["Persona Verdict Engine (GO / BE SMART / CUT BACK / STAY IN)"]
        Window["Diurnal Dispersion & Safe Window Evaluator"]
    end

    subgraph Output["Unified Environmental Payload"]
        Snapshot["Real-Time Air Quality Snapshot"]
        Timeline["24-Hour & 7-Day Forecast Timeline"]
        Advisories["School & Personal Health Advisories"]
    end

    CPCB --> IDW
    IDW --> NAQI
    NAQI --> Verdict
    Meteo --> Window
    FIRMS --> Snapshot
    Verdict --> Snapshot
    Window --> Timeline
    Snapshot --> Output
    Timeline --> Output
```

---

## 3. Ask Arise AI Copilot Architecture

```mermaid
sequenceDiagram
    autonumber
    actor User as Citizen / User
    participant Frontend as Ask Arise (React)
    participant Guardrail as Client/Server Guardrails
    participant Lambda as ApiFunction (FastAPI)
    participant Gemini as Google Gemini (3.5-flash-lite)
    participant Critic as 2-Stage Critic Evaluator
    participant RuleEngine as Deterministic Rule Fallback

    User->>Frontend: Submits question (e.g., "Can my kid play outside?")
    Frontend->>Guardrail: Pre-flight domain check (isEnvironmentalQuery)
    alt Off-Topic Query
        Guardrail-->>Frontend: Reject pre-flight with polite guidance
        Frontend-->>User: Display scope guidance card
    else Environmental Query
        Frontend->>Lambda: POST /chat with coordinates & persona
        Lambda->>Guardrail: Server-side guardrail validation
        Lambda->>Gemini: Prompt with live telemetry & tools
        alt Gemini Available
            Gemini-->>Critic: Generates structured verdict JSON
            Critic->>Critic: Verifies statements match grounded numbers
            Critic-->>Lambda: Validated response
        else Gemini Unavailable / Timeout (>25s)
            Lambda->>RuleEngine: Deterministic CPCB NAQI evaluation
            RuleEngine-->>Lambda: Rule-based structured verdict
        end
        Lambda-->>Frontend: HTTP 200 (Structured JSON Verdict)
        Frontend-->>User: Render formatted verdict card with sources & timestamp
    end
```

---

## 4. Security & Isolation Matrix

| Layer | Implementation | Security Control |
| :--- | :--- | :--- |
| **Edge & CDN** | AWS Amplify Hosting | Strict Content-Security-Policy headers, TLS 1.3, DDoS protection |
| **API Gateway** | HTTP API v2 | Explicit origin allowlist (no wildcard `*`), proxy route throttling |
| **Compute** | AWS Lambda (Python 3.12) | Principle of least privilege IAM execution roles; ephemeral execution |
| **Secrets** | AWS Secrets Manager | API keys stored encrypted with KMS; zero hardcoded credentials |
| **User Data** | Amazon DynamoDB | Server-Side Encryption (SSE); strict per-user partition key isolation |
| **Identity** | Amazon Cognito | OAuth 2.0 PKCE authentication flow; JWT validation on protected routes |
