#!/usr/bin/env node
import fs from "fs";
import path from "path";
import pg from "pg";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function pickEnv(...keys) {
  for (const key of keys) {
    const v = process.env[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

async function ensurePricingTable(client) {
  await client.query(`
    create table if not exists model_pricing (
      model_id varchar(160) primary key,
      input_price_per_1k decimal(18,9) not null,
      output_price_per_1k decimal(18,9) not null,
      enabled boolean not null default true,
      source varchar(32) not null default 'tracker',
      updated_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    );
    create index if not exists idx_model_pricing_enabled on model_pricing(enabled);
  `);
}

async function main() {
  const payloadPath = process.argv[2];
  const modeArg = process.argv[3] || "--dry-run";
  const dryRun = modeArg === "--dry-run";

  if (!payloadPath) {
    throw new Error("payload path is required");
  }

  const raw = fs.readFileSync(path.resolve(payloadPath), "utf8");
  const payload = JSON.parse(raw);
  const updates = Array.isArray(payload?.updates) ? payload.updates : [];

  const DATABASE_URL = pickEnv("DATABASE_URL");
  if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  const result = {
    ok: true,
    dryRun,
    candidateRows: updates.length,
    upsertedRows: 0,
    modelIds: updates.map((u) => String(u.ark_model_name || "")).filter(Boolean),
  };

  try {
    await client.query("begin");
    await ensurePricingTable(client);

    if (!dryRun) {
      for (const u of updates) {
        const modelId = String(u.ark_model_name || "").trim();
        if (!modelId) continue;

        const inPer1k = Number(u.input_price_per_1k ?? NaN);
        const outPer1k = Number(u.output_price_per_1k ?? NaN);
        if (!Number.isFinite(inPer1k) || !Number.isFinite(outPer1k)) continue;

        await client.query(
          `insert into model_pricing(model_id, input_price_per_1k, output_price_per_1k, enabled, source, updated_at)
           values($1, $2, $3, true, 'tracker', now())
           on conflict (model_id) do update set
             input_price_per_1k=excluded.input_price_per_1k,
             output_price_per_1k=excluded.output_price_per_1k,
             enabled=true,
             source='tracker',
             updated_at=now()`,
          [modelId, inPer1k, outPer1k],
        );
        result.upsertedRows += 1;
      }
    }

    await client.query("commit");
    process.stdout.write(JSON.stringify(result));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  process.stdout.write(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
});
