import { NextResponse } from "next/server";
import { redis } from "@/lib/store";
import { allow } from "@/lib/ratelimit";
import { clientIp } from "@/lib/auth";
import { notifyTeacher } from "@/lib/pro";
import { count } from "@/lib/analytics";
import { chunks, type Placement } from "@/lib/placement";

export const runtime = "nodejs";

/**
 * The level questionnaire (/level) sends its finished report here.
 * Kept in Redis (last 300) and forwarded to the teacher's Telegram, split into parts
 * because one Telegram message holds at most 4096 characters.
 */

const clip = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const item: Placement = {
    name: clip(body.name, 80),
    contact: clip(body.contact, 120),
    level: clip(body.level, 20),
    report: clip(body.report, 20000),
    at: new Date().toISOString(),
  };
  if (!item.name || item.report.length < 50) {
    return NextResponse.json({ error: "server", message: "Анкета пустая." }, { status: 400 });
  }
  if (!(await allow(`placement:${clientIp(req)}`, 6))) {
    return NextResponse.json({ error: "limit", message: "Слишком много отправок за день. Скопируйте отчёт и отправьте Артёму вручную." }, { status: 429 });
  }

  const r = redis();
  if (r) {
    await r.lpush("placements", item);
    await r.ltrim("placements", 0, 299);
  }
  await count("placement");
  const head = `🧭 Новая анкета уровня: ${item.name}${item.contact ? ` (${item.contact})` : ""}${item.level ? ` — примерно ${item.level}` : ""}`;
  const parts = chunks(item.report);
  await notifyTeacher(head);
  for (const [i, p] of parts.entries()) await notifyTeacher(parts.length > 1 ? `(${i + 1}/${parts.length})\n${p}` : p);
  return NextResponse.json({ ok: true });
}
