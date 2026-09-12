#!/usr/bin/env bash
set -euo pipefail

RG="${RG:-rg-arkagentic-prod}"
KV_NAME="${KV_NAME:-arkagkvprod2026}"
IDENTITY_NAME="${IDENTITY_NAME:-arkag-uami-runtime}"
WEB_APP="${WEB_APP:-arkag-web-ssr}"
API_APP="${API_APP:-arkag-api-gateway}"

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }

log "Ensuring user-assigned managed identity"
if ! az identity show -g "$RG" -n "$IDENTITY_NAME" >/dev/null 2>&1; then
  az identity create -g "$RG" -n "$IDENTITY_NAME" -o none
fi

IDENTITY_ID=$(az identity show -g "$RG" -n "$IDENTITY_NAME" --query id -o tsv)
IDENTITY_PRINCIPAL_ID=$(az identity show -g "$RG" -n "$IDENTITY_NAME" --query principalId -o tsv)
KV_ID=$(az keyvault show -g "$RG" -n "$KV_NAME" --query id -o tsv)

log "Assigning Key Vault Secrets User role to UAMI"
az role assignment create \
  --assignee-object-id "$IDENTITY_PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" \
  --scope "$KV_ID" -o none || true

log "Ensuring container apps use UAMI"
az containerapp identity assign -g "$RG" -n "$WEB_APP" --user-assigned "$IDENTITY_ID" -o none
az containerapp identity assign -g "$RG" -n "$API_APP" --user-assigned "$IDENTITY_ID" -o none

log "Writing Key Vault placeholders for required secrets"
az keyvault secret set --vault-name "$KV_NAME" --name stripe-secret-key --value "not-configured" -o none
az keyvault secret set --vault-name "$KV_NAME" --name stripe-webhook-secret --value "not-configured" -o none
az keyvault secret set --vault-name "$KV_NAME" --name moonshot-api-key --value "not-configured" -o none
az keyvault secret set --vault-name "$KV_NAME" --name jwt-signing-key --value "not-configured" -o none

KV_URI=$(az keyvault show -g "$RG" -n "$KV_NAME" --query properties.vaultUri -o tsv)

log "Binding Key Vault references into container app secrets"
az containerapp secret set -g "$RG" -n "$WEB_APP" --secrets \
  stripe-sec=keyvaultref:${KV_URI}secrets/stripe-secret-key,identityref:${IDENTITY_ID} \
  stripehook=keyvaultref:${KV_URI}secrets/stripe-webhook-secret,identityref:${IDENTITY_ID} \
  moonshotkey=keyvaultref:${KV_URI}secrets/moonshot-api-key,identityref:${IDENTITY_ID} \
  jwtsignkey=keyvaultref:${KV_URI}secrets/jwt-signing-key,identityref:${IDENTITY_ID} -o none

az containerapp secret set -g "$RG" -n "$API_APP" --secrets \
  stripe-sec=keyvaultref:${KV_URI}secrets/stripe-secret-key,identityref:${IDENTITY_ID} \
  stripehook=keyvaultref:${KV_URI}secrets/stripe-webhook-secret,identityref:${IDENTITY_ID} \
  moonshotkey=keyvaultref:${KV_URI}secrets/moonshot-api-key,identityref:${IDENTITY_ID} \
  jwtsignkey=keyvaultref:${KV_URI}secrets/jwt-signing-key,identityref:${IDENTITY_ID} -o none

log "Mapping env vars to secret refs"
az containerapp update -g "$RG" -n "$WEB_APP" --set-env-vars \
  STRIPE_SECRET_KEY=secretref:stripe-sec \
  STRIPE_WEBHOOK_SECRET=secretref:stripehook \
  MOONSHOT_API_KEY=secretref:moonshotkey \
  JWT_SIGNING_KEY=secretref:jwtsignkey \
  KEY_VAULT_URI="$KV_URI" -o none

az containerapp update -g "$RG" -n "$API_APP" --set-env-vars \
  STRIPE_SECRET_KEY=secretref:stripe-sec \
  STRIPE_WEBHOOK_SECRET=secretref:stripehook \
  MOONSHOT_API_KEY=secretref:moonshotkey \
  JWT_SIGNING_KEY=secretref:jwtsignkey \
  KEY_VAULT_URI="$KV_URI" -o none

log "Done"
echo "IDENTITY_ID=$IDENTITY_ID"
