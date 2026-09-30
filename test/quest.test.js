/* Run with:  node test/quest.test.js */
"use strict";
const assert = require("assert");
const E = require("../js/engine.js");
const Q = require("../js/quest.js");
const Y = require("../js/sync.js");

const TD = "2026-09-30";   // a Wednesday; week starts Mon 2026-09-28
function blank() {
  return {
    v: 2, profile: { sex: "m", age: 35, heightCm: 172, activity: 1.45 },
    goal: { mode: "loss", ratePct: 0.6, goalWeight: 72, startWeight: 88, startDate: "2026-09-01", proteinMode: "lbm", proteinPerKg: 2.2, fatPerKg: 0.8, weekendPct: 0 },
    settings: { kcalPerKg: 7700, alpha: 0.25, theme: "dark", demo: false, estimator: "kalman", rho: "auto" },
    weights: {}, intake: {}, fasted: {}, custom: [], meals: [], health: {}, meta: { u: {}, tomb: {} },
    program: { checkins: [] }, train: { profile: { days: 3 }, plan: null, log: [], active: null },
    game: { start: "2026-09-21", hero: { cls: "sword", hair: "bun", hc: 0, skin: 1, name: "" }, eq: {}, ach: {}, fights: {}, items: [] }
  };
}
const lift = (id, date, n, rir, extra) => Object.assign({ id, type: "lift", date, name: "Full Body A", dur: 45,
  ex: [{ ex: "x", sets: Array.from({ length: n }, () => ({ w: 20, reps: 10, rir: rir == null ? 2 : rir, done: true })) }] }, extra || {});
const food = (kcal, p) => [{ id: "f" + kcal, name: "meal", kcal, p, f: 50, c: 200, qty: 1, t: "12:00" }];

let pass = 0;
const test = (n, f) => { try { f(); pass++; console.log("  ok  " + n); } catch (e) { console.error("  FAIL " + n + "\n       " + (e.stack || e.message)); process.exit(1); } };

console.log("Setpoint quest");

test("workouts with 6+ done sets earn stones and a chest; fewer earn stones only", () => {
  const S = blank();
  S.train.log.push(lift("a", "2026-09-29", 8), lift("b", "2026-09-28", 3));
  const ev = Q.baseEvents(S, E, TD).list;
  assert.ok(ev.find(e => e.id === "t:a").chest);
  assert.ok(!ev.find(e => e.id === "t:b").chest);
});

test("food days pay even off target; today doesn't count yet", () => {
  const S = blank();
  S.weights["2026-09-22"] = { kg: 88 };
  const tg = E.targetsFor(S, "2026-09-25");
  S.intake["2026-09-25"] = food(tg.kcal, tg.p); S.intake["2026-09-26"] = food(tg.kcal * 1.6, 20); S.intake[TD] = food(tg.kcal, tg.p);
  const ev = Q.baseEvents(S, E, TD).list;
  assert.strictEqual(ev.find(e => e.id === "n:2026-09-25").gold, 25);
  assert.strictEqual(ev.find(e => e.id === "n:2026-09-26").gold, 3);
  assert.ok(!ev.find(e => e.id === "n:" + TD));
});

test("hitting the weekly target with a normal plan beats the boss", () => {
  const S = blank();
  ["2026-09-21", "2026-09-23", "2026-09-25"].forEach((d, i) => S.train.log.push(lift("w" + i, d, 16)));
  const b = Q.battle(S, E, "2026-09-21", TD, 1, {});
  assert.ok(b.won, `dealt ${b.dmg} of ${b.hp}`);
  assert.strictEqual(b.wonOn, "2026-09-25");
  const sum = Q.summary(S, E, TD);
  const ev = sum.events.find(e => e.id === "b:2026-09-21");
  assert.ok(ev && ev.chest && ev.min === 1);
});

test("one light session doesn't beat it; hard sets hit harder than easy ones", () => {
  const S = blank();
  S.train.log.push(lift("a", "2026-09-21", 16));
  assert.ok(!Q.battle(S, E, "2026-09-21", TD, 1, {}).won);
  const S1 = blank(), S2 = blank();
  S1.train.log.push(lift("a", "2026-09-21", 10, 1)); S2.train.log.push(lift("a", "2026-09-21", 10, 4));
  assert.ok(Q.battle(S1, E, "2026-09-21", TD, 1, {}).dmg > Q.battle(S2, E, "2026-09-21", TD, 1, {}).dmg * 1.5);
});

test("soft penalty: two idle days let the boss heal and strike, only while the target isn't met", () => {
  const S = blank();
  S.train.log.push(lift("a", "2026-09-21", 16));        // Mon, then nothing
  const b = Q.battle(S, E, "2026-09-21", TD, 1, {});
  const hurt = b.days.filter(d => d.strike > 0);
  assert.ok(hurt.length >= 1 && b.days.some(d => d.bossHeal > 0));
  assert.ok(b.php < b.stats.hp);
  const S2 = blank();
  ["2026-09-21", "2026-09-22", "2026-09-23"].forEach((d, i) => S2.train.log.push(lift("w" + i, d, 16)));
  assert.ok(!Q.battle(S2, E, "2026-09-21", TD, 1, {}).days.some(d => d.strike > 0), "no strikes once the target is met");
});

