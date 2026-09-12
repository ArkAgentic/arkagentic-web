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
const testId = `http_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const userId = `usr_${testId}`;
const email = `${testId}@arkagentic.local`;

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
  balanceUsd: 10,
  exp: Math.floor(Date.now() / 1000) + 3600,
});

async function jsonFetch(url, init = {}) {
  const resp = await fetch(url, init);
  const text = await resp.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
  return { status: resp.status, body };
}

async function callChat(apiKey) {
  return jsonFetch(`${appBase}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'ark-gpt-4o',
      messages: [{ role: 'user', content: 'disable-enable e2e probe' }],
      max_tokens: 8,
    }),
  });
}

const createResp = await jsonFetch(`${appBase}/api/console/keys`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    cookie: `ark_jwt_token=${jwt}`,
  },
  body: JSON.stringify({ name: 'Toggle E2E Probe' }),
});

if (createResp.status !== 201 || !createResp.body?.id || !createResp.body?.revealedValue) {
  console.log(JSON.stringify({ step: 'create', failed: true, createResp }, null, 2));
  process.exit(1);
}

const keyId = createResp.body.id;
const apiKey = createResp.body.revealedValue;

const beforeToggle = await callChat(apiKey);

const toggleOff = await jsonFetch(`${appBase}/api/console/keys/${keyId}/toggle`, {
  method: 'POST',
  headers: { cookie: `ark_jwt_token=${jwt}` },
});

const afterDisable = await callChat(apiKey);

const toggleOn = await jsonFetch(`${appBase}/api/console/keys/${keyId}/toggle`, {
  method: 'POST',
  headers: { cookie: `ark_jwt_token=${jwt}` },
});

const afterEnable = await callChat(apiKey);

const checks = {
  create_ok: createResp.status === 201,
  toggle_off_ok: toggleOff.status === 200,
  disabled_returns_401: afterDisable.status === 401,
  toggle_on_ok: toggleOn.status === 200,
  reenabled_not_401: afterEnable.status !== 401,
};

console.log(JSON.stringify({
  appBase,
  userId,
  keyId,
  checks,
  responses: {
    createResp: { status: createResp.status, id: createResp.body?.id, hasRevealed: Boolean(createResp.body?.revealedValue) },
    beforeToggle,
    toggleOff: { status: toggleOff.status },
    afterDisable,
    toggleOn: { status: toggleOn.status },
    afterEnable,
  },
}, null, 2));

if (!Object.values(checks).every(Boolean)) process.exit(1);
