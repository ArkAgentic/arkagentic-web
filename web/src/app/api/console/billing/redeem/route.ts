import { NextRequest, NextResponse } from "next/server";
import { parseJwtFromCookie } from "@/lib/server-auth";
import { redeemBalanceCode } from "@/lib/server-store";

type RedeemRateState = { count: number; resetAt: number };

const REDEEM_LIMIT = 5;
const REDEEM_WINDOW_MS = 60_000;

const redeemRateByUser = new Map<string, RedeemRateState>();

function hitRedeemRateLimit(userId: string): boolean {
  const now = Date.now();
  const state = redeemRateByUser.get(userId);
  if (!state || state.resetAt <= now) {
    redeemRateByUser.set(userId, { count: 1, resetAt: now + REDEEM_WINDOW_MS });
    return false;
  }

  state.count += 1;
  redeemRateByUser.set(userId, state);
  return state.count > REDEEM_LIMIT;
}

export async function POST(request: NextRequest) {
  const session = parseJwtFromCookie(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (hitRedeemRateLimit(session.userId)) {
    return NextResponse.json({ error: "Too many redeem attempts. Please retry in one minute." }, { status: 429 });
  }

  let code = "";
  try {
    const body = (await request.json()) as { code?: string };
    code = String(body?.code || "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: "Redeem code is required" }, { status: 400 });
  }

  try {
    const result = await redeemBalanceCode(session.userId, code);
    return NextResponse.json({ ok: true, amountUsd: result.amountUsd, balanceUsd: result.user.balanceUsd });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Redeem failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
