import { NextRequest, NextResponse } from "next/server";
import { parseJwtFromCookie } from "@/lib/server-auth";
import { getSessionUserById } from "@/lib/server-store";

function unauthorizedResponse() {
  const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  response.cookies.set({
    name: "ark_jwt_token",
    value: "",
    path: "/",
    maxAge: 0,
    sameSite: "lax",
    secure: true,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const session = parseJwtFromCookie(request);
  if (!session?.userId) return unauthorizedResponse();

  const user = await getSessionUserById(session.userId);
  if (!user || user.status !== "active") {
    return unauthorizedResponse();
  }

  return NextResponse.json({
    user: {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      balanceUsd: user.balanceUsd,
    },
  });
}
