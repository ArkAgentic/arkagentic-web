import crypto from "crypto";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const email = process.env.LOADTEST_USER_EMAIL || "loadtest@arkagentic.com";
const tier = process.env.LOADTEST_USER_TIER || "tier_1";
const key = process.env.LOADTEST_API_KEY || "sk-ark-loadtest-tier1";

const hash = crypto.createHash("sha256").update(key).digest("hex");
const keyPrefix = `${key.slice(0, 11)}...`;
const userId = `usr_${Buffer.from(email).toString("hex").slice(0, 16)}`;
const keyId = `key_${crypto.createHash("md5").update(key).digest("hex").slice(0, 12)}`;

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    await client.query("begin");

    await client.query(
      `insert into users(id,email,name,role,status,balance_usd,total_deposited_usd,pricing_tier)
       values ($1,lower($2),$3,'user','active',10000,10000,$4)
       on conflict (id) do update set pricing_tier=excluded.pricing_tier, balance_usd=10000, total_deposited_usd=10000`,
      [userId, email, "LoadTest User", tier],
    );

    await client.query(
      `insert into api_keys(id,user_id,key_hash,key_prefix,quota_limit,status)
       values ($1,$2,$3,$4,$5,'active')
       on conflict (id) do update set key_hash=excluded.key_hash,key_prefix=excluded.key_prefix,status='active',quota_limit=excluded.quota_limit`,
      [keyId, userId, hash, keyPrefix, 10000000],
    );

    await client.query("commit");
    console.log(JSON.stringify({ ok: true, userId, keyId, tier, apiKey: key }));
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
