/* Run with:  node test/quest.test.js */
"use strict";
const assert = require("assert");
const E = require("../js/engine.js");
const Q = require("../js/quest.js");
const Y = require("../js/sync.js");

const TD = "2026-09-30";   // a Wednesday
function blank() {
  return {
    v: 2, profile: { sex: "m", age: 35, heightCm: 172, activity: 1.45 },
    goal: { mode: "loss", ratePct: 0.6, goalWeight: 72, startWeight: 88, startDate: "2026-09-01", proteinMode: "lbm", proteinPerKg: 2.2, fatPerKg: 0.8, weekendPct: 0 },
    settings: { kcalPerKg: 7700, alpha: 0.25, theme: "dark", demo: false, estimator: "kalman", rho: "auto" },
    weights: {}, intake: {}, fasted: {}, custom: [], meals: [], health: {}, meta: { u: {}, tomb: {} },
    program: { checkins: [] }, train: { profile: { days: 3 }, plan: null, log: [], active: null },
    game: { start: "2026-09-21", eq: {}, ach: {}, items: [] }
  };
}
const lift = (id, date, n, extra) => Object.assign({ id, type: "lift", date, name: "Full Body A", dur: 45, ex: [{ ex: "x", sets: Array.from({ length: n }, () => ({ w: 20, reps: 10, rir: 2, done: true })) }] }, extra || {});
const food = (kcal, p) => [{ id: "f" + kcal, name: "meal", kcal, p, f: 50, c: 200, qty: 1, t: "12:00" }];

let pass = 0;
const test = (n, f) => { try { f(); pass++; console.log("  ok  " + n); } catch (e) { console.error("  FAIL " + n + "\n       " + (e.stack || e.message)); process.exit(1); } };

console.log("Setpoint quest");

test("a workout with 6+ done sets earns gold and a chest; fewer sets earn gold only", () => {
  const S = blank();
  S.train.log.push(lift("a", "2026-09-29", 8), lift("b", "2026-09-28", 3));
  const ev = Q.events(S, E, TD).list;
  const a = ev.find(e => e.id === "t:a"), b = ev.find(e => e.id === "t:b");
  assert.ok(a.chest && a.gold === 30 + 16);
  assert.ok(!b.chest && b.gold === 16);
});

test("undone sets don't count", () => {
  const S = blank(), s = lift("a", "2026-09-29", 8);
  s.ex[0].sets.forEach((x, i) => { if (i > 2) x.done = false; });
  S.train.log.push(s);
  assert.strictEqual(Q.doneSets(s), 3);
  assert.ok(!Q.events(S, E, TD).list.find(e => e.id === "t:a").chest);
});

test("sessions older than a week before the start don't pay", () => {
  const S = blank();
  S.train.log.push(lift("old", "2026-09-10", 10), lift("ok", "2026-09-15", 10));
  const ids = Q.events(S, E, TD).list.map(e => e.id);
  assert.ok(!ids.includes("t:old") && ids.includes("t:ok"));
});

test("food days: logging pays even when off target; today doesn't count yet", () => {
  const S = blank();
  S.weights["2026-09-22"] = { kg: 88 };
  const tg = E.targetsFor(S, "2026-09-25");
  assert.ok(tg && tg.kcal > 0);
  S.intake["2026-09-25"] = food(tg.kcal, tg.p);         // on target
  S.intake["2026-09-26"] = food(tg.kcal * 1.6, 20);      // way over
  S.intake[TD] = food(tg.kcal, tg.p);                    // today
  const ev = Q.events(S, E, TD).list;
  assert.strictEqual(ev.find(e => e.id === "n:2026-09-25").gold, 25);
  assert.strictEqual(ev.find(e => e.id === "n:2026-09-26").gold, 3);
  assert.ok(!ev.find(e => e.id === "n:" + TD));
  assert.ok(ev.find(e => e.id === "w:2026-09-22"));
});

test("weekly target pays a guaranteed uncommon-or-better chest", () => {
  const S = blank();
  ["2026-09-21", "2026-09-23", "2026-09-25"].forEach((d, i) => S.train.log.push(lift("w" + i, d, 6)));
  const sum = Q.summary(S, E, TD);
  const wk = sum.events.find(e => e.id === "k:2026-09-21");
  assert.ok(wk && wk.chest && wk.min === 1);
  assert.strictEqual(sum.weeks.live, 1);
});

