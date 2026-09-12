import crypto from 'crypto';
import { performance } from 'perf_hooks';
import { Client } from 'pg';

const baseUrl = 'https://gateway.arkagentic.com';
const model = 'ark-gpt-4o';

function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function callJson(rawKey, body) {
  const t0 = performance.now();
  const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${rawKey}` },
    body: JSON.stringify(body),
  });
  const t1 = performance.now();
  const text = await resp.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: resp.status, json, elapsedMs: Number((t1 - t0).toFixed(2)) };
}

async function callStream(rawKey, body) {
  const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${rawKey}` },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  return { status: resp.status, text };
}

function fmt(n) {
  return Number(n).toFixed(6);
}

async function run() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');

  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  await client.query(`alter table users add column if not exists gateway_locked boolean not null default false`);
  await client.query(`alter table users add column if not exists gateway_lock_reason varchar(64)`);
  await client.query(`alter table users add column if not exists gateway_locked_at timestamptz`);

  const userId = id('usr_reg');
  const keyId = id('key_reg');
  const rawKey = `sk-ark-${crypto.randomBytes(18).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = `${rawKey.slice(0, 11)}...`;

  const report = {
    case1_balance_zero_preflight_402_no_upstream_charge: { pass: false, details: {} },
    case2_low_balance_stream_cutoff_and_account_locked: { pass: false, details: {} },
    case4_locked_account_seconds_reject: { pass: false, details: {} },
    meta: { userId, keyId },
  };

  try {
    await client.query('begin');
    await client.query(
      `insert into users(id,email,name,role,status,balance_usd,total_deposited_usd,pricing_tier,gateway_locked)
       values ($1,$2,$3,'user','active',0,0,'tier_1',false)`,
      [userId, `${userId}@arkagentic.local`, 'Anti Overdraft Regression'],
    );
    await client.query(
      `insert into api_keys(id,user_id,display_name,key_hash,key_prefix,quota_limit,spend_limit_usd,status)
       values ($1,$2,'Regression Key',$3,$4,5000000,null,'active')`,
      [keyId, userId, keyHash, keyPrefix],
    );
    await client.query('commit');

    // Case 1
    const before1 = await client.query(`select count(*)::int as c from api_logs where user_id=$1`, [userId]);
    const r1 = await callJson(rawKey, { model, messages: [{ role: 'user', content: 'ping' }] });
    const after1 = await client.query(`select count(*)::int as c from api_logs where user_id=$1`, [userId]);
    const e1 = r1.json?.error ?? {};
    report.case1_balance_zero_preflight_402_no_upstream_charge = {
      pass: r1.status === 402 && e1?.type === 'insufficient_balance' && e1?.code === 'balance_depleted' && Number(before1.rows[0].c) === Number(after1.rows[0].c),
      details: {
        status: r1.status,
        elapsed_ms: r1.elapsedMs,
        error: e1,
        api_logs_before: Number(before1.rows[0].c),
        api_logs_after: Number(after1.rows[0].c),
      },
    };

    // Case 2 -> force lock
    await client.query(`update users set balance_usd=$2,total_deposited_usd=$3,gateway_locked=false,gateway_lock_reason=null where id=$1`, [userId, 0.01, 0.01]);
    const before2 = await client.query(`select coalesce(balance_usd,0)::float8 as b, coalesce(gateway_locked,false) as l from users where id=$1`, [userId]);
    const r2 = await callStream(rawKey, {
      model,
      stream: true,
      messages: [{ role: 'user', content: '请连续输出超长文本。'.repeat(2500) }],
    });
    const after2 = await client.query(`select coalesce(balance_usd,0)::float8 as b, coalesce(gateway_locked,false) as l from users where id=$1`, [userId]);
    const streamErr = r2.text.includes('"code":"balance_depleted"') || r2.text.includes('insufficient_balance');
    report.case2_low_balance_stream_cutoff_and_account_locked = {
      pass: r2.status === 200 && streamErr && Boolean(after2.rows[0].l) === true,
      details: {
        status: r2.status,
        stream_error_emitted: streamErr,
        balance_before: fmt(before2.rows[0].b),
        balance_after: fmt(after2.rows[0].b),
        gateway_locked_after: Boolean(after2.rows[0].l),
      },
    };

    // Case 4: locked account should reject immediately and not create extra api log
    const logsBefore4 = await client.query(`select count(*)::int as c from api_logs where user_id=$1`, [userId]);
    const r4 = await callJson(rawKey, { model, messages: [{ role: 'user', content: 'still there?' }] });
    const logsAfter4 = await client.query(`select count(*)::int as c from api_logs where user_id=$1`, [userId]);
    const e4 = r4.json?.error ?? {};
    report.case4_locked_account_seconds_reject = {
      pass:
        r4.status === 402 &&
        e4?.type === 'insufficient_balance' &&
        e4?.code === 'balance_depleted' &&
        Number(logsBefore4.rows[0].c) === Number(logsAfter4.rows[0].c),
      details: {
        status: r4.status,
        elapsed_ms: r4.elapsedMs,
        error: e4,
        api_logs_before: Number(logsBefore4.rows[0].c),
        api_logs_after: Number(logsAfter4.rows[0].c),
        note: 'elapsed_ms is end-to-end RTT (network included), not pure server CPU time.',
      },
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    try {
      await client.query('delete from users where id=$1', [userId]);
    } catch {}
    await client.end();
  }
}

run().catch((e) => {
  console.error('REPORT_ERROR', e?.message || String(e));
  process.exit(1);
});
