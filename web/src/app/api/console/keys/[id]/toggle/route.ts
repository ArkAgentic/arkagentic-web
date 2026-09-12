import { NextRequest, NextResponse } from "next/server";
import { parseJwtFromCookie } from "@/lib/server-auth";
import { listUserApiKeys, toggleUserApiKey } from "@/lib/server-store";

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

function toMaskedValue(keyPrefix: string, keyHash: string): string {
  const prefix = keyPrefix.replace(/\.{3,}$/g, "").slice(0, 7);
  const suffix = keyHash.slice(-4);
  return `${prefix}***${suffix}`;
}

function mapRecord(record: Awaited<ReturnType<typeof listUserApiKeys>>[number]): ConsoleApiKey {
  return {
    id: record.id,
    name: record.name,
    maskedValue: toMaskedValue(record.keyPrefix, record.keyHash),
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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = parseJwtFromCookie(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const keys = await toggleUserApiKey(session.userId, id);
  return NextResponse.json(keys.map((k) => mapRecord(k)));
}
