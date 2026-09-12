import { NextRequest, NextResponse } from "next/server";
import { parseJwtFromCookie } from "@/lib/server-auth";
import { spawnSync } from "child_process";
import path from "path";

function ensureAdmin(request: NextRequest) {
  const session = parseJwtFromCookie(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  const deny = ensureAdmin(request);
  if (deny) return deny;

  const body = await request.json().catch(() => ({}));
  const dryRun = Boolean((body as { dryRun?: boolean })?.dryRun);

  const cwd = process.cwd();
  const scriptPath = path.join(cwd, "scripts", "sync-azure-deployments.mjs");
  const args = [scriptPath, "--json"];
  if (dryRun) args.push("--dry-run");

  const result = spawnSync(process.execPath, args, {
    cwd,
    env: process.env,
    encoding: "utf8",
    timeout: 120000,
  });

  const rawStdout = String(result.stdout || "").trim();
  const rawStderr = String(result.stderr || "").trim();

  let payload: unknown = null;
  if (rawStdout) {
    try {
      payload = JSON.parse(rawStdout);
    } catch {
      payload = { ok: false, error: "sync script produced non-JSON output", rawStdout, rawStderr };
    }
  }

  if (result.error) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error.message,
        stderr: rawStderr,
      },
      { status: 500 },
    );
  }

  if (result.status !== 0) {
    return NextResponse.json(
      {
        ok: false,
        error: (payload as { error?: string })?.error || rawStderr || "sync failed",
        details: payload,
      },
      { status: 500 },
    );
  }

  return NextResponse.json(payload || { ok: true });
}
