import { NextResponse } from "next/server";
import { clientIp, CONTACT_URL, isActive, Student } from "@/lib/auth";
import { jsonError } from "@/lib/server";
import { redis } from "@/lib/store";
import { allow } from "@/lib/ratelimit";
import { normEmail, sendAccessEmail, validEmail } from "@/lib/pro";

export const runtime = "nodejs";

/** "I paid but lost my link": email the personal link again. Same answer whether or not the email exists. */
export async function POST(req: Request) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return NextResponse.json({ manual: true, contact: CONTACT_URL });
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Пустой запрос.", 400);
  }
  const email = normEmail(body.email);
  if (!validEmail(email)) return jsonError("Проверь адрес почты.", 400);
  if (!(await allow(`restore:${clientIp(req)}`, 5)) || !(await allow(`restore-mail:${email}`, 3))) {
    return jsonError("Слишком много попыток. Попробуй завтра или напиши мне.", 429);
  }
  const r = redis();
  const id = r ? await r.get<string>(`pro:email:${email}`) : null;
  const s = id && r ? await r.hget<Student>("students", id) : null;
  if (s && isActive(s)) await sendAccessEmail(s, new URL(req.url).origin);
  return NextResponse.json({ sent: true });
}
