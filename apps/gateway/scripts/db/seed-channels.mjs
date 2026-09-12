import { randomUUID } from "crypto";
import pg from "pg";
import { encryptSecret } from "./encryption.mjs";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

function isConfigured(value) {
  if (!value) return false;
  const normalized = String(value).trim().toLowerCase();
  return Boolean(normalized && normalized !== "not-configured" && !normalized.includes("placeholder"));
}

function cleanMap(input) {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => Boolean(v)));
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

function shouldRotateApiKeyOnSeed() {
  return String(process.env.SEED_FORCE_API_KEY_ROTATION || "").trim().toLowerCase() === "true";
}

async function upsertChannel(client, item) {
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
      randomUUID(),
      item.channelType,
      item.name,
      item.baseUrl,
      item.apiKeyEncrypted,
      "v1",
      JSON.stringify(item.modelMapping),
      item.timeoutMs,
      true,
      JSON.stringify(item.metadata || {}),
      rotateApiKey,
    ],
  );
  return res.rows[0].id;
}

async function upsertRoute(client, row) {
  await client.query(
    `insert into upstream_model_routes(
      id, ark_model_id, channel_id, priority, enabled, upstream_model_override, updated_at
    ) values ($1,$2,$3,$4,$5,$6,now())
    on conflict (ark_model_id, priority) do update set
      channel_id = excluded.channel_id,
      enabled = excluded.enabled,
      upstream_model_override = excluded.upstream_model_override,
      updated_at = now()`,
    [randomUUID(), row.arkModelId, row.channelId, row.priority, true, row.upstreamModelOverride || null],
  );
}

function buildSeeds() {
  const seeds = [];

  const azurePrimary = resolveAzureEndpointAndFlavor();
  const azureConfigured = Boolean(azurePrimary) && isConfigured(process.env.AZURE_OPENAI_API_KEY);

  if (azureConfigured && azurePrimary) {
    const azureModelMapping = cleanMap(AZURE_FOUNDRY_MODEL_MAPPING);

    seeds.push({
      channelType: "azure_openai",
      name: azurePrimary.name,
      baseUrl: azurePrimary.baseUrl,
      rawApiKey: process.env.AZURE_OPENAI_API_KEY,
      modelMapping: azureModelMapping,
      metadata: {
        apiVersion: azurePrimary.apiVersion,
        endpointFlavor: azurePrimary.flavor,
      },
      timeoutMs: 45000,
      priority: 1,
    });
  }

  if (isConfigured(process.env.OPENAI_API_KEY)) {
    seeds.push({
      channelType: "openai_standard",
      name: "openai-direct-fallback",
      baseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
      rawApiKey: process.env.OPENAI_API_KEY,
      modelMapping: cleanMap({
        "ark-gpt-4o": process.env.OPENAI_MODEL_GPT4O || "gpt-4o",
        "ark-gpt-5.3-codex": process.env.OPENAI_MODEL_GPT53_CODEX || "gpt-5.3-codex",
      }),
      metadata: {},
      timeoutMs: 45000,
      priority: azureConfigured ? 2 : 1,
    });
  }

  if (isConfigured(process.env.SILICONFLOW_API_KEY)) {
    seeds.push({
      channelType: "siliconflow",
      name: "siliconflow-primary",
      baseUrl: (process.env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1").replace(/\/$/, ""),
      rawApiKey: process.env.SILICONFLOW_API_KEY,
      modelMapping: cleanMap({
        "ark-deepseek-r1": process.env.SILICONFLOW_MODEL_DEEPSEEK_R1 || "deepseek-ai/DeepSeek-R1",
        "ark-qwen-2.5-max": process.env.SILICONFLOW_MODEL_QWEN_25_MAX || "Qwen/Qwen2.5-Max",
      }),
      metadata: {},
      timeoutMs: 45000,
      priority: 1,
    });
  }

  if (isConfigured(process.env.OPENROUTER_API_KEY)) {
    seeds.push({
      channelType: "openai_standard",
      name: "openrouter-primary",
      baseUrl: (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, ""),
      rawApiKey: process.env.OPENROUTER_API_KEY,
      modelMapping: cleanMap({
        "ark-claude-3-5-sonnet": process.env.OPENROUTER_MODEL_CLAUDE_35_SONNET || "anthropic/claude-3.5-sonnet",
        "ark-gemini-1.5-pro": process.env.OPENROUTER_MODEL_GEMINI_15_PRO || "google/gemini-1.5-pro",
        "ark-kimi-k2": process.env.OPENROUTER_MODEL_KIMI_K2 || "moonshotai/kimi-k2",
      }),
      metadata: {},
      timeoutMs: 45000,
      priority: 1,
    });
  }

  return seeds.filter((x) => isConfigured(x.rawApiKey) && Object.keys(x.modelMapping).length > 0);
}

async function main() {
  if (!isConfigured(process.env.ENCRYPTION_SECRET)) {
    throw new Error("ENCRYPTION_SECRET is required");
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const seeds = buildSeeds();

    const summary = [];
    for (const seed of seeds) {
      const channelId = await upsertChannel(client, {
        ...seed,
        apiKeyEncrypted: encryptSecret(seed.rawApiKey, process.env.ENCRYPTION_SECRET, "v1"),
      });

      const models = Object.entries(seed.modelMapping);
      for (const [arkModelId, upstreamModelOverride] of models) {
        await upsertRoute(client, { channelId, arkModelId, upstreamModelOverride, priority: seed.priority });
      }

      summary.push({ name: seed.name, channelId, priority: seed.priority, modelCount: models.length });
    }

    await client.query("commit");
    console.log(JSON.stringify({ ok: true, seeded: summary }, null, 2));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
