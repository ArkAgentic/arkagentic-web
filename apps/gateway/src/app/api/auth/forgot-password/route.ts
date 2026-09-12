import { NextRequest, NextResponse } from "next/server";
import { detectAuthEmailLocale, resolvePublicAppBaseUrl, sendAuthEmail, type AuthEmailLocale } from "@/lib/auth-email";
import { requestPasswordReset } from "@/lib/server-store";

type ForgotPasswordBody = {
  email?: string;
  locale?: string;
};

const GENERIC_OK = {
  ok: true,
  message: "If that email exists, we sent a reset link.",
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
  const body = (await request.json().catch(() => ({}))) as ForgotPasswordBody;
  const email = (body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json(GENERIC_OK);
  }

  try {
    const baseUrl = resolvePublicAppBaseUrl({
      requestOrigin: request.nextUrl.origin,
      appBaseUrl: process.env.APP_BASE_URL,
    });

    const result = await requestPasswordReset({
      email,
      requestedIp: getClientIp(request),
      requestedUa: request.headers.get("user-agent"),
      appBaseUrl: baseUrl,
    });

    if (result.resetUrl) {
      await sendAuthEmail({
        to: email,
        kind: "password_reset",
        actionUrl: result.resetUrl,
        locale: resolveRequestedLocale(body.locale) ?? detectAuthEmailLocale(request.headers.get("accept-language")),
      });
    }

    return NextResponse.json(GENERIC_OK);
  } catch (error) {
    console.error("[auth/forgot-password] error", error);
    return NextResponse.json(GENERIC_OK);
  }
}
