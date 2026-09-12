import { NextRequest, NextResponse } from "next/server";
import { parseJwtFromCookie } from "@/lib/server-auth";
import { deleteChannel, getChannelById, updateChannel } from "@/lib/upstream-admin";

type Params = { params: Promise<{ channelId: string }> };

function ensureAdmin(request: NextRequest) {
  const session = parseJwtFromCookie(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET(request: NextRequest, { params }: Params) {
  const deny = ensureAdmin(request);
  if (deny) return deny;

  const { channelId } = await params;
  const channel = await getChannelById(channelId);
  if (!channel) return NextResponse.json({ error: "Not Found" }, { status: 404 });
  return NextResponse.json(channel);
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const deny = ensureAdmin(request);
  if (deny) return deny;

  const { channelId } = await params;
  try {
    const body = await request.json();
    const updated = await updateChannel(channelId, body ?? {});
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bad Request";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const deny = ensureAdmin(request);
  if (deny) return deny;

  const { channelId } = await params;
  await deleteChannel(channelId);
  return NextResponse.json({ ok: true });
}
