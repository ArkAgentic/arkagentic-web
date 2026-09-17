import { NextRequest, NextResponse } from "next/server";
import { parseJwtFromCookie } from "@/lib/server-auth";
import { ApiKeyLimitError, ApiKeySpendLimitFormatError, createUserApiKey, listUserApiKeys } from "@/lib/server-store";

type ConsoleApiKey = {
  id: string;
  name: string;
  maskedValue: string;
  revealedValue?: string;
  keyHash: string;
  keyPrefix: string;
  active: boolean;
  quotaPerDay: number;
  spendLimitUsd: number | null;
  usedAmountUsd: number;
  lastUsedAt: string | null;
  createdAt: string;
};

function toMaskedValue(keyPrefix: string, keyHash: string, rawKey?: string): string {
  const prefix = keyPrefix.replace(/\.{3,}$/g, "").slice(0, 7);
  const rawSuffix = typeof rawKey === "string" ? rawKey.trim().slice(-4) : "";
  const suffix = rawSuffix || keyHash.slice(-4);
  return `${prefix}***${suffix}`;
}

function mapRecord(record: Awaited<ReturnType<typeof listUserApiKeys>>[number]): ConsoleApiKey {
  return {
    id: record.id,
    name: record.name,
    maskedValue: toMaskedValue(record.keyPrefix, record.keyHash, record.rawKey),
    revealedValue: record.rawKey,
    keyHash: record.keyHash,
    keyPrefix: record.keyPrefix,
    active: record.status === "active",
    quotaPerDay: record.quotaLimit,
    spendLimitUsd: record.spendLimitUsd ?? null,
    usedAmountUsd: Number(record.usedAmountUsd ?? 0),
    lastUsedAt: record.lastUsedAt ?? null,
    createdAt: (record.createdAt || new Date().toISOString()).slice(0, 10),
  };
}

export async function GET(request: NextRequest) {
  const session = parseJwtFromCookie(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const keys = await listUserApiKeys(session.userId);
  return NextResponse.json(keys.map((k) => mapRecord(k)));
}

export async function POST(request: NextRequest) {
  const session = parseJwtFromCookie(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { name?: string; spendLimitUsd?: number | null; quotaPerDay?: number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // allow empty body
  }

  let created;
  try {
    created = await createUserApiKey(session.userId, {
      name: body.name,
      spendLimitUsd: body.spendLimitUsd,
      quotaLimit: body.quotaPerDay,
    });
  } catch (error) {
    if (error instanceof ApiKeyLimitError) {
      return NextResponse.json({ error: "API key limit reached", code: "KEY_LIMIT_REACHED", max: 5 }, { status: 400 });
    }
    if (error instanceof ApiKeySpendLimitFormatError) {
      return NextResponse.json({ error: "Spend limit must be a valid number", code: "SPEND_LIMIT_INVALID" }, { status: 400 });
    }
    throw error;
  }

  const key: ConsoleApiKey = {
    ...mapRecord(created.record),
    revealedValue: created.rawKey,
  };
  return NextResponse.json(key, { status: 201 });
}
