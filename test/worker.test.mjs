/* Run with:  node test/worker.test.mjs   (Node 18+) */
import assert from "node:assert";
import worker, { normaliseReading } from "../worker/worker.js";

class MockKV {
  constructor() { this.m = new Map(); }
  async get(k) { const v = this.m.get(k); return v ? v.value : null; }
  async getWithMetadata(k) { const v = this.m.get(k); return v ? { value: v.value, metadata: v.metadata } : { value: null, metadata: null }; }
  async put(k, value, o = {}) { this.m.set(k, { value, metadata: o.metadata || null }); }
  async delete(k) { this.m.delete(k); }
  async list({ prefix }) { return { keys: [...this.m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })) }; }
}
const env = () => ({ SP: new MockKV(), APP_KEY: "app-secret-123", INBOX_KEY: "inbox-secret-456", ALLOWED_ORIGINS: "https://me.github.io" });
const call = async (e, method, path, { key, body, origin } = {}) => {
  const h = { "Content-Type": "application/json" };
  if (key) h.Authorization = "Bearer " + key;
  if (origin) h.Origin = origin;
  const res = await worker.fetch(new Request("https://w.dev" + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), e);
  let data = null; try { data = await res.json(); } catch (x) { }
  return { status: res.status, data, headers: res.headers };
};
let pass = 0;
const test = async (n, f) => { try { await f(); pass++; console.log("  ok  " + n); } catch (e) { console.error("  FAIL " + n + "\n       " + e.message); process.exit(1); } };

console.log("Setpoint worker");
await test("health check needs no key", async () => {
  const r = await call(env(), "GET", "/"); assert.strictEqual(r.status, 200); assert.strictEqual(r.data.configured, true);
});
await test("state requires the app key; inbox key is refused", async () => {
  const e = env();
  assert.strictEqual((await call(e, "GET", "/state")).status, 401);
  assert.strictEqual((await call(e, "GET", "/state", { key: "inbox-secret-456" })).status, 401);
  assert.strictEqual((await call(e, "GET", "/state", { key: "app-secret-123" })).status, 200);
});
await test("state round-trips with optimistic versioning", async () => {
  const e = env(), key = "app-secret-123";
  const a = await call(e, "GET", "/state", { key }); assert.deepStrictEqual([a.data.ver, a.data.blob], [0, null]);
  const p1 = await call(e, "PUT", "/state", { key, body: { base: 0, blob: { ct: "abc" } } }); assert.strictEqual(p1.data.ver, 1);
  const stale = await call(e, "PUT", "/state", { key, body: { base: 0, blob: { ct: "old" } } });
  assert.strictEqual(stale.status, 409); assert.strictEqual(stale.data.blob.ct, "abc");
  const p2 = await call(e, "PUT", "/state", { key, body: { base: 1, blob: { ct: "def" } } }); assert.strictEqual(p2.data.ver, 2);
  assert.strictEqual((await call(e, "GET", "/state", { key })).data.blob.ct, "def");
});
await test("inbox key can post but not read or delete", async () => {
  const e = env();
  const p = await call(e, "POST", "/inbox", { key: "inbox-secret-456", body: { date: "2026-09-25", weight: "86.2 kg", bodyFat: 0.318, steps: "8,412" } });
  assert.strictEqual(p.status, 200);
  assert.strictEqual((await call(e, "GET", "/inbox", { key: "inbox-secret-456" })).status, 401);
  const g = await call(e, "GET", "/inbox", { key: "app-secret-123" });
  assert.strictEqual(g.data.items.length, 1);
  assert.strictEqual(g.data.items[0].weight, 86.2);
  assert.strictEqual(g.data.items[0].bodyFat, 31.8);
  const d = await call(e, "DELETE", "/inbox", { key: "app-secret-123", body: { keys: [g.data.items[0].key] } });
  assert.strictEqual(d.data.deleted, 1);
  assert.strictEqual((await call(e, "GET", "/inbox", { key: "app-secret-123" })).data.items.length, 0);
});
await test("no key at all cannot post", async () => {
  assert.strictEqual((await call(env(), "POST", "/inbox", { body: { date: "2026-09-25", weight: 80 } })).status, 401);
});
await test("readings are normalised from Shortcut formats", async () => {
  assert.deepStrictEqual(normaliseReading({ date: "25/09/2026", weight: "190 lb" }).weight, 86.18);
  assert.strictEqual(normaliseReading({ date: "2026-09-25T07:12:00+08:00", bodyFat: "32%" }).bodyFat, 32);
  assert.strictEqual(normaliseReading({ date: "2026-09-25", weight: 5 }), null);   // not a plausible weight
  assert.strictEqual(normaliseReading({ weight: 80 }), null);                      // no date
});
await test("CORS only reflects the allowed origin", async () => {
  const ok = await call(env(), "GET", "/", { origin: "https://me.github.io" });
  assert.strictEqual(ok.headers.get("Access-Control-Allow-Origin"), "https://me.github.io");
  const bad = await call(env(), "GET", "/", { origin: "https://evil.example" });
  assert.notStrictEqual(bad.headers.get("Access-Control-Allow-Origin"), "https://evil.example");
});

