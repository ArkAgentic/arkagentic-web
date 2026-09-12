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

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function makeJwt(payload) {
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.x`;
}

async function asJson(resp) {
  const text = await resp.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 400) }; }
}

const appHost = 'https://gateway.arkagentic.com';
const apiHost = 'https://gateway.arkagentic.com';
const seed = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const userId = `usr_host_${seed}`;
const email = `${seed}@arkagentic.local`;
const jwt = makeJwt({ userId, email, role: 'user', balanceUsd: 10, exp: Math.floor(Date.now()/1000) + 3600 });

const createResp = await fetch(`${appHost}/api/console/keys`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie: `ark_jwt_token=${jwt}` },
  body: JSON.stringify({ name: 'Host Model Support Probe' }),
});
const createBody = await asJson(createResp);
if (createResp.status !== 201 || !createBody.revealedValue) {
  console.log(JSON.stringify({ failed: 'create-key', status: createResp.status, body: createBody }, null, 2));
  process.exit(1);
}

const key = createBody.revealedValue;
const payload = {
  model: 'ark-gpt-4o',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'hello' },
  ],
  stream: false,
};

async function call(host) {
  const resp = await fetch(`${host}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(payload),
  });
  const body = await asJson(resp);
  return { status: resp.status, body };
}

const appCall = await call(appHost);
const apiCall = await call(apiHost);

console.log(JSON.stringify({
  model: payload.model,
  appHost: appCall,
  apiHost: apiCall,
}, null, 2));
