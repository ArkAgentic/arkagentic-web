import { randomUUID } from "crypto";
import type { Pool } from "pg";
import { decryptApiKey, encryptApiKey } from "./upstream-crypto";

export type ChannelType = "azure_openai" | "openai_standard" | "siliconflow" | "custom";
export type HealthStatus = "unknown" | "healthy" | "degraded" | "unhealthy";

export type ChannelRecord = {
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
  healthStatus: HealthStatus;
  lastHealthCheckAt: string | null;
  lastLatencyMs: number | null;
  lastHealthError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RouteRecord = {
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

let pgPool: Pool | null | undefined;

async function getPool(): Promise<Pool | null> {
  if (pgPool !== undefined) return pgPool;
  if (!process.env.DATABASE_URL) {
    pgPool = null;
    return pgPool;
  }
  const { Pool: PgPool } = await import("pg");
  pgPool = new PgPool({ connectionString: process.env.DATABASE_URL });
  return pgPool;
}

function maskApiKey(raw: string): string {
  const clean = String(raw || "").trim();
  if (!clean) return "";
  if (clean.length <= 6) return `${clean.slice(0, 2)}***`;
  return `${clean.slice(0, 3)}***${clean.slice(-4)}`;
}

function coerceType(value: unknown): ChannelType {
  const input = String(value || "").trim() as ChannelType;
  if (["azure_openai", "openai_standard", "siliconflow", "custom"].includes(input)) return input;
  throw new Error("Invalid channel_type");
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  throw new Error("Expected object payload");
}

function parseModelMapping(value: unknown): Record<string, string> {
  const obj = parseJsonObject(value);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = k.trim();
    const model = String(v || "").trim();
    if (!key || !model) continue;
    out[key] = model;
  }
  return out;
}

function iso(value: unknown): string {
  return new Date(String(value)).toISOString();
}

function resolveFallbackApiKey(row: Record<string, unknown>): string | null {
  const metadata = (row.metadata || {}) as Record<string, unknown>;
  const channelType = String(row.channel_type || "").trim() as ChannelType;
  const channelName = String(row.name || "").trim();

  const requestedEnv = typeof metadata.apiKeyEnv === "string" ? metadata.apiKeyEnv.trim() : "";
  const nameEnv = channelName
    ? `UPSTREAM_${channelName
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")}_API_KEY`
    : "";

  const candidates = [
    requestedEnv ? process.env[requestedEnv] : undefined,
    nameEnv ? process.env[nameEnv] : undefined,
    channelType === "azure_openai" ? process.env.AZURE_OPENAI_API_KEY : undefined,
    channelType === "azure_openai" ? process.env.AZURE_FOUNDRY_API_KEY : undefined,
    channelType === "azure_openai" ? process.env.UPSTREAM_AZURE_API_KEY : undefined,
  ];

  for (const candidate of candidates) {
    const key = String(candidate || "").trim();
    if (key) return key;
  }
  return null;
}

function resolveChannelApiKey(row: Record<string, unknown>): { apiKey: string | null; source: "encrypted" | "fallback" | "none" } {
  try {
    return { apiKey: decryptApiKey(String(row.api_key_encrypted || "")), source: "encrypted" };
  } catch {
    const fallback = resolveFallbackApiKey(row);
    if (fallback) return { apiKey: fallback, source: "fallback" };
    return { apiKey: null, source: "none" };
  }
}

function toChannelRecord(row: Record<string, unknown>): ChannelRecord {
  const resolved = resolveChannelApiKey(row);
  const masked = resolved.apiKey ? maskApiKey(resolved.apiKey) : "[invalid-encrypted-key]";

  return {
    id: String(row.id),
    channelType: String(row.channel_type) as ChannelType,
    name: String(row.name),
    baseUrl: String(row.base_url),
    apiKeyMasked: masked,
    encryptionKid: String(row.encryption_kid || "v1"),
    modelMapping: (row.model_mapping || {}) as Record<string, string>,
    timeoutMs: Number(row.timeout_ms || 45000),
    enabled: Boolean(row.enabled),
    metadata: (row.metadata || {}) as Record<string, unknown>,
    healthStatus: String(row.health_status || "unknown") as HealthStatus,
    lastHealthCheckAt: row.last_health_check_at ? iso(row.last_health_check_at) : null,
    lastLatencyMs: row.last_latency_ms != null ? Number(row.last_latency_ms) : null,
    lastHealthError: row.last_health_error ? String(row.last_health_error) : null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export async function listChannels(): Promise<ChannelRecord[]> {
  const pool = await getPool();
  if (!pool) return [];
  const res = await pool.query(
    `select id, channel_type, name, base_url, api_key_encrypted, encryption_kid, model_mapping,
            timeout_ms, enabled, metadata, health_status, last_health_check_at, last_latency_ms,
            last_health_error, created_at, updated_at
     from upstream_channels
     order by created_at desc`,
  );
  return res.rows.map((row) => toChannelRecord(row));
}

export async function getChannelById(channelId: string): Promise<ChannelRecord | null> {
  const pool = await getPool();
  if (!pool) return null;
  const res = await pool.query(
    `select id, channel_type, name, base_url, api_key_encrypted, encryption_kid, model_mapping,
            timeout_ms, enabled, metadata, health_status, last_health_check_at, last_latency_ms,
            last_health_error, created_at, updated_at
     from upstream_channels where id=$1`,
    [channelId],
  );
  if (!res.rows[0]) return null;
  return toChannelRecord(res.rows[0]);
}

export async function createChannel(input: {
  channel_type: unknown;
  name: unknown;
  base_url: unknown;
  api_key: unknown;
  model_mapping?: unknown;
  timeout_ms?: unknown;
  enabled?: unknown;
  metadata?: unknown;
}): Promise<ChannelRecord> {
  const pool = await getPool();
  if (!pool) throw new Error("Database not configured");

  const name = String(input.name || "").trim();
  const baseUrl = String(input.base_url || "").trim().replace(/\/$/, "");
  const apiKey = String(input.api_key || "").trim();
  const channelType = coerceType(input.channel_type);
  const timeoutMs = Math.max(1000, Math.min(120000, Number(input.timeout_ms || 45000)));
  const enabled = input.enabled === undefined ? true : Boolean(input.enabled);
  const modelMapping = parseModelMapping(input.model_mapping || {});
  const metadata = parseJsonObject(input.metadata || {});

  if (!name) throw new Error("name is required");
  if (!baseUrl) throw new Error("base_url is required");
  if (!apiKey) throw new Error("api_key is required");

  const encrypted = encryptApiKey(apiKey);
  const id = randomUUID();

  const res = await pool.query(
    `insert into upstream_channels(
      id, channel_type, name, base_url, api_key_encrypted, encryption_kid, model_mapping,
      timeout_ms, enabled, metadata, health_status, created_at, updated_at
    ) values ($1,$2,$3,$4,$5,'v1',$6::jsonb,$7,$8,$9::jsonb,'unknown',now(),now())
    returning id, channel_type, name, base_url, api_key_encrypted, encryption_kid, model_mapping,
              timeout_ms, enabled, metadata, health_status, last_health_check_at, last_latency_ms,
              last_health_error, created_at, updated_at`,
    [id, channelType, name, baseUrl, encrypted, JSON.stringify(modelMapping), timeoutMs, enabled, JSON.stringify(metadata)],
  );

  return toChannelRecord(res.rows[0]);
}

export async function updateChannel(
  channelId: string,
  input: {
    channel_type?: unknown;
    name?: unknown;
    base_url?: unknown;
    api_key?: unknown;
    model_mapping?: unknown;
    timeout_ms?: unknown;
    enabled?: unknown;
    metadata?: unknown;
  },
): Promise<ChannelRecord> {
  const pool = await getPool();
  if (!pool) throw new Error("Database not configured");

  const currentRes = await pool.query("select * from upstream_channels where id=$1", [channelId]);
  const current = currentRes.rows[0];
  if (!current) throw new Error("Channel not found");

  const channelType = input.channel_type !== undefined ? coerceType(input.channel_type) : (current.channel_type as ChannelType);
  const name = input.name !== undefined ? String(input.name || "").trim() : String(current.name);
  const baseUrl =
    input.base_url !== undefined ? String(input.base_url || "").trim().replace(/\/$/, "") : String(current.base_url);
  const timeoutMs =
    input.timeout_ms !== undefined
      ? Math.max(1000, Math.min(120000, Number(input.timeout_ms || 45000)))
      : Number(current.timeout_ms || 45000);
  const enabled = input.enabled !== undefined ? Boolean(input.enabled) : Boolean(current.enabled);
  const modelMapping =
    input.model_mapping !== undefined ? parseModelMapping(input.model_mapping) : ((current.model_mapping || {}) as Record<string, string>);
  const metadata = input.metadata !== undefined ? parseJsonObject(input.metadata) : ((current.metadata || {}) as Record<string, unknown>);

  let encrypted = String(current.api_key_encrypted || "");
  if (input.api_key !== undefined) {
    const plain = String(input.api_key || "").trim();
    if (!plain) throw new Error("api_key cannot be empty");
    encrypted = encryptApiKey(plain);
  }

  const res = await pool.query(
    `update upstream_channels
       set channel_type=$2,
           name=$3,
           base_url=$4,
           api_key_encrypted=$5,
           model_mapping=$6::jsonb,
           timeout_ms=$7,
           enabled=$8,
           metadata=$9::jsonb,
           updated_at=now()
     where id=$1
     returning id, channel_type, name, base_url, api_key_encrypted, encryption_kid, model_mapping,
               timeout_ms, enabled, metadata, health_status, last_health_check_at, last_latency_ms,
               last_health_error, created_at, updated_at`,
    [channelId, channelType, name, baseUrl, encrypted, JSON.stringify(modelMapping), timeoutMs, enabled, JSON.stringify(metadata)],
  );

  return toChannelRecord(res.rows[0]);
}

export async function deleteChannel(channelId: string): Promise<void> {
  const pool = await getPool();
  if (!pool) throw new Error("Database not configured");
  await pool.query("delete from upstream_channels where id=$1", [channelId]);
}

export async function listRoutes(): Promise<RouteRecord[]> {
  const pool = await getPool();
  if (!pool) return [];

  const res = await pool.query(
    `select r.id, r.ark_model_id, r.channel_id, c.name as channel_name, r.priority, r.enabled,
            r.upstream_model_override, r.created_at, r.updated_at
     from upstream_model_routes r
     join upstream_channels c on c.id = r.channel_id
     order by r.ark_model_id asc, r.priority asc`,
  );

  return res.rows.map((row) => ({
    id: String(row.id),
    arkModelId: String(row.ark_model_id),
    channelId: String(row.channel_id),
    channelName: String(row.channel_name),
    priority: Number(row.priority),
    enabled: Boolean(row.enabled),
    upstreamModelOverride: row.upstream_model_override ? String(row.upstream_model_override) : null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }));
}

export async function createRoute(input: {
  ark_model_id: unknown;
  channel_id: unknown;
  priority?: unknown;
  enabled?: unknown;
  upstream_model_override?: unknown;
}): Promise<RouteRecord> {
  const pool = await getPool();
  if (!pool) throw new Error("Database not configured");

  const arkModelId = String(input.ark_model_id || "").trim();
  const channelId = String(input.channel_id || "").trim();
  const enabled = input.enabled === undefined ? true : Boolean(input.enabled);
  const upstreamModelOverride =
    input.upstream_model_override === undefined ? null : String(input.upstream_model_override || "").trim() || null;

  let priority: number;
  if (input.priority === undefined || input.priority === null || String(input.priority).trim() === "") {
    const nextPriorityRes = await pool.query(
      `select coalesce(min(missing.p), 1)::int as next_priority
       from generate_series(1,10) as missing(p)
       where not exists (
         select 1 from upstream_model_routes r where r.ark_model_id=$1 and r.priority=missing.p
       )`,
      [arkModelId],
    );
    priority = Number(nextPriorityRes.rows[0]?.next_priority ?? 1);
  } else {
    priority = Number(input.priority);
  }

  if (!arkModelId) throw new Error("ark_model_id is required");
  if (!channelId) throw new Error("channel_id is required");
  if (!Number.isFinite(priority) || priority < 1 || priority > 10) throw new Error("priority must be 1..10");

  const channelRes = await pool.query("select id, name, enabled from upstream_channels where id=$1", [channelId]);
  const channel = channelRes.rows[0];
  if (!channel) throw new Error("channel_id does not exist");
  if (!Boolean(channel.enabled)) throw new Error("channel is disabled");

  const id = randomUUID();
  const res = await pool.query(
    `insert into upstream_model_routes(
      id, ark_model_id, channel_id, priority, enabled, upstream_model_override, created_at, updated_at
    ) values ($1,$2,$3,$4,$5,$6,now(),now())
    on conflict (ark_model_id, priority) do update set
      channel_id=excluded.channel_id,
      enabled=excluded.enabled,
      upstream_model_override=excluded.upstream_model_override,
      updated_at=now()
    returning id, ark_model_id, channel_id, priority, enabled, upstream_model_override, created_at, updated_at`,
    [id, arkModelId, channelId, priority, enabled, upstreamModelOverride],
  );

  const row = res.rows[0];
  const nameRes = await pool.query("select name from upstream_channels where id=$1", [row.channel_id]);
  return {
    id: String(row.id),
    arkModelId: String(row.ark_model_id),
    channelId: String(row.channel_id),
    channelName: String(nameRes.rows[0]?.name || ""),
    priority: Number(row.priority),
    enabled: Boolean(row.enabled),
    upstreamModelOverride: row.upstream_model_override ? String(row.upstream_model_override) : null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export async function updateRoute(
  routeId: string,
  input: {
    ark_model_id?: unknown;
    channel_id?: unknown;
    priority?: unknown;
    enabled?: unknown;
    upstream_model_override?: unknown;
  },
): Promise<RouteRecord> {
  const pool = await getPool();
  if (!pool) throw new Error("Database not configured");
  const curRes = await pool.query("select * from upstream_model_routes where id=$1", [routeId]);
  const current = curRes.rows[0];
  if (!current) throw new Error("Route not found");

  const arkModelId = input.ark_model_id !== undefined ? String(input.ark_model_id || "").trim() : String(current.ark_model_id);
  const channelId = input.channel_id !== undefined ? String(input.channel_id || "").trim() : String(current.channel_id);
  const priority = input.priority !== undefined ? Number(input.priority) : Number(current.priority);
  const enabled = input.enabled !== undefined ? Boolean(input.enabled) : Boolean(current.enabled);
  const upstreamModelOverride =
    input.upstream_model_override !== undefined
      ? String(input.upstream_model_override || "").trim() || null
      : current.upstream_model_override;

  if (!arkModelId) throw new Error("ark_model_id is required");
  if (!channelId) throw new Error("channel_id is required");
  if (!Number.isFinite(priority) || priority < 1 || priority > 10) throw new Error("priority must be 1..10");

  const res = await pool.query(
    `update upstream_model_routes
       set ark_model_id=$2,
           channel_id=$3,
           priority=$4,
           enabled=$5,
           upstream_model_override=$6,
           updated_at=now()
     where id=$1
     returning id, ark_model_id, channel_id, priority, enabled, upstream_model_override, created_at, updated_at`,
    [routeId, arkModelId, channelId, priority, enabled, upstreamModelOverride],
  );

  const row = res.rows[0];
  const nameRes = await pool.query("select name from upstream_channels where id=$1", [row.channel_id]);
  return {
    id: String(row.id),
    arkModelId: String(row.ark_model_id),
    channelId: String(row.channel_id),
    channelName: String(nameRes.rows[0]?.name || ""),
    priority: Number(row.priority),
    enabled: Boolean(row.enabled),
    upstreamModelOverride: row.upstream_model_override ? String(row.upstream_model_override) : null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export async function deleteRoute(routeId: string): Promise<void> {
  const pool = await getPool();
  if (!pool) throw new Error("Database not configured");
  await pool.query("delete from upstream_model_routes where id=$1", [routeId]);
}

function resolveAzureApiVersion(metadata: Record<string, unknown>): string {
  const v = metadata.apiVersion ?? metadata.api_version;
  return typeof v === "string" && v.trim() ? v.trim() : "2024-02-01";
}

function createProbePayload(channelType: ChannelType, upstreamModel: string): { headers: Record<string, string>; body: string; urlPart: string } {
  const payload: Record<string, unknown> = {
    stream: false,
    max_tokens: 1,
    temperature: 0,
    messages: [{ role: "user", content: "ping" }],
  };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (channelType !== "azure_openai") {
    payload.model = upstreamModel;
  }

  return { headers, body: JSON.stringify(payload), urlPart: "/chat/completions" };
}

export async function runChannelHealthCheck(channelId: string, preferredArkModelId?: string) {
  const pool = await getPool();
  if (!pool) throw new Error("Database not configured");

  const channelRes = await pool.query("select * from upstream_channels where id=$1", [channelId]);
  const channel = channelRes.rows[0];
  if (!channel) throw new Error("Channel not found");

  const mapping = (channel.model_mapping || {}) as Record<string, string>;
  const modelEntry =
    (preferredArkModelId && mapping[preferredArkModelId] && [preferredArkModelId, mapping[preferredArkModelId]]) ||
    Object.entries(mapping)[0];

  if (!modelEntry) {
    await pool.query(
      `update upstream_channels
          set health_status='unhealthy',
              last_health_check_at=now(),
              last_latency_ms=null,
              last_health_error='No model mapping configured',
              updated_at=now()
        where id=$1`,
      [channelId],
    );
    return { ok: false, status: 500, latencyMs: null, error: "No model mapping configured" };
  }

  const [arkModelId, upstreamModel] = modelEntry;
  const resolved = resolveChannelApiKey(channel as Record<string, unknown>);
  const apiKey = resolved.apiKey || "";

  if (!apiKey) {
    await pool.query(
      `update upstream_channels
          set health_status='unhealthy',
              last_health_check_at=now(),
              last_latency_ms=null,
              last_health_error='API key decrypt failed',
              updated_at=now()
        where id=$1`,
      [channelId],
    );
    return { ok: false, status: 500, latencyMs: null, error: "API key decrypt failed", healthStatus: "unhealthy" };
  }

  if (resolved.source === "fallback") {
    try {
      await pool.query(
        `update upstream_channels
            set api_key_encrypted=$2,
                encryption_kid='v1',
                updated_at=now()
          where id=$1`,
        [channelId, encryptApiKey(apiKey)],
      );
    } catch {
      // best-effort self-heal; health check can continue using fallback key
    }
  }

  const channelType = String(channel.channel_type) as ChannelType;
  const baseUrl = String(channel.base_url || "").replace(/\/$/, "");
  const metadata = (channel.metadata || {}) as Record<string, unknown>;
  const timeoutMs = Math.max(1000, Math.min(30000, Number(channel.timeout_ms || 10000)));

  const probe = createProbePayload(channelType, upstreamModel);
  const headers = probe.headers;
  let endpoint = "";
  let body = probe.body;

  if (channelType === "azure_openai") {
    headers["api-key"] = apiKey;
    const apiVersion = resolveAzureApiVersion(metadata);
    const isProjectEndpoint = /\/api\/projects\//i.test(baseUrl) || String(metadata.endpointFlavor || "").toLowerCase() === "project";
    if (isProjectEndpoint) {
      endpoint = `${baseUrl}/models/responses?api-version=${encodeURIComponent(apiVersion)}`;
      body = JSON.stringify({
        model: String(upstreamModel),
        input: "ping",
        stream: false,
        max_output_tokens: 1,
      });
    } else {
      endpoint = `${baseUrl}/openai/deployments/${encodeURIComponent(String(upstreamModel))}${probe.urlPart}?api-version=${encodeURIComponent(apiVersion)}`;
    }
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
    endpoint = `${baseUrl}${probe.urlPart}`;
  }

  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    const latencyMs = Date.now() - start;

    if (response.ok) {
      const nextHealth: HealthStatus = latencyMs > 2500 ? "degraded" : "healthy";
      await pool.query(
        `update upstream_channels
            set health_status=$3,
                last_health_check_at=now(),
                last_latency_ms=$2,
                last_health_error=$4,
                updated_at=now()
          where id=$1`,
        [channelId, latencyMs, nextHealth, nextHealth === "degraded" ? "High latency" : null],
      );
      return { ok: true, status: response.status, latencyMs, model: arkModelId, upstreamModel, healthStatus: nextHealth };
    }

    const errorText = await response.text();
    const nextHealth: HealthStatus = [408, 429, 500, 502, 503, 504].includes(response.status) ? "degraded" : "unhealthy";
    await pool.query(
      `update upstream_channels
          set health_status=$4,
              last_health_check_at=now(),
              last_latency_ms=$2,
              last_health_error=$3,
              updated_at=now()
        where id=$1`,
      [channelId, latencyMs, `HTTP ${response.status}: ${errorText.slice(0, 500)}`, nextHealth],
    );
    return { ok: false, status: response.status, latencyMs, model: arkModelId, upstreamModel, error: errorText.slice(0, 500), healthStatus: nextHealth };
  } catch (error) {
    const latencyMs = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    await pool.query(
      `update upstream_channels
          set health_status='unhealthy',
              last_health_check_at=now(),
              last_latency_ms=$2,
              last_health_error=$3,
              updated_at=now()
        where id=$1`,
      [channelId, latencyMs, `FETCH_ERROR: ${message.slice(0, 500)}`],
    );
    return { ok: false, status: 503, latencyMs, model: arkModelId, upstreamModel, error: message };
  } finally {
    clearTimeout(timer);
  }
}
