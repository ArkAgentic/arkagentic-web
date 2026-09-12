import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Client } from 'pg';

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

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');

const gatewayBase = process.env.TEST_GATEWAY_BASE_URL || 'https://gateway.arkagentic.com';
const testId = `de_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const userId = `usr_${testId}`;
const keyId = `key_${testId}`;
const email = `${testId}@arkagentic.local`;
const rawKey = `sk-ark-${crypto.randomUUID().replace(/-/g, '')}`;
const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
const keyPrefix = `${rawKey.slice(0, 11)}...`;

const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function callChat() {
  const resp = await fetch(`${gatewayBase}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${rawKey}`,
    },
    body: JSON.stringify({
      model: 'ark-gpt-4o',
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 8,
    }),
  });
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: resp.status, body: json };
}

try {
  await db.connect();
  await db.query(
    `insert into users(id,email,name,role,status,balance_usd,total_deposited_usd,pricing_tier,gateway_locked)
     values ($1,$2,$3,'user','active',5,5,'tier_1',false)
     on conflict (id) do update set status='active', balance_usd=5, total_deposited_usd=greatest(coalesce(users.total_deposited_usd,0),5), gateway_locked=false, gateway_lock_reason=null, gateway_locked_at=null`,
    [userId, email, 'DisableEnable Verify']
  );

  await db.query(
    `insert into api_keys(id,user_id,display_name,key_hash,key_prefix,key_encrypted,quota_limit,spend_limit_usd,status)
     values ($1,$2,'DisableEnable Verify Key',$3,$4,$5,1000000,null,'active')
     on conflict (id) do update set user_id=excluded.user_id, key_hash=excluded.key_hash, key_prefix=excluded.key_prefix, key_encrypted=excluded.key_encrypted, status='active'`,
    [keyId, userId, keyHash, keyPrefix, rawKey]
  );

  const activeResp = await callChat();

  await db.query(`update api_keys set status='disabled' where id=$1 and user_id=$2`, [keyId, userId]);
  const disabledResp = await callChat();

  await db.query(`update api_keys set status='active' where id=$1 and user_id=$2`, [keyId, userId]);
  const reenabledResp = await callChat();

  const result = {
    gatewayBase,
    keyId,
    checks: {
      active_not_401: activeResp.status !== 401,
      disabled_is_401: disabledResp.status === 401,
      reenabled_not_401: reenabledResp.status !== 401,
    },
    responses: {
      active: activeResp,
      disabled: disabledResp,
      reenabled: reenabledResp,
    },
  };

  console.log(JSON.stringify(result, null, 2));

  if (!result.checks.active_not_401 || !result.checks.disabled_is_401 || !result.checks.reenabled_not_401) {
    process.exitCode = 1;
  }
} finally {
  await db.query(`delete from users where id=$1`, [userId]).catch(() => {});
  await db.end().catch(() => {});
}
