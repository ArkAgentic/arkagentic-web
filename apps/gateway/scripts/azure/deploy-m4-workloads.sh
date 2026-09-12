#!/usr/bin/env bash
set -euo pipefail

# Idempotent deploy script for ArkAgentic Milestone-4 workload split.
# Usage:
#   RG=rg-arkagentic-prod LOCATION=southeastasia ./scripts/azure/deploy-m4-workloads.sh

RG="${RG:-rg-arkagentic-prod}"
LOCATION="${LOCATION:-southeastasia}"
ACA_ENV="${ACA_ENV:-arkag-aca-env}"
WEB_APP="${WEB_APP:-arkag-web-ssr}"
API_APP="${API_APP:-arkag-api-gateway}"
ACR_NAME="${ACR_NAME:-ca5d44f65c74acr}"
DNS_ZONE="${DNS_ZONE:-arkagentic.com}"
API_HOST="${API_HOST:-gateway.arkagentic.com}"
PG_SERVER="${PG_SERVER:-arkag-pg-flex-app}"
PG_DB="${PG_DB:-arkagentic}"
KV_NAME="${KV_NAME:-arkag-kv-prod}"
REDIS_CLUSTER="${REDIS_CLUSTER:-arkag-redis}"
FOUNDER_ADMIN_EMAIL="${FOUNDER_ADMIN_EMAIL:-charles.zhang@arkagentic.com}"

log() { printf '\n[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }

resource_exists() {
  local type="$1" name="$2"
  az resource show -g "$RG" -n "$name" --resource-type "$type" >/dev/null 2>&1
}

log "Ensuring Key Vault exists"
if ! az keyvault show -g "$RG" -n "$KV_NAME" >/dev/null 2>&1; then
  az keyvault create -g "$RG" -n "$KV_NAME" -l "$LOCATION" --enable-rbac-authorization true >/dev/null
fi

log "Ensuring API container app exists"
if ! az containerapp show -g "$RG" -n "$API_APP" >/dev/null 2>&1; then
  az containerapp create \
    -g "$RG" -n "$API_APP" \
    --environment "$ACA_ENV" \
    --image "$ACR_NAME.azurecr.io/arkag-web-ssr:latest" \
    --ingress external --target-port 3000 \
    --registry-server "$ACR_NAME.azurecr.io" \
    --registry-username "${ACR_NAME}" \
    --registry-password "$(az acr credential show -n "$ACR_NAME" --query 'passwords[0].value' -o tsv)" \
    --cpu 1 --memory 2Gi >/dev/null
fi

API_FQDN="$(az containerapp show -g "$RG" -n "$API_APP" --query properties.configuration.ingress.fqdn -o tsv)"

log "Pointing api DNS to API container app"
if az network dns record-set a show -g "$RG" -z "$DNS_ZONE" -n api >/dev/null 2>&1; then
  az network dns record-set a delete -g "$RG" -z "$DNS_ZONE" -n api --yes >/dev/null
fi
if ! az network dns record-set cname show -g "$RG" -z "$DNS_ZONE" -n api >/dev/null 2>&1; then
  az network dns record-set cname create -g "$RG" -z "$DNS_ZONE" -n api --ttl 60 >/dev/null
fi
az network dns record-set cname set-record -g "$RG" -z "$DNS_ZONE" -n api -c "$API_FQDN" >/dev/null

log "Binding api custom hostname"
az containerapp hostname add -g "$RG" -n "$API_APP" --hostname "$API_HOST" >/dev/null || true
az containerapp hostname bind -g "$RG" -n "$API_APP" --environment "$ACA_ENV" --hostname "$API_HOST" >/dev/null || true

log "Ensuring PostgreSQL flexible server exists"
if ! az postgres flexible-server show -g "$RG" -n "$PG_SERVER" >/dev/null 2>&1; then
  : "${PG_ADMIN_PASSWORD:?PG_ADMIN_PASSWORD env var required when creating PG server}"
  az postgres flexible-server create \
    -g "$RG" -n "$PG_SERVER" -l "$LOCATION" \
    --admin-user pgadmin \
    --admin-password "$PG_ADMIN_PASSWORD" \
    --sku-name Standard_B1ms --tier Burstable --version 16 --storage-size 32 \
    --public-access All >/dev/null
fi

az postgres flexible-server db create -g "$RG" -s "$PG_SERVER" -d "$PG_DB" >/dev/null || true

log "Reading Redis endpoint"
REDIS_HOST="$(az redisenterprise show -g "$RG" -n "$REDIS_CLUSTER" --query hostName -o tsv)"
REDIS_PORT="$(az redisenterprise database list -g "$RG" --cluster-name "$REDIS_CLUSTER" --query '[0].port' -o tsv)"

log "Updating ACA app env vars"
az containerapp update -g "$RG" -n "$WEB_APP" --set-env-vars \
  FOUNDER_ADMIN_EMAIL="$FOUNDER_ADMIN_EMAIL" \
  NEXT_PUBLIC_BACKEND_BASE_URL="https://$API_HOST" >/dev/null

az containerapp update -g "$RG" -n "$API_APP" --set-env-vars \
  FOUNDER_ADMIN_EMAIL="$FOUNDER_ADMIN_EMAIL" \
  REDIS_HOST="$REDIS_HOST" \
  REDIS_PORT="$REDIS_PORT" >/dev/null

log "Done."
echo "API_FQDN=$API_FQDN"
