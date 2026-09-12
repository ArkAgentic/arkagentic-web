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

const appBase = process.env.TEST_GATEWAY_BASE_URL || 'https://gateway.arkagentic.com';
const testId = `tg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const userId = `usr_${testId}`;
const keyId = `key_${testId}`;
const email = `${testId}@arkagentic.local`;
const rawKey = `sk-ark-${crypto.randomUUID().replace(/-/g, '')}`;
const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
const keyPrefix = `${rawKey.slice(0, 11)}...`;

const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function makeJwt(payload) {
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.x`;
}

async function callChat() {
  const resp = await fetch(`${appBase}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${rawKey}`,
    },
    body: JSON.stringify({
      model: 'ark-gpt-4o',
      messages: [{ role: 'user', content: 'toggle route e2e check' }],
      max_tokens: 8,
    }),
  });
  const text = await resp.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 200) }; }
  return { status: resp.status, body };
}

async function callToggle(jwt) {
  const resp = await fetch(`${appBase}/api/console/keys/${keyId}/toggle`, {
    method: 'POST',
    headers: {
      cookie: `ark_jwt_token=${jwt}`,
      accept: 'application/json',
    },
  });
  const text = await resp.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 200) }; }
  return { status: resp.status, body };
}

try {
  await db.connect();
  await db.query(
    `insert into users(id,email,name,role,status,balance_usd,total_deposited_usd,pricing_tier,gateway_locked)
     values ($1,$2,$3,'user','active',5,5,'tier_1',false)
     on conflict (id) do update set status='active', balance_usd=5, total_deposited_usd=greatest(coalesce(users.total_deposited_usd,0),5), gateway_locked=false, gateway_lock_reason=null, gateway_locked_at=null`,
    [userId, email, 'Toggle Route E2E Verify']
  );

  await db.query(
    `insert into api_keys(id,user_id,display_name,key_hash,key_prefix,key_encrypted,quota_limit,spend_limit_usd,status)
     values ($1,$2,'Toggle Route E2E Key',$3,$4,$5,1000000,null,'active')
     on conflict (id) do update set user_id=excluded.user_id, key_hash=excluded.key_hash, key_prefix=excluded.key_prefix, key_encrypted=excluded.key_encrypted, status='active'`,
    [keyId, userId, keyHash, keyPrefix, rawKey]
  );

  const jwt = makeJwt({
    userId,
    email,
    role: 'user',
    balanceUsd: 5,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  const activeBefore = await callChat();
  const toggleOff = await callToggle(jwt);
  const afterDisable = await callChat();
  const toggleOn = await callToggle(jwt);
  const afterEnable = await callChat();

  const out = {
    appBase,
    keyId,
    checks: {
      toggle_endpoint_200_off: toggleOff.status === 200,
      toggle_endpoint_200_on: toggleOn.status === 200,
      disabled_returns_401: afterDisable.status === 401,
      enabled_not_401: afterEnable.status !== 401,
    },
    responses: {
      activeBefore,
      toggleOff: { status: toggleOff.status, firstKeyStatus: Array.isArray(toggleOff.body) ? toggleOff.body.find((k) => k.id === keyId)?.active : null },
      afterDisable,
      toggleOn: { status: toggleOn.status, firstKeyStatus: Array.isArray(toggleOn.body) ? toggleOn.body.find((k) => k.id === keyId)?.active : null },
      afterEnable,
    },
  };

  console.log(JSON.stringify(out, null, 2));

  if (!Object.values(out.checks).every(Boolean)) process.exitCode = 1;
} finally {
  await db.query('delete from users where id=$1', [userId]).catch(() => {});
  await db.end().catch(() => {});
}
