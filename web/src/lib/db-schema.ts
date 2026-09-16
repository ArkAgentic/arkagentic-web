export type PricingTier = "tier_1" | "tier_2" | "tier_3";

export type User = {
  id: string;
  email: string;
  name: string;
  balanceUsd: number;
  totalDepositedUsd: number;
  createdAt: string;
  status?: "active" | "disabled";
};

export type ApiKey = {
  id: string;
  userId: string;
  keyHash: string;
  keyPrefix: string;
  quotaLimit: number;
  status: "active" | "disabled";
};

export type UsageLog = {
  id: string;
  userId: string;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  timestamp: string;
};

export type ApiLog = {
  id: string;
  userId: string;
  apiKeyId: string;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  chargedUsd: number;
  netProfitUsd: number;
  statusCode: number;
  createdAt: string;
};

export const dbSchemaContract = {
  users:
    "users(id uuid pk, email text unique, name text, balance_usd decimal default 0.00, total_deposited_usd decimal default 0.00, created_at timestamptz, status varchar default 'active')",
  apiKeys:
    "api_keys(id uuid pk, user_id uuid fk users, key_hash text, key_prefix text, quota_limit bigint, status text)",
  usageLogs:
    "usage_logs(id uuid pk, user_id uuid fk users, model_id text, prompt_tokens int, completion_tokens int, cost_usd decimal, timestamp timestamptz)",
  apiLogs:
    "api_logs(id uuid pk, user_id uuid fk users, api_key_id uuid fk api_keys, model_id text, prompt_tokens int, completion_tokens int, cost_usd decimal, charged_usd decimal, net_profit_usd decimal, status_code int, created_at timestamptz)",
  upstreamChannels:
    "upstream_channels(id uuid pk, channel_type text, name text unique, base_url text, api_key_encrypted text, encryption_kid text, model_mapping jsonb, timeout_ms int, enabled bool, metadata jsonb, health_status text, last_health_check_at timestamptz, last_latency_ms int, last_health_error text, created_at timestamptz, updated_at timestamptz)",
  upstreamModelRoutes:
    "upstream_model_routes(id uuid pk, ark_model_id text, channel_id uuid fk upstream_channels, priority smallint, enabled bool, upstream_model_override text, created_at timestamptz, updated_at timestamptz)",
} as const;
