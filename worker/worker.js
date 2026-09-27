/* ==========================================================================
   Setpoint sync Worker — Cloudflare Workers + KV. One file, no dependencies.

   What it stores (binding SP):
     state          one ENCRYPTED blob of your whole Setpoint data. The app
                    encrypts it before sending; this Worker never sees the
                    plaintext and never needs the passphrase.
     inbox:<id>     readings posted by the Apple Health Shortcut (weight,
                    body fat, steps). Plain numbers, auto-expire after 30
                    days, deleted as soon as the app has pulled them.

   Keys (set as encrypted secrets, never in this file):
     APP_KEY        your devices: read/write state, read/clear inbox
     INBOX_KEY      the Shortcut: can ONLY add inbox readings

   Routes
     GET    /                 health check, no auth
     GET    /state            → { ver, at, blob }            (APP_KEY)
     PUT    /state            { base, blob } → { ver, at }   (APP_KEY)
                              409 + current state if base is stale
     POST   /inbox            reading or [readings]          (INBOX_KEY or APP_KEY)
     GET    /inbox            → { items: [...] }             (APP_KEY)
     DELETE /inbox            { keys: [...] }                (APP_KEY)
     POST   /capture          { text, app?, ts? } or plain text   (INBOX_KEY or APP_KEY)
                              A bank SMS/email alert for Budget Margin. Stored as-is
                              for up to 30 days until the app collects it.
     GET    /capture          → { items: [...] }             (APP_KEY)
     DELETE /capture          { keys: [...] }                (APP_KEY)
     POST   /ai               { task, prompt, image? } → { text, model }  (APP_KEY)
                              Relays one request to OpenAI or Gemini using a key
                              kept here as a secret; the app never sees it.

   AI settings (optional):
     GROQ_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY   secrets; set one or more
     Routing when several are set:
       text jobs (describe a meal, coach)  → Groq, else OpenAI, else Gemini
       photo jobs (meal photo, label)      → Gemini, else OpenAI, else Groq
     AI_TEXT_PROVIDER / AI_VISION_PROVIDER  override: "groq" | "openai" | "gemini"
     AI_MODEL          text model   (defaults: openai/gpt-oss-120b, gpt-4o-mini, gemini-flash-latest)
     AI_VISION_MODEL   photo model  (defaults: qwen/qwen3.8-27b, gpt-4o-mini, gemini-flash-latest)
     AI_DAILY_LIMIT    max AI calls per day, default 60 (a spending brake)
   ========================================================================== */

