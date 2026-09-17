#!/usr/bin/env bash
set -euo pipefail

# Azure Container Apps Job entrypoint for daily tracker pipeline.
# Expects tracker Excel in Azure Blob and uploads it back after run.

WORKDIR="/app"
cd "$WORKDIR"

TMP_DIR="/tmp/llm-tracker"
mkdir -p "$TMP_DIR"

: "${TRACKER_STORAGE_ACCOUNT:?TRACKER_STORAGE_ACCOUNT is required}"
: "${TRACKER_BLOB_CONTAINER:?TRACKER_BLOB_CONTAINER is required}"
: "${TRACKER_BLOB_NAME:?TRACKER_BLOB_NAME is required}"

LOCAL_TRACKER="$TMP_DIR/LLM Models Tracker.xlsx"

if [ -n "${AZURE_STORAGE_KEY:-}" ]; then
  STORAGE_AUTH_ARGS=(--account-key "$AZURE_STORAGE_KEY")
else
  STORAGE_AUTH_ARGS=(--auth-mode login)
fi

echo "[1/4] Download tracker from blob"
az storage blob download \
  --account-name "$TRACKER_STORAGE_ACCOUNT" \
  --container-name "$TRACKER_BLOB_CONTAINER" \
  --name "$TRACKER_BLOB_NAME" \
  --file "$LOCAL_TRACKER" \
  "${STORAGE_AUTH_ARGS[@]}" \
  --overwrite true

echo "[2/5] Acquire ARM token from managed identity"
ARM_TOKEN=""
if [ -n "${IDENTITY_ENDPOINT:-}" ] && [ -n "${IDENTITY_HEADER:-}" ]; then
  TOKEN_URL="${IDENTITY_ENDPOINT}?api-version=2019-08-01&resource=https%3A%2F%2Fmanagement.azure.com%2F"
  if [ -n "${AZURE_CLIENT_ID:-}" ]; then
    TOKEN_URL="${TOKEN_URL}&client_id=${AZURE_CLIENT_ID}"
  fi
  ARM_TOKEN="$(curl -fsSL -H "X-IDENTITY-HEADER: ${IDENTITY_HEADER}" "$TOKEN_URL" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token", ""))' || true)"
else
  IMDS_URL="http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https%3A%2F%2Fmanagement.azure.com%2F"
  if [ -n "${AZURE_CLIENT_ID:-}" ]; then
    IMDS_URL="${IMDS_URL}&client_id=${AZURE_CLIENT_ID}"
  fi
  ARM_TOKEN="$(curl -fsSL -H "Metadata: true" "$IMDS_URL" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token", ""))' || true)"
fi

if [ -n "$ARM_TOKEN" ]; then
  export AZURE_ARM_BEARER_TOKEN="$ARM_TOKEN"
  echo "Managed identity token acquired"
else
  echo "Managed identity token unavailable; routes sync may fail" >&2
fi

echo "[3/5] Run daily tracker job"
python3 scripts/cron_jobs/daily_llm_tracker_job.py \
  --excel "$LOCAL_TRACKER" \
  --sheet pricing_worksheet \
  --resource-group "${AZURE_RESOURCE_GROUP:-AI-Resources-RG}" \
  --account "${AZURE_ACCOUNT_NAME:-ArkAgentic}" \
  --notify-email "${NOTIFY_EMAIL:-charles.zhang@arkagentic.com}" \
  --no-auto-login \
  --apply

echo "[4/5] Upload tracker back to blob"
az storage blob upload \
  --account-name "$TRACKER_STORAGE_ACCOUNT" \
  --container-name "$TRACKER_BLOB_CONTAINER" \
  --name "$TRACKER_BLOB_NAME" \
  --file "$LOCAL_TRACKER" \
  "${STORAGE_AUTH_ARGS[@]}" \
  --overwrite true

echo "[5/5] Done"
