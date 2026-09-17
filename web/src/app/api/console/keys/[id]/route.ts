import { NextRequest, NextResponse } from "next/server";
import { parseJwtFromCookie } from "@/lib/server-auth";
import {
  ApiKeySpendLimitFormatError,
  ApiKeySpendLimitValidationError,
  deleteUserApiKey,
  listUserApiKeys,
  updateUserApiKey,
} from "@/lib/server-store";

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

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = parseJwtFromCookie(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  let body: { name?: string; spendLimitUsd?: number | null; quotaPerDay?: number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let keys;
  try {
    keys = await updateUserApiKey(session.userId, id, {
      name: body.name,
      spendLimitUsd: body.spendLimitUsd,
      quotaLimit: body.quotaPerDay,
    });
  } catch (error) {
    if (error instanceof ApiKeySpendLimitValidationError) {
      return NextResponse.json(
        { error: "Spend limit cannot be lower than used amount", code: "SPEND_LIMIT_BELOW_USED" },
        { status: 400 },
      );
    }
    if (error instanceof ApiKeySpendLimitFormatError) {
      return NextResponse.json({ error: "Spend limit must be a valid number", code: "SPEND_LIMIT_INVALID" }, { status: 400 });
    }
    throw error;
  }
  return NextResponse.json(keys.map((k) => mapRecord(k)));
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = parseJwtFromCookie(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const keys = await deleteUserApiKey(session.userId, id);
  return NextResponse.json(keys.map((k) => mapRecord(k)));
}
