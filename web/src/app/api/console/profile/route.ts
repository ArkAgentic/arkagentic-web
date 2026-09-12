import { NextRequest, NextResponse } from "next/server";
import { parseJwtFromCookie } from "@/lib/server-auth";
import { getUserProfile, updateUserProfile } from "@/lib/server-store";

export async function GET(request: NextRequest) {
  const session = parseJwtFromCookie(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getUserProfile(session.userId);
  return NextResponse.json(profile);
}

export async function PATCH(request: NextRequest) {
  const session = parseJwtFromCookie(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    phone?: string;
  };

  try {
    const profile = await updateUserProfile(session.userId, {
      name: body.name,
      email: body.email,
      phone: body.phone,
    });
    return NextResponse.json(profile);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update failed";
    const status = message === "Email already in use" ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
