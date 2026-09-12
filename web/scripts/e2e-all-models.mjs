import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import pg from "pg";

function loadEnvFromFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFromFile(path.resolve(process.cwd(), ".env"));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const GATEWAY_BASE_URL = (process.env.GATEWAY_BASE_URL || "http://localhost:3101").replace(/\/$/, "");
const pool = new pg.Pool({ connectionString: DATABASE_URL });

const TARGET_MODELS = [
  "ark-gpt-4o",
  "ark-gpt-5.3-codex",
  "ark-claude-sonnet-5",
  "ark-claude-opus-5",
  "ark-deepseek-v4-pro",
  "ark-deepseek-v4-flash",
  "ark-mai-thinking-1",
  "ark-cohere-embed-v3",
  "ark-cohere-rerank-v4-pro",
  "ark-cohere-rerank-v4-fast",
  "ark-mai-image-2.5-pro",
  "ark-mai-transcribe-1.5",
  "ark-mai-voice-2",
];

function randomApiKey() {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let body = "";
  for (let i = 0; i < 48; i += 1) body += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `sk-ark-${body}`;
}

function makeId(prefix, seed) {
  return `${prefix}_${createHash("md5").update(seed).digest("hex").slice(0, 12)}`;
}

async function ensureTestPrincipal(client, apiKey) {
  const ts = Date.now();
  const email = `e2e.allmodels.${ts}@arkagentic.com`;
  const userId = `usr_${Buffer.from(email).toString("hex").slice(0, 16)}`;
  const keyId = makeId("key", apiKey);
  const keyHash = createHash("sha256").update(apiKey).digest("hex");
  const keyPrefix = `${apiKey.slice(0, 11)}...`;

  await client.query(
    `insert into users(id,email,name,role,status,balance_usd,total_deposited_usd,pricing_tier)
     values ($1,lower($2),$3,'user','active',10000,10000,'tier_2')
     on conflict (id) do update set
       status='active',
       pricing_tier='tier_2',
       balance_usd=10000,
       total_deposited_usd=10000`,
    [userId, email, "E2E All Models User"],
  );

  await client.query(
    `insert into api_keys(id,user_id,key_hash,key_prefix,quota_limit,status)
     values ($1,$2,$3,$4,$5,'active')
     on conflict (id) do update set
       key_hash=excluded.key_hash,
       key_prefix=excluded.key_prefix,
       status='active',
       quota_limit=excluded.quota_limit`,
    [keyId, userId, keyHash, keyPrefix, 10_000_000],
  );

  return { userId, email, keyId };
}

async function getActiveModels(client) {
  const res = await client.query(
    `select distinct r.ark_model_id
     from upstream_model_routes r
     join upstream_channels c on c.id = r.channel_id
     where r.enabled = true and c.enabled = true
     order by r.ark_model_id asc`,
  );
  return res.rows.map((r) => String(r.ark_model_id));
}

async function getMetrics(client, userId, modelId) {
  const bal = await client.query(`select coalesce(balance_usd,0)::float8 as balance from users where id=$1`, [userId]);
  const logs = await client.query(
    `select count(*)::int as count,
            coalesce(sum(charged_usd),0)::float8 as charged
     from api_logs
     where user_id=$1 and model_id=$2`,
    [userId, modelId],
  );
  return {
    balance: Number(bal.rows[0]?.balance ?? 0),
    logCount: Number(logs.rows[0]?.count ?? 0),
    chargedTotal: Number(logs.rows[0]?.charged ?? 0),
  };
}

async function postNonStream(apiKey, modelId) {
  try {
    const response = await fetch(`${GATEWAY_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        stream: false,
        messages: [{ role: "user", content: `Say: E2E_OK_${modelId}` }],
      }),
    });

    const text = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // noop
    }

    return {
      status: response.status,
      ok: response.ok,
      hasChoices: Array.isArray(parsed?.choices),
      preview: text.slice(0, 200),
    };
  } catch (error) {
    return {
      status: -1,
      ok: false,
      hasChoices: false,
      preview: error instanceof Error ? error.message : String(error),
    };
  }
}

async function postStream(apiKey, modelId) {
  try {
    const response = await fetch(`${GATEWAY_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        stream: true,
        messages: [{ role: "user", content: `Count 1 to 3 for ${modelId}` }],
      }),
    });

    const bodyText = await response.text();
    return {
      status: response.status,
      ok: response.ok,
      hasDone: bodyText.includes("[DONE]"),
      preview: bodyText.slice(0, 200),
    };
  } catch (error) {
    return {
      status: -1,
      ok: false,
      hasDone: false,
      preview: error instanceof Error ? error.message : String(error),
    };
  }
}

function pad(v, width) {
  const s = String(v);
  return s.length >= width ? s.slice(0, width) : s + " ".repeat(width - s.length);
}

function printTable(rows) {
  const header = [
    pad("Model Name", 26),
    pad("HTTP Status", 12),
    pad("Stream Status", 13),
    pad("Balance Deducted", 16),
    pad("Result", 8),
  ].join(" | ");
  console.log("\n" + header);
  console.log("-".repeat(header.length));
  for (const row of rows) {
    console.log(
      [
        pad(row.model, 26),
        pad(row.httpStatus, 12),
        pad(row.streamStatus, 13),
        pad(row.balanceDeducted.toFixed(6), 16),
        pad(row.pass ? "PASS" : "FAIL", 8),
      ].join(" | "),
    );
  }
}

async function main() {
  const client = await pool.connect();
  try {
    const activeModels = new Set(await getActiveModels(client));
    if (!activeModels.size) {
      throw new Error("No active model routes found in upstream_model_routes.");
    }

    const apiKey = randomApiKey();
    const principal = await ensureTestPrincipal(client, apiKey);

    const results = [];
    for (const modelId of TARGET_MODELS) {
      if (!activeModels.has(modelId)) {
        results.push({
          model: modelId,
          httpStatus: "N/A",
          streamStatus: "N/A",
          balanceDeducted: 0,
          logsDelta: 0,
          chargedDelta: 0,
          pass: false,
          nonPreview: "Route missing in DB",
          streamPreview: "Route missing in DB",
        });
        continue;
      }

      const before = await getMetrics(client, principal.userId, modelId);
      const non = await postNonStream(apiKey, modelId);
      const stream = await postStream(apiKey, modelId);
      const after = await getMetrics(client, principal.userId, modelId);

      const balanceDeducted = before.balance - after.balance;
      const logsDelta = after.logCount - before.logCount;
      const chargedDelta = after.chargedTotal - before.chargedTotal;

      const pass =
        non.status === 200 &&
        non.hasChoices &&
        stream.status === 200 &&
        stream.hasDone &&
        logsDelta >= 2 &&
        balanceDeducted > 0 &&
        chargedDelta > 0;

      results.push({
        model: modelId,
        httpStatus: non.status,
        streamStatus: stream.status,
        balanceDeducted,
        logsDelta,
        chargedDelta,
        pass,
        nonPreview: non.preview,
        streamPreview: stream.preview,
      });
    }

    printTable(results);

    const failed = results.filter((x) => !x.pass);
    if (failed.length) {
      console.log("\nFailure details:");
      for (const row of failed) {
        console.log(`- ${row.model}: non=${row.httpStatus}, stream=${row.streamStatus}, logsDelta=${row.logsDelta}, chargedDelta=${row.chargedDelta.toFixed(6)}`);
        console.log(`  non preview: ${row.nonPreview}`);
        console.log(`  stream preview: ${row.streamPreview}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log(`\nAll ${results.length} active models passed E2E regression checks.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
