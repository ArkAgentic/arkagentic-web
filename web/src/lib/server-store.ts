import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import type { Pool } from "pg";
import { calculateTieredCost } from "./pricing-engine";
import { modelPricingTable } from "./pricing-schema";
import { getRuntimePricing, getRuntimePricingMap } from "./model-pricing-store";
import { getActiveModelIdSet, getActiveModelMetadataMap } from "./upstream-store";
import { decryptApiKey, encryptApiKey } from "./upstream-crypto";

type UserRecord = {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  role: "user" | "admin";
  status: "active" | "disabled";
  balanceUsd: number;
  totalDepositedUsd: number;
  gatewayLocked?: boolean;
  gatewayLockReason?: string | null;
  createdAt: string;
};

type ApiKeyRecord = {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  rawKey?: string;
  quotaLimit: number;
  spendLimitUsd: number | null;
  usedAmountUsd?: number;
  lastUsedAt?: string;
  status: "active" | "disabled";
  createdAt?: string;
};

type ApiLogRecord = {
  id: string;
  userId: string;
  apiKeyId: string;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  chargedUsd: number;
  netProfitUsd: number;
  statusCode: number;
  createdAt: string;
};

type BillingReservationRecord = {
  id: string;
  userId: string;
  apiKeyId: string;
  modelId: string;
  reservedUsd: number;
  status: "reserved" | "settled" | "released";
  settledUsd?: number;
  releasedUsd?: number;
  createdAt: string;
  settledAt?: string;
};

type PasswordResetTokenRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
  requestedIp: string | null;
  requestedUa: string | null;
  createdAt: string;
};

type EmailVerificationTokenRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
  requestedIp: string | null;
  requestedUa: string | null;
  createdAt: string;
};

type AdminDashboard = {
  kpi: {
    totalUsers: number;
    grossDepositsUsd: number;
    totalUserBalanceUsd: number;
    cumulativeNetProfitUsd: number;
  };
  users: Array<{
    userId: string;
    email: string;
    registeredAt: string;
    totalDepositedUsd: number;
    currentBalanceUsd: number;
      status: "active" | "disabled";
  }>;
  keyRecords: Array<{
    userId: string;
    keyPrefix: string;
    quotaLimit: number;
    status: "active" | "disabled";
  }>;
  usageLogs: Array<{
    id: string;
    userId: string;
    modelId: string;
    totalTokens: number;
    customerChargeUsd: number;
    netProfitUsd: number;
    timestamp: string;
  }>;
};

const DEMO_FOUNDER_KEY = "sk-ark-demo-founder-0000000000000000";

const mem = {
  users: new Map<string, UserRecord>(),
  apiKeys: new Map<string, ApiKeyRecord>(),
  apiLogs: [] as ApiLogRecord[],
  reservations: new Map<string, BillingReservationRecord>(),
  passwordHashes: new Map<string, string>(),
  passwordResetTokens: new Map<string, PasswordResetTokenRecord>(),
  emailVerificationTokens: new Map<string, EmailVerificationTokenRecord>(),
};

let pgPool: Pool | null | undefined;
let pgInitialized = false;

async function ensurePostgresSchema(pool: Pool) {
  if (pgInitialized) return;

  await pool.query(`
    create table if not exists users (
      id varchar(64) primary key,
      email varchar(320) unique not null,
      name varchar(160) not null default '',
      phone varchar(32),
      password_hash varchar(255),
      role varchar(16) not null default 'user',
      status varchar(16) not null default 'active',
      balance_usd decimal(18,6) not null default 0,
      total_deposited_usd decimal(18,6) not null default 0,
      gateway_locked boolean not null default false,
      gateway_lock_reason varchar(64),
      gateway_locked_at timestamptz,
      created_at timestamptz not null default now()
    );

    create table if not exists api_keys (
      id varchar(64) primary key,
      user_id varchar(64) not null references users(id) on delete cascade,
      display_name varchar(120) not null default 'API Key',
      key_hash varchar(128) not null unique,
      key_prefix varchar(32) not null,
      key_encrypted text,
      quota_limit bigint not null default 0,
      spend_limit_usd decimal(18,6),
      status varchar(16) not null default 'active',
      created_at timestamptz not null default now()
    );

    create table if not exists api_logs (
      id uuid primary key,
      user_id varchar(64) not null references users(id) on delete cascade,
      api_key_id varchar(64) not null references api_keys(id) on delete cascade,
      model_id varchar(120) not null,
      prompt_tokens integer not null default 0,
      completion_tokens integer not null default 0,
      cost_usd decimal(18,6) not null default 0,
      charged_usd decimal(18,6) not null default 0,
      net_profit_usd decimal(18,6) not null default 0,
      status_code integer not null default 200,
      created_at timestamptz not null default now()
    );

    create table if not exists usage_logs (
      id uuid primary key,
      user_id varchar(64) not null references users(id) on delete cascade,
      api_key_id varchar(64) references api_keys(id) on delete set null,
      model varchar(120) not null,
      prompt_tokens integer not null default 0,
      completion_tokens integer not null default 0,
      cost_usd decimal(18,6) not null default 0,
      created_at timestamptz not null default now()
    );

    create table if not exists transactions (
      id uuid primary key,
      user_id varchar(64) not null references users(id) on delete cascade,
      stripe_id varchar(120),
      amount_usd decimal(18,6) not null,
      amount_paid_usd decimal(18,6),
      amount_credited_usd decimal(18,6),
      bonus_usd decimal(18,6),
      kind varchar(16) not null default 'deposit',
      created_at timestamptz not null default now()
    );

    create table if not exists billing_reservations (
      id uuid primary key,
      user_id varchar(64) not null references users(id) on delete cascade,
      api_key_id varchar(64) not null references api_keys(id) on delete cascade,
      model_id varchar(120) not null,
      reserved_usd decimal(18,6) not null,
      settled_usd decimal(18,6) not null default 0,
      released_usd decimal(18,6) not null default 0,
      status varchar(16) not null default 'reserved',
      created_at timestamptz not null default now(),
      settled_at timestamptz,
      updated_at timestamptz not null default now()
    );

    create index if not exists idx_api_keys_user_id on api_keys(user_id);
    create index if not exists idx_api_logs_user_id_created_at on api_logs(user_id, created_at desc);
    create index if not exists idx_usage_logs_user_id_created_at on usage_logs(user_id, created_at desc);
    create index if not exists idx_transactions_user_id_created_at on transactions(user_id, created_at desc);
    create index if not exists idx_billing_reservations_user_status on billing_reservations(user_id, status, created_at desc);

    alter table if exists users add column if not exists phone varchar(32);
    alter table if exists users add column if not exists password_hash varchar(255);
    alter table if exists users add column if not exists email_verified boolean not null default false;
    alter table if exists users add column if not exists gateway_locked boolean not null default false;
    alter table if exists users add column if not exists gateway_lock_reason varchar(64);
    alter table if exists users add column if not exists gateway_locked_at timestamptz;
    alter table if exists api_keys add column if not exists display_name varchar(120) not null default 'API Key';
    alter table if exists api_keys add column if not exists key_encrypted text;
    alter table if exists api_keys add column if not exists spend_limit_usd decimal(18,6);
    alter table if exists transactions add column if not exists payment_method varchar(32) not null default 'stripe';
    alter table if exists transactions add column if not exists status varchar(16) not null default 'success';
    alter table if exists transactions add column if not exists amount_paid_usd decimal(18,6);
    alter table if exists transactions add column if not exists amount_credited_usd decimal(18,6);
    alter table if exists transactions add column if not exists bonus_usd decimal(18,6);

    alter table if exists billing_reservations add column if not exists settled_usd decimal(18,6) not null default 0;
    alter table if exists billing_reservations add column if not exists released_usd decimal(18,6) not null default 0;
    alter table if exists billing_reservations add column if not exists status varchar(16) not null default 'reserved';
    alter table if exists billing_reservations add column if not exists settled_at timestamptz;
    alter table if exists billing_reservations add column if not exists updated_at timestamptz not null default now();

    create table if not exists redeem_codes (
      id uuid primary key,
      code_hash varchar(128) unique not null,
      amount_usd decimal(18,6) not null,
      status varchar(16) not null default 'active',
      expires_at timestamptz,
      redeemed_by_user_id varchar(64) references users(id) on delete set null,
      redeemed_at timestamptz,
      created_at timestamptz not null default now()
    );

    create table if not exists password_reset_tokens (
      id uuid primary key,
      user_id varchar(64) not null references users(id) on delete cascade,
      token_hash varchar(128) unique not null,
      expires_at timestamptz not null,
      used_at timestamptz,
      requested_ip varchar(64),
      requested_ua text,
      created_at timestamptz not null default now()
    );

    create table if not exists email_verification_tokens (
      id uuid primary key,
      user_id varchar(64) not null references users(id) on delete cascade,
      token_hash varchar(128) unique not null,
      expires_at timestamptz not null,
      used_at timestamptz,
      requested_ip varchar(64),
      requested_ua text,
      created_at timestamptz not null default now()
    );

    create index if not exists idx_redeem_codes_status on redeem_codes(status);
    create index if not exists idx_password_reset_tokens_user_id on password_reset_tokens(user_id);
    create index if not exists idx_password_reset_tokens_expires_at on password_reset_tokens(expires_at);
    create index if not exists idx_email_verification_tokens_user_id on email_verification_tokens(user_id);
    create index if not exists idx_email_verification_tokens_expires_at on email_verification_tokens(expires_at);
  `);

  pgInitialized = true;
}

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function hashPassword(raw: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(raw, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(raw: string, storedHash: string): boolean {
  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, derivedHex] = parts;
  const recomputed = scryptSync(raw, salt, 64);
  const expected = Buffer.from(derivedHex, "hex");
  if (expected.length !== recomputed.length) return false;
  return timingSafeEqual(expected, recomputed);
}

function toFixed6(value: number): number {
  return Number(value.toFixed(6));
}

function createBalanceDepletedError(message: string): Error & { code: string; httpStatus: number } {
  const error = new Error(message) as Error & { code: string; httpStatus: number };
  error.code = "balance_depleted";
  error.httpStatus = 402;
  return error;
}

function ensureMemorySeed() {
  if (mem.users.size > 0) return;

  const founder: UserRecord = {
    id: "usr_founder01",
    email: (process.env.FOUNDER_ADMIN_EMAIL || "charles.zhang@arkagentic.com").toLowerCase(),
    name: "Founder",
    role: "admin",
    status: "active",
    balanceUsd: 500,
    totalDepositedUsd: 500,
    createdAt: "2026-07-01T00:00:00Z",
  };

  const user: UserRecord = {
    id: "usr_demo02",
    email: "user@example.com",
    name: "Demo User",
    role: "user",
    status: "active",
    balanceUsd: 42,
    totalDepositedUsd: 42,
    createdAt: "2026-07-10T00:00:00Z",
  };

  mem.users.set(founder.id, founder);
  mem.users.set(user.id, user);

  const founderKey: ApiKeyRecord = {
    id: "key_founder01",
    userId: founder.id,
    name: "Founder Production",
    keyHash: hashKey(DEMO_FOUNDER_KEY),
    keyPrefix: `${DEMO_FOUNDER_KEY.slice(0, 11)}...`,
    quotaLimit: 5_000_000,
    spendLimitUsd: null,
    status: "active",
  };

  const demoKeyRaw = "sk-ark-demo-user-0000000000000000000000";
  const demoKey: ApiKeyRecord = {
    id: "key_demo02",
    userId: user.id,
    name: "Demo Sandbox",
    keyHash: hashKey(demoKeyRaw),
    keyPrefix: `${demoKeyRaw.slice(0, 11)}...`,
    quotaLimit: 1_000_000,
    spendLimitUsd: 50,
    status: "active",
  };

  mem.apiKeys.set(founderKey.id, founderKey);
  mem.apiKeys.set(demoKey.id, demoKey);
}

async function getPool(): Promise<Pool | null> {
  if (pgPool !== undefined) {
    if (pgPool) await ensurePostgresSchema(pgPool);
    return pgPool;
  }
  if (!process.env.DATABASE_URL) {
    pgPool = null;
    return pgPool;
  }

  const { Pool: PgPool } = await import("pg");
  pgPool = new PgPool({ connectionString: process.env.DATABASE_URL });
  await ensurePostgresSchema(pgPool);
  return pgPool;
}

export function getDemoFounderApiKeyForTesting() {
  return DEMO_FOUNDER_KEY;
}

export async function upsertAuthenticatedUser(input: {
  userId: string;
  email: string;
  name?: string;
  role: "user" | "admin";
}) {
  const pool = await getPool();
  if (!pool) {
    ensureMemorySeed();
    const existing = mem.users.get(input.userId);
    if (existing) {
      existing.email = input.email.toLowerCase();
      existing.role = input.role;
      if (input.name) existing.name = input.name;
      return existing;
    }

    const created: UserRecord = {
      id: input.userId,
      email: input.email.toLowerCase(),
      name: input.name || input.email,
      role: input.role,
      status: "active",
      balanceUsd: 0,
      totalDepositedUsd: 0,
      createdAt: new Date().toISOString(),
    };
    mem.users.set(created.id, created);
    return created;
  }

  const sql = `
    insert into users(id, email, name, role, status, balance_usd, total_deposited_usd)
    values ($1, lower($2), $3, $4, 'active', 0, 0)
    on conflict (id) do update
      set email = lower(excluded.email),
          name = excluded.name,
          role = excluded.role
    returning
      id,
      email,
      name,
      role,
      status,
      coalesce(balance_usd,0)::float8 as balance_usd,
      coalesce(total_deposited_usd,0)::float8 as total_deposited_usd
      created_at
  `;

  const res = await pool.query(sql, [input.userId, input.email, input.name || input.email, input.role]);
  const row = res.rows[0];
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    balanceUsd: Number(row.balance_usd),
    totalDepositedUsd: Number(row.total_deposited_usd),
    createdAt: new Date(row.created_at).toISOString(),
  } satisfies UserRecord;
}

