# LLM Tracker Daily Cron Jobs

This folder contains the 3-script daily pipeline (separated by responsibility):

1. `sync_llm_models_tracker.py`
   - Syncs `LLM Models Tracker.xlsx` model rows with Azure Foundry deployments
   - Appends new models
   - Prunes removed models (`--prune-missing`)

2. `fetch_foundry_prices_to_tracker.py`
   - Fetches Azure pricing and fills cost columns
   - **Default behavior:** only processes rows newly appended by step 1
   - If `price_input_usd_per_1m` + `price_output_usd_per_1m` already filled (including `0`), it skips fetch and does not notify

3. `sync_arkagentic_pricing_from_tracker.py`
   - Syncs ArkAgentic from tracker
   - Code side: updates `src/lib/pricing-schema.ts`
   - DB side: invokes `scripts/sync-azure-deployments.mjs` for route/channel sync

And one orchestrator:

- `daily_llm_tracker_job.py`
  - Runs step 1 -> step 2 -> step 3 in order

## Local run

Dry run:

```bash
cd web
python3 scripts/cron_jobs/daily_llm_tracker_job.py --excel "LLM Models Tracker.xlsx" --dry-run
```

Apply:

```bash
cd web
python3 scripts/cron_jobs/daily_llm_tracker_job.py \
  --excel "LLM Models Tracker.xlsx" \
  --apply \
  --notify-email charles.zhang@arkagentic.com
```

## Azure deployment recommendation

Use Azure Container Apps Job (Schedule trigger), and mount/persist tracker file via **Azure Blob**:

- Storage account: `arkag0807050122`
- Container (recommended new): `llm-tracker`
- Blob path example: `LLM Models Tracker.xlsx`

At each run:
1. Download blob -> local temp file
2. Run daily job against local file
3. Upload local file back to blob (overwrite)

## Required env for Azure job

### For model sync and price fetch
- `AZURE_RESOURCE_GROUP`
- `AZURE_ACCOUNT_NAME`
- Azure login / managed identity with access to list Foundry deployments

### For DB sync step (script `sync-azure-deployments.mjs`)
- `DATABASE_URL`
- `ENCRYPTION_SECRET`
- Azure endpoint/key or ARM credentials expected by that script:
  - `AZURE_OPENAI_ENDPOINT` + `AZURE_OPENAI_API_KEY` (preferred)
  - or ARM credential set

### For email notification (optional)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

## Important behavior

- Daily fetch only targets newly appended models by default.
- Existing rows with manually set prices (including zero) are untouched.
- Notification email is only sent when there are unmatched rows in the active fetch scope.
