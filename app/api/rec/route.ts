import { getWho, isResponse } from "@/lib/auth";
import { blobRead, redis } from "@/lib/store";
import { Rec } from "@/lib/recs";
import { jsonError } from "@/lib/server";

export const runtime = "nodejs";

/** Play a recording. Only the teacher or the student who made it. The code comes as ?code= so <audio> tags work. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const headers = new Headers(req.headers);
  if (code) headers.set("x-passcode", code);
  const who = await getWho(new Request(req.url, { headers }));
  if (isResponse(who)) return who;
  const r = redis();
  if (!r) return jsonError("База не подключена.", 500);
  const rec = await r.get<Rec>(`rec:${id}`);
  if (!rec) return jsonError("Запись не найдена.", 404);
  if (who.role !== "teacher" && !(who.role === "student" && who.id === rec.studentId)) return jsonError("Нет доступа.", 403);
  const file = await blobRead(rec.stored);
  if (!file) return jsonError("Файл записи пропал.", 404);
  return new Response(file.stream, { headers: { "Content-Type": file.type, "Cache-Control": "private, max-age=3600" } });
}
