# AGENTS.md — Repository Operating Instructions & Persistent Memory Protocol

**Welcome to Arise.** This file contains the permanent operating rules that every coding session must follow.
Do not rely on conversation history as the main source of project memory. Store and recover all essential project details, decisions, instructions, completed work, and pending tasks in the project's markdown files.

---

## 1. Canonical Sources of Truth

Always consult and maintain these authoritative files based on the type of information needed:

| Information Type | Canonical File | Scope & Authority |
|---|---|---|
| **Current State & Active Handoff** | [PROJECT_STATE.md](PROJECT_STATE.md) | Single source of truth for current project memory, latest milestone, verified results, blockers, and pending tasks. |
| **Operating Rules & Protocols** | [AGENTS.md](AGENTS.md) | Permanent rules for all agent sessions, new-session recovery workflow, and end-of-task update protocol. |
| **Domain Knowledge & Invariants** | [SKILL.md](SKILL.md) | Core architecture, CPCB NAQI math, deterministic verdict rules, failure modes, recovery rules. |
| **Product Specifications** | [PRODUCT.md](PRODUCT.md) | User personas, feature acceptance criteria, implementation status, rejected decisions. |
| **Tooling & Operations** | [TOOLS.md](TOOLS.md) | Python/Node environment, verified test/build commands, local servers, safety rules. |
| **Historical Record & Audit Log** | [CHANGELOG.md](CHANGELOG.md) | Chronological log of significant tasks, decisions, verified results, and blockers. |
| **Deep-Dive Architecture** | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Detailed subsystem data flows, Mermaid diagrams, AWS serverless integration. |
| **Visual Design Tokens** | [docs/DESIGN.md](docs/DESIGN.md) | Persona color bands, UI components, responsive layout specifications. |

*Rule:* Maintain **One Source of Truth per Information Type**. Do not duplicate long sections across several files; link to the canonical source instead.

---

## 2. Permanent Agent Rules

Every coding session must adhere to these non-negotiable rules:

1. **Read Before Editing:** Read project instructions ([AGENTS.md](AGENTS.md)) and current project state ([PROJECT_STATE.md](PROJECT_STATE.md)) before doing any work.
2. **Inspect Existing State:** Inspect existing code, git branch, and uncommitted working-tree changes before making edits.
3. **Preserve User Changes:** Never revert, overwrite, or rewrite unrelated user changes. Preserve existing uncommitted modifications.
4. **Evidence Over Claims:** Never claim that work, tests, APIs, or deployments succeeded without direct, reproducible evidence from command output.
5. **No Unapproved Cloud Actions:** Never run `sam deploy`, `sam delete`, modify DynamoDB tables, alter IAM policies, or make live cloud changes without clear, explicit user permission.
6. **Location Integrity:** Keep environmental data strictly tied to the requested coordinates. Never silently substitute Delhi data as a fallback for another city or location.
7. **Deterministic Science Authority:** Atmospheric calculations (CPCB NAQI sub-indices, dominant pollutant, health risk tier) are strictly deterministic Python/JS functions. The AI Copilot (*Ask Arise*) **must never** override or contradict the deterministic calculation or safety verdict (`GO`, `BE SMART`, `CUT BACK`, `STAY IN`).
8. **Truthful Telemetry Labels:** Clearly label missing, stale, estimated, and observed data. Never coerce missing pollutant data to zero; display `—` (*Unavailable*).
9. **Record Blockers Honestly:** Document blockers, API limitations, or quota errors explicitly in [PROJECT_STATE.md](PROJECT_STATE.md) instead of silently bypassing or masking them.
10. **Zero Secrets in Documentation:** Never copy `.env` contents, API keys, tokens, or credentials into documentation or commits. Refer to environment variable names only.

---

## 3. Mandatory New-Session Recovery Workflow

Every new coding session or subagent must execute this recovery sequence before modifying files:

