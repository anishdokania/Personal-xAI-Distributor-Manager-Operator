import { NextRequest, NextResponse } from "next/server";
import { getEffectiveConfig, recordAction, setSetting } from "@/src/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { enabled?: boolean };
  const current = getEffectiveConfig().autoPostEnabled;
  const enabled = typeof body.enabled === "boolean" ? body.enabled : !current;

  setSetting("auto_post_enabled", enabled);
  recordAction("settings", "updated", enabled ? "Auto-post enabled" : "Auto-post disabled");

  return NextResponse.json({ ok: true, enabled });
}
