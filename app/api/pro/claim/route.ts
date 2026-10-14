import { NextResponse } from "next/server";
import { EXTENDED, getClaim, validNonce } from "@/lib/pro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** After paying (in Telegram or on lava.top) the browser asks: is my payment through, and what's my code? */
export async function GET(req: Request) {
  const nonce = new URL(req.url).searchParams.get("nonce") ?? "";
  if (!validNonce(nonce)) return NextResponse.json({ error: "server", message: "Плохой запрос." }, { status: 400 });
  const code = await getClaim(nonce);
  const body = !code ? { pending: true } : code === EXTENDED ? { extended: true } : { code };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
