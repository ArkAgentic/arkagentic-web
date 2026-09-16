import Redis from "ioredis";

const WINDOW_SECONDS = 60;
const REQUESTS_PER_MINUTE_LIMIT = 1000;
const CONCURRENCY_LIMIT = 100;

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtEpochSeconds: number;
  retryAfterSeconds: number;
};

type ConcurrencyLimitResult = {
  allowed: boolean;
  limit: number;
  current: number;
  retryAfterSeconds: number;
  release: () => Promise<void>;
};

type UpstreamQueueSlotResult = {
  acquired: boolean;
  current: number;
  timedOut: boolean;
  release: () => Promise<void>;
};

let redisClient: Redis | null | undefined;

function resolveRedisClient(): Redis | null {
  if (redisClient !== undefined) return redisClient;

  const host = process.env.REDIS_HOST;
  const port = Number(process.env.REDIS_PORT || 0);
  const password = process.env.REDIS_KEY;

  if (!host || !port || !password) {
    redisClient = null;
    return redisClient;
  }

  redisClient = new Redis({
    host,
    port,
    password,
    tls: {},
    enableReadyCheck: true,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });

  redisClient.on("error", () => {
    // fail open for transient redis issues
  });

  return redisClient;
}

async function ensureRedisConnected(redis: Redis): Promise<boolean> {
  try {
    if (redis.status === "wait") {
      await redis.connect();
    }
    return true;
  } catch {
    return false;
  }
}

async function decrementCounter(redis: Redis | null, key: string): Promise<void> {
  if (!redis) return;
  try {
    const after = Number(await redis.decr(key));
    if (after <= 0) await redis.del(key);
  } catch {
    // best effort cleanup
  }
}

export async function enforceSlidingWindowRateLimit(input: {
  apiKeyId: string;
}): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - WINDOW_SECONDS * 1000;
  const windowEnd = now + WINDOW_SECONDS * 1000;
  const limit = REQUESTS_PER_MINUTE_LIMIT;

  const fallbackAllowed: RateLimitResult = {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - 1),
    resetAtEpochSeconds: Math.floor((now + WINDOW_SECONDS * 1000) / 1000),
    retryAfterSeconds: 0,
  };

  const redis = resolveRedisClient();
  if (!redis) return fallbackAllowed;

  const connected = await ensureRedisConnected(redis);
  if (!connected) return fallbackAllowed;

  const key = `ratelimit:${input.apiKeyId}`;
  const member = `${now}:${Math.random().toString(36).slice(2, 10)}`;

  try {
    const tx = redis.multi();
    tx.zremrangebyscore(key, 0, windowStart);
    tx.zadd(key, now, member);
    tx.zcard(key);
    tx.expire(key, WINDOW_SECONDS + 5);
    const response = await tx.exec();

    const count = Number(response?.[2]?.[1] ?? 0);
    const remaining = Math.max(0, limit - count);
    const allowed = count <= limit;

    if (allowed) {
      return {
        allowed,
        limit,
        remaining,
        resetAtEpochSeconds: Math.floor((now + WINDOW_SECONDS * 1000) / 1000),
        retryAfterSeconds: 0,
      };
    }

    const oldest = await redis.zrangebyscore(key, windowStart, windowEnd, "WITHSCORES", "LIMIT", 0, 1);
    const oldestTs = Number(oldest?.[1] ?? now);
    const retryAfterMs = Math.max(1000, oldestTs + WINDOW_SECONDS * 1000 - now);
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAtEpochSeconds: Math.floor((now + retryAfterMs) / 1000),
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  } catch {
    return fallbackAllowed;
  }
}

export async function acquireApiKeyConcurrencySlot(input: {
  apiKeyId: string;
}): Promise<ConcurrencyLimitResult> {
  const limit = CONCURRENCY_LIMIT;
  const redis = resolveRedisClient();
  const noOpRelease = async () => {};

  if (!redis) {
    return {
      allowed: true,
      limit,
      current: 1,
      retryAfterSeconds: 0,
      release: noOpRelease,
    };
  }

  const connected = await ensureRedisConnected(redis);
  if (!connected) {
    return {
      allowed: true,
      limit,
      current: 1,
      retryAfterSeconds: 0,
      release: noOpRelease,
    };
  }

  const key = `concurrency:${input.apiKeyId}`;

  try {
    const current = Number(await redis.incr(key));
    await redis.expire(key, 120);

    if (current > limit) {
      await decrementCounter(redis, key);
      return {
        allowed: false,
        limit,
        current,
        retryAfterSeconds: 1,
        release: noOpRelease,
      };
    }

    let released = false;
    const release = async () => {
      if (released) return;
      released = true;
      await decrementCounter(redis, key);
    };

    return {
      allowed: true,
      limit,
      current,
      retryAfterSeconds: 0,
      release,
    };
  } catch {
    return {
      allowed: true,
      limit,
      current: 1,
      retryAfterSeconds: 0,
      release: noOpRelease,
    };
  }
}

export async function acquireUpstreamQueueSlot(input: {
  provider: "azure" | "openai" | "generic";
  maxInflight: number;
  waitTimeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<UpstreamQueueSlotResult> {
  const redis = resolveRedisClient();
  const noOpRelease = async () => {};
  const waitTimeoutMs = Math.max(250, Number(input.waitTimeoutMs ?? 3000));
  const pollIntervalMs = Math.max(20, Number(input.pollIntervalMs ?? 60));

  if (!redis) return { acquired: true, current: 0, timedOut: false, release: noOpRelease };

  const connected = await ensureRedisConnected(redis);
  if (!connected) return { acquired: true, current: 0, timedOut: false, release: noOpRelease };

  const key = `upstream:inflight:${input.provider}`;
  const deadline = Date.now() + waitTimeoutMs;

  while (Date.now() <= deadline) {
    try {
      const current = Number(await redis.incr(key));
      await redis.expire(key, 30);

      if (current <= input.maxInflight) {
        let released = false;
        const release = async () => {
          if (released) return;
          released = true;
          await decrementCounter(redis, key);
        };

        return {
          acquired: true,
          current,
          timedOut: false,
          release,
        };
      }

      await decrementCounter(redis, key);
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    } catch {
      return { acquired: true, current: 0, timedOut: false, release: noOpRelease };
    }
  }

  return { acquired: false, current: input.maxInflight, timedOut: true, release: noOpRelease };
}
