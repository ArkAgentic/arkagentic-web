import { Pool } from "pg";
import { decryptApiKey } from "./upstream-crypto";

export type UpstreamChannelType = "azure_openai" | "openai_standard" | "siliconflow" | "custom";

export type UpstreamCandidate = {
  channelId: string;
  channelName: string;
  channelType: UpstreamChannelType;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  priority: number;
  upstreamModel: string;
  metadata: Record<string, unknown>;
};

export type ActiveModelMetadata = {
  displayName?: string;
  deploymentType?: string;
  provider?: string;
};

let pgPool: Pool | null | undefined;

async function getPool(): Promise<Pool | null> {
  if (pgPool !== undefined) return pgPool;
  if (!process.env.DATABASE_URL) {
    pgPool = null;
    return pgPool;
  }
  pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pgPool;
}

function isConfiguredSecret(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "not-configured") return false;
  if (normalized.includes("placeholder")) return false;
  return true;
}

export async function getUpstreamCandidatesForModel(arkModelId: string): Promise<UpstreamCandidate[]> {
  const pool = await getPool();
  if (!pool) return [];

  const res = await pool.query(
    `select
       c.id as channel_id,
       c.name as channel_name,
       c.channel_type,
       c.base_url,
       c.api_key_encrypted,
       c.timeout_ms,
       c.model_mapping,
       c.metadata,
       r.priority,
       r.upstream_model_override
     from upstream_model_routes r
     join upstream_channels c on c.id = r.channel_id
     where r.ark_model_id = $1
       and r.enabled = true
       and c.enabled = true
     order by r.priority asc`,
    [arkModelId],
  );

  const out: UpstreamCandidate[] = [];
  for (const row of res.rows) {
    let apiKey = "";
    try {
      apiKey = decryptApiKey(String(row.api_key_encrypted || ""));
    } catch {
      continue;
    }
    if (!isConfiguredSecret(apiKey)) continue;

    const modelMapping = (row.model_mapping || {}) as Record<string, string>;
    const override = String(row.upstream_model_override || "").trim();
    const mapped = String(modelMapping?.[arkModelId] || "").trim();
    const upstreamModel = override || mapped;
    if (!upstreamModel) continue;

    out.push({
      channelId: String(row.channel_id),
      channelName: String(row.channel_name),
      channelType: row.channel_type as UpstreamChannelType,
      baseUrl: String(row.base_url || "").replace(/\/$/, ""),
      apiKey,
      timeoutMs: Number(row.timeout_ms || 45000),
      priority: Number(row.priority || 99),
      upstreamModel,
      metadata: (row.metadata || {}) as Record<string, unknown>,
    });
  }

  return out;
}

export async function getActiveModelIdSet(): Promise<Set<string>> {
  const pool = await getPool();
  if (!pool) return new Set();

  const res = await pool.query(
    `select distinct r.ark_model_id
     from upstream_model_routes r
     join upstream_channels c on c.id = r.channel_id
     where r.enabled = true and c.enabled = true`,
  );

  return new Set(res.rows.map((r) => String(r.ark_model_id)));
}

export async function getActiveModelMetadataMap(): Promise<Map<string, ActiveModelMetadata>> {
  const pool = await getPool();
  if (!pool) return new Map();

  const res = await pool.query(
    `select r.ark_model_id, r.upstream_model_override, c.channel_type, c.metadata
     from upstream_model_routes r
     join upstream_channels c on c.id = r.channel_id
     where r.enabled = true and c.enabled = true
     order by r.ark_model_id asc, r.priority asc`,
  );

  const out = new Map<string, ActiveModelMetadata>();

  for (const row of res.rows) {
    const arkModelId = String(row.ark_model_id || "").trim();
    if (!arkModelId || out.has(arkModelId)) continue;

    const metadata = (row.metadata || {}) as Record<string, unknown>;
    const deployments = (metadata.deployments || {}) as Record<string, unknown>;
    const depMeta = (deployments[arkModelId] || {}) as Record<string, unknown>;

    const displayName =
      String(depMeta.modelName || row.upstream_model_override || "")
        .trim()
        .replace(/\s+/g, " ") || undefined;
    const deploymentType = String(depMeta.deploymentType || "").trim() || undefined;
    const provider = String(row.channel_type || "").trim() || undefined;

    out.set(arkModelId, { displayName, deploymentType, provider });
  }

  return out;
}
