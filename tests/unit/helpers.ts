export const mock = () =>
  (globalThis as unknown as { __mock: { base: string; calls: (s: string) => Promise<{ method?: string; body?: Record<string, unknown> }[]>; reset: () => Promise<void> } }).__mock;

export const req = (path: string, init: RequestInit & { json?: unknown } = {}) => {
  const { json, headers, ...rest } = init;
  return new Request(`http://localhost:3000${path}`, {
    method: json !== undefined ? "POST" : "GET",
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), "x-forwarded-for": "10.0.0.1", ...(headers as Record<string, string>) },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  });
};