test("at 0 HP you hit at half power; food heals you", () => {
  const S = blank();
  S.train.log.push(lift("a", "2026-09-21", 6), lift("b", "2026-09-27", 10));
  const b = Q.battle(S, E, "2026-09-21", TD, 1, {});
  const ko = b.days.find(d => d.ko);
  assert.ok(ko, "should be knocked out after a long gap");
  assert.ok(b.days.find(d => d.d === "2026-09-27").hits[0].ko);
  const S2 = JSON.parse(JSON.stringify(S));
  S2.weights["2026-09-20"] = { kg: 88 };
  const tg = E.targetsFor(S2, "2026-09-26");
  S2.intake["2026-09-26"] = food(tg.kcal, tg.p);
  const b2 = Q.battle(S2, E, "2026-09-21", TD, 1, {});
  assert.ok(b2.days.find(d => d.d === "2026-09-26").heal > 0);
});

test("gear stats and skills change the fight", () => {
  const S = blank();
  S.train.log.push(lift("a", "2026-09-28", 12, 1, { at: new Date("2026-09-28T07:30:00").getTime() }));
  const plain = Q.battle(S, E, "2026-09-28", TD, 1, {}).dmg;
  const sword = { id: "i1", slot: "weapon", r: 3, stat: { atk: 16, def: 0, hp: 0 }, skill: { k: "dawn", p: 60 } };
  const geared = Q.battle(S, E, "2026-09-28", TD, 1, { weapon: sword }).dmg;
  assert.ok(geared > plain * 2, `${geared} vs ${plain}`);
  const ward = { id: "i2", slot: "charm", r: 1, stat: { atk: 1, def: 1, hp: 5 }, skill: { k: "ward", p: 1 } };
  const S2 = blank(); S2.train.log.push(lift("a", "2026-09-21", 16));
  const w = Q.battle(S2, E, "2026-09-21", TD, 1, { charm: ward });
  assert.ok(w.days.some(d => d.warded));
});

test("finished fights are frozen with the gear worn at the time", () => {
  const S = blank();
  ["2026-09-21", "2026-09-23", "2026-09-25"].forEach((d, i) => S.train.log.push(lift("w" + i, d, 16)));
  S.game.fights["2026-09-21"] = { won: false, on: null, lv: 1, flawless: false, eq: {} };
  const sum = Q.summary(S, E, TD);
  const w = sum.weeks.find(x => x.ws === "2026-09-21");
  assert.ok(w.frozen && !w.won, "a frozen loss stays a loss");
  assert.ok(!sum.events.find(e => e.id === "b:2026-09-21"));
});

test("a shield forgives one lost week", () => {
  const S = blank();
  S.game.start = "2026-08-17";
  let k = 0;
  for (const ws of ["2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-14", "2026-09-21"])
    for (let i = 0; i < 3; i++) S.train.log.push(lift("s" + k++, E.addDays(ws, i * 2), 18));
  const sum = Q.summary(S, E, TD);
  assert.strictEqual(sum.streak, 6);
  assert.strictEqual(sum.shields, 0);
});

test("stones = earned − spent; opened chests stop being pending", () => {
  const S = blank();
  S.train.log.push(lift("a", "2026-09-29", 8));
  assert.ok(Q.summary(S, E, TD).pending.some(e => e.id === "t:a"));
  S.game.items.push(Object.assign(Q.localItem(Q.seeded(.1), "weapon", 0, 0), { id: "t:a", at: 1 }));
  S.game.items.push(Object.assign(Q.localItem(Q.seeded(.2), "head", 1, 0), { id: "buy:x", at: 2, cost: 250 }));
  const s = Q.summary(S, E, TD);
  assert.ok(!s.pending.some(e => e.id === "t:a"));
  assert.strictEqual(s.stones, s.earned - 250);
});

test("realm and layer follow the level", () => {
  assert.deepStrictEqual([Q.realmOf(1).zh, Q.realmOf(1).layer], ["炼气", 1]);
  assert.deepStrictEqual([Q.realmOf(6).zh, Q.realmOf(6).layer], ["筑基", 1]);
  assert.strictEqual(Q.realmOf(200).zh, "渡劫");
  assert.strictEqual(Q.levelOf(0), 1);
  assert.strictEqual(Q.levelOf(40 * 9), 4);
});

test("rarity rolls follow the odds and the pity timers", () => {
  assert.strictEqual(Q.rollRarity(0.1, [], 0), 0);
  assert.strictEqual(Q.rollRarity(0.99999, [], 0), 4);
  assert.strictEqual(Q.rollRarity(0.1, [], 1), 1);
  const dud = n => Array.from({ length: n }, (_, i) => ({ r: 0, at: i }));
  assert.strictEqual(Q.rollRarity(0.1, dud(6), 0), 2);
  const mixed = dud(39).map((x, i) => i % 5 === 0 ? { r: 2, at: i } : x);
  assert.strictEqual(Q.rollRarity(0.1, mixed, 0), 4);
});

