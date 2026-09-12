import { NextRequest, NextResponse } from "next/server";
import { authenticateUserWithPassword } from "@/lib/server-store";
import { encodeSessionToken } from "@/lib/session-token";

type LoginBody = {
  email?: string;
  password?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as LoginBody;
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const user = await authenticateUserWithPassword({ email, password });
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = encodeSessionToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    balanceUsd: user.balanceUsd,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  });

  const response = NextResponse.json({
    token,
    user: {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      balanceUsd: user.balanceUsd,
    },
  });

  response.cookies.set({
    name: "ark_jwt_token",
    value: token,
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
