import { NextRequest, NextResponse } from "next/server";
import { isFounderAdminEmail } from "@/lib/founder-admin";
import { upsertAuthenticatedUser } from "@/lib/server-store";

type JwtPayload = {
  userId?: string;
  email?: string;
  role?: "user" | "admin";
  balanceUsd?: number;
  exp?: number;
  [key: string]: unknown;
};

type JwtHeader = {
  alg?: string;
  typ?: string;
  [key: string]: unknown;
};

function decodePart<T>(value: string): T | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const json = Buffer.from(padded, "base64").toString("utf-8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function encodePart(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeJwt(token: string): { header: JwtHeader; payload: JwtPayload } | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;

  const header = decodePart<JwtHeader>(parts[0]);
  const payload = decodePart<JwtPayload>(parts[1]);
  if (!header || !payload) return null;
  return { header, payload };
}

function encodeJwt(header: JwtHeader, payload: JwtPayload): string {
  return `${encodePart(header)}.${encodePart(payload)}.mock-signature`;
}

function tokenFromCode(code: string): string {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7;
  const header: JwtHeader = { alg: "HS256", typ: "JWT" };
  const payload: JwtPayload = {
    userId: `usr_${code.slice(0, 8)}`,
    email: `user+${code.slice(0, 6)}@arkagentic.com`,
    role: "user",
    balanceUsd: 50,
    exp,
  };
  return encodeJwt(header, payload);
}

function toSafePath(value: string | null, fallback: string): string {
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  return value;
}

function relativeRedirect(location: string, status = 307): NextResponse {
  return new NextResponse(null, {
    status,
    headers: { Location: location },
  });
}

async function promoteFounderInDatabase(args: { userId?: string; email?: string }) {
  const normalizedEmail = args.email?.trim().toLowerCase();
  if (!normalizedEmail || !isFounderAdminEmail(normalizedEmail) || !process.env.DATABASE_URL) return;

  try {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    const clauses: string[] = [];
    const values: string[] = [];

    if (args.userId) {
      values.push(args.userId);
      clauses.push(`id = $${values.length}`);
    }

    values.push(normalizedEmail);
    clauses.push(`lower(email) = $${values.length}`);

    await pool.query(`update users set role = 'admin' where ${clauses.join(" OR ")}`, values);
    await pool.end();
  } catch {
    // Silent fallback: auth flow should not fail if DB role sync is unavailable.
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const providedToken = params.get("token");
  const redirect = toSafePath(params.get("redirect"), "/console/overview");

  const token = providedToken || (code ? tokenFromCode(code) : null);
  if (!token) {
    return relativeRedirect("/login?error=oauth_callback_invalid");
  }

  const decoded = decodeJwt(token);
  if (!decoded) {
    return relativeRedirect("/login?error=oauth_callback_invalid");
  }

  const now = Math.floor(Date.now() / 1000);
  if (decoded.payload.exp && decoded.payload.exp <= now) {
    return relativeRedirect("/login?error=oauth_token_expired");
  }

  const normalizedEmail = decoded.payload.email?.trim().toLowerCase();
  let nextPayload: JwtPayload = { ...decoded.payload };

  if (isFounderAdminEmail(normalizedEmail)) {
    nextPayload = { ...nextPayload, role: "admin" };
    await promoteFounderInDatabase({ userId: decoded.payload.userId, email: normalizedEmail });
  }

  const resolvedUserId = nextPayload.userId || `usr_${Buffer.from(normalizedEmail || "user").toString("hex").slice(0, 16)}`;
  const resolvedEmail = normalizedEmail || `${resolvedUserId}@arkagentic.local`;
  const resolvedRole: "user" | "admin" = nextPayload.role === "admin" ? "admin" : "user";

  await upsertAuthenticatedUser({
    userId: resolvedUserId,
    email: resolvedEmail,
    name: resolvedEmail.split("@")[0],
    role: resolvedRole,
  });

  nextPayload = {
    ...nextPayload,
    userId: resolvedUserId,
    email: resolvedEmail,
    role: resolvedRole,
  };

  const finalToken = encodeJwt(decoded.header, nextPayload);

  const response = relativeRedirect(redirect);
  response.cookies.set({
    name: "ark_jwt_token",
    value: finalToken,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
