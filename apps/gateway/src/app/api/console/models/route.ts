import { NextRequest, NextResponse } from "next/server";
import { parseJwtFromCookie } from "@/lib/server-auth";
import { getUserModelsSnapshot } from "@/lib/server-store";

export async function GET(request: NextRequest) {
  const session = parseJwtFromCookie(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const group = request.nextUrl.searchParams.get("group");
  const snapshot = await getUserModelsSnapshot(session.userId);
  const models = group === "global" || group === "china" ? snapshot.models.filter((m) => m.group === group) : snapshot.models;

  return NextResponse.json({
    pricing: snapshot.pricing,
    models,
  });
}
