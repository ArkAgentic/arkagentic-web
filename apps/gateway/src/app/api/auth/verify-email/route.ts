import { NextRequest, NextResponse } from "next/server";
import { verifyEmailWithToken } from "@/lib/server-store";

type VerifyBody = {
  token?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as VerifyBody;
  const token = (body.token || "").trim();
  if (!token) {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }

  try {
    const ok = await verifyEmailWithToken({ token });
    if (!ok) {
      return NextResponse.json({ error: "Verification link is invalid or expired" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
