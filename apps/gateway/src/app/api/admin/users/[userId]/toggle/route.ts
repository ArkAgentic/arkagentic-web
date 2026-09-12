import { NextRequest, NextResponse } from "next/server";
import { parseJwtFromCookie } from "@/lib/server-auth";
import { getAdminDashboard, toggleUserStatus } from "@/lib/server-store";

type Params = { params: Promise<{ userId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const session = parseJwtFromCookie(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await params;
  await toggleUserStatus(userId);
  const snapshot = await getAdminDashboard();
  return NextResponse.json(snapshot);
}
