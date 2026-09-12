import { NextRequest, NextResponse } from "next/server";
import { detectAuthEmailLocale, resolvePublicAppBaseUrl, sendAuthEmail, type AuthEmailLocale } from "@/lib/auth-email";
import { registerUserWithPassword, requestEmailVerification } from "@/lib/server-store";
import { encodeSessionToken } from "@/lib/session-token";

type SignupBody = {
  name?: string;
  email?: string;
  password?: string;
  locale?: string;
};

function resolveRequestedLocale(input?: string | null): AuthEmailLocale | null {
  const v = String(input || "").trim().toLowerCase();
  if (v === "zh" || v === "en" || v === "fr" || v === "de" || v === "ja" || v === "ko") return v;
  return null;
}

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  const realIp = request.headers.get("x-real-ip");
  return realIp?.trim() || null;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as SignupBody;
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  const name = (body.name || "").trim();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  try {
    const user = await registerUserWithPassword({ email, password, name });

    const baseUrl = resolvePublicAppBaseUrl({
      requestOrigin: request.nextUrl.origin,
      appBaseUrl: process.env.APP_BASE_URL,
    });

    const verify = await requestEmailVerification({
      email: user.email,
      requestedIp: getClientIp(request),
      requestedUa: request.headers.get("user-agent"),
      appBaseUrl: baseUrl,
    });

    if (verify.verifyUrl) {
      await sendAuthEmail({
        to: user.email,
        kind: "email_verification",
        actionUrl: verify.verifyUrl,
        locale: resolveRequestedLocale(body.locale) ?? detectAuthEmailLocale(request.headers.get("accept-language")),
      });
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Signup failed";
    const lower = message.toLowerCase();
    if (lower.includes("duplicate") || lower.includes("already") || lower.includes("unique")) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
