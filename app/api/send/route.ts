import { NextResponse } from "next/server";
import { getWho, isResponse } from "@/lib/auth";
import { blobPut, hasBlob, newId, redis } from "@/lib/store";
import { Rec } from "@/lib/recs";
import { jsonError } from "@/lib/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/** A student sends a recording to the teacher. */
export async function POST(req: Request) {
  const who = await getWho(req);
  if (isResponse(who)) return who;
  if (who.role !== "student") return jsonError("Отправлять записи могут только ученики по личной ссылке.", 403);
  const r = redis();
  if (!r || !hasBlob()) return jsonError("Хранилище для записей ещё не подключено.", 500);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Не получилось прочитать запись.", 400);
  }
  const file = form.get("file");
  const text = String(form.get("text") ?? "").slice(0, 600);
  const scoreRaw = Number(form.get("score"));
  if (!(file instanceof Blob) || !file.size) return jsonError("Запись пустая.", 400);
  if (file.size > 5 * 1024 * 1024) return jsonError("Запись слишком длинная.", 400);

  // Max 30 recordings per student per day.
  const dayCount = await r.incr(`sendcount:${who.id}:${new Date().toISOString().slice(0, 10)}`);
  if (dayCount === 1) await r.expire(`sendcount:${who.id}:${new Date().toISOString().slice(0, 10)}`, 2 * 86400);
  if (dayCount > 30) return jsonError("На сегодня хватит записей. Препод тоже человек.", 429);

  const id = newId(6);
  const ext = (file.type || "").includes("mp4") ? "m4a" : "webm";
  const stored = await blobPut(`recs/${who.id}/${id}.${ext}`, file, file.type || "audio/webm");
  const rec: Rec = {
    id,
    studentId: who.id,
    name: who.name,
    text,
    score: Number.isFinite(scoreRaw) ? scoreRaw : null,
    stored,
    at: new Date().toISOString(),
  };
  await r.set(`rec:${id}`, rec);
  await r.lpush("recs", id);
  await r.ltrim("recs", 0, 499);
  await r.lpush(`recs:${who.id}`, id);
  await r.ltrim(`recs:${who.id}`, 0, 99);
  return NextResponse.json({ ok: true, id });
}
