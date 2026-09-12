import { NextRequest, NextResponse } from "next/server";
import { parseJwtFromCookie } from "@/lib/server-auth";
import { getUserBillingSummary } from "@/lib/server-store";

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export async function GET(request: NextRequest) {
  const session = parseJwtFromCookie(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const mode = request.nextUrl.searchParams.get("mode") === "topup" ? "topup" : "usage";
  const page = parsePositiveInt(request.nextUrl.searchParams.get("page"), 1);
  const pageSize = 10;

  const summary = await getUserBillingSummary(session.userId, {
    mode,
    page,
    pageSize,
  });

  return NextResponse.json(summary);
}
