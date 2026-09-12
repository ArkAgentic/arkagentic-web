import { randomUUID } from "crypto";
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { encryptSecret } from "./encryption.mjs";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

const pool = new pg.Pool({ connectionString: DATABASE_URL });

function isConfigured(value) {
  if (!value) return false;
  const normalized = String(value).trim().toLowerCase();
  return Boolean(normalized && normalized !== "not-configured" && !normalized.includes("placeholder"));
}

function toMappingEntries(mapping) {
  return Object.fromEntries(Object.entries(mapping).filter(([, v]) => Boolean(v)));
}

function normalizeAzureOpenaiBaseUrl(raw) {
  const base = String(raw || "").replace(/\/$/, "");
  return base.replace(/\/openai(?:\/v\d+)?$/i, "");
}

const AZURE_FOUNDRY_MODEL_MAPPING = {
  "ark-gpt-4o": process.env.AZURE_OPENAI_DEPLOYMENT_GPT4O || "gpt-4o",
  "ark-gpt-5.3-codex": process.env.AZURE_OPENAI_DEPLOYMENT_GPT53_CODEX || "gpt-5.3-codex",
  "ark-gpt-5.6-terra": process.env.AZURE_OPENAI_DEPLOYMENT_GPT56_TERRA || "gpt-5.6-terra",
  "ark-gpt-5.6-luna": process.env.AZURE_OPENAI_DEPLOYMENT_GPT56_LUNA || "gpt-5.6-luna",
  "ark-gpt-5.6-sol": process.env.AZURE_OPENAI_DEPLOYMENT_GPT56_SOL || "gpt-5.6-sol",
  "ark-claude-sonnet-5": process.env.AZURE_OPENAI_DEPLOYMENT_CLAUDE_SONNET_5 || "claude-sonnet-5",
  "ark-claude-opus-5": process.env.AZURE_OPENAI_DEPLOYMENT_CLAUDE_OPUS_5 || "claude-opus-5",
  "ark-claude-haiku-4-5": process.env.AZURE_OPENAI_DEPLOYMENT_CLAUDE_HAIKU_45 || "claude-haiku-4-5",
  "ark-deepseek-v4-pro": process.env.AZURE_OPENAI_DEPLOYMENT_DEEPSEEK_V4_PRO || "DeepSeek-V4-Pro",
  "ark-deepseek-v4-flash": process.env.AZURE_OPENAI_DEPLOYMENT_DEEPSEEK_V4_FLASH || "DeepSeek-V4-Flash",
  "ark-mai-thinking-1": process.env.AZURE_OPENAI_DEPLOYMENT_MAI_THINKING_1 || "MAI-Thinking-1",
  "ark-cohere-embed-v3": process.env.AZURE_OPENAI_DEPLOYMENT_COHERE_EMBED_V3 || "Cohere-embed-v3-multilingual",
  "ark-cohere-rerank-v4-pro": process.env.AZURE_OPENAI_DEPLOYMENT_COHERE_RERANK_V4_PRO || "Cohere-rerank-v4.0-pro",
  "ark-cohere-rerank-v4-fast": process.env.AZURE_OPENAI_DEPLOYMENT_COHERE_RERANK_V4_FAST || "Cohere-rerank-v4.0-fast",
  "ark-mai-image-2.5-pro": process.env.AZURE_OPENAI_DEPLOYMENT_MAI_IMAGE_25_PRO || "MAI-Image-2.5-Pro",
  "ark-mai-transcribe-1.5": process.env.AZURE_OPENAI_DEPLOYMENT_MAI_TRANSCRIBE_15 || "MAI-Transcribe-1.5",
  "ark-mai-voice-2": process.env.AZURE_OPENAI_DEPLOYMENT_MAI_VOICE_2 || "MAI-Voice-2",
};

function resolveAzureEndpointAndFlavor() {
  // Canonical seed channel: azure-openai-primary (legacy endpoint only).
  // We intentionally do not seed project endpoints here to avoid unhealthy seed snapshots.
  if (isConfigured(process.env.AZURE_OPENAI_ENDPOINT)) {
    return {
      baseUrl: normalizeAzureOpenaiBaseUrl(process.env.AZURE_OPENAI_ENDPOINT),
      flavor: "legacy",
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-02-01",
      name: "azure-openai-primary",
    };
  }

  return null;
}