await test("AI: needs the app key, a provider, and respects the daily limit", async () => {
  const e = env();
  assert.strictEqual((await call(e, "POST", "/ai", { body: { prompt: "hi" } })).status, 401);
  assert.strictEqual((await call(e, "POST", "/ai", { key: "app-secret-123", body: { prompt: "hi" } })).status, 501);
  let sent = null;
  e.OPENAI_API_KEY = "sk-test"; e.AI_DAILY_LIMIT = "2";
  e.FETCH = async (url, opt) => { sent = { url, body: JSON.parse(opt.body), auth: opt.headers.Authorization };
    return new Response(JSON.stringify({ model: "gpt-x", choices: [{ message: { content: "SETPOINT\nRice | 1 | 300 | 5 | 1 | 65" } }] }), { status: 200 }); };
  const img = "data:image/jpeg;base64,/9j/AAAA";
  const r = await call(e, "POST", "/ai", { key: "app-secret-123", body: { task: "food", prompt: "estimate", image: img } });
  assert.strictEqual(r.status, 200); assert.ok(r.data.text.startsWith("SETPOINT"));
  assert.strictEqual(sent.auth, "Bearer sk-test");
  assert.strictEqual(sent.body.messages[0].content[1].image_url.url, img);
  assert.strictEqual((await call(e, "POST", "/ai", { key: "app-secret-123", body: { prompt: "again" } })).status, 200);
  assert.strictEqual((await call(e, "POST", "/ai", { key: "app-secret-123", body: { prompt: "third" } })).status, 429);
  assert.strictEqual((await call(e, "POST", "/ai", { key: "app-secret-123", body: { prompt: "x", image: "http://evil/x.png" } })).status, 400);
  assert.strictEqual((await call(e, "GET", "/")).data.ai, "openai");
});
await test("AI: game key is scoped to the Anime Fusion judge and has its own limit", async () => {
  const e = env(); e.GAME_KEY = "game-secret-789"; e.OPENAI_API_KEY = "sk-test"; e.AI_DAILY_LIMIT = "1"; e.GAME_AI_DAILY_LIMIT = "2";
  let sent = null;
  e.FETCH = async (url, opt) => { sent = JSON.parse(opt.body); return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 }); };
  const game = "game-secret-789", task = "anime-fusion-judge";
  // locked out of everything that isn't /ai
  for (const [m, path] of [["GET", "/state"], ["PUT", "/state"], ["GET", "/inbox"], ["POST", "/inbox"], ["GET", "/capture"], ["POST", "/capture"], ["DELETE", "/capture"]])
    assert.strictEqual((await call(e, m, path, { key: game, body: m === "GET" ? undefined : {} })).status, 401, m + " " + path);
  // only the judge task, text only, short prompts
  assert.strictEqual((await call(e, "POST", "/ai", { key: game, body: { task: "food", prompt: "x" } })).status, 403);
  assert.strictEqual((await call(e, "POST", "/ai", { key: game, body: { prompt: "x" } })).status, 403);
  assert.strictEqual((await call(e, "POST", "/ai", { key: game, body: { task, prompt: "x", image: "data:image/png;base64,iVBOR" } })).status, 403);
  assert.strictEqual((await call(e, "POST", "/ai", { key: game, body: { task, prompt: "x".repeat(24001) } })).status, 413);
  // works, and output tokens are capped
  const ok = await call(e, "POST", "/ai", { key: game, body: { task, prompt: "judge", maxTokens: 99999 } });
  assert.strictEqual(ok.status, 200); assert.strictEqual(sent.max_tokens, 2500);
  // separate counters: the game hitting its cap leaves Setpoint's quota alone, and vice versa
  assert.strictEqual((await call(e, "POST", "/ai", { key: game, body: { task, prompt: "judge" } })).status, 200);
  const capped = await call(e, "POST", "/ai", { key: game, body: { task, prompt: "judge" } });
  assert.strictEqual(capped.status, 429); assert.ok(capped.data.error.includes("GAME_AI_DAILY_LIMIT"));
  assert.strictEqual((await call(e, "POST", "/ai", { key: "app-secret-123", body: { prompt: "coach" } })).status, 200);
  assert.strictEqual((await call(e, "POST", "/ai", { key: "app-secret-123", body: { prompt: "coach" } })).status, 429);
  assert.strictEqual((await call(e, "GET", "/")).data.game, true);
});
await test("AI: an unset GAME_KEY never matches an empty or missing token", async () => {
  const e = env(); e.OPENAI_API_KEY = "sk-test";
  assert.strictEqual((await call(e, "POST", "/ai", { body: { task: "anime-fusion-judge", prompt: "x" } })).status, 401);
  assert.strictEqual((await call(e, "POST", "/ai", { key: "undefined", body: { task: "anime-fusion-judge", prompt: "x" } })).status, 401);
  assert.strictEqual((await call(e, "GET", "/")).data.game, false);
});
await test("AI: Gemini request shape", async () => {
  const e = env(); e.GEMINI_API_KEY = "g-test"; let sent = null;
  e.FETCH = async (url, opt) => { sent = { url, body: JSON.parse(opt.body), key: opt.headers["x-goog-api-key"] };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), { status: 200 }); };
  const r = await call(e, "POST", "/ai", { key: "app-secret-123", body: { prompt: "read", image: "data:image/png;base64,iVBOR" } });
  assert.strictEqual(r.data.text, "ok"); assert.strictEqual(sent.key, "g-test");
  assert.ok(sent.url.includes(":generateContent")); assert.strictEqual(sent.body.contents[0].parts[1].inline_data.mime_type, "image/png");
});

