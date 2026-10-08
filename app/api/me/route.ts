import { NextResponse } from "next/server";
import { getWho, isResponse, usage, DEMO_LIMITS, STUDENT_LIMITS } from "@/lib/auth";
import { redis } from "@/lib/store";
import { getRecs, publicRec } from "@/lib/recs";
import { jsonError } from "@/lib/server";

export const runtime = "nodejs";

/** Who am I, what did the teacher assign, what feedback did I get, my saved progress. */
export async function GET(req: Request) {
  const who = await getWho(req);
  if (isResponse(who)) return who;
  const r = redis();
  const base = { role: who.role, name: who.name, db: !!r };
  if (!r || who.role === "teacher") return NextResponse.json({ ...base, assigned: [], recs: [], progress: null });

  if (who.role === "demo") {
    return NextResponse.json({ ...base, assigned: [], recs: [], progress: null, limits: DEMO_LIMITS, usage: await usage(who.id) });
  }

  const [assigned, recIds, progress] = await Promise.all([
    r.get<string[]>(`assign:${who.id}`),
    r.lrange<string>(`recs:${who.id}`, 0, 29),
    r.get(`progress:${who.id}`),
  ]);
  const recs = (await getRecs(recIds)).map(publicRec);
  return NextResponse.json({
    ...base,
    assigned: assigned ?? [],
    recs,
    progress,
    limits: { ...STUDENT_LIMITS, ...(who.student.limits ?? {}) },
    usage: await usage(who.id),
  });
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