const VERSION = "1.3.0";
const MAX_IMAGE_CHARS = 3_000_000;   // ~2.2 MB of JPEG as base64
const MAX_PROMPT_CHARS = 80_000;
const MAX_STATE_BYTES = 8 * 1024 * 1024;
const INBOX_TTL = 60 * 60 * 24 * 30;
const MAX_CAPTURES = 200;
const MAX_CAPTURE_CHARS = 2000;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const cors = corsHeaders(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
      status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" }
    });

    try {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
      const isApp = safeEqual(token, env.APP_KEY);
      const isInbox = isApp || safeEqual(token, env.INBOX_KEY);
      const path = url.pathname.replace(/\/+$/, "") || "/";

      if (path === "/" && req.method === "GET") {
        return json({ ok: true, service: "setpoint-sync", version: VERSION, configured: !!(env.APP_KEY && env.INBOX_KEY && env.SP), ai: aiProvider(env) });
      }
      if (!env.SP) return json({ error: "KV binding SP is missing" }, 500);

      if (path === "/state") {
        if (!isApp) return json({ error: "unauthorised" }, 401);
        if (req.method === "GET") return json(await readState(env));
        if (req.method === "PUT") {
          const body = await req.json().catch(() => null);
          if (!body || typeof body.blob !== "object" || body.blob === null) return json({ error: "expected { base, blob }" }, 400);
          const text = JSON.stringify(body.blob);
          if (text.length > MAX_STATE_BYTES) return json({ error: "state too large" }, 413);
          const cur = await readState(env);
          if ((body.base | 0) !== cur.ver) return json({ error: "stale", ...cur }, 409);
          const meta = { ver: cur.ver + 1, at: new Date().toISOString() };
          await env.SP.put("state", text, { metadata: meta });
          return json(meta);
        }
        return json({ error: "method not allowed" }, 405);
      }

      if (path === "/inbox") {
        if (req.method === "POST") {
          if (!isInbox) return json({ error: "unauthorised" }, 401);
          const body = await req.json().catch(() => null);
          const list = (Array.isArray(body) ? body : [body]).map(normaliseReading).filter(Boolean);
          if (!list.length) return json({ error: "no usable reading (need date plus weight, bodyFat or steps)" }, 400);
          for (const r of list.slice(0, 50)) {
            const key = `inbox:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            await env.SP.put(key, JSON.stringify(r), { expirationTtl: INBOX_TTL });
          }
          return json({ ok: true, stored: Math.min(50, list.length), readings: list.slice(0, 50) });
        }
        if (!isApp) return json({ error: "unauthorised" }, 401);
        if (req.method === "GET") {
          const listed = await env.SP.list({ prefix: "inbox:" });
          const items = [];
          for (const k of listed.keys) {
            const v = await env.SP.get(k.name);
            if (v) { try { items.push({ key: k.name, ...JSON.parse(v) }); } catch (e) { } }
          }
          return json({ items });
        }
        if (req.method === "DELETE") {
          const body = await req.json().catch(() => ({}));
          const keys = (body.keys || []).filter(k => typeof k === "string" && k.startsWith("inbox:")).slice(0, 200);
          for (const k of keys) await env.SP.delete(k);
          return json({ ok: true, deleted: keys.length });
        }
        return json({ error: "method not allowed" }, 405);
      }
      if (path === "/capture") {
        if (req.method === "POST") {
          if (!isInbox) return json({ error: "unauthorised" }, 401);
          const raw = await req.text().catch(() => "");
          let body = null;
          try { body = JSON.parse(raw); } catch (e) { body = { text: raw }; }
          const list = (Array.isArray(body) ? body : [body]).map(normaliseCapture).filter(Boolean).slice(0, 20);
          if (!list.length) return json({ error: "expected { text } with the alert text" }, 400);
          const pending = await env.SP.list({ prefix: "cap:" });
          if (pending.keys.length + list.length > MAX_CAPTURES) return json({ error: "capture inbox is full; open Budget Margin to collect them" }, 429);
          for (const c of list) {
            const key = `cap:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            await env.SP.put(key, JSON.stringify(c), { expirationTtl: INBOX_TTL });
          }
          return json({ ok: true, stored: list.length });
        }
        if (!isApp) return json({ error: "unauthorised" }, 401);
        if (req.method === "GET") {
          const listed = await env.SP.list({ prefix: "cap:" });
          const items = [];
          for (const k of listed.keys) {
            const v = await env.SP.get(k.name);
            if (v) { try { items.push({ key: k.name, ...JSON.parse(v) }); } catch (e) { } }
          }
          return json({ items });
        }
        if (req.method === "DELETE") {
          const body = await req.json().catch(() => ({}));
          const keys = (body.keys || []).filter(k => typeof k === "string" && k.startsWith("cap:")).slice(0, 200);
          for (const k of keys) await env.SP.delete(k);
          return json({ ok: true, deleted: keys.length });
        }
        return json({ error: "method not allowed" }, 405);
      }
      if (path === "/ai") {
        if (!isApp) return json({ error: "unauthorised" }, 401);
        if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
        if (!aiProvider(env)) return json({ error: "AI isn't set up on this Worker. Add OPENAI_API_KEY or GEMINI_API_KEY as a secret." }, 501);
        const body = await req.json().catch(() => null);
        if (!body || typeof body.prompt !== "string" || !body.prompt.trim()) return json({ error: "expected { task, prompt, image? }" }, 400);
        if (body.prompt.length > MAX_PROMPT_CHARS) return json({ error: "prompt too long" }, 413);
        let image = null;
        if (body.image != null) {
          const m = typeof body.image === "string" && body.image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
          if (!m) return json({ error: "image must be a base64 data URL (jpeg, png or webp)" }, 400);
          if (body.image.length > MAX_IMAGE_CHARS) return json({ error: "image too large; resize before sending" }, 413);
          image = { mime: m[1], data: m[2] };
        }
        // daily brake so a leaked key or a bug can't run up a bill
        const day = new Date().toISOString().slice(0, 10), ck = "ai:count:" + day;
        const used = parseInt(await env.SP.get(ck) || "0", 10), limit = parseInt(env.AI_DAILY_LIMIT || "60", 10);
        if (used >= limit) return json({ error: `Daily AI limit reached (${limit}). Raise AI_DAILY_LIMIT in the Worker settings if you need more.` }, 429);
        await env.SP.put(ck, String(used + 1), { expirationTtl: 60 * 60 * 48 });
        const maxTokens = Math.min(4000, Math.max(200, body.maxTokens | 0 || 900));
        // try the preferred provider, retry once if it's busy, then fall back to any other configured one
        const first = image ? visionProvider(env) : textProvider(env);
        const order = [first, ...(image ? ["gemini", "openai", "groq"] : ["groq", "openai", "gemini"]).filter(p => p !== first && env[KEYS[p]])];
        const errors = [];
        for (const provider of order) {
          for (let attempt = 0; attempt < 2; attempt++) {
            const out = await callAI(env, provider, body.prompt, image, maxTokens);
            if (!out.error) return json({ text: out.text, model: out.model, provider, used: used + 1, limit, fellBack: provider !== first || undefined });
            errors.push(out.error);
            if (!out.retry || attempt) break;
            await new Promise(r => setTimeout(r, 1500));
          }
        }
        return json({ error: errors.join(" · ") }, 502);
      }
      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: "server error", detail: String(e && e.message || e) }, 500);
    }
  }
};

