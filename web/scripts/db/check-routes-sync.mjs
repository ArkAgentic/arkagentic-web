import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const TARGET_CHANNEL = "azure-openai-primary";
const TARGET_PRIORITY = 1;

const EXPECTED = [
  { arkModelId: "ark-claude-haiku-4-5", upstream: "claude-haiku-4-5" },
  { arkModelId: "ark-gpt-5.6-terra", upstream: "gpt-5.6-terra" },
  { arkModelId: "ark-gpt-5.6-luna", upstream: "gpt-5.6-luna" },
  { arkModelId: "ark-gpt-5.6-sol", upstream: "gpt-5.6-sol" },
  { arkModelId: "ark-mai-thinking-1", upstream: "MAI-Thinking-1" },
  { arkModelId: "ark-mai-image-2.5-pro", upstream: "MAI-Image-2.5-Pro" },
  { arkModelId: "ark-cohere-rerank-v4-fast", upstream: "Cohere-rerank-v4.0-fast" },
  { arkModelId: "ark-cohere-rerank-v4-pro", upstream: "Cohere-rerank-v4.0-pro" },
  { arkModelId: "ark-cohere-embed-v3", upstream: "Cohere-embed-v3-multilingual" },
  { arkModelId: "ark-deepseek-v4-flash", upstream: "DeepSeek-V4-Flash" },
  { arkModelId: "ark-deepseek-v4-pro", upstream: "DeepSeek-V4-Pro" },
  { arkModelId: "ark-claude-opus-5", upstream: "claude-opus-5" },
  { arkModelId: "ark-claude-sonnet-5", upstream: "claude-sonnet-5" },
  { arkModelId: "ark-gpt-4o", upstream: "gpt-4o" },
  { arkModelId: "ark-gpt-5.3-codex", upstream: "gpt-5.3-codex" },
];

function indexByArk(items) {
  return new Map(items.map((x) => [x.arkModelId, x]));
}

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    const channelRes = await client.query(
      `select id, name, enabled, model_mapping
       from upstream_channels
       where name = $1
       limit 1`,
      [TARGET_CHANNEL],
    );

    if (!channelRes.rows[0]) {
      console.error(JSON.stringify({ ok: false, error: `channel_not_found:${TARGET_CHANNEL}` }, null, 2));
      process.exitCode = 2;
      return;
    }

    const channel = channelRes.rows[0];
    const modelMapping = channel.model_mapping || {};

    const routesRes = await client.query(
      `select ark_model_id, priority, enabled, upstream_model_override
       from upstream_model_routes
       where channel_id = $1
         and priority = $2`,
      [channel.id, TARGET_PRIORITY],
    );

    const expectedMap = indexByArk(EXPECTED);
    const routeRows = routesRes.rows.map((r) => ({
      arkModelId: String(r.ark_model_id),
      upstream: String(r.upstream_model_override || modelMapping[String(r.ark_model_id)] || ""),
      enabled: Boolean(r.enabled),
      priority: Number(r.priority),
    }));

    const routeMap = indexByArk(routeRows);

    const missingInRoutes = [];
    const missingInModelMapping = [];
    const mismatchedUpstream = [];
    const disabledRoutes = [];

    for (const expected of EXPECTED) {
      const route = routeMap.get(expected.arkModelId);
      const mapped = modelMapping[expected.arkModelId];

      if (!route) missingInRoutes.push(expected.arkModelId);
      if (!mapped) missingInModelMapping.push(expected.arkModelId);
      if (route && !route.enabled) disabledRoutes.push(expected.arkModelId);

      const routeUpstream = route?.upstream || "";
      const mappedUpstream = String(mapped || "");
      const upstreamMismatch =
        (route && routeUpstream && routeUpstream !== expected.upstream) ||
        (mapped && mappedUpstream !== expected.upstream);

      if (upstreamMismatch) {
        mismatchedUpstream.push({
          arkModelId: expected.arkModelId,
          expected: expected.upstream,
          routeUpstream: routeUpstream || null,
          mappedUpstream: mappedUpstream || null,
        });
      }
    }

    const extraRoutes = routeRows
      .map((r) => r.arkModelId)
      .filter((arkModelId) => !expectedMap.has(arkModelId))
      .sort((a, b) => a.localeCompare(b));

    const extraMapping = Object.keys(modelMapping)
      .filter((arkModelId) => !expectedMap.has(arkModelId))
      .sort((a, b) => a.localeCompare(b));

    const ok =
      missingInRoutes.length === 0 &&
      missingInModelMapping.length === 0 &&
      mismatchedUpstream.length === 0 &&
      disabledRoutes.length === 0;

    const result = {
      ok,
      scope: {
        channel: TARGET_CHANNEL,
        priority: TARGET_PRIORITY,
      },
      summary: {
        expectedCount: EXPECTED.length,
        routeCountAtPriority: routeRows.length,
        mappingCount: Object.keys(modelMapping).length,
      },
      checks: {
        missingInRoutes,
        missingInModelMapping,
        mismatchedUpstream,
        disabledRoutes,
        extraRoutes,
        extraMapping,
      },
    };

    console.log(JSON.stringify(result, null, 2));
    if (!ok) process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
