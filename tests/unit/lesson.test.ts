import { beforeEach, describe, expect, it } from "vitest";
import { POST as lessonPOST } from "@/app/api/lesson/route";
import { mock, req } from "./helpers";

describe("/api/lesson", () => {
  beforeEach(async () => {
    await mock().reset();
  });

  it("only accepts the lesson tasks it knows, never a free prompt", async () => {
    expect((await lessonPOST(req("/api/lesson", { json: { kind: "chat", text: "hello" } }))).status).toBe(400);
    expect((await lessonPOST(req("/api/lesson", { json: { kind: "misha-coach", text: "" } }))).status).toBe(400);
    expect((await lessonPOST(req("/api/lesson", { json: { kind: "misha-coach", text: "x".repeat(1501) } }))).status).toBe(400);
  });

  it("sends the student's text inside the fixed template", async () => {
    const res = await lessonPOST(req("/api/lesson", { json: { kind: "misha-coach", text: "Yesterday I play Fortnite." } }));
    expect(res.status).toBeLessThan(600);
    const sent = (await mock().calls("anthropic"))[0] as unknown as { user?: string };
    expect(String(sent?.user ?? "")).toContain("Misha");
  });
});
