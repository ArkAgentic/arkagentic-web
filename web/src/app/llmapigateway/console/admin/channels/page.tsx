import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ConsoleShell } from "@/components/console-shell";
import { AdminSectionNav } from "@/components/console/admin-section-nav";
import { AdminChannelsClientPanel } from "@/components/console/admin-channels-client";

type JwtPayload = { role?: "user" | "admin"; exp?: number };

function parsePayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const json = Buffer.from(padded, "base64").toString("utf-8");
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export default async function LlmGatewayConsoleAdminChannelsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("ark_jwt_token")?.value;
  if (!token) notFound();

  const payload = parsePayload(token);
  if (!payload || payload.role !== "admin") notFound();

  return (
    <ConsoleShell active="admin" basePath="/llmapigateway/console">
      <AdminSectionNav />
      <AdminChannelsClientPanel />
    </ConsoleShell>
  );
}
