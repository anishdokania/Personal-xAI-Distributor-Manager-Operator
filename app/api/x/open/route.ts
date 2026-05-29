import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { recordAction, recordError } from "@/src/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const logPath = path.join(process.cwd(), "data", "x-browser.log");
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const logFile = fs.openSync(logPath, "a");

    const child = spawn(process.execPath, ["--import", "tsx", "scripts/open-x-browser.ts"], {
      cwd: process.cwd(),
      detached: true,
      env: {
        ...process.env,
        X_HEADLESS: "false"
      },
      stdio: ["ignore", logFile, logFile]
    });

    child.unref();

    recordAction("xBrowser", "launched", "Opened persistent X browser from dashboard", {
      script: path.join(process.cwd(), "scripts/open-x-browser.ts"),
      logPath
    });

    return NextResponse.json({ ok: true, pid: child.pid, logPath });
  } catch (error) {
    recordError("api.x.open", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
