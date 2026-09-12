#!/usr/bin/env bash
set -euo pipefail

# One-click release for ArkAgentic web (ACR + ACA)
# Usage:
#   scripts/release/deploy-web-aca.sh
# Optional env override:
#   RG=rg-arkagentic-prod ACA_APP=arkag-web-ssr ACR_NAME=ca5d44f65c74acr scripts/release/deploy-web-aca.sh

RG="${RG:-rg-arkagentic-prod}"
ACA_APP="${ACA_APP:-arkag-web-ssr}"
ACR_NAME="${ACR_NAME:-ca5d44f65c74acr}"
IMAGE_REPO="${IMAGE_REPO:-arkag-web-ssr}"
SRC_DIR="${SRC_DIR:-/Users/charleszhang/arkagentic/web}"
HEALTH_WAIT_SECS="${HEALTH_WAIT_SECS:-90}"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

require_cmd az
require_cmd jq

[[ -d "$SRC_DIR" ]] || die "Source directory not found: $SRC_DIR"

log "Checking Azure CLI login context"
az account show >/dev/null 2>&1 || die "Not logged in to Azure CLI. Run: az login"

PREV_IMAGE="$(az containerapp show -g "$RG" -n "$ACA_APP" --query 'properties.template.containers[0].image' -o tsv)"
[[ -n "$PREV_IMAGE" ]] || die "Unable to read current image from ACA app: $ACA_APP"

TAG="$(date +%Y%m%d%H%M%S)"
NEW_IMAGE="$ACR_NAME.azurecr.io/$IMAGE_REPO:$TAG"

log "Running build gate: npm run build"
( cd "$SRC_DIR" && npm run build )

log "Building and pushing image to ACR: $NEW_IMAGE"
az acr build --registry "$ACR_NAME" --image "$IMAGE_REPO:$TAG" "$SRC_DIR"

log "Updating ACA app image"
az containerapp update -g "$RG" -n "$ACA_APP" --image "$NEW_IMAGE" >/dev/null

log "Waiting for revision rollout ($HEALTH_WAIT_SECS s)"
sleep "$HEALTH_WAIT_SECS"

log "Fetching latest revision status"
REV_JSON="$(az containerapp revision list -g "$RG" -n "$ACA_APP" -o json)"
LATEST_REV="$(echo "$REV_JSON" | jq -r 'sort_by(.properties.createdTime) | last')"
LATEST_NAME="$(echo "$LATEST_REV" | jq -r '.name')"
LATEST_HEALTH="$(echo "$LATEST_REV" | jq -r '.properties.healthState // "None"')"
LATEST_RUNNING="$(echo "$LATEST_REV" | jq -r '.properties.runningState // "Unknown"')"
LATEST_TRAFFIC="$(echo "$LATEST_REV" | jq -r '.properties.trafficWeight // 0')"

CURRENT_IMAGE="$(az containerapp show -g "$RG" -n "$ACA_APP" --query 'properties.template.containers[0].image' -o tsv)"

echo
printf 'Release Summary\n'
printf '  Previous image : %s\n' "$PREV_IMAGE"
printf '  New image      : %s\n' "$NEW_IMAGE"
printf '  Current image  : %s\n' "$CURRENT_IMAGE"
printf '  Revision        : %s\n' "$LATEST_NAME"
printf '  Health          : %s\n' "$LATEST_HEALTH"
printf '  Running         : %s\n' "$LATEST_RUNNING"
printf '  Traffic         : %s\n' "$LATEST_TRAFFIC"

if [[ "$CURRENT_IMAGE" != "$NEW_IMAGE" || "$LATEST_HEALTH" != "Healthy" || "$LATEST_RUNNING" != "Running" || "$LATEST_TRAFFIC" != "100" ]]; then
  echo
  echo "Release verification did not meet healthy=Running+100% traffic gate."
  echo "Rollback hint:"
  echo "  az containerapp update -g $RG -n $ACA_APP --image $PREV_IMAGE"
  exit 2
fi

log "Release completed successfully"
echo "Rollback hint (if needed later):"
echo "  az containerapp update -g $RG -n $ACA_APP --image $PREV_IMAGE"
