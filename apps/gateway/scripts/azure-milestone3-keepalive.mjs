#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "pg";
import { BlobServiceClient } from "@azure/storage-blob";

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const VERBOSE = args.has("--verbose");

const env = process.env;

function run(cmd, argv, options = {}) {
  const res = spawnSync(cmd, argv, {
    encoding: "utf-8",
    input: options.input,
    timeout: options.timeoutMs ?? 120000,
  });
  if (res.status !== 0) {
    const err = (res.stderr || res.stdout || "").trim();
    throw new Error(`${cmd} ${argv.join(" ")} failed: ${err}`);
  }
  return (res.stdout || "").trim();
}

function azJson(argv, options = {}) {
  const out = run("az", [...argv, "-o", "json"], options);
  return out ? JSON.parse(out) : null;
}

function ok(name, details = "") {
  return { name, status: "PASS", details };
}
function skip(name, details = "") {
  return { name, status: "SKIP", details };
}
function fail(name, details = "") {
  return { name, status: "FAIL", details };
}

async function pingAzureOpenAI() {
  const name = "Azure OpenAI ping";
  const endpoint = env.AZURE_OPENAI_ENDPOINT;
  const apiKey = env.AZURE_OPENAI_API_KEY;
  const deployment =
    env.AZURE_OPENAI_DEPLOYMENT_GPT4O ||
    env.AZURE_OPENAI_DEPLOYMENT ||
    env.AZURE_OPENAI_DEPLOYMENT_EMBEDDING ||
    "gpt-4o";
  const apiVersion = env.AZURE_OPENAI_API_VERSION || "2024-06-01";

  if (!endpoint || !apiKey || !deployment) {
    return skip(name, "Missing AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY / deployment env var");
  }

  const url = `${endpoint.replace(/\/$/, "")}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

  if (DRY_RUN) {
    return ok(name, `DRY_RUN url=${url}`);
  }

  const batch = Number(env.KEEPALIVE_OPENAI_BATCH || 1);
  const maxTokens = Number(env.KEEPALIVE_OPENAI_MAX_TOKENS || 24);
  const promptChars = Number(env.KEEPALIVE_OPENAI_PROMPT_CHARS || 120);

  if (DRY_RUN) {
    return ok(name, `DRY_RUN url=${url}, batch=${batch}, maxTokens=${maxTokens}, promptChars=${promptChars}`);
  }

  const promptText = `milestone3 heartbeat ${new Date().toISOString()}\n` + "x".repeat(Math.max(20, promptChars));
  let totalPrompt = 0;
  let totalCompletion = 0;

  for (let i = 0; i < batch; i++) {
    const body = {
      messages: [{ role: "user", content: `${promptText}\nrun=${i + 1}/${batch}` }],
      max_tokens: maxTokens,
      temperature: 0,
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text();
      return fail(name, `HTTP ${res.status} ${txt.slice(0, 240)}`);
    }

    const json = await res.json();
    totalPrompt += Number(json?.usage?.prompt_tokens || 0);
    totalCompletion += Number(json?.usage?.completion_tokens || 0);
  }

  return ok(name, `deployment=${deployment}, batch=${batch}, promptTokens=${totalPrompt}, completionTokens=${totalCompletion}`);
}

async function dbHeartbeatPostgresWithPg() {
  const name = "DB heartbeat (PostgreSQL via pg)";

  const connRaw = env.AZURE_POSTGRES_CONNECTION_STRING || env.DATABASE_URL;
  if (!connRaw) {
    return skip(name, "Missing AZURE_POSTGRES_CONNECTION_STRING / DATABASE_URL");
  }

  const conn = connRaw.trim();
  let connectionString = conn;

  // Handle special chars in password for URI form (common with Azure KV plaintext DSN)
  try {
    const uriMatch = connectionString.match(/^(postgres(?:ql)?:\/\/)([^:]+):([^@]+)@([^\/?]+)(\/[^?]*)?(\?.*)?$/i);
    if (uriMatch) {
      const [, proto, user, pass, host, path = "", query = ""] = uriMatch;
      connectionString = `${proto}${user}:${encodeURIComponent(pass)}@${host}${path}${query}`;
    }
  } catch {}

  const dbOps = Number(env.KEEPALIVE_DB_OPS || 1);
  const dbReadOps = Number(env.KEEPALIVE_DB_READ_OPS || 1);

  if (DRY_RUN) {
    return ok(name, `DRY_RUN using PostgreSQL connection string, writes=${dbOps}, reads=${dbReadOps}`);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 20000,
    connectionTimeoutMillis: 15000,
  });

  try {
    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS milestone_keepalive (
        id BIGSERIAL PRIMARY KEY,
        ts TIMESTAMPTZ DEFAULT now(),
        source TEXT NOT NULL
      );
    `);
    for (let i = 0; i < dbOps; i++) {
      await client.query(
        `INSERT INTO milestone_keepalive (source) VALUES ($1)`,
        [`azure-milestone3-keepalive-${i + 1}`],
      );
    }
    for (let i = 0; i < dbReadOps; i++) {
      await client.query(`SELECT count(*)::int AS c FROM milestone_keepalive`);
    }
    const rs = await client.query(
      `SELECT id, source, ts FROM milestone_keepalive ORDER BY id DESC LIMIT 1`,
    );
    const row = rs.rows?.[0];
    return ok(name, row ? `writes=${dbOps}, reads=${dbReadOps}, id=${row.id} source=${row.source}` : `writes=${dbOps}, reads=${dbReadOps} ok`);
  } catch (e) {
    return fail(name, String(e.message || e));
  } finally {
    try { await client.end(); } catch {}
  }
}

