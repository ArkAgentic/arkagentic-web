import { NextRequest, NextResponse } from "next/server";
import { parseJwtFromCookie } from "@/lib/server-auth";
import { deleteRoute, updateRoute } from "@/lib/upstream-admin";

type Params = { params: Promise<{ routeId: string }> };

function ensureAdmin(request: NextRequest) {
  const session = parseJwtFromCookie(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const deny = ensureAdmin(request);
  if (deny) return deny;

  const { routeId } = await params;
  try {
    const body = await request.json();
    const updated = await updateRoute(routeId, body ?? {});
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

  const { routeId } = await params;
  await deleteRoute(routeId);
  return NextResponse.json({ ok: true });
}
