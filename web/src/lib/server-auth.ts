import type { NextRequest } from "next/server";

export type SessionJwtPayload = {
  userId: string;
  email: string;
  role: "user" | "admin";
  balanceUsd: number;
  exp: number;
};

export function parseJwtFromCookie(request: NextRequest): SessionJwtPayload | null {
  const token = request.cookies.get("ark_jwt_token")?.value;
  if (!token) return null;

  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const json = Buffer.from(padded, "base64").toString("utf-8");
    const payload = JSON.parse(json) as SessionJwtPayload;

    if (!payload.userId || !payload.email || !payload.role) return null;
    if (payload.exp && payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
