export interface JwtPayload {
  userId: string;
  email: string;
  role: "user" | "admin";
  balanceUsd: number;
  exp: number;
}

const TOKEN_KEY = "ark_jwt_token";
const COOKIE_KEY = "ark_jwt_token";

export type AuthSessionState =
  | { status: "anonymous" }
  | { status: "expired" }
  | { status: "authenticated"; token: string; payload: JwtPayload };

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return atob(padded);
}

export function parseJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const json = decodeBase64Url(parts[1]);
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export function setAuthToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(token)}; Path=/; Max-Age=2592000; SameSite=Lax${secure}`;
}

export function clearAuthToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_KEY}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

function readCookieToken(): string | null {
  if (typeof document === "undefined") return null;
  const found = document.cookie
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${COOKIE_KEY}=`));
  if (!found) return null;
  const raw = found.slice(COOKIE_KEY.length + 1);
  return decodeURIComponent(raw);
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  const fromStorage = window.localStorage.getItem(TOKEN_KEY);
  if (fromStorage) return fromStorage;
  return readCookieToken();
}

export function getAuthSessionState(): AuthSessionState {
  const token = getAuthToken();
  if (!token) return { status: "anonymous" };
  const payload = parseJwtPayload(token);
  if (!payload) return { status: "anonymous" };
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) return { status: "expired" };
  return { status: "authenticated", token, payload };
}

export function buildMockJwt(payload: JwtPayload): string {
  const header = { alg: "HS256", typ: "JWT" };
  const encode = (obj: object) => {
    const json = JSON.stringify(obj);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  };
  return `${encode(header)}.${encode(payload)}.mock-signature`;
}
