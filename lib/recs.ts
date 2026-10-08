import { redis, Stored } from "./store";

export type Rec = {
  id: string;
  studentId: string;
  name: string;
  text: string;
  score: number | null;
  stored: Stored;
  at: string;
  feedback?: string;
  feedbackAt?: string;
  seen?: boolean;
};

export async function getRecs(ids: string[]): Promise<Rec[]> {
  const r = redis();
  if (!r || !ids.length) return [];
  const vals = await r.mget<(Rec | null)[]>(...ids.map((id) => `rec:${id}`));
  return vals.filter((x): x is Rec => !!x);
}

/** Strip storage details before sending to the browser. */
export const publicRec = (x: Rec) => ({
  id: x.id,
  studentId: x.studentId,
  name: x.name,
  text: x.text,
  score: x.score,
  at: x.at,
  feedback: x.feedback ?? null,
  feedbackAt: x.feedbackAt ?? null,
  seen: !!x.seen,
  audio: `/api/rec?id=${x.id}`,
});
