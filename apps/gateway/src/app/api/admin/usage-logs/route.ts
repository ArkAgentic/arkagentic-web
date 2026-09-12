import { NextRequest, NextResponse } from "next/server";
import { parseJwtFromCookie } from "@/lib/server-auth";
import { getAdminUsageLogsPage } from "@/lib/server-store";

type RangePreset = "24h" | "7d" | "30d" | "all";

function resolveSinceIso(range: RangePreset): string | null {
  if (range === "all") return null;
  const now = Date.now();
  const deltaMs = range === "24h" ? 24 * 60 * 60 * 1000 : range === "7d" ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
  return new Date(now - deltaMs).toISOString();
}

function csvEscape(value: string | number): string {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes("\n") || text.includes("\"")) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }
  return text;
}

export async function GET(request: NextRequest) {
  const session = parseJwtFromCookie(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const pageSize = Number(request.nextUrl.searchParams.get("page_size") ?? "50");
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const rangeRaw = (request.nextUrl.searchParams.get("range") ?? "all") as RangePreset;
  const range: RangePreset = ["24h", "7d", "30d", "all"].includes(rangeRaw) ? rangeRaw : "all";
  const sinceIso = resolveSinceIso(range);

  const exportFormat = request.nextUrl.searchParams.get("export");
  if (exportFormat === "csv") {
    const full = await getAdminUsageLogsPage(1, 5000, { query, sinceIso });
    const lines = [
      ["timestamp", "user_id", "model_id", "total_tokens", "customer_charge_usd", "net_profit_usd"].join(","),
      ...full.records.map((item) =>
        [
          csvEscape(item.timestamp),
          csvEscape(item.userId),
          csvEscape(item.modelId),
          csvEscape(item.totalTokens),
          csvEscape(item.customerChargeUsd),
          csvEscape(item.netProfitUsd),
        ].join(","),
      ),
    ];

    return new NextResponse(lines.join("\n"), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="admin-usage-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
        "cache-control": "no-store",
      },
    });
  }

  const payload = await getAdminUsageLogsPage(page, pageSize, { query, sinceIso });
  return NextResponse.json(payload);
}
