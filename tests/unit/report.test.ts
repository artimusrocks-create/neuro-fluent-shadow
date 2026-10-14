import { beforeEach, describe, expect, it } from "vitest";
import { POST as reportPOST } from "@/app/api/report/route";
import { GET as teacherGET } from "@/app/api/teacher/route";
import { digestText } from "@/lib/digest";
import { redis, dayKey } from "@/lib/store";
import { mock, req } from "./helpers";

describe("in-app reports (flag an AI answer, ask to delete data)", () => {
  beforeEach(async () => {
    await mock().reset();
    await redis()!.set("cfg:adminChat", "777");
  });

  it("a flagged AI breakdown is stored, counted and sent to the teacher", async () => {
    const res = await reportPOST(req("/api/report", { json: { kind: "ai", text: "Can I get a coffee to go?", where: "breakdown", note: "  неверный   перевод " } }));
    expect(res.status).toBe(200);
    const saved = await redis()!.lrange<{ kind: string; text: string; note: string }>("reports", 0, 9);
    expect(saved[0]).toMatchObject({ kind: "ai", text: "Can I get a coffee to go?", note: "неверный перевод" });
    expect(Number(await redis()!.hget(`ev:${dayKey()}`, "report_ai"))).toBe(1);
    const sent = (await mock().calls("telegram")).filter((c) => c.method === "sendMessage");
    expect(String(sent.at(-1)?.body?.chat_id)).toBe("777");
    expect(String(sent.at(-1)?.body?.text)).toContain("Жалоба на разбор");
  });

  it("rejects junk: unknown kind, empty phrase, deletion without a contact", async () => {
    expect((await reportPOST(req("/api/report", { json: { kind: "spam", text: "x" } }))).status).toBe(400);
    expect((await reportPOST(req("/api/report", { json: { kind: "ai", text: "   " } }))).status).toBe(400);
    expect((await reportPOST(req("/api/report", { json: { kind: "delete", contact: "a" } }))).status).toBe(400);
    expect(await redis()!.lrange("reports", 0, 9)).toEqual([]);
  });

  it("a deletion request reaches the teacher with the contact", async () => {
    const res = await reportPOST(req("/api/report", { json: { kind: "delete", contact: "lena@example.com" } }));
    expect(res.status).toBe(200);
    const sent = (await mock().calls("telegram")).filter((c) => c.method === "sendMessage");
    expect(String(sent.at(-1)?.body?.text)).toContain("lena@example.com");
  });

  it("caps how many reports one network can send per day", async () => {
    for (let i = 0; i < 20; i++) {
      expect((await reportPOST(req("/api/report", { json: { kind: "ai", text: `phrase ${i}` }, headers: { "x-forwarded-for": "10.9.9.9" } }))).status).toBe(200);
    }
    expect((await reportPOST(req("/api/report", { json: { kind: "ai", text: "one more" }, headers: { "x-forwarded-for": "10.9.9.9" } }))).status).toBe(429);
  });

  it("the teacher sees reports in the dashboard, and the morning report counts them", async () => {
    await reportPOST(req("/api/report", { json: { kind: "ai", text: "Gonna grab a bite" } }));
    const dash = await (await teacherGET(req("/api/teacher", { headers: { "x-passcode": "teach-pass" } }))).json();
    expect(dash.reports[0]).toMatchObject({ kind: "ai", text: "Gonna grab a bite" });

    // The digest reports on yesterday: move today's counter there.
    const y = new Date(Date.parse(`${dayKey()}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
    await redis()!.hincrby(`ev:${y}`, "report_ai", 2);
    expect(await digestText()).toContain("Жалоб на разборы: 2");
  });
});