1. **Read [AGENTS.md](AGENTS.md)** to load the permanent operating rules and safety constraints.
2. **Read [PROJECT_STATE.md](PROJECT_STATE.md)** to recover the current milestone, verified test results, blockers, and pending tasks.
3. **Read relevant sections** of [PRODUCT.md](PRODUCT.md), [TOOLS.md](TOOLS.md), architecture, design, and skill documentation as needed for the active task.
4. **Inspect Git status** (`git status`) and recent changes before editing to understand uncommitted working-tree state.
5. **Identify the last verified milestone** and any unfinished task from [PROJECT_STATE.md](PROJECT_STATE.md).
6. **Check whether the user's latest prompt** modifies, refines, or supersedes the existing plan.
7. **Continue from the correct point** instead of repeating completed work.
8. **Inspect the repository and evidence directly** if the state is unclear. Do not blindly follow an outdated note if the actual code contradicts it; repository reality takes precedence over stale documentation.
9. **Ask the user a question only when** a missing decision, credential, or permission genuinely blocks progress.

---

## 4. End-of-Task Memory Update Protocol

After completing any meaningful feature, bug fix, investigation, or testing milestone:

1. **Update [PROJECT_STATE.md](PROJECT_STATE.md)** with the new current state, current milestone, verified results, and pending tasks.
2. **Update [CHANGELOG.md](CHANGELOG.md)** with the date, what changed, why it changed, tests performed, verified outcomes, remaining blockers, and deployment status.
3. **Update [PRODUCT.md](PRODUCT.md), [TOOLS.md](TOOLS.md), [README.md](README.md)**, architecture, or design files only when the work directly impacts them.
4. **Record actual test commands and results** with execution times and dates.
5. **Record unresolved issues, blockers, and required manual actions** (e.g. AWS console approvals, missing optional API keys).
6. **Identify the exact next useful task** and its dependencies.
7. **Verify that documentation matches actual code changes.** Do not create documentation noise for trivial one-line edits; group related changes into one coherent update.
8. **Check `git status`** before finishing. Ensure user work remains intact. Do not commit or push changes unless explicitly instructed.

---

## 5. Verified Development & Verification Commands

All commands run inside WSL2 Ubuntu (`cd ~/arise`):

```bash
# 1. Activate Python virtual environment & run core backend tests (23 tests)
cd ~/arise
source .venv/bin/activate
pytest backend/tests/test_profile_auth.py backend/tests/test_api_routes.py backend/tests/test_environment_service.py -v

# 2. Run comprehensive backend regression suite (250 tests)
source .venv/bin/activate
pytest backend/tests/

# 3. Source Node 24 via NVM & run frontend unit tests (58 tests)
cd ~/arise/frontend
source ~/.nvm/nvm.sh && nvm use 24
npm test

# 4. Build frontend production bundle (Vite)
cd ~/arise/frontend
source ~/.nvm/nvm.sh && nvm use 24
npm run build

# 5. Validate AWS SAM Infrastructure template
cd ~/arise/infra
sam validate
```

> **Critical Caveats:**
> - In non-interactive shells or subshells, WSL defaults to system Node 18, which causes Vite 8 / Rolldown build errors (`styleText`). Always activate Node 24 via `source ~/.nvm/nvm.sh && nvm use 24`.
> - Do not run bare `pytest` without arguments from the root directory; always specify `backend/tests/` to prevent pytest from collecting integration test scripts in `artifacts/`.
> - In Antigravity IDE on Windows, open the project using the Windows UNC path `\\wsl.localhost\Ubuntu-24.04\home\yashansh_rastogi\arise` to ensure `.agents/rules/` and `AGENTS.md` are traversed unconditionally by the Windows agent runner.

---

## 6. Efficient Task Execution

When executing coding and maintenance tasks:

1. **Pre-Change Inspection:** Inspect relevant code, project instructions, and Git status before making changes.
2. **Scoping & Focus:** Define a small, clear scope and avoid unrelated rewrites.
3. **Targeted Changes & Testing:** Make focused changes and run only relevant tests.
4. **Avoid Redundant Tool Loops:** Avoid repeatedly inspecting unchanged files or rerunning passing tests without a reason.
5. **Proactive Blocker Reporting:** Report blockers instead of entering repeated tool or debugging loops.
6. **Execution Velocity:** Aim for an initial implementation and status report within 15–30 minutes for ordinary tasks, without skipping necessary verification.
7. **Record Maintenance:** Update [PROJECT_STATE.md](PROJECT_STATE.md), [CHANGELOG.md](CHANGELOG.md), and other relevant project records after meaningful changes.
8. **Comprehensive Reporting:** Report changed files, actual test results, remaining issues, manual steps, and deployment status.
9. **Strict Authorization Boundaries:** Never commit, push, deploy, modify secrets, or change cloud permissions without explicit approval.

