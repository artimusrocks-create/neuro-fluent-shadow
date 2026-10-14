// Other teachers' cabinets. Artem (the owner, APP_PASSCODE) invites a teacher: they get a personal
// login link, their own students, homework and recordings, and pay a monthly fee to keep them.
// The owner keeps everything else (money, Telegram, his own students).
import { claimCode, newId, redis } from "./store";

export type Teacher = {
  id: string;
  name: string;
  code: string; // their login; code:<code> → "t:<id>" (the same namespace as students' codes, so codes never clash)
  created: string;
  seats: number; // how many students they may have
  until: string; // their cabinet and their students work until this moment (trial, then paid months)
};

export const TEACHER_PLAN = {
  price: process.env.TEACHER_PRICE_RUB || "1490 ₽",
  seats: 10,
  trialDays: 14,
};

export const teacherActive = (t: Teacher | null | undefined, now = Date.now()) => !!t && Date.parse(t.until) > now;
export const teacherLink = (t: Teacher, origin: string) => `${origin}/teacher?code=${encodeURIComponent(t.code)}`;

export async function getTeacher(id: string): Promise<Teacher | null> {
  const r = redis();
  return r ? ((await r.hget<Teacher>("teachers", id)) ?? null) : null;
}

export async function listTeachers(): Promise<Teacher[]> {
  const r = redis();
  if (!r) return [];
  return Object.values((await r.hgetall<Record<string, Teacher>>("teachers")) ?? {});
}

export async function createTeacher(o: { name: string; seats?: number; days?: number }): Promise<Teacher> {
  const r = redis()!;
  const id = newId(6);
  const t: Teacher = {
    id,
    name: o.name,
    code: await claimCode(o.name, `t:${id}`),
    created: new Date().toISOString(),
    seats: clampSeats(o.seats ?? TEACHER_PLAN.seats),
    until: new Date(Date.now() + Math.max(1, Math.min(400, o.days ?? TEACHER_PLAN.trialDays)) * 86400000).toISOString(),
  };
  await r.hset("teachers", { [id]: t });
  return t;
}

export async function patchTeacher(id: string, patch: Partial<Pick<Teacher, "seats" | "until" | "name">>): Promise<Teacher | null> {
  const r = redis()!;
  const t = await getTeacher(id);
  if (!t) return null;
  const next = { ...t, ...patch, ...(patch.seats !== undefined ? { seats: clampSeats(patch.seats) } : {}) };
  await r.hset("teachers", { [id]: next });
  return next;
}

/** Remove a teacher and their login. Their students' links stop working too (they belong to that cabinet). */
export async function deleteTeacher(id: string): Promise<boolean> {
  const r = redis()!;
  const t = await getTeacher(id);
  if (!t) return false;
  await r.hdel("teachers", id);
  await r.del(`code:${t.code}`);
  return true;
}

const clampSeats = (n: number) => Math.max(1, Math.min(200, Math.round(Number(n) || TEACHER_PLAN.seats)));
