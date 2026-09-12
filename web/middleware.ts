import { NextRequest, NextResponse } from "next/server";

const CONSOLE_PREFIX = "/console";
const ADMIN_CONSOLE_PREFIX = "/console/admin";
const ADMIN_API_PREFIX = "/api/admin";

type JwtLikePayload = {
  role?: "user" | "admin";
  exp?: number;
};

function parseJwtPayload(token: string): JwtLikePayload | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const json = Buffer.from(padded, "base64").toString("utf-8");
    return JSON.parse(json) as JwtLikePayload;
  } catch {
    return null;
  }
}

function loginRedirect(request: NextRequest, redirectPath: string) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", redirectPath);
  return NextResponse.redirect(loginUrl, 307);
}

function hiddenAdminRedirect(request: NextRequest) {
  return NextResponse.redirect(new URL("/console/overview", request.url), 307);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isConsoleRoute = pathname.startsWith(CONSOLE_PREFIX);
  const isAdminConsoleRoute = pathname.startsWith(ADMIN_CONSOLE_PREFIX);
  const isAdminApiRoute = pathname.startsWith(ADMIN_API_PREFIX);

  if (!isConsoleRoute && !isAdminApiRoute) return NextResponse.next();

  const token = request.cookies.get("ark_jwt_token")?.value;
  if (!token) {
    if (isAdminApiRoute) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (isAdminConsoleRoute) {
      return loginRedirect(request, "/console/admin");
    }
    return loginRedirect(request, "/console/overview");
  }

  const payload = parseJwtPayload(token);
  const now = Math.floor(Date.now() / 1000);
  const expired = !payload || (payload.exp ? payload.exp <= now : false);
  if (expired) {
    if (isAdminApiRoute) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (isAdminConsoleRoute) {
      return loginRedirect(request, "/console/admin");
    }
    return loginRedirect(request, "/console/overview");
  }

  if ((isAdminConsoleRoute || isAdminApiRoute) && payload.role !== "admin") {
    if (isAdminApiRoute) {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }
    return hiddenAdminRedirect(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/console/:path*", "/api/admin/:path*"],
};