function blobConnectionString() {
  const account = env.AZURE_STORAGE_ACCOUNT;
  const key = env.AZURE_STORAGE_ACCOUNT_KEY;
  if (!account || !key) return null;
  return `DefaultEndpointsProtocol=https;AccountName=${account};AccountKey=${key};EndpointSuffix=core.windows.net`;
}

async function blobHeartbeat() {
  const name = "Blob upload/delete heartbeat";
  const storageAccount = env.AZURE_STORAGE_ACCOUNT;
  const container = env.AZURE_STORAGE_CONTAINER || "db-backups";
  const blobOps = Number(env.KEEPALIVE_BLOB_OPS || 1);

  if (!storageAccount) {
    return skip(name, "Missing AZURE_STORAGE_ACCOUNT");
  }

  const conn = blobConnectionString();
  if (!conn) {
    return skip(name, "Missing AZURE_STORAGE_ACCOUNT_KEY");
  }

  const blobName = `milestone3-heartbeat-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
  const content = `heartbeat ${new Date().toISOString()}\n`;

  if (DRY_RUN) {
    return ok(name, `DRY_RUN account=${storageAccount} container=${container} blobOps=${blobOps} blob=${blobName}`);
  }

  try {
    const service = BlobServiceClient.fromConnectionString(conn);
    const c = service.getContainerClient(container);
    await c.createIfNotExists();

    for (let i = 0; i < blobOps; i++) {
      const bname = `${blobName}-${i + 1}`;
      const tmpFile = path.join(os.tmpdir(), bname);
      fs.writeFileSync(tmpFile, `${content}op=${i + 1}\n`, "utf8");
      try {
        const b = c.getBlockBlobClient(bname);
        await b.uploadFile(tmpFile);
        await b.deleteIfExists();
      } finally {
        try { fs.unlinkSync(tmpFile); } catch {}
      }
    }

    return ok(name, `${storageAccount}/${container} upload+delete x${blobOps} ok`);
  } catch (e) {
    return fail(name, String(e.message || e));
  }
}

async function pingGateway() {
  const name = "Gateway heartbeat (Container Apps)";
  const gatewayUrl = env.KEEPALIVE_GATEWAY_URL || env.GATEWAY_HEALTH_URL;
  const ops = Number(env.KEEPALIVE_GATEWAY_PING_OPS || 1);

  if (!gatewayUrl) {
    return skip(name, "Missing KEEPALIVE_GATEWAY_URL / GATEWAY_HEALTH_URL");
  }

  if (DRY_RUN) {
    return ok(name, `DRY_RUN url=${gatewayUrl}, ops=${ops}`);
  }

  let success = 0;
  const statuses = [];
  for (let i = 0; i < Math.max(1, ops); i++) {
    try {
      const res = await fetch(gatewayUrl, {
        method: "GET",
        headers: { "x-ark-heartbeat": "milestone3" },
      });
      statuses.push(res.status);
      if (res.status < 500) success += 1;
    } catch {
      statuses.push("ERR");
    }
  }

  if (success === 0) {
    return fail(name, `all pings failed, statuses=${statuses.slice(0, 10).join(",")}`);
  }
  return ok(name, `url=${gatewayUrl}, ops=${ops}, success=${success}, statuses=${statuses.slice(0, 10).join(",")}`);
}

async function sendLogAnalyticsTrace() {
  const name = "Monitoring trace heartbeat (Log Analytics)";
  const workspaceId = env.LOG_ANALYTICS_WORKSPACE_ID;
  const sharedKey = env.LOG_ANALYTICS_SHARED_KEY;
  const logType = env.LOG_ANALYTICS_LOG_TYPE || "Milestone3Heartbeat";
  const logOps = Number(env.KEEPALIVE_LOG_OPS || 1);

  if (!workspaceId || !sharedKey) {
    return skip(name, "Missing LOG_ANALYTICS_WORKSPACE_ID / LOG_ANALYTICS_SHARED_KEY");
  }

  if (DRY_RUN) {
    return ok(name, `DRY_RUN workspace=${workspaceId} logType=${logType}`);
  }

  const body = JSON.stringify(
    Array.from({ length: Math.max(1, logOps) }).map((_, i) => ({
      TimeGenerated: new Date().toISOString(),
      Source: "azure-milestone3-keepalive",
      Message: `keepalive heartbeat #${i + 1}`,
      Environment: env.KEEPALIVE_ENV || "prod",
      BatchSize: logOps,
    }))
  );

  const method = "POST";
  const contentType = "application/json";
  const resource = "/api/logs";
  const xmsDate = new Date().toUTCString();
  const contentLength = Buffer.byteLength(body, "utf8");
  const stringToSign = `${method}\n${contentLength}\n${contentType}\nx-ms-date:${xmsDate}\n${resource}`;

  const decodedKey = Buffer.from(sharedKey, "base64");
  const signature = crypto
    .createHmac("sha256", decodedKey)
    .update(stringToSign, "utf8")
    .digest("base64");

  const auth = `SharedKey ${workspaceId}:${signature}`;
  const url = `https://${workspaceId}.ods.opinsights.azure.com${resource}?api-version=2016-04-01`;

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": contentType,
      Authorization: auth,
      "Log-Type": logType,
      "x-ms-date": xmsDate,
      "time-generated-field": "TimeGenerated",
    },
    body,
  });

  if (!res.ok) {
    const txt = await res.text();
    return fail(name, `HTTP ${res.status} ${txt.slice(0, 200)}`);
  }

  return ok(name, `logType=${logType} accepted, ops=${logOps}`);
}

