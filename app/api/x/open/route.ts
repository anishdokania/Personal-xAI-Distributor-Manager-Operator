import { NextResponse } from "next/server";
import { recordAction, recordError } from "@/src/db";
import { openXBrowser } from "@/src/x/browser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const session = await openXBrowser({ headless: false, keepOpen: true });
    await session.page.goto("https://x.com/home", { waitUntil: "domcontentloaded" });

    recordAction("xBrowser", "launched", "Opened dashboard-managed X browser");

    return NextResponse.json({ ok: true, url: session.page.url() });
  } catch (error) {
    recordError("api.x.open", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
