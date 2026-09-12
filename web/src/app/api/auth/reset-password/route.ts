import { NextRequest, NextResponse } from "next/server";
import { resetPasswordWithToken } from "@/lib/server-store";

type ResetPasswordBody = {
  token?: string;
  newPassword?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as ResetPasswordBody;
  const token = (body.token || "").trim();
  const newPassword = body.newPassword || "";

  if (!token || !newPassword) {
    return NextResponse.json({ error: "Token and new password are required" }, { status: 400 });
  }

  try {
    const ok = await resetPasswordWithToken({ token, newPassword });
    if (!ok) {
      return NextResponse.json({ error: "Reset link is invalid or expired" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Password reset failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
