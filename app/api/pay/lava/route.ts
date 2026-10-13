import { NextResponse } from "next/server";
import { handleLavaEvent, LavaEvent, lavaAuthOk } from "@/lib/pro";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * lava.top calls this after every payment event (set the URL in lava.top → Интеграции → Webhook,
 * auth "API key" with the same value as LAVA_WEBHOOK_SECRET in Vercel).
 */
export async function POST(req: Request) {
  if (!lavaAuthOk(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as LavaEvent | null;
  if (!body || typeof body !== "object") return NextResponse.json({ ok: false, error: "bad body" }, { status: 400 });
  try {
    const result = await handleLavaEvent(body, new URL(req.url).origin);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("lava webhook failed", e);
    // A 5xx makes lava.top retry later.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
