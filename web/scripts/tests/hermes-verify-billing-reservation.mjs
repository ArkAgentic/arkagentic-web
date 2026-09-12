import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Client } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

function loadDotenvIfNeeded() {
  if (process.env.DATABASE_URL) return;
  const envPath = path.join(projectRoot, '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx <= 0) continue;
    const key = t.slice(0, idx).trim();
    let val = t.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function n(v) {
  return Number(Number(v).toFixed(6));
}

function eq6(a, b, eps = 1e-6) {
  return Math.abs(Number(a) - Number(b)) <= eps;
}

async function main() {
  loadDotenvIfNeeded();
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required (env or .env)');

  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  const testId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const userId = `usr_${testId}`;
  const email = `billing-reservation-${testId}@arkagentic.local`;
  const keyId = `key_${testId}`;
  const keyRaw = `sk-ark-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  const keyHash = crypto.createHash('sha256').update(keyRaw).digest('hex');
  const gatewayBase = process.env.TEST_GATEWAY_BASE_URL || 'https://arkagentic.com';

  const results = [];

  async function resetAccount(balanceUsd) {
    await db.query(
      `update users
       set balance_usd=$2,
           total_deposited_usd=greatest(coalesce(total_deposited_usd,0), $2),
           gateway_locked=false,
           gateway_lock_reason=null,
           gateway_locked_at=null
       where id=$1`,
      [userId, n(balanceUsd)],
    );
    await db.query(`delete from billing_reservations where user_id=$1`, [userId]);
  }

  async function getBalance() {
    const r = await db.query(
      `select coalesce(balance_usd,0)::float8 as balance_usd,
              coalesce(gateway_locked,false) as gateway_locked,
              gateway_lock_reason
       from users where id=$1`,
      [userId],
    );
    return r.rows[0];
  }

  async function reserveHold(modelId, reservedUsd) {
    try {
      await db.query('begin');
      const rowRes = await db.query(
        `select coalesce(balance_usd,0)::float8 as balance_usd,
                coalesce(gateway_locked,false) as gateway_locked
         from users where id=$1 for update`,
        [userId],
      );
      const row = rowRes.rows[0];
      if (!row) throw new Error('user not found');
      if (row.gateway_locked) throw new Error('gateway_locked');
      if (Number(row.balance_usd) - Number(reservedUsd) < 0) throw new Error('insufficient_balance');

      const reservationId = crypto.randomUUID();
      await db.query(
        `insert into billing_reservations(
           id,user_id,api_key_id,model_id,reserved_usd,settled_usd,released_usd,status,created_at,updated_at
         ) values ($1,$2,$3,$4,$5,0,0,'reserved',now(),now())`,
        [reservationId, userId, keyId, modelId, n(reservedUsd)],
      );

      const activeRes = await db.query(
        `select coalesce(sum(reserved_usd - settled_usd - released_usd),0)::float8 as active_reserved
         from billing_reservations where user_id=$1 and status='reserved'`,
        [userId],
      );

      await db.query('commit');
      const activeReserved = Number(activeRes.rows[0]?.active_reserved ?? 0);
      return {
        reservationId,
        activeReserved,
        availableBalance: n(Number(row.balance_usd) - activeReserved),
      };
    } catch (err) {
      await db.query('rollback');
      throw err;
    }
  }

  async function releaseHold(reservationId, settledUsd = 0) {
    try {
      await db.query('begin');
      const rowRes = await db.query(
        `select id, coalesce(reserved_usd,0)::float8 as reserved_usd, coalesce(status,'reserved') as status
         from billing_reservations where id=$1 for update`,
        [reservationId],
      );
      const row = rowRes.rows[0];
      if (!row || row.status !== 'reserved') {
        await db.query('commit');
        return;
      }
      const settled = n(Math.min(Number(row.reserved_usd), Number(settledUsd)));
      const released = n(Math.max(0, Number(row.reserved_usd) - settled));
      const status = settled > 0 ? 'settled' : 'released';
      await db.query(
        `update billing_reservations
         set settled_usd=$2,
             released_usd=$3,
             status=$4,
             settled_at=now(),
             updated_at=now()
         where id=$1`,
        [reservationId, settled, released, status],
      );
      await db.query('commit');
    } catch (err) {
      await db.query('rollback');
      throw err;
    }
  }

  async function runCase(name, fn) {
    const startedAt = Date.now();
    try {
      const details = await fn();
      results.push({ name, status: 'PASS', ms: Date.now() - startedAt, details });
      console.log(`[PASS] ${name}`);
      console.log(JSON.stringify(details, null, 2));
    } catch (error) {
      const row = {
        name,
        status: 'FAIL',
        ms: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      };
      results.push(row);
      console.log(`[FAIL] ${name}`);
      console.log(JSON.stringify(row, null, 2));
    }
  }

  try {
    await db.query(
      `insert into users(id,email,name,role,status,balance_usd,total_deposited_usd,pricing_tier,gateway_locked)
       values ($1,$2,$3,'user','active',0,0,'tier_1',false)
       on conflict (id) do update set email=excluded.email, name=excluded.name`,
      [userId, email, 'Billing Reservation Verify'],
    );

    await db.query(
      `insert into api_keys(id,user_id,display_name,key_hash,key_prefix,quota_limit,spend_limit_usd,status)
       values ($1,$2,'Billing Reservation Verify Key',$3,$4,10000000,null,'active')
       on conflict (id) do update set user_id=excluded.user_id, key_hash=excluded.key_hash, key_prefix=excluded.key_prefix, status='active'`,
      [keyId, userId, keyHash, `${keyRaw.slice(0, 11)}...`],
    );

    await runCase('Test 1 - Quota Hold Standard Test', async () => {
      await resetAccount(1.0);
      const hold = await reserveHold('ark-gpt-4o', 0.25);
      const row = await getBalance();

      if (!eq6(hold.activeReserved, 0.25)) throw new Error(`activeReserved expected 0.25, got ${hold.activeReserved}`);
      if (!eq6(hold.availableBalance, 0.75)) throw new Error(`available expected 0.75, got ${hold.availableBalance}`);
      if (!eq6(row.balance_usd, 1.0)) throw new Error(`ledger balance should remain 1.0, got ${row.balance_usd}`);

      return {
        reservationId: hold.reservationId,
        balanceUsd: Number(row.balance_usd),
        activeReservedUsd: hold.activeReserved,
        availableBalanceUsd: hold.availableBalance,
      };
    });

    await runCase('Test 2 - Upstream Failure Release', async () => {
      await resetAccount(1.0);
      const hold = await reserveHold('ark-gpt-4o', 0.2);

      try {
        throw new Error('Simulated upstream 500/timeout');
      } catch {
        await releaseHold(hold.reservationId, 0);
      }

      const q = await db.query(
        `select coalesce(status,'reserved') as status,
                coalesce(released_usd,0)::float8 as released_usd,
                coalesce(settled_usd,0)::float8 as settled_usd
         from billing_reservations where id=$1`,
        [hold.reservationId],
      );
      const row = q.rows[0];
      const balance = await getBalance();

      if (row.status !== 'released') throw new Error(`expected released, got ${row.status}`);
      if (!eq6(row.released_usd, 0.2)) throw new Error(`released expected 0.2, got ${row.released_usd}`);
      if (!eq6(row.settled_usd, 0)) throw new Error(`settled expected 0, got ${row.settled_usd}`);
      if (!eq6(balance.balance_usd, 1.0)) throw new Error(`balance expected 1.0, got ${balance.balance_usd}`);

      return {
        reservationId: hold.reservationId,
        reservationStatus: row.status,
        releasedUsd: Number(row.released_usd),
        settledUsd: Number(row.settled_usd),
        balanceAfterRelease: Number(balance.balance_usd),
      };
    });

    await runCase('Test 3 - Charge & Settlement Rollback', async () => {
      await resetAccount(1.0);
      const hold = await reserveHold('ark-gpt-4o', 0.05);

      const charged = 0.012;
      await releaseHold(hold.reservationId, charged);
      await db.query(`update users set balance_usd=balance_usd-$2 where id=$1`, [userId, n(charged)]);

      const q = await db.query(
        `select coalesce(status,'reserved') as status,
                coalesce(released_usd,0)::float8 as released_usd,
                coalesce(settled_usd,0)::float8 as settled_usd
         from billing_reservations where id=$1`,
        [hold.reservationId],
      );
      const row = q.rows[0];
      const balance = await getBalance();

      if (row.status !== 'settled') throw new Error(`expected settled, got ${row.status}`);
      if (!eq6(row.settled_usd, 0.012)) throw new Error(`settled expected 0.012, got ${row.settled_usd}`);
      if (!eq6(row.released_usd, 0.038)) throw new Error(`released expected 0.038, got ${row.released_usd}`);
      if (!eq6(balance.balance_usd, 0.988)) throw new Error(`balance expected 0.988, got ${balance.balance_usd}`);

      return {
        reservationId: hold.reservationId,
        chargedUsd: charged,
        settledUsd: Number(row.settled_usd),
        releasedUsd: Number(row.released_usd),
        balanceAfterSettle: Number(balance.balance_usd),
      };
    });

    await runCase('Test 4 - High-Concurrency Overdraft Guard', async () => {
      await resetAccount(0.06);
      const payload = {
        model: 'ark-gpt-4o',
        max_tokens: 4096,
        messages: [{ role: 'user', content: 'stress test overdraft guard' }],
      };

      const reqs = Array.from({ length: 10 }).map(async () => {
        const resp = await fetch(`${gatewayBase}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${keyRaw}`,
          },
          body: JSON.stringify(payload),
        });
        const text = await resp.text();
        let json;
        try {
          json = JSON.parse(text);
        } catch {
          json = { raw: text.slice(0, 200) };
        }
        return { status: resp.status, json };
      });

      const responses = await Promise.all(reqs);
      const blocked402 = responses.filter((r) => r.status === 402);
      const blockedWithRequiredMsg = blocked402.filter(
        (r) => r.json?.error?.message === 'Insufficient balance. Please recharge your account at /pricing',
      );

      if (blocked402.length === 0) {
        throw new Error('expected at least one 402 under concurrent pressure');
      }
      if (blockedWithRequiredMsg.length !== blocked402.length) {
        throw new Error('some 402 responses did not contain required /pricing message');
      }

      const post = await getBalance();
      if (Number(post.balance_usd) < -1e-6) {
        throw new Error(`balance overdraft detected: ${post.balance_usd}`);
      }

      const histogram = responses.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      }, {});

      return {
        totalRequests: responses.length,
        statusHistogram: histogram,
        blocked402: blocked402.length,
        blocked402WithRequiredMsg: blockedWithRequiredMsg.length,
        finalBalanceUsd: Number(post.balance_usd),
      };
    });
  } finally {
    await db.query('delete from users where id=$1', [userId]);
    await db.end();
  }

  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.length - passCount;

  console.log('\n=== FINAL RESULT ===');
  console.log(JSON.stringify({ passCount, failCount, results }, null, 2));

  if (failCount > 0) process.exit(1);
}

main().catch((error) => {
  console.error('[FATAL]', error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
