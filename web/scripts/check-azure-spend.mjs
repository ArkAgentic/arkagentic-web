#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { Client as PgClient } from "pg";
import Redis from "ioredis";

const env = process.env;
const MIN_SAFE = Number(env.MILESTONE3_MIN_DAILY_USD || 1.5);
const STREAK_FLOOR = Number(env.MILESTONE3_STREAK_FLOOR_USD || 1.0);
const LOOKBACK_DAYS = Number(env.MILESTONE3_LOOKBACK_DAYS || 7);

const WORKLOADS = [
  {
    workload: "Azure OpenAI / AI Foundry",
    type: "microsoft.cognitiveservices/accounts",
    resourceId:
      "/subscriptions/59d44bfe-8130-434a-be8b-667739324fa7/resourcegroups/ai-resources-rg/providers/microsoft.cognitiveservices/accounts/arkagentic",
    pulse: pulseAI,
  },
  {
    workload: "MySQL DB",
    type: "microsoft.dbformysql/flexibleservers",
    resourceId:
      "/subscriptions/59d44bfe-8130-434a-be8b-667739324fa7/resourcegroups/rg-arkagentic-prod/providers/microsoft.dbformysql/flexibleservers/arkag-mysql-private",
    pulse: pulseDisabledByPolicy,
    liveCheck: liveCheckMySQL,
  },
  {
    workload: "Virtual Machine",
    type: "microsoft.compute/virtualmachines",
    resourceId:
      "/subscriptions/59d44bfe-8130-434a-be8b-667739324fa7/resourcegroups/rg-arkagentic-prod/providers/microsoft.compute/virtualmachines/arkag-vm-gateway",
    pulse: pulseDisabledByPolicy,
    liveCheck: liveCheckVM,
  },
  {
    workload: "Redis Cache",
    type: "microsoft.cache/redisenterprise",
    resourceId:
      "/subscriptions/59d44bfe-8130-434a-be8b-667739324fa7/resourcegroups/rg-arkagentic-prod/providers/microsoft.cache/redisenterprise/arkag-redis-b1-eastasia",
    pulse: pulseDisabledByPolicy,
    liveCheck: liveCheckRedis,
  },
  {
    workload: "PostgreSQL DB",
    type: "microsoft.dbforpostgresql/flexibleservers",
    resourceId:
      "/subscriptions/59d44bfe-8130-434a-be8b-667739324fa7/resourcegroups/rg-arkagentic-prod/providers/microsoft.dbforpostgresql/flexibleservers/arkag-pgvector",
    pulse: pulseDisabledByPolicy,
    liveCheck: liveCheckPostgres,
  },
];

function run(cmd, argv, timeoutMs = 240000) {
  const res = spawnSync(cmd, argv, { encoding: "utf-8", timeout: timeoutMs });
  if (res.status !== 0) {
    const err = (res.stderr || res.stdout || "").trim();
    throw new Error(`${cmd} ${argv.join(" ")} failed: ${err}`);
  }
  return (res.stdout || "").trim();
}

function azJson(argv) {
  const out = run("az", [...argv, "-o", "json"]);
  return out ? JSON.parse(out) : null;
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function queryCostWithRetry(subscriptionId, body, attempts = 10) {
  const uri = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/query?api-version=2023-03-01`;
  let lastErr = "";
  const scheduleSec = [5, 10, 20, 40, 60, 60, 60, 60, 60, 60];
  for (let i = 1; i <= attempts; i++) {
    const res = spawnSync(
      "az",
      ["rest", "--method", "post", "--uri", uri, "--body", JSON.stringify(body), "-o", "json"],
      { encoding: "utf-8", timeout: 240000 }
    );
    if (res.status === 0) {
      const obj = JSON.parse((res.stdout || "{}").trim() || "{}");
      return obj?.properties || { columns: [], rows: [] };
    }
    lastErr = (res.stderr || res.stdout || "").trim();
    if (!/429|Too many requests/i.test(lastErr) || i === attempts) break;
    const waitSec = scheduleSec[Math.min(i - 1, scheduleSec.length - 1)];
    console.error(`Cost API throttled (429), retry ${i}/${attempts} in ${waitSec}s`);
    sleepMs(waitSec * 1000);
  }
  throw new Error(`CostManagement query failed: ${lastErr}`);
}

function rowsToObjects(props) {
  const cols = (props.columns || []).map((c) => c.name);
  return (props.rows || []).map((r) => {
    const o = {};
    cols.forEach((c, i) => (o[c] = r[i]));
    return o;
  });
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

async function pulseAI() {
  const endpoint = env.AZURE_OPENAI_ENDPOINT;
  const apiKey = env.AZURE_OPENAI_API_KEY;
  const deployment = env.AZURE_OPENAI_DEPLOYMENT_GPT4O || "gpt-4o";
  const apiVersion = env.AZURE_OPENAI_API_VERSION || "2024-05-01-preview";
  if (!endpoint || !apiKey) return { status: "SKIP", detail: "missing AZURE_OPENAI_ENDPOINT/API_KEY" };

  const url = `${endpoint.replace(/\/$/, "")}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
  const batch = Number(env.DYNAMIC_TOPUP_AI_BATCH || 2);
  const maxTokens = Number(env.DYNAMIC_TOPUP_AI_MAX_TOKENS || 256);
  let prompt = 0;
  let completion = 0;
  for (let i = 0; i < batch; i++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({ messages: [{ role: "user", content: `topup pulse ${Date.now()} #${i}` }], max_tokens: maxTokens, temperature: 0 }),
    });
    if (!res.ok) return { status: "FAIL", detail: `HTTP ${res.status}` };
    const j = await res.json();
    prompt += Number(j?.usage?.prompt_tokens || 0);
    completion += Number(j?.usage?.completion_tokens || 0);
  }
  return { status: "PULSED", detail: `ai batch=${batch}, prompt=${prompt}, completion=${completion}` };
}