export async function registerUserWithPassword(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<UserRecord> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Invalid email");
  if (input.password.length < 8) throw new Error("Password must be at least 8 characters");
  const userId = `usr_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const name = (input.name || email.split("@")[0]).trim();
  const passwordHash = hashPassword(input.password);
  const role: "user" | "admin" = "user";

  const pool = await getPool();
  if (pool) {
    const res = await pool.query(
      `insert into users(id, email, name, role, status, balance_usd, total_deposited_usd, password_hash, email_verified)
       values ($1, $2, $3, $4, 'active', 0, 0, $5, false)
       returning id,email,name,role,status,
                 coalesce(balance_usd,0)::float8 as balance_usd,
                 coalesce(total_deposited_usd,0)::float8 as total_deposited_usd
                 created_at`,
      [userId, email, name, role, passwordHash],
    );
    const row = res.rows[0];
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      status: row.status,
      balanceUsd: Number(row.balance_usd),
      totalDepositedUsd: Number(row.total_deposited_usd),
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  ensureMemorySeed();
  for (const user of mem.users.values()) {
    if (user.email.toLowerCase() === email) throw new Error("Email already in use");
  }
  const user: UserRecord = {
    id: userId,
    email,
    name,
    role,
    status: "active",
    balanceUsd: 0,
    totalDepositedUsd: 0,
    createdAt: new Date().toISOString(),
  };
  mem.users.set(user.id, user);
  mem.passwordHashes.set(user.id, passwordHash);
  return user;
}

export async function authenticateUserWithPassword(input: {
  email: string;
  password: string;
}): Promise<UserRecord | null> {
  const email = input.email.trim().toLowerCase();
  const pool = await getPool();

  if (pool) {
    const res = await pool.query(
      `select id,email,name,coalesce(role,'user') as role,coalesce(status,'active') as status,
              coalesce(balance_usd,0)::float8 as balance_usd,
              coalesce(total_deposited_usd,0)::float8 as total_deposited_usd,
              coalesce(password_hash,'') as password_hash,
              created_at
       from users
       where lower(email)=$1
       limit 1`,
      [email],
    );
    const row = res.rows[0];
    if (!row) return null;
    if (!row.password_hash || !verifyPassword(input.password, row.password_hash)) return null;
    if (row.status !== "active") return null;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      status: row.status,
      balanceUsd: Number(row.balance_usd),
      totalDepositedUsd: Number(row.total_deposited_usd),
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  ensureMemorySeed();
  const user = [...mem.users.values()].find((item) => item.email.toLowerCase() === email);
  if (!user) return null;
  const stored = mem.passwordHashes.get(user.id);
  if (!stored) return null;
  if (!verifyPassword(input.password, stored)) return null;
  if (user.status !== "active") return null;
  return user;
}

export async function getSessionUserById(userId: string): Promise<{
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  status: "active" | "disabled";
  balanceUsd: number;
} | null> {
  const pool = await getPool();

  if (pool) {
    const res = await pool.query(
      `select id,email,name,coalesce(role,'user') as role,coalesce(status,'active') as status,
              coalesce(balance_usd,0)::float8 as balance_usd
       from users
       where id=$1
       limit 1`,
      [userId],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      status: row.status,
      balanceUsd: Number(row.balance_usd),
    };
  }

  ensureMemorySeed();
  const user = mem.users.get(userId);
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    balanceUsd: user.balanceUsd,
  };
}

export async function listUserApiKeys(userId: string): Promise<ApiKeyRecord[]> {
  const pool = await getPool();
  if (pool) {
    const res = await pool.query(
      `select
         k.id,
         k.user_id,
         coalesce(k.display_name, 'API Key') as display_name,
         k.key_hash,
         k.key_prefix,
         k.key_encrypted,
         coalesce(k.quota_limit,0)::bigint as quota_limit,
         k.spend_limit_usd::float8 as spend_limit_usd,
         coalesce(k.status,'active') as status,
         k.created_at,
         max(l.created_at) as last_used_at,
         coalesce(sum(l.charged_usd),0)::float8 as used_amount_usd
       from api_keys k
       left join api_logs l on l.api_key_id = k.id
       where k.user_id=$1
       group by k.id, k.user_id, k.display_name, k.key_hash, k.key_prefix, k.key_encrypted, k.quota_limit, k.spend_limit_usd, k.status, k.created_at
       order by k.created_at desc`,
      [userId],
    );
    return res.rows.map((row) => {
      let rawKey: string | undefined;
      if (row.key_encrypted) {
        try {
          rawKey = decryptApiKey(String(row.key_encrypted));
        } catch {
          rawKey = undefined;
        }
      }
      return {
      id: row.id,
      userId: row.user_id,
      name: row.display_name,
      keyHash: row.key_hash,
      keyPrefix: row.key_prefix,
      rawKey,
      quotaLimit: Number(row.quota_limit ?? 0),
      spendLimitUsd: row.spend_limit_usd == null ? null : Number(row.spend_limit_usd),
      status: row.status,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : undefined,
      usedAmountUsd: Number(row.used_amount_usd ?? 0),
      } as ApiKeyRecord & { lastUsedAt?: string; usedAmountUsd?: number };
    });
  }

  ensureMemorySeed();
  return [...mem.apiKeys.values()].filter((item) => item.userId === userId);
}

export const MAX_ACTIVE_API_KEYS = 5;

export class ApiKeyLimitError extends Error {
  constructor(message = "API key limit reached") {
    super(message);
    this.name = "ApiKeyLimitError";
  }
}

export class ApiKeySpendLimitValidationError extends Error {
  constructor(message = "Spend limit cannot be lower than used amount") {
    super(message);
    this.name = "ApiKeySpendLimitValidationError";
  }
}

export class ApiKeySpendLimitFormatError extends Error {
  constructor(message = "Spend limit must be a valid number") {
    super(message);
    this.name = "ApiKeySpendLimitFormatError";
  }
}

export async function createUserApiKey(
  userId: string,
  options?: { name?: string; spendLimitUsd?: number | null; quotaLimit?: number },
): Promise<{ rawKey: string; record: ApiKeyRecord }> {
  const rawKey = `sk-ark-${randomUUID().replace(/-/g, "")}`;
  const keyHash = hashKey(rawKey);
  const keyId = `key_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const keyPrefix = `${rawKey.slice(0, 11)}...`;
  const quotaLimit = Math.max(0, Math.floor(Number(options?.quotaLimit ?? 1_000_000)));
  const spendLimitUsdRaw = options?.spendLimitUsd;
  if (spendLimitUsdRaw != null && Number.isNaN(Number(spendLimitUsdRaw))) {
    throw new ApiKeySpendLimitFormatError("Spend limit must be a valid number");
  }
  const normalizedSpendLimit = spendLimitUsdRaw == null ? null : Math.max(0, Number(spendLimitUsdRaw));
  const spendLimitUsd = normalizedSpendLimit == null || normalizedSpendLimit <= 0 ? null : normalizedSpendLimit;
  const displayName = String(options?.name || "API Key").trim() || "API Key";

  const pool = await getPool();
  if (pool) {
    await getOrCreateUserById(userId);

    const keyCountRes = await pool.query(
      `select count(*)::bigint as key_count
       from api_keys
       where user_id=$1`,
      [userId],
    );
    const keyCount = Number(keyCountRes.rows[0]?.key_count ?? 0);
    if (keyCount >= MAX_ACTIVE_API_KEYS) {
      throw new ApiKeyLimitError(`API key limit reached (${MAX_ACTIVE_API_KEYS}/${MAX_ACTIVE_API_KEYS})`);
    }

    const res = await pool.query(
      `insert into api_keys(id,user_id,display_name,key_hash,key_prefix,key_encrypted,quota_limit,spend_limit_usd,status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'active')
       returning id,user_id,coalesce(display_name,'API Key') as display_name,key_hash,key_prefix,
                 key_encrypted,
                 coalesce(quota_limit,0)::bigint as quota_limit,
                 spend_limit_usd::float8 as spend_limit_usd,
                 coalesce(status,'active') as status`,
      [keyId, userId, displayName, keyHash, keyPrefix, encryptApiKey(rawKey), quotaLimit, spendLimitUsd],
    );
    const row = res.rows[0];
    return {
      rawKey,
      record: {
        id: row.id,
        userId: row.user_id,
        name: row.display_name,
        keyHash: row.key_hash,
        keyPrefix: row.key_prefix,
        rawKey,
        quotaLimit: Number(row.quota_limit ?? 0),
        spendLimitUsd: row.spend_limit_usd == null ? null : Number(row.spend_limit_usd),
        status: row.status,
      },
    };
  }

  ensureMemorySeed();
  await getOrCreateUserById(userId);
  const keyCount = [...mem.apiKeys.values()].filter((item) => item.userId === userId).length;
  if (keyCount >= MAX_ACTIVE_API_KEYS) {
    throw new ApiKeyLimitError(`API key limit reached (${MAX_ACTIVE_API_KEYS}/${MAX_ACTIVE_API_KEYS})`);
  }

  const record: ApiKeyRecord = {
    id: keyId,
    userId,
    name: displayName,
    keyHash,
    keyPrefix,
    rawKey,
    quotaLimit,
    spendLimitUsd,
    status: "active",
  };
  mem.apiKeys.set(record.id, record);
  return { rawKey, record };
}

