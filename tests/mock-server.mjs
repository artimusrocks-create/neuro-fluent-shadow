// One local server that pretends to be every outside service the app talks to:
// Upstash Redis (REST), Anthropic (Claude), ElevenLabs, Telegram Bot API, lava.top and Resend.
// Used by the unit tests and the browser (e2e) tests, so they run offline and never spend real money.
//
//   node tests/mock-server.mjs            → listens on MOCK_PORT (default 4010)
//   GET  /__calls?service=telegram         → what the app sent to a service
//   POST /__reset                          → forget everything
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------- tiny in-memory Redis ----------
const db = new Map(); // key -> { type, value, exp }
const now = () => Date.now();
function entry(k) {
  const e = db.get(k);
  if (!e) return null;
  if (e.exp && e.exp <= now()) {
    db.delete(k);
    return null;
  }
  return e;
}
const str = (v) => (v === null || v === undefined ? null : String(v));
function getType(k, type, make) {
  const e = entry(k);
  if (e) {
    if (e.type !== type) throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    return e;
  }
  if (!make) return null;
  const n = { type, value: make(), exp: 0 };
  db.set(k, n);
  return n;
}

function exec(cmd) {
  const [name, ...a] = cmd;
  const c = String(name).toLowerCase();
  switch (c) {
    case "ping":
      return "PONG";
    case "flushall":
    case "flushdb":
      db.clear();
      return "OK";
    case "get": {
      const e = getType(a[0], "string");
      return e ? e.value : null;
    }
    case "set": {
      const [k, v, ...opts] = a;
      let nx = false, xx = false, ex = 0, get = false;
      for (let i = 0; i < opts.length; i++) {
        const o = String(opts[i]).toLowerCase();
        if (o === "nx") nx = true;
        else if (o === "xx") xx = true;
        else if (o === "get") get = true;
        else if (o === "ex") ex = Number(opts[++i]) * 1000;
        else if (o === "px") ex = Number(opts[++i]);
        else if (o === "exat") ex = Number(opts[++i]) * 1000 - now();
      }
      const old = entry(k);
      if (nx && old) return get ? old.value : null;
      if (xx && !old) return null;
      db.set(k, { type: "string", value: str(v), exp: ex ? now() + ex : 0 });
      return get ? (old ? old.value : null) : "OK";
    }
    case "del": {
      let n = 0;
      for (const k of a) if (entry(k)) (db.delete(k), n++);
      return n;
    }
    case "exists":
      return a.filter((k) => entry(k)).length;
    case "incr":
    case "decr":
    case "incrby":
    case "decrby": {
      const k = a[0];
      const by = c === "incr" ? 1 : c === "decr" ? -1 : c === "incrby" ? Number(a[1]) : -Number(a[1]);
      const e = getType(k, "string", () => "0");
      const n = Number(e.value) + by;
      e.value = String(n);
      return n;
    }
    case "expire":
    case "pexpire": {
      const e = entry(a[0]);
      if (!e) return 0;
      e.exp = now() + Number(a[1]) * (c === "expire" ? 1000 : 1);
      return 1;
    }
    case "ttl": {
      const e = entry(a[0]);
      if (!e) return -2;
      return e.exp ? Math.ceil((e.exp - now()) / 1000) : -1;
    }
    case "mget":
      return a.map((k) => {
        const e = entry(k);
        return e && e.type === "string" ? e.value : null;
      });
    case "keys": {
      const re = new RegExp("^" + String(a[0]).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
      return [...db.keys()].filter((k) => entry(k) && re.test(k));
    }
    // sets
    case "sadd": {
      const e = getType(a[0], "set", () => new Set());
      let n = 0;
      for (const m of a.slice(1)) if (!e.value.has(str(m))) (e.value.add(str(m)), n++);
      return n;
    }
    case "srem": {
      const e = getType(a[0], "set");
      if (!e) return 0;
      let n = 0;
      for (const m of a.slice(1)) if (e.value.delete(str(m))) n++;
      return n;
    }
    case "sismember": {
      const e = getType(a[0], "set");
      return e && e.value.has(str(a[1])) ? 1 : 0;
    }
    case "scard": {
      const e = getType(a[0], "set");
      return e ? e.value.size : 0;
    }
    case "smembers": {
      const e = getType(a[0], "set");
      return e ? [...e.value] : [];
    }
    // hashes
    case "hset": {
      const e = getType(a[0], "hash", () => new Map());
      let n = 0;
      for (let i = 1; i + 1 < a.length; i += 2) {
        if (!e.value.has(str(a[i]))) n++;
        e.value.set(str(a[i]), str(a[i + 1]));
      }
      return n;
    }
    case "hget": {
      const e = getType(a[0], "hash");
      return e && e.value.has(str(a[1])) ? e.value.get(str(a[1])) : null;
    }
    case "hmget": {
      const e = getType(a[0], "hash");
      return a.slice(1).map((f) => (e && e.value.has(str(f)) ? e.value.get(str(f)) : null));
    }
    case "hgetall": {
      const e = getType(a[0], "hash");
      return e ? [...e.value.entries()].flat() : [];
    }
    case "hdel": {
      const e = getType(a[0], "hash");
      if (!e) return 0;
      let n = 0;
      for (const f of a.slice(1)) if (e.value.delete(str(f))) n++;
      return n;
    }
    case "hincrby":
    case "hincrbyfloat": {
      const e = getType(a[0], "hash", () => new Map());
      const f = str(a[1]);
      const n = Number(e.value.get(f) ?? 0) + Number(a[2]);
      e.value.set(f, String(n));
      return c === "hincrby" ? n : String(n);
    }
    // lists
    case "lpush": {
      const e = getType(a[0], "list", () => []);
      for (const v of a.slice(1)) e.value.unshift(str(v));
      return e.value.length;
    }
    case "lrange": {
      const e = getType(a[0], "list");
      if (!e) return [];
      const len = e.value.length;
      let s = Number(a[1]), t = Number(a[2]);
      if (s < 0) s = Math.max(0, len + s);
      if (t < 0) t = len + t;
      return e.value.slice(s, t + 1);
    }
    case "ltrim": {
      const e = getType(a[0], "list");
      if (!e) return "OK";
      const len = e.value.length;
      let s = Number(a[1]), t = Number(a[2]);
      if (s < 0) s = Math.max(0, len + s);
      if (t < 0) t = len + t;
      e.value = e.value.slice(s, t + 1);
      return "OK";
    }
    // hyperloglog (exact, it's a test)
    case "pfadd": {
      const e = getType(a[0], "hll", () => new Set());
      const before = e.value.size;
      for (const m of a.slice(1)) e.value.add(str(m));
      return e.value.size > before ? 1 : 0;
    }
    case "pfcount": {
      const all = new Set();
      for (const k of a) {
        const e = getType(k, "hll");
        if (e) for (const m of e.value) all.add(m);
      }
      return all.size;
    }
  }
  throw new Error(`ERR mock does not support '${c}'`);
}

function encode(v, b64) {
  if (!b64) return v;
  if (typeof v === "string") return v === "OK" ? v : Buffer.from(v, "utf8").toString("base64");
  if (Array.isArray(v)) return v.map((x) => encode(x, b64));
  return v;
}
function runOne(cmd, b64) {
  try {
    return { result: encode(exec(cmd), b64) };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

// ---------- canned AI answers ----------
const CAPS = (w) => (w.length > 3 ? w.toUpperCase() : w.toLowerCase());
function breakdownFor(text) {
  const words = text.trim().split(/\s+/);
  return {
    sentences: [
      {
        text: text.trim(),
        clear: words.map(CAPS).join(" "),
        fast: words.join("").toLowerCase().slice(0, 60),
        rhythm: words.map(CAPS).join(" "),
        blobs: [],
        chunks: [text.trim()],
        shadow_tip: "Тестовая подсказка: бей по ударным словам.",
        ru_tip: "",
        flags: [],
        cyrillic: {},
      },
    ],
  };
}
function wordsFor(sentence) {
  return {
    words: sentence
      .replace(/[^\w\s']/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => ({ word: w, type: "content", ru: "перевод", sound: w.toUpperCase(), nuance: "Тест.", etymology: "Тест.", etymology_unsure: false, collocations: [] })),
  };
}
const SAMPLE_MP3 = (() => {
  try {
    const dir = path.join(ROOT, "public", "baked", "a");
    const f = fs.readdirSync(dir).find((x) => x.endsWith(".mp3"));
    return fs.readFileSync(path.join(dir, f)).toString("base64");
  } catch {
    return "";
  }
})();
function alignmentFor(text) {
  const chars = [...text];
  return { characters: chars, character_start_times_seconds: chars.map((_, i) => i * 0.05), character_end_times_seconds: chars.map((_, i) => i * 0.05 + 0.05) };
}

// ---------- recorded calls ----------
const calls = { telegram: [], resend: [], lava: [], anthropic: [], elevenlabs: [] };
const record = (service, entry) => calls[service].push({ at: new Date().toISOString(), ...entry });

function send(res, status, body, headers = {}) {
  const isStr = typeof body === "string";
  res.writeHead(status, { "Content-Type": isStr ? "text/html; charset=utf-8" : "application/json", ...headers });
  res.end(isStr ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

export function createMockServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const p = url.pathname;
    const raw = await readBody(req);
    const text = raw.toString("utf8");
    const json = () => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    };

    // --- control ---
    if (p === "/__reset") {
      db.clear();
      for (const k of Object.keys(calls)) calls[k] = [];
      return send(res, 200, { ok: true });
    }
    if (p === "/__calls") return send(res, 200, calls[url.searchParams.get("service") ?? "telegram"] ?? []);
    if (p === "/__redis") return send(res, 200, runOne(json() ?? ["ping"], false));

    // --- Anthropic ---
    if (p === "/v1/messages") {
      const body = json() ?? {};
      const system = Array.isArray(body.system) ? body.system.map((b) => b.text).join("\n") : String(body.system ?? "");
      const user = String(body.messages?.[0]?.content ?? "");
      record("anthropic", { system: system.slice(0, 80), user: user.slice(0, 200) });
      const input = user.replace(/^(INPUT|PHRASE):\n/, "");
      const isWords = /word-by-word/.test(system + user);
      const out = isWords ? wordsFor(input) : breakdownFor(input);
      return send(res, 200, {
        id: "msg_mock",
        type: "message",
        role: "assistant",
        model: body.model ?? "mock",
        content: [{ type: "text", text: JSON.stringify(out) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      });
    }

    // --- ElevenLabs ---
    if (/^\/v1\/text-to-speech\/[^/]+\/with-timestamps$/.test(p)) {
      const body = json() ?? {};
      record("elevenlabs", { kind: "tts", text: body.text });
      return send(res, 200, { audio_base64: SAMPLE_MP3, alignment: alignmentFor(String(body.text ?? "")) });
    }
    if (p === "/v1/speech-to-text") {
      record("elevenlabs", { kind: "stt" });
      return send(res, 200, { text: "Can I get a coffee to go?", words: "Can I get a coffee to go?".split(" ").map((w, i) => ({ text: w, type: "word", start: i * 0.3, end: i * 0.3 + 0.25 })) });
    }

    // --- Telegram Bot API ---
    const tgm = p.match(/^\/bot([^/]+)\/(\w+)$/);
    if (tgm) {
      const method = tgm[2];
      const body = json() ?? {};
      record("telegram", { method, body });
      const results = {
        getMe: { id: 42, is_bot: true, username: "nf_shadow_test_bot" },
        createInvoiceLink: `https://t.me/$mockinvoice_${Math.random().toString(36).slice(2, 8)}`,
        getWebhookInfo: { url: "", allowed_updates: [] },
        sendMessage: { message_id: calls.telegram.length },
      };
      return send(res, 200, { ok: true, result: results[method] ?? true });
    }

    // --- lava.top ---
    if (p === "/api/v3/invoice" && req.method === "POST") {
      const body = json() ?? {};
      if (!req.headers["x-api-key"]) return send(res, 401, { error: "no api key" });
      const id = randomUUID();
      record("lava", { id, body });
      return send(res, 201, { id, status: "new", amountTotal: { currency: body.currency, amount: body.currency === "RUB" ? 690 : 9 }, paymentUrl: `http://localhost:${process.env.MOCK_PORT || 4010}/lava-pay/${id}` });
    }
    if (p.startsWith("/lava-pay/")) {
      return send(res, 200, `<!doctype html><html lang="ru"><body><h1>Mock lava.top payment ${p.split("/").pop()}</h1></body></html>`);
    }

    // --- Resend ---
    if (p === "/emails") {
      record("resend", { body: json() });
      return send(res, 200, { id: randomUUID() });
    }

    // --- Upstash Redis REST ---
    if (req.method === "POST") {
      const b64 = String(req.headers["upstash-encoding"] ?? "").toLowerCase() === "base64";
      const body = json();
      if (p === "/pipeline" || p === "/multi-exec") return send(res, 200, (body ?? []).map((cmd) => runOne(cmd, b64)));
      if (p === "/" && Array.isArray(body)) return send(res, 200, runOne(body, b64));
    }

    send(res, 404, { error: `mock: nothing at ${req.method} ${p}` });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.MOCK_PORT || 4010);
  createMockServer().listen(port, () => console.log(`mock services on http://localhost:${port}`));
}
