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
const REQUEST_TIMEOUT_MS = 30000;

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function makeJwt(payload) {
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.x`;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

async function readJsonOrText(resp) {
  const text = await resp.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}

function createAuthContext() {
  const fixedUserId = process.env.STRESS_TEST_USER_ID;
  const fixedEmail = process.env.STRESS_TEST_USER_EMAIL;
  if (fixedUserId && fixedEmail) {
    const jwt = makeJwt({
      userId: fixedUserId,
      email: fixedEmail,
      role: 'user',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    return { seed: 'fixed', userId: fixedUserId, email: fixedEmail, jwt, fixed: true };
  }

  const seed = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const userId = `usr_stress_${seed}`;
  const email = `${seed}@arkagentic.local`;
  const jwt = makeJwt({
    userId,
    email,
    role: 'user',
    // large synthetic value for test account creation path
    balanceUsd: 2000,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return { seed, userId, email, jwt, fixed: false };
}

async function listActiveApiKeys(jwt) {
  const resp = await fetch(`${appBase}/api/console/keys`, {
    headers: { cookie: `ark_jwt_token=${jwt}` },
  });
  const payload = await readJsonOrText(resp);
  if (resp.status !== 200 || !Array.isArray(payload.json)) {
    throw new Error(`list keys failed: status=${resp.status} body=${payload.text.slice(0, 400)}`);
  }
  return payload.json.filter((k) => k && k.active !== false && typeof k.revealedValue === 'string');
}

async function createApiKey(jwt) {
  const resp = await fetch(`${appBase}/api/console/keys`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `ark_jwt_token=${jwt}`,
    },
    body: JSON.stringify({ name: `stress-${Date.now()}` }),
  });
  const payload = await readJsonOrText(resp);
  if (resp.status !== 201 || !payload.json?.revealedValue) {
    throw new Error(`create key failed: status=${resp.status} body=${payload.text.slice(0, 400)}`);
  }
  return payload.json.revealedValue;
}

async function resolveApiKeyForTest(auth) {
  const listed = await listActiveApiKeys(auth.jwt);
  if (listed.length) return listed[0].revealedValue;
  if (auth.fixed) {
    throw new Error('No active revealed API key available for fixed stress-test user');
  }
  return createApiKey(auth.jwt);
}

async function callCompletions({ apiKey, stream, prompt, maxTokens = 32 }) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const resp = await fetch(`${appBase}/v1/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'ark-gpt-4o',
        stream,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: 'You are a concise assistant.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    const latencyMs = Date.now() - startedAt;
    const hdrFallback = resp.headers.get('x-ark-fallback');
    const hdrActualModel = resp.headers.get('x-ark-actual-model');

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
          if (bodyText.length > 200000) break;
        }
      }
    } else {
      const parsed = await readJsonOrText(resp);
      bodyText = parsed.text;
      bodyJson = parsed.json;
    }

    let errorType = null;
    let modelField = null;
    if (bodyJson?.error?.type) errorType = String(bodyJson.error.type);
    if (bodyJson?.model) modelField = String(bodyJson.model);

    return {
      ok: resp.ok,
      status: resp.status,
      latencyMs,
      hdrFallback: hdrFallback ? String(hdrFallback) : null,
      hdrActualModel: hdrActualModel ? String(hdrActualModel) : null,
      modelField,
      errorType,
      bodyTextSample: bodyText.slice(0, 400),
    };
  } catch (error) {
    return {
      ok: false,
      status: -1,
      latencyMs: Date.now() - startedAt,
      hdrFallback: null,
      hdrActualModel: null,
      modelField: null,
      errorType: error?.name === 'AbortError' ? 'client_timeout' : 'client_fetch_error',
      bodyTextSample: String(error?.message || error),
    };
  } finally {
    clearTimeout(t);
  }
}