test("a shield saves the streak from one missed week", () => {
  const S = blank();
  S.game.start = "2026-08-17";
  // weeks of 10, 17, 24, 31 Aug hit; 7 Sep missed; 14 and 21 Sep hit
  let k = 0;
  for (const ws of ["2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-14", "2026-09-21"])
    for (let i = 0; i < 3; i++) S.train.log.push(lift("s" + k++, E.addDays(ws, i * 2), 6));
  const w = Q.summary(S, E, TD).weeks;
  const miss = w.list.find(x => x.start === "2026-09-07");
  assert.ok(miss && !miss.hit && miss.saved);
  assert.strictEqual(w.streak, 6);
  assert.strictEqual(w.shields, 0);
});

test("gold = earned − spent, and opened chests stop being pending", () => {
  const S = blank();
  S.train.log.push(lift("a", "2026-09-29", 8));
  const before = Q.summary(S, E, TD);
  assert.ok(before.pending.some(e => e.id === "t:a"));
  S.game.items.push({ id: "t:a", slot: "head", shape: 0, r: 0, pal: ["#111111", "#222222", "#333333"], pat: "solid", fx: "none", at: 1 });
  S.game.items.push({ id: "buy:x", slot: "head", shape: 1, r: 0, pal: ["#111111", "#222222", "#333333"], pat: "solid", fx: "none", at: 2, cost: 250 });
  const after = Q.summary(S, E, TD);
  assert.ok(!after.pending.some(e => e.id === "t:a"));
  assert.strictEqual(after.gold, after.earned - 250);
});

