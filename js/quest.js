/* ==========================================================================
   Setpoint — Quest. A pixel avatar that changes with your weight trend and
   training, gold and chests earned from workouts, food days and weigh-ins,
   and items invented at the moment a chest opens.

   Nothing about the items is written down anywhere: rarity is rolled when
   you open a chest, and the item itself (name, colours, pattern, effect) is
   made up on the spot by the AI on your Worker, or by a local generator
   when the Worker isn't reachable.

   Everything that can be derived from your logs is derived, not stored:
   gold earned, pending chests, streaks and pity counters are recomputed
   from the training log, food log and weigh-ins on every render. The only
   stored state is S.game = { start, eq, ach, items[] }, which syncs as
   records ("g|<id>" per item, "s|game" for the rest).

   Core (no DOM) is exported for Node tests as module.exports; the view
   factory registers as window.SPQuest and app.js calls it with shared
   helpers, like the training module.
   ========================================================================== */
(function (root) {
  "use strict";

  /* ================================================================ core */
  const RAR = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
  const RCOL = ["#9AA0A6", "#34A462", "#3B7CF0", "#9B5DE5", "#E2A91F"];
  const ODDS = [0.58, 0.27, 0.11, 0.035, 0.005];
  const PITY_RARE = 7, PITY_LEG = 40;      // the Nth open without one is forced to one
  const CHEST_COST = 250, RETRO_DAYS = 7;
  const SLOTS = ["head", "body", "back", "bg"];
  const SLOT_NAME = { head: "Head", body: "Outfit", back: "Back", bg: "Backdrop" };
  const SHAPES = {
    head: ["cap", "beanie", "crown", "headband", "hair", "horns", "halo", "wizard hat"],
    body: ["tee", "vest", "robe", "armour", "hoodie", "overalls"],
    back: ["cape", "wings", "sword", "jetpack", "tail", "balloon"],
    bg: ["dots", "stripes", "checks", "stars", "sunset", "grid", "bubbles", "waves"]
  };
  const PATTERNS = ["solid", "stripe", "dots", "check", "gradient"];
  const FX = ["none", "sparkle", "glow"];
  const TITLES = ["Rookie", "Trainee", "Regular", "Grinder", "Wayfarer", "Vanguard", "Champion", "Warden", "Titan", "Paragon", "Legend"];
  const INK = "#1B1B1F", SKIN = "#FFFFFF", BLUSH = "#F4A7A0";

  function hashF(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0) / 4294967296;
  }
  function seeded(seed) {
    let a = (seed * 4294967296) >>> 0 || 1;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const clampI = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(+v || 0)));

  /* Working sets that count: ticked done with reps (or a hold time) logged. */
  function doneSets(s) {
    if (!s || !s.ex) return 0;
    let n = 0;
    for (const e of s.ex) for (const st of e.sets || []) if (st && st.done && (st.reps > 0)) n++;
    return n;
  }
  const counts = s => s && (s.type === "hiit" ? (s.rounds | 0) > 0 : doneSets(s) > 0);

  function weekTarget(S) {
    const p = S.train && S.train.profile;
    return Math.max(1, Math.min(6, (p && p.days) || 3));
  }

  /* Completed weeks since `since`, with a streak that a shield can save.
     One shield is earned per four weeks hit (hold at most two); a missed
     week spends a shield instead of resetting the streak. */
  function weeks(S, E, td, since) {
    const target = weekTarget(S), log = (S.train && S.train.log) || [];
    const count = (a, b) => log.filter(s => s.date >= a && s.date <= b && counts(s)).length;
    const list = [];
    let streak = 0, shields = 0, best = 0, toShield = 0, maxWeek = 0;
    const cur = E.weekStart(td);
    for (let ws = E.weekStart(since); ws < cur; ws = E.addDays(ws, 7)) {
      const end = E.addDays(ws, 6), n = count(ws, end), hit = n >= target;
      let saved = false;
      if (hit) { streak++; if (++toShield >= 4) { toShield = 0; shields = Math.min(2, shields + 1); } }
      else if (shields > 0) { shields--; saved = true; }
      else { streak = 0; toShield = 0; }
      best = Math.max(best, streak); maxWeek = Math.max(maxWeek, n);
      list.push({ start: ws, end, n, target, hit, saved, streak });
    }
    const nowN = count(cur, td);
    maxWeek = Math.max(maxWeek, nowN);
    const live = streak + (nowN >= target ? 1 : 0);
    return { list, target, streak, live, shields, best: Math.max(best, live), maxWeek, current: { start: cur, n: nowN } };
  }

  /* Everything that earns gold, derived from the logs. */
  function events(S, E, td) {
    const g = S.game || {}, log = (S.train && S.train.log) || [], out = [];
    td = td || E.today();
    const since = E.addDays(g.start || td, -RETRO_DAYS);
    const add = (id, date, kind, label, gold, chest, min) => out.push({ id, date, kind, label, gold, chest: !!chest, min: min || 0 });
    for (const s of log) {
      if (!s || !s.id || s.date < since || s.date > td) continue;
      if (s.type === "hiit") {
        const r = s.rounds | 0;
        if (r >= 6) add("t:" + s.id, s.date, "hiit", s.name || "Intervals", 25 + Math.min(r, 20), true);
        else if (r > 0) add("t:" + s.id, s.date, "hiit", s.name || "Intervals", 10, false);
      } else {
        const n = doneSets(s);
        if (n >= 6) add("t:" + s.id, s.date, "lift", s.name || "Workout", 30 + Math.min(n, 24) * 2, true);
        else if (n > 0) add("t:" + s.id, s.date, "lift", s.name || "Workout", 10 + n * 2, false);
      }
    }
    let nutri = 0;
    for (let d = since; d <= td; d = E.addDays(d, 1)) {
      if (S.weights && S.weights[d]) add("w:" + d, d, "weigh", "Weigh-in", 5, false);
      if (d >= td) continue;                                   // today isn't over yet
      if (!(S.intake && S.intake[d] && S.intake[d].length) || (S.fasted && S.fasted[d])) continue;
      const t = E.dayTotals(S, d);
      let tg = null; try { tg = E.targetsFor(S, d); } catch (e) { }
      // logging an over-target day still pays: skipping the log must never be the better move
      if (!tg) { add("n:" + d, d, "food", "Logged food", 3, false); continue; }
      const hp = t.p >= tg.p * 0.9, hk = Math.abs(t.kcal - tg.kcal) <= tg.kcal * 0.1;
      if (hp && hk) { nutri++; add("n:" + d, d, "food", "Calories and protein on target", 25, hashF("n|" + d) < 0.4); }
      else if (hp || hk) add("n:" + d, d, "food", hp ? "Protein on target" : "Calories on target", 10, false);
      else add("n:" + d, d, "food", "Logged food", 3, false);
    }
    const wk = weeks(S, E, td, since);
    for (const w of wk.list) if (w.hit) add("k:" + w.start, w.end, "week", `Weekly target hit (${w.n}/${w.target})`, 60 + 10 * Math.min(w.streak, 6), true, 1);
    return { list: out, weeks: wk, nutri };
  }

  /* ------------------------------------------------------------ feats
     Names and descriptions are base64 so a glance at the source doesn't
     spoil them. The tests are plain code. */
  const ACH = ["Rmlyc3QgUmVwfExvZ2dlZCB5b3VyIGZpcnN0IGxpZnRpbmcgc2Vzc2lvbi4=","SXJvbiBIYWJpdHxUZW4gbGlmdGluZyBzZXNzaW9ucyBpbiB0aGUgYm9vay4=","RmlmdHkgRm9yZ2VkfEZpZnR5IGxpZnRpbmcgc2Vzc2lvbnMu","Rm91ci1XZWVrIEZsYW1lfEhpdCB5b3VyIHdlZWtseSB0YXJnZXQgZm91ciB3ZWVrcyBydW5uaW5nLg==","TWFjcm8gTW9ua3xTZXZlbiBkYXlzIG9uIGNhbG9yaWVzIGFuZCBwcm90ZWluLg==","U2NhbGUgV2hpc3BlcmVyfFRoaXJ0eSB3ZWlnaC1pbnMu","THVuZ3Mgb2YgU3RlZWx8Rml2ZSBpbnRlcnZhbCBzZXNzaW9ucy4=","T3ZlcmRyaXZlIFdlZWt8Rml2ZSBzZXNzaW9ucyBpbiBvbmUgd2Vlay4=","UXVhcnRlciBXYXl8QSBxdWFydGVyIG9mIHRoZSB3YXkgdG8geW91ciBnb2FsIHdlaWdodC4=","SGFsZndheSBIb3Jpem9ufEhhbGZ3YXkgdG8geW91ciBnb2FsIHdlaWdodC4=","U2V0cG9pbnQgUmVhY2hlZHxZb3UgcmVhY2hlZCB5b3VyIGdvYWwgd2VpZ2h0Lg==","UHVycGxlIFB1bGx8UHVsbGVkIGFuIGVwaWMgb3IgYmV0dGVyIGl0ZW0u","SG9hcmRlcnxDb2xsZWN0ZWQgMjUgaXRlbXMu","RGF3biBQYXRyb2x8VHJhaW5lZCBiZWZvcmUgNyBBTS4=","Vm9sdW1lIERlYWxlcnwyNSB3b3JraW5nIHNldHMgaW4gb25lIHNlc3Npb24u"];
  const ACH_TEST = [
    s => s.lifts >= 1, s => s.lifts >= 10, s => s.lifts >= 50, s => s.best >= 4, s => s.nutri >= 7,
    s => s.weighins >= 30, s => s.hiit >= 5, s => s.maxWeek >= 5, s => s.goal >= 0.25, s => s.goal >= 0.5,
    s => s.goal >= 1, s => s.epic, s => s.items >= 25, s => s.early, s => s.big
  ];
  function b64(s) {
    try { return typeof atob === "function" ? decodeURIComponent(escape(atob(s))) : Buffer.from(s, "base64").toString("utf8"); }
    catch (e) { return "|"; }
  }
  const achText = i => { const [n, d] = b64(ACH[i]).split("|"); return { name: n, desc: d }; };

  function stats(S, E, td, ev) {
    const log = (S.train && S.train.log) || [], items = (S.game && S.game.items) || [];
    let gp = null; try { gp = S.goal && S.goal.mode !== "maintain" ? E.goalProgress(S, td) : null; } catch (e) { }
    return {
      lifts: log.filter(s => s.type !== "hiit" && doneSets(s) > 0).length,
      hiit: log.filter(s => s.type === "hiit" && (s.rounds | 0) > 0).length,
      nutri: ev.nutri, weighins: Object.keys(S.weights || {}).length,
      best: ev.weeks.best, maxWeek: ev.weeks.maxWeek, goal: gp ? gp.pct : 0,
      epic: items.some(i => i.r >= 3), items: items.length,
      early: log.some(s => s.at && new Date(s.at).getHours() < 7 && counts(s)),
      big: log.some(s => doneSets(s) >= 25)
    };
  }

  function summary(S, E, td) {
    td = td || E.today();
    const ev = events(S, E, td), st = stats(S, E, td, ev);
    const g = S.game || {}, items = g.items || [], when = g.ach || {};
    const ach = ACH_TEST.map(t => { try { return !!t(st); } catch (e) { return false; } });
    ach.forEach((ok, i) => { if (ok) ev.list.push({ id: "a:" + i, date: when[i] || td, kind: "feat", label: "Hidden feat found", gold: 100, chest: true, min: 1 }); });
    const earned = ev.list.reduce((a, e) => a + e.gold, 0);
    const spent = items.reduce((a, i) => a + (i.cost || 0), 0);
    const lv = Math.floor(Math.sqrt(earned / 50)) + 1;
    const have = new Set(items.map(i => i.id));
    const pending = ev.list.filter(e => e.chest && !have.has(e.id)).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    return {
      events: ev.list.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)),
      weeks: ev.weeks, stats: st, ach, earned, spent, gold: earned - spent, pending,
      level: lv, title: TITLES[Math.min(TITLES.length - 1, lv - 1)],
      lvFrom: 50 * (lv - 1) * (lv - 1), lvTo: 50 * lv * lv
    };
  }

  /* ------------------------------------------------------------ rolls */
  function pityOf(items) {
    const s = (items || []).slice().sort((a, b) => (a.at || 0) - (b.at || 0));
    let rare = 0, leg = 0;
    for (const it of s) { rare = it.r >= 2 ? 0 : rare + 1; leg = it.r >= 4 ? 0 : leg + 1; }
    return { rare, leg };
  }
  function rollRarity(r, items, min) {
    let k = ODDS.length - 1, acc = 0;
    for (let i = 0; i < ODDS.length; i++) { acc += ODDS[i]; if (r < acc) { k = i; break; } }
    const p = pityOf(items);
    if (p.rare >= PITY_RARE - 1) k = Math.max(k, 2);
    if (p.leg >= PITY_LEG - 1) k = 4;
    return Math.max(k, min || 0);
  }

  /* ------------------------------------------------------------ items */
  const ADJ = [
    ["Plain", "Sturdy", "Faded", "Humble", "Everyday", "Trusty", "Scuffed", "Cosy"],
    ["Bright", "Nimble", "Brisk", "Lucky", "Sunny", "Steady", "Zesty", "Breezy"],
    ["Gleaming", "Tempered", "Stormy", "Swift", "Radiant", "Midnight", "Molten", "Frosted"],
    ["Blazing", "Arcane", "Thunder", "Phantom", "Starforged", "Tidal", "Eclipse", "Runic"],
    ["Mythic", "Eternal", "Celestial", "Sovereign", "Primordial", "Infinite", "Worldforged", "Ascendant"]
  ];
  const FLAVOR = [
    "Smells faintly of victory.", "Earned one rep at a time.", "Fits better every week.", "Rumoured to add +1 to discipline.",
    "Found at the bottom of a very sweaty chest.", "Comes with a free sense of smugness.", "Warranty void if you skip leg day.",
    "Stitched from last week's excuses.", "Glows a little brighter after a good session.", "Nobody knows where it came from. Least of all you."
  ];
  const THEME = ["monsoon", "orchid", "lantern", "typhoon", "jade", "ember", "glacier", "turbine", "afterburner", "comet", "tide", "volcano",
    "bamboo", "neon", "sakura", "desert", "thunder", "koi", "nebula", "coral", "harbour", "midnight market", "rainforest", "circuit",
    "origami", "dragonfly", "lighthouse", "aurora", "firefly", "compass", "sandstorm", "moss", "obsidian", "citrus", "arcade", "pagoda",
    "starlight", "clockwork", "mango", "snowfall", "kite", "reef", "quartz", "hibiscus", "tempest", "satellite", "peony", "cinder",
    "lotus", "night train", "pixel", "geyser", "fern", "sunrise", "rocket", "ink wash", "hawker stall", "jet stream", "tiger", "cloud"];

  function hsl2hex(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
    return "#" + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase();
  }
  const title = s => s.replace(/(^|\s)\S/g, c => c.toUpperCase());
  function localItem(rnd, slot, shape, r) {
    const pick = a => a[Math.floor(rnd() * a.length)];
    const hue = rnd() * 360, sat = 38 + r * 12;
    const noun = slot === "bg" ? title(SHAPES.bg[shape]) + " Backdrop" : title(SHAPES[slot][shape]);
    const fx = r >= 4 ? "sparkle" : r === 3 ? pick(["sparkle", "glow"]) : r === 2 && rnd() < 0.3 ? "glow" : "none";
    return {
      slot, shape, r, name: pick(ADJ[r]) + " " + noun, flavor: pick(FLAVOR),
      pal: [hsl2hex(hue, sat, 56), hsl2hex(hue, sat, 36), hsl2hex(hue + (rnd() < 0.5 ? 150 : 40), Math.min(95, sat + 12), 64)],
      pat: pick(PATTERNS), fx, src: "local"
    };
  }
  function aiPrompt(slot, shape, r, words) {
    return `You design one cosmetic item for a pixel-art avatar in a personal fitness game.
Slot: ${SLOT_NAME[slot]}. Base shape: ${SHAPES[slot][shape]}. Rarity: ${RAR[r]} (${r + 1} of 5).
Inspiration words (blend them, don't list them): ${words.join(", ")}.
Reply with JSON only, no code fence:
{"name":"2 to 4 words","flavor":"one playful sentence under 90 characters","palette":["#RRGGBB","#RRGGBB","#RRGGBB"],"pattern":"solid|stripe|dots|check|gradient","fx":"none|sparkle|glow"}
Rules: palette is main colour, a darker shade of it, then a contrasting accent. Higher rarity means bolder colours and a grander name. Common and Uncommon use fx "none". The name must fit the base shape. No brand names, real people or existing characters from films, games or books.`;
  }
  function parseItem(text, base) {
    const m = String(text || "").match(/\{[\s\S]*\}/);
    if (!m) return null;
    let j; try { j = JSON.parse(m[0]); } catch (e) { return null; }
    const hex = v => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toUpperCase() : null;
    const pal = Array.isArray(j.palette) ? j.palette.map(hex) : [];
    const clean = (v, n) => typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n) : "";
    const it = Object.assign({}, base);
    const name = clean(j.name, 40), fl = clean(j.flavor, 120);
    if (!name) return null;
    it.name = name; if (fl) it.flavor = fl;
    if (pal.length >= 3 && pal.slice(0, 3).every(Boolean)) it.pal = pal.slice(0, 3);
    if (PATTERNS.includes(j.pattern)) it.pat = j.pattern;
    let fx = FX.includes(j.fx) ? j.fx : it.fx;
    if (it.r <= 1) fx = "none"; else if (it.r >= 4 && fx === "none") fx = "sparkle";
    it.fx = fx; it.src = "ai";
    return it;
  }

  /* ------------------------------------------------------------ pixels
     32 × 32 grid. Parts are cell lists; outlines are added automatically
     around everything that isn't background. */
  const HEAD = ["..######..", ".########.", "##########", "##########", "##########", "##########", "##########", "##########", ".########.", "..######.."];
  function bodyShape(sp) {
    const g = clampI(sp.girth, 0, 4), sh = clampI(sp.sh, 0, 2), arm = clampI(sp.arm, 0, 2);
    const head = [];
    HEAD.forEach((row, r) => { for (let c = 0; c < 10; c++) if (row[c] === "#") head.push([11 + c, 5 + r]); });
    const Ws = 10 + 2 * sh, Wb = 8 + 2 * g, legW = 3 + (g >= 3 ? 1 : 0);
    const even = v => Math.round(v / 2) * 2;
    const rowW = { 15: Ws - 2, 16: Ws, 17: Ws, 18: even((Ws + Wb) / 2), 19: Wb, 20: Wb, 21: Wb, 22: Wb, 23: Wb, 24: Math.max(Wb - 2, 2 * legW + 2) };
    const torso = [];
    for (let y = 15; y <= 24; y++) for (let x = 16 - rowW[y] / 2; x <= 15 + rowW[y] / 2; x++) torso.push([x, y]);
    const half = Math.max(Ws, Wb, rowW[18]) / 2, t = arm >= 2 ? 3 : 2;
    const armL = { x0: 16 - half - 1 - t, x1: 16 - half - 2 }, armR = { x0: 15 + half + 2, x1: 15 + half + 1 + t };
    const arms = [];
    for (let y = 16; y <= 22; y++) {
      for (let x = armL.x0; x <= armL.x1; x++) arms.push([x, y, "L"]);
      for (let x = armR.x0; x <= armR.x1; x++) arms.push([x, y, "R"]);
    }
    for (let x = armL.x1 + 1; x < 16 - rowW[16] / 2; x++) arms.push([x, 16, "L"]);   // shoulders
    for (let x = 15 + rowW[16] / 2 + 1; x < armR.x0; x++) arms.push([x, 16, "R"]);
    const legs = [];
    for (let y = 25; y <= 28; y++) { for (let x = 15 - legW; x <= 14; x++) legs.push([x, y]); for (let x = 17; x <= 16 + legW; x++) legs.push([x, y]); }
    for (let x = 14 - legW; x <= 14; x++) legs.push([x, 29]);
    for (let x = 17; x <= 17 + legW; x++) legs.push([x, 29]);
    const collar = torso.filter(([x, y]) => y === 15 && x >= 13 && x <= 18);
    const waist = torso.filter(([, y]) => y === 24);
    return { g, sh, arm, head, torso, arms, legs, collar, waist, rowW, half, t, legW, armL, armR };
  }

  // item cell lists: [x, y, role] where role 0 = main (patterned), 1 = shade, 2 = accent
  function rows(spec) { const o = []; for (const [y, x0, x1, role] of spec) for (let x = x0; x <= x1; x++) o.push([x, y, role || 0]); return o; }
  function headCells(shape) {
    switch (SHAPES.head[shape]) {
      case "cap": return rows([[3, 13, 18], [4, 12, 19], [5, 11, 20], [6, 11, 20, 1], [6, 21, 23, 1], [3, 15, 16, 2]]);
      case "beanie": return rows([[1, 15, 16, 2], [2, 13, 18], [3, 12, 19], [4, 11, 20], [5, 11, 20], [6, 11, 20, 1]]);
      case "crown": return rows([[2, 12, 12], [2, 15, 16], [2, 19, 19], [3, 12, 13], [3, 15, 16], [3, 18, 19], [4, 12, 19], [5, 12, 19, 1], [5, 14, 14, 2], [5, 17, 17, 2]]);
      case "headband": return rows([[7, 11, 20], [7, 21, 22, 2], [8, 22, 22, 2], [9, 21, 21, 2]]);
      case "hair": return rows([[4, 13, 18], [5, 11, 20], [6, 10, 21], [7, 10, 21], [8, 10, 12], [8, 15, 16], [8, 19, 21],
        [9, 10, 10, 1], [9, 21, 21, 1], [10, 10, 10, 1], [10, 21, 21, 1], [11, 10, 10, 1], [11, 21, 21, 1], [12, 10, 10, 1], [12, 21, 21, 1]]);
      case "horns": return rows([[4, 11, 12], [3, 11, 11], [2, 10, 10], [1, 10, 10, 2], [4, 19, 20], [3, 20, 20], [2, 21, 21], [1, 21, 21, 2]]);
      case "halo": return rows([[1, 13, 18, 2], [2, 12, 12, 2], [2, 19, 19, 2], [3, 13, 18, 2]]);
      default: return rows([[0, 15, 16], [1, 14, 17], [2, 14, 17], [3, 13, 18], [4, 12, 19], [5, 12, 19], [6, 9, 22, 1], [3, 15, 15, 2]]);
    }
  }
  function bodyCells(shape, B) {
    const torsoTo = y1 => B.torso.filter(([x, y]) => y <= y1 && !(y === 15 && x >= 13 && x <= 18)).map(([x, y]) => [x, y, 0]);
    const armRows = (a, b) => B.arms.filter(([, y]) => y >= a && y <= b).map(([x, y]) => [x, y, 0]);
    const lx = 15 - B.legW - 1, rx = 16 + B.legW + 1;
    switch (SHAPES.body[shape]) {
      case "vest": return torsoTo(23).filter(([x, y]) => !(y >= 17 && (x === 15 || x === 16)));
      case "robe": return torsoTo(24).concat(armRows(16, 21), rows([[25, lx, rx], [26, lx, rx], [27, lx, rx], [28, lx, rx, 1]]))
        .map(c => c[1] === 20 && c[2] === 0 && Math.abs(c[0] - 15.5) < B.rowW[20] / 2 ? [c[0], c[1], 2] : c);
      case "armour": {
        const pads = rows([[15, B.armL.x0 - 1, B.armL.x1, 1], [16, B.armL.x0 - 1, B.armL.x1, 1], [15, B.armR.x0, B.armR.x1 + 1, 1], [16, B.armR.x0, B.armR.x1 + 1, 1]]);
        return torsoTo(23).map(([x, y]) => [x, y, (y === 18 || y === 21) && (x === 13 || x === 18) ? 2 : 0]).concat(pads);
      }
      case "hoodie": return torsoTo(23).concat(armRows(16, 22)).map(([x, y, r]) => [x, y, (y >= 20 && y <= 21 && x >= 13 && x <= 18) ? 1 : (y >= 16 && y <= 18 && (x === 14 || x === 17)) ? 2 : r]);
      case "overalls": {
        const w = B.rowW[16] / 2;
        const straps = rows([[15, 16 - w + 1, 16 - w + 2], [16, 16 - w + 1, 16 - w + 2], [17, 16 - w + 1, 16 - w + 2], [18, 16 - w + 1, 16 - w + 2, 2],
          [15, 15 + w - 2, 15 + w - 1], [16, 15 + w - 2, 15 + w - 1], [17, 15 + w - 2, 15 + w - 1], [18, 15 + w - 2, 15 + w - 1, 2]]);
        return B.torso.filter(([, y]) => y >= 19).map(([x, y]) => [x, y, 0]).concat(straps, B.legs.filter(([, y]) => y <= 28).map(([x, y]) => [x, y, 0]));
      }
      default: return torsoTo(23).concat(armRows(16, 18));
    }
  }
  function backCells(shape, B) {
    switch (SHAPES.back[shape]) {
      case "wings": {
        const o = [], L = B.armL.x0, R = B.armR.x1;
        const span = { 12: [1, 2], 13: [1, 4], 14: [1, 5], 15: [1, 6], 16: [1, 6], 17: [1, 6], 18: [1, 5], 19: [2, 4], 20: [3, 3] };
        for (const y in span) for (let d = span[y][0]; d <= span[y][1]; d++) {
          const role = d === span[y][1] && y >= 15 && y <= 17 ? 2 : y >= 19 ? 1 : 0;
          o.push([L - d, +y, role], [R + d, +y, role]);
        }
        return o;
      }
      case "sword": {
        const o = [];
        for (let t = 0; t <= 16; t++) o.push([7 + t, 27 - t, t >= 13 ? 1 : 0]);
        o.push([18, 14, 2], [20, 16, 2], [19, 13, 2], [21, 17, 2], [24, 10, 2]);
        return o;
      }
      case "jetpack": return rows([[11, 9, 10, 2], [12, 9, 10], [13, 9, 10], [14, 9, 10], [15, 9, 10, 1], [11, 21, 22, 2], [12, 21, 22], [13, 21, 22], [14, 21, 22], [15, 21, 22, 1]]);
      case "tail": {
        const bx = 15 + B.rowW[24] / 2 + 1;
        return [[bx, 24, 0], [bx + 1, 24, 0], [bx + 2, 23, 0], [bx + 3, 22, 0], [bx + 4, 21, 0], [bx + 4, 20, 0], [bx + 5, 19, 0], [bx + 5, 18, 2], [bx + 6, 18, 2]];
      }
      case "balloon": {
        const c = Math.min(28, B.armR.x1), o = [];
        const r = { 2: 1, 3: 2, 4: 3, 5: 3, 6: 3, 7: 2, 8: 1 };
        for (const y in r) for (let x = c - r[y]; x <= c + r[y]; x++) o.push([x, +y, 0]);
        o.push([c - 1, 4, 2], [c, 9, 2]);
        for (let y = 10; y <= 15; y++) o.push([c, y, 1]);
        return o;
      }
      default: {   // cape
        const o = [];
        for (let y = 15; y <= 28; y++) { const hw = B.half + 1 + Math.floor((y - 15) / 4); for (let x = 16 - hw; x <= 15 + hw; x++) o.push([x, y, y === 28 ? 1 : 0]); }
        return o;
      }
    }
  }
  function patColor(pal, pat, x, y, role, midY) {
    if (role === 1) return pal[1];
    if (role === 2) return pal[2];
    switch (pat) {
      case "stripe": return y % 2 ? pal[1] : pal[0];
      case "dots": return (x + y * 2) % 4 === 0 ? pal[2] : pal[0];
      case "check": return ((x >> 1) + (y >> 1)) % 2 ? pal[0] : pal[1];
      case "gradient": return y > midY ? pal[1] : pal[0];
      default: return pal[0];
    }
  }
  function bgCells(item) {
    const o = [], sh = SHAPES.bg[item.shape], rnd = seeded(hashF(String(item.id || item.name)));
    const put = (x, y, role) => { if (x >= 0 && y >= 0 && x < 32 && y < 32) o.push([x, y, role]); };
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      if (sh === "dots" && x % 4 === (y % 8 < 4 ? 1 : 3) && y % 4 === 1) put(x, y, 0);
      else if (sh === "stripes" && (x + y) % 6 < 2) put(x, y, 0);
      else if (sh === "checks" && ((x >> 2) + (y >> 2)) % 2 === 0) put(x, y, 0);
      else if (sh === "sunset") put(x, y, y < 11 ? 2 : y < 21 ? 0 : 1);
      else if (sh === "grid" && (x % 6 === 0 || y % 6 === 0)) put(x, y, 0);
    }
    if (sh === "stars") for (let i = 0; i < 9; i++) { const x = Math.floor(rnd() * 30) + 1, y = Math.floor(rnd() * 30) + 1, role = i % 3 ? 0 : 2; put(x, y, role); put(x - 1, y, role); put(x + 1, y, role); put(x, y - 1, role); put(x, y + 1, role); }
    if (sh === "bubbles") for (let i = 0; i < 6; i++) {
      const cx = Math.floor(rnd() * 28) + 2, cy = Math.floor(rnd() * 28) + 2, r = 2 + Math.floor(rnd() * 2);
      for (let a = 0; a < 24; a++) put(Math.round(cx + r * Math.cos(a / 24 * 6.283)), Math.round(cy + r * Math.sin(a / 24 * 6.283)), i % 2 ? 0 : 2);
    }
    if (sh === "waves") for (let k = 0; k < 5; k++) for (let x = 0; x < 32; x++) { const y = Math.round(3 + 2 * Math.sin(x / 3 + k) + k * 7); put(x, y, 0); put(x, y + 1, 1); }
    return o;
  }

  let SVG_N = 0;
  const HOLD = [[4, 6], [27, 5], [3, 18], [28, 17], [6, 27], [26, 27], [9, 2], [23, 2]];
  /* spec: { girth 0-4, sh 0-2, arm 0-2, mood, eq: { head, body, back, bg } (items) } */
  function avatarSVG(spec, opts) {
    opts = opts || {};
    const N = 32, fg = new Array(N * N).fill(null), ink = new Uint8Array(N * N);
    const set = (x, y, c, k) => { if (x < 0 || y < 0 || x >= N || y >= N) return; const i = y * N + x; fg[i] = c; ink[i] = k ? 1 : 0; };
    const B = bodyShape(spec), eq = spec.eq || {};
    const paint = (it, cells) => {
      const ys = cells.map(c => c[1]), midY = (Math.min(...ys) + Math.max(...ys)) / 2;
      for (const [x, y, role] of cells) set(x, y, patColor(it.pal, it.pat, x, y, role, midY));
    };
    if (eq.back) paint(eq.back, backCells(eq.back.shape, B));
    for (const [x, y] of [...B.head, ...B.torso, ...B.arms, ...B.legs]) set(x, y, SKIN);
    for (const [x, y] of B.collar) set(x, y, INK, 1);
    for (const [x, y] of B.waist) set(x, y, INK, 1);
    if (eq.body) paint(eq.body, bodyCells(eq.body.shape, B));
    if (eq.head) paint(eq.head, headCells(eq.head.shape));
    const hairy = eq.head && SHAPES.head[eq.head.shape] === "hair";
    if (spec.mood === "sleepy") { set(12, 10, INK, 1); set(13, 10, INK, 1); set(18, 10, INK, 1); set(19, 10, INK, 1); }
    else { set(13, 9, INK, 1); set(13, 10, INK, 1); set(18, 9, INK, 1); set(18, 10, INK, 1); }
    if (spec.mood === "happy") {
      set(14, 12, INK, 1); set(15, 13, INK, 1); set(16, 13, INK, 1); set(17, 12, INK, 1);
      if (!hairy) { set(12, 11, BLUSH); set(19, 11, BLUSH); }
    } else { set(15, 12, INK, 1); set(16, 12, INK, 1); }
    const outline = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (fg[y * N + x]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= N || Y >= N) continue;
        const j = Y * N + X;
        if (fg[j] && !ink[j]) { outline.push(y * N + x); break; }
      }
    }
    for (const i of outline) fg[i] = INK;
    let bg = "";
    if (eq.bg) {
      bg += `<rect width="32" height="32" fill="${eq.bg.pal[0]}" fill-opacity=".14"/>`;
      bg += runs(bgCells(eq.bg).map(([x, y, role]) => [x, y, role === 1 ? eq.bg.pal[1] : role === 2 ? eq.bg.pal[2] : eq.bg.pal[0]]), N, ' fill-opacity=".42"');
    }
    const fig = runs(fg.map((c, i) => c ? [i % N, Math.floor(i / N), c] : null).filter(Boolean), N, "");
    const items = [eq.head, eq.body, eq.back, eq.bg].filter(Boolean);
    const glow = items.find(i => i.fx === "glow");
    const spark = items.filter(i => i.fx === "sparkle");
    const id = "qg" + (++SVG_N);
    const defs = glow ? `<defs><filter id="${id}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0" stdDeviation=".7" flood-color="${glow.pal[2]}" flood-opacity=".95"/></filter></defs>` : "";
    let sp = "";
    spark.forEach((it, k) => {
      const rnd = seeded(hashF(String(it.id || it.name) + k));
      HOLD.slice().sort(() => rnd() - 0.5).slice(0, 5).forEach(([x, y], i) => {
        sp += `<rect class="q-tw" style="animation-delay:${(rnd() * 1.6).toFixed(2)}s" x="${x}" y="${y}" width="1" height="1" fill="${it.pal[2]}"/>`;
      });
    });
    return `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" class="q-svg${opts.cls ? " " + opts.cls : ""}"${opts.label ? ` role="img" aria-label="${opts.label}"` : ' aria-hidden="true"'}>${defs}<g>${bg}</g><g class="q-fig"${glow ? ` filter="url(#${id})"` : ""}>${fig}</g>${sp}</svg>`;
  }
  function runs(cells, N, extra) {
    const grid = new Map();
    for (const [x, y, c] of cells) grid.set(y * N + x, c);
    let out = "";
    for (let y = 0; y < N; y++) {
      let x = 0;
      while (x < N) {
        const c = grid.get(y * N + x);
        if (!c) { x++; continue; }
        let w = 1; while (x + w < N && grid.get(y * N + x + w) === c) w++;
        out += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${c}"${extra}/>`;
        x += w;
      }
    }
    return out;
  }
  function chestSVG(color) {
    const cells = [];
    const R = (y, x0, x1, c) => { for (let x = x0; x <= x1; x++) cells.push([x, y, c]); };
    R(3, 4, 11, color); R(4, 3, 12, color); R(5, 3, 12, color); R(6, 3, 12, INK);
    for (let y = 7; y <= 12; y++) R(y, 3, 12, "#9A6232");
    R(9, 3, 12, "#7A4A22"); R(7, 7, 8, "#F5C84C"); R(8, 7, 8, "#F5C84C");
    R(4, 5, 5, "#FFFFFF");
    const fg = new Map(cells.map(([x, y, c]) => [y * 16 + x, c]));
    const out = [];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (fg.has(y * 16 + x)) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => fg.has((y + dy) * 16 + x + dx) && x + dx >= 0 && x + dx < 16)) out.push([x, y, INK]);
    }
    return `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" class="q-chest-svg" aria-hidden="true">${runs(cells.concat(out), 16, "")}</svg>`;
  }

  /* What the avatar looks like right now. */
  function avatarSpec(S, E, td) {
    td = td || E.today();
    const log = (S.train && S.train.log) || [], goal = S.goal || {}, g = S.game || {};
    const from = E.addDays(td, -27);
    const sets28 = log.filter(s => s.date >= from && s.date <= td).reduce((a, s) => a + doneSets(s), 0);
    const arm = sets28 >= 60 ? 2 : sets28 >= 20 ? 1 : 0;
    let gp = null; try { gp = goal.mode !== "maintain" ? E.goalProgress(S, td) : null; } catch (e) { }
    let girth = 2, sh = arm;
    if (gp && goal.mode === "loss") girth = Math.round((1 - gp.pct) * 4);
    else if (gp && goal.mode === "gain") { girth = 1; sh = Math.max(arm, Math.round(gp.pct * 2)); }
    else if (goal.mode === "maintain") girth = 1;
    const last = log.filter(counts).reduce((m, s) => s.date > m ? s.date : m, "");
    const idle = last ? E.daysBetween(last, td) : E.daysBetween(g.start || td, td);
    const mood = last && idle <= 2 ? "happy" : idle >= 7 ? "sleepy" : "calm";
    const byId = new Map(((g.items) || []).map(i => [i.id, i]));
    const eq = {};
    for (const s of SLOTS) { const it = g.eq && byId.get(g.eq[s]); if (it && it.slot === s) eq[s] = it; }
    return { girth, sh, arm, mood, eq, gp, sets28, idle, last };
  }

  const Core = { RAR, RCOL, ODDS, PITY_RARE, PITY_LEG, CHEST_COST, SLOTS, SLOT_NAME, SHAPES, PATTERNS, THEME,
    doneSets, weeks, events, summary, stats, pityOf, rollRarity, localItem, aiPrompt, parseItem, achText, ACH_COUNT: ACH.length,
    avatarSVG, avatarSpec, bodyShape, chestSVG, hashF, seeded };
  if (typeof module === "object" && module.exports) { module.exports = Core; return; }
  root.SPQuestCore = Core;

  /* ================================================================ view */
  root.SPQuest = function (X) {
    const { h, svg, E } = X;
    const C = Core;
    const S = () => X.S();
    const G = () => {
      const s = S();
      if (!s.game) s.game = {};
      const g = s.game;
      if (!Array.isArray(g.items)) g.items = [];
      if (!g.eq) g.eq = {};
      if (!g.ach) g.ach = {};
      return g;
    };
    const QI = {
      chest: '<rect x="3.5" y="9.5" width="17" height="10.5" rx="1.5"/><path d="M3.5 13.5h17M5 9.5V8a4 4 0 014-4h6a4 4 0 014 4v1.5"/><rect x="10.5" y="11.8" width="3" height="3.6" rx=".8"/>',
      coin: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.5 9.5h3.8a1.7 1.7 0 010 3.4h-2.6a1.7 1.7 0 000 3.4h3.8"/>',
      flame: '<path d="M12.5 3c.4 3-2 4.3-3.3 6.3C8 11 7.5 12.4 7.5 14a4.5 4.5 0 009 0c0-2.4-1.3-3.6-2.1-5.2.9 2-1.6 3.4-1.6 3.4.6-3.3-.3-6.8-.3-9.2z"/>',
      shield: '<path d="M12 3l7 2.8v5.5c0 4.5-3 8-7 9.7-4-1.7-7-5.2-7-9.7V5.8z"/>',
      lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/>'
    };
    const ico = (k, cls) => h("span", { class: "q-ico " + (cls || ""), html: svg(QI[k]) });
    const rand = () => { const a = new Uint32Array(1); (self.crypto || crypto).getRandomValues(a); return a[0] / 4294967296; };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
    let BUSY = false, SLOT_TAB = 0;

    function ensureStart() {
      const g = G();
      if (!g.start) { g.start = E.today(); X.save(); }
    }
    // remember the day each feat was first seen, so its reward keeps a stable date
    function stampFeats(sum) {
      const g = G(); let dirty = false;
      sum.ach.forEach((ok, i) => { if (ok && !g.ach[i]) { g.ach[i] = E.today(); dirty = true; } });
      if (dirty) X.save();
    }
    const summary = () => C.summary(S(), E);
    function pendingCount() { try { return summary().pending.length; } catch (e) { return 0; } }

    function bodyNote(spec) {
      const goal = S().goal || {}, gp = spec.gp;
      if (!gp) return goal.mode === "maintain" ? "Maintenance mode: your avatar holds its shape while you stay on trend." : "Set a goal weight in Strategy and your avatar's shape follows your weight trend toward it.";
      const kg = v => (Math.round(v * 10) / 10).toFixed(1);
      return `Trend ${kg(gp.current)} kg · ${Math.round(gp.pct * 100)}% of the way from ${kg(gp.start)} to ${kg(gp.goal)} kg. Shape follows the smoothed trend, not today's reading.`;
    }
    const moodNote = spec => spec.mood === "happy" ? "Fresh from training." : spec.mood === "sleepy" ? `No session in ${spec.idle} days. Getting drowsy.` : "Rested and ready.";

    function view() {
      ensureStart();
      const sum = summary(); stampFeats(sum);
      const spec = C.avatarSpec(S(), E);
      const root = h("div", { class: "quest" });
      root.append(X.head("Quest", h("div", { class: "q-goldchip", "aria-label": `${sum.gold} gold` }, ico("coin"), h("b", null, sum.gold))));

      /* hero */
      const pct = Math.max(0, Math.min(1, (sum.earned - sum.lvFrom) / (sum.lvTo - sum.lvFrom)));
      root.append(h("div", { class: "card q-hero" },
        h("div", { class: "q-stage q-bob", html: C.avatarSVG(spec, { label: "Your avatar" }) }),
        h("div", { class: "q-lv" }, h("b", null, `Level ${sum.level}`), h("span", null, sum.title)),
        h("div", { class: "q-xp", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(pct * 100) }, h("i", { style: { width: (pct * 100).toFixed(1) + "%" } })),
        h("div", { class: "q-xpn" }, `${sum.earned - sum.lvFrom} / ${sum.lvTo - sum.lvFrom} to level ${sum.level + 1}`),
        h("p", { class: "note q-body" }, moodNote(spec) + " " + bodyNote(spec))));

      /* chests */
      const n = sum.pending.length;
      const chestCard = h("div", { class: "card q-chests" + (n ? " has" : "") });
      chestCard.append(h("div", { class: "q-chestrow" },
        h("div", { class: "q-chestpic" + (n ? " wiggle" : ""), html: C.chestSVG(n ? "#E2A91F" : "#9AA0A6") }),
        h("div", { class: "q-chesttxt" },
          h("b", null, n ? `${n} chest${n > 1 ? "s" : ""} waiting` : "No chests waiting"),
          h("span", null, n ? "What's inside is decided when you open it." : "Finish a workout with 6+ sets, hit your weekly target, or nail a food day."))));
      const btns = h("div", { class: "btnrow", style: { marginTop: "12px" } });
      if (n) btns.append(h("button", { class: "btn primary", onclick: () => openChest(sum.pending[0]) }, n > 1 ? "Open one" : "Open it"));
      btns.append(h("button", { class: "btn" + (sum.gold < C.CHEST_COST ? " dim" : ""), onclick: () => buyChest() }, ico("coin", "sm"), `Buy a chest · ${C.CHEST_COST}`));
      chestCard.append(btns);
      root.append(chestCard);

      /* week */
      const wk = sum.weeks, dots = h("div", { class: "q-dots" });
      for (let i = 0; i < Math.max(wk.target, wk.current.n); i++) dots.append(h("i", { class: i < wk.current.n ? "on" : null }));
      root.append(X.section("This week"));
      root.append(h("div", { class: "card q-week" },
        h("div", { class: "q-weekrow" }, h("div", null, h("b", null, `${wk.current.n} of ${wk.target} sessions`), dots),
          h("div", { class: "q-streak" },
            h("span", { title: "Weeks in a row" }, ico("flame"), h("b", null, wk.live), " wk"),
            h("span", { title: "Shields" }, ico("shield"), h("b", null, wk.shields)))),
        h("p", { class: "note", style: { marginBottom: 0 } }, wk.current.n >= wk.target ? "Target hit. The bonus chest arrives when the week closes on Sunday." :
          `${wk.target - wk.current.n} more to hit this week's target. A shield saves your streak from one missed week; you earn one every four weeks you hit.`)));

      /* wardrobe */
      root.append(X.section(G().items.length ? `Wardrobe · ${G().items.length}` : "Wardrobe"));
      const ward = h("div", { class: "card" });
      const paintWard = () => {
        ward.innerHTML = "";
        ward.append(X.seg(C.SLOTS.map(s => C.SLOT_NAME[s]), SLOT_TAB, i => { SLOT_TAB = i; paintWard(); }, "q-seg"));
        const slot = C.SLOTS[SLOT_TAB], g = G();
        const list = g.items.filter(i => i.slot === slot).sort((a, b) => b.r - a.r || (b.at || 0) - (a.at || 0));
        if (!list.length) { ward.append(h("p", { class: "note" }, `Nothing for this slot yet. Chests can hold ${C.SLOT_NAME[slot].toLowerCase()} items.`)); return; }
        const grid = h("div", { class: "q-grid" });
        list.forEach(it => {
          const on = g.eq[slot] === it.id;
          const prev = Object.assign({}, spec, { eq: { [slot]: it }, mood: "calm" });
          grid.append(h("button", { class: "q-tile" + (on ? " on" : ""), style: { "--rc": C.RCOL[it.r] }, "aria-label": `${it.name}, ${C.RAR[it.r]}${on ? ", equipped" : ""}`, onclick: () => itemSheet(it) },
            h("div", { class: "q-mini", html: C.avatarSVG(prev) }), h("i", { class: "rar" })));
        });
        ward.append(grid);
      };
      paintWard();
      root.append(ward);

      /* feats */
      const found = sum.ach.filter(Boolean).length;
      root.append(X.section(`Hidden feats · ${found} of ${C.ACH_COUNT}`));
      const fg = h("div", { class: "q-feats" });
      sum.ach.forEach((ok, i) => {
        const t = ok ? C.achText(i) : null;
        fg.append(h("div", { class: "q-feat" + (ok ? " on" : "") }, ok ? ico("flame") : ico("lock"), h("b", null, ok ? t.name : "???"), ok ? h("span", null, t.desc) : null));
      });
      root.append(h("div", { class: "card" }, fg));

      /* recent */
      if (sum.events.length) {
        root.append(X.section("Recent"));
        root.append(h("div", { class: "card q-recent" }, sum.events.slice(0, 10).map(e => h("div", { class: "q-ev" },
          h("div", null, h("b", null, e.label), h("span", null, X.dShort(e.date))),
          h("div", { class: "q-evr" }, e.chest ? ico("chest", "sm") : null, h("b", null, "+" + e.gold))))));
      }

      /* rules — the rules are public, the rewards aren't */
      root.append(h("details", { class: "card q-rules" }, h("summary", null, "How you earn"),
        h("ul", null,
          h("li", null, "Workout with 6+ working sets: gold and a chest. Fewer sets still earn gold."),
          h("li", null, "Intervals with 6+ rounds: gold and a chest."),
          h("li", null, "Food day within 10% of calories and 90% of protein: gold, sometimes a chest. Any logged day earns a little, so log the bad days too."),
          h("li", null, "Weigh-in: a little gold."),
          h("li", null, "Weekly session target hit: bonus gold and a chest, more for a longer streak."),
          h("li", null, "Hidden feats: gold and a chest each. What unlocks them is a secret."),
          h("li", null, "Your avatar's shape follows your weight trend toward your goal; its arms follow the working sets you've done in the last four weeks."))));
      return root;
    }

    function itemSheet(it) {
      const g = G(), on = g.eq[it.slot] === it.id;
      const spec = C.avatarSpec(S(), E);
      X.openSheet(sh => {
        sh.append(h("div", { class: "q-reveal done", style: { "--rc": C.RCOL[it.r] } },
          h("div", { class: "q-rar" }, C.RAR[it.r] + " · " + C.SLOT_NAME[it.slot]),
          h("div", { class: "q-stage sm", html: C.avatarSVG(Object.assign({}, spec, { eq: Object.assign({}, spec.eq, { [it.slot]: it }) })) }),
          h("h2", null, it.name), h("p", { class: "note" }, it.flavor)),
          h("button", { class: "btn primary block", onclick: () => { g.eq[it.slot] = on ? null : it.id; X.save(); X.closeSheet(); X.render(false); } }, on ? "Take it off" : "Wear it"));
      });
    }

    function buyChest() {
      const sum = summary();
      if (sum.gold < C.CHEST_COST) { X.toast(`${C.CHEST_COST - sum.gold} more gold needed`); return; }
      openChest({ id: "buy:" + X.uid(), cost: C.CHEST_COST, min: 0 });
    }

    async function openChest(ev) {
      if (BUSY) return;
      const g = G();
      if (g.items.some(i => i.id === ev.id)) return;
      BUSY = true;
      const r = C.rollRarity(rand(), g.items, ev.min || 0);
      const slot = C.SLOTS[Math.floor(rand() * C.SLOTS.length)];
      const shape = Math.floor(rand() * C.SHAPES[slot].length);
      let item = C.localItem(rand, slot, shape, r);
      const box = h("div", { class: "q-reveal", style: { "--rc": C.RCOL[r] } },
        h("div", { class: "q-bigchest shake", html: C.chestSVG("#E2A91F") }),
        h("p", { class: "note" }, "Opening…"));
      X.openSheet(sh => sh.append(box));
      const t0 = Date.now();
      if (X.aiReady && X.aiReady()) {
        const words = C.THEME.slice().sort(() => rand() - 0.5).slice(0, 2);
        try { const txt = await withTimeout(X.aiCall("loot", C.aiPrompt(slot, shape, r, words), null, 400), 14000); item = C.parseItem(txt, item) || item; } catch (e) { }
      }
      item.id = ev.id; item.at = Date.now();
      if (ev.cost) item.cost = ev.cost;
      g.items.push(item); X.save();
      await sleep(Math.max(0, 1300 - (Date.now() - t0)));
      BUSY = false;
      if (!box.isConnected) { X.render(false); return; }
      const spec = C.avatarSpec(S(), E);
      const left = summary().pending;
      box.innerHTML = ""; box.classList.add("done");
      box.append(
        h("div", { class: "q-burst" }),
        h("div", { class: "q-rar" }, C.RAR[r] + " · " + C.SLOT_NAME[slot]),
        h("div", { class: "q-stage sm pop", html: C.avatarSVG(Object.assign({}, spec, { eq: Object.assign({}, spec.eq, { [slot]: item }) })) }),
        h("h2", null, item.name), h("p", { class: "note" }, item.flavor),
        h("div", { class: "btnrow", style: { justifyContent: "center", marginTop: "14px" } },
          h("button", { class: "btn primary", onclick: () => { g.eq[slot] = item.id; X.save(); X.closeSheet(); X.render(false); } }, "Wear it"),
          left.length ? h("button", { class: "btn", onclick: () => { X.closeSheet(true); openChest(left[0]); } }, `Open next (${left.length})`)
            : h("button", { class: "btn", onclick: () => { X.closeSheet(); X.render(false); } }, "Keep it")));
    }

    return { view, pendingCount, icon: QI.chest };
  };
})(typeof self !== "undefined" ? self : globalThis);
