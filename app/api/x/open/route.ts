import { spawn } from "node:child_process";
import path from "node:path";
import { NextResponse } from "next/server";
import { recordAction, recordError } from "@/src/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const child = spawn(process.execPath, ["./node_modules/.bin/tsx", "scripts/open-x-browser.ts"], {
      cwd: process.cwd(),
      detached: true,
      env: {
        ...process.env,
        X_HEADLESS: "false"
      },
      stdio: "ignore"
    });

    child.unref();

    recordAction("xBrowser", "launched", "Opened persistent X browser from dashboard", {
      script: path.join(process.cwd(), "scripts/open-x-browser.ts")
    });

    return NextResponse.json({ ok: true, pid: child.pid });
  } catch (error) {
    recordError("api.x.open", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
