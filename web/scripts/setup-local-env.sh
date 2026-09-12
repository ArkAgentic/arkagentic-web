#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$ROOT_DIR/.env.example" ]]; then
    cp "$ROOT_DIR/.env.example" "$ENV_FILE"
  else
    touch "$ENV_FILE"
  fi
fi

set_kv() {
  local key="$1"
  local value="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    printf "%s=%s\n" "$key" "$value" >> "$ENV_FILE"
  fi
}

read -r -p "DATABASE_URL: " DATABASE_URL
read -r -s -p "ENCRYPTION_SECRET (32+ chars): " ENCRYPTION_SECRET; echo
read -r -p "AZURE_PROJECT_ENDPOINT: " AZURE_PROJECT_ENDPOINT
read -r -s -p "AZURE_OPENAI_API_KEY: " AZURE_OPENAI_API_KEY; echo

if [[ ${#ENCRYPTION_SECRET} -lt 32 ]]; then
  echo "[ERROR] ENCRYPTION_SECRET 太短，至少 32 字符。"
  exit 1
fi

set_kv "DATABASE_URL" "$DATABASE_URL"
set_kv "ENCRYPTION_SECRET" "$ENCRYPTION_SECRET"
set_kv "AZURE_PROJECT_ENDPOINT" "$AZURE_PROJECT_ENDPOINT"
set_kv "AZURE_OPENAI_API_KEY" "$AZURE_OPENAI_API_KEY"
set_kv "AZURE_OPENAI_API_VERSION" "2024-05-01-preview"

echo "[OK] 已写入 $ENV_FILE"
echo "[NOTE] 已生成备份: $ENV_FILE.bak（如有覆盖）"