export async function toggleUserApiKey(userId: string, keyId: string): Promise<ApiKeyRecord[]> {
  const pool = await getPool();
  if (pool) {
    await pool.query(
      `update api_keys
       set status = case when coalesce(status,'active')='active' then 'disabled' else 'active' end
       where id=$1 and user_id=$2`,
      [keyId, userId],
    );
    return listUserApiKeys(userId);
  }

  ensureMemorySeed();
  const key = mem.apiKeys.get(keyId);
  if (key && key.userId === userId) {
    key.status = key.status === "active" ? "disabled" : "active";
  }
  return listUserApiKeys(userId);
}

export async function updateUserApiKey(
  userId: string,
  keyId: string,
  input: { name?: string; spendLimitUsd?: number | null; quotaLimit?: number },
): Promise<ApiKeyRecord[]> {
  const pool = await getPool();
  if (pool) {
    const usageRes = await pool.query(
      `select coalesce(sum(charged_usd),0)::float8 as used_amount_usd
       from api_logs
       where user_id=$1 and api_key_id=$2`,
      [userId, keyId],
    );
    const usedAmountUsd = Number(usageRes.rows[0]?.used_amount_usd ?? 0);

    if (input.spendLimitUsd !== undefined && input.spendLimitUsd !== null) {
      const normalized = Number(input.spendLimitUsd);
      if (Number.isNaN(normalized)) {
        throw new ApiKeySpendLimitFormatError("Spend limit must be a valid number");
      }
      if (normalized > 0 && normalized + 1e-9 < usedAmountUsd) {
        throw new ApiKeySpendLimitValidationError("Spend limit cannot be lower than used amount");
      }
    }

    const sets: string[] = [];
    const values: Array<string | number | null> = [keyId, userId];

    if (input.name !== undefined) {
      values.push(String(input.name || "").trim() || "API Key");
      sets.push(`display_name=$${values.length}`);
    }
    if (input.spendLimitUsd !== undefined) {
      const normalized = input.spendLimitUsd == null ? null : Number(input.spendLimitUsd);
      if (normalized != null && Number.isNaN(normalized)) {
        throw new ApiKeySpendLimitFormatError("Spend limit must be a valid number");
      }
      const v = normalized == null || Number.isNaN(normalized) || normalized <= 0 ? null : Math.max(0, normalized);
      values.push(v);
      sets.push(`spend_limit_usd=$${values.length}`);
    }
    if (input.quotaLimit !== undefined) {
      values.push(Math.max(0, Math.floor(Number(input.quotaLimit))));
      sets.push(`quota_limit=$${values.length}`);
    }

    if (sets.length > 0) {
      await pool.query(
        `update api_keys
         set ${sets.join(", ")}
         where id=$1 and user_id=$2`,
        values,
      );
    }

    return listUserApiKeys(userId);
  }

  ensureMemorySeed();
  const key = mem.apiKeys.get(keyId);
  if (key && key.userId === userId) {
    const usedAmountUsd = mem.apiLogs
      .filter((log) => log.userId === userId && log.apiKeyId === keyId)
      .reduce((sum, log) => sum + log.chargedUsd, 0);

    if (input.spendLimitUsd !== undefined && input.spendLimitUsd !== null) {
      const normalized = Number(input.spendLimitUsd);
      if (Number.isNaN(normalized)) {
        throw new ApiKeySpendLimitFormatError("Spend limit must be a valid number");
      }
      if (normalized > 0 && normalized + 1e-9 < usedAmountUsd) {
        throw new ApiKeySpendLimitValidationError("Spend limit cannot be lower than used amount");
      }
    }

    if (input.name !== undefined) key.name = String(input.name || "").trim() || "API Key";
    if (input.spendLimitUsd !== undefined) {
      const normalized = input.spendLimitUsd == null ? null : Number(input.spendLimitUsd);
      if (normalized != null && Number.isNaN(normalized)) {
        throw new ApiKeySpendLimitFormatError("Spend limit must be a valid number");
      }
      key.spendLimitUsd = normalized == null || Number.isNaN(normalized) || normalized <= 0 ? null : Math.max(0, normalized);
    }
    if (input.quotaLimit !== undefined) key.quotaLimit = Math.max(0, Math.floor(Number(input.quotaLimit)));
  }
  return listUserApiKeys(userId);
}

export async function deleteUserApiKey(userId: string, keyId: string): Promise<ApiKeyRecord[]> {
  const pool = await getPool();
  if (pool) {
    await pool.query(`delete from api_keys where id=$1 and user_id=$2`, [keyId, userId]);
    return listUserApiKeys(userId);
  }

  ensureMemorySeed();
  const key = mem.apiKeys.get(keyId);
  if (key && key.userId === userId) mem.apiKeys.delete(keyId);
  return listUserApiKeys(userId);
}

export async function resolveApiKey(rawToken: string): Promise<{
  apiKeyId: string;
  keyPrefix: string;
  user: UserRecord;
} | null> {
  const pool = await getPool();
  const keyHash = hashKey(rawToken);

  if (pool) {
    const sql = `
      select
        k.id as api_key_id,
        k.key_prefix,
        k.status as key_status,
        u.id as user_id,
        u.email,
        u.name,
        coalesce(u.role, 'user') as role,
        coalesce(u.status, 'active') as user_status,
        coalesce(u.balance_usd, 0)::float8 as balance_usd,
        coalesce(u.total_deposited_usd, 0)::float8 as total_deposited_usd,
        coalesce(u.gateway_locked, false) as gateway_locked,
        u.gateway_lock_reason,
        u.created_at
      from api_keys k
      join users u on u.id = k.user_id
      where k.key_hash = $1
      limit 1
    `;
    const res = await pool.query(sql, [keyHash]);
    const row = res.rows[0];
    if (!row) return null;
    if (row.key_status !== "active" || row.user_status !== "active") return null;

    return {
      apiKeyId: row.api_key_id,
      keyPrefix: row.key_prefix,
      user: {
        id: row.user_id,
        email: row.email,
        name: row.name,
        role: row.role,
        status: row.user_status,
        balanceUsd: Number(row.balance_usd),
        totalDepositedUsd: Number(row.total_deposited_usd),
        gatewayLocked: Boolean(row.gateway_locked),
        gatewayLockReason: row.gateway_lock_reason,
        createdAt: new Date(row.created_at).toISOString(),
      },
    };
  }

  ensureMemorySeed();
  const key = [...mem.apiKeys.values()].find((item) => item.keyHash === keyHash && item.status === "active");
  if (!key) return null;
  const user = mem.users.get(key.userId);
  if (!user || user.status !== "active") return null;
  return {
    apiKeyId: key.id,
    keyPrefix: key.keyPrefix,
    user,
  };
}

export async function getApiKeyUsageGuard(apiKeyId: string, userId: string): Promise<{
  quotaLimit: number;
  spendLimitUsd: number | null;
  monthTokens: number;
  monthSpendUsd: number;
} | null> {
  const pool = await getPool();

  if (pool) {
    const keyRes = await pool.query(
      `select coalesce(quota_limit,0)::bigint as quota_limit,
              spend_limit_usd::float8 as spend_limit_usd
       from api_keys
       where id=$1 and user_id=$2 and coalesce(status,'active')='active'
       limit 1`,
      [apiKeyId, userId],
    );
    const keyRow = keyRes.rows[0];
    if (!keyRow) return null;

    const usageRes = await pool.query(
      `select coalesce(sum(prompt_tokens + completion_tokens),0)::bigint as month_tokens,
              coalesce(sum(charged_usd),0)::float8 as month_spend_usd
       from api_logs
       where user_id=$1
         and api_key_id=$2
         and created_at >= date_trunc('month', now())`,
      [userId, apiKeyId],
    );
    const usageRow = usageRes.rows[0] || {};

    return {
      quotaLimit: Number(keyRow.quota_limit ?? 0),
      spendLimitUsd: keyRow.spend_limit_usd == null ? null : Number(keyRow.spend_limit_usd),
      monthTokens: Number(usageRow.month_tokens ?? 0),
      monthSpendUsd: Number(usageRow.month_spend_usd ?? 0),
    };
  }

  ensureMemorySeed();
  const key = mem.apiKeys.get(apiKeyId);
  if (!key || key.userId !== userId || key.status !== "active") return null;

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthLogs = mem.apiLogs.filter(
    (log) => log.userId === userId && log.apiKeyId === apiKeyId && new Date(log.createdAt).getTime() >= monthStart.getTime(),
  );

  return {
    quotaLimit: key.quotaLimit,
    spendLimitUsd: key.spendLimitUsd,
    monthTokens: monthLogs.reduce((sum, log) => sum + log.promptTokens + log.completionTokens, 0),
    monthSpendUsd: monthLogs.reduce((sum, log) => sum + log.chargedUsd, 0),
  };
}

export async function getCurrentUserBalance(userId: string): Promise<{ balanceUsd: number; gatewayLocked: boolean; gatewayLockReason: string | null }> {
  const pool = await getPool();
  if (pool) {
    const res = await pool.query(
      `select coalesce(balance_usd,0)::float8 as balance_usd,
              coalesce(gateway_locked,false) as gateway_locked,
              gateway_lock_reason
       from users where id=$1 limit 1`,
      [userId],
    );
    const row = res.rows[0];
    if (!row) return { balanceUsd: 0, gatewayLocked: false, gatewayLockReason: null };
    return {
      balanceUsd: Number(row.balance_usd ?? 0),
      gatewayLocked: Boolean(row.gateway_locked),
      gatewayLockReason: row.gateway_lock_reason ?? null,
    };
  }

  ensureMemorySeed();
  const user = mem.users.get(userId);
  return {
    balanceUsd: Number(user?.balanceUsd ?? 0),
    gatewayLocked: Boolean(user?.gatewayLocked),
    gatewayLockReason: user?.gatewayLockReason ?? null,
  };
}