test("rarity rolls follow the odds and the pity timers", () => {
  assert.strictEqual(Q.rollRarity(0.1, [], 0), 0);
  assert.strictEqual(Q.rollRarity(0.99999, [], 0), 4);
  assert.strictEqual(Q.rollRarity(0.1, [], 1), 1);
  const dud = n => Array.from({ length: n }, (_, i) => ({ r: 0, at: i }));
  assert.strictEqual(Q.rollRarity(0.1, dud(5), 0), 0);
  assert.strictEqual(Q.rollRarity(0.1, dud(6), 0), 2);          // 7th open is forced rare
  const mixed = dud(39).map((x, i) => i % 5 === 0 ? { r: 2, at: i } : x);
  assert.strictEqual(Q.rollRarity(0.1, mixed, 0), 4);          // 40th without a legendary
  const sum = Q.ODDS.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test("AI item JSON is validated and clamped to the rarity", () => {
  const base = Q.localItem(Q.seeded(0.3), "head", 2, 0);
  const good = Q.parseItem('Sure! {"name":"Monsoon Crown","flavor":"Wet but regal.","palette":["#1a2b3c","#0f1822","#ffcc00"],"pattern":"stripe","fx":"glow"}', base);
  assert.strictEqual(good.name, "Monsoon Crown");
  assert.deepStrictEqual(good.pal, ["#1A2B3C", "#0F1822", "#FFCC00"]);
  assert.strictEqual(good.fx, "none");                           // common can't glow
  assert.strictEqual(Q.parseItem("no json here", base), null);
  const bad = Q.parseItem('{"name":"<b>x</b>","palette":["red","blue","green"],"pattern":"plaid"}', base);
  assert.strictEqual(bad.pal, base.pal);
  assert.strictEqual(bad.pat, base.pat);
  assert.ok(!/[<>]/.test(bad.name));
  const leg = Q.parseItem('{"name":"Star","fx":"none"}', Object.assign({}, base, { r: 4 }));
  assert.strictEqual(leg.fx, "sparkle");
});

test("local items are well formed for every slot and shape", () => {
  const rnd = Q.seeded(0.77);
  for (const slot of Q.SLOTS) for (let sh = 0; sh < Q.SHAPES[slot].length; sh++) for (let r = 0; r < 5; r++) {
    const it = Q.localItem(rnd, slot, sh, r);
    assert.ok(it.name && it.flavor);
    it.pal.forEach(c => assert.ok(/^#[0-9A-F]{6}$/.test(c), c));
  }
});

test("avatar renders for every body and every item shape", () => {
  const rnd = Q.seeded(0.12);
  for (let g = 0; g <= 4; g++) for (let sh = 0; sh <= 2; sh++) for (const mood of ["happy", "calm", "sleepy"]) {
    const s = Q.avatarSVG({ girth: g, sh, arm: sh, mood, eq: {} });
    assert.ok(s.startsWith("<svg") && s.includes("<rect"));
  }
  for (const slot of Q.SLOTS) for (let sh = 0; sh < Q.SHAPES[slot].length; sh++) {
    const it = Object.assign(Q.localItem(rnd, slot, sh, 4), { id: slot + sh });
    const s = Q.avatarSVG({ girth: 4, sh: 2, arm: 2, mood: "happy", eq: { [slot]: it } });
    assert.ok(!/NaN|undefined/.test(s), slot + " " + Q.SHAPES[slot][sh]);
  }
});

test("body shape widens with girth and stays symmetric", () => {
  const w = g => { const B = Q.bodyShape({ girth: g, sh: 0, arm: 0 }); const xs = B.torso.filter(([, y]) => y === 21).map(c => c[0]); return [Math.min(...xs), Math.max(...xs)]; };
  const [a0, a1] = w(0), [b0, b1] = w(4);
  assert.ok(b1 - b0 > a1 - a0);
  assert.strictEqual(a0 + a1, 31); assert.strictEqual(b0 + b1, 31);
});

test("avatar spec follows goal progress, training and rest", () => {
  const S = blank();
  S.weights["2026-09-01"] = { kg: 88 }; S.weights["2026-09-29"] = { kg: 80 };
  S.train.log.push(lift("a", "2026-09-29", 30), lift("b", "2026-09-27", 30), lift("c", "2026-09-25", 10));
  const sp = Q.avatarSpec(S, E, TD);
  assert.ok(sp.girth < 4, "some progress should slim the avatar");
  assert.strictEqual(sp.arm, 2);
  assert.strictEqual(sp.mood, "happy");
  assert.strictEqual(Q.avatarSpec(S, E, "2026-10-09").mood, "sleepy");
});

test("equipped items only apply to their own slot", () => {
  const S = blank();
  S.game.items.push({ id: "i1", slot: "head", shape: 0, r: 1, pal: ["#111111", "#222222", "#333333"], pat: "solid", fx: "none" });
  S.game.eq = { head: "i1", body: "i1", back: "missing" };
  const sp = Q.avatarSpec(S, E, TD);
  assert.ok(sp.eq.head && !sp.eq.body && !sp.eq.back);
});

test("hidden feats unlock and pay once", () => {
  const S = blank();
  S.train.log.push(lift("a", "2026-09-29", 25));
  const sum = Q.summary(S, E, TD);
  assert.ok(sum.ach[0]);                                        // at least one
  const feats = sum.events.filter(e => e.kind === "feat");
  assert.strictEqual(new Set(feats.map(e => e.id)).size, feats.length);
  assert.ok(Q.achText(0).name.length > 0);
});

test("quest items and state sync as records", () => {
  const S = blank();
  S.game.items.push({ id: "t:a", slot: "bg", shape: 3, r: 2, at: 5 });
  S.game.eq = { bg: "t:a" };
  const back = Y.unflatten(Y.flatten(S), S);
  assert.deepStrictEqual(back.game.items, S.game.items);
  assert.deepStrictEqual(back.game.eq, S.game.eq);
  assert.strictEqual(back.game.start, S.game.start);
  // two devices each open a different chest: merge keeps both
  const L = blank(), R = blank();
  const now = Date.now();
  L.game.items.push({ id: "t:x", slot: "head", r: 0, at: 1 }); L.meta.u["g|t:x"] = now;
  R.game.items.push({ id: "t:y", slot: "body", r: 1, at: 2 }); R.meta.u["g|t:y"] = now;
  const M = Y.merge(L, R);
  assert.deepStrictEqual(M.game.items.map(i => i.id).sort(), ["t:x", "t:y"]);
});

console.log(`\n${pass} passed`);
