import { getAuthToken } from "./auth-provider";

export type OverviewMetric = {
  label: string;
  value: string;
  delta: string;
};

export type OverviewSnapshot = {
  metrics: OverviewMetric[];
  requestTrend: number[];
};

export type ApiKeyRecord = {
  id: string;
  name: string;
  maskedValue: string;
  revealedValue?: string;
  keyHash: string;
  keyPrefix: string;
  active: boolean;
  quotaPerDay: number;
  spendLimitUsd: number | null;
  usedAmountUsd: number;
  lastUsedAt: string | null;
  createdAt: string;
};

export type BillingHistoryRecord = {
  id: string;
  occurredAt: string;
  type: "topup" | "redeem" | "settlement";
  usageTokens: number;
  amountUsd: number;
  amountPaidUsd?: number;
  amountCreditedUsd?: number;
  bonusUsd?: number;
  paymentMethod: "stripe" | "card" | "alipay" | "wechat_pay" | "redeem_code" | "system";
  status: "success" | "pending" | "failed";
};

export type TopupHistoryRecord = {
  id: string;
  occurredAt: string;
  amountPaidUsd: number;
  amountCreditedUsd: number;
  paymentMethod: "stripe" | "card" | "alipay" | "wechat_pay" | "redeem_code" | "system";
  status: "success" | "pending" | "failed";
};

export type UsageLogRecord = {
  id: string;
  occurredAt: string;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  amountUsd: number;
};

export type BillingSummary = {
  balanceUsd: number;
  monthToDateUsd: number;
  avgDailyUsd: number;
  totalDepositedUsd?: number;
  pricingTier?: "tier_1" | "tier_2" | "tier_3";
  dailyUsage: Array<{ date: string; tokenCount: number; amountUsd: number }>;
  modelBreakdown: Array<{ modelId: string; callCount: number; totalTokens: number; amountUsd: number }>;
  history: BillingHistoryRecord[];
  topupHistory: TopupHistoryRecord[];
  usageLogs: UsageLogRecord[];
  tableMode: "topup" | "usage";
  tablePage: number;
  tablePageSize: number;
  tableTotal: number;
  tableHasPrev: boolean;
  tableHasNext: boolean;
};

export type ModelGroup = "all" | "global" | "china";

export type ModelRecord = {
  id: string;
  name: string;
  group: Exclude<ModelGroup, "all">;
  contextWindow: string;
  latencyMs: number;
  active: boolean;
  region: string;
  compliance: string;
  isNew?: boolean;
  autoAdded?: boolean;
};

export type ModelSyncResponse = {
  source: string;
  detectedAt: string;
  candidates: ModelRecord[];
};

export type ModelsSnapshot = {
  pricing: {
    totalDepositedUsd: number;
    tier: "tier_1" | "tier_2" | "tier_3";
    multiplier: number;
  };
  models: ModelRecord[];
};

export type AdminKpi = {
  totalUsers: number;
  grossDepositsUsd: number;
  totalUserBalanceUsd: number;
  cumulativeNetProfitUsd: number;
};

export type AdminUserRecord = {
  userId: string;
  email: string;
  registeredAt: string;
  totalDepositedUsd: number;
  currentBalanceUsd: number;
  pricingTier: "tier_1" | "tier_2" | "tier_3";
  status: "active" | "disabled";
};

export type AdminKeyRecord = {
  userId: string;
  keyPrefix: string;
  quotaLimit: number;
  status: "active" | "disabled";
};

export type AdminUsageRecord = {
  id: string;
  userId: string;
  modelId: string;
  totalTokens: number;
  customerChargeUsd: number;
  netProfitUsd: number;
  timestamp: string;
};

export type AdminDashboardSnapshot = {
  kpi: AdminKpi;
  users: AdminUserRecord[];
  keyRecords: AdminKeyRecord[];
  usageLogs: AdminUsageRecord[];
};

export type AdminUsageLogsPage = {
  page: number;
  pageSize: number;
  total: number;
  records: AdminUsageRecord[];
};

