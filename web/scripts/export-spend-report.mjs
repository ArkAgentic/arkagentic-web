#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ExcelJS from "exceljs";
import { BlobServiceClient } from "@azure/storage-blob";
import dotenv from "dotenv";

const PROJECT_DIR = "/Users/charleszhang/arkagentic";
const WEB_DIR = path.join(PROJECT_DIR, "web");
const REPORT_DIR = "/Users/charleszhang/arkagentic/Azure workloads cost track";
const REPORT_FILE = path.join(REPORT_DIR, "spend-report.xlsx");
const REPORT_MD = path.join(REPORT_DIR, "spend-report.md");
const SHEET_NAME = "Azure Spend";

const WORKLOAD_RESOURCE_TYPE = {
  "Azure OpenAI / AI Foundry": "Microsoft.CognitiveServices/accounts",
  "MySQL DB": "microsoft.dbformysql/flexibleservers",
  "Virtual Machine": "microsoft.compute/virtualmachines",
  "Redis Cache": "microsoft.cache/redisenterprise",
  "PostgreSQL DB": "microsoft.dbforpostgresql/flexibleservers",
};

function loadEnv() {
  const envPath = path.join(WEB_DIR, ".env");
  const envLocalPath = path.join(WEB_DIR, ".env.local");
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: false });
  if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath, override: true });
}

function runCapture(cmd, args, cwd = WEB_DIR) {
  const res = spawnSync(cmd, args, { encoding: "utf-8", cwd, timeout: 300000 });
  return {
    code: res.status ?? 1,
    stdout: (res.stdout || "").trim(),
    stderr: (res.stderr || "").trim(),
  };
}

function ensureSpendMarkdown() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const r = runCapture("node", ["scripts/check-azure-spend.mjs"]);
  if (r.stdout) {
    fs.writeFileSync(REPORT_MD, r.stdout + "\n", "utf8");
    return;
  }
  if (fs.existsSync(REPORT_MD)) return;

  // Fallback when CostManagement is throttled/unavailable in job runtime
  const fallback = [
    "# Azure Milestone3 Spend Health",
    "",
    `- Generated: ${new Date().toISOString()}`,
    "- Lookback days: 3",
    "- Daily threshold: $1.50 per workload",
    "",
    "## Workload Status",
    "",
    "| Workload | Resource Type | 24h Cost (USD) | Lookback Total (USD) | Status | Notes |",
    "|---|---|---:|---:|---|---|",
    "| Azure OpenAI / AI Foundry | Microsoft.CognitiveServices/accounts | 0.00 | 0.00 | WARN | cost query unavailable in this run |",
    "| MySQL DB | microsoft.dbformysql/flexibleservers | 0.00 | 0.00 | WARN | cost query unavailable in this run |",
    "| Virtual Machine | microsoft.compute/virtualmachines | 0.00 | 0.00 | WARN | cost query unavailable in this run |",
    "| Redis Cache | microsoft.cache/redisenterprise | 0.00 | 0.00 | WARN | cost query unavailable in this run |",
    "| PostgreSQL DB | microsoft.dbforpostgresql/flexibleservers | 0.00 | 0.00 | WARN | cost query unavailable in this run |",
  ].join("\n");
  fs.writeFileSync(REPORT_MD, fallback + "\n", "utf8");
}

function parseSpendMarkdown(md) {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().startsWith("| Workload | Resource Type |"));
  if (start === -1) return [];
  const rows = [];
  for (let i = start + 2; i < lines.length; i++) {
    const ln = lines[i].trim();
    if (!ln.startsWith("|")) break;
    const cols = ln.split("|").slice(1, -1).map((s) => s.trim());
    if (cols.length < 6) continue;
    const workload = cols[0];
    if (!Object.prototype.hasOwnProperty.call(WORKLOAD_RESOURCE_TYPE, workload)) continue;
    rows.push({
      workload,
      resourceType: stableResourceType(workload),
      dailyCostUsd: safeNumber(cols[2], 0),
      status: cols[4],
      notes: cols[5],
    });
  }
  return rows;
}

function resourceNameFor(workload) {
  const w = String(workload || "").toLowerCase();
  if (w.includes("openai") || w.includes("foundry")) return "arkagentic";
  if (w.includes("mysql")) return "arkag-mysql-private";
  if (w.includes("virtual machine") || w.includes("vm")) return "arkag-vm-gateway";
  if (w.includes("redis")) return "arkag-redis";
  if (w.includes("postgres")) return "arkag-pgvector";
  return "unknown";
}

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseGlobalStreak(md) {
  const m = String(md || "").match(/Calculated Streak:\s*(\d+)/i);
  return m ? safeNumber(m[1], 0) : 0;
}

function normalizeDate(v) {
  return String(v || "").slice(0, 10);
}

function stableResourceType(workload) {
  return WORKLOAD_RESOURCE_TYPE[workload] || "unknown";
}

