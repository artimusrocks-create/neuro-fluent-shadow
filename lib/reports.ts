/** A message to the teacher sent from inside the app: a flagged AI answer, or a request to delete one's data. */
export type Report = { kind: "ai" | "delete"; text: string; where: string; note: string; contact: string; at: string };
