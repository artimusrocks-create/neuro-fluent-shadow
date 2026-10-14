// TEMPORARY relay, removed in the commit that adds the baked audio.
// Lets scripts/bake.ts make the pack clips through the live app
// (ELEVENLABS_BASE_URL=<site>/api/bake, ELEVENLABS_API_KEY=<bake secret>), so the real ElevenLabs key never leaves Vercel.
// Locked down: only with the one-time bake secret (only its SHA-256 is here), only pack text,
// only the default voice, only the player's speeds, settings always from lib/voices.ts.
import { createHash, timingSafeEqual } from "node:crypto";
import { PACKS } from "@/lib/packs";
import { DEFAULT_VOICE, ttsBody } from "@/lib/voices";

export const runtime = "nodejs";
export const maxDuration = 60;

const SECRET_SHA256 = "6066bebd614848a3246817ffcd93ff8b30785f357ee50bf2cfa8f0b0eda0a7a0";
const SPEEDS = new Set([0.7, 0.75, 1, 1.15]);
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9']+/g, " ").trim();
const PACK_TEXT = PACKS.flatMap((p) => p.phrases).map(squash);
const ELEVEN = process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io";

type Ctx = { params: Promise<{ path: string[] }> };

function allowed(req: Request) {
  const got = createHash("sha256").update(req.headers.get("xi-api-key") ?? "").digest();
  return timingSafeEqual(got, Buffer.from(SECRET_SHA256, "hex"));
}
const notFound = () => new Response("Not found", { status: 404 });

/** Credits left, so the bake can stop before it runs out. */
export async function GET(req: Request, { params }: Ctx) {
  if (!allowed(req) || (await params).path.join("/") !== "v1/user/subscription") return notFound();
  const res = await fetch(`${ELEVEN}/v1/user/subscription`, { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "" } });
  const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return Response.json({ status: res.status, tier: d.tier, used: d.character_count, limit: d.character_limit, resets: d.next_character_count_reset_unix });
}

export async function POST(req: Request, { params }: Ctx) {
  if (!allowed(req)) return notFound();
  if ((await params).path.join("/") !== `v1/text-to-speech/${DEFAULT_VOICE}/with-timestamps`) return notFound();
  const body = (await req.json().catch(() => ({}))) as { text?: string; voice_settings?: { speed?: number } };
  const text = String(body.text ?? "").trim();
  const speed = Number(body.voice_settings?.speed);
  const t = squash(text);
  if (!t || !SPEEDS.has(speed) || !PACK_TEXT.some((s) => s.includes(t))) return Response.json({ error: "Only pack audio" }, { status: 400 });
  const res = await fetch(`${ELEVEN}/v1/text-to-speech/${DEFAULT_VOICE}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "", "Content-Type": "application/json" },
    body: JSON.stringify(ttsBody(text, speed)),
  });
  return new Response(res.body, { status: res.status, headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" } });
}