async function upsertWorkbook(records) {
  const headers = ["日期", "Azure 资源名称", "资源类型 (Resource Type)", "当日消费 (USD)", "连续达标天数", "Workload", "状态", "备注"];

  const existing = new Map();
  let beforeRows = 1;

  if (fs.existsSync(REPORT_FILE)) {
    const oldWb = new ExcelJS.Workbook();
    await oldWb.xlsx.readFile(REPORT_FILE);
    const oldWs = oldWb.getWorksheet(SHEET_NAME);
    if (oldWs) {
      beforeRows = oldWs.rowCount;
      for (let r = 2; r <= oldWs.rowCount; r++) {
        const date = normalizeDate(oldWs.getCell(r, 1).value);
        const workload = String(oldWs.getCell(r, 6).value || "").trim();
        if (!date || !workload) continue;
        if (date === "日期" || workload === "Workload") continue;
        if (!Object.prototype.hasOwnProperty.call(WORKLOAD_RESOURCE_TYPE, workload)) continue;
        const key = `${date}|${workload}`;
        existing.set(key, {
          date,
          resourceName: String(oldWs.getCell(r, 2).value || ""),
          resourceType: stableResourceType(workload),
          dailyCostUsd: safeNumber(oldWs.getCell(r, 4).value, 0),
          streakDays: safeNumber(oldWs.getCell(r, 5).value, 0),
          workload,
          status: String(oldWs.getCell(r, 7).value || ""),
          notes: String(oldWs.getCell(r, 8).value || ""),
        });
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  for (const rec of records) {
    const key = `${today}|${rec.workload}`;
    existing.set(key, {
      date: today,
      resourceName: resourceNameFor(rec.workload),
      resourceType: stableResourceType(rec.workload),
      dailyCostUsd: safeNumber(rec.dailyCostUsd, 0),
      streakDays: safeNumber(rec.streakDays, 0),
      workload: rec.workload,
      status: rec.status,
      notes: rec.notes,
    });
  }

  const ordered = [...existing.values()].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.workload.localeCompare(b.workload);
  });

  // Rebuild workbook from scratch to guarantee de-dup and cleanup
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(SHEET_NAME);
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 28;
  ws.getColumn(3).width = 44;
  ws.getColumn(4).width = 18;
  ws.getColumn(5).width = 16;
  ws.getColumn(6).width = 34;
  ws.getColumn(7).width = 10;
  ws.getColumn(8).width = 42;

  for (const row of ordered) {
    ws.addRow([
      row.date,
      row.resourceName,
      row.resourceType,
      row.dailyCostUsd,
      row.streakDays,
      row.workload,
      row.status,
      row.notes,
    ]);
  }

  for (let i = 2; i <= ws.rowCount; i++) ws.getCell(`D${i}`).numFmt = "$#,##0.0000";

  await wb.xlsx.writeFile(REPORT_FILE);
  const afterRows = ws.rowCount;
  const todayRows = ordered.filter((r) => r.date === today).length;
  return { beforeRows, afterRows, todayRows, uniqueRows: ordered.length, upserted: records.length };
}

async function uploadToBlob() {
  const account = process.env.AZURE_STORAGE_ACCOUNT;
  const key = process.env.AZURE_STORAGE_ACCOUNT_KEY;
  const container = process.env.REPORTS_BLOB_CONTAINER || "milestone3-reports";
  if (!account || !key) return { skipped: true, reason: "missing AZURE_STORAGE_ACCOUNT/AZURE_STORAGE_ACCOUNT_KEY" };

  const conn = `DefaultEndpointsProtocol=https;AccountName=${account};AccountKey=${key};EndpointSuffix=core.windows.net`;
  const svc = BlobServiceClient.fromConnectionString(conn);
  const c = svc.getContainerClient(container);
  await c.createIfNotExists();

  const day = new Date().toISOString().slice(0, 10);
  const latestBlob = `spend/spend-report.xlsx`;
  const datedBlob = `spend/${day}/spend-report.xlsx`;

  const latest = c.getBlockBlobClient(latestBlob);
  const dated = c.getBlockBlobClient(datedBlob);

  const headers = { blobContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  await latest.uploadFile(REPORT_FILE, { blobHTTPHeaders: headers });
  await dated.uploadFile(REPORT_FILE, { blobHTTPHeaders: headers });

  return { skipped: false, latestUrl: latest.url, datedUrl: dated.url };
}

async function main() {
  loadEnv();
  ensureSpendMarkdown();

  const md = fs.readFileSync(REPORT_MD, "utf8");
  const records = parseSpendMarkdown(md);
  const streak = parseGlobalStreak(md);
  if (records.length !== 5) throw new Error(`expected 5 workload rows, got ${records.length}`);

  const recordsWithStreak = records.map((r) => ({ ...r, streakDays: streak }));

  const upsertResult = await upsertWorkbook(recordsWithStreak);
  const uploadResult = await uploadToBlob();

  console.log(`report_file=${REPORT_FILE}`);
  console.log(`upsert_before_rows=${upsertResult.beforeRows}`);
  console.log(`upsert_input_rows=${upsertResult.upserted}`);
  console.log(`upsert_unique_rows=${upsertResult.uniqueRows}`);
  console.log(`upsert_after_rows=${upsertResult.afterRows}`);
  console.log(`upsert_today_rows=${upsertResult.todayRows}`);

  if (uploadResult.skipped) {
    console.log(`report_upload=SKIP (${uploadResult.reason})`);
  } else {
    console.log(`report_blob_latest=${uploadResult.latestUrl}`);
    console.log(`report_blob_dated=${uploadResult.datedUrl}`);
  }
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});