export async function reserveQuotaHold(input: {
  userId: string;
  apiKeyId: string;
  modelId: string;
  reservedUsd: number;
}): Promise<{
  reservationId: string;
  reservedUsd: number;
  availableBalanceUsd: number;
  balanceUsd: number;
}> {
  const holdUsd = toFixed6(Math.max(0, input.reservedUsd));
  if (holdUsd <= 0) {
    throw new Error("reserveQuotaHold requires reservedUsd > 0");
  }

  const pool = await getPool();
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const userRes = await client.query(
        `select coalesce(balance_usd,0)::float8 as balance_usd,
                coalesce(gateway_locked,false) as gateway_locked,
                gateway_lock_reason
         from users where id=$1 for update`,
        [input.userId],
      );
      const row = userRes.rows[0];
      if (!row) throw new Error("User not found for reservation");
      if (Boolean(row.gateway_locked)) {
        throw createBalanceDepletedError("Gateway is locked for this user.");
      }

      const balanceUsd = Number(row.balance_usd ?? 0);
      if (balanceUsd <= 0 || balanceUsd - holdUsd < 0) {
        throw createBalanceDepletedError("Insufficient balance for reservation hold.");
      }

      const reservationId = randomUUID();
      await client.query(
        `insert into billing_reservations(
           id,user_id,api_key_id,model_id,reserved_usd,settled_usd,released_usd,status,created_at
         ) values ($1,$2,$3,$4,$5,0,0,'reserved',now())`,
        [reservationId, input.userId, input.apiKeyId, input.modelId, holdUsd],
      );

      const reservedRes = await client.query(
        `select coalesce(sum(reserved_usd - settled_usd - released_usd),0)::float8 as active_reserved
         from billing_reservations
         where user_id=$1 and status='reserved'`,
        [input.userId],
      );

      await client.query("commit");

      const activeReservedUsd = Number(reservedRes.rows[0]?.active_reserved ?? 0);
      return {
        reservationId,
        reservedUsd: holdUsd,
        balanceUsd,
        availableBalanceUsd: toFixed6(Math.max(0, balanceUsd - activeReservedUsd)),
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  ensureMemorySeed();
  const user = mem.users.get(input.userId);
  if (!user) throw new Error("User not found");
  if (user.gatewayLocked) throw createBalanceDepletedError("Gateway is locked for this user.");

  const activeReserved = [...mem.reservations.values()]
    .filter((item) => item.userId === input.userId && item.status === "reserved")
    .reduce((sum, item) => sum + Math.max(0, item.reservedUsd - (item.settledUsd ?? 0) - (item.releasedUsd ?? 0)), 0);

  const availableBefore = toFixed6(Math.max(0, user.balanceUsd - activeReserved));
  if (availableBefore - holdUsd < 0) {
    throw createBalanceDepletedError("Insufficient balance for reservation hold.");
  }

  const reservationId = randomUUID();
  mem.reservations.set(reservationId, {
    id: reservationId,
    userId: input.userId,
    apiKeyId: input.apiKeyId,
    modelId: input.modelId,
    reservedUsd: holdUsd,
    status: "reserved",
    settledUsd: 0,
    releasedUsd: 0,
    createdAt: new Date().toISOString(),
  });

  return {
    reservationId,
    reservedUsd: holdUsd,
    balanceUsd: user.balanceUsd,
    availableBalanceUsd: toFixed6(Math.max(0, availableBefore - holdUsd)),
  };
}

export async function releaseQuotaHold(input: { reservationId: string; settledUsd?: number }): Promise<void> {
  const reservationId = String(input.reservationId || "").trim();
  if (!reservationId) return;

  const settledUsd = toFixed6(Math.max(0, Number(input.settledUsd ?? 0)));

  const pool = await getPool();
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const res = await client.query(
        `select id,
                coalesce(reserved_usd,0)::float8 as reserved_usd,
                coalesce(status,'reserved') as status
         from billing_reservations
         where id=$1
         for update`,
        [reservationId],
      );
      const row = res.rows[0];
      if (!row) {
        await client.query("commit");
        return;
      }
      if (row.status !== "reserved") {
        await client.query("commit");
        return;
      }

      const reservedUsd = Number(row.reserved_usd ?? 0);
      const finalSettled = toFixed6(Math.min(reservedUsd, settledUsd));
      const finalReleased = toFixed6(Math.max(0, reservedUsd - finalSettled));
      const status = finalSettled > 0 ? "settled" : "released";

      await client.query(
        `update billing_reservations
           set settled_usd=$2,
               released_usd=$3,
               status=$4,
               settled_at=now(),
               updated_at=now()
         where id=$1`,
        [reservationId, finalSettled, finalReleased, status],
      );

      await client.query("commit");
      return;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  ensureMemorySeed();
  const reservation = mem.reservations.get(reservationId);
  if (!reservation || reservation.status !== "reserved") return;

  const reservedUsd = toFixed6(Math.max(0, reservation.reservedUsd));
  const finalSettled = toFixed6(Math.min(reservedUsd, settledUsd));
  reservation.settledUsd = finalSettled;
  reservation.releasedUsd = toFixed6(Math.max(0, reservedUsd - finalSettled));
  reservation.status = finalSettled > 0 ? "settled" : "released";
  reservation.settledAt = new Date().toISOString();
}

export async function chargeUsage(input: {
  userId: string;
  apiKeyId: string;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  statusCode: number;
  inputPricePer1k?: number;
  outputPricePer1k?: number;
  reservationId?: string;
}): Promise<{
  costUsd: number;
  chargedUsd: number;
  netProfitUsd: number;
  balanceUsd: number;
  gatewayLocked: boolean;
}> {
  const pool = await getPool();

  if (pool) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const userRes = await client.query(
        `select coalesce(balance_usd,0)::float8 as balance_usd,
                coalesce(total_deposited_usd,0)::float8 as total_deposited_usd,
         from users where id=$1 for update`,
        [input.userId],
      );
      const user = userRes.rows[0];
      if (!user) throw new Error("User not found for billing charge");

      const config = await getRuntimePricing(input.modelId);
      const inputCostPer1k = input.inputPricePer1k ?? config?.inputPricePer1k;
      const outputCostPer1k = input.outputPricePer1k ?? config?.outputPricePer1k;
      if (inputCostPer1k == null || outputCostPer1k == null) {
        throw new Error("DB pricing missing for billing charge");
      }

      const tiered = calculateTieredCost({
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
        totalDepositedUsd: Number(user.total_deposited_usd),
        inputCostPer1k,
        outputCostPer1k,
      });

      let reservationRow:
        | {
            id: string;
            reserved_usd: number;
            settled_usd: number;
            released_usd: number;
            status: "reserved" | "settled" | "released";
          }
        | undefined;

      if (input.reservationId) {
        const reservationRes = await client.query(
          `select id,
                  coalesce(reserved_usd,0)::float8 as reserved_usd,
                  coalesce(settled_usd,0)::float8 as settled_usd,
                  coalesce(released_usd,0)::float8 as released_usd,
                  coalesce(status,'reserved') as status
           from billing_reservations
           where id=$1 and user_id=$2 and api_key_id=$3 and model_id=$4
           for update`,
          [input.reservationId, input.userId, input.apiKeyId, input.modelId],
        );
        reservationRow = reservationRes.rows[0];
      }

      const hasActiveReservation = Boolean(
        reservationRow && reservationRow.status === "reserved" && Number(reservationRow.reserved_usd ?? 0) > 0,
      );

      let nextBalance = Number(user.balance_usd ?? 0);
      let shouldLock = false;

      if (hasActiveReservation && reservationRow) {
        const reservedUsd = Number(reservationRow.reserved_usd ?? 0);
        const finalChargeUsd = toFixed6(Math.max(0, tiered.userChargeUsd));
        const settleUsd = toFixed6(Math.min(reservedUsd, finalChargeUsd));
        const extraChargeUsd = toFixed6(Math.max(0, finalChargeUsd - reservedUsd));
        const releaseUsd = toFixed6(Math.max(0, reservedUsd - settleUsd));

        const rawNextBalance = Number(user.balance_usd ?? 0) - extraChargeUsd;
        shouldLock = rawNextBalance < 0;
        nextBalance = toFixed6(Math.max(0, rawNextBalance));

        await client.query(
          `update billing_reservations
             set settled_usd = $2,
                 released_usd = $3,
                 status = case when $2 > 0 then 'settled' else 'released' end,
                 settled_at = now(),
                 updated_at = now()
           where id = $1`,
          [reservationRow.id, settleUsd, releaseUsd],
        );
      } else {
        const rawNextBalance = Number(user.balance_usd) - tiered.userChargeUsd;
        shouldLock = rawNextBalance < 0;
        nextBalance = toFixed6(Math.max(0, rawNextBalance));
      }

      await client.query(
        `update users
           set balance_usd = $2,
               gateway_locked = case when $3 then true else coalesce(gateway_locked,false) end,
               gateway_lock_reason = case when $3 then 'negative_balance' else gateway_lock_reason end,
               gateway_locked_at = case when $3 then now() else gateway_locked_at end
         where id = $1`,
        [input.userId, nextBalance, shouldLock],
      );

      const usageId = randomUUID();
      await client.query(
        `insert into api_logs(
           id,user_id,api_key_id,model_id,prompt_tokens,completion_tokens,cost_usd,charged_usd,net_profit_usd,status_code,created_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())`,
        [
          usageId,
          input.userId,
          input.apiKeyId,
          input.modelId,
          input.promptTokens,
          input.completionTokens,
          tiered.upstreamCostUsd,
          tiered.userChargeUsd,
          tiered.netProfitUsd,
          input.statusCode,
        ],
      );

      await client.query(
        `insert into usage_logs(id,user_id,api_key_id,model,prompt_tokens,completion_tokens,cost_usd,created_at)
         values ($1,$2,$3,$4,$5,$6,$7,now())`,
        [
          usageId,
          input.userId,
          input.apiKeyId,
          input.modelId,
          input.promptTokens,
          input.completionTokens,
          tiered.userChargeUsd,
        ],
      );

      await client.query("commit");

      if (shouldLock) {
        throw createBalanceDepletedError("Balance depleted during charge; gateway locked.");
      }

      return {
        costUsd: tiered.upstreamCostUsd,
        chargedUsd: tiered.userChargeUsd,
        netProfitUsd: tiered.netProfitUsd,
        balanceUsd: nextBalance,
        gatewayLocked: false,
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  ensureMemorySeed();
  const user = mem.users.get(input.userId);
  if (!user) throw new Error("User not found");

  const config = await getRuntimePricing(input.modelId);
  const inputCostPer1k = input.inputPricePer1k ?? config?.inputPricePer1k;
  const outputCostPer1k = input.outputPricePer1k ?? config?.outputPricePer1k;
  if (inputCostPer1k == null || outputCostPer1k == null) throw new Error("DB pricing missing");

  const tiered = calculateTieredCost({
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    totalDepositedUsd: user.totalDepositedUsd,
    inputCostPer1k,
    outputCostPer1k,
  });

  const reservation = input.reservationId ? mem.reservations.get(input.reservationId) : undefined;
  const hasActiveReservation = Boolean(reservation && reservation.status === "reserved");

  if (hasActiveReservation && reservation) {
    const reservedUsd = toFixed6(Math.max(0, reservation.reservedUsd));
    const finalChargeUsd = toFixed6(Math.max(0, tiered.userChargeUsd));
    const settleUsd = toFixed6(Math.min(reservedUsd, finalChargeUsd));
    const extraChargeUsd = toFixed6(Math.max(0, finalChargeUsd - reservedUsd));
    const releaseUsd = toFixed6(Math.max(0, reservedUsd - settleUsd));

    const rawNextBalance = user.balanceUsd - extraChargeUsd;
    const shouldLock = rawNextBalance < 0;
    user.balanceUsd = toFixed6(Math.max(0, rawNextBalance));
    if (shouldLock) {
      user.gatewayLocked = true;
      user.gatewayLockReason = "negative_balance";
    }

    reservation.settledUsd = settleUsd;
    reservation.releasedUsd = releaseUsd;
    reservation.status = settleUsd > 0 ? "settled" : "released";
    reservation.settledAt = new Date().toISOString();

    mem.apiLogs.unshift({
      id: randomUUID(),
      userId: input.userId,
      apiKeyId: input.apiKeyId,
      modelId: input.modelId,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      costUsd: tiered.upstreamCostUsd,
      chargedUsd: tiered.userChargeUsd,
      netProfitUsd: tiered.netProfitUsd,
      statusCode: input.statusCode,
      createdAt: new Date().toISOString(),
    });

    if (shouldLock) {
      throw createBalanceDepletedError("Balance depleted during charge; gateway locked.");
    }

    return {
      costUsd: tiered.upstreamCostUsd,
      chargedUsd: tiered.userChargeUsd,
      netProfitUsd: tiered.netProfitUsd,
      balanceUsd: user.balanceUsd,
      gatewayLocked: false,
    };
  }

  const rawNextBalance = user.balanceUsd - tiered.userChargeUsd;
  const shouldLock = rawNextBalance < 0;
  user.balanceUsd = toFixed6(Math.max(0, rawNextBalance));
  if (shouldLock) {
    user.gatewayLocked = true;
    user.gatewayLockReason = "negative_balance";
  }

  mem.apiLogs.unshift({
    id: randomUUID(),
    userId: input.userId,
    apiKeyId: input.apiKeyId,
    modelId: input.modelId,
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    costUsd: tiered.upstreamCostUsd,
    chargedUsd: tiered.userChargeUsd,
    netProfitUsd: tiered.netProfitUsd,
    statusCode: input.statusCode,
    createdAt: new Date().toISOString(),
  });

  if (shouldLock) {
    throw createBalanceDepletedError("Balance depleted during charge; gateway locked.");
  }

  return {
    costUsd: tiered.upstreamCostUsd,
    chargedUsd: tiered.userChargeUsd,
    netProfitUsd: tiered.netProfitUsd,
    balanceUsd: user.balanceUsd,
    gatewayLocked: false,
  };
}

export async function applyStripeDeposit(
  userId: string,
  amountUsd: number,
  options?: {
    stripeId?: string | null;
    paymentMethod?: "stripe" | "card" | "alipay" | "wechat_pay" | "redeem_code";
    status?: "success" | "pending" | "failed";
    kind?: "deposit" | "redeem";
    paidAmountUsd?: number;
    creditedAmountUsd?: number;
  },
): Promise<UserRecord> {
  const pool = await getPool();
  const paymentMethod = options?.paymentMethod || "stripe";
  const status = options?.status || "success";
  const kind = options?.kind || "deposit";

  const paidAmount = toFixed6(Math.max(0, options?.paidAmountUsd ?? amountUsd));
  const computedCreditedAmount =
    kind === "deposit"
      ? paidAmount === 50
        ? 55
        : paidAmount === 200
          ? 230
          : paidAmount
      : paidAmount;
  const creditedAmount = toFixed6(Math.max(0, options?.creditedAmountUsd ?? computedCreditedAmount));
  const bonusAmount = toFixed6(Math.max(0, creditedAmount - paidAmount));

  if (pool) {
    const client = await pool.connect();
    try {
      await client.query("begin");

      if (options?.stripeId) {
        const existed = await client.query(
          `select id from transactions where stripe_id=$1 and user_id=$2 limit 1`,
          [options.stripeId, userId],
        );
        if (existed.rows[0]) {
          const userExisted = await getOrCreateUserById(userId);
          await client.query("commit");
          return userExisted;
        }
      }

      const res = await client.query(
        `select id,email,name,coalesce(role,'user') as role,coalesce(status,'active') as status,
                coalesce(balance_usd,0)::float8 as balance_usd,
                coalesce(total_deposited_usd,0)::float8 as total_deposited_usd,
                created_at
         from users where id=$1 for update`,
        [userId],
      );
      const row = res.rows[0];
      if (!row) throw new Error(`User ${userId} not found for deposit`);

      const nextDeposited = toFixed6(Number(row.total_deposited_usd) + paidAmount);
      const nextBalance = toFixed6(Number(row.balance_usd) + creditedAmount);

      await client.query(
        `update users
           set balance_usd=$2,
               total_deposited_usd=$3,
               gateway_locked=false,
               gateway_lock_reason=null,
               gateway_locked_at=null
         where id=$1`,
        [userId, nextBalance, nextDeposited],
      );

      await client.query(
        `insert into transactions(
          id,user_id,stripe_id,amount_usd,amount_paid_usd,amount_credited_usd,bonus_usd,kind,payment_method,status,created_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())`,
        [
          randomUUID(),
          userId,
          options?.stripeId || null,
          creditedAmount,
          paidAmount,
          creditedAmount,
          bonusAmount,
          kind,
          paymentMethod,
          status,
        ],
      );
      await client.query("commit");

      return {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        status: row.status,
        balanceUsd: nextBalance,
        totalDepositedUsd: nextDeposited,
        createdAt: new Date(row.created_at).toISOString(),
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  ensureMemorySeed();
  const user = mem.users.get(userId);
  if (!user) throw new Error(`User ${userId} not found for deposit`);
  user.balanceUsd = toFixed6(user.balanceUsd + creditedAmount);
  user.totalDepositedUsd = toFixed6(user.totalDepositedUsd + paidAmount);
  user.gatewayLocked = false;
  user.gatewayLockReason = null;
  return user;
}

export async function redeemBalanceCode(userId: string, code: string): Promise<{ amountUsd: number; user: UserRecord }> {
  const pool = await getPool();
  const normalized = code.trim().toUpperCase();
  if (!normalized) throw new Error("Redeem code is required");
  const codeHash = hashKey(`redeem:${normalized}`);

  if (pool) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const redeemRes = await client.query(
        `select id, amount_usd::float8 as amount_usd, status, expires_at
         from redeem_codes
         where code_hash=$1
         for update`,
        [codeHash],
      );
      const row = redeemRes.rows[0];
      if (!row) throw new Error("Redeem code not found");
      if (row.status !== "active") throw new Error("Redeem code is not available");
      if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) throw new Error("Redeem code has expired");

      const amountUsd = Number(row.amount_usd ?? 0);
      if (amountUsd <= 0) throw new Error("Redeem code amount is invalid");

      await client.query(
        `update redeem_codes
         set status='redeemed', redeemed_by_user_id=$2, redeemed_at=now()
         where id=$1`,
        [row.id, userId],
      );

      const userRes = await client.query(
        `select id,email,name,coalesce(role,'user') as role,coalesce(status,'active') as status,
                coalesce(balance_usd,0)::float8 as balance_usd,
                coalesce(total_deposited_usd,0)::float8 as total_deposited_usd,
                created_at
         from users where id=$1 for update`,
        [userId],
      );
      const userRow = userRes.rows[0];
      if (!userRow) throw new Error(`User ${userId} not found for redeem`);

      const nextDeposited = toFixed6(Number(userRow.total_deposited_usd) + amountUsd);
      const nextBalance = toFixed6(Number(userRow.balance_usd) + amountUsd);

      await client.query(
        `update users
           set balance_usd=$2,
               total_deposited_usd=$3,
               gateway_locked=false,
               gateway_lock_reason=null,
               gateway_locked_at=null
         where id=$1`,
        [userId, nextBalance, nextDeposited],
      );

      await client.query(
        `insert into transactions(
          id,user_id,stripe_id,amount_usd,amount_paid_usd,amount_credited_usd,bonus_usd,kind,payment_method,status,created_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())`,
        [randomUUID(), userId, null, amountUsd, amountUsd, amountUsd, 0, "redeem", "redeem_code", "success"],
      );

      const user: UserRecord = {
        id: userRow.id,
        email: userRow.email,
        name: userRow.name,
        role: userRow.role,
        status: userRow.status,
        balanceUsd: nextBalance,
        totalDepositedUsd: nextDeposited,
        gatewayLocked: false,
        gatewayLockReason: null,
        createdAt: new Date(userRow.created_at).toISOString(),
      };

      await client.query("commit");
      return { amountUsd, user };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  throw new Error("Redeem code is unavailable in memory mode");
}

export async function getOrCreateUserById(userId: string): Promise<UserRecord> {
  const pool = await getPool();
  if (pool) {
    const res = await pool.query(
      `select id,email,name,coalesce(role,'user') as role,coalesce(status,'active') as status,
              coalesce(balance_usd,0)::float8 as balance_usd,
              coalesce(total_deposited_usd,0)::float8 as total_deposited_usd,
              created_at
       from users where id=$1`,
      [userId],
    );
    const row = res.rows[0];
    if (!row) {
      const insertRes = await pool.query(
        `insert into users(id,email,name,role,status,balance_usd,total_deposited_usd)
         values ($1,$2,$3,'user','active',0,0)
         returning id,email,name,role,status,
                   coalesce(balance_usd,0)::float8 as balance_usd,
                   coalesce(total_deposited_usd,0)::float8 as total_deposited_usd,
                   created_at`,
        [userId, `${userId}@arkagentic.local`, userId],
      );
      const created = insertRes.rows[0];
      return {
        id: created.id,
        email: created.email,
        name: created.name,
        role: created.role,
        status: created.status,
        balanceUsd: Number(created.balance_usd),
        totalDepositedUsd: Number(created.total_deposited_usd),
        createdAt: new Date(created.created_at).toISOString(),
      };
    }
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      status: row.status,
      balanceUsd: Number(row.balance_usd),
      totalDepositedUsd: Number(row.total_deposited_usd),
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  ensureMemorySeed();
  const existing = mem.users.get(userId);
  if (existing) return existing;

  const created: UserRecord = {
    id: userId,
    email: `${userId}@arkagentic.local`,
    name: userId,
    role: "user",
    status: "active",
    balanceUsd: 0,
    totalDepositedUsd: 0,
    createdAt: new Date().toISOString(),
  };
  mem.users.set(created.id, created);
  return created;
}



type RequestPasswordResetResult = {
  accepted: boolean;
  resetUrl?: string;
};

const PASSWORD_RESET_TTL_MINUTES = 15;

function hashPasswordResetToken(raw: string): string {
  return hashKey(`password-reset:${raw}`);
}

export async function requestPasswordReset(input: {
  email: string;
  requestedIp?: string | null;
  requestedUa?: string | null;
  appBaseUrl?: string | null;
}): Promise<RequestPasswordResetResult> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) return { accepted: true };

  const appBaseUrl = (input.appBaseUrl || process.env.APP_BASE_URL || "").trim();
  const validBaseUrl = appBaseUrl ? appBaseUrl.replace(/\/$/, "") : "";

  const pool = await getPool();
  if (pool) {
    const userRes = await pool.query(
      `select id from users where lower(email)=$1 limit 1`,
      [email],
    );
    const userRow = userRes.rows[0];
    if (!userRow) return { accepted: true };

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashPasswordResetToken(rawToken);
    const ttlMinutes = PASSWORD_RESET_TTL_MINUTES;

    await pool.query(`delete from password_reset_tokens where user_id=$1 or expires_at < now() or used_at is not null`, [userRow.id]);
    await pool.query(
      `insert into password_reset_tokens(id, user_id, token_hash, expires_at, used_at, requested_ip, requested_ua, created_at)
       values ($1, $2, $3, now() + ($4::text || ' minutes')::interval, null, $5, $6, now())`,
      [randomUUID(), userRow.id, tokenHash, String(ttlMinutes), input.requestedIp || null, input.requestedUa || null],
    );

    if (!validBaseUrl) return { accepted: true };
    return {
      accepted: true,
      resetUrl: `${validBaseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`,
    };
  }

  ensureMemorySeed();
  const user = [...mem.users.values()].find((item) => item.email.toLowerCase() === email);
  if (!user) return { accepted: true };

  for (const [id, token] of mem.passwordResetTokens.entries()) {
    if (token.userId == user.id) mem.passwordResetTokens.delete(id);
  }

  const rawToken = randomBytes(32).toString("base64url");
  const token: PasswordResetTokenRecord = {
    id: randomUUID(),
    userId: user.id,
    tokenHash: hashPasswordResetToken(rawToken),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000).toISOString(),
    usedAt: null,
    requestedIp: input.requestedIp || null,
    requestedUa: input.requestedUa || null,
    createdAt: new Date().toISOString(),
  };
  mem.passwordResetTokens.set(token.id, token);

  if (!validBaseUrl) return { accepted: true };
  return {
    accepted: true,
    resetUrl: `${validBaseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`,
  };
}

export async function resetPasswordWithToken(input: { token: string; newPassword: string }): Promise<boolean> {
  const rawToken = (input.token || "").trim();
  const newPassword = input.newPassword || "";
  if (!rawToken) return false;
  if (newPassword.length < 8) throw new Error("Password must be at least 8 characters");

  const tokenHash = hashPasswordResetToken(rawToken);
  const pool = await getPool();
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const tokenRes = await client.query(
        `select id, user_id, expires_at, used_at
         from password_reset_tokens
         where token_hash=$1
         limit 1
         for update`,
        [tokenHash],
      );
      const row = tokenRes.rows[0];
      if (!row) {
        await client.query("rollback");
        return false;
      }
      if (row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
        await client.query("rollback");
        return false;
      }

      const passwordHash = hashPassword(newPassword);
      await client.query(`update users set password_hash=$2 where id=$1`, [row.user_id, passwordHash]);
      await client.query(`update password_reset_tokens set used_at=now() where id=$1`, [row.id]);
      await client.query("commit");
      return true;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  ensureMemorySeed();
  const now = Date.now();
  const target = [...mem.passwordResetTokens.values()].find((item) => item.tokenHash == tokenHash);
  if (!target) return false;
  if (target.usedAt || new Date(target.expiresAt).getTime() < now) return false;

  mem.passwordHashes.set(target.userId, hashPassword(newPassword));
  target.usedAt = new Date().toISOString();
  mem.passwordResetTokens.set(target.id, target);
  return true;
}



const EMAIL_VERIFICATION_TTL_HOURS = 24;

function hashEmailVerificationToken(raw: string): string {
  return hashKey(`email-verification:${raw}`);
}

export async function requestEmailVerification(input: {
  email: string;
  requestedIp?: string | null;
  requestedUa?: string | null;
  appBaseUrl?: string | null;
}): Promise<{ accepted: boolean; verifyUrl?: string }> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) return { accepted: true };

  const appBaseUrl = (input.appBaseUrl || process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  const validBaseUrl = appBaseUrl ? appBaseUrl.replace(/\/$/, "") : "";

  const pool = await getPool();
  if (pool) {
    const userRes = await pool.query(`select id from users where lower(email)=$1 limit 1`, [email]);
    const userRow = userRes.rows[0];
    if (!userRow) return { accepted: true };

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashEmailVerificationToken(rawToken);

    await pool.query(`delete from email_verification_tokens where user_id=$1 or expires_at < now() or used_at is not null`, [userRow.id]);
    await pool.query(
      `insert into email_verification_tokens(id, user_id, token_hash, expires_at, used_at, requested_ip, requested_ua, created_at)
       values ($1, $2, $3, now() + ($4::text || ' hours')::interval, null, $5, $6, now())`,
      [randomUUID(), userRow.id, tokenHash, String(EMAIL_VERIFICATION_TTL_HOURS), input.requestedIp || null, input.requestedUa || null],
    );

    if (!validBaseUrl) return { accepted: true };
    return {
      accepted: true,
      verifyUrl: `${validBaseUrl}/verify-email?token=${encodeURIComponent(rawToken)}`,
    };
  }

  ensureMemorySeed();
  const user = [...mem.users.values()].find((item) => item.email.toLowerCase() === email);
  if (!user) return { accepted: true };

  for (const [id, token] of mem.emailVerificationTokens.entries()) {
    if (token.userId === user.id) mem.emailVerificationTokens.delete(id);
  }

  const rawToken = randomBytes(32).toString("base64url");
  const token: EmailVerificationTokenRecord = {
    id: randomUUID(),
    userId: user.id,
    tokenHash: hashEmailVerificationToken(rawToken),
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000).toISOString(),
    usedAt: null,
    requestedIp: input.requestedIp || null,
    requestedUa: input.requestedUa || null,
    createdAt: new Date().toISOString(),
  };
  mem.emailVerificationTokens.set(token.id, token);

  if (!validBaseUrl) return { accepted: true };
  return {
    accepted: true,
    verifyUrl: `${validBaseUrl}/verify-email?token=${encodeURIComponent(rawToken)}`,
  };
}