test("items: stats by slot, skills from uncommon up, AI JSON validated", () => {
  const rnd = Q.seeded(0.77);
  for (const slot of Q.SLOTS) for (let sh = 0; sh < Q.SHAPES[slot].length; sh++) for (let r = 0; r < 5; r++) {
    const it = Q.localItem(rnd, slot, sh, r);
    it.pal.forEach(c => assert.ok(/^#[0-9A-F]{6}$/.test(c)));
    if (r === 0 && slot !== "charm") assert.strictEqual(it.skill, null);
    if (it.skill) assert.ok(Q.SKILLS[it.skill.k] && it.skill.p > 0);
  }
  const base = Q.localItem(Q.seeded(0.3), "weapon", 0, 0);
  const ai = Q.parseItem('ok {"name":"青霜剑 · Azure Frost Blade","flavor":"Cold.","palette":["#1a2b3c","#0f1822","#ffcc00"],"pattern":"stripe","fx":"glow"}', base);
  assert.strictEqual(ai.name, "青霜剑 · Azure Frost Blade");
  assert.strictEqual(ai.fx, "none");
  assert.deepStrictEqual(ai.stat, base.stat, "the AI can't change stats");
  assert.strictEqual(Q.parseItem("nope", base), null);
});

test("v1 items migrate to v2 slots with stats", () => {
  const old = { id: "t:z", slot: "body", shape: 3, r: 2, pal: ["#111111", "#222222", "#333333"], pat: "solid", fx: "glow", at: 5 };
  const m = Q.migrateItem(old);
  assert.strictEqual(m.v, 2); assert.strictEqual(m.slot, "robe"); assert.ok(m.stat.def > 0);
  assert.ok(m.shape < Q.SHAPES.robe.length);
  assert.strictEqual(Q.migrateItem(m), m);
});

test("cultivator and bosses render for every body, class and item", () => {
  const rnd = Q.seeded(0.12);
  for (let g = 0; g <= 4; g++) for (let sh = 0; sh <= 2; sh++) for (const hair of Q.HAIR) for (const mood of ["happy", "calm", "sleepy"]) {
    const s = Q.heroSVG({ hero: { cls: "body", hair, hc: 1, skin: 2 }, girth: g, sh, arm: sh, mood, eq: {} });
    assert.ok(s.startsWith("<svg") && !/NaN|undefined/.test(s));
  }
  for (const slot of Q.SLOTS) for (let sh = 0; sh < Q.SHAPES[slot].length; sh++) {
    const it = Object.assign(Q.localItem(rnd, slot, sh, 4), { id: slot + sh });
    const s = Q.heroSVG({ hero: Q.heroOf({}), girth: 4, sh: 2, arm: 2, mood: "happy", eq: { [slot]: it } });
    assert.ok(!/NaN|undefined/.test(s), slot + " " + Q.SHAPES[slot][sh]);
  }
  for (let w = 0; w < 30; w++) { const b = Q.bossFor(E.addDays("2026-01-05", w * 7), 3, 3); assert.ok(!/NaN|undefined/.test(Q.bossSVG(b))); }
});

test("hidden feats unlock and pay once", () => {
  const S = blank();
  S.train.log.push(lift("a", "2026-09-29", 25));
  const sum = Q.summary(S, E, TD);
  assert.ok(sum.ach[0]);
  const feats = sum.events.filter(e => e.kind === "feat");
  assert.strictEqual(new Set(feats.map(e => e.id)).size, feats.length);
  assert.strictEqual(Q.ACH_COUNT, 16);
});

test("quest items, hero and fights sync as records", () => {
  const S = blank();
  S.game.items.push({ id: "t:a", v: 2, slot: "aura", shape: 3, r: 2, at: 5 });
  S.game.eq = { aura: "t:a" }; S.game.fights = { "2026-09-21": { won: true, on: "2026-09-25", lv: 2 } };
  const back = Y.unflatten(Y.flatten(S), S);
  assert.deepStrictEqual(back.game.items, S.game.items);
  assert.deepStrictEqual(back.game.hero, S.game.hero);
  assert.deepStrictEqual(back.game.fights, S.game.fights);
  const L = blank(), R = blank(), now = Date.now();
  L.game.items.push({ id: "t:x", slot: "head", r: 0, at: 1 }); L.meta.u["g|t:x"] = now;
  R.game.items.push({ id: "t:y", slot: "robe", r: 1, at: 2 }); R.meta.u["g|t:y"] = now;
  assert.deepStrictEqual(Y.merge(L, R).game.items.map(i => i.id).sort(), ["t:x", "t:y"]);
});

console.log(`\n${pass} passed`);
