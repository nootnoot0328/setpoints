# Setpoint sync Worker

A single Cloudflare Worker that does two jobs:

1. **Sync between devices.** It keeps one encrypted copy of your Setpoint data. Your phone encrypts everything with your passphrase before upload, so Cloudflare only ever holds ciphertext.
2. **Apple Health inbox.** An iOS Shortcut posts your morning weigh-in, body fat and steps here. The app collects them on its next sync and then clears the inbox.

It fits comfortably in Cloudflare's free plan: 100,000 requests a day and 1,000 KV writes a day. One person syncing uses a few dozen of each.

## Setup in the dashboard (about 10 minutes, no tools needed)

1. **Create a Cloudflare account** at dash.cloudflare.com. It's free and needs no card.
2. **Create the storage.** Go to *Storage & Databases → KV → Create a namespace* and name it `setpoint`.
3. **Create the Worker.** Go to *Compute (Workers) → Create → Start with Hello World* and name it `setpoint-sync`. Deploy it, then choose *Edit code*. Delete everything in the editor, paste the whole of `worker.js`, and click *Deploy*.
4. **Connect the storage.** In the Worker, go to *Settings → Bindings → Add → KV namespace*. Set the variable name to `SP` (it must be exactly this) and the namespace to `setpoint`.
5. **Add the keys.** In Setpoint on your phone, go to *More → Sync & Apple Health → Generate keys for a new Worker* and copy both. Then in the Worker, go to *Settings → Variables and Secrets → Add*:
   - Type **Secret**, name `APP_KEY`, value = the app key.
   - Type **Secret**, name `INBOX_KEY`, value = the inbox key.
   - Type **Text**, name `ALLOWED_ORIGINS`, value = your Pages address with no trailing slash, e.g. `https://nootnoot0328.github.io`.
6. **Check it.** Open `https://setpoint-sync.<your-subdomain>.workers.dev/` in a browser. You should see `"configured": true`. If it says `false`, the binding name or one of the secrets is missing.
7. **Connect the app.** In Setpoint, paste the Worker address, choose a passphrase (the same one on every device) and tap *Connect this device*. Then follow the in-app *Set up the Shortcut* steps.

## Optional: AI inside the app

With an AI key on the Worker, Setpoint can estimate a meal from a photo, read a nutrition label, estimate from a description, and run the AI coach review, all without leaving the app. The key stays in Cloudflare; the app only ever talks to your Worker.

1. **Get an API key** (separate from any ChatGPT subscription). Any one of:
   - **Groq** (console.groq.com → API Keys): fast, with a free tier. Text tasks (describe a meal, the AI coach) use `openai/gpt-oss-120b`. Groq's gpt-oss models can't see images, so photos go to a Groq vision model (`qwen/qwen3.8-27b` at the time of writing; it's a *preview* model and Groq may withdraw it at short notice).
   - **OpenAI** (platform.openai.com): add credit, **set a monthly budget limit**, create a key.
   - **Google Gemini** (aistudio.google.com): has a free tier; on it, Google may use what you send to improve its products.
2. **Add it to the Worker:** Settings → Variables and Secrets → Add → type **Secret**, name `GROQ_API_KEY`, `OPENAI_API_KEY` or `GEMINI_API_KEY`, paste the key. You can add more than one. With several, the Worker routes each job to the best fit:
   - **Text jobs** (describe a meal, AI coach): Groq, else OpenAI, else Gemini.
   - **Photo jobs** (meal photo, nutrition label): Gemini, else OpenAI, else Groq.

   So **Groq + Gemini** gives you Groq's fast gpt-oss for text and Gemini's vision for photos. Override with Text variables `AI_TEXT_PROVIDER` / `AI_VISION_PROVIDER` set to `groq`, `openai` or `gemini`.
3. **Paste the new `worker.js`** (version 1.1.0 or later) into the Worker editor and Deploy. Open the Worker address; `"ai"` shows what's active, e.g. `"groq+gemini"` (text + photos).
4. **Optional model settings** (type Text):
   - `AI_MODEL`: the text model. Defaults: `openai/gpt-oss-120b` (Groq), `gpt-4o-mini` (OpenAI), `gemini-flash-latest` (Gemini).
   - `AI_VISION_MODEL`: the photo model. Defaults: `qwen/qwen3.8-27b` (Groq, a preview model that may be withdrawn), `gpt-4o-mini` (OpenAI), `gemini-flash-latest` (Gemini, an alias that always points at Google's current Flash model).
   - `AI_DAILY_LIMIT`: maximum AI calls per day across all providers, default 60.
5. In Setpoint, open More → Sync & Apple Health; the card shows **AI: OpenAI** once it's picked up.

**What it costs:** each photo is one request. On the small models that's a fraction of a US cent; a coach review (a long report) is a few cents. Check the provider's current prices and keep the budget limit on.

**What gets sent:** the photo (shrunk to about 1280 px) or the text you typed, or for the coach, the report you chose. Nothing else from your data.

## Setup from the command line (alternative)

```
cd worker
npx wrangler login
npx wrangler kv namespace create SP        # paste the printed id into wrangler.toml
npx wrangler secret put APP_KEY
npx wrangler secret put INBOX_KEY
npx wrangler deploy
```

Edit `ALLOWED_ORIGINS` in `wrangler.toml` first if your Pages address differs.

## Security model, honestly

- **What Cloudflare can see:** that a blob exists, its size and when it changes. It can also see the Health inbox readings (weight, body fat, steps, date) for the short time before your app collects them. Those are sent as plain numbers because an iOS Shortcut can't do the encryption.
- **What it can't see:** your food log, workouts, notes or anything else. That's AES-GCM-256 with a key derived from your passphrase (PBKDF2-SHA256, 310,000 rounds). The passphrase never leaves your device, and only the derived key is kept, in the browser's key store.
- **Lose the passphrase** and the cloud copy is unrecoverable. Each device's own copy is unaffected, so you can reconnect with a new passphrase after deleting the `state` key in KV.
- **The app key leaks** (for example, someone reads it off your phone): they can overwrite or delete the cloud copy, but they can't read it. Rotate the key by changing the `APP_KEY` secret and re-entering it in the app.
- **The inbox key leaks:** someone can add fake weigh-ins. Delete them in the app and rotate `INBOX_KEY`.
- **CORS** limits which websites can call the Worker from a browser. It doesn't stop scripts, which is why the keys exist.

## Endpoints

| Method | Path | Key | Purpose |
|---|---|---|---|
| GET | `/` | none | Health check: `{ok, service, version, configured}` |
| GET | `/state` | app | `{ver, at, blob}` |
| PUT | `/state` | app | `{base, blob}`. Returns 409 with the current state if `base` is stale, and the app then merges and retries |
| POST | `/inbox` | inbox or app | `{date, weight, bodyFat, steps}` or an array of them. Accepts `85.6`, `"85.6 kg"`, `"188 lb"`, body fat as `0.32` or `32` |
| GET | `/inbox` | app | Pending readings |
| DELETE | `/inbox` | app | `{keys:[...]}`: clear readings the app has applied |
| POST | `/ai` | app | `{task, prompt, image?}` → `{text, model, used, limit}`. Needs `GROQ_API_KEY`, `OPENAI_API_KEY` or `GEMINI_API_KEY` |

Send keys as `Authorization: Bearer <key>`.