const KEYS = { groq: "GROQ_API_KEY", openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY" };
function pickProvider(env, order, override) {
  if (override && env[KEYS[override]]) return override;
  return order.find(p => env[KEYS[p]]) || null;
}
const textProvider = env => pickProvider(env, ["groq", "openai", "gemini"], env.AI_TEXT_PROVIDER);
const visionProvider = env => pickProvider(env, ["gemini", "openai", "groq"], env.AI_VISION_PROVIDER);
// what the health check reports: "groq" or, when photos go elsewhere, "groq+gemini"
function aiProvider(env) {
  const t = textProvider(env), v = visionProvider(env);
  return !t ? null : t === v ? t : `${t}+${v}`;
}

/* One request to the configured provider. Returns { text, model } or { error }. */
async function callAI(env, provider, prompt, image, maxTokens) {
  const f = env.FETCH || fetch;   // tests inject a fake
  if (provider === "groq") {
    // OpenAI-compatible. gpt-oss has no vision, so photos go to a vision model.
    const model = image ? (env.AI_VISION_MODEL || "qwen/qwen3.8-27b") : (env.AI_MODEL || "openai/gpt-oss-120b");
    const content = image ? [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:${image.mime};base64,${image.data}` } }] : prompt;
    const r = await f("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + env.GROQ_API_KEY, "Content-Type": "application/json" },
      // reasoning models spend tokens thinking before they answer; leave room for both
      body: JSON.stringify({ model, max_completion_tokens: maxTokens + 3000, temperature: 0.3, messages: [{ role: "user", content }] })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { error: "Groq: " + ((d.error && d.error.message) || r.status), retry: r.status === 429 || r.status >= 500 };
    let text = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
    if (text) text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    return text ? { text, model: d.model || model } : { error: "Groq returned no text" };
  }
  if (provider === "openai") {
    const model = (image && env.AI_VISION_MODEL) || (!image && env.AI_MODEL) || "gpt-4o-mini";
    const content = [{ type: "text", text: prompt }];
    if (image) content.push({ type: "image_url", image_url: { url: `data:${image.mime};base64,${image.data}`, detail: "auto" } });
    const r = await f("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + env.OPENAI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content }] })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { error: "OpenAI: " + ((d.error && d.error.message) || r.status), retry: r.status === 429 || r.status >= 500 };
    const text = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
    return text ? { text, model: d.model || model } : { error: "OpenAI returned no text" };
  }
  const model = (image && env.AI_VISION_MODEL) || (!image && env.AI_MODEL) || "gemini-flash-latest";
  const parts = [{ text: prompt }];
  if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.data } });
  const r = await f(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" },
    // Flash models "think" first and that counts against the output budget; leave room so the answer isn't cut off
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { maxOutputTokens: maxTokens + 4000, temperature: 0.3 } })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { error: "Gemini: " + ((d.error && d.error.message) || r.status), retry: r.status === 429 || r.status >= 500 };
  const c = d.candidates && d.candidates[0];
  const text = c && c.content && (c.content.parts || []).map(p => p.text || "").join("");
  if (text && text.trim()) return { text, model };
  const why = (c && c.finishReason) || (d.promptFeedback && d.promptFeedback.blockReason) || "empty reply";
  return { error: `Gemini returned no text (${why})`, retry: why === "MAX_TOKENS" || why === "empty reply" };
}

async function readState(env) {
  const { value, metadata } = await env.SP.getWithMetadata("state");
  if (!value) return { ver: 0, at: null, blob: null };
  return { ver: (metadata && metadata.ver) | 0, at: metadata && metadata.at || null, blob: JSON.parse(value) };
}

function corsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "*").split(",").map(s => s.trim()).filter(Boolean);
  const allow = allowed.includes("*") ? "*" : allowed.includes(origin) ? origin : allowed[0] || "null";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

/* Constant-time comparison, so response timing doesn't leak the key. */
function safeEqual(a, b) {
  if (!a || !b || typeof a !== "string" || typeof b !== "string") return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/* Shortcuts sends numbers as text with units ("86.2 kg", "32%") and dates in
   whatever format the phone uses. Accept all of that, return clean numbers. */
export function normaliseReading(r) {
  if (!r || typeof r !== "object") return null;
  const num = v => {
    if (v == null || v === "") return null;
    const m = String(v).replace(",", ".").match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  };
  let date = String(r.date || "").trim();
  const iso = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const dmy = date.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/);
  if (iso) date = `${iso[1]}-${iso[2]}-${iso[3]}`;
  else if (dmy) date = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  else return null;
  const out = { date, source: String(r.source || "shortcut").slice(0, 40), at: new Date().toISOString() };
  let w = num(r.weight);
  if (w != null) {
    const unit = String(r.weightUnit || r.weight || "").toLowerCase();
    if (/lb|pound/.test(unit)) w = w * 0.45359237;
    if (w >= 25 && w <= 350) out.weight = Math.round(w * 100) / 100;
  }
  let bf = num(r.bodyFat);
  if (bf != null) {
    if (bf > 0 && bf < 1) bf = bf * 100;          // HealthKit stores 0.32 for 32 %
    if (bf >= 2 && bf <= 70) out.bodyFat = Math.round(bf * 10) / 10;
  }
  const steps = num(r.steps);
  if (steps != null && steps >= 0 && steps < 200000) out.steps = Math.round(steps);
  const act = num(r.activeKcal);
  if (act != null && act >= 0 && act < 10000) out.activeKcal = Math.round(act);
  return out.weight != null || out.bodyFat != null || out.steps != null ? out : null;
}

/* A bank alert for Budget Margin: keep the text (trimmed and capped) plus optional app name and time. */
export function normaliseCapture(c) {
  if (typeof c === "string") c = { text: c };
  if (!c || typeof c !== "object") return null;
  const text = String(c.text ?? c.body ?? c.message ?? "").replace(/\r/g, "").trim().slice(0, MAX_CAPTURE_CHARS);
  if (!text) return null;
  const app = String(c.app ?? c.source ?? "").trim().slice(0, 40);
  const t = new Date(c.ts ?? c.timestamp ?? Date.now());
  return { text, app, ts: isNaN(t) ? new Date().toISOString() : t.toISOString(), received: new Date().toISOString() };
}
