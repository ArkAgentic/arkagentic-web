import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

const appBase = process.env.TEST_GATEWAY_BASE_URL || 'https://gateway.arkagentic.com';
const seed = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const userId = `usr_lm_${seed}`;
const email = `${seed}@arkagentic.local`;

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function makeJwt(payload) {
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.x`;
}

const jwt = makeJwt({
  userId,
  email,
  role: 'user',
  balanceUsd: 0,
  exp: Math.floor(Date.now() / 1000) + 3600,
});

async function createKey(index) {
  const resp = await fetch(`${appBase}/api/console/keys`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `ark_jwt_token=${jwt}`,
    },
    body: JSON.stringify({ name: `K-${index}` }),
  });
  const text = await resp.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 200) }; }
  return { status: resp.status, body };
}

const results = [];
for (let i = 1; i <= 6; i += 1) {
  // serial to make assertion deterministic
  // eslint-disable-next-line no-await-in-loop
  results.push(await createKey(i));
}

const statusSeq = results.map((r) => r.status);
const checks = {
  first5_created: statusSeq.slice(0, 5).every((s) => s === 201),
  sixth_blocked_400: statusSeq[5] === 400,
  sixth_code_key_limit_reached: results[5]?.body?.code === 'KEY_LIMIT_REACHED',
};

console.log(JSON.stringify({
  appBase,
  userId,
  statusSeq,
  checks,
  sixthResponse: results[5],
}, null, 2));

if (!Object.values(checks).every(Boolean)) process.exit(1);
