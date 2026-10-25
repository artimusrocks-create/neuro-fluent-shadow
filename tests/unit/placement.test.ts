import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/placement/route";
import { chunks } from "@/lib/placement";
import { redis } from "@/lib/store";
import { mock, req } from "./helpers";

describe("level questionnaire (/level) → teacher's Telegram", () => {
  beforeEach(async () => {
    await mock().reset();
    await redis()!.set("cfg:adminChat", "777");
  });

  it("stores the report and sends it to the teacher, split for Telegram", async () => {
    const report = "🧭 АНКЕТА\n" + Array.from({ length: 300 }, (_, i) => `строка ответа номер ${i}`).join("\n");
    const res = await POST(req("/api/placement", { json: { name: "Лена", contact: "@lena", level: "B1–B2", report } }));
    expect(res.status).toBe(200);
    const saved = await redis()!.lrange<{ name: string; contact: string }>("placements", 0, 9);
    expect(saved[0]).toMatchObject({ name: "Лена", contact: "@lena" });
    const sent = (await mock().calls("telegram")).filter((c) => c.method === "sendMessage");
    expect(String(sent[0]?.body?.text)).toContain("Новая анкета уровня: Лена (@lena) — примерно B1–B2");
    expect(sent.length).toBeGreaterThan(2);
    for (const m of sent) expect(String(m.body?.text).length).toBeLessThanOrEqual(4096);
    expect(String(sent.at(-1)?.body?.chat_id)).toBe("777");
  });

  it("rejects an empty form and caps sends per network", async () => {
    expect((await POST(req("/api/placement", { json: { name: "", report: "x".repeat(100) } }))).status).toBe(400);
    expect((await POST(req("/api/placement", { json: { name: "A", report: "short" } }))).status).toBe(400);
    const ok = { name: "A", report: "x".repeat(100) };
    for (let i = 0; i < 6; i++) expect((await POST(req("/api/placement", { json: ok, headers: { "x-forwarded-for": "10.7.7.7" } }))).status).toBe(200);
    expect((await POST(req("/api/placement", { json: ok, headers: { "x-forwarded-for": "10.7.7.7" } }))).status).toBe(429);
  });

  it("chunks never break the 4096 limit and keep all the text", () => {
    const t = "a".repeat(9000) + "\n" + "b".repeat(100);
    const parts = chunks(t);
    expect(parts.every((p) => p.length <= 3800)).toBe(true);
    expect(parts.join("").replace(/\n/g, "")).toBe(t.replace(/\n/g, ""));
  });
});
