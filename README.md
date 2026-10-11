# Arise

Arise is an environmental intelligence platform that turns live air quality and weather signals into practical guidance for people, families, schools, and outdoor activity planning.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![FastAPI](https://img.shields.io/badge/FastAPI-2.0-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19.0-61DAFB.svg?logo=react&logoColor=black)](https://react.dev)
[![AWS](https://img.shields.io/badge/AWS-Serverless-FF9900.svg?logo=amazon-aws&logoColor=white)](https://aws.amazon.com)

## Live Deployments

- Frontend: https://frontend.dqmsa8e2klyso.amplifyapp.com/
- Backend API: https://ll84ry8heh.execute-api.us-east-1.amazonaws.com/prod
- Health Check: https://ll84ry8heh.execute-api.us-east-1.amazonaws.com/prod/health

## Core Capabilities

- Regional air-quality synthesis from ground-station data using IDW interpolation and CPCB-style pollutant sub-indices.
- Persona-specific verdicts (`GO`, `BE SMART`, `CUT BACK`, `STAY IN`) with concrete precautions and safer time windows.
- Grounded “Ask Arise” AI assistant with structured outputs and deterministic fallback behavior.
- Satellite fire-signal and weather ingestion (NASA FIRMS + Open-Meteo) for context-aware recommendations.
- Responsive UI with dual map rendering (Google Maps plus offline-capable SVG fallback).

## Screenshots

### Desktop

| Today Dashboard | Interactive Air Map |
| :---: | :---: |
| ![Today Dashboard](docs/screenshots/today-desktop.png) | ![Air Map](docs/screenshots/map-desktop.png) |

| Ask Arise AI Copilot |
| :---: |
| ![Ask Arise Desktop](docs/screenshots/ask-desktop.png) |

### Mobile

| Mobile Today (Light) | Mobile Ask Copilot | Dark Mode Mobile |
| :---: | :---: | :---: |
| ![Mobile Today](docs/screenshots/today-mobile.png) | ![Mobile Ask](docs/screenshots/ask-mobile.png) | ![Dark Mode](docs/screenshots/theme-dark-mobile.png) |

## Local Setup

### Prerequisites

- Python 3.12+
- Node.js 20.12+
- Git

### Backend (`/home/runner/work/arise/arise/backend`)

```bash
cd /home/runner/work/arise/arise/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env
uvicorn main:app --reload --port 8000
```

Run backend tests:

```bash
cd /home/runner/work/arise/arise/backend
pytest tests/
```

### Frontend (`/home/runner/work/arise/arise/frontend`)

```bash
cd /home/runner/work/arise/arise/frontend
npm ci
cp .env.example .env.local
npm run dev
```

Run frontend checks:

```bash
cd /home/runner/work/arise/arise/frontend
npm test
npm run build
```

## AWS Deployment Overview

Arise is deployed as a serverless stack on AWS:

- AWS Amplify hosts the React SPA.
- API Gateway fronts FastAPI running on Lambda (via Mangum).
- A scheduled ingestion Lambda (EventBridge) refreshes telemetry.
- DynamoDB stores cached telemetry and user records.
- Cognito handles authentication.
- Secrets Manager stores AI provider credentials.

## Documentation

- Architecture & data flow: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Product/design details: [docs/DESIGN.md](docs/DESIGN.md)
- AWS architecture: [docs/AWS_ARCHITECTURE.md](docs/AWS_ARCHITECTURE.md)
- Deployment report: [docs/AWS_DEPLOYMENT_REPORT.md](docs/AWS_DEPLOYMENT_REPORT.md)
- Service-level AWS notes: [docs/AWS_SERVICE_EXPLANATION.md](docs/AWS_SERVICE_EXPLANATION.md)
- Project report: [docs/PROJECT_REPORT.md](docs/PROJECT_REPORT.md)
- Responsive UI validation: [docs/RESPONSIVE_UI_REPORT.md](docs/RESPONSIVE_UI_REPORT.md)
- Infrastructure (SAM): [infra/README.md](infra/README.md)

## Contributors

- Yashansh Rastogi ([@yashanshrastogi](https://github.com/yashanshrastogi))
- Satyam Kumar ([@SatyamSinghRajput04](https://github.com/SatyamSinghRajput04))

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