await test("AI: Groq uses gpt-oss for text and a vision model for photos, strips thinking", async () => {
  const e = env(); e.GROQ_API_KEY = "gsk-test"; const seen = [];
  e.FETCH = async (url, opt) => { const b = JSON.parse(opt.body); seen.push({ url, model: b.model, auth: opt.headers.Authorization, img: Array.isArray(b.messages[0].content) });
    return new Response(JSON.stringify({ choices: [{ message: { content: "<think>hmm</think>\nSETPOINT ok" } }] }), { status: 200 }); };
  assert.strictEqual((await call(e, "GET", "/")).data.ai, "groq");
  const a = await call(e, "POST", "/ai", { key: "app-secret-123", body: { prompt: "coach me" } });
  const b = await call(e, "POST", "/ai", { key: "app-secret-123", body: { prompt: "photo", image: "data:image/jpeg;base64,/9j/AA" } });
  assert.strictEqual(a.data.text, "SETPOINT ok");
  assert.ok(seen[0].url.startsWith("https://api.groq.com/openai/v1/chat/completions"));
  assert.strictEqual(seen[0].model, "openai/gpt-oss-120b"); assert.strictEqual(seen[0].img, false);
  assert.strictEqual(seen[1].model, "qwen/qwen3.8-27b"); assert.strictEqual(seen[1].img, true);
  assert.strictEqual(seen[0].auth, "Bearer gsk-test");
});