function getSubscriptionAndRg() {
  return {
    subscriptionId: env.AZURE_SUBSCRIPTION_ID || "unknown",
    resourceGroup: env.AZURE_RESOURCE_GROUP || "rg-arkagentic-prod",
    hasAz: !!env.AZURE_SUBSCRIPTION_ID,
  };
}

function printMarkdownReport(results) {
  const lines = [];
  lines.push("# Azure Milestone3 Keepalive Report");
  lines.push("");
  lines.push(`- Time: ${new Date().toISOString()}`);
  lines.push(`- Mode: ${DRY_RUN ? "DRY_RUN" : "LIVE"}`);
  lines.push("");
  lines.push("| Task | Status | Details |");
  lines.push("|---|---|---|");
  for (const r of results) {
    lines.push(`| ${r.name} | ${r.status} | ${String(r.details || "").replace(/\|/g, "\\|")} |`);
  }
  console.log(lines.join("\n"));
}

async function main() {
  const { subscriptionId, resourceGroup } = getSubscriptionAndRg();
  if (VERBOSE) {
    console.error(`subscription=${subscriptionId} rg=${resourceGroup}`);
  }

  const results = [];
  results.push(await pingAzureOpenAI());
  results.push(await dbHeartbeatPostgresWithPg());
  results.push(await blobHeartbeat());
  results.push(await pingGateway());
  results.push(await sendLogAnalyticsTrace());

  const cadencePerDay = Number(env.KEEPALIVE_RUNS_PER_DAY || 24);
  const target = Number(env.KEEPALIVE_TARGET_DAILY_USD || 1.5);
  results.push(ok("Budget guidance", `target=$${target}/service/day, cadence=${cadencePerDay}/day (verify with check-azure-spend script)`));

  printMarkdownReport(results);

  const failed = results.filter((r) => r.status === "FAIL").length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