async function runConcurrent({ apiKey, concurrency, totalRequests, stream, prompt, maxTokens }) {
  const results = [];
  let cursor = 0;

  async function worker() {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= totalRequests) return;
      const r = await callCompletions({ apiKey, stream, prompt, maxTokens });
      results.push(r);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

function summarize(label, concurrency, stream, results) {
  const total = results.length;
  const success = results.filter((r) => r.status >= 200 && r.status < 300).length;
  const statusCounts = {};
  const errorTypeCounts = {};
  const latencies = results.map((r) => r.latencyMs);
  let fallbackCount = 0;
  let concurrency429 = 0;

  for (const r of results) {
    const sk = String(r.status);
    statusCounts[sk] = (statusCounts[sk] || 0) + 1;
    if (r.errorType) errorTypeCounts[r.errorType] = (errorTypeCounts[r.errorType] || 0) + 1;
    if (r.hdrFallback === 'true') fallbackCount += 1;
    if (r.status === 429 && r.errorType === 'concurrency_limit_error') concurrency429 += 1;
  }

  const waitedSuccessCount = results.filter((r) => r.status >= 200 && r.status < 300 && r.latencyMs >= 250).length;

  return {
    label,
    concurrency,
    stream,
    total,
    success,
    successRate: Number((success / Math.max(1, total)).toFixed(4)),
    avgLatencyMs: Number(avg(latencies).toFixed(2)),
    p95LatencyMs: percentile(latencies, 95),
    p99LatencyMs: percentile(latencies, 99),
    statusCounts,
    errorTypeCounts,
    concurrency429,
    fallbackCount,
    waitedSuccessCount,
    waitedSuccessRate: Number((waitedSuccessCount / Math.max(1, success)).toFixed(4)),
  };
}

async function runFallbackProbe(apiKey) {
  // 先发起一批较重 stream 请求尝试占满 inflight，再并发发起探测请求。
  const holders = 220;
  const probes = 40;

  const holderPromise = runConcurrent({
    apiKey,
    concurrency: holders,
    totalRequests: holders,
    stream: true,
    prompt: 'Generate a long detailed technical explanation in many paragraphs to keep stream open.',
    maxTokens: 256,
  });

  await new Promise((r) => setTimeout(r, 200));

  const probeResults = await runConcurrent({
    apiKey,
    concurrency: probes,
    totalRequests: probes,
    stream: false,
    prompt: 'fallback probe',
    maxTokens: 8,
  });

  const holderResults = await holderPromise;

  const fallbackTriggered = probeResults.filter((r) => r.hdrFallback === 'true').length;
  const actualModels = probeResults
    .map((r) => r.hdrActualModel || r.modelField)
    .filter(Boolean)
    .reduce((acc, m) => {
      acc[m] = (acc[m] || 0) + 1;
      return acc;
    }, {});

  const retryableStatuses = probeResults.filter((r) => r.status === 429 || r.status >= 500).length;

  return {
    holders,
    probes,
    probeStatusCounts: probeResults.reduce((acc, r) => {
      const k = String(r.status);
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
    retryableStatuses,
    fallbackTriggered,
    actualModels,
    holderSuccess: holderResults.filter((r) => r.status >= 200 && r.status < 300).length,
  };
}

async function main() {
  const auth = createAuthContext();
  const apiKey = await resolveApiKeyForTest(auth);

  const scenarios = [
    { label: 'non_stream_c50', concurrency: 50, totalRequests: 100, stream: false },
    { label: 'non_stream_c100', concurrency: 100, totalRequests: 200, stream: false },
    { label: 'non_stream_c200', concurrency: 200, totalRequests: 400, stream: false },
    { label: 'stream_c50', concurrency: 50, totalRequests: 50, stream: true },
    { label: 'stream_c100', concurrency: 100, totalRequests: 100, stream: true },
    { label: 'stream_c200', concurrency: 200, totalRequests: 200, stream: true },
  ];

  const summaries = [];

  for (const sc of scenarios) {
    // eslint-disable-next-line no-await-in-loop
    const results = await runConcurrent({
      apiKey,
      concurrency: sc.concurrency,
      totalRequests: sc.totalRequests,
      stream: sc.stream,
      prompt: sc.stream ? 'Stream test payload.' : 'Non-stream test payload.',
      maxTokens: sc.stream ? 64 : 16,
    });
    summaries.push(summarize(sc.label, sc.concurrency, sc.stream, results));
  }

  const fallbackProbe = await runFallbackProbe(apiKey);

  const report = {
    generatedAt: new Date().toISOString(),
    appBase,
    userId: auth.userId,
    keyPrefix: apiKey.slice(0, 12),
    scenarios: summaries,
    fallbackProbe,
    verification: {
      semaphore_has_429: summaries.some((s) => s.concurrency429 > 0),
      queue_wait_observed_at_100: summaries.some((s) => s.concurrency === 100 && s.waitedSuccessCount > 0),
      fallback_header_observed: summaries.some((s) => s.fallbackCount > 0) || fallbackProbe.fallbackTriggered > 0,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ fatal: String(error?.message || error) }, null, 2));
  process.exit(1);
});
