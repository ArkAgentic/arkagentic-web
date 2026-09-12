import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

const envPath = path.join(projectRoot, '.env');
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

const userId = process.env.STRESS_TEST_USER_ID || 'usr_1fbd238812a44601';

async function main() {
  const pool = new Pool({ connectionString: dbUrl });
  const before = await pool.query(
    `select count(*)::int as reserved_count
     from billing_reservations
     where user_id=$1 and status='reserved'`,
    [userId],
  );

  const update = await pool.query(
    `update billing_reservations
     set status='released',
         released_usd = coalesce(reserved_usd,0),
         settled_usd = 0,
         settled_at = now(),
         updated_at = now()
     where user_id=$1 and status='reserved'`,
    [userId],
  );

  const after = await pool.query(
    `select count(*)::int as reserved_count
     from billing_reservations
     where user_id=$1 and status='reserved'`,
    [userId],
  );

  await pool.end();

  console.log(
    JSON.stringify(
      {
        userId,
        reservedBefore: before.rows[0]?.reserved_count ?? 0,
        releasedRows: update.rowCount ?? 0,
        reservedAfter: after.rows[0]?.reserved_count ?? 0,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(String(e?.message || e));
  process.exit(1);
});
