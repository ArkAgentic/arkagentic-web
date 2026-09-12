import { NextRequest, NextResponse } from "next/server";
import { parseJwtFromCookie } from "@/lib/server-auth";
import { getUserOverviewStats } from "@/lib/server-store";

function formatCompact(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return String(Math.round(value));
}

export async function GET(request: NextRequest) {
  const session = parseJwtFromCookie(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stats = await getUserOverviewStats(session.userId);

  return NextResponse.json({
    metrics: [
      {
        label: "Requests (24h)",
        value: formatCompact(stats.requests24h),
        delta: "n/a",
      },
      {
        label: "Request/min",
        value: stats.requestPerMin.toFixed(2),
        delta: "n/a",
      },
      {
        label: "Token Usage",
        value: formatCompact(stats.tokenUsage24h),
        delta: "n/a",
      },
      {
        label: "p95 Latency",
        value: stats.p95LatencyMs == null ? "N/A" : `${Math.round(stats.p95LatencyMs)}ms`,
        delta: "n/a",
      },
    ],
    requestTrend: stats.requestTrend,
  });
}