async function pulseDisabledByPolicy() {
  return { status: "SKIP", detail: "pulse disabled by policy (infrastructure base-price workload)" };
}

async function liveCheckPostgres() {
  const conn = env.AZURE_POSTGRES_CONNECTION_STRING || env.DATABASE_URL;
  if (!conn) return { status: "SKIP", detail: "missing AZURE_POSTGRES_CONNECTION_STRING/DATABASE_URL" };
  const client = new PgClient({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return { status: "LIVE", detail: "postgres connectivity OK" };
  } catch (e) {
    return { status: "FAIL", detail: String(e.message || e) };
  } finally {
    try { await client.end(); } catch {}
  }
}

async function liveCheckRedis() {
  const host = env.REDIS_HOST || "arkag-redis-b1-eastasia.eastasia.redis.azure.net";
  const port = Number(env.REDIS_PORT || 10000);
  const password = env.REDIS_KEY || env.AZURE_REDIS_KEY;
  if (!password) return { status: "SKIP", detail: "missing REDIS_KEY/AZURE_REDIS_KEY" };
  const client = new Redis({ host, port, password, tls: {}, lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await client.connect();
    await client.ping();
    return { status: "LIVE", detail: "redis connectivity OK" };
  } catch (e) {
    return { status: "FAIL", detail: String(e.message || e) };
  } finally {
    try { client.disconnect(); } catch {}
  }
}

async function liveCheckVM() {
  try {
    const out = azJson(["vm", "show", "-g", "rg-arkagentic-prod", "-n", "arkag-vm-gateway", "--query", "{powerState:powerState,provisioningState:provisioningState}"]);
    const ps = String(out?.powerState || "unknown");
    const prov = String(out?.provisioningState || "unknown");
    const ok = /running/i.test(ps) || /succeeded/i.test(prov);
    return { status: ok ? "LIVE" : "WARN", detail: `vm powerState=${ps} provisioningState=${prov}` };
  } catch (e) {
    return { status: "FAIL", detail: String(e.message || e) };
  }
}

async function liveCheckMySQL() {
  try {
    const out = azJson(["mysql", "flexible-server", "show", "-g", "rg-arkagentic-prod", "-n", "arkag-mysql-private", "--query", "{state:state,sku:sku.name,version:version}"]);
    const state = String(out?.state || "unknown");
    const ok = /ready|running|up/i.test(state);
    return { status: ok ? "LIVE" : "WARN", detail: `mysql state=${state} sku=${out?.sku || "unknown"}` };
  } catch (e) {
    return { status: "FAIL", detail: String(e.message || e) };
  }
}

function latestSettledDay(allRows) {
  const days = new Set();
  for (const r of allRows) {
    const d = String(r.UsageDate || "").slice(0, 8);
    if (d) days.add(d);
  }
  return [...days].sort().at(-1) || "";
}

function buildDailyCostMap(rows) {
  const m = new Map();
  for (const r of rows) {
    const rid = String(r.ResourceId || "").toLowerCase();
    const d = String(r.UsageDate || "").slice(0, 8);
    if (!rid || !d) continue;
    const k = `${rid}|${d}`;
    m.set(k, (m.get(k) || 0) + safeNum(r.Cost));
  }
  return m;
}

function calcStreak(days, dailyMap) {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    const ok = WORKLOADS.every((w) => {
      const k = `${w.resourceId.toLowerCase()}|${d}`;
      return (dailyMap.get(k) || 0) >= STREAK_FLOOR;
    });
    if (!ok) break;
    streak += 1;
  }
  return streak;
}

function printDiagnostic(allRows) {
  const agg = new Map();
  for (const r of allRows) {
    const rid = String(r.ResourceId || "").toLowerCase();
    const rt = String(r.ResourceType || "unknown");
    const k = `${rid}|${rt}`;
    const cur = agg.get(k) || { ResourceId: rid, ResourceType: rt, Cost: 0 };
    cur.Cost += safeNum(r.Cost);
    agg.set(k, cur);
  }
  const ranked = [...agg.values()].filter((x) => x.Cost > 0).sort((a, b) => b.Cost - a.Cost);
  console.log("## Diagnostic: Azure official billed items (7d)");
  console.log("| Resource Name | Resource Type | Actual Cost (USD) | Resource ID |");
  console.log("|---|---|---:|---|");
  for (const r of ranked) {
    const rid = r.ResourceId;
    const name = rid ? rid.split("/").pop() : "";
    console.log(`| ${name} | ${r.ResourceType} | ${r.Cost.toFixed(4)} | ${rid.replace(/\|/g, "\\|")} |`);
  }
  console.log("");
}

async function main() {
  const account = azJson(["account", "show"]);
  const subscriptionId = account?.id;
  if (!subscriptionId) throw new Error("No active Azure subscription");

  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - LOOKBACK_DAYS);

  const targetResourceIds = WORKLOADS.map((w) => w.resourceId.toLowerCase());

  const body = {
    type: "Usage",
    timeframe: "Custom",
    timePeriod: { from: ymd(start), to: ymd(now) },
    dataset: {
      granularity: "Daily",
      aggregation: { totalCost: { name: "Cost", function: "Sum" } },
      grouping: [
        { type: "Dimension", name: "ResourceId" },
        { type: "Dimension", name: "ResourceType" },
      ],
      filter: {
        dimensions: {
          name: "ResourceId",
          operator: "In",
          values: targetResourceIds,
        },
      },
    },
  };

  const props = queryCostWithRetry(subscriptionId, body, 10);
  const allRows = rowsToObjects(props).map((r) => ({
    ...r,
    Cost: safeNum(r.Cost),
    UsageDate: String(r.UsageDate || "").slice(0, 8),
    ResourceId: String(r.ResourceId || "").toLowerCase(),
  }));

  printDiagnostic(allRows);

  const day = latestSettledDay(allRows);
  const dailyMap = buildDailyCostMap(allRows);
  const allDays = [...new Set(allRows.map((r) => r.UsageDate).filter(Boolean))].sort();
  const streak = calcStreak(allDays, dailyMap);

  const rows = [];
  const pulseRows = [];

  for (const w of WORKLOADS) {
    const rid = w.resourceId.toLowerCase();
    const dayCost = dailyMap.get(`${rid}|${day}`) || 0;

    let action = { status: "NONE", detail: "above threshold, no top-up needed" };
    if (w.workload === "Azure OpenAI / AI Foundry" && dayCost < MIN_SAFE) {
      try {
        action = await w.pulse();
      } catch (e) {
        action = { status: "FAIL", detail: String(e.message || e) };
      }
    } else if (typeof w.liveCheck === "function") {
      try {
        action = await w.liveCheck();
      } catch (e) {
        action = { status: "FAIL", detail: String(e.message || e) };
      }
    }

    pulseRows.push({ workload: w.workload, pulseStatus: action.status, pulseDetail: action.detail });

    rows.push({
      workload: w.workload,
      type: w.type,
      last24h: dayCost,
      total: allDays.reduce((acc, d) => acc + (dailyMap.get(`${rid}|${d}`) || 0), 0),
      status: dayCost >= MIN_SAFE ? "PASS" : "FAIL",
      notes: `latestDay=${day} latest=$${dayCost.toFixed(2)} min=$${MIN_SAFE.toFixed(2)} action=${action.status}`,
    });
  }

  console.log("# Azure Milestone3 Spend Health (check-and-pulse)");
  console.log("");
  console.log(`- Generated: ${new Date().toISOString()}`);
  console.log(`- Subscription: ${subscriptionId}`);
  console.log(`- Latest settled day: ${day || "unknown"}`);
  console.log(`- Dynamic top-up threshold: $${MIN_SAFE.toFixed(2)}`);
  console.log(`- Streak floor: $${STREAK_FLOOR.toFixed(2)} each workload`);
  console.log(`- Calculated Streak: ${streak}`);
  console.log("");
  console.log("## Workload Status");
  console.log("");
  console.log("| Workload | Resource Type | 24h Cost (USD) | Lookback Total (USD) | Status | Notes |");
  console.log("|---|---|---:|---:|---|---|");
  for (const r of rows) {
    console.log(`| ${r.workload} | ${r.type} | ${r.last24h.toFixed(2)} | ${r.total.toFixed(2)} | ${r.status} | ${r.notes.replace(/\|/g, "\\|")} |`);
  }
  console.log("");
  console.log("## Dynamic Top-up Actions");
  console.log("");
  console.log("| Workload | Pulse Status | Detail |");
  console.log("|---|---|---|");
  for (const p of pulseRows) {
    console.log(`| ${p.workload} | ${p.pulseStatus} | ${String(p.pulseDetail || "").replace(/\|/g, "\\|")} |`);
  }

  const hasFail = rows.some((r) => r.status === "FAIL");
  process.exit(hasFail ? 2 : 0);
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});