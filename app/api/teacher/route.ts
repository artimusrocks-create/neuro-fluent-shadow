import { NextResponse } from "next/server";
import { getWho, isActive, isResponse, Student, usage, STUDENT_LIMITS } from "@/lib/auth";
import { newCode, newId, redis } from "@/lib/store";
import { getRecs, publicRec, Rec } from "@/lib/recs";
import { jsonError } from "@/lib/server";
import { setupTelegram, tg, tgConfigured } from "@/lib/telegram";
import { extendUntil, getStudent, grantPro, logPay, offer, patchStudent, payLog, personalLink, proAccounts, revokePro, validEmail } from "@/lib/pro";
import { stats } from "@/lib/analytics";

export const runtime = "nodejs";
export const maxDuration = 30;

type Progress = { days?: string[]; best?: number; library?: unknown[]; badges?: string[]; counts?: Record<string, number> };

function streakOf(days: string[] = []) {
  const set = new Set(days);
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const now = new Date(Date.now() + 4 * 3600 * 1000);
  let d = new Date(now);
  if (!set.has(key(d))) d = new Date(d.getTime() - 86400000);
  let n = 0;
  while (set.has(key(d))) {
    n++;
    d = new Date(d.getTime() - 86400000);
  }
  return n;
}

async function teacherOnly(req: Request) {
  const who = await getWho(req);
  if (isResponse(who)) return who;
  if (who.role !== "teacher") return jsonError("Только для препода.", 403);
  if (!redis()) return jsonError("База данных ещё не подключена. Vercel → Storage → Upstash Redis → Connect, потом Redeploy.", 500);
  return null;
}

export async function GET(req: Request) {
  const denied = await teacherOnly(req);
  if (denied) return denied;
  const r = redis()!;

  const all = (await r.hgetall<Record<string, Student>>("students")) ?? {};
  const seen = (await r.hgetall<Record<string, string>>("seen")) ?? {};
  // Paying Pro customers live in the "Деньги" tab; this list is the teacher's own students.
  const students = await Promise.all(
    Object.values(all).filter((s) => s.plan !== "pro").map(async (s) => {
      const [p, assigned, u] = await Promise.all([r.get<Progress>(`progress:${s.id}`), r.get<string[]>(`assign:${s.id}`), usage(s.id)]);
      return {
        ...s,
        limits: { ...STUDENT_LIMITS, ...(s.limits ?? {}) },
        seen: seen[s.id] ?? null,
        usage: u,
        assigned: assigned ?? [],
        stats: {
          streak: streakOf(p?.days),
          best: p?.best ?? 0,
          daysTotal: p?.days?.length ?? 0,
          saved: p?.library?.length ?? 0,
          badges: p?.badges?.length ?? 0,
          records: p?.counts?.records ?? 0,
        },
      };
    })
  );
  students.sort((a, b) => (b.seen ?? "").localeCompare(a.seen ?? ""));

  const recIds = await r.lrange<string>("recs", 0, 59);
  const recs = (await getRecs(recIds)).map(publicRec);
  const subs = await r.scard("tg:subs");

  const [pros, log, days, off, adminChat] = await Promise.all([proAccounts(), payLog(60), stats(14), offer(), r.get<string>("cfg:adminChat")]);
  const pro = pros
    .map((s) => ({ id: s.id, name: s.name, code: s.code, email: s.email ?? null, tgUser: s.tgUser ?? null, src: s.src ?? null, until: s.until ?? null, autoRenew: !!s.autoRenew, active: isActive(s), seen: seen[s.id] ?? null, canRefundStars: !!(s.tg && s.starsCharge) }))
    .sort((a, b) => Number(b.active) - Number(a.active) || (b.until ?? "").localeCompare(a.until ?? ""));

  return NextResponse.json({
    students,
    recs,
    telegram: { configured: tgConfigured(), subscribers: subs, appUrl: await r.get<string>("cfg:appUrl"), bot: await r.get<string>("cfg:bot"), adminChat: !!(adminChat || process.env.TEACHER_CHAT_ID) },
    money: { pro, log, days, offer: off },
  });
}

