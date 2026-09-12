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

const appBase = process.env.TEST_GATEWAY_BASE_URL || 'https://arkagentic.com';
const userId = process.env.STRESS_TEST_USER_ID || 'usr_1fbd238812a44601';
const email = process.env.STRESS_TEST_USER_EMAIL || 'charles1991@live.cn';

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function makeJwt(payload) {
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.x`;
}

async function asJson(resp) {
  const text = await resp.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}

async function getActiveKey(jwt) {
  const resp = await fetch(`${appBase}/api/console/keys`, {
    headers: { cookie: `ark_jwt_token=${jwt}` },
  });
  const payload = await asJson(resp);
  if (resp.status !== 200 || !Array.isArray(payload.json)) {
    throw new Error(`cannot list keys: ${resp.status} ${payload.text.slice(0, 200)}`);
  }
  const key = payload.json.find((k) => k && k.active !== false && typeof k.revealedValue === 'string');
  if (!key) throw new Error('no active revealed key found');
  return key.revealedValue;
}

async function singleCall(apiKey, stream) {
  const resp = await fetch(`${appBase}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'ark-gpt-4o',
      stream,
      max_tokens: stream ? 64 : 8,
      messages: [
        { role: 'system', content: 'You are concise.' },
        { role: 'user', content: stream ? 'stream fallback probe' : 'fallback probe' },
      ],
    }),
  });

  const headers = Object.fromEntries(resp.headers.entries());
  const parsed = await asJson(resp);

  return {
    status: resp.status,
    headers,
    bodySample: parsed.text.slice(0, 1000),
    bodyJson: parsed.json,
  };
}

async function runBurst(apiKey, { stream, concurrency, total }) {
  const out = [];
  let idx = 0;

  async function worker() {
    while (true) {
      const cur = idx;
      idx += 1;
      if (cur >= total) return;
      try {
        const r = await singleCall(apiKey, stream);
        out.push(r);
      } catch (e) {
        out.push({ status: -1, headers: {}, bodySample: String(e?.message || e), bodyJson: null });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return out;
}

function summarize(results) {
  const statusCounts = {};
  const hdrFallback = [];
  const hdrActualModel = [];

  for (const r of results) {
    const s = String(r.status);
    statusCounts[s] = (statusCounts[s] || 0) + 1;
    if (r.headers['x-ark-fallback']) hdrFallback.push(r.headers['x-ark-fallback']);
    if (r.headers['x-ark-actual-model']) hdrActualModel.push(r.headers['x-ark-actual-model']);
  }

  return {
    total: results.length,
    statusCounts,
    fallbackHeaderCount: hdrFallback.length,
    actualModelHeaderCount: hdrActualModel.length,
    actualModelHeaderValues: Array.from(new Set(hdrActualModel)).slice(0, 20),
  };
}

async function main() {
  const jwt = makeJwt({
    userId,
    email,
    role: 'user',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  const apiKey = await getActiveKey(jwt);

  const nonStream = await runBurst(apiKey, { stream: false, concurrency: 200, total: 400 });
  const stream = await runBurst(apiKey, { stream: true, concurrency: 120, total: 120 });

  const report = {
    generatedAt: new Date().toISOString(),
    appBase,
    userId,
    keyPrefix: apiKey.slice(0, 12),
    nonStreamSummary: summarize(nonStream),
    streamSummary: summarize(stream),
    samples: {
      nonStream429: nonStream.find((r) => r.status === 429) || null,
      nonStream500: nonStream.find((r) => r.status === 500) || null,
      nonStreamFallbackHeader: nonStream.find((r) => r.headers['x-ark-fallback']) || null,
      stream500: stream.find((r) => r.status === 500) || null,
      streamFallbackHeader: stream.find((r) => r.headers['x-ark-fallback']) || null,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ fatal: String(e?.message || e) }, null, 2));
  process.exit(1);
});
