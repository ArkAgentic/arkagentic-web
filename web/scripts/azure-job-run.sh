#!/bin/sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

REPORT_DIR="/Users/charleszhang/arkagentic/Azure workloads cost track"
mkdir -p "$REPORT_DIR"

node scripts/azure-milestone3-keepalive.mjs > "$REPORT_DIR/keepalive-report.md"
if command -v az >/dev/null 2>&1; then
  node scripts/check-azure-spend.mjs > "$REPORT_DIR/spend-report.md" || true
fi
KEEPALIVE_REPORT_DIR="$REPORT_DIR" node scripts/export-spend-report.mjs

echo "milestone3 job run complete"
