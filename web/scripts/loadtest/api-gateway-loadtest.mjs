const TARGET = process.env.LOADTEST_URL || "https://gateway.arkagentic.com/v1/chat/completions";
const API_KEY = process.env.LOADTEST_API_KEY;
const DURATION_SECONDS = Number(process.env.LOADTEST_DURATION_SECONDS || 30);
const CONCURRENCY = Number(process.env.LOADTEST_CONCURRENCY || 120);

if (!API_KEY) {
  console.error("LOADTEST_API_KEY is required");
  process.exit(1);
}

const payload = JSON.stringify({
  model: "ark-kimi-k2",
  messages: [{ role: "user", content: "rate-limit-check" }],
});

const endAt = Date.now() + DURATION_SECONDS * 1000;

const latencies = [];
const byStatus = new Map();
let total = 0;
let failed = 0;

function pct(arr, p) {
  if (!arr.length) return 0;
  const idx = Math.min(arr.length - 1, Math.floor((p / 100) * arr.length));
  return arr[idx];
}

async function worker() {
  while (Date.now() < endAt) {
    const started = performance.now();
    try {
      const res = await fetch(TARGET, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${API_KEY}`,
        },
        body: payload,
      });
      const ms = performance.now() - started;
      latencies.push(ms);
      total += 1;
      byStatus.set(res.status, (byStatus.get(res.status) || 0) + 1);
      await res.arrayBuffer();
    } catch {
      failed += 1;
      total += 1;
    }
  }
}

async function main() {
  const jobs = Array.from({ length: CONCURRENCY }, () => worker());
  const startedAt = Date.now();
  await Promise.all(jobs);
  const elapsed = (Date.now() - startedAt) / 1000;

  latencies.sort((a, b) => a - b);
  const report = {
    target: TARGET,
    durationSeconds: elapsed,
    concurrency: CONCURRENCY,
    totalRequests: total,
    throughputRps: Number((total / elapsed).toFixed(2)),
    failedRequests: failed,
    statuses: Object.fromEntries([...byStatus.entries()].sort((a, b) => a[0] - b[0])),
    latencyMs: {
      avg: latencies.length ? Number((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2)) : 0,
      p50: Number(pct(latencies, 50).toFixed(2)),
      p95: Number(pct(latencies, 95).toFixed(2)),
      p99: Number(pct(latencies, 99).toFixed(2)),
      max: Number((latencies[latencies.length - 1] || 0).toFixed(2)),
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
