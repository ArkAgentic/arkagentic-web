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

const APP_BASE = process.env.TEST_GATEWAY_BASE_URL || 'https://gateway.arkagentic.com';
const TARGET_MODEL = process.env.FALLBACK_TEST_MODEL || 'ark-gpt-4o';
const FIXED_USER_ID = process.env.STRESS_TEST_USER_ID || 'usr_1fbd238812a44601';
const FIXED_USER_EMAIL = process.env.STRESS_TEST_USER_EMAIL || 'charles1991@live.cn';
const REQUEST_TIMEOUT_MS = Number(process.env.FALLBACK_REQUEST_TIMEOUT_MS || 45000);

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function makeJwt(payload) {
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.x`;
}

async function readJsonOrText(resp) {
  const text = await resp.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { text, json };
}

function summarizeHeaders(headers) {
  const keys = [
    'content-type',
    'x-ark-fallback',
    'x-ark-actual-model',
    'retry-after',
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
    'x-ratelimit-reset',
  ];
  const out = {};
  for (const k of keys) {
    const v = headers.get(k);
    if (v != null) out[k] = v;
  }
  return out;
}

async function getActiveApiKey(jwt) {
  const resp = await fetch(`${APP_BASE}/api/console/keys`, {
    headers: { cookie: `ark_jwt_token=${jwt}` },
  });
  const payload = await readJsonOrText(resp);
  if (resp.status !== 200 || !Array.isArray(payload.json)) {
    throw new Error(`list keys failed status=${resp.status} body=${payload.text.slice(0, 400)}`);
  }
  const active = payload.json.find((k) => k && k.active !== false && typeof k.revealedValue === 'string');
  if (!active) {
    throw new Error('No active revealed API key found for fixed user');
  }
  return active.revealedValue;
}

async function callOnce({ apiKey, stream, prompt, maxTokens = 32 }) {
  const controller = new AbortController();
  const started = Date.now();
  const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const resp = await fetch(`${APP_BASE}/v1/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: TARGET_MODEL,
        stream,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: 'You are concise.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    const latencyMs = Date.now() - started;
    const headers = summarizeHeaders(resp.headers);

    let bodyText = '';
    let bodyJson = null;

    if (stream) {
      if (resp.body) {
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bodyText += decoder.decode(value, { stream: true });
          if (bodyText.length > 120000) break;
        }
      }
    } else {
      const parsed = await readJsonOrText(resp);
      bodyText = parsed.text;
      bodyJson = parsed.json;
    }

    return {
      ok: resp.ok,
      status: resp.status,
      latencyMs,
      headers,
      modelField: bodyJson?.model ? String(bodyJson.model) : null,
      errorType: bodyJson?.error?.type ? String(bodyJson.error.type) : null,
      bodySample: bodyText.slice(0, 800),
    };
  } catch (error) {
    return {
      ok: false,
      status: -1,
      latencyMs: Date.now() - started,
      headers: {},
      modelField: null,
      errorType: error?.name === 'AbortError' ? 'client_timeout' : 'client_fetch_error',
      bodySample: String(error?.message || error),
    };
  } finally {
    clearTimeout(t);
  }
}

async function runConcurrent(work) {
  const { concurrency, total, fn } = work;
  let cursor = 0;
  const results = [];
  async function worker() {
    while (true) {
      const i = cursor;
      cursor += 1;
      if (i >= total) return;
      const r = await fn(i);
      results.push(r);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

function aggregate(results) {
  const statusCounts = {};
  const errorTypeCounts = {};
  const fallbackHeaderCount = results.filter((r) => r.headers['x-ark-fallback'] === 'true').length;
  const actualModelCounts = {};

  for (const r of results) {
    const s = String(r.status);
    statusCounts[s] = (statusCounts[s] || 0) + 1;
    if (r.errorType) errorTypeCounts[r.errorType] = (errorTypeCounts[r.errorType] || 0) + 1;
    const m = r.headers['x-ark-actual-model'] || r.modelField;
    if (m) actualModelCounts[m] = (actualModelCounts[m] || 0) + 1;
  }

  return {
    total: results.length,
    success: results.filter((r) => r.status >= 200 && r.status < 300).length,
    fallbackHeaderCount,
    statusCounts,
    errorTypeCounts,
    actualModelCounts,
    samples: results.slice(0, 10),
  };
}

async function main() {
  const jwt = makeJwt({
    userId: FIXED_USER_ID,
    email: FIXED_USER_EMAIL,
    role: 'user',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  const apiKey = await getActiveApiKey(jwt);

  const holders = await runConcurrent({
    concurrency: 140,
    total: 140,
    fn: () =>
      callOnce({
        apiKey,
        stream: true,
        prompt: 'Generate a long detailed explanation with many paragraphs and keep streaming.',
        maxTokens: 384,
      }),
  });

  await new Promise((r) => setTimeout(r, 350));

  const probes = await runConcurrent({
    concurrency: 40,
    total: 80,
    fn: (i) =>
      callOnce({
        apiKey,
        stream: false,
        prompt: `fallback probe ${i}`,
        maxTokens: 16,
      }),
  });

  const streamProbes = await runConcurrent({
    concurrency: 20,
    total: 40,
    fn: (i) =>
      callOnce({
        apiKey,
        stream: true,
        prompt: `stream fallback probe ${i}`,
        maxTokens: 64,
      }),
  });

  const report = {
    generatedAt: new Date().toISOString(),
    appBase: APP_BASE,
    targetModel: TARGET_MODEL,
    userId: FIXED_USER_ID,
    keyPrefix: apiKey.slice(0, 12),
    holderSummary: aggregate(holders),
    nonStreamProbeSummary: aggregate(probes),
    streamProbeSummary: aggregate(streamProbes),
    verification: {
      fallback_header_nonstream: aggregate(probes).fallbackHeaderCount > 0,
      fallback_header_stream: aggregate(streamProbes).fallbackHeaderCount > 0,
      fallback_header_any: aggregate(probes).fallbackHeaderCount + aggregate(streamProbes).fallbackHeaderCount > 0,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ fatal: String(error?.message || error) }, null, 2));
  process.exit(1);
});