async function ensureSchemaMigrations(client) {
  await client.query(`
    create table if not exists schema_migrations (
      id serial primary key,
      filename varchar(255) not null unique,
      applied_at timestamptz not null default now()
    )
  `);
}

function listMigrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
}

async function applyMigrations(client) {
  const files = listMigrationFiles();
  const appliedRes = await client.query("select filename from schema_migrations");
  const applied = new Set(appliedRes.rows.map((r) => r.filename));

  const executed = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    await client.query(sql);
    await client.query("insert into schema_migrations(filename) values($1)", [file]);
    executed.push(file);
  }
  return executed;
}

async function seedFounder(client) {
  const founderEmail = (process.env.FOUNDER_ADMIN_EMAIL || "charles.zhang@arkagentic.com").toLowerCase();
  const founderId = `usr_${Buffer.from(founderEmail).toString("hex").slice(0, 16)}`;

  await client.query(
    `insert into users(id,email,name,role,status,balance_usd,total_deposited_usd,pricing_tier)
     values ($1,$2,$3,'admin','active',0,0,'tier_1')
     on conflict (email) do update set role='admin'`,
    [founderId, founderEmail, "Founder"],
  );

  return { founderEmail, founderId };
}

function shouldRotateApiKeyOnSeed() {
  return String(process.env.SEED_FORCE_API_KEY_ROTATION || "").trim().toLowerCase() === "true";
}

async function upsertChannel(client, input) {
  const rotateApiKey = shouldRotateApiKeyOnSeed();
  const res = await client.query(
    `insert into upstream_channels(
      id, channel_type, name, base_url, api_key_encrypted, encryption_kid, model_mapping, timeout_ms, enabled, metadata, updated_at
    ) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10::jsonb,now())
    on conflict (name) do update set
      channel_type = excluded.channel_type,
      base_url = excluded.base_url,
      api_key_encrypted = case when $11 then excluded.api_key_encrypted else upstream_channels.api_key_encrypted end,
      encryption_kid = case when $11 then excluded.encryption_kid else upstream_channels.encryption_kid end,
      model_mapping = excluded.model_mapping,
      timeout_ms = excluded.timeout_ms,
      enabled = excluded.enabled,
      metadata = excluded.metadata,
      updated_at = now()
    returning id`,
    [
      input.id,
      input.channelType,
      input.name,
      input.baseUrl,
      input.apiKeyEncrypted,
      input.encryptionKid,
      JSON.stringify(input.modelMapping),
      input.timeoutMs,
      input.enabled,
      JSON.stringify(input.metadata || {}),
      rotateApiKey,
    ],
  );
  return res.rows[0].id;
}

async function upsertRoute(client, input) {
  await client.query(
    `insert into upstream_model_routes(
      id, ark_model_id, channel_id, priority, enabled, upstream_model_override, updated_at
    ) values ($1,$2,$3,$4,$5,$6,now())
    on conflict (ark_model_id, priority) do update set
      channel_id = excluded.channel_id,
      enabled = excluded.enabled,
      upstream_model_override = excluded.upstream_model_override,
      updated_at = now()`,
    [
      input.id,
      input.arkModelId,
      input.channelId,
      input.priority,
      input.enabled,
      input.upstreamModelOverride || null,
    ],
  );
}