export async function verifyEmailWithToken(input: { token: string }): Promise<boolean> {
  const rawToken = (input.token || "").trim();
  if (!rawToken) return false;

  const tokenHash = hashEmailVerificationToken(rawToken);
  const pool = await getPool();
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const tokenRes = await client.query(
        `select id, user_id, expires_at, used_at
         from email_verification_tokens
         where token_hash=$1
         limit 1
         for update`,
        [tokenHash],
      );
      const row = tokenRes.rows[0];
      if (!row) {
        await client.query("rollback");
        return false;
      }
      if (row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
        await client.query("rollback");
        return false;
      }

      await client.query(`update users set email_verified=true where id=$1`, [row.user_id]);
      await client.query(`update email_verification_tokens set used_at=now() where id=$1`, [row.id]);
      await client.query("commit");
      return true;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  ensureMemorySeed();
  const now = Date.now();
  const target = [...mem.emailVerificationTokens.values()].find((item) => item.tokenHash === tokenHash);
  if (!target) return false;
  if (target.usedAt || new Date(target.expiresAt).getTime() < now) return false;
  target.usedAt = new Date().toISOString();
  mem.emailVerificationTokens.set(target.id, target);
  return true;
}

export async function getAdminDashboard(): Promise<AdminDashboard> {
  const pool = await getPool();

  if (pool) {
    const usersRes = await pool.query(
      `select id,email,created_at,
              coalesce(total_deposited_usd,0)::float8 as total_deposited_usd,
              coalesce(balance_usd,0)::float8 as balance_usd,
              coalesce(status,'active') as status
       from users
       order by created_at desc`,
    );

    const keyRes = await pool.query(
      `select user_id,key_prefix,quota_limit,coalesce(status,'active') as status
       from api_keys
       order by user_id asc`,
    );

    const logsRes = await pool.query(
      `select id,user_id,model_id,prompt_tokens,completion_tokens,
              coalesce(charged_usd,0)::float8 as charged_usd,
              coalesce(net_profit_usd,0)::float8 as net_profit_usd,
              created_at
       from api_logs
       order by created_at desc
       limit 100`,
    );

    const grossDeposits = usersRes.rows.reduce((sum, row) => sum + Number(row.total_deposited_usd), 0);
    const totalBalance = usersRes.rows.reduce((sum, row) => sum + Number(row.balance_usd), 0);
    const totalProfit = logsRes.rows.reduce((sum, row) => sum + Number(row.net_profit_usd), 0);

    return {
      kpi: {
        totalUsers: usersRes.rows.length,
        grossDepositsUsd: toFixed6(grossDeposits),
        totalUserBalanceUsd: toFixed6(totalBalance),
        cumulativeNetProfitUsd: toFixed6(totalProfit),
      },
      users: usersRes.rows.map((row) => ({
        userId: row.id,
        email: row.email,
        registeredAt: new Date(row.created_at).toISOString().slice(0, 10),
        totalDepositedUsd: Number(row.total_deposited_usd),
        currentBalanceUsd: Number(row.balance_usd),
        status: row.status,
      })),
      keyRecords: keyRes.rows.map((row) => ({
        userId: row.user_id,
        keyPrefix: row.key_prefix,
        quotaLimit: Number(row.quota_limit ?? 0),
        status: row.status,
      })),
      usageLogs: logsRes.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        modelId: row.model_id,
        totalTokens: Number(row.prompt_tokens ?? 0) + Number(row.completion_tokens ?? 0),
        customerChargeUsd: Number(row.charged_usd),
        netProfitUsd: Number(row.net_profit_usd),
        timestamp: new Date(row.created_at).toISOString(),
      })),
    };
  }

  ensureMemorySeed();
  const users = [...mem.users.values()];
  const keys = [...mem.apiKeys.values()];
  const logs = [...mem.apiLogs];

  return {
    kpi: {
      totalUsers: users.length,
      grossDepositsUsd: toFixed6(users.reduce((sum, user) => sum + user.totalDepositedUsd, 0)),
      totalUserBalanceUsd: toFixed6(users.reduce((sum, user) => sum + user.balanceUsd, 0)),
      cumulativeNetProfitUsd: toFixed6(logs.reduce((sum, log) => sum + log.netProfitUsd, 0)),
    },
    users: users.map((user) => ({
      userId: user.id,
      email: user.email,
      registeredAt: user.createdAt.slice(0, 10),
      totalDepositedUsd: user.totalDepositedUsd,
      currentBalanceUsd: user.balanceUsd,
      status: user.status,
    })),
    keyRecords: keys.map((key) => ({
      userId: key.userId,
      keyPrefix: key.keyPrefix,
      quotaLimit: key.quotaLimit,
      status: key.status,
    })),
    usageLogs: logs.slice(0, 100).map((log) => ({
      id: log.id,
      userId: log.userId,
      modelId: log.modelId,
      totalTokens: log.promptTokens + log.completionTokens,
      customerChargeUsd: log.chargedUsd,
      netProfitUsd: log.netProfitUsd,
      timestamp: log.createdAt,
    })),
  };
}

