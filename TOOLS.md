# TOOLS.md — Arise environment (read first, every task)
- OS: WSL2 Ubuntu 24.04. Project root: ~/arise (never use /mnt/c).
- Python 3.12.3 in ~/arise/.venv. Always `source .venv/bin/activate` first.
- Installed in .venv: strands-agents, fastapi, boto3, uvicorn, httpx, python-dotenv, awscli-local.
- Node 24.21 (nvm), npm 11. Frontend = React + Vite + Tailwind + Leaflet + Recharts.
- Docker works without sudo. AWS CLI 2.37, SAM CLI 1.167, lstk 1.3 (LocalStack), Ollama 0.40.
- No AWS credentials configured yet. Region for AWS = us-east-1.
## Rules
1. Use only the tools above. Ask before installing anything new.
2. Secrets only in .env (git-ignored). Never print or commit keys.
3. Never touch real AWS (deploy/delete) without my explicit OK. LocalStack/local first.
4. After every change: run it/test it and tell me exactly how to see it.
5. Commit after each working step with a clear message.
6. Ask me before destructive commands (rm -rf, sam delete, docker prune).
7. One feature per task. Keep code simple and commented in plain English.
