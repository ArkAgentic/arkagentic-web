import { Pool } from "pg";
import { getActiveModelIdSet } from "./upstream-store";

export type RuntimeModelPricing = {
  modelId: string;
  inputPricePer1k: number;
  outputPricePer1k: number;
  source: "db";
};

let pricingPool: Pool | null | undefined;
let pricingTableReady = false;

async function getPool(): Promise<Pool | null> {
  if (pricingPool !== undefined) return pricingPool;
  if (!process.env.DATABASE_URL) {
    pricingPool = null;
    return pricingPool;
  }
  pricingPool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pricingPool;
}

export async function ensurePricingTable(pool: Pool): Promise<void> {
  if (pricingTableReady) return;
  await pool.query(`
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
  pricingTableReady = true;
}

export async function getRuntimePricing(modelId: string): Promise<RuntimeModelPricing | undefined> {
  const pool = await getPool();
  if (!pool) return undefined;

  await ensurePricingTable(pool);
  const res = await pool.query(
    `select model_id, input_price_per_1k, output_price_per_1k
     from model_pricing
     where model_id=$1 and enabled=true
     limit 1`,
    [modelId],
  );

  const row = res.rows[0];
  if (!row) return undefined;

  return {
    modelId: String(row.model_id),
    inputPricePer1k: Number(row.input_price_per_1k),
    outputPricePer1k: Number(row.output_price_per_1k),
    source: "db",
  };
}

export async function getRuntimePricingMap(modelIds: string[]): Promise<Map<string, RuntimeModelPricing>> {
  const out = new Map<string, RuntimeModelPricing>();
  if (modelIds.length === 0) return out;

  const pool = await getPool();
  if (!pool) return out;

  await ensurePricingTable(pool);
  const res = await pool.query(
    `select model_id, input_price_per_1k, output_price_per_1k
     from model_pricing
     where enabled=true and model_id = any($1::text[])`,
    [modelIds],
  );

  for (const row of res.rows) {
    const modelId = String(row.model_id);
    out.set(modelId, {
      modelId,
      inputPricePer1k: Number(row.input_price_per_1k),
      outputPricePer1k: Number(row.output_price_per_1k),
      source: "db",
    });
  }

  return out;
}

export async function getRuntimePricingCatalog(): Promise<RuntimeModelPricing[]> {
  const activeIds = await getActiveModelIdSet();
  const allIds = Array.from(activeIds).sort((a, b) => a.localeCompare(b));
  const map = await getRuntimePricingMap(allIds);
  return allIds
    .map((id) => map.get(id))
    .filter((item): item is RuntimeModelPricing => Boolean(item));
}
