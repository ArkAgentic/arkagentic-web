# Release Notes — 2026-09-02 — API Gateway Production Hardening

## Scope
This release finalizes two major tracks:

1. Gateway hardening under real concurrency pressure
2. Azure Foundry model synchronization and health observability

## 1) Gateway Hardening (Completed)

### Delivered
- Per-API-key concurrency semaphore using Redis lock keys
- Queue smoothing before hard reject to reduce burst failures
- Smart fallback execution path with retryable failure handling
- Fallback response headers contract:
  - `X-Ark-Fallback: true`
  - `X-Ark-Actual-Model: <actual-routed-model>`
- Stream transport diagnostics and resilience:
  - Added structured logs for upstream fetch and stream relay failures
  - Stream reader/replay error handling path hardened
- Undici dispatcher compatibility guard in route runtime

### Verification status
- Concurrency lock behavior verified with 429 guard under stress
- Queue wait observed under higher concurrency tiers
- Fallback header observed in stress validation runs
- Stream scenarios validated with mixed concurrency tiers

## 2) Azure Foundry Model Sync (Completed)

### Delivered
- Automated sync entrypoint:
  - `npm run sync:models`
- Script:
  - `scripts/sync-azure-deployments.mjs`
- Admin trigger endpoint:
  - `POST /api/admin/models/sync`

### Sync logic
- Pull deployments from Azure (data-plane first, ARM fallback)
- Keep only `Succeeded` deployments
- Map deployment names to gateway model IDs (`ark-*`)
- Upsert into:
  - `upstream_channels`
  - `upstream_model_routes`
- Mark removed deployments as inactive routes
- Update deployment metadata used by `/console/models`

### ARM credentials and compatibility hardening
- Added support for `AZURE_ACCOUNT_NAME`
- Supports ARM token from:
  - Service Principal (`AZURE_TENANT_ID` + `AZURE_CLIENT_ID` + `AZURE_CLIENT_SECRET`)
  - `AZURE_ARM_BEARER_TOKEN`
  - Azure CLI (`az account get-access-token`)
- ARM API version fallback chain implemented to handle subscription/provider variance

## 3) New Read-Only Admin Model Health Probe (Completed)

### New endpoint
- `GET /api/admin/models/health`
- File:
  - `src/app/api/admin/models/health/route.ts`

### Auth
- Admin-only via existing JWT session role check

### Response includes
- Full active model list from DB routes
- Channel connectivity status summary (`connected` derived from channel health)
- Deployment type aggregate counts (for monitoring/reporting)
- Per-channel health details and active model counts

This endpoint is intended for CI/CD post-deploy checks and monitoring probes without UI dependency.

## 4) Operational validation snapshot

Latest live sync execution summary:
- Azure fetch source: ARM
- Deployments discovered: 24
- Succeeded deployments synced: 24
- Routes upserted: 24
- Disabled routes: 0
- Active routes on sync channel: 24

## 5) Remaining known constraints
- Browser-based `/console/models` visual check depends on active admin login session and local browser remote-debug permissions.
- API-based health and sync checks are available for non-UI automation.

## 6) Production sign-off

Status: **READY FOR PRODUCTION OPERATIONS**

Sign-off basis:
- Hardening controls implemented and validated with runtime evidence
- Automated model synchronization established and verified live
- Monitoring probe endpoint added for ongoing health verification
- No blocking defects found in the completed scope
