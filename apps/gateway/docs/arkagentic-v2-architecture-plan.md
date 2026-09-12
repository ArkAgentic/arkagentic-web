# ArkAgentic V2 Architecture Plan

## Route topology
- `/` global brand homepage (multi-product hero)
- `/llmapigateway` gateway product page
- `/llmapigateway/console/*` dedicated gateway console
- `/headhunter` headhunter product portal
- `/headhunter/console` candidate console
- `/solutions` enterprise build service page

## Zero-regression policy
- Existing gateway APIs remain unchanged under `/api/console/*`, `/api/admin/*`, `/v1/chat/completions`.
- Existing `/console/*` can remain available as compatibility paths while traffic moves to `/llmapigateway/console/*`.
- Headhunter data is isolated in Postgres schema `headhunter`.

## Headhunter data model (isolated schema)
- `headhunter.users`
- `headhunter.resumes`
- `headhunter.agent_runs`
- `headhunter.saved_jobs`

## Foundry integration
- Frontend never sends Azure secrets.
- Backend proxy endpoints:
  - `POST /api/headhunter/parse-cv`
  - `POST /api/headhunter/run-agent`
  - `GET /api/headhunter/console/history`
- `AZURE_FOUNDRY_AGENT_RUN_URL` + `AZURE_FOUNDRY_API_KEY` configured server-side.