export async function POST(req: Request) {
  const denied = await teacherOnly(req);
  if (denied) return denied;
  const r = redis()!;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("Пустой запрос.", 400);
  }

  switch (body.action) {
    case "create": {
      const name = String(body.name ?? "").trim().slice(0, 40);
      if (!name) return jsonError("Напиши имя ученика.", 400);
      const s: Student = { id: newId(6), name, code: newCode(name), created: new Date().toISOString() };
      await r.hset("students", { [s.id]: s });
      await r.set(`code:${s.code}`, s.id);
      return NextResponse.json({ ok: true, student: s });
    }
    case "delete": {
      const id = String(body.id ?? "");
      const s = await r.hget<Student>("students", id);
      if (!s) return jsonError("Нет такого ученика.", 404);
      await r.hdel("students", id);
      await r.del(`code:${s.code}`, `assign:${id}`);
      return NextResponse.json({ ok: true });
    }
    case "assign": {
      const id = String(body.id ?? "");
      const phrases = (Array.isArray(body.phrases) ? body.phrases : [])
        .map((x) => String(x).trim())
        .filter(Boolean)
        .slice(0, 50)
        .map((x) => x.slice(0, 400));
      await r.set(`assign:${id}`, phrases);
      return NextResponse.json({ ok: true });
    }
    case "limits": {
      const id = String(body.id ?? "");
      const s = await r.hget<Student>("students", id);
      if (!s) return jsonError("Нет такого ученика.", 404);
      const l = (body.limits ?? {}) as Record<string, unknown>;
      const clean = Object.fromEntries(
        Object.entries(l)
          .filter(([k]) => k in STUDENT_LIMITS)
          .map(([k, v]) => [k, Math.max(0, Math.min(5000, Number(v) || 0))])
      );
      await r.hset("students", { [id]: { ...s, limits: clean } });
      return NextResponse.json({ ok: true });
    }
    case "feedback": {
      const id = String(body.recId ?? "");
      const rec = await r.get<Rec>(`rec:${id}`);
      if (!rec) return jsonError("Запись не найдена.", 404);
      await r.set(`rec:${id}`, { ...rec, feedback: String(body.text ?? "").slice(0, 2000), feedbackAt: new Date().toISOString(), seen: true });
      return NextResponse.json({ ok: true });
    }
    case "seen": {
      const id = String(body.recId ?? "");
      const rec = await r.get<Rec>(`rec:${id}`);
      if (rec) await r.set(`rec:${id}`, { ...rec, seen: true });
      return NextResponse.json({ ok: true });
    }
    case "grant": {
      const name = String(body.name ?? "").trim().slice(0, 40);
      const email = String(body.email ?? "").trim().toLowerCase();
      const days = Math.max(1, Math.min(400, Math.round(Number(body.days) || 30)));
      if (!name && !email) return jsonError("Напиши имя или почту.", 400);
      if (email && !validEmail(email)) return jsonError("Проверь почту.", 400);
      const { student } = await grantPro({ src: "manual", name: name || undefined, email: email || undefined, days, autoRenew: false });
      await logPay({ src: "manual", kind: "manual", amount: 0, currency: "", who: name || email, studentId: student.id, note: `${days} дн.` });
      return NextResponse.json({ ok: true, student, link: await personalLink(student, new URL(req.url).origin) });
    }
    case "extend": {
      const s = await getStudent(String(body.id ?? ""));
      if (!s || s.plan !== "pro") return jsonError("Нет такого Pro.", 404);
      const days = Math.max(1, Math.min(400, Math.round(Number(body.days) || 30)));
      await patchStudent(s.id, { until: extendUntil(s.until, days) });
      return NextResponse.json({ ok: true });
    }
    case "revoke": {
      const s = await getStudent(String(body.id ?? ""));
      if (!s || s.plan !== "pro") return jsonError("Нет такого Pro.", 404);
      await revokePro(s.id);
      return NextResponse.json({ ok: true });
    }
    case "refundStars": {
      const s = await getStudent(String(body.id ?? ""));
      if (!s || !s.tg || !s.starsCharge) return jsonError("Тут нечего возвращать звёздами.", 400);
      try {
        await tg("refundStarPayment", { user_id: s.tg, telegram_payment_charge_id: s.starsCharge });
      } catch (e) {
        return jsonError(e instanceof Error ? e.message : "Telegram не вернул звёзды.", 502);
      }
      await revokePro(s.id);
      await logPay({ src: "stars", kind: "refund", amount: 0, currency: "XTR", who: s.tgUser ? `@${s.tgUser}` : s.name, studentId: s.id });
      return NextResponse.json({ ok: true });
    }
    case "telegram": {
      const origin = new URL(req.url).origin;
      try {
        const res = await setupTelegram(origin);
        return NextResponse.json({ ok: true, ...res });
      } catch (e) {
        return jsonError(e instanceof Error ? e.message : "Не получилось подключить бота.", 500);
      }
    }
  }
  return jsonError("Неизвестное действие.", 400);
}