await test("AI: Groq + Gemini together: text to Groq, photos to Gemini", async () => {
  const e = env(); e.GROQ_API_KEY = "gsk"; e.GEMINI_API_KEY = "g"; const seen = [];
  e.FETCH = async (url, opt) => { seen.push(url);
    const body = url.includes("groq") ? { choices: [{ message: { content: "text ok" } }] } : { candidates: [{ content: { parts: [{ text: "photo ok" }] } }] };
    return new Response(JSON.stringify(body), { status: 200 }); };
  assert.strictEqual((await call(e, "GET", "/")).data.ai, "groq+gemini");
  assert.strictEqual((await call(e, "POST", "/ai", { key: "app-secret-123", body: { prompt: "coach" } })).data.text, "text ok");
  assert.strictEqual((await call(e, "POST", "/ai", { key: "app-secret-123", body: { prompt: "p", image: "data:image/jpeg;base64,/9j/AA" } })).data.text, "photo ok");
  assert.ok(seen[0].includes("api.groq.com")); assert.ok(seen[1].includes("gemini-flash-latest:generateContent"));
  e.AI_VISION_PROVIDER = "groq";
  await call(e, "POST", "/ai", { key: "app-secret-123", body: { prompt: "p", image: "data:image/jpeg;base64,/9j/AA" } });
  assert.ok(seen[2].includes("api.groq.com"));
});
await test("capture: inbox key can add a bank alert, only the app key can read and clear it", async () => {
  const e = env();
  let r = await call(e, "POST", "/capture", { key: "inbox-secret-456", body: { text: "DBS: SGD 12.50 spent at GRAB", app: "DBS" } });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.data.stored, 1);
  r = await call(e, "GET", "/capture", { key: "inbox-secret-456" }); assert.strictEqual(r.status, 401);
  r = await call(e, "GET", "/capture", { key: "app-secret-123" });
  assert.strictEqual(r.data.items.length, 1); assert.strictEqual(r.data.items[0].text, "DBS: SGD 12.50 spent at GRAB"); assert.strictEqual(r.data.items[0].app, "DBS");
  const k = r.data.items[0].key; assert.ok(k.startsWith("cap:"));
  r = await call(e, "DELETE", "/capture", { key: "app-secret-123", body: { keys: [k, "state"] } }); assert.strictEqual(r.data.deleted, 1);
  assert.ok(await e.SP.get("state") === null);
  r = await call(e, "GET", "/capture", { key: "app-secret-123" }); assert.strictEqual(r.data.items.length, 0);
});
await test("capture: accepts plain text, rejects empty and wrong key", async () => {
  const e = env();
  const res = await worker.fetch(new Request("https://w.dev/capture", { method: "POST", headers: { Authorization: "Bearer inbox-secret-456", "Content-Type": "text/plain" }, body: "Your card was charged SGD 4.90 at OLD CHANG KEE" }), e);
  assert.strictEqual(res.status, 200);
  let r = await call(e, "POST", "/capture", { key: "inbox-secret-456", body: { text: "   " } }); assert.strictEqual(r.status, 400);
  r = await call(e, "POST", "/capture", { key: "wrong", body: { text: "x" } }); assert.strictEqual(r.status, 401);
  r = await call(e, "GET", "/capture", { key: "app-secret-123" }); assert.ok(r.data.items[0].text.includes("OLD CHANG KEE"));
});
await test("capture: health inbox and capture inbox don't mix", async () => {
  const e = env();
  await call(e, "POST", "/capture", { key: "inbox-secret-456", body: { text: "SGD 1.00 at X" } });
  const r = await call(e, "GET", "/inbox", { key: "app-secret-123" }); assert.strictEqual(r.data.items.length, 0);
});
console.log(`\n${pass} passed`);
