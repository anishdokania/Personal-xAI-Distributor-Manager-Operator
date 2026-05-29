import { NextRequest, NextResponse } from "next/server";
import { getEffectiveConfig, recordAction, setSetting } from "@/src/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { enabled?: boolean };
  const current = getEffectiveConfig().mockAiEnabled;
  const enabled = typeof body.enabled === "boolean" ? body.enabled : !current;

  setSetting("mock_ai", enabled);
  recordAction("settings", "updated", enabled ? "Local curator enabled" : "Local curator disabled");

  return NextResponse.json({ ok: true, enabled });
}
