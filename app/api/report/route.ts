import { NextResponse } from "next/server";
import { redis } from "@/lib/store";
import { allow } from "@/lib/ratelimit";
import { clientIp } from "@/lib/auth";
import { notifyTeacher } from "@/lib/pro";
import { count } from "@/lib/analytics";
import type { Report } from "@/lib/reports";

export const runtime = "nodejs";

/**
 * Messages to the teacher that never make anyone leave the app:
 * - "ai": "this AI breakdown is wrong or offensive". Google Play requires in-app flagging of AI-generated content.
 * - "delete": "please delete my data" (the /delete-data page). Google Play's data-deletion question links there.
 * Kept in Redis for the teacher dashboard (Inbox tab), counted for the morning report, and sent to the teacher's Telegram.
 */

const clip = (s: unknown, n: number) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, n);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = body.kind === "ai" || body.kind === "delete" ? body.kind : null;
  if (!kind) return NextResponse.json({ error: "server", message: "Плохой запрос." }, { status: 400 });

  const item: Report = {
    kind,
    text: clip(body.text, 300),
    where: clip(body.where, 20),
    note: clip(body.note, 500),
    contact: clip(body.contact, 120),
    at: new Date().toISOString(),
  };
  if (kind === "ai" && !item.text) return NextResponse.json({ error: "server", message: "Не понял, на какую фразу жалоба." }, { status: 400 });
  if (kind === "delete" && item.contact.length < 3) return NextResponse.json({ error: "server", message: "Оставь почту, Telegram или код доступа, чтобы мы нашли твои данные." }, { status: 400 });

  if (!(await allow(`report:${clientIp(req)}`, 20))) {
    return NextResponse.json({ error: "limit", message: "Слишком много сообщений за день. Напиши Артёму напрямую." }, { status: 429 });
  }

  const r = redis();
  if (r) {
    await r.lpush("reports", item);
    await r.ltrim("reports", 0, 499);
  }
  await count(kind === "ai" ? "report_ai" : "delete_request");
  await notifyTeacher(
    kind === "ai"
      ? `🚩 Жалоба на разбор${item.where ? ` (${item.where})` : ""}: «${item.text}»${item.note ? `\nЧто не так: ${item.note}` : ""}`
      : `🗑 Просят удалить данные: ${item.contact}${item.note ? `\n${item.note}` : ""}\nУдали в /teacher и ответь человеку (срок — 30 дней).`
  );
  return NextResponse.json({ ok: true });
}
