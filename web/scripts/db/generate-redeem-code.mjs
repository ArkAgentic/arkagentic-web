import { createHash, randomBytes, randomUUID } from "crypto";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

function parseArgs(argv) {
  const out = { amount: null, count: 1 };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--amount") out.amount = Number(argv[i + 1]);
    if (token === "--count") out.count = Number(argv[i + 1]);
  }
  return out;
}

function normalizeCode(raw) {
  return raw.trim().toUpperCase();
}

function hashRedeemCode(code) {
  return createHash("sha256").update(`redeem:${normalizeCode(code)}`).digest("hex");
}

function randomCode() {
  const bytes = randomBytes(8).toString("hex").toUpperCase();
  return `ARK-${bytes.slice(0, 4)}-${bytes.slice(4, 8)}-${bytes.slice(8, 12)}-${bytes.slice(12, 16)}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const amount = Number(args.amount);
  const count = Math.max(1, Math.floor(Number(args.count || 1)));

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("--amount must be a positive number, e.g. --amount 50");
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query("begin");

    const generated = [];
    for (let i = 0; i < count; i += 1) {
      let created = false;
      for (let attempt = 0; attempt < 8 && !created; attempt += 1) {
        const code = randomCode();
        const codeHash = hashRedeemCode(code);

        const res = await client.query(
          `insert into redeem_codes(id, code_hash, amount_usd, status, created_at)
           values ($1,$2,$3,'active',now())
           on conflict (code_hash) do nothing
           returning id`,
          [randomUUID(), codeHash, amount],
        );

        if (res.rowCount > 0) {
          generated.push({ code, amountUsd: Number(amount.toFixed(2)) });
          created = true;
        }
      }

      if (!created) {
        throw new Error("Failed to generate unique redeem code after multiple attempts");
      }
    }

    await client.query("commit");

    console.log(JSON.stringify({ ok: true, count: generated.length, amountUsd: Number(amount.toFixed(2)), codes: generated }, null, 2));
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
