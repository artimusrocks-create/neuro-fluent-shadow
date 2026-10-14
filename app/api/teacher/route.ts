import { NextResponse } from "next/server";
import { getWho, isActive, isOwner, isResponse, Student, usage, STUDENT_LIMITS, TEACHER_STUDENT_LIMITS, Who } from "@/lib/auth";
import { claimCode, newId, redis } from "@/lib/store";
import { getRecs, publicRec, Rec } from "@/lib/recs";
import { jsonError } from "@/lib/server";
import { setupTelegram, tg, tgConfigured } from "@/lib/telegram";
import { extendUntil, getStudent, grantPro, logPay, offer, patchStudent, payLog, personalLink, proAccounts, refundMonth, revokePro, validEmail } from "@/lib/pro";
import { stats } from "@/lib/analytics";
import type { Report } from "@/lib/reports";
import { TEACHER_PLAN, createTeacher, deleteTeacher, getTeacher, listTeachers, patchTeacher, teacherActive, teacherLink } from "@/lib/teachers";

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

type TeacherWho = Extract<Who, { role: "teacher" }>;

async function teacherOnly(req: Request): Promise<TeacherWho | NextResponse> {
  const who = await getWho(req);
  if (isResponse(who)) return who;
  // "passcode" makes the cabinet show the password box again (a wrong or old code saved in the browser).
  if (who.role !== "teacher") return NextResponse.json({ error: "passcode", message: "Пароль препода не подошёл." }, { status: 403 });
  if (!redis()) return jsonError("База данных ещё не подключена. Vercel → Storage → Upstash Redis → Connect, потом Redeploy.", 500);
  return who;
}

/** Whose students and recordings these are: the owner's own (no teacher), or one invited teacher's. */
const mine = (who: TeacherWho, x: { teacher?: string } | null | undefined) => !!x && (who.teacher ? x.teacher === who.teacher.id : !x.teacher);
const ownerOnly = () => jsonError("Это может только Артём.", 403);

