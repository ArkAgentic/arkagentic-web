import { NextRequest, NextResponse } from "next/server";
import { parseJwtFromCookie } from "@/lib/server-auth";
import { createChannel, listChannels } from "@/lib/upstream-admin";

function ensureAdmin(request: NextRequest) {
  const session = parseJwtFromCookie(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  const deny = ensureAdmin(request);
  if (deny) return deny;

  const channels = await listChannels();
  return NextResponse.json({ channels });
}

export async function POST(request: NextRequest) {
  const deny = ensureAdmin(request);
  if (deny) return deny;

  try {
    const body = await request.json();
    const created = await createChannel(body ?? {});
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Bad Request" }, { status: 400 });
  }
}
