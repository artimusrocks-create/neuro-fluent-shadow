import { NextResponse } from "next/server";
import { CLIENT_EVENTS, ClientEvent, count, unique } from "@/lib/analytics";
import { allow } from "@/lib/ratelimit";
import { clientIp } from "@/lib/auth";

export const runtime = "nodejs";

/** Anonymous counters from the browser (sent with navigator.sendBeacon). Unknown events are ignored. */
export async function POST(req: Request) {
  let body: { e?: string; d?: string } = {};
  try {
    body = JSON.parse(await req.text());
  } catch {}
  const e = String(body.e ?? "") as ClientEvent;
  const device = /^[a-f0-9]{16,40}$/.test(String(body.d ?? "")) ? String(body.d) : "";
  if (CLIENT_EVENTS.includes(e) && (await allow(`ev:${device || clientIp(req)}`, 300))) {
    await count(e);
    if (device) await unique(e, device);
  }
  return new NextResponse(null, { status: 204 });
}
