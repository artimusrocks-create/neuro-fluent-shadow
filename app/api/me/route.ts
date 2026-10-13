import { NextResponse } from "next/server";
import { getWho, isResponse, usage, freeUsed, limitsFor, CONTACT_URL, FREE_PHRASES } from "@/lib/auth";
import { redis } from "@/lib/store";
import { getRecs, publicRec } from "@/lib/recs";
import { offer } from "@/lib/pro";
import { jsonError } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Who am I, what's my plan, what did the teacher assign, what feedback did I get, my saved progress. */
export async function GET(req: Request) {
  const who = await getWho(req);
  if (isResponse(who)) return who;
  const r = redis();
  const base = { role: who.role, name: who.name, db: !!r, offer: await offer() };
  const headers = { "Cache-Control": "no-store" };

  if (!r || who.role === "teacher") {
    return NextResponse.json({ ...base, plan: "teacher", assigned: [], recs: [], progress: null }, { headers });
  }

  if (who.role === "demo") {
    return NextResponse.json(
      {
        ...base,
        plan: "free",
        assigned: [],
        recs: [],
        progress: null,
        limits: limitsFor(who),
        usage: await usage(who.id),
        free: { used: await freeUsed(who), limit: FREE_PHRASES, contact: CONTACT_URL },
        ...(who.lapsed ? { lapsed: { until: who.lapsed.until ?? null } } : {}),
      },
      { headers }
    );
  }

  const s = who.student;
  const [assigned, recIds, progress] = await Promise.all([
    r.get<string[]>(`assign:${who.id}`),
    r.lrange<string>(`recs:${who.id}`, 0, 29),
    r.get(`progress:${who.id}`),
  ]);
  const recs = (await getRecs(recIds)).map(publicRec);
  return NextResponse.json(
    {
      ...base,
      plan: s.plan === "pro" ? "pro" : "class",
      ...(s.plan === "pro" ? { pro: { until: s.until ?? null, autoRenew: !!s.autoRenew, src: s.src ?? null } } : {}),
      assigned: assigned ?? [],
      recs,
      progress,
      limits: limitsFor(who),
      usage: await usage(who.id),
    },
    { headers }
  );
}

/** Save progress (streak, library, badges) so it follows the student to other devices. */
export async function POST(req: Request) {
  const who = await getWho(req);
  if (isResponse(who)) return who;
  const r = redis();
  if (!r || who.role !== "student") return NextResponse.json({ ok: true });
  let body: { progress?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError("Пустой запрос.", 400);
  }
  const raw = JSON.stringify(body.progress ?? null);
  if (raw.length > 400_000) return jsonError("Слишком много данных.", 400);
  await r.set(`progress:${who.id}`, body.progress);
  return NextResponse.json({ ok: true });
}