export type AdminUsageLogsPage = {
  page: number;
  pageSize: number;
  total: number;
  records: Array<{
    id: string;
    userId: string;
    modelId: string;
    totalTokens: number;
    customerChargeUsd: number;
    netProfitUsd: number;
    timestamp: string;
  }>;
};

export async function getAdminUsageLogsPage(
  page: number,
  pageSize: number,
  options?: { query?: string; sinceIso?: string | null },
): Promise<AdminUsageLogsPage> {
  const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
  const safePageSize = Number.isFinite(pageSize) ? Math.min(5000, Math.max(1, Math.floor(pageSize))) : 50;
  const offset = (safePage - 1) * safePageSize;
  const q = (options?.query ?? "").trim().toLowerCase();
  const since = options?.sinceIso ? new Date(options.sinceIso) : null;
  const hasSince = Boolean(since && !Number.isNaN(since.getTime()));

  const pool = await getPool();
  if (pool) {
    const where: string[] = [];
    const params: unknown[] = [];

    if (hasSince) {
      params.push(since!.toISOString());
      where.push(`created_at >= $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      where.push(`(lower(user_id) like $${params.length} or lower(model_id) like $${params.length} or cast(id as text) like $${params.length})`);
    }

    const whereSql = where.length ? `where ${where.join(" and ")}` : "";

    const totalRes = await pool.query(
      `select count(*)::int as total from api_logs ${whereSql}`,
      params,
    );

    const rowsRes = await pool.query(
      `select id,user_id,model_id,prompt_tokens,completion_tokens,
              coalesce(charged_usd,0)::float8 as charged_usd,
              coalesce(net_profit_usd,0)::float8 as net_profit_usd,
              created_at
       from api_logs
       ${whereSql}
       order by created_at desc
       limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, safePageSize, offset],
    );

    return {
      page: safePage,
      pageSize: safePageSize,
      total: Number(totalRes.rows[0]?.total ?? 0),
      records: rowsRes.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        modelId: row.model_id,
        totalTokens: Number(row.prompt_tokens ?? 0) + Number(row.completion_tokens ?? 0),
        customerChargeUsd: Number(row.charged_usd),
        netProfitUsd: Number(row.net_profit_usd),
        timestamp: new Date(row.created_at).toISOString(),
      })),
    };
  }

  ensureMemorySeed();
  const filtered = [...mem.apiLogs]
    .filter((log) => {
      if (hasSince && new Date(log.createdAt).getTime() < since!.getTime()) return false;
      if (!q) return true;
      const hay = `${log.id} ${log.userId} ${log.modelId}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const pageRows = filtered.slice(offset, offset + safePageSize);

  return {
    page: safePage,
    pageSize: safePageSize,
    total: filtered.length,
    records: pageRows.map((log) => ({
      id: log.id,
      userId: log.userId,
      modelId: log.modelId,
      totalTokens: log.promptTokens + log.completionTokens,
      customerChargeUsd: log.chargedUsd,
      netProfitUsd: log.netProfitUsd,
      timestamp: log.createdAt,
    })),
  };
}

export async function toggleUserStatus(userId: string): Promise<void> {
  const pool = await getPool();

  if (pool) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const current = await client.query(`select coalesce(status,'active') as status from users where id=$1 for update`, [userId]);
      const row = current.rows[0];
      if (!row) throw new Error(`User ${userId} not found`);
      const nextStatus = row.status === "active" ? "disabled" : "active";

      await client.query(`update users set status=$2 where id=$1`, [userId, nextStatus]);
      await client.query(`update api_keys set status=$2 where user_id=$1`, [userId, nextStatus]);
      await client.query("commit");
      return;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  ensureMemorySeed();
  const user = mem.users.get(userId);
  if (!user) throw new Error(`User ${userId} not found`);
  user.status = user.status === "active" ? "disabled" : "active";

  for (const key of mem.apiKeys.values()) {
    if (key.userId === userId) key.status = user.status;
  }
}

export type UserProfile = {
  userId: string;
  email: string;
  name: string;
  phone: string;
  role: "user" | "admin";
  createdAt: string;
};

export type UserBillingSummary = {
  balanceUsd: number;
  monthToDateUsd: number;
  avgDailyUsd: number;
  totalDepositedUsd: number;
  dailyUsage: Array<{
    date: string;
    tokenCount: number;
    amountUsd: number;
  }>;
  modelBreakdown: Array<{
    modelId: string;
    callCount: number;
    totalTokens: number;
    amountUsd: number;
  }>;
  history: Array<{
    id: string;
    occurredAt: string;
    type: "topup" | "redeem" | "settlement";
    usageTokens: number;
    amountUsd: number;
    amountPaidUsd?: number;
    amountCreditedUsd?: number;
    bonusUsd?: number;
    paymentMethod: "stripe" | "card" | "alipay" | "wechat_pay" | "redeem_code" | "system";
    status: "success" | "pending" | "failed";
  }>;
  topupHistory: Array<{
    id: string;
    occurredAt: string;
    amountPaidUsd: number;
    amountCreditedUsd: number;
    paymentMethod: "stripe" | "card" | "alipay" | "wechat_pay" | "redeem_code" | "system";
    status: "success" | "pending" | "failed";
  }>;
  usageLogs: Array<{
    id: string;
    occurredAt: string;
    modelId: string;
    promptTokens: number;
    completionTokens: number;
    amountUsd: number;
  }>;
  tableMode: "topup" | "usage";
  tablePage: number;
  tablePageSize: number;
  tableTotal: number;
  tableHasPrev: boolean;
  tableHasNext: boolean;
};

export type UserModelRecord = {
  id: string;
  name: string;
  group: "global" | "china";
  contextWindow: string;
  latencyMs: number;
  active: boolean;
  region: string;
  compliance: string;
  inputPricePer1k: number | null;
  outputPricePer1k: number | null;
  pricingSource: "db" | "static" | "none";
};

export type UserModelsSnapshot = {
  pricing: {
    totalDepositedUsd: number;
    multiplier: number;
  };
  models: UserModelRecord[];
};

const MODEL_META: Record<
  string,
  {
    name: string;
    group: "global" | "china";
    contextWindow: string;
    latencyMs: number;
    region: string;
    compliance: string;
  }
> = {
  "ark-gpt-4o": {
    name: "GPT-4o",
    group: "global",
    contextWindow: "128k",
    latencyMs: 172,
    region: "Global Cluster",
    compliance: "SOC2 / ISO Compliant",
  },
  "ark-gpt-5.3-codex": {
    name: "ark-gpt-5.3-codex",
    group: "global",
    contextWindow: "200k",
    latencyMs: 185,
    region: "US East",
    compliance: "Enterprise Privacy",
  },
  "ark-claude-sonnet-5": {
    name: "ark-claude-sonnet-5",
    group: "global",
    contextWindow: "200k",
    latencyMs: 186,
    region: "US East",
    compliance: "No Training on Prompt Data",
  },
  "ark-claude-opus-5": {
    name: "ark-claude-opus-5",
    group: "global",
    contextWindow: "200k",
    latencyMs: 210,
    region: "US East",
    compliance: "Enterprise Privacy",
  },
  "ark-deepseek-v4-pro": {
    name: "ark-deepseek-v4-pro",
    group: "china",
    contextWindow: "128k",
    latencyMs: 148,
    region: "US East",
    compliance: "No Data Retention",
  },
  "ark-deepseek-v4-flash": {
    name: "ark-deepseek-v4-flash",
    group: "china",
    contextWindow: "128k",
    latencyMs: 152,
    region: "US East",
    compliance: "No Data Retention",
  },
  "ark-mai-thinking-1": {
    name: "ark-mai-thinking-1",
    group: "china",
    contextWindow: "128k",
    latencyMs: 159,
    region: "US East",
    compliance: "Enterprise Privacy",
  },
  "ark-cohere-embed-v3": {
    name: "ark-cohere-embed-v3",
    group: "global",
    contextWindow: "128k",
    latencyMs: 150,
    region: "Global Cluster",
    compliance: "SOC2 / ISO Compliant",
  },
  "ark-cohere-rerank-v4-pro": {
    name: "ark-cohere-rerank-v4-pro",
    group: "global",
    contextWindow: "128k",
    latencyMs: 158,
    region: "Global Cluster",
    compliance: "SOC2 / ISO Compliant",
  },
  "ark-cohere-rerank-v4-fast": {
    name: "ark-cohere-rerank-v4-fast",
    group: "global",
    contextWindow: "128k",
    latencyMs: 145,
    region: "Global Cluster",
    compliance: "SOC2 / ISO Compliant",
  },
  "ark-mai-image-2.5-pro": {
    name: "ark-mai-image-2.5-pro",
    group: "china",
    contextWindow: "128k",
    latencyMs: 170,
    region: "US East",
    compliance: "No Training on Prompt Data",
  },
  "ark-mai-transcribe-1.5": {
    name: "ark-mai-transcribe-1.5",
    group: "china",
    contextWindow: "128k",
    latencyMs: 162,
    region: "US East",
    compliance: "No Data Retention",
  },
  "ark-mai-voice-2": {
    name: "ark-mai-voice-2",
    group: "china",
    contextWindow: "128k",
    latencyMs: 166,
    region: "US East",
    compliance: "No Data Retention",
  },
};

export async function getUserProfile(userId: string): Promise<UserProfile> {
  const pool = await getPool();

  if (pool) {
    const res = await pool.query(
      `select id,email,name,coalesce(phone,'') as phone,coalesce(role,'user') as role,created_at
       from users
       where id=$1`,
      [userId],
    );
    const row = res.rows[0];
    if (!row) throw new Error(`User ${userId} not found`);
    return {
      userId: row.id,
      email: row.email,
      name: row.name,
      phone: row.phone || "",
      role: row.role,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  ensureMemorySeed();
  const user = mem.users.get(userId);
  if (!user) throw new Error(`User ${userId} not found`);
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone || "",
    role: user.role,
    createdAt: user.createdAt,
  };
}

export async function updateUserProfile(
  userId: string,
  patch: { email?: string; name?: string; phone?: string },
): Promise<UserProfile> {
  const nextName = (patch.name ?? "").trim();
  const nextEmail = (patch.email ?? "").trim().toLowerCase();
  const nextPhone = (patch.phone ?? "").trim();
  const pool = await getPool();

  if (pool) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const currentRes = await client.query(
        `select id,email,name,coalesce(phone,'') as phone,coalesce(role,'user') as role,created_at
         from users where id=$1 for update`,
        [userId],
      );
      const row = currentRes.rows[0];
      if (!row) throw new Error(`User ${userId} not found`);

      const finalEmail = nextEmail || row.email;
      const finalName = nextName || row.name;
      const finalPhone = nextPhone || "";

      if (finalEmail !== row.email) {
        const dup = await client.query(`select id from users where lower(email)=$1 and id<>$2 limit 1`, [finalEmail, userId]);
        if (dup.rows[0]) throw new Error("Email already in use");
      }

      await client.query(
        `update users
           set email=$2,
               name=$3,
               phone=$4
         where id=$1`,
        [userId, finalEmail, finalName, finalPhone || null],
      );
      await client.query("commit");

      return {
        userId,
        email: finalEmail,
        name: finalName,
        phone: finalPhone,
        role: row.role,
        createdAt: new Date(row.created_at).toISOString(),
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  ensureMemorySeed();
  const current = mem.users.get(userId);
  if (!current) throw new Error(`User ${userId} not found`);
  if (nextEmail && nextEmail !== current.email) {
    for (const candidate of mem.users.values()) {
      if (candidate.id !== userId && candidate.email.toLowerCase() === nextEmail) {
        throw new Error("Email already in use");
      }
    }
    current.email = nextEmail;
  }
  if (nextName) current.name = nextName;
  current.phone = nextPhone;

  return {
    userId: current.id,
    email: current.email,
    name: current.name,
    phone: current.phone || "",
    role: current.role,
    createdAt: current.createdAt,
  };
}

export async function getUserBillingSummary(
  userId: string,
  options?: { mode?: "topup" | "usage"; page?: number; pageSize?: number },
): Promise<UserBillingSummary> {
  const pool = await getPool();
  const mode = options?.mode === "topup" ? "topup" : "usage";
  const tablePageSize = Math.max(1, Math.floor(options?.pageSize ?? 10));
  const tablePage = Math.max(1, Math.floor(options?.page ?? 1));
  const tableOffset = (tablePage - 1) * tablePageSize;

  if (pool) {
    const user = await getOrCreateUserById(userId);

    const monthRes = await pool.query(
      `select coalesce(sum(charged_usd),0)::float8 as month_total
       from api_logs
       where user_id=$1
         and date_trunc('month', created_at) = date_trunc('month', now())`,
      [userId],
    );
    const monthToDateUsd = Number(monthRes.rows[0]?.month_total ?? 0);
    const avgDailyUsd = monthToDateUsd / Math.max(1, new Date().getUTCDate());

    const dailyRes = await pool.query(
      `select
         to_char(day_bucket, 'YYYY-MM-DD') as day,
         token_total,
         amount_total
       from (
         select
           date_trunc('day', created_at)::date as day_bucket,
           coalesce(sum(prompt_tokens + completion_tokens),0)::bigint as token_total,
           coalesce(sum(charged_usd),0)::float8 as amount_total
         from api_logs
         where user_id=$1
           and created_at >= now() - interval '30 days'
         group by 1
       ) d
       order by day_bucket asc`,
      [userId],
    );

    const modelRes = await pool.query(
      `select
         model_id,
         count(*)::bigint as call_count,
         coalesce(sum(prompt_tokens + completion_tokens),0)::bigint as total_tokens,
         coalesce(sum(charged_usd),0)::float8 as amount_total
       from api_logs
       where user_id=$1
         and created_at >= now() - interval '30 days'
       group by model_id
       order by amount_total desc, call_count desc`,
      [userId],
    );

    const topupCountRes = await pool.query(`select count(*)::bigint as total from transactions where user_id=$1`, [userId]);
    const topupTotal = Number(topupCountRes.rows[0]?.total ?? 0);

    const topupRes = await pool.query(
      `select
         id::text as id,
         created_at,
         kind,
         coalesce(amount_paid_usd, amount_usd)::float8 as amount_paid_usd,
         coalesce(amount_credited_usd, amount_usd)::float8 as amount_credited_usd,
         coalesce(payment_method, case when kind='redeem' then 'redeem_code' else 'stripe' end) as payment_method,
         coalesce(status, 'success') as status
       from transactions
       where user_id=$1
       order by created_at desc
       limit $2 offset $3`,
      [userId, tablePageSize, tableOffset],
    );

    const usageCountRes = await pool.query(`select count(*)::bigint as total from api_logs where user_id=$1`, [userId]);
    const usageTotal = Number(usageCountRes.rows[0]?.total ?? 0);

    const usageRes = await pool.query(
      `select
         id::text as id,
         created_at,
         model_id,
         prompt_tokens,
         completion_tokens,
         charged_usd::float8 as amount_usd
       from api_logs
       where user_id=$1
       order by created_at desc
       limit $2 offset $3`,
      [userId, tablePageSize, tableOffset],
    );

    const topupHistory: UserBillingSummary["topupHistory"] = topupRes.rows.map((row) => ({
      id: String(row.id),
      occurredAt: new Date(row.created_at).toISOString(),
      amountPaidUsd: Number(Number(row.amount_paid_usd ?? 0).toFixed(6)),
      amountCreditedUsd: Number(Number(row.amount_credited_usd ?? 0).toFixed(6)),
      paymentMethod: row.payment_method,
      status: row.status,
    }));

    const usageLogs: UserBillingSummary["usageLogs"] = usageRes.rows.map((row) => ({
      id: String(row.id),
      occurredAt: new Date(row.created_at).toISOString(),
      modelId: String(row.model_id),
      promptTokens: Number(row.prompt_tokens ?? 0),
      completionTokens: Number(row.completion_tokens ?? 0),
      amountUsd: Number(Number(row.amount_usd ?? 0).toFixed(6)),
    }));

    const history: UserBillingSummary["history"] = topupHistory.map((item) => ({
      id: item.id,
      occurredAt: item.occurredAt,
      type: item.paymentMethod === "redeem_code" ? "redeem" : "topup",
      usageTokens: 0,
      amountUsd: item.amountCreditedUsd,
      amountPaidUsd: item.amountPaidUsd,
      amountCreditedUsd: item.amountCreditedUsd,
      bonusUsd: Number((item.amountCreditedUsd - item.amountPaidUsd).toFixed(6)),
      paymentMethod: item.paymentMethod,
      status: item.status,
    }));

    const tableTotal = mode === "topup" ? topupTotal : usageTotal;

    return {
      balanceUsd: user.balanceUsd,
      monthToDateUsd: Number(monthToDateUsd.toFixed(6)),
      avgDailyUsd: Number(avgDailyUsd.toFixed(6)),
      totalDepositedUsd: user.totalDepositedUsd,
      dailyUsage: dailyRes.rows.map((row) => ({
        date: String(row.day),
        tokenCount: Number(row.token_total ?? 0),
        amountUsd: Number(Number(row.amount_total ?? 0).toFixed(6)),
      })),
      modelBreakdown: modelRes.rows.map((row) => ({
        modelId: String(row.model_id),
        callCount: Number(row.call_count ?? 0),
        totalTokens: Number(row.total_tokens ?? 0),
        amountUsd: Number(Number(row.amount_total ?? 0).toFixed(6)),
      })),
      history,
      topupHistory,
      usageLogs,
      tableMode: mode,
      tablePage,
      tablePageSize,
      tableTotal,
      tableHasPrev: tablePage > 1,
      tableHasNext: tableOffset + (mode === "topup" ? topupHistory.length : usageLogs.length) < tableTotal,
    };
  }

  ensureMemorySeed();
  const user = mem.users.get(userId);
  if (!user) throw new Error(`User ${userId} not found`);
  const now = Date.now();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const logs = mem.apiLogs.filter((log) => log.userId === userId);
  const monthLogs = logs.filter((log) => new Date(log.createdAt).getTime() >= monthStart.getTime());
  const monthToDateUsd = monthLogs.reduce((sum, log) => sum + log.chargedUsd, 0);
  const avgDailyUsd = monthToDateUsd / Math.max(1, new Date(now).getUTCDate());

  const dailyMap = new Map<string, { tokenCount: number; amountUsd: number }>();
  for (const log of logs) {
    const ts = new Date(log.createdAt).getTime();
    if (now - ts > 30 * 24 * 60 * 60 * 1000) continue;
    const day = new Date(log.createdAt).toISOString().slice(0, 10);
    const curr = dailyMap.get(day) || { tokenCount: 0, amountUsd: 0 };
    curr.tokenCount += log.promptTokens + log.completionTokens;
    curr.amountUsd += log.chargedUsd;
    dailyMap.set(day, curr);
  }

  const modelBreakdownMap = new Map<string, { callCount: number; totalTokens: number; amountUsd: number }>();
  for (const log of logs) {
    const ts = new Date(log.createdAt).getTime();
    if (now - ts > 30 * 24 * 60 * 60 * 1000) continue;
    const curr = modelBreakdownMap.get(log.modelId) || { callCount: 0, totalTokens: 0, amountUsd: 0 };
    curr.callCount += 1;
    curr.totalTokens += log.promptTokens + log.completionTokens;
    curr.amountUsd += log.chargedUsd;
    modelBreakdownMap.set(log.modelId, curr);
  }

  const logsSorted = logs
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const usageTotal = logsSorted.length;
  const usageLogs: UserBillingSummary["usageLogs"] = logsSorted.slice(tableOffset, tableOffset + tablePageSize).map((log) => ({
    id: log.id,
    occurredAt: log.createdAt,
    modelId: log.modelId,
    promptTokens: log.promptTokens,
    completionTokens: log.completionTokens,
    amountUsd: Number(log.chargedUsd.toFixed(6)),
  }));

  const topupHistory: UserBillingSummary["topupHistory"] = [];
  const history: UserBillingSummary["history"] = [];
  const tableTotal = mode === "topup" ? topupHistory.length : usageTotal;

  return {
    balanceUsd: user.balanceUsd,
    monthToDateUsd: Number(monthToDateUsd.toFixed(6)),
    avgDailyUsd: Number(avgDailyUsd.toFixed(6)),
    totalDepositedUsd: user.totalDepositedUsd,
    dailyUsage: [...dailyMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, tokenCount: v.tokenCount, amountUsd: Number(v.amountUsd.toFixed(6)) })),
    modelBreakdown: [...modelBreakdownMap.entries()]
      .map(([modelId, v]) => ({
        modelId,
        callCount: v.callCount,
        totalTokens: v.totalTokens,
        amountUsd: Number(v.amountUsd.toFixed(6)),
      }))
      .sort((a, b) => (b.amountUsd === a.amountUsd ? b.callCount - a.callCount : b.amountUsd - a.amountUsd)),
    history,
    topupHistory,
    usageLogs,
    tableMode: mode,
    tablePage,
    tablePageSize,
    tableTotal,
    tableHasPrev: tablePage > 1,
    tableHasNext: tableOffset + (mode === "topup" ? topupHistory.length : usageLogs.length) < tableTotal,
  };
}

function modelIdToDisplayName(modelId: string): string {
  const raw = modelId
    .replace(/^ark-/, "")
    .replace(/[-_]+/g, " ")
    .trim();
  if (!raw) return modelId;
  return raw
    .split(" ")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function formatDeploymentTypeLabel(value?: string): string {
  const v = String(value || "").trim();
  if (!v) return "";
  return v
    .replace(/[-_]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function inferModelGroup(provider?: string): "global" | "china" {
  if (!provider) return "global";
  return provider === "openai" || provider === "anthropic" || provider === "openai_standard" ? "global" : "china";
}

export async function getUserModelsSnapshot(userId: string): Promise<UserModelsSnapshot> {
  const pool = await getPool();
  let totalDepositedUsd = 0;
  let activeModelIds = new Set<string>();
  let activeModelMeta = new Map<string, { displayName?: string; deploymentType?: string; provider?: string }>();

  if (pool) {
    const user = await getOrCreateUserById(userId);
    totalDepositedUsd = user.totalDepositedUsd;
    activeModelIds = await getActiveModelIdSet();
    activeModelMeta = await getActiveModelMetadataMap();
  } else {
    ensureMemorySeed();
    const user = mem.users.get(userId);
    if (!user) throw new Error(`User ${userId} not found`);
    totalDepositedUsd = user.totalDepositedUsd;
  }

  const canonicalOrder = modelPricingTable.map((item) => item.modelId);
  const modelIds = Array.from(new Set([...canonicalOrder, ...Array.from(activeModelIds)]));
  const modelOrder = new Map(modelIds.map((id, index) => [id, index]));
  const runtimePricingById = await getRuntimePricingMap(modelIds);

  const models: UserModelRecord[] = modelIds
    .map((modelId) => {
      const pricing = runtimePricingById.get(modelId);
      const providerHint = pricing ? "openai_standard" : undefined;
      const syncedMeta = activeModelMeta.get(modelId);
      const fallbackMeta =
        MODEL_META[modelId] ?? {
          name: modelIdToDisplayName(modelId),
          group: inferModelGroup(syncedMeta?.provider || providerHint),
          contextWindow: "128k",
          latencyMs: 180,
          region: "Global Cluster",
          compliance: "Enterprise Privacy",
        };

      const finalName = modelId;

      return {
        id: modelId,
        name: finalName,
        group: fallbackMeta.group,
        contextWindow: fallbackMeta.contextWindow,
        latencyMs: fallbackMeta.latencyMs,
        active: activeModelIds.has(modelId),
        region: fallbackMeta.region,
        compliance: fallbackMeta.compliance,
        inputPricePer1k: pricing ? Number(pricing.inputPricePer1k) : null,
        outputPricePer1k: pricing ? Number(pricing.outputPricePer1k) : null,
        pricingSource: (pricing ? "db" : "none") as UserModelRecord["pricingSource"],
      };
    })
    .sort((a, b) => {
      const aOrder = modelOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = modelOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.id.localeCompare(b.id);
    });

  return {
    pricing: {
      totalDepositedUsd: Number(totalDepositedUsd.toFixed(6)),
      multiplier: 1,
    },
    models,
  };
}

export async function getUserOverviewStats(userId: string): Promise<{
  requests24h: number;
  requestPerMin: number;
  tokenUsage24h: number;
  p95LatencyMs: number | null;
  requestTrend: number[];
}> {
  const pool = await getPool();

  const toTrendPercent = (counts: number[]) => {
    const max = Math.max(...counts, 0);
    if (max <= 0) return counts.map(() => 8);
    return counts.map((value) => Math.max(8, Math.round((value / max) * 100)));
  };

  if (pool) {
    const last24hRes = await pool.query(
      `select
         count(*)::int as requests_24h,
         coalesce(sum(prompt_tokens + completion_tokens), 0)::bigint as tokens_24h
       from api_logs
       where user_id = $1
         and created_at >= now() - interval '24 hours'`,
      [userId],
    );

    const trendRes = await pool.query(
      `select
         floor(extract(epoch from created_at) / 7200)::bigint as bucket,
         count(*)::int as request_count
       from api_logs
       where user_id = $1
         and created_at >= now() - interval '24 hours'
       group by 1
       order by 1 asc`,
      [userId],
    );

    const nowEpoch = Math.floor(Date.now() / 1000);
    const currentBucket = Math.floor(nowEpoch / 7200);
    const bucketMap = new Map<number, number>(
      trendRes.rows.map((row) => [Number(row.bucket), Number(row.request_count)]),
    );

    const counts = Array.from({ length: 12 }, (_, idx) => {
      const bucket = currentBucket - (11 - idx);
      return bucketMap.get(bucket) ?? 0;
    });

    const requests24h = Number(last24hRes.rows[0]?.requests_24h ?? 0);
    const tokenUsage24h = Number(last24hRes.rows[0]?.tokens_24h ?? 0);

    return {
      requests24h,
      requestPerMin: requests24h / 1440,
      tokenUsage24h,
      p95LatencyMs: null,
      requestTrend: toTrendPercent(counts),
    };
  }

  ensureMemorySeed();
  const now = Date.now();
  const in24h = mem.apiLogs.filter((log) => log.userId === userId && now - new Date(log.createdAt).getTime() <= 24 * 60 * 60 * 1000);
  const requests24h = in24h.length;
  const tokenUsage24h = in24h.reduce((sum, log) => sum + log.promptTokens + log.completionTokens, 0);

  const nowEpoch = Math.floor(now / 1000);
  const currentBucket = Math.floor(nowEpoch / 7200);
  const counts = Array.from({ length: 12 }, (_, idx) => {
    const bucket = currentBucket - (11 - idx);
    return in24h.filter((log) => Math.floor(new Date(log.createdAt).getTime() / 1000 / 7200) === bucket).length;
  });

  return {
    requests24h,
    requestPerMin: requests24h / 1440,
    tokenUsage24h,
    p95LatencyMs: null,
    requestTrend: toTrendPercent(counts),
  };
}
