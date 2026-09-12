import { NextRequest, NextResponse } from "next/server";
import { parseJwtFromCookie } from "@/lib/server-auth";
import { runChannelHealthCheck } from "@/lib/upstream-admin";

type Params = { params: Promise<{ channelId: string }> };

function ensureAdmin(request: NextRequest) {
  const session = parseJwtFromCookie(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function POST(request: NextRequest, { params }: Params) {
  const deny = ensureAdmin(request);
  if (deny) return deny;

  const { channelId } = await params;
  let body: { ark_model_id?: string } = {};

  try {
    body = (await request.json()) as { ark_model_id?: string };
  } catch {
    // optional
  }

  const result = await runChannelHealthCheck(channelId, body.ark_model_id);
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