async function seedUpstreamChannels(client) {
  const encryptionSecret = process.env.ENCRYPTION_SECRET;
  if (!isConfigured(encryptionSecret)) {
    console.warn("ENCRYPTION_SECRET not configured; skipping upstream channel seed");
    return { channels: [], routes: [] };
  }

  const seeds = [];
  const azurePrimary = resolveAzureEndpointAndFlavor();
  const azureConfigured = Boolean(azurePrimary) && isConfigured(process.env.AZURE_OPENAI_API_KEY);

  if (azureConfigured && azurePrimary) {
    const azureModelMapping = toMappingEntries(AZURE_FOUNDRY_MODEL_MAPPING);

    seeds.push({
      channelType: "azure_openai",
      name: azurePrimary.name,
      baseUrl: azurePrimary.baseUrl,
      rawApiKey: process.env.AZURE_OPENAI_API_KEY,
      modelMapping: azureModelMapping,
      timeoutMs: 45000,
      metadata: { apiVersion: azurePrimary.apiVersion, endpointFlavor: azurePrimary.flavor },
      routePriority: 1,
    });
  }

  if (isConfigured(process.env.OPENAI_API_KEY)) {
    seeds.push({
      channelType: "openai_standard",
      name: "openai-direct-fallback",
      baseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
      rawApiKey: process.env.OPENAI_API_KEY,
      modelMapping: toMappingEntries({
        "ark-gpt-4o": process.env.OPENAI_MODEL_GPT4O || "gpt-4o",
        "ark-gpt-5.3-codex": process.env.OPENAI_MODEL_GPT53_CODEX || "gpt-5.3-codex",
      }),
      timeoutMs: 45000,
      metadata: {},
      routePriority: azureConfigured ? 2 : 1,
    });
  }

  if (isConfigured(process.env.SILICONFLOW_API_KEY)) {
    seeds.push({
      channelType: "siliconflow",
      name: "siliconflow-primary",
      baseUrl: (process.env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1").replace(/\/$/, ""),
      rawApiKey: process.env.SILICONFLOW_API_KEY,
      modelMapping: toMappingEntries({
        "ark-deepseek-r1": process.env.SILICONFLOW_MODEL_DEEPSEEK_R1 || "deepseek-ai/DeepSeek-R1",
        "ark-qwen-2.5-max": process.env.SILICONFLOW_MODEL_QWEN_25_MAX || "Qwen/Qwen2.5-Max",
      }),
      timeoutMs: 45000,
      metadata: {},
      routePriority: 1,
    });
  }

  if (isConfigured(process.env.OPENROUTER_API_KEY)) {
    seeds.push({
      channelType: "openai_standard",
      name: "openrouter-primary",
      baseUrl: (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, ""),
      rawApiKey: process.env.OPENROUTER_API_KEY,
      modelMapping: toMappingEntries({
        "ark-claude-3-5-sonnet": process.env.OPENROUTER_MODEL_CLAUDE_35_SONNET || "anthropic/claude-3.5-sonnet",
        "ark-gemini-1.5-pro": process.env.OPENROUTER_MODEL_GEMINI_15_PRO || "google/gemini-1.5-pro",
        "ark-kimi-k2": process.env.OPENROUTER_MODEL_KIMI_K2 || "moonshotai/kimi-k2",
      }),
      timeoutMs: 45000,
      metadata: {},
      routePriority: 1,
    });
  }

  const createdChannels = [];
  const createdRoutes = [];

  for (const seed of seeds) {
    if (!seed.rawApiKey || Object.keys(seed.modelMapping).length === 0) continue;

    const channelId = await upsertChannel(client, {
      id: randomUUID(),
      channelType: seed.channelType,
      name: seed.name,
      baseUrl: seed.baseUrl,
      apiKeyEncrypted: encryptSecret(seed.rawApiKey, encryptionSecret, "v1"),
      encryptionKid: "v1",
      modelMapping: seed.modelMapping,
      timeoutMs: seed.timeoutMs,
      enabled: true,
      metadata: seed.metadata,
    });

    createdChannels.push({ name: seed.name, id: channelId, models: Object.keys(seed.modelMapping) });

    const modelIds = Object.keys(seed.modelMapping);
    for (const modelId of modelIds) {
      await upsertRoute(client, {
        id: randomUUID(),
        arkModelId: modelId,
        channelId,
        priority: seed.routePriority,
        enabled: true,
      });
      createdRoutes.push({ modelId, channel: seed.name, priority: seed.routePriority });
    }
  }

  return { channels: createdChannels, routes: createdRoutes };
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("begin");

    await ensureSchemaMigrations(client);
    const executedMigrations = await applyMigrations(client);
    const founder = await seedFounder(client);
    const upstream = await seedUpstreamChannels(client);

    await client.query("commit");

    console.log(
      JSON.stringify({
        ok: true,
        migrationId: randomUUID(),
        executedMigrations,
        founder,
        upstreamSeedSummary: {
          channels: upstream.channels.map((x) => ({ name: x.name, id: x.id, models: x.models })),
          routes: upstream.routes,
        },
      }),
    );
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