export async function GET(req: Request) {
  const who = await teacherOnly(req);
  if (isResponse(who)) return who;
  const r = redis()!;
  const owner = isOwner(who);
  const caps = who.teacher ? TEACHER_STUDENT_LIMITS : STUDENT_LIMITS;

  const all = (await r.hgetall<Record<string, Student>>("students")) ?? {};
  const seen = (await r.hgetall<Record<string, string>>("seen")) ?? {};
  // Paying Pro customers live in the "Деньги" tab; this list is this cabinet's own students.
  const students = await Promise.all(
    Object.values(all).filter((s) => s.plan !== "pro" && mine(who, s)).map(async (s) => {
      const [p, assigned, u] = await Promise.all([r.get<Progress>(`progress:${s.id}`), r.get<string[]>(`assign:${s.id}`), usage(s.id)]);
      return {
        ...s,
        limits: { ...caps, ...(s.limits ?? {}) },
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

  const recIds = await r.lrange<string>(who.teacher ? `trecs:${who.teacher.id}` : "recs", 0, 59);
  const recs = (await getRecs(recIds)).filter((x) => mine(who, x)).map(publicRec);
  const bot = await r.get<string>("cfg:bot");
  const me = {
    owner,
    name: who.name,
    ...(who.teacher
      ? { until: who.teacher.until, active: teacherActive(who.teacher), seats: who.teacher.seats, used: students.length, price: TEACHER_PLAN.price, contact: process.env.CONTACT_URL || "https://t.me/rawmeatsalad" }
      : {}),
    caps,
  };
  if (!owner) {
    // An invited teacher: their students and recordings only. Money and Telegram settings stay the owner's.
    return NextResponse.json({ me, students, recs, telegram: { configured: false, subscribers: 0, appUrl: null, bot, adminChat: false }, money: null, reports: [] });
  }

  const subs = await r.scard("tg:subs");

  const [pros, log, days, off, adminChat, reports] = await Promise.all([proAccounts(), payLog(60), stats(14), offer(), r.get<string>("cfg:adminChat"), r.lrange<Report>("reports", 0, 49)]);
  const pro = pros
    .map((s) => ({ id: s.id, name: s.name, code: s.code, email: s.email ?? null, tgUser: s.tgUser ?? null, src: s.src ?? null, until: s.until ?? null, autoRenew: !!s.autoRenew, active: isActive(s), seen: seen[s.id] ?? null, canRefundStars: !!(s.tg && s.starsCharge) }))
    .sort((a, b) => Number(b.active) - Number(a.active) || (b.until ?? "").localeCompare(a.until ?? ""));

  // Invited teachers: their cabinet, how many students, until when it's paid, their invite link.
  const origin = new URL(req.url).origin;
  const counts: Record<string, number> = {};
  for (const s of Object.values(all)) if (s.teacher) counts[s.teacher] = (counts[s.teacher] ?? 0) + 1;
  const teachers = (await listTeachers())
    .map((t) => ({ id: t.id, name: t.name, seats: t.seats, until: t.until, active: teacherActive(t), students: counts[t.id] ?? 0, link: teacherLink(t, origin), created: t.created }))
    .sort((a, b) => b.created.localeCompare(a.created));

  return NextResponse.json({
    me,
    students,
    recs,
    telegram: { configured: tgConfigured(), subscribers: subs, appUrl: await r.get<string>("cfg:appUrl"), bot, adminChat: !!(adminChat || process.env.TEACHER_CHAT_ID) },
    money: { pro, log, days, offer: off },
    reports: reports ?? [],
    teachers,
    teacherPlan: TEACHER_PLAN,
  });
}

export async function POST(req: Request) {
  const who = await teacherOnly(req);
  if (isResponse(who)) return who;
  const r = redis()!;
  const owner = isOwner(who);
  const ownStudent = async (id: string) => {
    const s = await r.hget<Student>("students", id);
    return s && s.plan !== "pro" && mine(who, s) ? s : null;
  };
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
      if (who.teacher) {
        const t = await getTeacher(who.teacher.id);
        if (!teacherActive(t)) return jsonError("Оплаченный период закончился. Чтобы добавлять учеников, продли кабинет.", 402);
        const all = (await r.hgetall<Record<string, Student>>("students")) ?? {};
        const used = Object.values(all).filter((s) => s.teacher === t!.id).length;
        if (used >= t!.seats) return jsonError(`Все места заняты: ${t!.seats} из ${t!.seats}. Удали ученика или напиши Артёму, чтобы добавить мест.`, 402);
      }
      const id = newId(6);
      const s: Student = { id, name, code: await claimCode(name, id), created: new Date().toISOString(), ...(who.teacher ? { teacher: who.teacher.id } : {}) };
      await r.hset("students", { [s.id]: s });
      return NextResponse.json({ ok: true, student: s });
    }
    case "delete": {
      const id = String(body.id ?? "");
      const s = await ownStudent(id);
      if (!s) return jsonError("Нет такого ученика.", 404);
      await r.hdel("students", id);
      await r.del(`code:${s.code}`, `assign:${id}`);
      return NextResponse.json({ ok: true });
    }
    case "assign": {
      const id = String(body.id ?? "");
      if (!(await ownStudent(id))) return jsonError("Нет такого ученика.", 404);
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
      const s = await ownStudent(id);
      if (!s) return jsonError("Нет такого ученика.", 404);
      const l = (body.limits ?? {}) as Record<string, unknown>;
      // An invited teacher can lower their students' limits, not raise them past the plan.
      const max = (k: string) => (who.teacher ? TEACHER_STUDENT_LIMITS[k as keyof typeof TEACHER_STUDENT_LIMITS] : 5000);
      const clean = Object.fromEntries(
        Object.entries(l)
          .filter(([k]) => k in STUDENT_LIMITS)
          .map(([k, v]) => [k, Math.max(0, Math.min(max(k), Number(v) || 0))])
      );
      await r.hset("students", { [id]: { ...s, limits: clean } });
      return NextResponse.json({ ok: true });
    }
    case "feedback": {
      const id = String(body.recId ?? "");
      const rec = await r.get<Rec>(`rec:${id}`);
      if (!rec || !mine(who, rec)) return jsonError("Запись не найдена.", 404);
      await r.set(`rec:${id}`, { ...rec, feedback: String(body.text ?? "").slice(0, 2000), feedbackAt: new Date().toISOString(), seen: true });
      return NextResponse.json({ ok: true });
    }
    case "seen": {
      const id = String(body.recId ?? "");
      const rec = await r.get<Rec>(`rec:${id}`);
      if (rec && mine(who, rec)) await r.set(`rec:${id}`, { ...rec, seen: true });
      return NextResponse.json({ ok: true });
    }
  }

  // Everything below is the owner's: money, Telegram, and inviting teachers.
  if (!owner) return ownerOnly();
  switch (body.action) {
    case "teacherCreate": {
      const name = String(body.name ?? "").trim().slice(0, 40);
      if (!name) return jsonError("Напиши имя учителя.", 400);
      const t = await createTeacher({ name, seats: Number(body.seats) || TEACHER_PLAN.seats, days: Number(body.days) || TEACHER_PLAN.trialDays });
      return NextResponse.json({ ok: true, teacher: t, link: teacherLink(t, new URL(req.url).origin) });
    }
    case "teacherExtend": {
      const t = await getTeacher(String(body.id ?? ""));
      if (!t) return jsonError("Нет такого учителя.", 404);
      const days = Math.max(1, Math.min(400, Math.round(Number(body.days) || 30)));
      await patchTeacher(t.id, { until: extendUntil(t.until, days) });
      return NextResponse.json({ ok: true });
    }
    case "teacherSeats": {
      if (!(await patchTeacher(String(body.id ?? ""), { seats: Number(body.seats) }))) return jsonError("Нет такого учителя.", 404);
      return NextResponse.json({ ok: true });
    }
    case "teacherDelete": {
      if (!(await deleteTeacher(String(body.id ?? "")))) return jsonError("Нет такого учителя.", 404);
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
      await refundMonth(s.id); // one month back (the refunded payment), renewals off
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