export type AdminUsageRange = "24h" | "7d" | "30d" | "all";

export type ChannelType = "azure_openai" | "openai_standard" | "siliconflow" | "custom";
export type ChannelHealthStatus = "unknown" | "healthy" | "degraded" | "unhealthy";

export type AdminChannelRecord = {
  id: string;
  channelType: ChannelType;
  name: string;
  baseUrl: string;
  apiKeyMasked: string;
  encryptionKid: string;
  modelMapping: Record<string, string>;
  timeoutMs: number;
  enabled: boolean;
  metadata: Record<string, unknown>;
  healthStatus: ChannelHealthStatus;
  lastHealthCheckAt: string | null;
  lastLatencyMs: number | null;
  lastHealthError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminRouteRecord = {
  id: string;
  arkModelId: string;
  channelId: string;
  channelName: string;
  priority: number;
  enabled: boolean;
  upstreamModelOverride: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChannelHealthCheckResult = {
  ok: boolean;
  status: number;
  latencyMs: number | null;
  model?: string;
  upstreamModel?: string;
  error?: string;
};

const USE_REAL_BACKEND = process.env.NEXT_PUBLIC_USE_REAL_BACKEND === "true";
const BACKEND_BASE_URL = (process.env.NEXT_PUBLIC_BACKEND_BASE_URL ?? "").replace(/\/$/, "");
const BACKEND_AUTH_TOKEN = process.env.NEXT_PUBLIC_BACKEND_AUTH_TOKEN ?? "ark-public-client";

const ENDPOINTS = {
  overview: "/v1/console/overview",
  keys: "/v1/console/keys",
  keyCreate: "/v1/console/keys",
  keyToggle: (id: string) => `/v1/console/keys/${id}/toggle`,
  keyUpdate: (id: string) => `/v1/console/keys/${id}`,
  keyDelete: (id: string) => `/v1/console/keys/${id}`,
  billing: "/v1/console/billing",
  billingTopup: "/v1/console/billing/topup",
  billingRedeem: "/v1/console/billing/redeem",
  models: "/v1/console/models",
  localModels: "/api/console/models",
  localBilling: "/api/console/billing",
  localKeys: "/api/console/keys",
  localKeyToggle: (id: string) => `/api/console/keys/${id}/toggle`,
  localKeyUpdate: (id: string) => `/api/console/keys/${id}`,
  localKeyDelete: (id: string) => `/api/console/keys/${id}`,
  localBillingRedeem: "/api/console/billing/redeem",
  modelsSync: "/v1/models/sync",
  localModelsSync: "/api/v1/models/sync",
  adminDashboard: "/v1/admin/dashboard",
  adminUsageLogs: "/api/admin/usage-logs",
  adminUserToggle: (userId: string) => `/v1/admin/users/${userId}/toggle`,
  adminChannels: "/api/admin/channels",
  adminChannel: (channelId: string) => `/api/admin/channels/${channelId}`,
  adminChannelHealth: (channelId: string) => `/api/admin/channels/${channelId}/health`,
  adminRoutes: "/api/admin/routes",
  adminRoute: (routeId: string) => `/api/admin/routes/${routeId}`,
} as const;

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function buildUrl(path: string): string {
  if (path.startsWith("http")) return path;
  if (!USE_REAL_BACKEND) return path;
  if (!BACKEND_BASE_URL) {
    throw new ApiClientError(
      "NEXT_PUBLIC_BACKEND_BASE_URL is required when NEXT_PUBLIC_USE_REAL_BACKEND=true",
      500,
    );
  }
  return `${BACKEND_BASE_URL}${path}`;
}

function getAuthorizationToken(): string {
  return getAuthToken() ?? BACKEND_AUTH_TOKEN;
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = buildUrl(path);
  const headers = new Headers(init.headers ?? {});
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${getAuthorizationToken()}`);
  }
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });

  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    throw new ApiClientError(
      `API request failed: ${response.status} ${response.statusText}`,
      response.status,
      payload,
    );
  }

  return payload as T;
}

const state = {
  overview: {
    metrics: [
      { label: "Requests (24h)", value: "1.28M", delta: "+12.4%" },
      { label: "Request/min", value: "8.4K", delta: "+4.8%" },
      { label: "Token Usage", value: "62.7M", delta: "+9.1%" },
      { label: "p95 Latency", value: "146ms", delta: "-7.3%" },
    ],
    requestTrend: [42, 48, 54, 59, 63, 61, 72, 76, 68, 73, 78, 82],
  } satisfies OverviewSnapshot,
  keys: [
    {
      id: "key_prod",
      name: "Production Gateway",
      maskedValue: "sk-ark-***f9a1",
      keyHash: "[REDACTED]",
      keyPrefix: "sk-ark-prod",
      active: true,
      quotaPerDay: 1000000,
      spendLimitUsd: null,
      usedAmountUsd: 126.4,
      lastUsedAt: "2026-08-14T04:20:00.000Z",
      createdAt: "2026-08-01",
    },
    {
      id: "key_dev",
      name: "Developer Sandbox",
      maskedValue: "sk-ark-***9b2c",
      keyHash: "[REDACTED]",
      keyPrefix: "sk-ark-dev",
      active: false,
      quotaPerDay: 50000,
      spendLimitUsd: 50,
      usedAmountUsd: 8.5,
      lastUsedAt: "2026-08-12T10:12:00.000Z",
      createdAt: "2026-08-03",
    },
  ] as ApiKeyRecord[],
  billing: {
    balanceUsd: 1240.8,
    monthToDateUsd: 382.4,
    avgDailyUsd: 12.75,
    dailyUsage: [
      { date: "2026-08-10", tokenCount: 620000, amountUsd: 12.4 },
      { date: "2026-08-11", tokenCount: 710000, amountUsd: 14.1 },
      { date: "2026-08-12", tokenCount: 580000, amountUsd: 11.2 },
      { date: "2026-08-13", tokenCount: 760000, amountUsd: 15.8 },
      { date: "2026-08-14", tokenCount: 700000, amountUsd: 13.9 },
    ],
    modelBreakdown: [
      { modelId: "ark-gpt-4o", callCount: 42, totalTokens: 1200000, amountUsd: 12.5 },
      { modelId: "ark-deepseek-r1", callCount: 28, totalTokens: 820000, amountUsd: 8.3 },
      { modelId: "ark-claude-3-5-sonnet", callCount: 11, totalTokens: 410000, amountUsd: 4.8 },
    ],
    history: [
      {
        id: "TRX-20260814-001",
        occurredAt: "2026-08-14T03:22:00.000Z",
        type: "topup",
        usageTokens: 0,
        amountUsd: 200,
        paymentMethod: "card",
        status: "success",
      },
      {
        id: "TRX-20260813-001",
        occurredAt: "2026-08-13T09:10:00.000Z",
        type: "settlement",
        usageTokens: 760000,
        amountUsd: 15.8,
        paymentMethod: "system",
        status: "success",
      },
    ] as BillingHistoryRecord[],
    topupHistory: [
      {
        id: "TRX-20260814-001",
        occurredAt: "2026-08-14T03:22:00.000Z",
        amountPaidUsd: 200,
        amountCreditedUsd: 200,
        paymentMethod: "card",
        status: "success",
      },
    ],
    usageLogs: [
      {
        id: "LOG-20260813-001",
        occurredAt: "2026-08-13T09:10:00.000Z",
        modelId: "ark-gpt-4o",
        promptTokens: 520000,
        completionTokens: 240000,
        amountUsd: 15.8,
      },
    ],
    tableMode: "usage",
    tablePage: 1,
    tablePageSize: 10,
    tableTotal: 1,
    tableHasPrev: false,
    tableHasNext: false,
  } satisfies BillingSummary,
  models: [
    {
      id: "ark-gpt-4o",
      name: "GPT-4o",
      group: "global",
      contextWindow: "128k",
      latencyMs: 172,
      active: true,
      region: "Global Cluster",
      compliance: "SOC2 / ISO Compliant",
    },
    {
      id: "ark-claude-3-5-sonnet",
      name: "Claude 3.5 Sonnet",
      group: "global",
      contextWindow: "200k",
      latencyMs: 186,
      active: true,
      region: "US East",
      compliance: "No Training on Prompt Data",
    },
    {
      id: "ark-gemini-1.5-pro",
      name: "Gemini 1.5 Pro",
      group: "global",
      contextWindow: "128k",
      latencyMs: 161,
      active: true,
      region: "US East",
      compliance: "Enterprise Privacy",
    },
    {
      id: "ark-deepseek-r1",
      name: "DeepSeek R1",
      group: "china",
      contextWindow: "128k",
      latencyMs: 148,
      active: true,
      region: "US East",
      compliance: "No Data Retention",
    },
    {
      id: "ark-qwen-2.5-max",
      name: "Qwen 2.5 Max",
      group: "china",
      contextWindow: "128k",
      latencyMs: 152,
      active: true,
      region: "US East",
      compliance: "Enterprise Privacy",
    },
    {
      id: "ark-kimi-k2",
      name: "Kimi K2",
      group: "china",
      contextWindow: "128k",
      latencyMs: 165,
      active: true,
      region: "US East",
      compliance: "Enterprise Privacy",
    },
    {
      id: "ark-glm-4",
      name: "GLM-4",
      group: "china",
      contextWindow: "128k",
      latencyMs: 159,
      active: true,
      region: "US East",
      compliance: "No Data Retention",
    },
  ] as ModelRecord[],
  admin: {
    kpi: {
      totalUsers: 428,
      grossDepositsUsd: 187540.2,
      totalUserBalanceUsd: 63211.48,
      cumulativeNetProfitUsd: 41872.63,
    },
    users: [
      {
        userId: "usr_founder01",
        email: "charles.zhang@arkagentic.com",
        registeredAt: "2026-07-01",
        totalDepositedUsd: 24000,
        currentBalanceUsd: 11830.52,
        pricingTier: "tier_3",
        status: "active",
      },
      {
        userId: "usr_prodteam02",
        email: "ops@stellarapp.ai",
        registeredAt: "2026-07-12",
        totalDepositedUsd: 8200,
        currentBalanceUsd: 2490.11,
        pricingTier: "tier_2",
        status: "active",
      },
      {
        userId: "usr_growth09",
        email: "growth@northloop.dev",
        registeredAt: "2026-07-22",
        totalDepositedUsd: 4100,
        currentBalanceUsd: 640.88,
        pricingTier: "tier_1",
        status: "disabled",
      },
      {
        userId: "usr_enterprise11",
        email: "platform@atlas-enterprise.com",
        registeredAt: "2026-08-02",
        totalDepositedUsd: 36500,
        currentBalanceUsd: 17500.43,
        pricingTier: "tier_3",
        status: "active",
      },
    ] as AdminUserRecord[],
    keyRecords: [
      { userId: "usr_founder01", keyPrefix: "sk-ark-a9f3...", quotaLimit: 2_000_000, status: "active" },
      { userId: "usr_prodteam02", keyPrefix: "sk-ark-c2be...", quotaLimit: 700_000, status: "active" },
      { userId: "usr_growth09", keyPrefix: "sk-ark-k91d...", quotaLimit: 300_000, status: "disabled" },
      { userId: "usr_enterprise11", keyPrefix: "sk-ark-w77p...", quotaLimit: 3_500_000, status: "active" },
    ] as AdminKeyRecord[],
    usageLogs: [
      {
        id: "log_901",
        userId: "usr_enterprise11",
        modelId: "ark-deepseek-r1",
        totalTokens: 28400,
        customerChargeUsd: 1.94,
        netProfitUsd: 0.62,
        timestamp: "2026-08-07T16:24:10Z",
      },
      {
        id: "log_902",
        userId: "usr_prodteam02",
        modelId: "ark-gpt-4o",
        totalTokens: 9010,
        customerChargeUsd: 0.88,
        netProfitUsd: 0.23,
        timestamp: "2026-08-07T16:26:39Z",
      },
      {
        id: "log_903",
        userId: "usr_founder01",
        modelId: "ark-qwen-2.5-max",
        totalTokens: 13220,
        customerChargeUsd: 0.71,
        netProfitUsd: 0.19,
        timestamp: "2026-08-07T16:28:04Z",
      },
      {
        id: "log_904",
        userId: "usr_enterprise11",
        modelId: "ark-claude-3-5-sonnet",
        totalTokens: 19670,
        customerChargeUsd: 2.46,
        netProfitUsd: 0.91,
        timestamp: "2026-08-07T16:31:42Z",
      },
    ] as AdminUsageRecord[],
  } satisfies AdminDashboardSnapshot,
};

const wait = (ms = 220) => new Promise((resolve) => setTimeout(resolve, ms));

async function mockSyncPayload(): Promise<ModelSyncResponse | null> {
  try {
    return await requestJson<ModelSyncResponse>(ENDPOINTS.localModelsSync, { method: "GET" });
  } catch {
    return null;
  }
}

function randomAlphaNum(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < length; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto !== "undefined" && "subtle" in crypto) {
    const encoded = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return `[sha256-unavailable]${input.slice(0, 8)}`;
}

export const apiClient = {
  async getOverview(): Promise<OverviewSnapshot> {
    if (USE_REAL_BACKEND) return requestJson<OverviewSnapshot>(ENDPOINTS.overview, { method: "GET" });

    try {
      return await requestJson<OverviewSnapshot>("/api/console/overview", { method: "GET" });
    } catch {
      await wait();
      return {
        metrics: [
          { label: "Requests (24h)", value: "0", delta: "n/a" },
          { label: "Request/min", value: "0.00", delta: "n/a" },
          { label: "Token Usage", value: "0", delta: "n/a" },
          { label: "p95 Latency", value: "N/A", delta: "n/a" },
        ],
        requestTrend: [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8],
      };
    }
  },

  async getKeys(): Promise<ApiKeyRecord[]> {
    if (USE_REAL_BACKEND) return requestJson<ApiKeyRecord[]>(ENDPOINTS.keys, { method: "GET" });
    try {
      return await requestJson<ApiKeyRecord[]>(ENDPOINTS.localKeys, { method: "GET" });
    } catch {
      await wait();
      return structuredClone(state.keys);
    }
  },

  async createKey(input?: { name?: string; spendLimitUsd?: number | null; quotaPerDay?: number }): Promise<ApiKeyRecord> {
    if (USE_REAL_BACKEND) {
      return requestJson<ApiKeyRecord>(ENDPOINTS.keyCreate, {
        method: "POST",
        body: JSON.stringify(input || {}),
      });
    }
    try {
      return await requestJson<ApiKeyRecord>(ENDPOINTS.localKeys, {
        method: "POST",
        body: JSON.stringify(input || {}),
      });
    } catch {
      await wait();

      const rawKey = `sk-ark-${randomAlphaNum(32)}`;
      const keyHash = await sha256Hex(rawKey);
      const keyPrefix = `${rawKey.slice(0, 11)}...`;

      const next: ApiKeyRecord = {
        id: `key_new_${state.keys.length + 1}`,
        name: input?.name?.trim() || `New Key ${state.keys.length + 1}`,
        maskedValue: `${rawKey.slice(0, 7)}***${keyHash.slice(-4)}`,
        revealedValue: rawKey,
        keyHash,
        keyPrefix,
        active: true,
        quotaPerDay: Math.max(0, Math.floor(Number(input?.quotaPerDay ?? 100000))),
        spendLimitUsd: input?.spendLimitUsd == null ? null : Math.max(0, Number(input.spendLimitUsd)),
        usedAmountUsd: 0,
        lastUsedAt: null,
        createdAt: new Date().toISOString().slice(0, 10),
      };
      state.keys = [next, ...state.keys];
      return structuredClone(next);
    }
  },

  async updateKey(id: string, input: { name?: string; spendLimitUsd?: number | null; quotaPerDay?: number }): Promise<ApiKeyRecord[]> {
    if (USE_REAL_BACKEND) {
      return requestJson<ApiKeyRecord[]>(ENDPOINTS.keyUpdate(id), {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    }
    try {
      return await requestJson<ApiKeyRecord[]>(ENDPOINTS.localKeyUpdate(id), {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    } catch {
      await wait();
      state.keys = state.keys.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          name: input.name === undefined ? item.name : input.name,
          spendLimitUsd: input.spendLimitUsd === undefined ? item.spendLimitUsd : input.spendLimitUsd,
          quotaPerDay: input.quotaPerDay === undefined ? item.quotaPerDay : input.quotaPerDay,
        };
      });
      return structuredClone(state.keys);
    }
  },

  async deleteKey(id: string): Promise<ApiKeyRecord[]> {
    if (USE_REAL_BACKEND) return requestJson<ApiKeyRecord[]>(ENDPOINTS.keyDelete(id), { method: "DELETE" });
    try {
      return await requestJson<ApiKeyRecord[]>(ENDPOINTS.localKeyDelete(id), { method: "DELETE" });
    } catch {
      await wait();
      state.keys = state.keys.filter((item) => item.id !== id);
      return structuredClone(state.keys);
    }
  },

  async toggleKey(id: string): Promise<ApiKeyRecord[]> {
    if (USE_REAL_BACKEND) return requestJson<ApiKeyRecord[]>(ENDPOINTS.keyToggle(id), { method: "POST" });
    try {
      return await requestJson<ApiKeyRecord[]>(ENDPOINTS.localKeyToggle(id), { method: "POST" });
    } catch {
      await wait();
      state.keys = state.keys.map((item) => (item.id === id ? { ...item, active: !item.active } : item));
      return structuredClone(state.keys);
    }
  },

  async getBilling(params?: { mode?: "topup" | "usage"; page?: number }): Promise<BillingSummary> {
    const query = new URLSearchParams();
    if (params?.mode) query.set("mode", params.mode);
    if (params?.page && Number.isFinite(params.page) && params.page > 0) query.set("page", String(Math.floor(params.page)));
    const suffix = query.toString() ? `?${query.toString()}` : "";

    if (USE_REAL_BACKEND) return requestJson<BillingSummary>(`${ENDPOINTS.billing}${suffix}`, { method: "GET" });
    try {
      return await requestJson<BillingSummary>(`${ENDPOINTS.localBilling}${suffix}`, { method: "GET" });
    } catch {
      await wait();
      const fallback: BillingSummary = structuredClone(state.billing);
      fallback.tableMode = params?.mode === "topup" ? "topup" : "usage";
      fallback.tablePage = params?.page && params.page > 0 ? Math.floor(params.page) : 1;
      fallback.tablePageSize = 10;
      if (fallback.tableMode === "topup") {
        fallback.tableTotal = fallback.topupHistory.length;
        fallback.tableHasPrev = fallback.tablePage > 1;
        fallback.tableHasNext = false;
      } else {
        fallback.tableTotal = fallback.usageLogs.length;
        fallback.tableHasPrev = fallback.tablePage > 1;
        fallback.tableHasNext = false;
      }
      return fallback;
    }
  },

  async redeemCode(code: string): Promise<{ ok: boolean; amountUsd: number; balanceUsd: number }> {
    if (USE_REAL_BACKEND) {
      return requestJson<{ ok: boolean; amountUsd: number; balanceUsd: number }>(ENDPOINTS.billingRedeem, {
        method: "POST",
        body: JSON.stringify({ code }),
      });
    }
    try {
      return await requestJson<{ ok: boolean; amountUsd: number; balanceUsd: number }>(ENDPOINTS.localBillingRedeem, {
        method: "POST",
        body: JSON.stringify({ code }),
      });
    } catch {
      await wait();
      const amount = 50;
      state.billing.balanceUsd += amount;
      state.billing.history = [
        {
          id: `RDM-${Date.now()}`,
          occurredAt: new Date().toISOString(),
          type: "redeem",
          usageTokens: 0,
          amountUsd: amount,
          paymentMethod: "redeem_code",
          status: "success",
        } as BillingHistoryRecord,
        ...state.billing.history,
      ];
      return { ok: true, amountUsd: amount, balanceUsd: state.billing.balanceUsd };
    }
  },

  async getModels(group: ModelGroup = "all"): Promise<ModelsSnapshot> {
    if (USE_REAL_BACKEND) {
      const query = group === "all" ? "" : `?group=${group}`;
      const models = await requestJson<ModelRecord[]>(`${ENDPOINTS.models}${query}`, { method: "GET" });
      return {
        pricing: { totalDepositedUsd: 0, tier: "tier_1", multiplier: 1.5 },
        models,
      };
    }

    try {
      const query = group === "all" ? "" : `?group=${group}`;
      return await requestJson<ModelsSnapshot>(`${ENDPOINTS.localModels}${query}`, { method: "GET" });
    } catch {
      await wait();
      const all = state.models.map((item) => ({ ...item, isNew: false, autoAdded: false }));
      const filtered = group === "all" ? all : all.filter((m) => m.group === group);
      return {
        pricing: { totalDepositedUsd: 0, tier: "tier_1", multiplier: 1.5 },
        models: filtered,
      };
    }
  },

  async syncModels(): Promise<ModelRecord[]> {
    if (USE_REAL_BACKEND) {
      return requestJson<ModelRecord[]>(ENDPOINTS.modelsSync, { method: "POST" });
    }

    await wait(350);
    const payload = await mockSyncPayload();
    const candidates = payload?.candidates ?? [];
    const existing = new Set(state.models.map((m) => m.id));
    const additions = candidates.filter((c) => !existing.has(c.id));
    if (additions.length) state.models = [...additions, ...state.models];

    return state.models.map((m) => ({
      ...m,
      isNew: additions.some((a) => a.id === m.id),
      autoAdded: additions.some((a) => a.id === m.id),
    }));
  },

  async getAdminDashboard(): Promise<AdminDashboardSnapshot> {
    if (USE_REAL_BACKEND) {
      return requestJson<AdminDashboardSnapshot>(ENDPOINTS.adminDashboard, { method: "GET" });
    }

    try {
      return await requestJson<AdminDashboardSnapshot>("/api/admin/dashboard", { method: "GET" });
    } catch {
      await wait(220);
      return structuredClone(state.admin);
    }
  },

  async getAdminUsageLogs(
    page = 1,
    pageSize = 50,
    options?: { range?: AdminUsageRange; query?: string },
  ): Promise<AdminUsageLogsPage> {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("page_size", String(pageSize));
    if (options?.range) params.set("range", options.range);
    if (options?.query?.trim()) params.set("q", options.query.trim());
    return requestJson<AdminUsageLogsPage>(`${ENDPOINTS.adminUsageLogs}?${params.toString()}`, { method: "GET" });
  },

  async exportAdminUsageLogsCsv(options?: { range?: AdminUsageRange; query?: string }): Promise<Blob> {
    const params = new URLSearchParams();
    params.set("export", "csv");
    if (options?.range) params.set("range", options.range);
    if (options?.query?.trim()) params.set("q", options.query.trim());

    const response = await fetch(`${ENDPOINTS.adminUsageLogs}?${params.toString()}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${getAuthorizationToken()}` },
      cache: "no-store",
    });
    if (!response.ok) {
      const details = await parseJsonSafe(response);
      throw new ApiClientError(
        `API request failed: ${response.status} ${response.statusText}`,
        response.status,
        details,
      );
    }
    return response.blob();
  },

  async toggleAdminUserStatus(userId: string): Promise<AdminDashboardSnapshot> {
    if (USE_REAL_BACKEND) {
      return requestJson<AdminDashboardSnapshot>(ENDPOINTS.adminUserToggle(userId), { method: "POST" });
    }

    try {
      return await requestJson<AdminDashboardSnapshot>(`/api/admin/users/${userId}/toggle`, { method: "POST" });
    } catch {
      await wait(180);

      state.admin.users = state.admin.users.map((user) =>
        user.userId === userId ? { ...user, status: user.status === "active" ? "disabled" : "active" } : user,
      );

      const disabledUsers = new Set(
        state.admin.users.filter((user) => user.status === "disabled").map((user) => user.userId),
      );

      state.admin.keyRecords = state.admin.keyRecords.map((key) => {
        if (disabledUsers.has(key.userId)) return { ...key, status: "disabled" as const };
        const owner = state.admin.users.find((user) => user.userId === key.userId);
        if (owner?.status === "active") return { ...key, status: "active" as const };
        return key;
      });

      state.admin.kpi.totalUserBalanceUsd = state.admin.users
        .filter((user) => user.status === "active")
        .reduce((acc, user) => acc + user.currentBalanceUsd, 0);

      return structuredClone(state.admin);
    }
  },

  async listAdminChannels(): Promise<AdminChannelRecord[]> {
    const payload = await requestJson<{ channels: AdminChannelRecord[] }>(ENDPOINTS.adminChannels, { method: "GET" });
    return payload.channels;
  },

  async createAdminChannel(input: {
    channel_type: ChannelType;
    name: string;
    base_url: string;
    api_key: string;
    model_mapping: Record<string, string>;
    timeout_ms: number;
    enabled: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<AdminChannelRecord> {
    return requestJson<AdminChannelRecord>(ENDPOINTS.adminChannels, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async updateAdminChannel(
    channelId: string,
    input: Partial<{
      channel_type: ChannelType;
      name: string;
      base_url: string;
      api_key: string;
      model_mapping: Record<string, string>;
      timeout_ms: number;
      enabled: boolean;
      metadata: Record<string, unknown>;
    }>,
  ): Promise<AdminChannelRecord> {
    return requestJson<AdminChannelRecord>(ENDPOINTS.adminChannel(channelId), {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  async deleteAdminChannel(channelId: string): Promise<void> {
    await requestJson<{ ok: boolean }>(ENDPOINTS.adminChannel(channelId), { method: "DELETE" });
  },

  async healthCheckAdminChannel(channelId: string, arkModelId?: string): Promise<ChannelHealthCheckResult> {
    return requestJson<ChannelHealthCheckResult>(ENDPOINTS.adminChannelHealth(channelId), {
      method: "POST",
      body: JSON.stringify(arkModelId ? { ark_model_id: arkModelId } : {}),
    });
  },

  async listAdminRoutes(): Promise<AdminRouteRecord[]> {
    const payload = await requestJson<{ routes: AdminRouteRecord[] }>(ENDPOINTS.adminRoutes, { method: "GET" });
    return payload.routes;
  },

  async createAdminRoute(input: {
    ark_model_id: string;
    channel_id: string;
    priority: number;
    enabled: boolean;
    upstream_model_override?: string;
  }): Promise<AdminRouteRecord> {
    return requestJson<AdminRouteRecord>(ENDPOINTS.adminRoutes, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async updateAdminRoute(
    routeId: string,
    input: Partial<{
      ark_model_id: string;
      channel_id: string;
      priority: number;
      enabled: boolean;
      upstream_model_override: string;
    }>,
  ): Promise<AdminRouteRecord> {
    return requestJson<AdminRouteRecord>(ENDPOINTS.adminRoute(routeId), {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  async deleteAdminRoute(routeId: string): Promise<void> {
    await requestJson<{ ok: boolean }>(ENDPOINTS.adminRoute(routeId), { method: "DELETE" });
  },
};

export function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function buildChatResponse(prompt: string, model = "ark-gpt-4o") {
  return {
    id: `chatcmpl_ark_${Math.random().toString(36).slice(2, 10)}`,
    object: "chat.completion",
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: `Mock response for: ${prompt || "(empty prompt)"}`,
        },
      },
    ],
    usage: {
      prompt_tokens: Math.max(12, Math.min(120, prompt.length)),
      completion_tokens: 36,
      total_tokens: Math.max(48, Math.min(156, prompt.length + 36)),
    },
  };
}
